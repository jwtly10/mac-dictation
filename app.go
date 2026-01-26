package main

import (
	"fmt"
	"log/slog"
	"mac-dictation/internal/audio"
	"mac-dictation/internal/database"
	"mac-dictation/internal/prompts"
	"mac-dictation/internal/storage"
	"mac-dictation/internal/transcription"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	EventRecordingStarted   = "recording:started"
	EventRecordingProgress  = "recording:progress"
	EventRecordingStopped   = "recording:stopped"
	EventTranscriptionStart = "transcription:started"
	EventTranscriptionDone  = "transcription:completed"
	EventError              = "error"

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
//
// Emits "recording:started" once the recording thread starts.
//
// Emits "recording:progress" periodically.
func (a *App) StartRecording() {
	if err := a.recorder.StartRecording(); err != nil {
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
}

// StopRecording stops recording, triggers transcriptions, and then persists the message.
// Will use the current activeThreadID to manage creating/appended to thread
//
// Emits "recording:stopped" before starting transcription.
//
// Emits "transcription:started" before transcription starts.
//
// Emits "transcription:completed" with the transcription completed event data.
func (a *App) StopRecording() {
	durationSecs := a.recorder.GetStatus().DurationSecs
	audioData, err := a.recorder.StopRecording()
	if err != nil {
		a.emitError("Error stopping recording", err)
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	a.app.Event.Emit(EventRecordingStopped)

	err = a.preTranscribeCheck(durationSecs, audioData)
	if err != nil {
		a.emitError("Invalid audio", err)
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	a.app.Event.Emit(EventTranscriptionStart)
	a.updateTrayState(TrayIconTranscribing, "...")

	a.transcribeInBackground(audioData, durationSecs)
}

func (a *App) preTranscribeCheck(duration float64, audioData []byte) error {
	m, err := a.settings.Get(SettingMinRecordingDuration)
	if err != nil {
		m = "5"
	}
	minDuration, err := strconv.ParseFloat(m, 64)
	if err != nil {
		minDuration = 5
	}

	if duration < minDuration {
		return fmt.Errorf("recording too short (min %g seconds)", minDuration)
	}
	if len(audioData) > MaxTranscriptionBytes {
		return fmt.Errorf("recording too long for transcription (max %d minutes)", MaxTranscriptionBytes/audio.BytesPerSecond/60)
	}
	return nil
}

func (a *App) transcribeInBackground(audioData []byte, durationSecs float64) {
	go func() {
		start := time.Now()
		text, err := a.transcriber.Transcribe(audioData)
		if err != nil {
			a.emitError("Error transcribing", err)
			a.updateTrayState(TrayIconDefault, "")
			return
		}
		slog.Info("transcription completed", "duration", time.Since(start))

		cleanedText, err := a.openAi.Prompt(prompts.CleanUpPrompt, text)
		if err != nil {
			a.emitError("Error cleaning up transcription", err)
		}
		slog.Info("cleaned transcription", "text", cleanedText)

		var thread *storage.Thread
		isNewThread := false

		if a.activeThreadID == nil {
			if cleanedText == "" {
				cleanedText = text
			}
			thread, err = a.createThread(text)
			if err != nil {
				a.emitError("Error creating thread", err)
				a.updateTrayState(TrayIconDefault, "")
				return
			}
			isNewThread = true
		} else {
			thread, err = a.threads.Lookup(*a.activeThreadID)
			if err != nil {
				a.emitError("Failed to lookup thread", err)
				a.updateTrayState(TrayIconDefault, "")
				return
			}
		}

		message := &storage.Message{
			ThreadID:     *a.activeThreadID,
			OriginalText: text,
			Text:         cleanedText,
			Provider:     "deepgram",
			DurationSecs: durationSecs,
		}
		if err := a.messages.Persist(message); err != nil {
			a.emitError("Failed to persist message", err)
			a.updateTrayState(TrayIconDefault, "")
			return
		}

		if !isNewThread {
			if err := a.threads.TouchUpdatedAt(*a.activeThreadID); err != nil {
				slog.Error("failed to touch thread updated_at", "error", err)
			}
		}

		a.app.Event.Emit(EventTranscriptionDone, TranscriptionCompletedEvent{
			Message:     *message,
			Thread:      thread,
			IsNewThread: isNewThread,
		})
		a.updateTrayState(TrayIconDefault, "")
	}()
}

func (a *App) createThread(text string) (*storage.Thread, error) {
	title, err := a.openAi.Prompt(prompts.TitleGenerationPrompt, text)
	if err != nil {
		a.emitError("Failed to generate title", err)
	}
	slog.Info("generated title", "title", title)
	if title == "" {
		title = "Untitled"
	}
	thread := &storage.Thread{Name: title}
	if err := a.threads.Persist(thread); err != nil {
		slog.Error("failed to persist thread", "error", err)
		return nil, err
	}
	a.activeThreadID = thread.ID
	return thread, nil
}

// CancelRecording cancels recording in progress and emits EventRecordingStopped.
func (a *App) CancelRecording() {
	_ = a.recorder.CancelRecording()
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
