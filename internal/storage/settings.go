package storage

import (
	"database/sql"
	"errors"
	"mac-dictation/internal/database"
	"time"
)

type Setting struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SettingsService struct {
	db *database.DB
}

func NewSettingsService(db *database.DB) *SettingsService {
	return &SettingsService{db}
}

func (s *SettingsService) Get(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = $1`, key).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return value, nil
}

func (s *SettingsService) Set(key, value string) error {
	now := time.Now().UTC()

	existing, err := s.Get(key)
	if err != nil {
		return err
	}

	if existing == "" && value == "" {
		return nil
	}

	if existing == "" {
		_, err = s.db.Exec(
			`INSERT INTO settings (key, value, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
			key, value, now, now,
		)
		return err
	}

	_, err = s.db.Exec(
		`UPDATE settings SET value = $1, updated_at = $2 WHERE key = $3`,
		value, now, key,
	)
	return err
}

func (s *SettingsService) GetAll() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, nil
}

func (s *SettingsService) Delete(key string) error {
	_, err := s.db.Exec(`DELETE FROM settings WHERE key = $1`, key)
	return err
}
