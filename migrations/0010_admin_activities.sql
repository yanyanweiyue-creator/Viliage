PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  date_label TEXT NOT NULL,
  title TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_order
ON activities(created_at, id);

INSERT OR IGNORE INTO activities (id, date_label, title, meta, description, created_by, created_at, updated_at) VALUES
  ('seed-quiet-family-picnic', 'Jul 12', 'Quiet family picnic', 'Palo Alto · Low-stimulation area available', 'A relaxed community meet-up with optional activities and a calm corner.', NULL, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
  ('seed-volunteer-orientation', 'Jul 27', 'Volunteer orientation', 'Online · 45 minutes', 'Learn how to support future It Takes a Village events and resource reviews.', NULL, '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'),
  ('seed-iep-workshop', 'Aug 09', 'IEP preparation workshop', 'San Jose · Free', 'Bring your questions and leave with a one-page meeting plan.', NULL, '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '10', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
