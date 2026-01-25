package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"mac-dictation/internal/database"
	"time"
)

type Thread struct {
	ID        *int       `json:"id"`
	Name      string     `json:"name"`
	Pinned    bool       `json:"pinned"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	DeletedAt *time.Time `json:"deletedAt"`
}

type ThreadService struct {
	db *database.DB
}

func NewThreadService(db *database.DB) *ThreadService {
	return &ThreadService{db}
}

func (t *ThreadService) Lookup(id int) (*Thread, error) {
	var thread Thread
	row := t.db.QueryRow(
		`SELECT id, name, pinned, created_at, updated_at, deleted_at
			FROM threads WHERE id = $1 AND deleted_at IS NULL`, id)

	err := row.Scan(&thread.ID, &thread.Name, &thread.Pinned, &thread.CreatedAt, &thread.UpdatedAt, &thread.DeletedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("thread with id %d not found", id)
		}
	}
	return &thread, err
}

func (t *ThreadService) LookupAll() ([]Thread, error) {
	rows, err := t.db.Query(
		`SELECT id, name, pinned, created_at, updated_at, deleted_at
			FROM threads WHERE deleted_at IS NULL
			ORDER BY pinned DESC, updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []Thread
	for rows.Next() {
		var thread Thread
		err := rows.Scan(&thread.ID, &thread.Name, &thread.Pinned, &thread.CreatedAt, &thread.UpdatedAt, &thread.DeletedAt)
		if err != nil {
			return nil, err
		}
		threads = append(threads, thread)
	}

	return threads, nil
}

func (t *ThreadService) Persist(thread *Thread) error {
	if thread == nil {
		return fmt.Errorf("thread is nil")
	}

	now := time.Now().UTC()

	if thread.ID == nil {
		if thread.CreatedAt.IsZero() {
			thread.CreatedAt = now
		}
		thread.UpdatedAt = now
		var id int
		err := t.db.QueryRow(
			`INSERT INTO threads (name, pinned, created_at, updated_at)
				VALUES ($1, $2, $3, $4) RETURNING id`, thread.Name, thread.Pinned, thread.CreatedAt, thread.UpdatedAt,
		).Scan(&id)
		if err != nil {
			return err
		}
		thread.ID = &id
		return nil
	}

	_, err := t.Lookup(*thread.ID)
	if err != nil {
		return err
	}

	thread.UpdatedAt = now
	_, err = t.db.Exec(
		`UPDATE threads
			 SET name = $1, pinned = $2, updated_at = $3
			 WHERE id = $4 AND deleted_at IS NULL`, thread.Name, thread.Pinned, thread.UpdatedAt, *thread.ID,
	)
	return err
}

func (t *ThreadService) Delete(id int) error {
	thread, err := t.Lookup(id)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	thread.DeletedAt = &now
	return t.Persist(thread)
}

func (t *ThreadService) SetPinned(id int, pinned bool) error {
	thread, err := t.Lookup(id)
	if err != nil {
		return err
	}
	thread.Pinned = pinned
	return t.Persist(thread)
}

func (t *ThreadService) TouchUpdatedAt(id int) error {
	now := time.Now().UTC()
	_, err := t.db.Exec(
		`UPDATE threads SET updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
		now, id,
	)
	return err
}
