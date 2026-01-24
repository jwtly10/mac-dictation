package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gen2brain/malgo"
	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type App struct {
	mu             sync.Mutex
	isRecording    bool
	audioBuffer    []byte
	recordingStart time.Time
	malgoCtx       *malgo.AllocatedContext
	device         *malgo.Device

	deepgramAPIKey string
}

type TranscriptionResult struct {
	Text     string `json:"text"`
	Provider string `json:"provider"`
}

type RecordingStatus struct {
	IsRecording  bool    `json:"is_recording"`
	DurationSecs float64 `json:"duration_secs"`
}

func NewApp() *App {
	_ = godotenv.Load()

	apiKey := os.Getenv("DEEPGRAM_API_KEY")
	if apiKey == "" {
		fmt.Println("Warning: DEEPGRAM_API_KEY not set")
	}

	return &App{
		deepgramAPIKey: apiKey,
		audioBuffer:    make([]byte, 0),
	}
}

// ServiceStartup is called when the service starts (Wails v3 lifecycle)
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	malgoCtx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		fmt.Printf("Failed to initialize audio context: %v\n", err)
		return err
	}
	a.malgoCtx = malgoCtx
	return nil
}

func (a *App) ServiceShutdown() error {
	if a.malgoCtx != nil {
		_ = a.malgoCtx.Uninit()
		a.malgoCtx.Free()
	}
	return nil
}

// StartRecording begins audio capture
func (a *App) StartRecording() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.isRecording {
		return fmt.Errorf("already recording")
	}

	if a.malgoCtx == nil {
		return fmt.Errorf("audio context not initialized")
	}

	a.audioBuffer = make([]byte, 0)
	a.recordingStart = time.Now()

	// Config is 16kHz mono PCM16
	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatS16
	deviceConfig.Capture.Channels = 1
	deviceConfig.SampleRate = 16000
	deviceConfig.Alsa.NoMMap = 1

	onRecvFrames := func(pOutputSample, pInputSamples []byte, framecount uint32) {
		a.mu.Lock()
		a.audioBuffer = append(a.audioBuffer, pInputSamples...)
		a.mu.Unlock()
	}

	callbacks := malgo.DeviceCallbacks{
		Data: onRecvFrames,
	}

	device, err := malgo.InitDevice(a.malgoCtx.Context, deviceConfig, callbacks)
	if err != nil {
		return fmt.Errorf("failed to initialize capture device: %w", err)
	}

	err = device.Start()
	if err != nil {
		device.Uninit()
		return fmt.Errorf("failed to start capture device: %w", err)
	}

	a.device = device
	a.isRecording = true

	return nil
}

// StopRecording stops audio capture and sends to Deepgram for transcription
func (a *App) StopRecording() (*TranscriptionResult, error) {
	a.mu.Lock()

	if !a.isRecording {
		a.mu.Unlock()
		return nil, fmt.Errorf("not recording")
	}

	if a.device != nil {
		err := a.device.Stop()
		if err != nil {
			fmt.Printf("Failed to stop capture device on stop: %v\n", err)
		}
		a.device.Uninit()
		a.device = nil
	}

	a.isRecording = false
	audioData := a.audioBuffer
	a.audioBuffer = nil
	a.mu.Unlock()

	if len(audioData) == 0 {
		return nil, fmt.Errorf("no audio recorded")
	}

	transcript, err := a.transcribeWithDeepgram(audioData)
	if err != nil {
		return nil, fmt.Errorf("transcription failed: %w", err)
	}

	return &TranscriptionResult{
		Text:     transcript,
		Provider: "deepgram",
	}, nil
}

// CancelRecording stops recording without transcribing
func (a *App) CancelRecording() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.isRecording {
		return nil
	}

	if a.device != nil {
		err := a.device.Stop()
		if err != nil {
			fmt.Printf("Failed to stop capture device on cancel: %v\n", err)
		}
		a.device.Uninit()
		a.device = nil
	}

	a.isRecording = false
	a.audioBuffer = nil

	return nil
}

// GetRecordingStatus returns current recording state
func (a *App) GetRecordingStatus() RecordingStatus {
	a.mu.Lock()
	defer a.mu.Unlock()

	var duration float64
	if a.isRecording {
		duration = time.Since(a.recordingStart).Seconds()
	}

	return RecordingStatus{
		IsRecording:  a.isRecording,
		DurationSecs: duration,
	}
}

// transcribeWithDeepgram sends audio to Deepgram API
func (a *App) transcribeWithDeepgram(audioData []byte) (string, error) {
	if a.deepgramAPIKey == "" {
		return "", fmt.Errorf("DEEPGRAM_API_KEY not configured")
	}

	url := "https://api.deepgram.com/v1/listen?model=nova-3&language=en-GB&smart_format=true&encoding=linear16&sample_rate=16000&channels=1"

	req, err := http.NewRequest("POST", url, bytes.NewReader(audioData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Token "+a.deepgramAPIKey)
	req.Header.Set("Content-Type", "audio/l16;rate=16000;channels=1")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result DeepgramResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Results.Channels) > 0 &&
		len(result.Results.Channels[0].Alternatives) > 0 {
		return result.Results.Channels[0].Alternatives[0].Transcript, nil
	}

	return "", nil
}

// DeepgramResponse represents the API response structure
type DeepgramResponse struct {
	Results struct {
		Channels []struct {
			Alternatives []struct {
				Transcript string `json:"transcript"`
			} `json:"alternatives"`
		} `json:"channels"`
	} `json:"results"`
}
