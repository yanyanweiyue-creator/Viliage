import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

test("production reset removes account-owned state and preserves shared defaults", async () => {
  const database = new DatabaseSync(":memory:");
  const migrationDirectory = new URL("../migrations/", import.meta.url);
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const migration of migrations) {
    database.exec(await readFile(new URL(migration, migrationDirectory), "utf8"));
  }

  database.exec(`
    INSERT INTO users (
      id, name, email, password_hash, survey_completed, profile_json,
      history_json, feedback, created_at, updated_at
    ) VALUES (
      'reset-user', 'Reset User', 'reset@example.com', 'salt:hash', 0, NULL,
      '[]', '', '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES ('token-hash', 'reset-user', 1, 9999999999999);
    INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, requested_at)
    VALUES ('reset@example.com', 'code-hash', 9999999999999, 0, 1);
    INSERT INTO announcements (
      id, title, body, category, is_pinned, created_by, created_at, updated_at
    ) VALUES (
      'reset-announcement', 'Reset me', 'Account-owned', 'Update', 0,
      'reset-user', '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO activities (
      id, date_label, title, meta, description, created_by, created_at, updated_at
    ) VALUES (
      'reset-activity', 'Today', 'Reset me', '', 'Account-owned',
      'reset-user', '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO chat_rooms (
      id, kind, name, description, created_by, created_at, system_managed
    ) VALUES (
      'reset-room', 'group', 'Reset room', '', 'reset-user',
      '2026-07-28T00:00:00.000Z', 0
    );
    INSERT INTO app_meta (key, value, updated_at)
    VALUES (
      'user_count_metrics:all-time', '{"Total Accounts Created":1}',
      '2026-07-28T00:00:00.000Z'
    )
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
  `);

  database.exec(await readFile(new URL("../scripts/reset-production.sql", import.meta.url), "utf8"));

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM password_reset_codes").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM announcements").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities WHERE created_by IS NOT NULL").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities WHERE id LIKE 'seed-%'").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE system_managed = 0").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE system_managed = 1").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM app_meta WHERE key = 'user_count_metrics:all-time'").get().count, 0);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "13");

  database.close();
});
