//go:build !production

package database

import "log/slog"

func GetDatabasePath() (string, error) {
	slog.Info("development mode: using local database")
	return "dictation_dev.db", nil
}
