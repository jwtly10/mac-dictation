package main

import (
	"context"
	"fmt"
	"mac-dictation/internal/audio"
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
}

func NewApp() *App {
	_ = godotenv.Load()

	deepgramApiKey := os.Getenv("DEEPGRAM_API_KEY")
	if deepgramApiKey == "" {
		fmt.Println("Warning: DEEPGRAM_API_KEY not set")
	}
	return &App{
		recorder:    audio.NewRecorder(),
		transcriber: transcription.NewDeepgramService(deepgramApiKey),
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
		a.ShowWindow()
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

type TranscriptionResult struct {
	Text     string `json:"text"`
	Provider string `json:"provider"`
}

// StopRecording stops recording and triggers transcription asynchronously.
//
// Emits "recording:stopped" before starting transcription.
//
// Emits "transcription:started" before transcription starts.
//
// Emits "transcription:completed" with the transcription result.
func (a *App) StopRecording() {
	audioData, err := a.recorder.StopRecording()

	a.app.Event.Emit(EventRecordingStopped)

	if err != nil {
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
		text, err := a.transcriber.Transcribe(audioData)
		if err != nil {
			a.emitError(err)
			a.updateTrayState(TrayIconDefault, "")
			return
		}
		a.app.Event.Emit(EventTranscriptionDone, TranscriptionResult{
			Text:     text,
			Provider: "deepgram",
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

func (a *App) updateTrayState(icon TrayIcon, label string) {
	if a.systemTray != nil {
		a.systemTray.SetTemplateIcon(GetTrayIcon(icon))
		a.systemTray.SetLabel(label)
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
