import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import worker from "../cloudflare/worker.mjs";

class FakeD1Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new FakeD1Statement(this.database, this.sql, values); }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes || 0) }, results: [] };
  }
}

class FakeD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new FakeD1Statement(this.database, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

function cloudflareEnv(database) {
  return { DB: new FakeD1(database), ASSETS: { fetch: async () => new Response("asset") } };
}

const ctx = { waitUntil(promise) { promise.catch(() => {}); } };

test("Cloudflare D1 migration creates durable account and session tables", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile(new URL("../migrations/0001_persistent_accounts.sql", import.meta.url), "utf8"));
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sessions', 'app_meta') ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ["app_meta", "sessions", "users"]);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, "1");
  database.close();
});

test("Cloudflare Worker exposes D1-backed health status", async () => {
  const response = await worker.fetch(new Request("https://village.example/api/health"), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.storage, "cloudflare-d1");
});

test("Cloudflare account and hashed session remain usable independently of code deployment", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(await readFile(new URL("../migrations/0001_persistent_accounts.sql", import.meta.url), "utf8"));
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
  assert.notEqual(database.prepare("SELECT token_hash FROM sessions").get().token_hash, rawToken);

  const me = await worker.fetch(new Request("https://village.example/api/auth/me", { headers: { Cookie: cookie } }), cloudflareEnv(database), ctx);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "cloud@example.com");

  const login = await worker.fetch(new Request("https://village.example/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cloud@example.com", password: "safe-password" })
  }), cloudflareEnv(database), ctx);
  assert.equal(login.status, 200);
  database.close();
});
