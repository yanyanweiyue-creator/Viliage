import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { createServer as createHttpServer, request } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

const usersFile = join(tmpdir(), `capy-village-test-users-${process.pid}.json`);
const sessionsFile = join(tmpdir(), `capy-village-test-sessions-${process.pid}.json`);
const communityFile = join(tmpdir(), `capy-village-test-community-${process.pid}.json`);
const passwordResetsFile = join(tmpdir(), `capy-village-test-password-resets-${process.pid}.json`);
process.env.USERS_FILE = usersFile;
process.env.SESSIONS_FILE = sessionsFile;
process.env.COMMUNITY_FILE = communityFile;
process.env.PASSWORD_RESETS_FILE = passwordResetsFile;
process.env.PASSWORD_RESET_SECRET = "local-test-reset-secret";
const { createAppServer } = await import("../server.mjs");
after(async () => {
  await Promise.all([unlink(usersFile).catch(() => {}), unlink(sessionsFile).catch(() => {}), unlink(communityFile).catch(() => {}), unlink(passwordResetsFile).catch(() => {})]);
});

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
    assert.match(homepage, /It Takes a Village/);
    assert.match(homepage, /auth-form/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local guest entry is temporary and Community stays registered-only", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const guest = await httpRequest(`http://127.0.0.1:${port}/api/auth/guest`, { method: "POST" });
    assert.equal(guest.status, 200);
    assert.equal(JSON.parse(guest.text).user.guest, true);
    assert.equal(guest.headers["set-cookie"], undefined);
    const community = await httpRequest(`http://127.0.0.1:${port}/api/community`, { headers: { "X-Village-Guest": "1" } });
    assert.equal(community.status, 403);
    assert.match(JSON.parse(community.text).error, /registered members only/i);
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

test("local password reset sends a code and accepts only the new password", async () => {
  let mailedCode = "";
  const webhook = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    mailedCode = JSON.parse(Buffer.concat(chunks).toString("utf8")).code;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, delivered: true }));
  });
  await new Promise((resolve) => webhook.listen(0, "127.0.0.1", resolve));
  process.env.PASSWORD_EMAIL_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}`;
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const email = `password-reset-${Date.now()}@example.com`;
    const registerBody = JSON.stringify({ name: "Password Reset", email, password: "old-password" });
    const register = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(registerBody) }, body: registerBody });
    assert.equal(register.status, 201);
    const requestBody = JSON.stringify({ email });
    const resetRequest = await httpRequest(`http://127.0.0.1:${port}/api/auth/password/request`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody) }, body: requestBody });
    assert.equal(resetRequest.status, 202);
    assert.match(mailedCode, /^\d{6}$/);
    const confirmBody = JSON.stringify({ email, code: mailedCode, password: "new-password" });
    const confirmed = await httpRequest(`http://127.0.0.1:${port}/api/auth/password/confirm`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(confirmBody) }, body: confirmBody });
    assert.equal(confirmed.status, 200);
    const login = async (password) => {
      const body = JSON.stringify({ email, password });
      return httpRequest(`http://127.0.0.1:${port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body });
    };
    assert.equal((await login("old-password")).status, 401);
    assert.equal((await login("new-password")).status, 200);
  } finally {
    delete process.env.PASSWORD_EMAIL_WEBHOOK_URL;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => webhook.close(resolve));
  }
});

test("an existing session remains valid after the server module restarts", async () => {
  const firstServer = createAppServer();
  await new Promise((resolve) => firstServer.listen(0, "127.0.0.1", resolve));
  const firstPort = firstServer.address().port;
  const email = `restart-${Date.now()}@example.com`;
  const registerBody = JSON.stringify({ name: "Restart Test", email, password: "safe-password" });
  const register = await httpRequest(`http://127.0.0.1:${firstPort}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(registerBody) },
    body: registerBody
  });
  const cookie = register.headers["set-cookie"][0].split(";")[0];
  const rawToken = cookie.split("=")[1];
  firstServer.closeAllConnections();
  await new Promise((resolve) => firstServer.close(resolve));

  const savedSessions = await readFile(sessionsFile, "utf8");
  assert.doesNotMatch(savedSessions, new RegExp(rawToken));

  const restartedModule = await import(`../server.mjs?restart=${Date.now()}`);
  const secondServer = restartedModule.createAppServer();
  await new Promise((resolve) => secondServer.listen(0, "127.0.0.1", resolve));
  try {
    const me = await httpRequest(`http://127.0.0.1:${secondServer.address().port}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal(JSON.parse(me.text).user.email, email);
  } finally {
    secondServer.closeAllConnections();
    await new Promise((resolve) => secondServer.close(resolve));
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
    assert.equal(JSON.parse(register.text).user.onboardingCompleted, false);
    assert.equal(received[0]["User name"], "Sheet Test");
    assert.equal(received[0]["Password"], "Not stored — secure hash only");
    assert.equal(received[0]["Email"], email);
    assert.equal(received[0]["response of survey"], "{}");
    assert.equal(received[0]["AI personal record"], "");
    assert.equal(received[0]["history"], "[]");
    assert.equal(received[0]["feedback"], "");
    assert.equal(received[0]["Chat History"], "[]");
    assert.equal(received[0]["Save resource"], "[]");
    assert.equal(received[0]["Like resource"], "[]");
    assert.equal(received[0]["Dislike resource"], "[]");

    const onboarding = await httpRequest(`http://127.0.0.1:${port}/api/onboarding/complete`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: register.headers["set-cookie"][0].split(";")[0] }, body: "{}" });
    assert.equal(onboarding.status, 200);
    assert.equal(JSON.parse(onboarding.text).user.onboardingCompleted, true);

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
    assert.equal(received[1]["Email"], email);
    assert.deepEqual(Object.keys(received[1]).filter((key) => key !== "userId").sort(), ["AI personal record", "Chat History", "Dislike resource", "Email", "Like resource", "Password", "Save resource", "User name", "feedback", "history", "response of survey"].sort());

    const feedbackBody = JSON.stringify({ feedback: "Please keep the calmer map controls." });
    const feedback = await httpRequest(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(feedbackBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: feedbackBody
    });
    assert.equal(feedback.status, 200);
    assert.equal(JSON.parse(feedback.text).sync.synced, true);
    assert.equal(received[2].feedback, "Please keep the calmer map controls.");

    const likeBody = JSON.stringify({ resource: { name: "Inclusive Resource", url: "https://example.org/resource", description: "A calm support listing.", topic: "Education", score: 42 }, liked: true });
    const like = await httpRequest(`http://127.0.0.1:${port}/api/resources/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(likeBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: likeBody
    });
    assert.equal(like.status, 200);
    const likeResult = JSON.parse(like.text);
    assert.equal(likeResult.likedResources[0].name, "Inclusive Resource");
    assert.match(received[3]["Save resource"], /Inclusive Resource/);
    assert.match(received[3]["Like resource"], /Inclusive Resource/);
    assert.equal(received[3]["Dislike resource"], "[]");

    const unlikeBody = JSON.stringify({ resource: { name: "Inclusive Resource", url: "https://example.org/resource" }, liked: false });
    const unlike = await httpRequest(`http://127.0.0.1:${port}/api/resources/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(unlikeBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: unlikeBody
    });
    assert.equal(unlike.status, 200);
    assert.equal(JSON.parse(unlike.text).likedResources.length, 0);
    assert.equal(received[4]["Save resource"], "[]");

    const dislikeBody = JSON.stringify({ resource: { name: "Inclusive Resource", url: "https://example.org/resource", description: "A calm support listing.", topic: "Education", score: 42 }, disliked: true });
    const dislike = await httpRequest(`http://127.0.0.1:${port}/api/resources/dislike`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dislikeBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: dislikeBody
    });
    assert.equal(dislike.status, 200);
    const dislikeResult = JSON.parse(dislike.text);
    assert.equal(dislikeResult.likedResources.length, 0);
    assert.equal(dislikeResult.dislikedResources[0].name, "Inclusive Resource");
    assert.equal(received[5]["Save resource"], "[]");
    assert.match(received[5]["Dislike resource"], /Inclusive Resource/);

    const cookie = register.headers["set-cookie"][0].split(";")[0];
    for (const [path, requestBody] of [
      ["/api/community/settings", { enabled: true, displayName: "Sheet Test" }],
      ["/api/community/rooms/group-general/join", {}],
      ["/api/community/rooms/group-general/messages", { message: "A sheet-synced hello" }]
    ]) {
      const communityResponse = await httpRequest(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(requestBody)
      });
      assert.ok([200, 201].includes(communityResponse.status));
    }
    const latestSheetWrite = received.at(-1);
    assert.match(latestSheetWrite["Chat History"], /A sheet-synced hello/);
    assert.match(latestSheetWrite["Chat History"], /Village Commons/);
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

