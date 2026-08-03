PRAGMA foreign_keys = ON;

ALTER TABLE chat_messages ADD COLUMN message_cursor INTEGER;
ALTER TABLE meeting_signals ADD COLUMN signal_cursor INTEGER;

CREATE TABLE IF NOT EXISTS community_event_sequences (
  stream TEXT PRIMARY KEY
    CHECK (stream IN ('chat_messages', 'meeting_signals')),
  value INTEGER NOT NULL DEFAULT 0
    CHECK (value >= 0)
);

INSERT INTO community_event_sequences (stream, value)
VALUES (
  'chat_messages',
  COALESCE((SELECT MAX(rowid) FROM chat_messages), 0)
);

INSERT INTO community_event_sequences (stream, value)
VALUES (
  'meeting_signals',
  COALESCE((SELECT MAX(rowid) FROM meeting_signals), 0)
);

UPDATE chat_messages
SET message_cursor = rowid
WHERE message_cursor IS NULL;

UPDATE meeting_signals
SET signal_cursor = rowid
WHERE signal_cursor IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_stable_cursor
  ON chat_messages(message_cursor);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_signals_stable_cursor
  ON meeting_signals(signal_cursor);

CREATE TRIGGER IF NOT EXISTS trg_chat_messages_stable_cursor
AFTER INSERT ON chat_messages
WHEN NEW.message_cursor IS NULL
BEGIN
  UPDATE community_event_sequences
  SET value = value + 1
  WHERE stream = 'chat_messages';

  UPDATE chat_messages
  SET message_cursor = (
    SELECT value FROM community_event_sequences
    WHERE stream = 'chat_messages'
  )
  WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_meeting_signals_stable_cursor
AFTER INSERT ON meeting_signals
WHEN NEW.signal_cursor IS NULL
BEGIN
  UPDATE community_event_sequences
  SET value = value + 1
  WHERE stream = 'meeting_signals';

  UPDATE meeting_signals
  SET signal_cursor = (
    SELECT value FROM community_event_sequences
    WHERE stream = 'meeting_signals'
  )
  WHERE rowid = NEW.rowid;
END;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '17', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
