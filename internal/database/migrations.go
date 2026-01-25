package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Migration struct {
	Version int
	Name    string
	SQL     string
}

type Migrator struct {
	db           *DB
	migrationsFS fs.FS
}

func RunMigrations(ctx context.Context, db *DB) error {
	migrator := NewMigrator(db, migrationsFS)
	return migrator.Migrate(ctx)
}

func NewMigrator(db *DB, migrationsFS fs.FS) *Migrator {
	return &Migrator{
		db:           db,
		migrationsFS: migrationsFS,
	}
}

func (m *Migrator) Migrate(ctx context.Context) error {
	slog.Info("starting database migrations")

	if err := m.createMigrationsTable(ctx); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	applied, err := m.getAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	available, err := m.loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	pending := m.findPendingMigrations(available, applied)
	if len(pending) == 0 {
		slog.Info("no pending migrations")
		return nil
	}

	slog.Info("found pending migrations", "count", len(pending))

	for _, migration := range pending {
		if err := m.runMigration(ctx, migration); err != nil {
			return fmt.Errorf("failed to run migration %d_%s: %w", migration.Version, migration.Name, err)
		}
	}

	slog.Info("migrations completed successfully")
	return nil
}

func (m *Migrator) createMigrationsTable(ctx context.Context) error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`
	_, err := m.db.ExecContext(ctx, query)
	return err
}

func (m *Migrator) getAppliedMigrations(ctx context.Context) (map[int]bool, error) {
	applied := make(map[int]bool)

	query := "SELECT version FROM schema_migrations ORDER BY version"
	rows, err := m.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer func(rows *sql.Rows) {
		if err := rows.Close(); err != nil {
			slog.Error("failed to close rows", "error", err)
		}
	}(rows)

	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}

	return applied, rows.Err()
}

func (m *Migrator) loadMigrations() ([]Migration, error) {
	var migrations []Migration

	err := fs.WalkDir(m.migrationsFS, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() || !strings.HasSuffix(path, ".sql") {
			return nil
		}

		migration, err := m.parseMigrationFile(path)
		if err != nil {
			return fmt.Errorf("failed to parse migration file %s: %w", path, err)
		}

		migrations = append(migrations, migration)
		return nil
	})

	if err != nil {
		return nil, err
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	return migrations, nil
}

func (m *Migrator) parseMigrationFile(path string) (Migration, error) {
	filename := filepath.Base(path)

	// Expected format: 001_create_users.sql
	parts := strings.SplitN(filename, "_", 2)
	if len(parts) != 2 {
		return Migration{}, fmt.Errorf("invalid migration filename format: %s (expected: 001_description.sql)", filename)
	}

	version, err := strconv.Atoi(parts[0])
	if err != nil {
		return Migration{}, fmt.Errorf("invalid version number in filename %s: %w", filename, err)
	}

	name := strings.TrimSuffix(parts[1], ".sql")

	content, err := fs.ReadFile(m.migrationsFS, path)
	if err != nil {
		return Migration{}, fmt.Errorf("failed to read migration file %s: %w", path, err)
	}

	return Migration{
		Version: version,
		Name:    name,
		SQL:     string(content),
	}, nil
}

func (m *Migrator) findPendingMigrations(available []Migration, applied map[int]bool) []Migration {
	var pending []Migration
	for _, migration := range available {
		if !applied[migration.Version] {
			pending = append(pending, migration)
		}
	}
	return pending
}

func (m *Migrator) runMigration(ctx context.Context, migration Migration) error {
	slog.Info("running migration",
		"version", migration.Version,
		"name", migration.Name,
	)

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func(tx *sql.Tx) {
		if err := tx.Rollback(); err != nil && err != sql.ErrTxDone {
			slog.Error("failed to rollback transaction", "error", err)
		}
	}(tx)

	_, err = tx.ExecContext(ctx, migration.SQL)
	if err != nil {
		return fmt.Errorf("failed to execute migration SQL: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		"INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
		migration.Version, migration.Name,
	)
	if err != nil {
		return fmt.Errorf("failed to record migration: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit migration: %w", err)
	}

	slog.Info("migration completed",
		"version", migration.Version,
		"name", migration.Name,
	)

	return nil
}
