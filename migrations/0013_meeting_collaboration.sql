PRAGMA foreign_keys = ON;

ALTER TABLE meeting_participants ADD COLUMN left_at TEXT;

ALTER TABLE meeting_polls ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft', 'active', 'closed'));
ALTER TABLE meeting_polls ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE meeting_polls ADD COLUMN started_at TEXT;
ALTER TABLE meeting_polls ADD COLUMN ends_at TEXT;

ALTER TABLE meeting_poll_votes ADD COLUMN option_indexes_json TEXT;

CREATE TABLE IF NOT EXISTS meeting_chat_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'everyone'
    CHECK (audience IN ('everyone', 'private', 'group')),
  recipient_ids_json TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  format_json TEXT NOT NULL DEFAULT '{}',
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_data_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  reply_to_id TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES meeting_chat_messages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meeting_chat_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES meeting_chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_active
  ON meeting_participants(meeting_id, left_at, joined_at);
CREATE INDEX IF NOT EXISTS idx_meeting_chat_messages
  ON meeting_chat_messages(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_chat_reactions
  ON meeting_chat_reactions(message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_polls_status
  ON meeting_polls(meeting_id, status, created_at);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '13', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
