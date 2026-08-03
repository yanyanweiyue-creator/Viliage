PRAGMA foreign_keys = ON;

ALTER TABLE meeting_participants ADD COLUMN removed_at TEXT;
ALTER TABLE meeting_participants ADD COLUMN removed_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meeting_participants ADD COLUMN restored_at TEXT;
ALTER TABLE meeting_participants ADD COLUMN restored_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_removed
  ON meeting_participants(meeting_id, removed_at, restored_at);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '18', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
