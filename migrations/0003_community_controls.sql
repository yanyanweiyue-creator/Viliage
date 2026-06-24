PRAGMA foreign_keys = ON;

ALTER TABLE chat_rooms ADD COLUMN system_managed INTEGER NOT NULL DEFAULT 0 CHECK (system_managed IN (0, 1));
UPDATE chat_rooms SET system_managed = 1 WHERE created_by IS NULL AND kind = 'group';

CREATE TABLE IF NOT EXISTS chat_room_preferences (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pinned_at TEXT,
  cleared_before TEXT,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  image_data_url TEXT CHECK (image_data_url IS NULL OR length(image_data_url) <= 750000),
  allowed_user_ids_json TEXT NOT NULL DEFAULT '[]',
  denied_user_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(body) > 0 OR image_data_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_preferences_user ON chat_room_preferences(user_id, pinned_at);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_system_cleanup ON chat_rooms(system_managed, kind);
CREATE INDEX IF NOT EXISTS idx_community_posts_time ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id, created_at DESC);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '3', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
