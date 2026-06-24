PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS password_reset_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON password_reset_codes(expires_at);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '5', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
