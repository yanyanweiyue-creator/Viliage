import test, { after } from "node:test";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createAppServer } from "../server.mjs";

const usersFile = fileURLToPath(new URL("../data/users.json", import.meta.url));
after(async () => { await unlink(usersFile).catch(() => {}); });

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { ...options, headers: { Connection: "close", ...(options.headers || {}) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
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
