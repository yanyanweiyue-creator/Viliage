import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import worker from "../cloudflare/worker.mjs";
import { pairKey } from "../community-logic.mjs";

class FakeD1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new FakeD1Statement(this.database, this.sql, values); }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes || 0) }, results: [] };
  }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
}

class FakeD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new FakeD1Statement(this.database, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

function cloudflareEnv(database, extra = {}) {
  return {
    DB: new FakeD1(database),
    ASSETS: { fetch: async () => new Response("asset") },
    SHEET_WEBHOOK_SECRET: "test-sheet-webhook-secret",
    ...extra
  };
}

const ctx = { waitUntil(promise) { promise.catch(() => {}); } };

async function applyAccountSchema(database) {
  database.exec(await readFile(new URL("../migrations/0001_persistent_accounts.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0006_new_user_onboarding.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0007_liked_resources.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0008_disliked_resources.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0009_announcements_admins.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0010_admin_activities.sql", import.meta.url), "utf8"));
}

async function applyCommunitySchema(database) {
  await applyAccountSchema(database);
  for (const migration of ["0002_community_chat.sql", "0003_community_controls.sql", "0004_group_invitations.sql", "0011_community_workspace.sql", "0012_document_studio.sql", "0013_meeting_collaboration.sql", "0014_community_moderation.sql", "0015_chat_alerts_unread.sql", "0016_meeting_invitations.sql", "0017_stable_event_cursors.sql", "0018_meeting_participant_removals.sql", "0019_group_chat_administrators.sql"]) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  }
}

test("Cloudflare D1 migration creates durable account and session tables", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sessions', 'app_meta') ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ["app_meta", "sessions", "users"]);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "10");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'onboarding_completed'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'liked_resources_json'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'disliked_resources_json'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'is_admin'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'announcements'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'activities'").get().count, 1);
  database.close();
});

test("community migration creates durable chat tables and starter groups", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile(new URL("../migrations/0001_persistent_accounts.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0002_community_chat.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0003_community_controls.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0004_group_invitations.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0005_password_resets.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0006_new_user_onboarding.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0007_liked_resources.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0008_disliked_resources.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0009_announcements_admins.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0010_admin_activities.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0011_community_workspace.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0012_document_studio.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0013_meeting_collaboration.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0014_community_moderation.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0015_chat_alerts_unread.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0016_meeting_invitations.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0017_stable_event_cursors.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0018_meeting_participant_removals.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0019_group_chat_administrators.sql", import.meta.url), "utf8"));
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'chat_%' ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ["chat_blocks", "chat_connections", "chat_group_invitations", "chat_join_requests", "chat_members", "chat_messages", "chat_room_preferences", "chat_rooms", "chat_saved_messages"]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE kind = 'group'").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE system_managed = 1").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'password_reset_codes'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_documents'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_meetings'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_notifications'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_document_versions'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_document_collaborators'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'meeting_chat_messages'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'meeting_chat_reactions'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'meeting_invitations'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_sanctions'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_moderation_audit'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'community_event_sequences'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('chat_room_preferences') WHERE name IN ('alerts_hidden', 'last_read_cursor')").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('chat_messages') WHERE name = 'message_cursor'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('meeting_signals') WHERE name = 'signal_cursor'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('meeting_participants') WHERE name IN ('removed_at', 'removed_by', 'restored_at', 'restored_by')").get().count, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('chat_rooms') WHERE name IN ('announcement', 'announcement_pinned', 'join_approval_required', 'invite_confirmation_required')").get().count, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('chat_members') WHERE name IN ('muted_until', 'mute_reason', 'muted_by')").get().count, 3);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "19");
  database.close();
});

test("Cloudflare Worker exposes D1-backed health status", async () => {
  const response = await worker.fetch(new Request("https://village.example/api/health"), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.storage, "cloudflare-d1");
});

test("Cloudflare voice narration asks OpenAI for a warm conversational Waffles voice", async () => {
  const database = new DatabaseSync(":memory:");
  const originalFetch = globalThis.fetch;
  let speechRequest;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/audio/speech");
    speechRequest = JSON.parse(options.body);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/voice/narrate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Welcome to Waffles.", language: "en" })
    }), cloudflareEnv(database, { OPENAI_API_KEY: "test-key" }), ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(speechRequest.model, "gpt-4o-mini-tts");
    assert.equal(speechRequest.voice, "coral");
    assert.equal(speechRequest.speed, 0.92);
    assert.match(speechRequest.instructions, /conversational AI companion voice/);
    assert.match(speechRequest.instructions, /warmer and more tender/);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Cloudflare voice command parser returns a structured research intent", async () => {
  const database = new DatabaseSync(":memory:");
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ action: "search_resources", island: null, buildingId: null, buildingType: null, topic: "Education", direction: null, followUpQuestion: null, searchQuery: "research school support", speech: "I’ll research matching resources.", confidence: 0.92 }) }] }] });
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/voice/command", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "research school support", context: { selectedIsland: "autism" } })
    }), cloudflareEnv(database, { OPENAI_API_KEY: "test-key" }), ctx);
    assert.equal(response.status, 200);
    const intent = await response.json();
    assert.equal(intent.action, "search_resources");
    assert.equal(intent.topic, "Education");
    assert.equal(intent.searchQuery, "research school support");
    assert.equal(intent.confidence, 0.92);
    assert.equal(requestBody.reasoning.effort, "medium");
    assert.match(requestBody.instructions, /resource research/);
    assert.ok(requestBody.text.format.schema.required.includes("searchQuery"));
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("administrators can issue, enforce, disclose, and revoke report-linked Community penalties", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "safe-password" })
    }), env, ctx);
    const payload = await response.json();
    return { user: payload.user, cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  const request = async (member, path, { method = "GET", payload } = {}) => {
    const response = await worker.fetch(new Request(`https://village.example${path}`, {
      method,
      headers: { ...(payload === undefined ? {} : { "Content-Type": "application/json" }), Cookie: member.cookie },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    }), env, ctx);
    return { response, data: await response.json() };
  };
  const owner = await register("Village Owner", "yanyanweiyue@gmail.com");
  const target = await register("Reported Member", "reported-member@example.com");
  const reporter = await register("Reporter", "reporter@example.com");
  for (const member of [owner, target, reporter]) {
    assert.equal((await request(member, "/api/community/settings", { method: "POST", payload: { enabled: true, displayName: member.user.name } })).response.status, 200);
    assert.equal((await request(member, "/api/community/rooms/group-general/join", { method: "POST", payload: {} })).response.status, 200);
  }
  const sent = await request(target, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "Reported message" } });
  assert.equal(sent.response.status, 201);
  const reported = await request(reporter, `/api/community/messages/${sent.data.message.id}/report`, { method: "POST", payload: { reason: "Repeated harassment" } });
  assert.equal(reported.response.status, 201);

  const reports = await request(owner, "/api/admin/community-reports");
  assert.equal(reports.data.reports[0].reportedUserId, target.user.id);
  assert.equal(reports.data.reports[0].messageBody, "Reported message");
  const reportId = reports.data.reports[0].id;
  const muted = await request(owner, `/api/admin/community-reports/${reportId}/sanctions`, {
    method: "POST",
    payload: { type: "chat_mute", reason: "Repeated harassment", durationSeconds: 864000 }
  });
  assert.equal(muted.response.status, 201);
  assert.equal(muted.data.sanction.durationSeconds, 864000);

  const overview = await request(target, "/api/community");
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.moderation.access.community, true);
  assert.equal(overview.data.moderation.access.chatWrite, false);
  assert.equal(overview.data.moderation.sanctions[0].reason, "Repeated harassment");
  assert.ok(overview.data.moderation.sanctions[0].endsAt);
  assert.equal((await request(target, "/api/community/rooms/group-general/messages")).response.status, 200);
  const blockedMessage = await request(target, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "@everyone blocked by the account chat mute" } });
  assert.equal(blockedMessage.response.status, 403);
  assert.equal(blockedMessage.data.code, "COMMUNITY_SANCTION");
  for (const path of [
    "/api/community/connect",
    "/api/community/groups",
    "/api/community/posts",
    "/api/community/posts/missing/comments",
    "/api/community/rooms/group-general/invite",
    "/api/community/meetings",
    "/api/community/meetings/missing/invitations",
    "/api/community/meetings/missing/messages",
    "/api/community/meetings/missing/polls",
    "/api/community/meetings/missing/whiteboard",
    "/api/community/meeting-messages/missing/reactions",
    "/api/community/documents/missing/comments",
    "/api/community/documents/missing/share"
  ]) {
    const blockedWrite = await request(target, path, { method: "POST", payload: {} });
    assert.equal(blockedWrite.response.status, 403, path);
    assert.equal(blockedWrite.data.code, "COMMUNITY_SANCTION", path);
  }

  const revoked = await request(owner, `/api/admin/community-sanctions/${muted.data.sanction.id}/revoke`, { method: "PATCH", payload: { reason: "Appeal accepted" } });
  assert.equal(revoked.response.status, 200);
  assert.equal((await request(target, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "Allowed again" } })).response.status, 201);

  const suspended = await request(owner, `/api/admin/community-reports/${reportId}/sanctions`, {
    method: "POST",
    payload: { type: "community_ban", reason: "Community safety review", durationSeconds: 259200 }
  });
  assert.equal(suspended.response.status, 201);
  const restrictedOverview = await request(target, "/api/community");
  assert.equal(restrictedOverview.response.status, 200);
  assert.equal(restrictedOverview.data.restricted, true);
  assert.equal(restrictedOverview.data.moderation.access.community, false);
  assert.equal(restrictedOverview.data.moderation.sanctions[0].reason, "Community safety review");
  assert.equal((await request(target, "/api/community/posts")).response.status, 403);

  const blacklisted = await request(owner, `/api/admin/community-reports/${reportId}/sanctions`, {
    method: "POST",
    payload: { type: "site_blacklist", reason: "Severe safety violation", permanent: true }
  });
  assert.equal(blacklisted.response.status, 201);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(target.user.id).count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_profiles WHERE user_id = ?").get(target.user.id).count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE user_id = ?").get(target.user.id).count >= 1, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(target.user.id).count, 0);
  assert.equal((await request(target, "/api/auth/me")).response.status, 401);
  const login = await worker.fetch(new Request("https://village.example/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: target.user.email, password: "safe-password" })
  }), env, ctx);
  assert.equal(login.status, 403);
  const loginData = await login.json();
  assert.equal(loginData.code, "COMMUNITY_SANCTION");
  assert.equal(loginData.moderation.access.site, false);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_moderation_audit WHERE target_user_id = ?").get(target.user.id).count, 4);
  database.close();
});

