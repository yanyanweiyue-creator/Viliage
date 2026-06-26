import test from "node:test";
import assert from "node:assert/strict";
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
  return { DB: new FakeD1(database), ASSETS: { fetch: async () => new Response("asset") }, ...extra };
}

const ctx = { waitUntil(promise) { promise.catch(() => {}); } };

async function applyAccountSchema(database) {
  database.exec(await readFile(new URL("../migrations/0001_persistent_accounts.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0006_new_user_onboarding.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0007_liked_resources.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0008_disliked_resources.sql", import.meta.url), "utf8"));
}

test("Cloudflare D1 migration creates durable account and session tables", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sessions', 'app_meta') ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ["app_meta", "sessions", "users"]);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "8");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'onboarding_completed'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'liked_resources_json'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'disliked_resources_json'").get().count, 1);
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
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'chat_%' ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ["chat_blocks", "chat_connections", "chat_group_invitations", "chat_members", "chat_messages", "chat_room_preferences", "chat_rooms"]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE kind = 'group'").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chat_rooms WHERE system_managed = 1").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'password_reset_codes'").get().count, 1);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "8");
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

test("Cloudflare feedback waits for and verifies the User data sheet update", async () => {
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
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (String(url).includes("error.example")) {
      errorPayloads.push(payload);
    } else {
      sheetPayload = payload;
    }
    return Response.json({ ok: true, row: 7 });
  };
  try {
    const response = await worker.fetch(new Request("https://village.example/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ feedback: "The island guide was helpful." })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync" }), ctx);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.sync.synced, true);
    assert.equal(result.sync.row, 7);
    assert.equal(sheetPayload.feedback, "The island guide was helpful.");
    assert.equal(sheetPayload.Email, "feedback@example.com");

    const likeResponse = await worker.fetch(new Request("https://village.example/api/resources/like", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ resource: { name: "Saved Resource", url: "https://example.com/saved", description: "Helpful listing.", topic: "Support", score: 31 }, liked: true })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync" }), ctx);
    assert.equal(likeResponse.status, 200);
    const likeResult = await likeResponse.json();
    assert.equal(likeResult.likedResources[0].name, "Saved Resource");
    assert.match(sheetPayload["Save resource"], /Saved Resource/);
    assert.match(sheetPayload["Like resource"], /Saved Resource/);
    assert.equal(sheetPayload["Dislike resource"], "[]");

    const dislikeResponse = await worker.fetch(new Request("https://village.example/api/resources/dislike", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ resource: { name: "Saved Resource", url: "https://example.com/saved", description: "Helpful listing.", topic: "Support", score: 31 }, disliked: true })
    }), cloudflareEnv(database, { USER_SHEET_WEBHOOK_URL: "https://sheet.example/sync", ERROR_SHEET_WEBHOOK_URL: "https://error.example/sync", ERROR_SHEET_GID: "1952899933" }), ctx);
    assert.equal(dislikeResponse.status, 200);
    const dislikeResult = await dislikeResponse.json();
    assert.equal(dislikeResult.likedResources.length, 0);
    assert.equal(dislikeResult.dislikedResources[0].name, "Saved Resource");
    assert.equal(sheetPayload["Save resource"], "[]");
    assert.match(sheetPayload["Dislike resource"], /Saved Resource/);
    assert.equal(errorPayloads[0].Event, "resource_disliked");
    assert.equal(errorPayloads[0].spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(errorPayloads[0].sheetGid, "1952899933");
    assert.equal(errorPayloads[0].Helpful, "No");
    assert.equal(errorPayloads[0]["Resource name"], "Saved Resource");
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

test("opted-in users can connect, accept, and exchange a private D1 message", async () => {
  const database = new DatabaseSync(":memory:");
  await applyAccountSchema(database);
  database.exec(await readFile(new URL("../migrations/0002_community_chat.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0003_community_controls.sql", import.meta.url), "utf8"));
  database.exec(await readFile(new URL("../migrations/0004_group_invitations.sql", import.meta.url), "utf8"));
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
  const messages = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { headers: { Cookie: second.cookie } }), env, ctx);
  assert.equal((await messages.json()).messages[0].body, "[[sticker:wave]]");
  database.close();
});

test("community controls isolate history, restrict moments to friends, and enforce blocks", async () => {
  const database = new DatabaseSync(":memory:");
  for (const migration of ["0001_persistent_accounts.sql", "0002_community_chat.sql", "0003_community_controls.sql", "0004_group_invitations.sql", "0006_new_user_onboarding.sql", "0007_liked_resources.sql", "0008_disliked_resources.sql"]) database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
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
  const rejectedLanguage = await worker.fetch(new Request(`https://village.example/api/community/rooms/${roomId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sam.cookie }, body: JSON.stringify({ message: "go die" }) }), env, ctx);
  assert.equal(rejectedLanguage.status, 400);
  assert.match((await rejectedLanguage.json()).error, /harmful|abusive/i);
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
    const supportResponse = await worker.fetch(new Request("https://village.example/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ topic: "Caregiver Support", diagnosis: "Autism", description: "Affordable family respite support", count: 5, clarificationHandled: true })
    }), env, ctx);
    assert.equal(supportResponse.status, 200);
    const supportResult = await supportResponse.json();
    assert.deepEqual(supportResult.resources.map((item) => item.url), ["https://example.com/support"]);
    assert.equal(supportResult.resources[0].passedFilters[1], "Category: Caregiver Support");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
