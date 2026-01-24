package transcription

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Provider interface {
	Transcribe(audioData []byte) (string, error)
}

var _ Provider = &DeepgramService{}

type DeepgramService struct {
	apiKey string
}

func NewDeepgramService(apiKey string) *DeepgramService {
	return &DeepgramService{apiKey}
}

// Transcribe sends audio to Deepgram API and returns transcription string
func (s *DeepgramService) Transcribe(audioData []byte) (string, error) {
	if s.apiKey == "" {
		return "", fmt.Errorf("missing deepgram API Key")
	}

	url := "https://api.deepgram.com/v1/listen?model=nova-3&language=en-GB&smart_format=true&encoding=linear16&sample_rate=16000&channels=1"

	req, err := http.NewRequest("POST", url, bytes.NewReader(audioData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Token "+s.apiKey)
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