test("moderation endpoints reject non-admins, self-penalties, and penalties against administrators", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "safe-password" })
    }), env, ctx);
    const payload = await response.json();
    return { user: payload.user, cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  const owner = await register("Village Owner", "yanyanweiyue@gmail.com");
  const secondAdmin = await register("Second Admin", "second-admin@example.com");
  const member = await register("Member", "guard-member@example.com");
  database.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(secondAdmin.user.id);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO community_reports (id, reporter_id, reported_user_id, reason, message_snapshot, status, created_at)
    VALUES
      ('report-owner', ?, ?, 'Owner report', '', 'open', ?),
      ('report-admin', ?, ?, 'Admin report', '', 'open', ?),
      ('report-dismissed', ?, ?, 'Dismissed report', '', 'dismissed', ?)
  `).run(member.user.id, owner.user.id, now, member.user.id, secondAdmin.user.id, now, owner.user.id, member.user.id, now);
  const penalty = { type: "chat_mute", reason: "Test penalty", durationSeconds: 3600 };
  const post = async (actor, reportId) => worker.fetch(new Request(`https://village.example/api/admin/community-reports/${reportId}/sanctions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: actor.cookie },
    body: JSON.stringify(penalty)
  }), env, ctx);
  assert.equal((await post(member, "report-owner")).status, 403);
  assert.equal((await post(owner, "report-owner")).status, 403);
  assert.equal((await post(owner, "report-admin")).status, 403);
  assert.equal((await post(owner, "report-dismissed")).status, 409);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_sanctions").get().count, 0);
  const reopened = await worker.fetch(new Request("https://village.example/api/admin/community-reports/report-dismissed", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: owner.cookie },
    body: JSON.stringify({ status: "open" })
  }), env, ctx);
  assert.equal(reopened.status, 200);
  assert.deepEqual(
    { ...database.prepare("SELECT status, reviewed_by, reviewed_at, resolution_note FROM community_reports WHERE id = 'report-dismissed'").get() },
    { status: "open", reviewed_by: null, reviewed_at: null, resolution_note: "" }
  );
  assert.equal((await post(owner, "report-dismissed")).status, 201);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_sanctions").get().count, 1);
  database.close();
});

test("Cloudflare Waffles guide chat answers site questions without recommending resources", async () => {
  const database = new DatabaseSync(":memory:");
  const originalFetch = globalThis.fetch;
  let guideRequest;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    guideRequest = JSON.parse(options.body);
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
      answer: "It Takes a Village is a guided resource map made by SNP- Group D, 2026, cohort3.",
      suggestedActions: [{ label: "Visit Legal", action: "open_building", island: "autism", buildingId: null, buildingType: "ai", topic: "Legal" }]
    }) }] }] });
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/guide/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Who made this and where do I go for rights?", language: "en" })
    }), cloudflareEnv(database, { OPENAI_API_KEY: "test-key" }), ctx);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ai, true);
    assert.match(result.answer, /SNP- Group D/);
    assert.equal(result.suggestedActions[0].topic, "Legal");
    assert.match(guideRequest.instructions, /Do not recommend specific resources or provider names/);
    assert.match(guideRequest.instructions, /SNP- Group D, 2026, cohort3/);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("guest sessions can explore but cannot open Village Community", async () => {
  const guest = await worker.fetch(new Request("https://village.example/api/auth/guest", { method: "POST" }), {}, ctx);
  assert.equal(guest.status, 200);
  assert.equal((await guest.json()).user.guest, true);
  assert.equal(guest.headers.get("set-cookie"), null);

  const community = await worker.fetch(new Request("https://village.example/api/community", {
    headers: { "X-Village-Guest": "1" }
  }), {}, ctx);
  assert.equal(community.status, 403);
  assert.match((await community.json()).error, /registered members only/i);
});

test("hourly User Count sync follows the four live row-1 topics and writes numbers only", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  for (const migration of ["0002_community_chat.sql", "0003_community_controls.sql", "0004_group_invitations.sql"]) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  }
  database.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)").run(
    "user_count_metrics:2026-07-24",
    JSON.stringify({
      "Total Guest Sessions": 2,
      "Total Accounts Created": 1,
      "Total Searches Completed": 4,
      "__recommendation_usefulness_score_total": 6,
      "__recommendation_usefulness_response_count": 2
    }),
    new Date().toISOString()
  );
  const sheetWrites = [];
  const feedbackWrites = [];
  const env = cloudflareEnv(database, {
    USER_COUNT_SHEET_WEBHOOK_URL: "https://counts.example/sync",
    FEEDBACK_SHEET_WEBHOOK_URL: "https://feedback.example/sync"
  });
  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1"];
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    { c: ["https://example.com/school", "Inclusive school support", "Autism", "Education", "", "All ages", "School"].map((value) => ({ v: value })) }
  ] } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("docs.google.com/spreadsheets")) return new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
    if (String(url) === "https://counts.example/sync") {
      sheetWrites.push(JSON.parse(options.body));
      return Response.json({ ok: true, row: 2 });
    }
    if (String(url) === "https://feedback.example/sync") {
      feedbackWrites.push(JSON.parse(options.body));
      return Response.json({ ok: true, row: 2 });
    }
    return originalFetch(url, options);
  };
  try {
    await worker.fetch(new Request("https://village.example/api/auth/guest", { method: "POST" }), env, ctx);
    await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Count User", email: "count@example.com", password: "safe-password" })
    }), env, ctx);
    const search = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Village-Guest": "1" },
      body: JSON.stringify({ topic: "Education", diagnosis: "Autism", description: "inclusive school support", count: 3 })
    }), env, ctx);
    assert.equal(search.status, 200);
    await worker.fetch(new Request("https://village.example/api/research-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Village-Guest": "1" },
      body: JSON.stringify({ helpful: true, rating: 4, details: "Clear and relevant.", source: "research-results" })
    }), env, ctx);

    const scheduled = [];
    await worker.scheduled({}, env, { waitUntil(promise) { scheduled.push(promise); } });
    await Promise.all(scheduled);
    const latest = sheetWrites.at(-1);
    assert.equal(latest.action, "record-user-count");
    assert.equal(latest.spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(latest.sheetGid, "1958570867");
    assert.deepEqual(latest.metrics, {
      "Total Guest Sessions": 3,
      "Total Accounts Created": 2,
      "Total Searches Completed": 5,
      "Average Recommendation System Usefulness on a 1-5 Scale (5 being the best, 1 being the worst)": 3.33
    });
    assert.equal(Object.values(latest.metrics).every((value) => typeof value === "number"), true);
    assert.equal("date" in latest, false);
    assert.equal(feedbackWrites.length, 1);
    assert.equal(feedbackWrites[0].spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(feedbackWrites[0].sheetGid, "0");
    assert.equal(feedbackWrites[0]["Star(1-5)"], 4);
    assert.equal(feedbackWrites[0].Feedback, "Clear and relevant.");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM app_meta WHERE key = 'user_count_metrics:all-time'").get().count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Cloudflare account and hashed session remain usable independently of code deployment", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const env = cloudflareEnv(database);
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cloud User", email: "cloud@example.com", password: "safe-password" })
  }), env, ctx);
  assert.equal(register.status, 201);
  const cookie = register.headers.get("set-cookie").split(";")[0];
  const rawToken = cookie.split("=")[1];
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1);
  assert.equal((await register.clone().json()).user.onboardingCompleted, false);
  assert.notEqual(database.prepare("SELECT token_hash FROM sessions").get().token_hash, rawToken);

  const me = await worker.fetch(new Request("https://village.example/api/auth/me", { headers: { Cookie: cookie } }), cloudflareEnv(database), ctx);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "cloud@example.com");

  const completedIntro = await worker.fetch(new Request("https://village.example/api/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" }), env, ctx);
  assert.equal(completedIntro.status, 200);
  assert.equal((await completedIntro.json()).user.onboardingCompleted, true);
  assert.equal(database.prepare("SELECT onboarding_completed FROM users WHERE email = 'cloud@example.com'").get().onboarding_completed, 1);

  const login = await worker.fetch(new Request("https://village.example/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cloud@example.com", password: "safe-password" })
  }), cloudflareEnv(database), ctx);
  assert.equal(login.status, 200);
  database.close();
});

test("designated administrator can publish announcements and grant administrator access", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const env = cloudflareEnv(database);
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: "safe-password" })
    }), env, ctx);
    return { response, payload: await response.json(), cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  const member = await register("Village Member", "member@example.com");
  const owner = await register("Village Owner", "yanyanweiyue@gmail.com");
  assert.equal(owner.response.status, 201);
  assert.equal(owner.payload.user.isAdmin, true);
  assert.equal(member.payload.user.isAdmin, false);

  const rejected = await worker.fetch(new Request("https://village.example/api/announcements", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify({ title: "No", body: "Not allowed" })
  }), env, ctx);
  assert.equal(rejected.status, 403);

  const published = await worker.fetch(new Request("https://village.example/api/announcements", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: owner.cookie }, body: JSON.stringify({ title: "Village update", body: "The notice board is live.", category: "Update", isPinned: true })
  }), env, ctx);
  assert.equal(published.status, 201);
  const listing = await worker.fetch(new Request("https://village.example/api/announcements", { headers: { Cookie: member.cookie } }), env, ctx);
  const listingPayload = await listing.json();
  assert.equal(listingPayload.announcements[0].title, "Village update");
  assert.equal(listingPayload.announcements[0].isPinned, true);

  const announcementId = listingPayload.announcements[0].id;
  const rejectedEdit = await worker.fetch(new Request(`https://village.example/api/announcements/${announcementId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify({ title: "No", body: "Still not allowed" })
  }), env, ctx);
  assert.equal(rejectedEdit.status, 403);
  const edited = await worker.fetch(new Request(`https://village.example/api/announcements/${announcementId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: owner.cookie }, body: JSON.stringify({ title: "Edited village update", body: "Everyone can read this.", category: "Event", isPinned: false })
  }), env, ctx);
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).announcement.title, "Edited village update");

  const rejectedActivity = await worker.fetch(new Request("https://village.example/api/activities", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify({ date: "Sep 1", title: "No", description: "Not allowed" })
  }), env, ctx);
  assert.equal(rejectedActivity.status, 403);
  const createdActivity = await worker.fetch(new Request("https://village.example/api/activities", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: owner.cookie }, body: JSON.stringify({ date: "Sep 1", title: "Village walk", meta: "Online", description: "A calm guided village walk." })
  }), env, ctx);
  assert.equal(createdActivity.status, 201);
  const activity = (await createdActivity.json()).activity;
  const activities = await worker.fetch(new Request("https://village.example/api/activities", { headers: { Cookie: member.cookie } }), env, ctx);
  assert.equal((await activities.json()).activities.some((item) => item.id === activity.id), true);
  const deletedActivity = await worker.fetch(new Request(`https://village.example/api/activities/${activity.id}`, { method: "DELETE", headers: { Cookie: owner.cookie } }), env, ctx);
  assert.equal(deletedActivity.status, 200);

  const granted = await worker.fetch(new Request("https://village.example/api/admin/users", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: owner.cookie }, body: JSON.stringify({ email: "member@example.com" })
  }), env, ctx);
  assert.equal(granted.status, 200);
  const memberAdminView = await worker.fetch(new Request("https://village.example/api/admin/users", { headers: { Cookie: member.cookie } }), env, ctx);
  assert.equal(memberAdminView.status, 200);
  const adminList = await memberAdminView.json();
  assert.equal(adminList.users.every((item) => item.isAdmin), true);
  assert.equal(adminList.users.some((item) => item.email === "member@example.com"), true);

  const savedCommunityTerms = await worker.fetch(new Request("https://village.example/api/admin/community-blocklist", {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: owner.cookie }, body: JSON.stringify({ text: "pineapple\nno spoilers" })
  }), env, ctx);
  assert.equal(savedCommunityTerms.status, 200);
  assert.deepEqual((await savedCommunityTerms.json()).terms, ["pineapple", "no spoilers"]);
  const sharedCommunityTerms = await worker.fetch(new Request("https://village.example/api/admin/community-blocklist", { headers: { Cookie: member.cookie } }), env, ctx);
  assert.equal(sharedCommunityTerms.status, 200);
  assert.deepEqual((await sharedCommunityTerms.json()).terms, ["pineapple", "no spoilers"]);
  database.close();
});