test("resource shortages and dislikes are appended to the Error database webhook", async () => {
  const errorRows = [];
  const webhook = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    errorRows.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, row: errorRows.length + 1 }));
  });
  await new Promise((resolve) => webhook.listen(0, "127.0.0.1", resolve));
  process.env.ERROR_SHEET_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}`;
  process.env.ERROR_SHEET_GID = "1952899933";

  const originalFetch = globalThis.fetch;
  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1"];
  const row = (url, description, diagnosis, category, tag) => ({ c: [url, description, diagnosis, category, "", "All ages", tag].map((v) => ({ v })) });
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    row("https://example.com/wrong-diagnosis", "Medicaid legal assistance", "ADHD", "Legal", "Medicaid"),
    row("https://example.com/wrong-category", "Medicaid legal assistance", "Autism", "Education", "Medicaid")
  ] } };
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("docs.google.com/spreadsheets")) {
      return new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
    }
    return originalFetch(url, options);
  };

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const registerBody = JSON.stringify({ name: "Error Logger", email: `error-${Date.now()}@example.com`, password: "safe-password" });
    const register = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(registerBody) },
      body: registerBody
    });
    assert.equal(register.status, 201);
    const cookie = register.headers["set-cookie"][0].split(";")[0];

    const recommendBody = JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Medicaid assistance", count: 5, clarificationHandled: true });
    const recommend = await httpRequest(`http://127.0.0.1:${port}/api/ai/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(recommendBody), Cookie: cookie },
      body: recommendBody
    });
    assert.equal(recommend.status, 200);
    const result = JSON.parse(recommend.text);
    assert.equal(result.resources.length, 0);
    assert.deepEqual(errorRows.slice(0, 2).map((entry) => entry.Event), ["insufficient_resources", "insufficient_high_score_resources"]);
    assert.equal(errorRows[0].spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(errorRows[0].sheetGid, "1952899933");
    assert.equal(errorRows[0].Helpful, "No");
    assert.equal(errorRows[0].helpful, "No");
    assert.equal(errorRows[1]["Requested resources"], 5);
    assert.equal(errorRows[1]["High score resources"], 0);

    const dislikeBody = JSON.stringify({ resource: { name: "Not Useful Resource", url: "https://example.org/not-useful", description: "Not the right fit.", topic: "Education", score: 12 }, disliked: true });
    const dislike = await httpRequest(`http://127.0.0.1:${port}/api/resources/dislike`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dislikeBody), Cookie: cookie },
      body: dislikeBody
    });
    assert.equal(dislike.status, 200);
    assert.equal(errorRows[2].Event, "resource_disliked");
    assert.equal(errorRows[2]["Resource name"], "Not Useful Resource");
    assert.equal(errorRows[2].Helpful, "No");
  } finally {
    delete process.env.ERROR_SHEET_WEBHOOK_URL;
    delete process.env.ERROR_SHEET_GID;
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    webhook.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => webhook.close(resolve))
    ]);
  }
});
