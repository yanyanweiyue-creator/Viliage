PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN liked_resources_json TEXT NOT NULL DEFAULT '[]';

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '7', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