test("Cloudflare feedback routes free text to Feedback and profile data to User data", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  for (const migration of ["0002_community_chat.sql", "0003_community_controls.sql", "0004_group_invitations.sql"]) database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Feedback User", email: "feedback@example.com", password: "safe-password" })
  }), cloudflareEnv(database), ctx);
  const cookie = register.headers.get("set-cookie").split(";")[0];
  const originalFetch = globalThis.fetch;
  let sheetPayload;
  const errorPayloads = [];
  const feedbackPayloads = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (String(url).includes("error.example")) {
      errorPayloads.push(payload);
    } else if (String(url).includes("feedback.example")) {
      feedbackPayloads.push(payload);
    } else {
      sheetPayload = payload;
    }
    return Response.json({ ok: true, row: 7 });
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ feedback: "The island guide was helpful." })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync", FEEDBACK_SHEET_WEBHOOK_URL: "https://feedback.example/sync" }), ctx);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.sync.synced, true);
    assert.equal(result.sync.row, 7);
    assert.equal(feedbackPayloads[0].action, "record-feedback");
    assert.equal(feedbackPayloads[0].webhookSecret, "test-sheet-webhook-secret");
    assert.equal(feedbackPayloads[0].spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(feedbackPayloads[0].sheetGid, "0");
    assert.match(feedbackPayloads[0]["Unique User ID (if applicable)"], /^[a-f0-9]{24}$/);
    assert.equal(feedbackPayloads[0]["Email (if applicable)"], "feedback@example.com");
    assert.equal(feedbackPayloads[0]["Username (if applicable)"], "Feedback User");
    assert.equal(feedbackPayloads[0].Feedback, "The island guide was helpful.");
    assert.equal(feedbackPayloads[0]["Star(1-5)"], "");
    assert.equal(feedbackPayloads[0]["Helpful / Nonhelpful"], "");

    const likeResponse = await worker.fetch(new Request("https://village.example/api/resources/like", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ resource: { name: "Saved Resource", url: "https://example.com/saved", description: "Helpful listing.", topic: "Support", score: 31 }, liked: true })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync" }), ctx);
    assert.equal(likeResponse.status, 200);
    const likeResult = await likeResponse.json();
    assert.equal(likeResult.likedResources[0].name, "Saved Resource");
    assert.match(sheetPayload["Save Resource"], /Saved Resource/);
    assert.equal("Like resource" in sheetPayload, false);
    assert.equal(sheetPayload["Dislike Resource"], "[]");

    const dislikeResponse = await worker.fetch(new Request("https://village.example/api/resources/dislike", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ resource: { name: "Saved Resource", url: "https://example.com/saved", description: "Helpful listing.", topic: "Support", score: 31 }, disliked: true })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync", ERROR_SHEET_WEBHOOK_URL: "https://error.example/sync", ERROR_SHEET_GID: "1952899933" }), ctx);
    assert.equal(dislikeResponse.status, 200);
    const dislikeResult = await dislikeResponse.json();
    assert.equal(dislikeResult.likedResources.length, 0);
    assert.equal(dislikeResult.dislikedResources[0].name, "Saved Resource");
    assert.equal(sheetPayload["Save Resource"], "[]");
    assert.match(sheetPayload["Dislike Resource"], /Saved Resource/);
    assert.equal(errorPayloads[0].Event, "resource_disliked");
    assert.equal(errorPayloads[0].webhookSecret, "test-sheet-webhook-secret");
    assert.equal(errorPayloads[0].spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(errorPayloads[0].sheetGid, "1952899933");
    assert.equal(errorPayloads[0]["Helpful?"], "No");
    assert.equal(errorPayloads[0].Helpful, "No");
    assert.equal(errorPayloads[0]["Resource name"], "Saved Resource");

    const researchFeedback = await worker.fetch(new Request("https://village.example/api/research-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ helpful: false, rating: 2, details: "The result was too broad.", source: "research-results", research: { fullInput: "Find respite support", diagnosis: "Autism", category: "Support", primaryKeywords: ["respite"], confirmedKeywords: ["caregiver"], predictedKeywords: ["family support"], locatedKeywords: ["respite"], requestedCount: 5, providedCount: 4, highScoreCount: 3 } })
    }), cloudflareEnv(database, { ERROR_SHEET_WEBHOOK_URL: "https://error.example/sync", ERROR_SHEET_GID: "1952899933", FEEDBACK_SHEET_WEBHOOK_URL: "https://feedback.example/sync" }), ctx);
    assert.equal(researchFeedback.status, 200);
    assert.equal((await researchFeedback.json()).recorded, true);
    assert.equal(errorPayloads[1].Event, "research_not_helpful");
    assert.equal(errorPayloads[1]["Full Input"], "Find respite support");
    assert.equal(errorPayloads[1]["Confirmed Keywords"], "caregiver");
    assert.match(errorPayloads[1].Reason, /Rating: 2\/5/);
    assert.equal(feedbackPayloads.length, 2);
    assert.equal(feedbackPayloads[1].action, "record-feedback");
    assert.equal(feedbackPayloads[1].webhookSecret, "test-sheet-webhook-secret");
    assert.equal(feedbackPayloads[1].spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(feedbackPayloads[1].sheetGid, "0");
    assert.equal(feedbackPayloads[1]["Unique User ID (if applicable)"], (await register.clone().json()).user.id);
    assert.equal(feedbackPayloads[1]["Email (if applicable)"], "feedback@example.com");
    assert.equal(feedbackPayloads[1]["Username (if applicable)"], "Feedback User");
    assert.equal(feedbackPayloads[1].Feedback, "The result was too broad.");
    assert.equal(feedbackPayloads[1]["Star(1-5)"], 2);
    assert.equal(feedbackPayloads[1]["Helpful / Nonhelpful"], "Nonhelpful");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Cloudflare password reset emails a six-digit code and replaces the password", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  database.exec(await readFile(new URL("../migrations/0005_password_resets.sql", import.meta.url), "utf8"));
  const env = cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync", PASSWORD_RESET_SECRET: "test-reset-secret", PASSWORD_EMAIL_FROM_ADDRESS: "hello@village.example" });
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Reset User", email: "reset@example.com", password: "old-password" })
  }), env, ctx);
  assert.equal(register.status, 201);
  let mailedCode = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(String(_url), "https://sheet.example/sync");
    const payload = JSON.parse(options.body);
    mailedCode = payload.code;
    assert.equal(payload.webhookSecret, "test-sheet-webhook-secret");
    assert.equal(payload.fromAddress, "hello@village.example");
    return Response.json({ ok: true, delivered: true });
  };
  try {
    const requestReset = await worker.fetch(new Request("https://village.example/api/auth/password/request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "reset@example.com" })
    }), env, ctx);
    assert.equal(requestReset.status, 202);
    assert.match(mailedCode, /^\d{6}$/);
    const confirm = await worker.fetch(new Request("https://village.example/api/auth/password/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "reset@example.com", code: mailedCode, password: "new-password" })
    }), env, ctx);
    assert.equal(confirm.status, 200);
    const oldLogin = await worker.fetch(new Request("https://village.example/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "reset@example.com", password: "old-password" })
    }), env, ctx);
    const newLogin = await worker.fetch(new Request("https://village.example/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "reset@example.com", password: "new-password" })
    }), env, ctx);
    assert.equal(oldLogin.status, 401);
    assert.equal(newLogin.status, 200);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM password_reset_codes").get().count, 0);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Cloudflare password reset works without an explicit reset secret", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  database.exec(await readFile(new URL("../migrations/0005_password_resets.sql", import.meta.url), "utf8"));
  const env = cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync" });
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Fallback Reset User", email: "fallback-reset@example.com", password: "old-password" })
  }), env, ctx);
  assert.equal(register.status, 201);
  let mailedCode = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(String(_url), "https://sheet.example/sync");
    mailedCode = JSON.parse(options.body).code;
    return Response.json({ ok: true, delivered: true });
  };
  try {
    const requestReset = await worker.fetch(new Request("https://village.example/api/auth/password/request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fallback-reset@example.com" })
    }), env, ctx);
    assert.equal(requestReset.status, 202);
    assert.match(mailedCode, /^\d{6}$/);
    const confirm = await worker.fetch(new Request("https://village.example/api/auth/password/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fallback-reset@example.com", code: mailedCode, password: "new-password" })
    }), env, ctx);
    assert.equal(confirm.status, 200);
    const login = await worker.fetch(new Request("https://village.example/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fallback-reset@example.com", password: "new-password" })
    }), env, ctx);
    assert.equal(login.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Cloudflare password reset accepts pending codes generated before the fallback secret", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  database.exec(await readFile(new URL("../migrations/0005_password_resets.sql", import.meta.url), "utf8"));
  const env = cloudflareEnv(database);
  const email = "legacy-reset@example.com";
  const code = "166262";
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Legacy Reset User", email, password: "old-password" })
  }), env, ctx);
  assert.equal(register.status, 201);
  const legacyHash = createHash("sha256").update(`${email}\u001f${code}\u001f`).digest("hex");
  database.prepare("INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, requested_at) VALUES (?, ?, ?, 0, ?)").run(email, legacyHash, Date.now() + 10 * 60_000, Date.now());
  const confirm = await worker.fetch(new Request("https://village.example/api/auth/password/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, password: "new-password" })
  }), env, ctx);
  assert.equal(confirm.status, 200);
  const login = await worker.fetch(new Request("https://village.example/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "new-password" })
  }), env, ctx);
  assert.equal(login.status, 200);
  database.close();
});

