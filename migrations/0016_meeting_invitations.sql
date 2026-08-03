PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meeting_invitations (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'ended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  UNIQUE (meeting_id, recipient_id),
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_invitations_recipient
  ON meeting_invitations(recipient_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_invitations_meeting
  ON meeting_invitations(meeting_id, status, updated_at DESC);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '16', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
