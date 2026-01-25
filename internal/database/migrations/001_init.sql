CREATE TABLE threads
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE TABLE messages
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id     TEXT     NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
    original_text TEXT     NOT NULL,
    text          TEXT,
    provider      TEXT     NOT NULL,
    duration_secs REAL     NOT NULL,
    audio_path    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (thread_id) REFERENCES threads (id)
);

CREATE INDEX idx_messages_thread ON messages (thread_id);
CREATE INDEX idx_messages_created ON messages (created_at);