test("opted-in users can connect, accept, and exchange a private D1 message", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: "safe-password" }) }), env, ctx);
    const payload = await response.json();
    return { user: payload.user, cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  const first = await register("Alex", "alex@example.com");
  const second = await register("Sam", "sam@example.com");
  const profileBody = { responses: { interests: ["ADHD"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"] } };
  for (const member of [first, second]) {
    await worker.fetch(new Request("https://village.example/api/profile", { method: "POST", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify(profileBody) }), env, ctx);
    const enabled = await worker.fetch(new Request("https://village.example/api/community/settings", { method: "POST", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify({ enabled: true, displayName: member.user.name }) }), env, ctx);
    assert.equal(enabled.status, 200);
  }

  const overview = await worker.fetch(new Request("https://village.example/api/community", { headers: { Cookie: first.cookie } }), env, ctx);
  const overviewData = await overview.json();
  assert.equal(overviewData.recommendations[0].displayName, "Sam");
  const request = await worker.fetch(new Request("https://village.example/api/community/connect", { method: "POST", headers: { "Content-Type": "application/json", Cookie: first.cookie }, body: JSON.stringify({ targetUserId: second.user.id }) }), env, ctx);
  assert.equal(request.status, 201);
  const secondOverview = await worker.fetch(new Request("https://village.example/api/community", { headers: { Cookie: second.cookie } }), env, ctx);
  const incoming = (await secondOverview.json()).incoming[0];
  const accepted = await worker.fetch(new Request(`https://village.example/api/community/connections/${incoming.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: second.cookie }, body: "{}" }), env, ctx);
  const roomId = (await accepted.json()).roomId;
  const sent = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: first.cookie }, body: JSON.stringify({ message: "[[sticker:wave]]" }) }), env, ctx);
  assert.equal(sent.status, 201);
  const stickerAttachment = { name: "Custom sticker", mime: "image/png", dataUrl: `data:image/png;base64,${Buffer.from("custom-sticker").toString("base64")}` };
  const directCustomSticker = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: first.cookie }, body: JSON.stringify({ messageType: "sticker", attachment: stickerAttachment }) }), env, ctx);
  assert.equal(directCustomSticker.status, 201);
  const joinedSystemGroup = await worker.fetch(new Request("https://village.example/api/community/rooms/group-general/join", { method: "POST", headers: { "Content-Type": "application/json", Cookie: first.cookie }, body: "{}" }), env, ctx);
  assert.equal(joinedSystemGroup.status, 200);
  const blockedCustomSticker = await worker.fetch(new Request("https://village.example/api/community/rooms/group-general/messages", { method: "POST", headers: { "Content-Type": "application/json", Cookie: first.cookie }, body: JSON.stringify({ messageType: "sticker", attachment: stickerAttachment }) }), env, ctx);
  assert.equal(blockedCustomSticker.status, 403);
  assert.match((await blockedCustomSticker.json()).error, /custom stickers are not available/i);
  const messages = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { headers: { Cookie: second.cookie } }), env, ctx);
  assert.equal((await messages.json()).messages[0].body, "[[sticker:wave]]");
  database.close();
});

test("chat alert preferences keep unread cursors isolated and do not swallow concurrent messages", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const request = async (member, path, { method = "GET", payload } = {}) => {
    const response = await worker.fetch(new Request(`https://village.example${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        ...(member?.cookie ? { Cookie: member.cookie } : {})
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    }), env, ctx);
    return { response, data: await response.json() };
  };
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "safe-password" })
    }), env, ctx);
    const data = await response.json();
    const member = { user: data.user, cookie: response.headers.get("set-cookie").split(";")[0] };
    assert.equal((await request(member, "/api/community/settings", {
      method: "POST",
      payload: { enabled: true, displayName: name, notificationsEnabled: true }
    })).response.status, 200);
    return member;
  };
  const alex = await register("Alex", "chat-alert-alex@example.com");
  const sam = await register("Sam", "chat-alert-sam@example.com");
  const outsider = await register("Outsider", "chat-alert-outsider@example.com");
  for (const member of [alex, sam]) {
    assert.equal((await request(member, "/api/community/rooms/group-general/join", { method: "POST", payload: {} })).response.status, 200);
  }

  const baseline = await request(sam, "/api/community/updates");
  assert.equal(baseline.data.events.length, 0);
  const first = await request(alex, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "first" } });
  assert.equal(first.response.status, 201);
  const firstUpdate = await request(sam, `/api/community/updates?after=${baseline.data.cursor}&notificationAfter=${baseline.data.notificationCursor}`);
  assert.equal(firstUpdate.data.events.length, 1);
  assert.equal(firstUpdate.data.events[0].alertsHidden, false);
  assert.equal(firstUpdate.data.unreadCount, 1);

  const hidden = await request(sam, "/api/community/rooms/group-general/preferences", { method: "PATCH", payload: { alertsHidden: true } });
  assert.equal(hidden.response.status, 200);
  assert.equal(hidden.data.alertsHidden, true);
  const rendered = await request(sam, "/api/community/rooms/group-general/messages");
  assert.equal(rendered.data.messages.length, 1);
  assert.ok(rendered.data.readCursor > 0);

  const concurrent = await request(alex, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "arrived after render" } });
  assert.equal(concurrent.response.status, 201);
  const readRenderedOnly = await request(sam, "/api/community/rooms/group-general/read", { method: "POST", payload: { cursor: rendered.data.readCursor } });
  assert.equal(readRenderedOnly.response.status, 200);
  assert.equal(readRenderedOnly.data.unreadCount, 1);
  const afterConcurrent = await request(sam, "/api/community");
  const general = afterConcurrent.data.groups.find((room) => room.id === "group-general");
  assert.equal(general.unreadCount, 1);
  assert.equal(general.alertsHidden, true);
  const hiddenUpdate = await request(sam, `/api/community/updates?after=${firstUpdate.data.cursor}&notificationAfter=${firstUpdate.data.notificationCursor}`);
  assert.equal(hiddenUpdate.data.events.length, 1);
  assert.equal(hiddenUpdate.data.events[0].alertsHidden, true);

  const latestRendered = await request(sam, "/api/community/rooms/group-general/messages");
  await request(sam, "/api/community/rooms/group-general/read", { method: "POST", payload: { cursor: latestRendered.data.readCursor } });
  assert.equal((await request(sam, "/api/community")).data.groups.find((room) => room.id === "group-general").unreadCount, 0);

  await request(sam, "/api/community/settings", {
    method: "POST",
    payload: { enabled: true, displayName: "Sam", notificationsEnabled: false }
  });
  await request(alex, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "unread survives global notification setting" } });
  assert.equal((await request(sam, "/api/community")).data.groups.find((room) => room.id === "group-general").unreadCount, 1);

  const beforeCleanup = await request(sam, "/api/community/rooms/group-general/messages");
  await request(sam, "/api/community/rooms/group-general/read", { method: "POST", payload: { cursor: beforeCleanup.data.readCursor } });
  const cursorBeforeCleanup = database.prepare("SELECT value FROM community_event_sequences WHERE stream = 'chat_messages'").get().value;
  database.prepare("DELETE FROM chat_messages").run();
  const afterCleanupMessage = await request(alex, "/api/community/rooms/group-general/messages", { method: "POST", payload: { message: "visible after cleanup" } });
  assert.equal(afterCleanupMessage.response.status, 201);
  const cursorAfterCleanup = database.prepare("SELECT message_cursor FROM chat_messages WHERE id = ?").get(afterCleanupMessage.data.message.id).message_cursor;
  assert.ok(cursorAfterCleanup > cursorBeforeCleanup);
  const postCleanupUpdate = await request(sam, `/api/community/updates?after=${cursorBeforeCleanup}`);
  assert.equal(postCleanupUpdate.data.events.length, 1);
  assert.equal(postCleanupUpdate.data.events[0].id, afterCleanupMessage.data.message.id);
  assert.equal((await request(sam, "/api/community")).data.groups.find((room) => room.id === "group-general").unreadCount, 1);

  assert.equal((await request(outsider, "/api/community/rooms/group-general/preferences", { method: "PATCH", payload: { alertsHidden: true } })).response.status, 403);
  assert.equal((await request(outsider, "/api/community/rooms/group-general/read", { method: "POST", payload: { cursor: 999999 } })).response.status, 403);
  database.close();
});

