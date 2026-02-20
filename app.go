package main

import (
	"fmt"
	"log/slog"
	"mac-dictation/internal/audio"
	"mac-dictation/internal/database"
	"mac-dictation/internal/prompts"
	"mac-dictation/internal/storage"
	"mac-dictation/internal/transcription"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	EventRecordingStarted        = "recording:started"
	EventRecordingProgress       = "recording:progress"
	EventRecordingStopped        = "recording:stopped"
	EventTranscriptionProcessing = "transcription:processing"
	EventTranscriptionInterim    = "transcription:interim"
	EventTranscriptionDone       = "transcription:completed"
	EventTitleGenerated          = "thread:title-generated"
	EventTextImproved            = "message:text-improved"
	EventError                   = "error"

	// Used for enabled/disabled tray icon labels
	LabelEnabled = false
)

const (
	// MaxTranscriptionBytes limits recordings automatically transcribed to 7 minutes
	//
	// TODO: We should consolidate all the sampling behaviour as we have this across deepgram/audio impls
	MaxTranscriptionBytes = 7 * 60 * audio.BytesPerSecond
)

const (
	// TrayClickStopsRecording controls whether clicking the tray icon while
	// recording will stop the recording. When false, clicking the tray icon
	// during recording will only show/hide the window (same as when not recording).
	TrayClickStopsRecording = false
)

const (
	SettingDeepgramAPIKey       = "deepgram_api_key"
	SettingOpenAIAPIKey         = "openai_api_key"
	SettingMinRecordingDuration = "min_recording_duration"
)

type App struct {
	app                 *application.App
	window              *application.WebviewWindow
	systemTray          *application.SystemTray
	menuStartRecording  *application.MenuItem
	menuStopRecording   *application.MenuItem
	menuCancelRecording *application.MenuItem

	recorder    *audio.Recorder
	transcriber transcription.Provider
	openAi      *transcription.OpenAiService

	messages *storage.MessageService
	threads  *storage.ThreadService
	settings *storage.SettingsService

	activeThreadID *int
}

func NewApp(db *database.DB) *App {
	settingsService := storage.NewSettingsService(db)

	deepgramApiKey, _ := settingsService.Get(SettingDeepgramAPIKey)
	openAiApiKey, _ := settingsService.Get(SettingOpenAIAPIKey)

	return &App{
		recorder:    audio.NewRecorder(),
		transcriber: transcription.NewDeepgramService(deepgramApiKey),
		openAi:      transcription.NewOpenAiService(openAiApiKey),

		messages: storage.NewMessageService(db),
		threads:  storage.NewThreadService(db),
		settings: settingsService,
	}
}

// StartRecording starts recording using the preconfigured recorder.
func (a *App) StartRecording() {
	a.transcriber.OnResult(func(text string, isFinal bool) {
		a.app.Event.Emit(EventTranscriptionInterim, map[string]any{
			"text":    text,
			"isFinal": isFinal,
		})
	})

	if err := a.transcriber.StartStream(); err != nil {
		a.emitError("Error starting transcriber", err)
		return
	}

	a.recorder.SetOnChunk(func(chunk []byte) {
		if err := a.transcriber.SendChunk(chunk); err != nil {
			slog.Error("Error sending chunk to transcriber", "error", err)
		}
	})

	if err := a.recorder.StartRecording(); err != nil {
		_, _ = a.transcriber.EndStream()
		a.emitError("Error starting recording", err)
		return
	}

	a.app.Event.Emit(EventRecordingStarted)
	a.updateTrayState(TrayIconRecording, "REC")

	go a.progressLoop()
}

type TranscriptionCompletedEvent struct {
	Message     storage.Message `json:"message"`
	Thread      *storage.Thread `json:"thread"`
	IsNewThread bool            `json:"isNewThread"`
	Empty       bool            `json:"empty"`
}

