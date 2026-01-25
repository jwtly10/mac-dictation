package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"mac-dictation/internal/database"
	"time"
)

type Message struct {
	ID           *int       `json:"id"`
	ThreadID     int        `json:"threadId"`
	OriginalText string     `json:"originalText"`
	Text         string     `json:"text"`
	Provider     string     `json:"provider"`
	DurationSecs float64    `json:"durationSecs"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DeletedAt    *time.Time `json:"deletedAt"`
}

type MessageService struct {
	db *database.DB
}

func NewMessageService(db *database.DB) *MessageService {
	return &MessageService{db}
}

func (m *MessageService) Lookup(id int) (*Message, error) {
	var msg Message
	row := m.db.QueryRow(
		`SELECT id, thread_id, original_text, text, provider, duration_secs, created_at, updated_at, deleted_at
			FROM messages WHERE id = $1 AND deleted_at IS NULL`, id)

	err := row.Scan(&msg.ID, &msg.ThreadID, &msg.OriginalText, &msg.Text, &msg.Provider, &msg.DurationSecs, &msg.CreatedAt, &msg.UpdatedAt, &msg.DeletedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("message with id %d not found", id)
		}
	}
	return &msg, nil
}

func (m *MessageService) LookupForThread(threadID int) ([]Message, error) {
	rows, err := m.db.Query(
		`SELECT id, thread_id, original_text, text, provider, duration_secs, created_at, updated_at, deleted_at
			FROM messages WHERE thread_id = $1 AND deleted_at IS NULL`, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		err := rows.Scan(&msg.ID, &msg.ThreadID, &msg.OriginalText, &msg.Text, &msg.Provider, &msg.DurationSecs, &msg.CreatedAt, &msg.UpdatedAt, &msg.DeletedAt)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

func (m *MessageService) Persist(msg *Message) error {
	if msg == nil {
		return fmt.Errorf("message is nil")
	}

	now := time.Now().UTC()

	if msg.ID == nil {
		if msg.CreatedAt.IsZero() {
			msg.CreatedAt = now
		}
		msg.UpdatedAt = now

		var id int
		err := m.db.QueryRow(
			`INSERT INTO messages (thread_id, original_text, text, provider, duration_secs, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			msg.ThreadID, msg.OriginalText, msg.Text, msg.Provider, msg.DurationSecs, msg.CreatedAt, msg.UpdatedAt,
		).Scan(&id)
		if err != nil {
			return err
		}
		msg.ID = &id
		return nil
	}

	_, err := m.Lookup(*msg.ID)
	if err != nil {
		return err
	}

	msg.UpdatedAt = now
	_, err = m.db.Exec(
		`UPDATE messages
			 SET original_text= $1, text = $2, provider = $3, duration_secs = $4, updated_at = $5, deleted_at = $6
			 WHERE id = $7 AND deleted_at IS NULL`,
		msg.OriginalText, msg.Text, msg.Provider, msg.DurationSecs, msg.UpdatedAt, msg.DeletedAt, *msg.ID,
	)
	return err
}

func (m *MessageService) Delete(id int) error {
	msg, err := m.Lookup(id)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	msg.DeletedAt = &now
	return m.Persist(msg)
}
