package database

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
}

func Connect(dbPath string) (*DB, error) {
	slog.Info("connecting to database", "path", dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	slog.Info("database connection established")
	return &DB{DB: db}, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	slog.Info("closing database connection")
	return db.DB.Close()
}

func GetDatabasePath() (string, error) {
	if os.Getenv("DICTATION_DEV") == "true" {
		return "dictation.db", nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	dataDir := filepath.Join(homeDir, ".dictation")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create data directory: %w", err)
	}

	return filepath.Join(dataDir, "dictation.db"), nil
}
