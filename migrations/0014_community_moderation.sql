PRAGMA foreign_keys = ON;

ALTER TABLE community_reports ADD COLUMN message_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE community_reports ADD COLUMN reviewed_by TEXT;
ALTER TABLE community_reports ADD COLUMN reviewed_at TEXT;
ALTER TABLE community_reports ADD COLUMN resolution_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS community_sanctions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_id TEXT,
  type TEXT NOT NULL
    CHECK (type IN ('chat_mute', 'community_ban', 'site_blacklist')),
  reason TEXT NOT NULL
    CHECK (length(reason) BETWEEN 3 AND 1000),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  duration_seconds INTEGER
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 60 AND 315360000),
  created_by TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (
    (duration_seconds IS NULL AND ends_at IS NULL) OR
    (duration_seconds IS NOT NULL AND ends_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS community_moderation_audit (
  id TEXT PRIMARY KEY,
  sanction_id TEXT,
  report_id TEXT,
  actor_id TEXT,
  target_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('issued', 'revoked')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (sanction_id) REFERENCES community_sanctions(id) ON DELETE SET NULL,
  FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_sanctions_active
  ON community_sanctions(user_id, revoked_at, ends_at, type);
CREATE INDEX IF NOT EXISTS idx_community_sanctions_report
  ON community_sanctions(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_moderation_audit_target
  ON community_moderation_audit(target_user_id, created_at DESC);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '14', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
