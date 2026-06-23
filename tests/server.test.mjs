import test, { after } from "node:test";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { createServer as createHttpServer, request } from "node:http";
import { fileURLToPath } from "node:url";
import { createAppServer } from "../server.mjs";

const usersFile = fileURLToPath(new URL("../data/users.json", import.meta.url));
after(async () => { await unlink(usersFile).catch(() => {}); });

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { ...options, headers: { Connection: "close", ...(options.headers || {}) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test("health endpoint and homepage are available", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const health = JSON.parse((await httpRequest(`http://127.0.0.1:${port}/api/health`)).text);
    assert.equal(health.ok, true);
    assert.equal(typeof health.openaiConfigured, "boolean");

    const homepage = (await httpRequest(`http://127.0.0.1:${port}/`)).text;
    assert.match(homepage, /Capy Village/);
    assert.match(homepage, /auth-form/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("registration never returns a password hash", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const email = `test-${Date.now()}@example.com`;
    const body = JSON.stringify({ name: "Test User", email, password: "safe-password" });
    const response = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      body
    });
    const data = JSON.parse(response.text);
    assert.equal(response.status, 201);
    assert.equal(data.user.email, email);
    assert.equal("passwordHash" in data.user, false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("registration and survey automatically send the expected Google Sheet fields", async () => {
  const received = [];
  const webhook = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, row: 2 }));
  });
  await new Promise((resolve) => webhook.listen(0, "127.0.0.1", resolve));
  process.env.USER_SHEET_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}`;

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const email = `sheet-${Date.now()}@example.com`;
    const registerBody = JSON.stringify({ name: "Sheet Test", email, password: "safe-password" });
    const register = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(registerBody) },
      body: registerBody
    });
    assert.equal(register.status, 201);
    assert.equal(received[0]["User name"], "Sheet Test");
    assert.equal(received[0]["Password"], "Not stored — secure hash only");

    const profileBody = JSON.stringify({ responses: { interests: ["Autism"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"], note: "IEP support" } });
    const profile = await httpRequest(`http://127.0.0.1:${port}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(profileBody),
        Cookie: register.headers["set-cookie"][0].split(";")[0]
      },
      body: profileBody
    });
    assert.equal(profile.status, 200);
    assert.match(received[1]["response of survey"], /Autism/);
    assert.match(received[1]["AI personal record"], /Exploring Autism/);
  } finally {
    delete process.env.USER_SHEET_WEBHOOK_URL;
    server.closeAllConnections();
    webhook.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => webhook.close(resolve))
    ]);
  }
});
