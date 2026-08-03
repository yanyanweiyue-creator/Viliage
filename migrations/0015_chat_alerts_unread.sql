PRAGMA foreign_keys = ON;

ALTER TABLE chat_room_preferences ADD COLUMN alerts_hidden INTEGER NOT NULL DEFAULT 0
  CHECK (alerts_hidden IN (0, 1));
ALTER TABLE chat_room_preferences ADD COLUMN last_read_at TEXT;
ALTER TABLE chat_room_preferences ADD COLUMN last_read_cursor INTEGER NOT NULL DEFAULT 0;

INSERT INTO chat_room_preferences (room_id, user_id, last_read_at, last_read_cursor)
SELECT member.room_id, member.user_id, CURRENT_TIMESTAMP,
  COALESCE((SELECT MAX(message.rowid) FROM chat_messages message WHERE message.room_id = member.room_id), 0)
FROM chat_members member
WHERE 1
ON CONFLICT(room_id, user_id) DO UPDATE SET
  last_read_at = COALESCE(chat_room_preferences.last_read_at, excluded.last_read_at),
  last_read_cursor = MAX(chat_room_preferences.last_read_cursor, excluded.last_read_cursor);

CREATE INDEX IF NOT EXISTS idx_chat_messages_global_cursor
  ON chat_messages(created_at, id);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '15', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