test("community controls isolate history, restrict moments to friends, and enforce blocks", async () => {
  const database = new DatabaseSync(":memory:");
  for (const migration of ["0001_persistent_accounts.sql", "0002_community_chat.sql", "0003_community_controls.sql", "0004_group_invitations.sql", "0006_new_user_onboarding.sql", "0007_liked_resources.sql", "0008_disliked_resources.sql", "0009_announcements_admins.sql", "0010_admin_activities.sql", "0011_community_workspace.sql", "0014_community_moderation.sql", "0015_chat_alerts_unread.sql", "0016_meeting_invitations.sql", "0017_stable_event_cursors.sql", "0019_group_chat_administrators.sql"]) database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  const env = cloudflareEnv(database);
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: "safe-password" }) }), env, ctx);
    const payload = await response.json();
    const member = { user: payload.user, cookie: response.headers.get("set-cookie").split(";")[0] };
    await worker.fetch(new Request("https://village.example/api/community/settings", { method: "POST", headers: { "Content-Type": "application/json", Cookie: member.cookie }, body: JSON.stringify({ enabled: true, displayName: name }) }), env, ctx);
    return member;
  };
  const alex = await register("Alex", "alex-controls@example.com");
  const sam = await register("Sam", "sam-controls@example.com");
  const lee = await register("Lee", "lee-controls@example.com");
  const discover = await worker.fetch(new Request("https://village.example/api/community/search?q=sam-controls", { headers: { Cookie: alex.cookie } }), env, ctx);
  const discovered = (await discover.json()).people[0];
  assert.equal(discovered.user_id, sam.user.id);
  assert.equal(discovered.relationship, "none");
  const connect = async (from, to) => {
    await worker.fetch(new Request("https://village.example/api/community/connect", { method: "POST", headers: { "Content-Type": "application/json", Cookie: from.cookie }, body: JSON.stringify({ targetUserId: to.user.id }) }), env, ctx);
    const overview = await worker.fetch(new Request("https://village.example/api/community", { headers: { Cookie: to.cookie } }), env, ctx);
    const request = (await overview.json()).incoming[0];
    const accepted = await worker.fetch(new Request(`https://village.example/api/community/connections/${request.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: to.cookie }, body: "{}" }), env, ctx);
    return (await accepted.json()).roomId;
  };
  await connect(alex, sam);
  await connect(alex, lee);

  const search = await worker.fetch(new Request("https://village.example/api/community/search?q=sam-controls", { headers: { Cookie: alex.cookie } }), env, ctx);
  assert.deepEqual((await search.json()).people.map((person) => person.user_id), [sam.user.id]);

  const created = await worker.fetch(new Request("https://village.example/api/community/groups", { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ name: "Our group", memberIds: [sam.user.id] }) }), env, ctx);
  const roomId = (await created.json()).room.id;
  const inviteOverview = await worker.fetch(new Request("https://village.example/api/community", { headers: { Cookie: sam.cookie } }), env, ctx);
  const invitation = (await inviteOverview.json()).groupInvites[0];
  assert.equal(invitation.room_id, roomId);
  const acceptedInvite = await worker.fetch(new Request(`https://village.example/api/community/group-invitations/${invitation.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sam.cookie }, body: "{}" }), env, ctx);
  assert.equal(acceptedInvite.status, 200);
  const invitedLee = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/invite`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ memberIds: [lee.user.id] }) }), env, ctx);
  assert.equal((await invitedLee.json()).invited, 1);
  await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ message: "Visible to both" }) }), env, ctx);
  await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/history`, { method: "DELETE", headers: { Cookie: alex.cookie } }), env, ctx);
  const alexMessages = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { headers: { Cookie: alex.cookie } }), env, ctx);
  const samMessages = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { headers: { Cookie: sam.cookie } }), env, ctx);
  assert.equal((await alexMessages.json()).messages.length, 0);
  const samRoom = await samMessages.json();
  assert.equal(samRoom.messages.length, 1);
  assert.deepEqual(samRoom.members.map((member) => member.displayName).sort(), ["Alex", "Sam"]);
  const maskedLanguage = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sam.cookie }, body: JSON.stringify({ message: "go die" }) }), env, ctx);
  assert.equal(maskedLanguage.status, 201);
  assert.equal((await maskedLanguage.json()).message.body, "** ***");
  await worker.fetch(new Request("https://village.example/api/community/rooms/group-general/join", { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: "{}" }), env, ctx);
  const systemInvite = await worker.fetch(new Request("https://village.example/api/community/rooms/group-general/invite", { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ memberIds: [sam.user.id] }) }), env, ctx);
  assert.equal((await systemInvite.json()).invited, 1);
  await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/pin`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ pinned: true }) }), env, ctx);
  const pinnedOverview = await worker.fetch(new Request("https://village.example/api/community", { headers: { Cookie: alex.cookie } }), env, ctx);
  assert.equal((await pinnedOverview.json()).groups.find((group) => group.id === roomId).pinned, 1);

  const imageDataUrl = `data:image/png;base64,${Buffer.from("friend-photo").toString("base64")}`;
  const posted = await worker.fetch(new Request("https://village.example/api/community/posts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: JSON.stringify({ text: "Sam can see this", imageDataUrl, allowedUserIds: [sam.user.id], deniedUserIds: [lee.user.id] }) }), env, ctx);
  assert.equal(posted.status, 201);
  const samFeed = await worker.fetch(new Request("https://village.example/api/community/posts", { headers: { Cookie: sam.cookie } }), env, ctx);
  const leeFeed = await worker.fetch(new Request("https://village.example/api/community/posts", { headers: { Cookie: lee.cookie } }), env, ctx);
  const samPosts = (await samFeed.json()).posts;
  assert.equal(samPosts.length, 1);
  assert.equal(samPosts[0].imageDataUrl, imageDataUrl);
  assert.equal((await leeFeed.json()).posts.length, 0);

  await worker.fetch(new Request(`https://village.example/api/community/blocks/${sam.user.id}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: alex.cookie }, body: "{}" }), env, ctx);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_connections WHERE pair_key = ?").get(pairKey(alex.user.id, sam.user.id)).count, 0);

  const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  const elevenHoursAgo = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
  database.prepare("INSERT INTO chat_messages (id, room_id, user_id, body, created_at) VALUES ('old-system', 'group-general', ?, 'old', ?)").run(alex.user.id, thirteenHoursAgo);
  database.prepare("INSERT INTO chat_messages (id, room_id, user_id, body, created_at) VALUES ('recent-system', 'group-general', ?, 'recent', ?)").run(alex.user.id, elevenHoursAgo);
  let cleanupPromise;
  await worker.scheduled({}, env, { waitUntil(promise) { cleanupPromise = promise; } });
  await cleanupPromise;
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE id = 'old-system'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE id = 'recent-system'").get().count, 1);
  database.close();
});

