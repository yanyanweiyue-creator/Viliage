import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, request } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

const usersFile = join(tmpdir(), `capy-village-test-users-${process.pid}.json`);
const sessionsFile = join(tmpdir(), `capy-village-test-sessions-${process.pid}.json`);
const communityFile = join(tmpdir(), `capy-village-test-community-${process.pid}.json`);
const passwordResetsFile = join(tmpdir(), `capy-village-test-password-resets-${process.pid}.json`);
const userCountFile = join(tmpdir(), `capy-village-test-user-counts-${process.pid}.json`);
const primaryKeywordBlocklistFile = join(tmpdir(), `capy-village-test-primary-keywords-${process.pid}.json`);
process.env.USERS_FILE = usersFile;
process.env.SESSIONS_FILE = sessionsFile;
process.env.COMMUNITY_FILE = communityFile;
process.env.PASSWORD_RESETS_FILE = passwordResetsFile;
process.env.USER_COUNT_FILE = userCountFile;
process.env.USER_COUNT_SYNC_INTERVAL_MS = "100";
process.env.RESOURCE_CACHE_TTL_MS = "0";
process.env.PRIMARY_KEYWORD_BLOCKLIST_FILE = primaryKeywordBlocklistFile;
process.env.PASSWORD_RESET_SECRET = "local-test-reset-secret";
process.env.SHEET_WEBHOOK_SECRET = "test-sheet-webhook-secret";
const { createAppServer } = await import("../server.mjs");
after(async () => {
  await Promise.all([unlink(usersFile).catch(() => {}), unlink(sessionsFile).catch(() => {}), unlink(communityFile).catch(() => {}), unlink(passwordResetsFile).catch(() => {}), unlink(userCountFile).catch(() => {}), unlink(primaryKeywordBlocklistFile).catch(() => {})]);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

test("Google Sheet resource fetch pins the header row for live sync", async () => {
  const [serverCode, workerCode] = await Promise.all([
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/worker.mjs", import.meta.url), "utf8")
  ]);
  assert.match(serverCode, /const RESOURCE_SHEET_ID = process\.env\.RESOURCE_SHEET_ID \|\| "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0"/);
  assert.match(serverCode, /const RESOURCE_SHEET_GID = process\.env\.RESOURCE_SHEET_GID \|\| "1709372674"/);
  assert.match(workerCode, /const DEFAULT_RESOURCE_SHEET_ID = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0"/);
  assert.match(workerCode, /const DEFAULT_RESOURCE_SHEET_GID = "1709372674"/);
  assert.match(serverCode, /gviz\/tq\?tqx=out:json&gid=\$\{encodeURIComponent\(RESOURCE_SHEET_GID\)\}&headers=1/);
  assert.match(workerCode, /gviz\/tq\?tqx=out:json&gid=\$\{encodeURIComponent\(gid\)\}&headers=1/);
});

test("local atomic JSON writes use a unique temporary file per request", async () => {
  const serverCode = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(serverCode, /process\.pid\}\.\$\{Date\.now\(\)\}\.\$\{randomBytes\(6\)\.toString\("hex"\)\}\.tmp/);
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
    assert.equal(received[0].action, "upsert-user");
    assert.equal(received[0].webhookSecret, "test-sheet-webhook-secret");
    assert.equal(received[0].spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(received[0].sheetGid, "1080069851");
    assert.match(received[0]["Unique User ID"], /^[a-f0-9]{24}$/);
    assert.equal(received[0]["Username"], "Sheet Test");
    assert.equal(received[0]["Password"], "Not stored — secure hash only");
    assert.equal(received[0]["Email"], email);
    assert.equal(received[0]["Summary of Survey Response"], "");
    assert.equal(received[0]["Survey Response (Unedited)"], "{}");
    assert.equal(received[0]["Summary of Search History"], "[]");
    assert.equal(received[0]["Save Resource"], "[]");
    assert.equal(received[0]["Dislike Resource"], "[]");

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
    assert.match(received[1]["Survey Response (Unedited)"], /Autism/);
    assert.match(received[1]["Summary of Survey Response"], /Exploring Autism/);
    assert.equal(received[1]["Email"], email);
    assert.deepEqual(Object.keys(received[1]).sort(), [
      "action",
      "webhookSecret",
      "spreadsheetId",
      "sheetGid",
      "Unique User ID",
      "Email",
      "Username",
      "Password",
      "Summary of Survey Response",
      "Survey Response (Unedited)",
      "Summary of Search History",
      "Save Resource",
      "Dislike Resource"
    ].sort());

    const feedbackBody = JSON.stringify({ feedback: "Please keep the calmer map controls." });
    const feedback = await httpRequest(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(feedbackBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: feedbackBody
    });
    assert.equal(feedback.status, 200);
    assert.equal(JSON.parse(feedback.text).sync.synced, true);
    assert.equal(received[2].action, "record-feedback");
    assert.equal(received[2].sheetGid, "0");
    assert.equal(received[2].Feedback, "Please keep the calmer map controls.");
    assert.equal(received[2]["Star(1-5)"], "");
    assert.equal(received[2]["Helpful / Nonhelpful"], "");

    const likeBody = JSON.stringify({ resource: { name: "Inclusive Resource", url: "https://example.org/resource", description: "A calm support listing.", topic: "Education", score: 42 }, liked: true });
    const like = await httpRequest(`http://127.0.0.1:${port}/api/resources/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(likeBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: likeBody
    });
    assert.equal(like.status, 200);
    const likeResult = JSON.parse(like.text);
    assert.equal(likeResult.likedResources[0].name, "Inclusive Resource");
    assert.match(received[3]["Save Resource"], /Inclusive Resource/);
    assert.equal("Like resource" in received[3], false);
    assert.equal(received[3]["Dislike Resource"], "[]");

    const unlikeBody = JSON.stringify({ resource: { name: "Inclusive Resource", url: "https://example.org/resource" }, liked: false });
    const unlike = await httpRequest(`http://127.0.0.1:${port}/api/resources/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(unlikeBody), Cookie: register.headers["set-cookie"][0].split(";")[0] },
      body: unlikeBody
    });
    assert.equal(unlike.status, 200);
    assert.equal(JSON.parse(unlike.text).likedResources.length, 0);
    assert.equal(received[4]["Save Resource"], "[]");

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
    assert.equal(received[5]["Save Resource"], "[]");
    assert.match(received[5]["Dislike Resource"], /Inclusive Resource/);

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
    assert.equal(latestSheetWrite.action, "upsert-user");
    assert.equal("Chat History" in latestSheetWrite, false);
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

test("hourly user count sync fills the User Count sheet with numeric metrics only", async () => {
  await unlink(userCountFile).catch(() => {});
  await writeFile(userCountFile, JSON.stringify({
    "2026-07-24": {
      "Total Guest Sessions": 2,
      "Total Accounts Created": 1,
      "Total Searches Completed": 4,
      "__recommendation_usefulness_score_total": 6,
      "__recommendation_usefulness_response_count": 2
    }
  }));
  const received = [];
  const webhook = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, row: 2 }));
  });
  await new Promise((resolve) => webhook.listen(0, "127.0.0.1", resolve));
  process.env.USER_COUNT_SHEET_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}`;
  process.env.FEEDBACK_SHEET_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}`;

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const guest = await httpRequest(`http://127.0.0.1:${port}/api/auth/guest`, { method: "POST" });
    assert.equal(guest.status, 200);

    const registerBody = JSON.stringify({ name: "Counter Test", email: `counter-${Date.now()}@example.com`, password: "safe-password" });
    const register = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(registerBody) },
      body: registerBody
    });
    assert.equal(register.status, 201);

    const searchBody = JSON.stringify({ topic: "Education", description: "inclusive school support", count: 3, allowFollowUpQuestions: false, usePersonalRecord: true });
    const search = await httpRequest(`http://127.0.0.1:${port}/api/ai/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(searchBody), "X-Village-Guest": "1" },
      body: searchBody
    });
    assert.equal(search.status, 200);
    const searchResult = JSON.parse(search.text);
    assert.deepEqual(searchResult.followUpQuestions, []);
    assert.equal(searchResult.researchContext.diagnosis, "");
    assert.equal(searchResult.researchContext.personalRecordMode, true);

    const helpfulBody = JSON.stringify({ helpful: true, rating: 4, details: "Clear and relevant.", source: "research-results" });
    const helpful = await httpRequest(`http://127.0.0.1:${port}/api/research-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(helpfulBody), "X-Village-Guest": "1" },
      body: helpfulBody
    });
    assert.equal(helpful.status, 200);

    await delay(250);
    const latest = received.filter((entry) => entry.action === "record-user-count").at(-1);
    assert.equal(latest.action, "record-user-count");
    assert.equal(latest.spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(latest.sheetGid, "1958570867");
    assert.equal(latest.metrics["Total Guest Sessions"], 3);
    assert.equal(latest.metrics["Total Accounts Created"], 2);
    assert.equal(latest.metrics["Total Searches Completed"], 5);
    assert.equal(latest.metrics["Average Recommendation System Usefulness on a 1-5 Scale (5 being the best, 1 being the worst)"], 3.33);
    assert.deepEqual(Object.values(latest.metrics).map((value) => typeof value), ["number", "number", "number", "number"]);
    assert.equal("date" in latest, false);
    const feedbackWrite = received.find((entry) => entry.action === "record-feedback");
    assert.equal(feedbackWrite.spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(feedbackWrite.sheetGid, "0");
    assert.equal(feedbackWrite["Star(1-5)"], 4);
    assert.equal(feedbackWrite.Feedback, "Clear and relevant.");
  } finally {
    delete process.env.USER_COUNT_SHEET_WEBHOOK_URL;
    delete process.env.FEEDBACK_SHEET_WEBHOOK_URL;
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
  const feedbackRows = [];
  const webhook = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (payload.action === "record-feedback") feedbackRows.push(payload);
    else errorRows.push(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, row: errorRows.length + feedbackRows.length + 1 }));
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

    const recommendBody = JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Medicaid assistance", count: 5 });
    const recommend = await httpRequest(`http://127.0.0.1:${port}/api/ai/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(recommendBody), Cookie: cookie },
      body: recommendBody
    });
    assert.equal(recommend.status, 200);
    const result = JSON.parse(recommend.text);
    assert.equal(result.resources.length, 0);
    assert.equal(result.summaryGuide, "Bacon");
    assert.match(result.answer, /^Bacon did not find/);
    assert.equal("needsClarification" in result, false);
    assert.deepEqual(errorRows.map((entry) => entry.Event), ["insufficient_resources_and_high_scores"]);
    assert.equal(errorRows[0].spreadsheetId, "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0");
    assert.equal(errorRows[0].sheetGid, "1952899933");
    assert.equal(errorRows[0]["Helpful?"], "No");
    assert.equal(errorRows[0]["Full Input"], "Medicaid assistance");
    assert.equal(errorRows[0].Diagnosis, "Autism");
    assert.equal(errorRows[0].Category, "Legal");
    assert.match(errorRows[0]["Primary Keywords"], /medicaid/i);
    assert.equal(errorRows[0].Helpful, "No");
    assert.equal(errorRows[0].helpful, "No");
    assert.equal(errorRows[0]["Requested resources"], 5);
    assert.equal(errorRows[0]["High score resources"], 0);

    const feedbackBody = JSON.stringify({ helpful: false, rating: 2, details: "These results were too broad.", source: "research-results", research: result.researchContext });
    const researchFeedback = await httpRequest(`http://127.0.0.1:${port}/api/research-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(feedbackBody), Cookie: cookie },
      body: feedbackBody
    });
    assert.equal(researchFeedback.status, 200);
    assert.equal(JSON.parse(researchFeedback.text).recorded, true);
    assert.equal(errorRows[1].Event, "research_not_helpful");
    assert.equal(errorRows[1]["Full Input"], "Medicaid assistance");
    assert.match(errorRows[1].Reason, /Rating: 2\/5/);
    assert.equal(feedbackRows.length, 1);
    assert.equal(feedbackRows[0].spreadsheetId, "1tRZvYsPy0kw9T18oRpRc16BE7OGDzG0o4CobAl-lJ7U");
    assert.equal(feedbackRows[0].sheetGid, "0");
    assert.equal(feedbackRows[0]["Unique User ID (if applicable)"], JSON.parse(register.text).user.id);
    assert.equal(feedbackRows[0]["Email (if applicable)"], JSON.parse(register.text).user.email);
    assert.equal(feedbackRows[0]["Username (if applicable)"], "Error Logger");
    assert.equal(feedbackRows[0]["Star(1-5)"], 2);
    assert.equal(feedbackRows[0].Feedback, "These results were too broad.");
    assert.equal(feedbackRows[0]["Helpful / Nonhelpful"], "Nonhelpful");

    const dislikeBody = JSON.stringify({ resource: { name: "Not Useful Resource", url: "https://example.org/not-useful", description: "Not the right fit.", topic: "Education", score: 12 }, disliked: true });
    const dislike = await httpRequest(`http://127.0.0.1:${port}/api/resources/dislike`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dislikeBody), Cookie: cookie },
      body: dislikeBody
    });
    assert.equal(dislike.status, 200);
    assert.equal(errorRows[2].Event, "resource_disliked");
    assert.equal(errorRows[2]["Resource name"], "Not Useful Resource");
    assert.equal(errorRows[2]["Helpful?"], "No");
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

