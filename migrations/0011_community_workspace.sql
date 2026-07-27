PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN avatar_data_url TEXT;

ALTER TABLE community_profiles ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1 CHECK (discoverable IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN direct_messages_enabled INTEGER NOT NULL DEFAULT 1 CHECK (direct_messages_enabled IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN location_sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (location_sharing_enabled IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN cover_image_data_url TEXT;
ALTER TABLE community_profiles ADD COLUMN moment_theme TEXT NOT NULL DEFAULT 'light' CHECK (moment_theme IN ('light', 'dark'));
ALTER TABLE community_profiles ADD COLUMN allow_stranger_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_stranger_requests IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN allow_stranger_moments INTEGER NOT NULL DEFAULT 0 CHECK (allow_stranger_moments IN (0, 1));
ALTER TABLE community_profiles ADD COLUMN moment_visibility_days INTEGER NOT NULL DEFAULT 30 CHECK (moment_visibility_days BETWEEN 1 AND 3650);

ALTER TABLE chat_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'sticker', 'file', 'location', 'document', 'meeting', 'system'));
ALTER TABLE chat_messages ADD COLUMN attachment_name TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_mime TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_data_url TEXT;
ALTER TABLE chat_messages ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS community_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('doc', 'pdf', 'form')),
  title TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_shares (
  document_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_id, room_id),
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_form_responses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  image_data_url TEXT,
  sticker_data_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(body) > 0 OR image_data_url IS NOT NULL OR sticker_data_url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS community_stickers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_data_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, image_data_url),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_saved_messages (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, message_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  message_id TEXT,
  reported_user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS community_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_meetings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 10 AND 480),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'cohost', 'participant')),
  raised_hand INTEGER NOT NULL DEFAULT 0 CHECK (raised_hand IN (0, 1)),
  breakout_room TEXT,
  joined_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, user_id),
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_signals (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'candidate', 'leave', 'state')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_whiteboard_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_polls (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES community_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_poll_votes (
  poll_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, user_id),
  FOREIGN KEY (poll_id) REFERENCES meeting_polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON community_documents(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_shares_room ON community_document_shares(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_document ON community_form_responses(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON community_post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stickers_owner ON community_stickers(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON community_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_room ON community_meetings(room_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_signals_target ON meeting_signals(meeting_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whiteboard_meeting ON meeting_whiteboard_events(meeting_id, id);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '11', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
