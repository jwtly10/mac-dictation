//go:build production

package database

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

func GetDatabasePath() (string, error) {
	slog.Info("production mode: using user data directory")

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