// StopRecording stops recording, cleans up provider WS and
// Will use the current activeThreadID to manage creating/appended to thread
func (a *App) StopRecording() {
	durationSecs := a.recorder.GetStatus().DurationSecs
	// TODO: use audio data for fallback transcription/backup
	_, err := a.recorder.StopRecording()
	if err != nil {
		a.emitError("Error stopping recording", err)
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	a.app.Event.Emit(EventRecordingStopped)

	text, err := a.transcriber.EndStream()
	if err != nil {
		a.emitError("Error ending transcriber", err)

		// We no longer return the error here
		//
		// The following code checks if transcription data exists, if we data we
		// should continue persisting recording rather than killing the process
	}

	// TODO: Not sure exactly how i want to handle this yet
	// but we just 'reset' state if no text captured at all
	if text == "" {
		a.updateTrayState(TrayIconDefault, "")
		a.app.Event.Emit(EventTranscriptionDone, TranscriptionCompletedEvent{
			Message:     storage.Message{},
			Thread:      nil,
			IsNewThread: false,
			Empty:       true,
		})
		return
	}

	a.app.Event.Emit(EventTranscriptionProcessing)
	a.updateTrayState(TrayIconTranscribing, "...")
	result, err := a.persistTranscription(text, durationSecs)
	if err != nil {
		a.emitError("Error persisting transcription", err)
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	a.app.Event.Emit(EventTranscriptionDone, result)
	a.updateTrayState(TrayIconDefault, "")
}

func (a *App) persistTranscription(text string, durationSecs float64) (*TranscriptionCompletedEvent, error) {
	var thread *storage.Thread
	var err error
	isNewThread := false

	if a.activeThreadID == nil {
		thread, err = a.createThreadAsync(text)
		if err != nil {
			return nil, fmt.Errorf("error creating thread: %w", err)
		}
		isNewThread = true
	} else {
		thread, err = a.threads.Lookup(*a.activeThreadID)
		if err != nil {
			return nil, fmt.Errorf("failed to lookup thread: %w", err)
		}
	}

	message := &storage.Message{
		ThreadID:     *a.activeThreadID,
		OriginalText: text,
		Text:         "",
		Provider:     "deepgram",
		DurationSecs: durationSecs,
	}
	if err := a.messages.Persist(message); err != nil {
		return nil, fmt.Errorf("failed to persist message: %w", err)
	}

	if !isNewThread {
		if err := a.threads.TouchUpdatedAt(*a.activeThreadID); err != nil {
			slog.Error("failed to touch thread updated_at", "error", err)
		}
	}

	return &TranscriptionCompletedEvent{
		Message:     *message,
		Thread:      thread,
		IsNewThread: isNewThread,
	}, nil
}

// createThreadAsync creates a thread with "Untitled" name and generates title in background
func (a *App) createThreadAsync(text string) (*storage.Thread, error) {
	thread := &storage.Thread{Name: "Untitled Chat"}
	if err := a.threads.Persist(thread); err != nil {
		slog.Error("failed to persist thread", "error", err)
		return nil, err
	}
	a.activeThreadID = thread.ID

	go a.generateTitleAsync(*thread.ID, text)

	return thread, nil
}

type TitleGeneratedEvent struct {
	ThreadID int    `json:"threadId"`
	Title    string `json:"title"`
}

func (a *App) generateTitleAsync(threadID int, text string) {
	title, err := a.openAi.Prompt(prompts.TitleGenerationPrompt, text)
	if err != nil {
		slog.Error("failed to generate title", "error", err)
		return
	}
	slog.Info("generated title", "title", title, "threadID", threadID)
	if title == "" {
		return
	}

	thread, err := a.threads.Lookup(threadID)
	if err != nil {
		slog.Error("failed to lookup thread for title update", "error", err)
		return
	}
	thread.Name = title
	if err := a.threads.Persist(thread); err != nil {
		slog.Error("failed to persist thread title", "error", err)
		return
	}

	a.app.Event.Emit(EventTitleGenerated, TitleGeneratedEvent{
		ThreadID: threadID,
		Title:    title,
	})
}

// ToggleRecording starts or stops recording based on current state.
func (a *App) ToggleRecording() {
	if a.isRecording() {
		a.StopRecording()
	} else {
		a.StartRecording()
	}
}

// CancelRecording cancels recording in progress and emits EventRecordingStopped.
func (a *App) CancelRecording() {
	_ = a.recorder.CancelRecording()
	_, _ = a.transcriber.EndStream()
	a.app.Event.Emit(EventRecordingStopped)
	a.updateTrayState(TrayIconDefault, "")
}

func (a *App) GetMessages(threadID int) ([]storage.Message, error) {
	_, err := a.threads.Lookup(threadID)
	if err != nil {
		return nil, err
	}
	return a.messages.LookupForThread(threadID)
}

func (a *App) DeleteMessage(id int) error {
	return a.messages.Delete(id)
}

type TextImprovedEvent struct {
	MessageID    int    `json:"messageId"`
	ImprovedText string `json:"improvedText"`
}

// ImproveMessageText improves the original text of a message using OpenAI
//
// Will only process improvements once, otherwise will return existing
func (a *App) ImproveMessageText(messageID int) error {
	message, err := a.messages.Lookup(messageID)
	if err != nil {
		return fmt.Errorf("message not found: %w", err)
	}

	if message.Text != "" {
		return nil
	}

	go func() {
		improvedText, err := a.openAi.Prompt(prompts.CleanUpPrompt, message.OriginalText)
		if err != nil {
			slog.Error("failed to improve text", "error", err, "messageID", messageID)
			a.app.Event.Emit(EventError, "Failed to improve text: "+err.Error())
			return
		}

		if improvedText == "" {
			improvedText = message.OriginalText
		}

		message.Text = improvedText
		if err := a.messages.Persist(message); err != nil {
			slog.Error("failed to persist improved text", "error", err, "messageID", messageID)
			return
		}

		a.app.Event.Emit(EventTextImproved, TextImprovedEvent{
			MessageID:    messageID,
			ImprovedText: improvedText,
		})
	}()

	return nil
}

func (a *App) GetThreads() ([]storage.Thread, error) {
	return a.threads.LookupAll()
}

func (a *App) DeleteThread(id int) error {
	return a.threads.Delete(id)
}

func (a *App) RenameThread(id int, name string) error {
	thread, err := a.threads.Lookup(id)
	if err != nil {
		return err
	}
	thread.Name = name
	return a.threads.Persist(thread)
}

// SelectThread sets the active thread. Setting 0 will clear the current thread
func (a *App) SelectThread(id int) {
	slog.Info("selecting thread", "id", id)
	if id == 0 {
		a.activeThreadID = nil
	} else {
		a.activeThreadID = &id
	}
}

func (a *App) SetThreadPinned(id int, pinned bool) error {
	return a.threads.SetPinned(id, pinned)
}

func (a *App) GetSetting(key string) (string, error) {
	return a.settings.Get(key)
}

func (a *App) SetSetting(key, value string) error {
	if err := a.settings.Set(key, value); err != nil {
		return err
	}

	switch key {
	case SettingDeepgramAPIKey:
		a.transcriber = transcription.NewDeepgramService(value)
	case SettingOpenAIAPIKey:
		a.openAi = transcription.NewOpenAiService(value)
	}

	return nil
}

func (a *App) GetAllSettings() (map[string]string, error) {
	return a.settings.GetAll()
}

func (a *App) AreAPIKeysConfigured() bool {
	deepgramKey, _ := a.settings.Get(SettingDeepgramAPIKey)
	openaiKey, _ := a.settings.Get(SettingOpenAIAPIKey)
	return deepgramKey != "" && openaiKey != ""
}

func (a *App) ShowSettings() {
	a.ShowWindow()
	a.app.Event.Emit("settings:show")
}

func (a *App) updateTrayState(icon TrayIcon, label string) {
	if a.systemTray != nil {
		a.systemTray.SetTemplateIcon(GetTrayIcon(icon))
		if LabelEnabled {
			a.systemTray.SetLabel(label)
		}
	}
	a.updateMenuState()
}

func (a *App) updateMenuState() {
	recording := a.isRecording()
	if a.menuStartRecording != nil {
		a.menuStartRecording.SetEnabled(!recording)
	}
	if a.menuStopRecording != nil {
		a.menuStopRecording.SetEnabled(recording)
	}
	if a.menuCancelRecording != nil {
		a.menuCancelRecording.SetEnabled(recording)
	}
}

func (a *App) isRecording() bool {
	return a.recorder.GetStatus().IsRecording
}

func (a *App) progressLoop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		status := a.recorder.GetStatus()
		if !status.IsRecording {
			return
		}
		a.app.Event.Emit(EventRecordingProgress, status.DurationSecs)
	}
}

func (a *App) emitError(message string, err error) {
	if message != "" {
		message = message + ": " + err.Error()
	} else {
		message = err.Error()
	}
	slog.Error(message, "error", err)
	a.app.Event.Emit(EventError, message)
}
