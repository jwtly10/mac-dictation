package transcription

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Provider interface {
	StartStream() error
	SendChunk(data []byte) error
	OnResult(callback func(message string, isFinal bool))
	EndStream() (string, error)

	// Transcribe sends audio to Deepgram API and returns transcription string synchronously
	Transcribe(audioData []byte) (string, error)
}

type DeepgramService struct {
	apiKey string

	conn     *websocket.Conn
	done     chan struct{}
	err      chan error
	onResult func(transcript string, isFinal bool)

	mu         sync.Mutex
	transcript strings.Builder
}

var _ Provider = &DeepgramService{}

type MessageType string

const (
	CloseStream  MessageType = "CloseStream"
	Results      MessageType = "Results"
	UtteranceEnd MessageType = "UtteranceEnd"
)

type Message struct {
	Type string `json:"type"`
}

type DeepgramStreamingResponse struct {
	Type    string `json:"type"`
	IsFinal bool   `json:"is_final"`
	Channel struct {
		Alternatives []struct {
			Transcript string `json:"transcript"`
		} `json:"alternatives"`
	} `json:"channel"`
}

func (s *DeepgramService) StartStream() error {
	url := "wss://api.deepgram.com/v1/listen?punctuate=true&language=en-GB&model=nova-3&encoding=linear16&sample_rate=16000&utterance_end_ms=5000&interim_results=true"
	headers := http.Header{}
	headers.Set("Authorization", "Token "+s.apiKey)

	s.done = make(chan struct{})
	s.err = make(chan error, 1)

	c, _, err := websocket.DefaultDialer.Dial(url, headers)
	if err != nil {
		return fmt.Errorf("failed to connect to Deepgram API: %w", err)
	}

	s.conn = c

	go func() {
		defer close(s.done)
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					return
				}
				slog.Error("Failed to read message:", err)
				s.err <- fmt.Errorf("failed to read message: %w", err)
				return
			}

			slog.Debug("Received raw message", "message", string(message))

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				slog.Error("Failed to unmarshal message:", err)
				s.err <- fmt.Errorf("failed to unmarshal message: %w", err)
				return
			}

			switch msg.Type {
			case string(Results):
				var result DeepgramStreamingResponse
				if err := json.Unmarshal(message, &result); err != nil {
					slog.Error("Failed to unmarshal message:", err)
					s.err <- fmt.Errorf("failed to unmarshal result message: %w", err)
					return
				}

				if len(result.Channel.Alternatives) == 0 {
					continue
				}
				transcript := result.Channel.Alternatives[0].Transcript
				if s.onResult != nil && transcript != "" {
					s.onResult(transcript, result.IsFinal)
				}

				if result.IsFinal && transcript != "" {
					s.mu.Lock()
					if s.transcript.Len() > 0 {
						s.transcript.WriteString(" ")
					}
					s.transcript.WriteString(transcript)
					s.mu.Unlock()
				}
			case string(UtteranceEnd):
				s.mu.Lock()
				s.transcript.WriteString("\n")
				s.mu.Unlock()
				// TODO: Should we close?
			}
		}
	}()

	return nil
}
func (s *DeepgramService) SendChunk(data []byte) error {
	if s.conn == nil {
		return fmt.Errorf("connection not started")
	}
	return s.conn.WriteMessage(websocket.BinaryMessage, data)
}

func (s *DeepgramService) OnResult(callback func(message string, isFinal bool)) {
	s.onResult = callback
}

func (s *DeepgramService) EndStream() (string, error) {
	if s.conn == nil {
		return "", fmt.Errorf("connection not started")
	}
	err := s.sendMessage(CloseStream)
	if err != nil {
		return "", err
	}

	<-s.done

	select {
	case err := <-s.err:
		s.conn.Close()
		s.conn = nil
		return "", err
	default:
	}

	s.conn.Close()
	s.conn = nil

	s.mu.Lock()
	result := s.transcript.String()
	s.transcript.Reset()
	s.mu.Unlock()

	return result, nil
}

func (s *DeepgramService) sendMessage(messageType MessageType) error {
	return s.conn.WriteJSON(Message{string(messageType)})
}

func NewDeepgramService(apiKey string) *DeepgramService {
	return &DeepgramService{apiKey, nil, make(chan struct{}), make(chan error, 1), nil, sync.Mutex{}, strings.Builder{}}
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
	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {
			slog.Error("failed to close response body", "error", err)
		}
	}(resp.Body)

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
