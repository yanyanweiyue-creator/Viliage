PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN disliked_resources_json TEXT NOT NULL DEFAULT '[]';

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '8', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
