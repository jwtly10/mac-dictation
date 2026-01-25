package transcription

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

type OpenAiModel string
type OpenAiRole string

const (
	Gpt4oMini OpenAiModel = "gpt-4o-mini"

	Developer OpenAiRole = "developer"
	User      OpenAiRole = "user"
)

type OpenAiService struct {
	apiKey string
}

func NewOpenAiService(apiKey string) *OpenAiService {
	return &OpenAiService{apiKey}
}

type OpenAiRequest struct {
	Model        OpenAiModel `json:"model"`
	Instructions string      `json:"instructions,omitempty"`
	Input        string      `json:"input"`
	Temperature  float32     `json:"temperature"`
}

type OpenAiResponse struct {
	Output []Output `json:"output"`
}

type Output struct {
	Id      string          `json:"id"`
	Type    string          `json:"type"`
	Role    string          `json:"role"`
	Content []OutputContent `json:"content"`
}

type OutputContent struct {
	Type        string   `json:"type"`
	Text        string   `json:"text"`
	Annotations []string `json:"annotations"`
}

func (s *OpenAiService) Prompt(systemPrompt, userPrompt string) (string, error) {
	requestBody := OpenAiRequest{
		Model:        Gpt4oMini,
		Instructions: systemPrompt,
		Input:        userPrompt,
		Temperature:  0.3,
	}

	slog.Info("Sending OpenAI request", "request", requestBody)
	openAiResponse, err := s.responses(requestBody)
	if err != nil {
		return "", err
	}

	if len(openAiResponse.Output) == 0 || len(openAiResponse.Output[0].Content) == 0 {
		return "", nil
	}
	return openAiResponse.Output[0].Content[0].Text, nil
}

// responses sends a request to the OpenAI responses API
//
// https://platform.openai.com/docs/api-reference/responses
func (s *OpenAiService) responses(req OpenAiRequest) (*OpenAiResponse, error) {
	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	reqwest, err := http.NewRequest("POST", "https://api.openai.com/v1/responses", bytes.NewBuffer(reqBytes))
	if err != nil {
		return nil, err
	}

	reqwest.Header.Set("Content-Type", "application/json")
	reqwest.Header.Set("Authorization", "Bearer "+s.apiKey)

	client := &http.Client{}
	res, err := client.Do(reqwest)
	if err != nil {
		return nil, err
	}

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("OpenAI API error (status %d): %s", res.StatusCode, string(body))
	}

	var openAiResponse OpenAiResponse
	if err := json.NewDecoder(res.Body).Decode(&openAiResponse); err != nil {
		return nil, err
	}

	slog.Info("OpenAI response received", "response", openAiResponse)

	return &openAiResponse, nil
}
