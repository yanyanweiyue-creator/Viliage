PRAGMA foreign_keys = ON;

ALTER TABLE community_documents ADD COLUMN folder_id TEXT;
ALTER TABLE community_documents ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));
ALTER TABLE community_documents ADD COLUMN trashed_at TEXT;
ALTER TABLE community_documents ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE community_documents ADD COLUMN template_key TEXT;
ALTER TABLE community_documents ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE community_documents ADD COLUMN public_share_token TEXT;
ALTER TABLE community_documents ADD COLUMN public_permission TEXT NOT NULL DEFAULT 'viewer'
  CHECK (public_permission IN ('viewer', 'commenter', 'editor'));
ALTER TABLE community_documents ADD COLUMN permission_expires_at TEXT;
ALTER TABLE community_documents ADD COLUMN restrict_download INTEGER NOT NULL DEFAULT 0 CHECK (restrict_download IN (0, 1));
ALTER TABLE community_documents ADD COLUMN restrict_copy INTEGER NOT NULL DEFAULT 0 CHECK (restrict_copy IN (0, 1));
ALTER TABLE community_documents ADD COLUMN restrict_print INTEGER NOT NULL DEFAULT 0 CHECK (restrict_print IN (0, 1));
ALTER TABLE community_documents ADD COLUMN watermark TEXT;
ALTER TABLE community_documents ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1));

CREATE TABLE IF NOT EXISTS community_document_folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, parent_id, name),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES community_document_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_collaborators (
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer', 'commenter', 'editor')),
  expires_at TEXT,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id),
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  change_summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (document_id, version_number),
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_comments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  anchor_text TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  mentioned_user_id TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES community_document_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS community_document_presence (
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id, session_id),
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_approvals (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_signatures (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  signature_text TEXT NOT NULL,
  signature_data_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_document_integrations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('link', 'webhook', 'api')),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES community_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_folders_owner ON community_document_folders(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_collaborators_user ON community_document_collaborators(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON community_document_versions(document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_document_comments_document ON community_document_comments(document_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_document_presence_document ON community_document_presence(document_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_audit_document ON community_document_audit(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_approvals_document ON community_document_approvals(document_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_signatures_document ON community_document_signatures(document_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_public_share_token ON community_documents(public_share_token)
  WHERE public_share_token IS NOT NULL;

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '12', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