test("group administration enforces owner, appointed admin, member, and system administrator boundaries", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const api = async (member, path, { method = "GET", payload } = {}) => {
    const response = await worker.fetch(new Request(`https://village.example${path}`, {
      method,
      headers: {
        ...(member?.cookie ? { Cookie: member.cookie } : {}),
        ...(payload === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    }), env, ctx);
    return { response, data: await response.json() };
  };
  const register = async (name, email) => {
    const result = await api(null, "/api/auth/register", { method: "POST", payload: { name, email, password: "safe-password" } });
    assert.equal(result.response.status, 201);
    const member = { user: result.data.user, cookie: result.response.headers.get("set-cookie").split(";")[0] };
    assert.equal((await api(member, "/api/community/settings", { method: "POST", payload: { enabled: true, displayName: name } })).response.status, 200);
    return member;
  };
  const connect = async (requester, recipient) => {
    assert.equal((await api(requester, "/api/community/connect", { method: "POST", payload: { targetUserId: recipient.user.id } })).response.status, 201);
    const overview = await api(recipient, "/api/community");
    const pending = overview.data.incoming.find((item) => item.user_id === requester.user.id);
    assert.ok(pending);
    assert.equal((await api(recipient, `/api/community/connections/${pending.id}/accept`, { method: "POST", payload: {} })).response.status, 200);
  };
  const acceptGroupInvite = async (member, roomId, reviewer) => {
    const overview = await api(member, "/api/community");
    const invitation = overview.data.groupInvites.find((item) => item.room_id === roomId);
    assert.ok(invitation);
    const accepted = await api(member, `/api/community/group-invitations/${invitation.id}/accept`, { method: "POST", payload: {} });
    if (!reviewer) {
      assert.equal(accepted.response.status, 200);
      assert.equal(accepted.data.pendingApproval, false);
      return;
    }
    assert.equal(accepted.response.status, 202);
    assert.equal(accepted.data.pendingApproval, true);
    const requests = await api(reviewer, `/api/community/rooms/${roomId}/join-requests`);
    const requestItem = requests.data.requests.find((item) => item.userId === member.user.id);
    assert.ok(requestItem);
    assert.equal((await api(reviewer, `/api/community/rooms/${roomId}/join-requests/${requestItem.id}`, { method: "PATCH", payload: { status: "approved" } })).response.status, 200);
  };

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await register("Group Owner", `group-owner-${suffix}@example.com`);
  const successor = await register("Future Owner", `group-successor-${suffix}@example.com`);
  const appointedAdmin = await register("Appointed Admin", `group-admin-${suffix}@example.com`);
  const ordinary = await register("Ordinary Member", `group-member-${suffix}@example.com`);
  const outsider = await register("Outside Member", `group-outsider-${suffix}@example.com`);
  for (const member of [successor, appointedAdmin, ordinary]) await connect(owner, member);

  const created = await api(owner, "/api/community/groups", {
    method: "POST",
    payload: { name: "Family Circle", description: "Original description", memberIds: [successor.user.id, appointedAdmin.user.id, ordinary.user.id] }
  });
  assert.equal(created.response.status, 201);
  const roomId = created.data.room.id;
  for (const member of [successor, appointedAdmin, ordinary]) await acceptGroupInvite(member, roomId);

  const ownerView = await api(owner, `/api/community/rooms/${roomId}/messages`);
  assert.equal(ownerView.response.status, 200);
  assert.equal(ownerView.data.room.ownerId, owner.user.id);
  assert.equal(ownerView.data.room.currentUserRole, "owner");
  assert.equal(ownerView.data.room.canManageMembers, true);
  assert.equal(ownerView.data.room.canManageAdmins, true);
  assert.equal(ownerView.data.room.canTransferOwnership, true);
  assert.equal(ownerView.data.members.find((item) => item.userId === owner.user.id).role, "owner");

  assert.equal((await api(ordinary, `/api/community/rooms/${roomId}`, { method: "PATCH", payload: { name: "Unauthorized rename" } })).response.status, 403);
  assert.equal((await api(ordinary, `/api/community/rooms/${roomId}/members/${ordinary.user.id}`, { method: "PATCH", payload: { role: "admin" } })).response.status, 403);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}/members/${outsider.user.id}`, { method: "PATCH", payload: { role: "admin" } })).response.status, 404);
  await connect(owner, outsider);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}`, { method: "PATCH", payload: { inviteConfirmationRequired: true } })).response.status, 200);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}/invite`, { method: "POST", payload: { memberIds: [outsider.user.id] } })).response.status, 200);
  await acceptGroupInvite(outsider, roomId, owner);

  const promoted = await api(owner, `/api/community/rooms/${roomId}/members/${appointedAdmin.user.id}`, { method: "PATCH", payload: { role: "admin" } });
  assert.equal(promoted.response.status, 200);
  assert.equal(promoted.data.member.role, "admin");
  assert.equal((await api(appointedAdmin, `/api/community/rooms/${roomId}/members/${successor.user.id}`, { method: "PATCH", payload: { role: "admin" } })).response.status, 403);
  assert.equal((await api(appointedAdmin, `/api/community/rooms/${roomId}`, {
    method: "PATCH",
    payload: { name: "Admin-renamed circle", announcement: "Please read the updated group notice.", announcementPinned: true }
  })).response.status, 200);
  assert.equal((await api(appointedAdmin, `/api/community/rooms/${roomId}`, { method: "PATCH", payload: { joinApprovalRequired: false } })).response.status, 200);

  const muted = await api(appointedAdmin, `/api/community/rooms/${roomId}/members/${ordinary.user.id}`, {
    method: "PATCH",
    payload: { durationSeconds: 3600, muteReason: "Cooling-off period" }
  });
  assert.equal(muted.response.status, 200);
  assert.ok(muted.data.member.mutedUntil);
  const mutedMessage = await api(ordinary, `/api/community/rooms/${roomId}/messages`, { method: "POST", payload: { message: "@所有人 this muted broadcast must be blocked" } });
  assert.equal(mutedMessage.response.status, 403);
  assert.equal(mutedMessage.data.code, "ROOM_MUTED");
  assert.equal((await api(successor, `/api/community/rooms/${roomId}/messages`, { method: "POST", payload: { message: "@Everyone ordinary member broadcast" } })).response.status, 201);
  assert.equal((await api(appointedAdmin, `/api/community/rooms/${roomId}/messages`, { method: "POST", payload: { message: "@everyone administrator notice" } })).response.status, 201);
  assert.equal((await api(appointedAdmin, `/api/community/rooms/${roomId}/members/${owner.user.id}`, { method: "DELETE" })).response.status, 409);

  const memberView = await api(successor, `/api/community/rooms/${roomId}/messages`);
  assert.equal(memberView.data.room.name, "Admin-renamed circle");
  assert.equal(memberView.data.room.announcement, "Please read the updated group notice.");
  assert.equal(memberView.data.room.announcementPinned, true);
  assert.equal(memberView.data.room.currentUserRole, "member");
  assert.equal(memberView.data.room.canManageMembers, false);
  assert.equal(memberView.data.room.canMentionEveryone, true);
  const mutedMember = memberView.data.members.find((item) => item.userId === ordinary.user.id);
  assert.equal(mutedMember.isMuted, true);
  assert.equal(mutedMember.muteReason, "Cooling-off period");

  const transferred = await api(owner, `/api/community/rooms/${roomId}/ownership`, { method: "POST", payload: { userId: successor.user.id } });
  assert.equal(transferred.response.status, 200);
  assert.equal(transferred.data.room.ownerId, successor.user.id);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}/ownership`, { method: "POST", payload: { userId: appointedAdmin.user.id } })).response.status, 403);
  assert.equal((await api(successor, `/api/community/rooms/${roomId}/leave`, { method: "POST", payload: {} })).response.status, 409);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}/leave`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await api(owner, `/api/community/rooms/${roomId}/messages`)).response.status, 403);

  const siteAdmin = await register("System Administrator", "yanyanweiyue@gmail.com");
  const systemModerator = await register("System Moderator", `system-moderator-${suffix}@example.com`);
  const applicant = await register("Join Applicant", `system-applicant-${suffix}@example.com`);
  assert.equal((await api(siteAdmin, "/api/community/rooms/group-general/join", { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await api(systemModerator, "/api/community/rooms/group-general/join", { method: "POST", payload: {} })).response.status, 200);
  const siteAdminView = await api(siteAdmin, "/api/community/rooms/group-general/messages");
  assert.equal(siteAdminView.data.room.currentUserRole, "admin");
  assert.equal(siteAdminView.data.room.canManageAdmins, true);
  assert.equal((await api(siteAdmin, `/api/community/rooms/group-general/members/${systemModerator.user.id}`, { method: "PATCH", payload: { role: "admin" } })).response.status, 200);
  assert.equal((await api(systemModerator, "/api/community/rooms/group-general", { method: "PATCH", payload: { announcement: "System moderator notice", announcementPinned: true } })).response.status, 200);
  assert.equal((await api(systemModerator, "/api/community/rooms/group-general", { method: "PATCH", payload: { joinApprovalRequired: true } })).response.status, 200);
  assert.equal((await api(siteAdmin, "/api/community/rooms/group-general", { method: "PATCH", payload: { joinApprovalRequired: true } })).response.status, 200);

  const pendingJoin = await api(applicant, "/api/community/rooms/group-general/join", { method: "POST", payload: {} });
  assert.equal(pendingJoin.response.status, 202);
  assert.equal(pendingJoin.data.joined, false);
  assert.equal((await api(applicant, "/api/community/rooms/group-general/messages")).response.status, 403);
  const joinRequests = await api(systemModerator, "/api/community/rooms/group-general/join-requests");
  assert.equal(joinRequests.response.status, 200);
  const joinRequest = joinRequests.data.requests.find((item) => item.userId === applicant.user.id);
  assert.ok(joinRequest);
  assert.equal((await api(systemModerator, `/api/community/rooms/group-general/join-requests/${joinRequest.id}`, { method: "PATCH", payload: { status: "approved" } })).response.status, 200);
  assert.equal((await api(applicant, "/api/community/rooms/group-general/messages")).response.status, 200);
  assert.equal((await api(systemModerator, `/api/community/rooms/group-general/members/${applicant.user.id}`, { method: "PATCH", payload: { role: "admin" } })).response.status, 403);
  assert.equal((await api(siteAdmin, "/api/community/rooms/group-general/ownership", { method: "POST", payload: { userId: applicant.user.id } })).response.status, 403);
  assert.equal((await api(siteAdmin, "/api/community/rooms/group-general", { method: "DELETE" })).response.status, 403);

  const dissolved = await api(successor, `/api/community/rooms/${roomId}`, { method: "DELETE" });
  assert.equal(dissolved.response.status, 200);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE id = ?").get(roomId).count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_members WHERE room_id = ?").get(roomId).count, 0);
  database.close();
});

test("community workspace shares moderation, documents, Moments, and live meeting state end to end", async () => {
  const database = new DatabaseSync(":memory:");
  await applyCommunitySchema(database);
  const env = cloudflareEnv(database);
  const pending = [];
  const workspaceCtx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  const flushPending = async () => {
    while (pending.length) await Promise.all(pending.splice(0));
  };
  const request = async (member, path, { method = "GET", payload } = {}) => {
    const response = await worker.fetch(new Request(`https://village.example${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        ...(member?.cookie ? { Cookie: member.cookie } : {})
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    }), env, workspaceCtx);
    return { response, data: await response.json() };
  };
  const register = async (name, email) => {
    const result = await request(null, "/api/auth/register", {
      method: "POST",
      payload: { name, email, password: "safe-password" }
    });
    assert.equal(result.response.status, 201);
    const member = {
      user: result.data.user,
      cookie: result.response.headers.get("set-cookie").split(";")[0]
    };
    const settings = await request(member, "/api/community/settings", {
      method: "POST",
      payload: { enabled: true, displayName: name, notificationsEnabled: true }
    });
    assert.equal(settings.response.status, 200);
    return member;
  };
  const connect = async (from, to) => {
    const created = await request(from, "/api/community/connect", { method: "POST", payload: { targetUserId: to.user.id } });
    assert.equal(created.response.status, 201);
    const connection = database.prepare("SELECT id FROM chat_connections WHERE requester_id = ? AND recipient_id = ? AND status = 'pending'").get(from.user.id, to.user.id);
    const accepted = await request(to, `/api/community/connections/${connection.id}/accept`, { method: "POST", payload: {} });
    assert.equal(accepted.response.status, 200);
    return accepted.data.roomId;
  };

  const owner = await register("Village Owner", "yanyanweiyue@gmail.com");
  const sam = await register("Sam", "workspace-sam@example.com");
  const lee = await register("Lee", "workspace-lee@example.com");
  const samRoomId = await connect(owner, sam);
  await connect(owner, lee);
  await flushPending();

  const blockedTerms = await request(owner, "/api/admin/community-blocklist", {
    method: "PUT",
    payload: { terms: ["no spoilers"] }
  });
  assert.equal(blockedTerms.response.status, 200);
  assert.deepEqual(blockedTerms.data.terms, ["no spoilers"]);

  const sent = await request(owner, `/api/community/rooms/${samRoomId}/messages`, {
    method: "POST",
    payload: { message: "No spoilers please" }
  });
  assert.equal(sent.response.status, 201);
  assert.equal(sent.data.message.body, "** ******** please");

  const post = await request(owner, "/api/community/posts", {
    method: "POST",
    payload: {
      text: "No spoilers in this update",
      allowedUserIds: [sam.user.id],
      deniedUserIds: [lee.user.id]
    }
  });
  assert.equal(post.response.status, 201);
  assert.equal(post.data.post.body, "** ******** in this update");
  await flushPending();

  const samMoments = await request(sam, "/api/community/posts");
  const leeMoments = await request(lee, "/api/community/posts");
  assert.equal(samMoments.data.posts.length, 1);
  assert.equal(leeMoments.data.posts.length, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_notifications WHERE user_id = ? AND kind = 'moment'").get(sam.user.id).count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM community_notifications WHERE user_id = ? AND kind = 'moment'").get(lee.user.id).count, 0);

  const comment = await request(sam, `/api/community/posts/${post.data.post.id}/comments`, {
    method: "POST",
    payload: { text: "No spoilers from me" }
  });
  assert.equal(comment.response.status, 201);
  assert.equal(comment.data.comment.body, "** ******** from me");

  const createdDocument = await request(owner, "/api/community/documents", {
    method: "POST",
    payload: {
      kind: "form",
      title: "Village activity poll",
      content: {
        introduction: "Choose the next activity.",
        fields: [{ id: "activity", label: "Activity", type: "text", required: true }]
      }
    }
  });
  assert.equal(createdDocument.response.status, 201);
  const documentId = createdDocument.data.document.id;
  const shared = await request(owner, `/api/community/documents/${documentId}/share`, {
    method: "POST",
    payload: { roomId: samRoomId }
  });
  assert.equal(shared.response.status, 201);
  const samDocuments = await request(sam, "/api/community/documents");
  assert.equal(samDocuments.data.documents[0].id, documentId);
  const samMessages = await request(sam, `/api/community/rooms/${samRoomId}/messages`);
  assert.ok(samMessages.data.messages.some((message) => message.messageType === "document" && message.metadata.documentId === documentId));
  const submitted = await request(sam, `/api/community/documents/${documentId}/responses`, {
    method: "POST",
    payload: { response: { activity: "Quiet art circle" } }
  });
  assert.equal(submitted.response.status, 201);
  const responses = await request(owner, `/api/community/documents/${documentId}/responses`);
  assert.equal(responses.data.responses[0].response.activity, "Quiet art circle");

  const initialWorkspace = await request(owner, `/api/community/documents/${documentId}/workspace`);
  assert.equal(initialWorkspace.response.status, 200);
  assert.equal(initialWorkspace.data.document.permission, "owner");
  assert.equal(initialWorkspace.data.versions[0].versionNumber, 1);
  assert.equal(initialWorkspace.data.responses[0].response.activity, "Quiet art circle");

  const collaborator = await request(owner, `/api/community/documents/${documentId}/collaborators`, {
    method: "POST",
    payload: { email: sam.user.email, permission: "editor" }
  });
  assert.equal(collaborator.response.status, 201);
  const collaboratorWorkspace = await request(sam, `/api/community/documents/${documentId}/workspace`);
  assert.equal(collaboratorWorkspace.data.document.permission, "editor");
  assert.equal(collaboratorWorkspace.data.document.canEdit, true);

  const edited = await request(sam, `/api/community/documents/${documentId}`, {
    method: "PATCH",
    payload: {
      title: "Village activity poll · edited together",
      content: { html: "<h1>Activity poll</h1><p>Choose together.</p>", plainText: "Activity poll Choose together.", questions: ["Which activity?"] },
      settings: { pageSize: "a4", orientation: "portrait", mode: "edit", security: { restrictCopy: true } },
      createVersion: false
    }
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.document.title, "Village activity poll · edited together");
  assert.equal(edited.data.document.restrictions.copy, false);

  const documentComment = await request(sam, `/api/community/documents/${documentId}/comments`, {
    method: "POST",
    payload: { body: "Please review this section.", anchorText: "Choose together.", assignedTo: owner.user.id }
  });
  assert.equal(documentComment.response.status, 201);
  assert.equal(documentComment.data.comment.status, "open");
  assert.equal((await request(owner, `/api/community/documents/${documentId}/comments`)).data.comments.length, 1);

  assert.equal((await request(sam, `/api/community/documents/${documentId}/presence`, {
    method: "POST",
    payload: { sessionId: "sam-edit-session", cursor: { mode: "edit" } }
  })).response.status, 200);
  assert.equal((await request(owner, `/api/community/documents/${documentId}/presence`)).data.presence[0].userId, sam.user.id);

  const namedVersion = await request(sam, `/api/community/documents/${documentId}/versions`, {
    method: "POST",
    payload: { changeSummary: "Ready for owner review" }
  });
  assert.equal(namedVersion.response.status, 201);
  assert.equal(namedVersion.data.version.versionNumber, 2);

  const folder = await request(owner, "/api/community/document-folders", {
    method: "POST",
    payload: { name: "Village plans" }
  });
  assert.equal(folder.response.status, 201);
  await request(owner, `/api/community/documents/${documentId}/metadata`, {
    method: "PATCH",
    payload: { folderId: folder.data.folder.id, favorite: true }
  });
  const favorites = await request(owner, "/api/community/documents?view=favorites");
  assert.equal(favorites.data.documents.length, 1);
  assert.equal(favorites.data.documents[0].favorite, true);

  const publicShare = await request(owner, `/api/community/documents/${documentId}/share-link`, {
    method: "POST",
    payload: { enabled: true, permission: "viewer", restrictDownload: true, restrictCopy: true, restrictPrint: true, watermark: "Village confidential" }
  });
  assert.equal(publicShare.response.status, 200);
  const publicDocument = await request(null, `/api/community/public-documents/${publicShare.data.token}`);
  assert.equal(publicDocument.response.status, 200);
  assert.equal(publicDocument.data.document.watermark, "Village confidential");
  assert.equal(publicDocument.data.document.restrictions.download, true);

  const approval = await request(owner, `/api/community/documents/${documentId}/approvals`, {
    method: "POST",
    payload: { email: lee.user.email, note: "Please approve the final copy." }
  });
  assert.equal(approval.response.status, 201);
  const approved = await request(lee, `/api/community/documents/${documentId}/approvals/${approval.data.approval.id}`, {
    method: "PATCH",
    payload: { status: "approved", note: "Approved." }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.status, "approved");

  const signature = await request(sam, `/api/community/documents/${documentId}/signatures`, {
    method: "POST",
    payload: { signatureText: "Sam" }
  });
  assert.equal(signature.response.status, 201);
  const integration = await request(owner, `/api/community/documents/${documentId}/integrations`, {
    method: "POST",
    payload: { name: "Planning API", type: "api", config: { url: "https://example.com/village-hook" } }
  });
  assert.equal(integration.response.status, 201);

  const meeting = await request(owner, "/api/community/meetings", {
    method: "POST",
    payload: {
      roomId: samRoomId,
      title: "Village planning",
      startsAt: new Date(Date.now() + 60000).toISOString(),
      durationMinutes: 30,
      settings: { waitingRoom: false, recordingAllowed: true, captionsEnabled: true }
    }
  });
  assert.equal(meeting.response.status, 201);
  const meetingId = meeting.data.meeting.id;
  assert.equal((await request(sam, `/api/community/meetings?roomId=${encodeURIComponent(samRoomId)}`)).data.meetings[0].id, meetingId);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/invitations`, {
    method: "POST",
    payload: { recipientIds: [lee.user.id] }
  })).response.status, 403);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}`)).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}`)).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/messages`)).response.status, 403);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/whiteboard`)).response.status, 403);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 200);
  const memberCountBeforeMeetingInvite = database.prepare("SELECT COUNT(*) AS count FROM chat_members").get().count;
  const connectionCountBeforeMeetingInvite = database.prepare("SELECT COUNT(*) AS count FROM chat_connections").get().count;
  const invitationCandidates = await request(owner, `/api/community/meetings/${meetingId}/invitations`);
  assert.deepEqual(invitationCandidates.data.friends.map((friend) => friend.userId), [lee.user.id]);
  const invitedLee = await request(owner, `/api/community/meetings/${meetingId}/invitations`, {
    method: "POST",
    payload: { recipientIds: [lee.user.id] }
  });
  assert.equal(invitedLee.response.status, 200);
  assert.equal(invitedLee.data.invited, 1);
  await flushPending();
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_members").get().count, memberCountBeforeMeetingInvite);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_connections").get().count, connectionCountBeforeMeetingInvite);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_members WHERE room_id = ? AND user_id = ?").get(samRoomId, lee.user.id).count, 0);
  const leeInvitation = database.prepare("SELECT * FROM meeting_invitations WHERE meeting_id = ? AND recipient_id = ?").get(meetingId, lee.user.id);
  assert.equal(leeInvitation.status, "pending");
  const invitationNotification = database.prepare("SELECT metadata_json FROM community_notifications WHERE user_id = ? AND kind = 'meeting-invite' ORDER BY created_at DESC LIMIT 1").get(lee.user.id);
  assert.deepEqual(Object.keys(JSON.parse(invitationNotification.metadata_json)).sort(), ["invitationId", "meetingId"]);
  assert.equal(JSON.parse(invitationNotification.metadata_json).meetingId, meetingId);
  const leeMeetingPreview = await request(lee, `/api/community/meetings/${meetingId}`);
  assert.equal(leeMeetingPreview.response.status, 200);
  assert.equal(leeMeetingPreview.data.rtcConfiguration.relayAvailable, false);
  assert.ok(leeMeetingPreview.data.rtcConfiguration.iceServers.length > 0);
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}/messages`)).response.status, 403);
  assert.equal((await request(lee, `/api/community/rooms/${samRoomId}/messages`)).response.status, 403);
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal(database.prepare("SELECT status FROM meeting_invitations WHERE id = ?").get(leeInvitation.id).status, "accepted");
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}/messages`)).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/state`, { method: "PATCH", payload: { raisedHand: true } })).data.participant.raisedHand, true);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/whiteboard`, { method: "POST", payload: { event: { type: "line", points: [[1, 2], [3, 4]] } } })).response.status, 201);
  const poll = await request(owner, `/api/community/meetings/${meetingId}/polls`, {
    method: "POST",
    payload: { question: "Which activity?", options: ["Art", "Music"], multiple: true, anonymous: false, showLiveResults: true, durationSeconds: 60 }
  });
  assert.equal(poll.response.status, 201);
  assert.equal(poll.data.poll.status, "draft");
  assert.equal((await request(owner, `/api/community/polls/${poll.data.poll.id}/start`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await request(sam, `/api/community/polls/${poll.data.poll.id}/vote`, { method: "POST", payload: { optionIndexes: [0, 1] } })).response.status, 200);
  const meetingMessage = await request(owner, `/api/community/meetings/${meetingId}/messages`, {
    method: "POST",
    payload: { message: "Welcome to the meeting.", audience: "everyone", attachment: null, format: { bold: true } }
  });
  assert.equal(meetingMessage.response.status, 201);
  const privateMessage = await request(sam, `/api/community/meetings/${meetingId}/messages`, {
    method: "POST",
    payload: { message: "Private note", audience: "private", recipientIds: [owner.user.id], replyToId: meetingMessage.data.message.id }
  });
  assert.equal(privateMessage.response.status, 201);
  assert.equal((await request(owner, `/api/community/meeting-messages/${privateMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } })).response.status, 200);
  assert.equal((await request(lee, `/api/community/meeting-messages/${privateMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } })).response.status, 404);
  const meetingMessages = await request(owner, `/api/community/meetings/${meetingId}/messages`);
  assert.equal(meetingMessages.data.messages.length, 2);
  assert.equal(meetingMessages.data.messages[1].replyTo.body, "Welcome to the meeting.");
  const publicReplyToPrivate = await request(owner, `/api/community/meetings/${meetingId}/messages`, {
    method: "POST",
    payload: { message: "Public follow-up", audience: "everyone", replyToId: privateMessage.data.message.id }
  });
  assert.equal(publicReplyToPrivate.response.status, 201);
  const ownerReplyView = await request(owner, `/api/community/meetings/${meetingId}/messages`);
  assert.equal(ownerReplyView.data.messages.at(-1).replyTo.body, "Private note");
  const unrelatedReplyView = await request(lee, `/api/community/meetings/${meetingId}/messages`);
  assert.equal(unrelatedReplyView.data.messages.at(-1).body, "Public follow-up");
  assert.equal(unrelatedReplyView.data.messages.at(-1).replyToId, null);
  assert.equal(unrelatedReplyView.data.messages.at(-1).replyTo, null);
  assert.equal(JSON.stringify(unrelatedReplyView.data).includes("Private note"), false);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/signals`, { method: "POST", payload: { recipientId: sam.user.id, kind: "offer", payload: { sdp: "test" } } })).response.status, 201);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/signals`, { method: "POST", payload: { recipientId: sam.user.id, kind: "offer", payload: {} } })).response.status, 400);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/signals`, { method: "POST", payload: { recipientId: sam.user.id, kind: "candidate", payload: [] } })).response.status, 400);
  const signals = await request(sam, `/api/community/meetings/${meetingId}/signals?after=`);
  assert.equal(signals.data.signals[0].payload.sdp, "test");
  const signalCursorBeforeCleanup = signals.data.signals[0].cursor;
  database.prepare("DELETE FROM meeting_signals").run();
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/signals`, { method: "POST", payload: { recipientId: sam.user.id, kind: "candidate", payload: { candidate: "after-cleanup" } } })).response.status, 201);
  const signalsAfterCleanup = await request(sam, `/api/community/meetings/${meetingId}/signals?cursor=${signalCursorBeforeCleanup}`);
  assert.equal(signalsAfterCleanup.data.signals.length, 1);
  assert.equal(signalsAfterCleanup.data.signals[0].payload.candidate, "after-cleanup");
  assert.ok(signalsAfterCleanup.data.signals[0].cursor > signalCursorBeforeCleanup);
  const meetingState = await request(owner, `/api/community/meetings/${meetingId}`);
  assert.equal(meetingState.data.participants.find((participant) => participant.userId === sam.user.id).raisedHand, true);
  assert.equal(meetingState.data.polls[0].status, "active");
  assert.equal(meetingState.data.polls[0].votes[0], 1);
  assert.equal(meetingState.data.polls[0].votes[1], 1);
  assert.equal(meetingState.data.polls[0].voters[0].displayName, "Sam");
  assert.equal((await request(owner, `/api/community/polls/${poll.data.poll.id}/end`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/state`, {
    method: "PATCH",
    payload: { userId: lee.user.id, remove: true }
  })).response.status, 403);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/state`, {
    method: "PATCH",
    payload: { userId: sam.user.id, remove: true }
  })).response.status, 200);
  const removedSam = database.prepare(`
    SELECT left_at, removed_at, removed_by, restored_at, restored_by
    FROM meeting_participants WHERE meeting_id = ? AND user_id = ?
  `).get(meetingId, sam.user.id);
  assert.ok(removedSam.left_at);
  assert.ok(removedSam.removed_at);
  assert.equal(removedSam.removed_by, owner.user.id);
  assert.equal(removedSam.restored_at, null);
  assert.equal(removedSam.restored_by, null);
  for (const [path, options] of [
    [`/api/community/meetings/${meetingId}`, {}],
    [`/api/community/meetings/${meetingId}/signals`, {}],
    [`/api/community/meetings/${meetingId}/translate`, { method: "POST", payload: { text: "hello", targetLanguage: "es" } }],
    [`/api/community/meetings/${meetingId}/state`, { method: "PATCH", payload: { raisedHand: true } }],
    [`/api/community/meetings/${meetingId}/whiteboard`, {}],
    [`/api/community/meetings/${meetingId}/messages`, {}],
    [`/api/community/meetings/${meetingId}/polls`, { method: "POST", payload: { question: "Blocked?", options: ["Yes", "No"] } }],
    [`/api/community/meetings/${meetingId}/invitations`, {}],
    [`/api/community/meeting-messages/${meetingMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } }],
    [`/api/community/polls/${poll.data.poll.id}/vote`, { method: "POST", payload: { optionIndex: 0 } }]
  ]) {
    assert.equal((await request(sam, path, options)).response.status, 403, path);
  }
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 403);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/state`, {
    method: "PATCH",
    payload: { userId: sam.user.id, restore: true }
  })).response.status, 403);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/state`, {
    method: "PATCH",
    payload: { userId: sam.user.id, restore: true }
  })).response.status, 200);
  const restoredSam = database.prepare(`
    SELECT left_at, removed_at, removed_by, restored_at, restored_by
    FROM meeting_participants WHERE meeting_id = ? AND user_id = ?
  `).get(meetingId, sam.user.id);
  assert.ok(restoredSam.left_at);
  assert.ok(restoredSam.removed_at);
  assert.equal(restoredSam.removed_by, owner.user.id);
  assert.ok(restoredSam.restored_at);
  assert.equal(restoredSam.restored_by, owner.user.id);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}`)).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/messages`)).response.status, 403);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await request(sam, `/api/community/meetings/${meetingId}`)).response.status, 200);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/invitations`, {
    method: "DELETE",
    payload: { invitationId: leeInvitation.id }
  })).response.status, 200);
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}`)).response.status, 404);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/invitations`, {
    method: "POST",
    payload: { recipientIds: [lee.user.id] }
  })).response.status, 200);
  assert.equal((await request(owner, `/api/community/blocks/${lee.user.id}`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}`)).response.status, 404);
  assert.equal((await request(lee, `/api/community/meetings/${meetingId}/join`, { method: "POST", payload: {} })).response.status, 404);
  assert.equal((await request(owner, `/api/community/meetings/${meetingId}/end`, { method: "POST", payload: {} })).response.status, 200);
  assert.equal(database.prepare("SELECT status FROM meeting_invitations WHERE id = ?").get(leeInvitation.id).status, "ended");
  for (const [path, options] of [
    [`/api/community/meetings/${meetingId}`, {}],
    [`/api/community/meetings/${meetingId}/signals`, {}],
    [`/api/community/meetings/${meetingId}/whiteboard`, {}],
    [`/api/community/meetings/${meetingId}/messages`, {}],
    [`/api/community/meeting-messages/${meetingMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } }],
    [`/api/community/polls/${poll.data.poll.id}/vote`, { method: "POST", payload: { optionIndex: 0 } }]
  ]) {
    assert.equal((await request(owner, path, options)).response.status, 404, path);
  }
  await flushPending();
  database.close();
});

test("recommendation API applies diagnosis and category before scoring database rows", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const env = cloudflareEnv(database);
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Filter User", email: "filter@example.com", password: "safe-password" })
  }), env, ctx);
  const cookie = register.headers.get("set-cookie").split(";")[0];
  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1", "Tag2", "Tag3", "Tag4", "Tag5"];
  const row = (url, description, diagnosis, category, tag) => ({ c: [url, description, diagnosis, category, "", "All ages", tag, "", "", "", ""].map((v) => ({ v })) });
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    row("https://example.com/allowed", "Medicaid legal assistance", "Autism", "Legal", "Medicaid"),
    row("https://example.com/wrong-diagnosis", "Medicaid legal assistance", "ADHD", "Legal", "Medicaid"),
    row("https://example.com/wrong-category", "Medicaid legal assistance", "Autism", "Education", "Medicaid"),
    row("https://example.com/education-law", "Education rights and IEP advocacy", "ADHD", "Legal", "Education"),
    row("https://example.com/general-education", "Education tutoring and IEP study support", "Autism", "Education", "Education"),
    row("https://example.com/support", "Affordable family respite support", "Autism", "Caregiver Support", "Respite")
  ] } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
  try {
    const response = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Medicaid assistance", count: 5, clarificationHandled: true })
    }), env, ctx);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.resources.map((item) => item.url), ["https://example.com/allowed"]);
    assert.deepEqual(result.resources[0].passedFilters, ["Diagnosis: Autism", "Category: Legal", "Description gate"]);
    assert.deepEqual(result.followUpQuestions, []);

    const preciseResponse = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Medicaid assistance", count: 5, allowFollowUpQuestions: true })
    }), env, ctx);
    assert.equal(preciseResponse.status, 200);
    assert.ok((await preciseResponse.json()).followUpQuestions.length > 0);

    const profileResponse = await worker.fetch(new Request("https://village.example/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ responses: { interests: ["IEP"], age: "13-18", journey: "Exploring", situation: ["School planning"], note: "Need advocacy" } })
    }), env, ctx);
    assert.equal(profileResponse.status, 200);

    const personalResponse = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ topic: "Legal", description: "education rights guidance", count: 5, usePersonalRecord: true })
    }), env, ctx);
    assert.equal(personalResponse.status, 200);
    const personal = await personalResponse.json();
    assert.deepEqual(personal.resources.map((item) => item.url), ["https://example.com/education-law"]);
    assert.equal(personal.researchContext.diagnosis, "");
    assert.equal(personal.researchContext.category, "Legal");
    assert.equal(personal.researchContext.personalRecordMode, true);
    assert.ok(personal.researchContext.confirmedKeywords.includes("iep"));
    assert.ok(personal.resources[0].passedFilters.includes("Personal record"));
    assert.equal(personal.resources[0].passedFilters.some((filter) => filter.startsWith("Diagnosis:")), false);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("personal journey persists while document importing and review are suspended", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const env = cloudflareEnv(database, { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" });
  const register = await worker.fetch(new Request("https://village.example/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Journey User", email: "journey@example.com", password: "safe-password" })
  }), env, ctx);
  const cookie = register.headers.get("set-cookie").split(";")[0];
  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "Location1", "Location2", "Location3", "Location4", "Issues", "Unused", "Price", "Resource Name"];
  const row = (name, url, description, diagnosis, category, tags, price = "") => ({ c: [url, description, diagnosis, category, "", "All ages", ...[...tags, "", "", "", "", ""].slice(0, 5), "", "", "", "", "", "", price, name].map((v) => ({ v })) });
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    row("Autism learning", "https://example.com/autism-learning", "School learning support with Medicaid", "Autism", "Education", ["school", "learning", "Medicaid"], "Medicaid accepted"),
    row("ADHD learning", "https://example.com/adhd-learning", "School learning support", "ADHD", "Education", ["school", "learning"]),
    row("Advocacy help", "https://example.com/advocacy", "Rights accommodations advocacy", "Both", "Legal", ["rights", "accommodations"]),
    row("Peer group", "https://example.com/peer", "Peer community friendship activities", "Both", "Recreation", ["peer", "community"])
  ] } };
  const originalFetch = globalThis.fetch;
  let scanRequest;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("docs.google.com/spreadsheets")) return new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
    if (String(url) === "https://api.openai.com/v1/responses") {
      const requestBody = JSON.parse(options.body);
      if (requestBody.text?.format?.name === "personal_record_document") {
        scanRequest = requestBody;
        return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
          documentType: "diagnosis",
          summary: "Autism is explicitly recorded. The insurance plan is Medicaid.",
          diagnoses: [{ name: "Autism", status: "confirmed" }],
          insurance: { provider: "Example Health", planName: "Community Plan", planType: "Medicaid", networkType: "HMO", coveragePrograms: ["Behavioral health"], effectiveDate: "2026-01-01", expirationDate: "" },
          accommodations: ["Extra processing time"],
          supportNeeds: ["Clear instructions"],
          confidence: "high",
          warnings: []
        }) }] }] });
      }
      return Response.json({ output: [{ content: [{ type: "output_text", text: "Waffles found matching resources." }] }] });
    }
    return originalFetch(url, options);
  };
  try {
    const journeyResponse = await worker.fetch(new Request("https://village.example/api/profile/journey", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ journey: {
        pathway: "young-person",
        strengths: ["Creative", "Persistent"],
        goal: "Feeling more confident at school",
        helps: { learnBetterWhen: "instructions are clear", overwhelmedWhen: "too much information", helpsMe: "a break", wishPeopleUnderstood: "I need processing time" }
      } })
    }), env, ctx);
    assert.equal(journeyResponse.status, 200);
    const journeyResult = await journeyResponse.json();
    assert.match(journeyResult.user.profile.journey.aboutMe, /^I’m creative and persistent/);
    assert.deepEqual(journeyResult.user.profile.reachPlan.steps.map((step) => step.type), ["Learn", "Advocate", "Connect"]);

    const dataUrl = `data:image/png;base64,${Buffer.from("record-image").toString("base64")}`;
    const scanResponse = await worker.fetch(new Request("https://village.example/api/profile/documents/scan", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name: "assessment.png", mime: "image/png", size: 12, kind: "diagnosis", dataUrl })
    }), env, ctx);
    assert.equal(scanResponse.status, 410);
    assert.match((await scanResponse.json()).error, /temporarily unavailable/i);
    assert.equal(scanRequest, undefined);

    const recommendation = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ topic: "Education", description: "school learning support", count: 5, usePersonalRecord: true })
    }), env, ctx);
    assert.equal(recommendation.status, 200);
    const matched = await recommendation.json();
    assert.equal(matched.researchContext.diagnosis, "");
    assert.equal(matched.researchContext.personalRecordMode, true);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("administrator blocklist removes noisy primary keywords from scoring and Error sheet records", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const env = cloudflareEnv(database, { ERROR_SHEET_WEBHOOK_URL: "https://error.example/sync", ERROR_SHEET_GID: "1952899933" });
  const register = async (name, email) => {
    const response = await worker.fetch(new Request("https://village.example/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: "safe-password" })
    }), env, ctx);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const adminCookie = await register("Owner", "yanyanweiyue@gmail.com");
  const userCookie = await register("Search User", "keyword-filter@example.com");
  const saved = await worker.fetch(new Request("https://village.example/api/admin/primary-keyword-blocklist", {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ text: "waffles\nassistance" })
  }), env, ctx);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).keywords, ["waffle", "assistance"]);

  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1", "Tag2"];
  const row = (url, description, diagnosis, category, tag) => ({ c: [url, description, diagnosis, category, "", "All ages", tag, ""].map((v) => ({ v })) });
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    row("https://example.com/allowed", "Medicaid legal assistance", "Autism", "Legal", "Medicaid")
  ] } };
  const errorPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("docs.google.com/spreadsheets")) return new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
    if (String(url).includes("error.example")) { errorPayloads.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    return originalFetch(url, options);
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Waffles Medicaid assistance", count: 5 })
    }), env, ctx);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.researchContext.primaryKeywords, ["medicaid"]);
    assert.equal(errorPayloads[0]["Primary Keywords"], "medicaid");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
