package audio

import (
	"fmt"
	"sync"
	"time"

	"github.com/gen2brain/malgo"
)

type Recorder struct {
	mu             sync.Mutex
	isRecording    bool
	audioBuffer    []byte
	recordingStart time.Time
	malgoCtx       *malgo.AllocatedContext
	device         *malgo.Device
}

func NewRecorder() *Recorder {
	return &Recorder{}
}

func (r *Recorder) Init() error {
	malgoCtx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return fmt.Errorf("failed to initialize audio context: %w", err)
	}
	r.malgoCtx = malgoCtx
	return nil
}

func (r *Recorder) StartRecording() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.isRecording {
		return fmt.Errorf("already recording")
	}

	if r.malgoCtx == nil {
		return fmt.Errorf("audio context not initialized")
	}

	r.audioBuffer = make([]byte, 0)
	r.recordingStart = time.Now()

	// Config is 16kHz mono PCM16
	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatS16
	deviceConfig.Capture.Channels = 1
	deviceConfig.SampleRate = 16000
	deviceConfig.Alsa.NoMMap = 1

	onRecvFrames := func(pOutputSample, pInputSamples []byte, framecount uint32) {
		r.mu.Lock()
		r.audioBuffer = append(r.audioBuffer, pInputSamples...)
		r.mu.Unlock()
	}

	callbacks := malgo.DeviceCallbacks{
		Data: onRecvFrames,
	}

	device, err := malgo.InitDevice(r.malgoCtx.Context, deviceConfig, callbacks)
	if err != nil {
		return fmt.Errorf("failed to initialize capture device: %w", err)
	}

	err = device.Start()
	if err != nil {
		device.Uninit()
		return fmt.Errorf("failed to start capture device: %w", err)
	}

	r.device = device
	r.isRecording = true

	return nil
}

func (r *Recorder) StopRecording() ([]byte, error) {
	r.mu.Lock()

	if !r.isRecording {
		r.mu.Unlock()
		return nil, fmt.Errorf("not recording")
	}

	if r.device != nil {
		err := r.device.Stop()
		if err != nil {
			fmt.Printf("Failed to stop capture device on stop: %v\n", err)
			return nil, fmt.Errorf("failed to stop capture device on stop: %w", err)
		}
		r.device.Uninit()
		r.device = nil
	}

	r.isRecording = false
	audioData := r.audioBuffer
	r.audioBuffer = nil
	r.mu.Unlock()

	if len(audioData) == 0 {
		return nil, fmt.Errorf("no audio recorded")
	}

	return audioData, nil
}

func (r *Recorder) CancelRecording() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.isRecording {
		return nil
	}

	if r.device != nil {
		err := r.device.Stop()
		if err != nil {
			fmt.Printf("Failed to stop capture device on cancel: %v\n", err)
			return fmt.Errorf("failed to stop capture device on cancel: %w", err)
		}
		r.device.Uninit()
		r.device = nil
	}

	r.isRecording = false
	r.audioBuffer = nil

	return nil
}

type RecordingStatus struct {
	IsRecording  bool    `json:"is_recording"`
	DurationSecs float64 `json:"duration_secs"`
}

func (r *Recorder) GetStatus() RecordingStatus {
	r.mu.Lock()
	defer r.mu.Unlock()

	var duration float64
	if r.isRecording {
		duration = time.Since(r.recordingStart).Seconds()
	}

	return RecordingStatus{
		IsRecording:  r.isRecording,
		DurationSecs: duration,
	}
}

func (r *Recorder) Shutdown() error {
	if r.malgoCtx != nil {
		err := r.malgoCtx.Uninit()
		if err != nil {
			fmt.Printf("Failed to uninitialize audio context: %v\n", err)
		}
		r.malgoCtx.Free()
	}
	return nil
}
