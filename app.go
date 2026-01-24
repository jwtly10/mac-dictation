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

type App struct {
	app         *application.App
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
		return
	}

	a.app.Event.Emit(EventTranscriptionStart)

	go func() {
		text, err := a.transcriber.Transcribe(audioData)
		if err != nil {
			a.emitError(err)
			return
		}
		a.app.Event.Emit(EventTranscriptionDone, TranscriptionResult{
			Text:     text,
			Provider: "deepgram",
		})
	}()
}

// CancelRecording cancels recording in progress and emits EventRecordingStopped.
func (a *App) CancelRecording() {
	_ = a.recorder.CancelRecording()
	a.app.Event.Emit(EventRecordingStopped)
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

// ServiceStartup is called when the service starts (Wails v3 lifecycle).
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Get app reference from options
	return a.recorder.Init()
}

// ServiceShutdown is called when the service stops (Wails v3 lifecycle).
func (a *App) ServiceShutdown() error {
	return a.recorder.Shutdown()
}

func (a *App) emitError(err error) {
	a.app.Event.Emit(EventError, err.Error())
}
