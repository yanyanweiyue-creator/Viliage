PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_completed IN (0, 1));

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '6', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
