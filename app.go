package main

import (
	"context"
	"fmt"
	"log/slog"
	"mac-dictation/internal/audio"
	"mac-dictation/internal/database"
	"mac-dictation/internal/prompts"
	"mac-dictation/internal/storage"
	"mac-dictation/internal/transcription"
	"os"
	"time"

	"github.com/joho/godotenv"
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

	activeThreadID *int
}

func NewApp(db *database.DB) *App {
	_ = godotenv.Load()

	deepgramApiKey := os.Getenv("DEEPGRAM_API_KEY")
	if deepgramApiKey == "" {
		slog.Warn("DEEPGRAM_API_KEY not set")
	}
	openAiApiKey := os.Getenv("OPENAI_API_KEY")
	if openAiApiKey == "" {
		slog.Warn("OPENAI_API_KEY not set")
	}
	return &App{
		recorder:    audio.NewRecorder(),
		transcriber: transcription.NewDeepgramService(deepgramApiKey),
		openAi:      transcription.NewOpenAiService(openAiApiKey),

		messages: storage.NewMessageService(db),
		threads:  storage.NewThreadService(db),
	}
}

func (a *App) SetApplication(app *application.App) {
	a.app = app
}

func (a *App) SetWindow(window *application.WebviewWindow) {
	a.window = window
}

func (a *App) SetSystemTray(tray *application.SystemTray) {
	a.systemTray = tray
}

func (a *App) SetMenuItems(start, stop, cancel *application.MenuItem) {
	a.menuStartRecording = start
	a.menuStopRecording = stop
	a.menuCancelRecording = cancel
	a.updateMenuState()
}

func (a *App) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	return a.recorder.Init()
}

func (a *App) ServiceShutdown() error {
	return a.recorder.Shutdown()
}

func (a *App) HideWindow() {
	if a.window != nil {
		a.window.Hide()
	}
}

func (a *App) ShowWindow() {
	if a.window != nil {
		a.window.Show()
		a.window.Focus()
	}
}

func (a *App) OnTrayClick() {
	if a.IsRecording() {
		a.StopRecording()
	} else {
		if a.window != nil && a.window.IsVisible() {
			a.window.Hide()
		} else {
			a.ShowWindow()
		}
	}
}
func (a *App) IsRecording() bool {
	return a.recorder.GetStatus().IsRecording
}

// StartRecording starts recording using the preconfigured recorder.
//
// Emits "recording:started" once the recording thread starts.
//
// Emits "recording:progress" periodically.
func (a *App) StartRecording() {
	if err := a.recorder.StartRecording(); err != nil {
		a.emitError(err)
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

	a.app.Event.Emit(EventRecordingStopped)

	if err != nil {
		slog.Error("failed to stop recording", "error", err)
		a.emitError(err)
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	if len(audioData) > MaxTranscriptionBytes {
		a.emitError(fmt.Errorf("recording too long for transcription (max %d minutes)", MaxTranscriptionBytes/audio.BytesPerSecond/60))
		a.updateTrayState(TrayIconDefault, "")
		return
	}

	a.app.Event.Emit(EventTranscriptionStart)
	a.updateTrayState(TrayIconTranscribing, "...")

	go func() {
		start := time.Now()
		text, err := a.transcriber.Transcribe(audioData)
		if err != nil {
			a.emitError(err)
			a.updateTrayState(TrayIconDefault, "")
			return
		}
		slog.Info("transcription completed", "duration", time.Since(start))

		cleanedText, err := a.openAi.Prompt(prompts.CleanUpPrompt, text)
		if err != nil {
			slog.Error("failed to clean up transcription", "error", err)
		}
		slog.Info("cleaned transcription", "text", cleanedText)

		var thread *storage.Thread
		isNewThread := false

		if a.activeThreadID == nil {
			titleText := cleanedText
			if cleanedText == "" {
				titleText = text
			}
			title, err := a.openAi.Prompt(prompts.TitleGenerationPrompt, titleText)
			if err != nil {
				slog.Error("failed to generate title", "error", err)
			}
			slog.Info("generated title", "title", title)
			if title == "" {
				title = "Untitled"
			}

			thread = &storage.Thread{Name: title}
			if err := a.threads.Persist(thread); err != nil {
				slog.Error("failed to create thread", "error", err)
				a.emitError(err)
				a.updateTrayState(TrayIconDefault, "")
				return
			}
			a.activeThreadID = thread.ID
			isNewThread = true
		} else {
			thread, err = a.threads.Lookup(*a.activeThreadID)
			if err != nil {
				slog.Error("failed to lookup thread", "error", err)
				a.emitError(err)
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
			slog.Error("failed to persist message", "error", err)
			a.emitError(err)
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
	recording := a.IsRecording()
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

func (a *App) emitError(err error) {
	a.app.Event.Emit(EventError, err.Error())
}