test("admin primary keyword blocklist filters local recommendation keywords", async () => {
  const originalFetch = globalThis.fetch;
  const columns = ["URL", "Description", "Diagnosis", "Category1", "Category2", "Age", "Tag1"];
  const row = (url, description, diagnosis, category, tag) => ({ c: [url, description, diagnosis, category, "", "All ages", tag].map((v) => ({ v })) });
  const sheetPayload = { table: { cols: columns.map((label) => ({ label })), rows: [
    row("https://example.com/allowed", "Medicaid legal assistance", "Autism", "Legal", "Medicaid")
  ] } };
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("docs.google.com/spreadsheets")) return new Response(`google.visualization.Query.setResponse(${JSON.stringify(sheetPayload)});`);
    return originalFetch(url, options);
  };

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const register = async (name, email) => {
      const body = JSON.stringify({ name, email, password: "safe-password" });
      const response = await httpRequest(`http://127.0.0.1:${port}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        body
      });
      return response.headers["set-cookie"][0].split(";")[0];
    };
    const adminCookie = await register("Village Owner", "yanyanweiyue@gmail.com");
    const userCookie = await register("Keyword User", `keyword-${Date.now()}@example.com`);
    const blocklistBody = JSON.stringify({ text: "waffles\nassistance" });
    const saved = await httpRequest(`http://127.0.0.1:${port}/api/admin/primary-keyword-blocklist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(blocklistBody), Cookie: adminCookie },
      body: blocklistBody
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.text).keywords, ["waffle", "assistance"]);

    const recommendBody = JSON.stringify({ topic: "Legal", diagnosis: "Autism", description: "Waffles Medicaid assistance", count: 5 });
    const recommend = await httpRequest(`http://127.0.0.1:${port}/api/ai/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(recommendBody), Cookie: userCookie },
      body: recommendBody
    });
    assert.equal(recommend.status, 200);
    assert.deepEqual(JSON.parse(recommend.text).researchContext.primaryKeywords, ["medicaid"]);
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local meeting invitations grant meeting-only access without parent chat membership", async () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const call = async (path, { cookie = "", method = "GET", payload } = {}) => {
    const requestBody = payload === undefined ? "" : JSON.stringify(payload);
    const response = await httpRequest(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody) } : {})
      },
      ...(requestBody ? { body: requestBody } : {})
    });
    return { response, data: JSON.parse(response.text) };
  };
  const register = async (name, email) => {
    const result = await call("/api/auth/register", { method: "POST", payload: { name, email, password: "safe-password" } });
    assert.equal(result.response.status, 201);
    const member = { user: result.data.user, cookie: result.response.headers["set-cookie"][0].split(";")[0] };
    assert.equal((await call("/api/community/settings", { cookie: member.cookie, method: "POST", payload: { enabled: true, displayName: name } })).response.status, 200);
    return member;
  };
  try {
    const owner = await register("Local Meeting Owner", `meeting-owner-${unique}@example.com`);
    const friend = await register("Local Meeting Friend", `meeting-friend-${unique}@example.com`);
    const observer = await register("Local Meeting Observer", `meeting-observer-${unique}@example.com`);
    assert.equal((await call("/api/community/rooms/group-general/join", { cookie: owner.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general/join", { cookie: observer.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call("/api/community/connect", { cookie: owner.cookie, method: "POST", payload: { targetUserId: friend.user.id } })).response.status, 201);
    const friendOverview = await call("/api/community", { cookie: friend.cookie });
    const connectionId = friendOverview.data.incoming.find((connection) => connection.user_id === owner.user.id).id;
    assert.equal((await call(`/api/community/connections/${connectionId}/accept`, { cookie: friend.cookie, method: "POST", payload: {} })).response.status, 200);

    const meeting = await call("/api/community/meetings", {
      cookie: owner.cookie,
      method: "POST",
      payload: {
        roomId: "group-general",
        title: "Local invitation boundary",
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        durationMinutes: 30
      }
    });
    const meetingId = meeting.data.meeting.id;
    assert.equal((await call(`/api/community/meetings/${meetingId}/invitations`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientIds: [friend.user.id] }
    })).response.status, 403);
    const meetingPreview = await call(`/api/community/meetings/${meetingId}`, { cookie: owner.cookie });
    assert.equal(meetingPreview.response.status, 200);
    assert.equal(meetingPreview.data.rtcConfiguration.relayAvailable, false);
    assert.ok(meetingPreview.data.rtcConfiguration.iceServers.length > 0);
    assert.equal((await call(`/api/community/meetings/${meetingId}/messages`, { cookie: owner.cookie })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/whiteboard`, { cookie: owner.cookie })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: owner.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: observer.cookie, method: "POST", payload: {} })).response.status, 200);
    const beforeInvitation = JSON.parse(await readFile(communityFile, "utf8"));
    const invited = await call(`/api/community/meetings/${meetingId}/invitations`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientIds: [friend.user.id] }
    });
    assert.equal(invited.response.status, 200);
    assert.equal(invited.data.invited, 1);
    const afterInvitation = JSON.parse(await readFile(communityFile, "utf8"));
    assert.equal(afterInvitation.members.length, beforeInvitation.members.length);
    assert.equal(afterInvitation.connections.length, beforeInvitation.connections.length);
    assert.equal(afterInvitation.members.some((member) => member.roomId === "group-general" && member.userId === friend.user.id), false);
    const invitation = afterInvitation.meetingInvitations.find((item) => item.meetingId === meetingId && item.recipientId === friend.user.id);
    assert.equal(invitation.status, "pending");
    const notifications = await call("/api/community/notifications", { cookie: friend.cookie });
    const notification = notifications.data.notifications.find((item) => item.kind === "meeting-invite" && item.metadata.meetingId === meetingId);
    assert.deepEqual(Object.keys(notification.metadata).sort(), ["invitationId", "meetingId"]);

    assert.equal((await call(`/api/community/meetings/${meetingId}`, { cookie: friend.cookie })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}/messages`, { cookie: friend.cookie })).response.status, 403);
    assert.equal((await call("/api/community/rooms/group-general/messages", { cookie: friend.cookie })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: friend.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}/messages`, { cookie: friend.cookie })).response.status, 200);

    const localMeetingMessage = await call(`/api/community/meetings/${meetingId}/messages`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { message: "Local Meeting access boundary", audience: "everyone" }
    });
    assert.equal(localMeetingMessage.response.status, 201);
    const localPrivateMessage = await call(`/api/community/meetings/${meetingId}/messages`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { message: "Private local Meeting note", audience: "private", recipientIds: [friend.user.id] }
    });
    assert.equal(localPrivateMessage.response.status, 201);
    const localPublicReply = await call(`/api/community/meetings/${meetingId}/messages`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { message: "Public local follow-up", audience: "everyone", replyToId: localPrivateMessage.data.message.id }
    });
    assert.equal(localPublicReply.response.status, 201);
    const localOwnerReplyView = await call(`/api/community/meetings/${meetingId}/messages`, { cookie: owner.cookie });
    assert.equal(localOwnerReplyView.data.messages.at(-1).replyTo.body, "Private local Meeting note");
    const localObserverReplyView = await call(`/api/community/meetings/${meetingId}/messages`, { cookie: observer.cookie });
    assert.equal(localObserverReplyView.data.messages.at(-1).body, "Public local follow-up");
    assert.equal(localObserverReplyView.data.messages.at(-1).replyToId, null);
    assert.equal(localObserverReplyView.data.messages.at(-1).replyTo, null);
    assert.equal(JSON.stringify(localObserverReplyView.data).includes("Private local Meeting note"), false);
    assert.equal((await call(`/api/community/meeting-messages/${localPrivateMessage.data.message.id}/reactions`, {
      cookie: observer.cookie,
      method: "POST",
      payload: { emoji: "👍" }
    })).response.status, 404);
    const localPoll = await call(`/api/community/meetings/${meetingId}/polls`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { question: "Local access?", options: ["Yes", "No"] }
    });
    assert.equal(localPoll.response.status, 201);
    assert.equal((await call(`/api/community/polls/${localPoll.data.poll.id}/start`, {
      cookie: owner.cookie,
      method: "POST",
      payload: {}
    })).response.status, 200);

    assert.equal((await call(`/api/community/meetings/${meetingId}/signals`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientId: friend.user.id, kind: "offer", payload: { sdp: "before-cleanup" } }
    })).response.status, 201);
    assert.equal((await call(`/api/community/meetings/${meetingId}/signals`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientId: friend.user.id, kind: "offer", payload: {} }
    })).response.status, 400);
    assert.equal((await call(`/api/community/meetings/${meetingId}/signals`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientId: friend.user.id, kind: "candidate", payload: [] }
    })).response.status, 400);
    const beforeSignalCleanup = await call(`/api/community/meetings/${meetingId}/signals?cursor=0`, { cookie: friend.cookie });
    const savedSignalCursor = beforeSignalCleanup.data.signals[0].cursor;
    const signalState = JSON.parse(await readFile(communityFile, "utf8"));
    signalState.meetingSignals = [];
    await writeFile(communityFile, JSON.stringify(signalState, null, 2));
    assert.equal((await call(`/api/community/meetings/${meetingId}/signals`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientId: friend.user.id, kind: "candidate", payload: { candidate: "after-cleanup" } }
    })).response.status, 201);
    const afterSignalCleanup = await call(`/api/community/meetings/${meetingId}/signals?cursor=${savedSignalCursor}`, { cookie: friend.cookie });
    assert.equal(afterSignalCleanup.data.signals.length, 1);
    assert.equal(afterSignalCleanup.data.signals[0].payload.candidate, "after-cleanup");
    assert.ok(afterSignalCleanup.data.signals[0].cursor > savedSignalCursor);

    assert.equal((await call(`/api/community/meetings/${meetingId}/state`, {
      cookie: friend.cookie,
      method: "PATCH",
      payload: { userId: owner.user.id, remove: true }
    })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/state`, {
      cookie: owner.cookie,
      method: "PATCH",
      payload: { userId: friend.user.id, remove: true }
    })).response.status, 200);
    const removedState = JSON.parse(await readFile(communityFile, "utf8"));
    const removedFriend = removedState.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === friend.user.id);
    assert.ok(removedFriend.leftAt);
    assert.ok(removedFriend.removedAt);
    assert.equal(removedFriend.removedBy, owner.user.id);
    assert.equal(removedFriend.restoredAt, null);
    assert.equal(removedFriend.restoredBy, null);
    for (const [path, options] of [
      [`/api/community/meetings/${meetingId}`, {}],
      [`/api/community/meetings/${meetingId}/signals`, {}],
      [`/api/community/meetings/${meetingId}/translate`, { method: "POST", payload: { text: "hello", targetLanguage: "es" } }],
      [`/api/community/meetings/${meetingId}/state`, { method: "PATCH", payload: { raisedHand: true } }],
      [`/api/community/meetings/${meetingId}/whiteboard`, {}],
      [`/api/community/meetings/${meetingId}/messages`, {}],
      [`/api/community/meetings/${meetingId}/polls`, { method: "POST", payload: { question: "Blocked?", options: ["Yes", "No"] } }],
      [`/api/community/meetings/${meetingId}/invitations`, {}],
      [`/api/community/meeting-messages/${localMeetingMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } }],
      [`/api/community/polls/${localPoll.data.poll.id}/vote`, { method: "POST", payload: { optionIndex: 0 } }]
    ]) {
      assert.equal((await call(path, { cookie: friend.cookie, ...options })).response.status, 403, path);
    }
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: friend.cookie, method: "POST", payload: {} })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/state`, {
      cookie: friend.cookie,
      method: "PATCH",
      payload: { userId: friend.user.id, restore: true }
    })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/state`, {
      cookie: owner.cookie,
      method: "PATCH",
      payload: { userId: friend.user.id, restore: true }
    })).response.status, 200);
    const restoredState = JSON.parse(await readFile(communityFile, "utf8"));
    const restoredFriend = restoredState.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === friend.user.id);
    assert.ok(restoredFriend.leftAt);
    assert.ok(restoredFriend.removedAt);
    assert.equal(restoredFriend.removedBy, owner.user.id);
    assert.ok(restoredFriend.restoredAt);
    assert.equal(restoredFriend.restoredBy, owner.user.id);
    assert.equal((await call(`/api/community/meetings/${meetingId}`, { cookie: friend.cookie })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}/messages`, { cookie: friend.cookie })).response.status, 403);
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: friend.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}`, { cookie: friend.cookie })).response.status, 200);

    assert.equal((await call(`/api/community/meetings/${meetingId}/invitations`, {
      cookie: owner.cookie,
      method: "DELETE",
      payload: { invitationId: invitation.id }
    })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}`, { cookie: friend.cookie })).response.status, 404);
    assert.equal((await call(`/api/community/meetings/${meetingId}/invitations`, {
      cookie: owner.cookie,
      method: "POST",
      payload: { recipientIds: [friend.user.id] }
    })).response.status, 200);
    assert.equal((await call(`/api/community/blocks/${friend.user.id}`, { cookie: owner.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/meetings/${meetingId}`, { cookie: friend.cookie })).response.status, 404);
    assert.equal((await call(`/api/community/meetings/${meetingId}/join`, { cookie: friend.cookie, method: "POST", payload: {} })).response.status, 404);
    assert.equal((await call(`/api/community/meetings/${meetingId}/end`, { cookie: owner.cookie, method: "POST", payload: {} })).response.status, 200);
    const ended = JSON.parse(await readFile(communityFile, "utf8"));
    assert.equal(ended.meetingInvitations.find((item) => item.id === invitation.id).status, "ended");
    for (const [path, options] of [
      [`/api/community/meetings/${meetingId}`, {}],
      [`/api/community/meetings/${meetingId}/signals`, {}],
      [`/api/community/meetings/${meetingId}/whiteboard`, {}],
      [`/api/community/meetings/${meetingId}/messages`, {}],
      [`/api/community/meeting-messages/${localMeetingMessage.data.message.id}/reactions`, { method: "POST", payload: { emoji: "👍" } }],
      [`/api/community/polls/${localPoll.data.poll.id}/vote`, { method: "POST", payload: { optionIndex: 0 } }]
    ]) {
      assert.equal((await call(path, { cookie: owner.cookie, ...options })).response.status, 404, path);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local server persists and enforces report-linked Community penalties", async () => {
  const previousAdmins = process.env.ADMIN_EMAILS;
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `moderation-admin-${unique}@example.com`;
  process.env.ADMIN_EMAILS = [previousAdmins, adminEmail].filter(Boolean).join(",");
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const call = async (path, { cookie = "", method = "GET", payload } = {}) => {
    const requestBody = payload === undefined ? "" : JSON.stringify(payload);
    const response = await httpRequest(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody) } : {})
      },
      ...(requestBody ? { body: requestBody } : {})
    });
    return { response, data: JSON.parse(response.text) };
  };
  const register = async (name, email) => {
    const result = await call("/api/auth/register", { method: "POST", payload: { name, email, password: "safe-password" } });
    assert.equal(result.response.status, 201);
    return { user: result.data.user, cookie: result.response.headers["set-cookie"][0].split(";")[0] };
  };
  try {
    const admin = await register("Moderation Admin", adminEmail);
    const target = await register("Local Reported Member", `moderation-target-${unique}@example.com`);
    const reporter = await register("Local Reporter", `moderation-reporter-${unique}@example.com`);
    for (const member of [admin, target, reporter]) {
      assert.equal((await call("/api/community/settings", { cookie: member.cookie, method: "POST", payload: { enabled: true, displayName: member.user.name } })).response.status, 200);
      assert.equal((await call("/api/community/rooms/group-general/join", { cookie: member.cookie, method: "POST", payload: {} })).response.status, 200);
    }
    const sent = await call("/api/community/rooms/group-general/messages", { cookie: target.cookie, method: "POST", payload: { message: "Local reported message" } });
    const reported = await call(`/api/community/messages/${sent.data.message.id}/report`, { cookie: reporter.cookie, method: "POST", payload: { reason: "Local repeated harassment" } });
    assert.equal(reported.response.status, 201);
    const reports = await call("/api/admin/community-reports", { cookie: admin.cookie });
    assert.equal(reports.response.status, 200);
    const reportId = reports.data.reports.find((report) => report.id === reported.data.reportId).id;
    assert.equal((await call(`/api/admin/community-reports/${reportId}`, {
      cookie: admin.cookie,
      method: "PATCH",
      payload: { status: "dismissed", resolutionNote: "Not actionable yet" }
    })).response.status, 200);
    assert.equal((await call(`/api/admin/community-reports/${reportId}/sanctions`, {
      cookie: admin.cookie,
      method: "POST",
      payload: { type: "chat_mute", reason: "Local repeated harassment", durationSeconds: 864000 }
    })).response.status, 409);
    assert.equal((await call(`/api/admin/community-reports/${reportId}`, {
      cookie: admin.cookie,
      method: "PATCH",
      payload: { status: "open" }
    })).response.status, 200);
    const muted = await call(`/api/admin/community-reports/${reportId}/sanctions`, {
      cookie: admin.cookie,
      method: "POST",
      payload: { type: "chat_mute", reason: "Local repeated harassment", durationSeconds: 864000 }
    });
    assert.equal(muted.response.status, 201);
    const overview = await call("/api/community", { cookie: target.cookie });
    assert.equal(overview.data.moderation.access.chatWrite, false);
    assert.equal(overview.data.moderation.sanctions[0].reason, "Local repeated harassment");
    assert.ok(overview.data.moderation.sanctions[0].endsAt);
    const blocked = await call("/api/community/rooms/group-general/messages", { cookie: target.cookie, method: "POST", payload: { message: "@所有人 blocked by the account chat mute" } });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.data.code, "COMMUNITY_SANCTION");
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
      const blockedWrite = await call(path, { cookie: target.cookie, method: "POST", payload: {} });
      assert.equal(blockedWrite.response.status, 403, path);
      assert.equal(blockedWrite.data.code, "COMMUNITY_SANCTION", path);
    }
    assert.equal((await call(`/api/admin/community-sanctions/${muted.data.sanction.id}/revoke`, { cookie: admin.cookie, method: "PATCH", payload: { reason: "Appeal accepted" } })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general/messages", { cookie: target.cookie, method: "POST", payload: { message: "Allowed after appeal" } })).response.status, 201);

    assert.equal((await call(`/api/admin/community-reports/${reportId}/sanctions`, {
      cookie: admin.cookie,
      method: "POST",
      payload: { type: "community_ban", reason: "Local safety review", durationSeconds: 259200 }
    })).response.status, 201);
    const restricted = await call("/api/community", { cookie: target.cookie });
    assert.equal(restricted.data.restricted, true);
    assert.equal(restricted.data.moderation.sanctions[0].reason, "Local safety review");
    assert.equal((await call("/api/community/posts", { cookie: target.cookie })).response.status, 403);

    assert.equal((await call(`/api/admin/community-reports/${reportId}/sanctions`, {
      cookie: admin.cookie,
      method: "POST",
      payload: { type: "site_blacklist", reason: "Local severe safety violation", permanent: true }
    })).response.status, 201);
    assert.equal((await call("/api/auth/me", { cookie: target.cookie })).response.status, 401);
    const login = await call("/api/auth/login", { method: "POST", payload: { email: target.user.email, password: "safe-password" } });
    assert.equal(login.response.status, 403);
    assert.equal(login.data.moderation.access.site, false);
    assert.ok((await readFile(usersFile, "utf8")).includes(target.user.email));
    const persistedCommunity = JSON.parse(await readFile(communityFile, "utf8"));
    assert.equal(persistedCommunity.profiles[target.user.id].displayName, target.user.name);
    assert.equal(persistedCommunity.messages.some((message) => message.userId === target.user.id), true);
  } finally {
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local group administration mirrors owner, admin, mute, approval, transfer, and dissolve rules", async () => {
  const previousAdmins = process.env.ADMIN_EMAILS;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const siteAdminEmail = `group-system-admin-${suffix}@example.com`;
  process.env.ADMIN_EMAILS = [previousAdmins, siteAdminEmail].filter(Boolean).join(",");
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const call = async (path, { cookie = "", method = "GET", payload } = {}) => {
    const requestBody = payload === undefined ? "" : JSON.stringify(payload);
    const response = await httpRequest(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody) } : {})
      },
      ...(requestBody ? { body: requestBody } : {})
    });
    return { response, data: JSON.parse(response.text) };
  };
  const register = async (name, email) => {
    const result = await call("/api/auth/register", { method: "POST", payload: { name, email, password: "safe-password" } });
    assert.equal(result.response.status, 201);
    const member = { user: result.data.user, cookie: result.response.headers["set-cookie"][0].split(";")[0] };
    assert.equal((await call("/api/community/settings", { cookie: member.cookie, method: "POST", payload: { enabled: true, displayName: name } })).response.status, 200);
    return member;
  };
  const connect = async (requester, recipient) => {
    assert.equal((await call("/api/community/connect", { cookie: requester.cookie, method: "POST", payload: { targetUserId: recipient.user.id } })).response.status, 201);
    const overview = await call("/api/community", { cookie: recipient.cookie });
    const pending = overview.data.incoming.find((item) => item.user_id === requester.user.id);
    assert.ok(pending);
    assert.equal((await call(`/api/community/connections/${pending.id}/accept`, { cookie: recipient.cookie, method: "POST", payload: {} })).response.status, 200);
  };
  const acceptGroupInvite = async (member, roomId, reviewer) => {
    const overview = await call("/api/community", { cookie: member.cookie });
    const invitation = overview.data.groupInvites.find((item) => item.room_id === roomId);
    assert.ok(invitation);
    const accepted = await call(`/api/community/group-invitations/${invitation.id}/accept`, { cookie: member.cookie, method: "POST", payload: {} });
    if (!reviewer) {
      assert.equal(accepted.response.status, 200);
      assert.equal(accepted.data.pendingApproval, false);
      return;
    }
    assert.equal(accepted.response.status, 202);
    assert.equal(accepted.data.pendingApproval, true);
    const requests = await call(`/api/community/rooms/${roomId}/join-requests`, { cookie: reviewer.cookie });
    const requestItem = requests.data.requests.find((item) => item.userId === member.user.id);
    assert.ok(requestItem);
    assert.equal((await call(`/api/community/rooms/${roomId}/join-requests/${requestItem.id}`, { cookie: reviewer.cookie, method: "PATCH", payload: { status: "approved" } })).response.status, 200);
  };

  try {
    const owner = await register("Local Group Owner", `local-group-owner-${suffix}@example.com`);
    const successor = await register("Local Future Owner", `local-group-successor-${suffix}@example.com`);
    const appointedAdmin = await register("Local Group Admin", `local-group-admin-${suffix}@example.com`);
    const ordinary = await register("Local Ordinary Member", `local-group-member-${suffix}@example.com`);
    const outsider = await register("Local Outsider", `local-group-outsider-${suffix}@example.com`);
    for (const member of [successor, appointedAdmin, ordinary]) await connect(owner, member);

    const created = await call("/api/community/groups", {
      cookie: owner.cookie,
      method: "POST",
      payload: { name: "Local Family Circle", memberIds: [successor.user.id, appointedAdmin.user.id, ordinary.user.id] }
    });
    assert.equal(created.response.status, 201);
    const roomId = created.data.room.id;
    for (const member of [successor, appointedAdmin, ordinary]) await acceptGroupInvite(member, roomId);

    const ownerView = await call(`/api/community/rooms/${roomId}/messages`, { cookie: owner.cookie });
    assert.equal(ownerView.data.room.ownerId, owner.user.id);
    assert.equal(ownerView.data.room.currentUserRole, "owner");
    assert.equal(ownerView.data.room.canManageAdmins, true);
    assert.equal((await call(`/api/community/rooms/${roomId}`, { cookie: ordinary.cookie, method: "PATCH", payload: { name: "Unauthorized" } })).response.status, 403);
    assert.equal((await call(`/api/community/rooms/${roomId}/members/${outsider.user.id}`, { cookie: owner.cookie, method: "PATCH", payload: { role: "admin" } })).response.status, 404);
    await connect(owner, outsider);
    assert.equal((await call(`/api/community/rooms/${roomId}`, { cookie: owner.cookie, method: "PATCH", payload: { inviteConfirmationRequired: true } })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}/invite`, { cookie: owner.cookie, method: "POST", payload: { memberIds: [outsider.user.id] } })).response.status, 200);
    await acceptGroupInvite(outsider, roomId, owner);

    assert.equal((await call(`/api/community/rooms/${roomId}/members/${appointedAdmin.user.id}`, { cookie: owner.cookie, method: "PATCH", payload: { role: "admin" } })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}`, {
      cookie: appointedAdmin.cookie,
      method: "PATCH",
      payload: { name: "Locally managed circle", announcement: "Local group notice", announcementPinned: true }
    })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}`, { cookie: appointedAdmin.cookie, method: "PATCH", payload: { joinApprovalRequired: false } })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}/members/${successor.user.id}`, { cookie: appointedAdmin.cookie, method: "PATCH", payload: { role: "admin" } })).response.status, 403);

    const muted = await call(`/api/community/rooms/${roomId}/members/${ordinary.user.id}`, {
      cookie: appointedAdmin.cookie,
      method: "PATCH",
      payload: { durationSeconds: 3600, muteReason: "Local cooling-off period" }
    });
    assert.equal(muted.response.status, 200);
    assert.ok(muted.data.member.mutedUntil);
    const blocked = await call(`/api/community/rooms/${roomId}/messages`, { cookie: ordinary.cookie, method: "POST", payload: { message: "@所有人 muted local broadcast" } });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.data.code, "ROOM_MUTED");
    assert.equal((await call(`/api/community/rooms/${roomId}/messages`, { cookie: successor.cookie, method: "POST", payload: { message: "@everyone ordinary local broadcast" } })).response.status, 201);
    assert.equal((await call(`/api/community/rooms/${roomId}/messages`, { cookie: appointedAdmin.cookie, method: "POST", payload: { message: "@everyone valid local notice" } })).response.status, 201);

    const memberView = await call(`/api/community/rooms/${roomId}/messages`, { cookie: successor.cookie });
    assert.equal(memberView.data.room.announcement, "Local group notice");
    assert.equal(memberView.data.room.announcementPinned, true);
    assert.equal(memberView.data.room.currentUserRole, "member");
    assert.equal(memberView.data.room.canMentionEveryone, true);
    assert.equal(memberView.data.members.find((item) => item.userId === ordinary.user.id).isMuted, true);

    assert.equal((await call(`/api/community/rooms/${roomId}/ownership`, { cookie: owner.cookie, method: "POST", payload: { userId: successor.user.id } })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}/leave`, { cookie: successor.cookie, method: "POST", payload: {} })).response.status, 409);
    assert.equal((await call(`/api/community/rooms/${roomId}/leave`, { cookie: owner.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/${roomId}/ownership`, { cookie: owner.cookie, method: "POST", payload: { userId: appointedAdmin.user.id } })).response.status, 403);

    const siteAdmin = await register("Local System Administrator", siteAdminEmail);
    const systemModerator = await register("Local System Moderator", `local-system-moderator-${suffix}@example.com`);
    const applicant = await register("Local Join Applicant", `local-system-applicant-${suffix}@example.com`);
    assert.equal((await call("/api/community/rooms/group-general/join", { cookie: siteAdmin.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general/join", { cookie: systemModerator.cookie, method: "POST", payload: {} })).response.status, 200);
    assert.equal((await call(`/api/community/rooms/group-general/members/${systemModerator.user.id}`, { cookie: siteAdmin.cookie, method: "PATCH", payload: { role: "admin" } })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general", { cookie: systemModerator.cookie, method: "PATCH", payload: { joinApprovalRequired: true } })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general", { cookie: siteAdmin.cookie, method: "PATCH", payload: { joinApprovalRequired: true } })).response.status, 200);
    const pendingJoin = await call("/api/community/rooms/group-general/join", { cookie: applicant.cookie, method: "POST", payload: {} });
    assert.equal(pendingJoin.response.status, 202);
    assert.equal((await call("/api/community/rooms/group-general/messages", { cookie: applicant.cookie })).response.status, 403);
    const requests = await call("/api/community/rooms/group-general/join-requests", { cookie: systemModerator.cookie });
    const requestItem = requests.data.requests.find((item) => item.userId === applicant.user.id);
    assert.ok(requestItem);
    assert.equal((await call(`/api/community/rooms/group-general/join-requests/${requestItem.id}`, { cookie: systemModerator.cookie, method: "PATCH", payload: { status: "approved" } })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general/messages", { cookie: applicant.cookie })).response.status, 200);
    assert.equal((await call("/api/community/rooms/group-general", { cookie: siteAdmin.cookie, method: "DELETE" })).response.status, 403);

    assert.equal((await call(`/api/community/rooms/${roomId}`, { cookie: successor.cookie, method: "DELETE" })).response.status, 200);
    const persisted = JSON.parse(await readFile(communityFile, "utf8"));
    assert.equal(persisted.rooms.some((room) => room.id === roomId), false);
    assert.equal(persisted.members.some((member) => member.roomId === roomId), false);
  } finally {
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
