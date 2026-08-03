PRAGMA foreign_keys = ON;

ALTER TABLE chat_rooms ADD COLUMN announcement TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_rooms ADD COLUMN announcement_pinned INTEGER NOT NULL DEFAULT 0
  CHECK (announcement_pinned IN (0, 1));
ALTER TABLE chat_rooms ADD COLUMN announcement_updated_at TEXT;
ALTER TABLE chat_rooms ADD COLUMN announcement_updated_by TEXT;
ALTER TABLE chat_rooms ADD COLUMN join_approval_required INTEGER NOT NULL DEFAULT 1
  CHECK (join_approval_required IN (0, 1));
ALTER TABLE chat_rooms ADD COLUMN invite_confirmation_required INTEGER NOT NULL DEFAULT 0
  CHECK (invite_confirmation_required IN (0, 1));

ALTER TABLE chat_members ADD COLUMN muted_until TEXT;
ALTER TABLE chat_members ADD COLUMN mute_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_members ADD COLUMN muted_by TEXT;

UPDATE chat_rooms
SET join_approval_required = 0
WHERE system_managed = 1;

CREATE TABLE IF NOT EXISTS chat_join_requests (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- A member-created group's creator is its durable owner. Repair any legacy
-- group whose creator membership was removed before ownership checks existed,
-- and keep role lookups inexpensive for the management UI.
INSERT OR IGNORE INTO chat_members (room_id, user_id, role, joined_at)
SELECT room.id, room.created_by, 'moderator', room.created_at
FROM chat_rooms room
JOIN users owner ON owner.id = room.created_by
WHERE room.kind = 'group'
  AND room.system_managed = 0
  AND room.created_by IS NOT NULL;

UPDATE chat_members
SET role = 'moderator'
WHERE EXISTS (
  SELECT 1
  FROM chat_rooms room
  WHERE room.id = chat_members.room_id
    AND room.kind = 'group'
    AND room.system_managed = 0
    AND room.created_by = chat_members.user_id
);

CREATE INDEX IF NOT EXISTS idx_chat_members_room_role
  ON chat_members(room_id, role, joined_at);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_group_owner
  ON chat_rooms(kind, system_managed, created_by);
CREATE INDEX IF NOT EXISTS idx_chat_join_requests_room_status
  ON chat_join_requests(room_id, status, created_at);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '19', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
