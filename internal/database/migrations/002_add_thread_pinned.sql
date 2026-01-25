ALTER TABLE threads ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_threads_pinned_updated ON threads (pinned DESC, updated_at DESC);
