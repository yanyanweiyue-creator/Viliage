import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const USERS_FILE = join(DATA_DIR, "users.json");
const FALLBACK_FILE = join(DATA_DIR, "resources-fallback.json");
const RESOURCE_SHEET_ID = process.env.RESOURCE_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const RESOURCE_SHEET_GID = process.env.RESOURCE_SHEET_GID || "1709372674";
const sessions = new Map();
const MAX_BODY = 1_000_000;
let resourceCache = { time: 0, rows: [] };

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

await mkdir(DATA_DIR, { recursive: true });

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(value));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function loadUsers() {
  try {
    return JSON.parse(await readFile(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = String(stored || "").split(":");
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    surveyCompleted: Boolean(user.surveyCompleted),
    profile: user.profile || null,
    history: user.history || []
  };
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, value]) => [key, decodeURIComponent(value || "")])
  );
}

async function getSessionUser(req) {
  const token = parseCookies(req).capy_session;
  const userId = sessions.get(token);
  if (!userId) return null;
  const users = await loadUsers();
  return users.find((user) => user.id === userId) || null;
}

function setSession(res, userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, userId);
  return `capy_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`;
}

function stripGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Unexpected sheet response.");
  return JSON.parse(text.slice(start, end + 1));
}

function cellValue(cell) {
  if (!cell) return "";
  if (cell.f != null) return String(cell.f).trim();
  if (cell.v != null) return String(cell.v).trim();
  return "";
}

function deriveName(description, url) {
  const first = String(description || "").split(/[—–-]/)[0].trim();
  if (first.length > 3 && first.length < 90) return first;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Community resource";
  }
}

export function normalizeSheetRows(table) {
  const columns = new Map(
    (table.cols || []).map((column, index) => [String(column.label || column.id || "").trim().toLowerCase(), index])
  );
  const valueAt = (values, label, fallbackIndex) => {
    const index = columns.has(label.toLowerCase()) ? columns.get(label.toLowerCase()) : fallbackIndex;
    return values[index] || "";
  };

  return (table.rows || [])
    .map((row) => {
      const values = (row.c || []).map(cellValue);
      const url = valueAt(values, "URL", 0);
      const description = valueAt(values, "Description", 1);
      const diagnosis = valueAt(values, "Diagnosis", 2) || "Both";
      const categories = [valueAt(values, "Category1", 3), valueAt(values, "Category2", 4)]
        .filter(Boolean)
        .flatMap((value) => value.split(/[,;/]/))
        .map((value) => value.trim())
        .filter(Boolean);
      const tags = ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"]
        .map((label, index) => valueAt(values, label, index + 6))
        .filter(Boolean);
      const locations = ["Location1", "Location2", "Location3", "Location4"]
        .map((label, index) => valueAt(values, label, index + 12))
        .filter(Boolean);
      return {
        url,
        name: deriveName(description, url),
        description,
        diagnosis,
        categories: categories.length ? categories : ["Education"],
        age: valueAt(values, "Age", 5) || "All ages",
        tags,
        location: locations[0] || "See website",
        price: valueAt(values, "Price", 17) || "See website"
      };
    })
    .filter((row) => /^https?:\/\//.test(row.url || ""));
}

async function getResources(force = false) {
  if (!force && resourceCache.rows.length && Date.now() - resourceCache.time < 60_000) {
    return { rows: resourceCache.rows, source: "google-sheet-cache" };
  }
  try {
    const url = `https://docs.google.com/spreadsheets/d/${RESOURCE_SHEET_ID}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(RESOURCE_SHEET_GID)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}.`);
    const payload = stripGviz(await response.text());
    const rows = normalizeSheetRows(payload.table);
    if (!rows.length) throw new Error("Sheet has no readable resource rows.");
    resourceCache = { time: Date.now(), rows };
    return { rows, source: "google-sheet-live" };
  } catch (error) {
    const rows = JSON.parse(await readFile(FALLBACK_FILE, "utf8"));
    resourceCache = { time: Date.now(), rows };
    return { rows, source: "bundled-fallback", warning: error.message };
  }
}

function profileSummary(responses = {}) {
  const interests = Array.isArray(responses.interests) ? responses.interests.join(", ") : "neurodiversity";
  const situation = Array.isArray(responses.situation) ? responses.situation.join(", ") : responses.situation || "not specified";
  return `Exploring ${interests}. Age group: ${responses.age || "not specified"}. Journey: ${responses.journey || "not specified"}. Current situation: ${situation}. ${responses.note ? `Priority: ${responses.note}` : ""}`.trim();
}

function scoreResource(resource, topic, profile, description) {
  const haystack = [resource.name, resource.description, resource.diagnosis, ...(resource.categories || []), ...(resource.tags || []), resource.age]
    .join(" ")
    .toLowerCase();
  const needles = [topic, description, profile?.responses?.age, ...(profile?.responses?.interests || []), ...(profile?.responses?.situation || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((word) => word.length > 2);
  return needles.reduce((score, word) => score + (haystack.includes(word) ? 2 : 0), 0) +
    ((resource.categories || []).some((category) => category.toLowerCase().includes(String(topic).toLowerCase())) ? 5 : 0);
}

function deterministicAnswer(topic, description, matches) {
  const names = matches.slice(0, 3).map((item) => item.name).join(", ");
  return `I found ${matches.length} promising ${topic.toLowerCase()} resources for “${description}”. Start with ${names}. I matched these against the live resource database when available; please confirm eligibility, cost, and current availability directly with each provider.`;
}

async function callOpenAI({ topic, description, profile, matches }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = {
    topic,
    userDescription: description,
    personalRecord: profile?.summary || "No personal record available",
    candidateResources: matches.map(({ name, description: detail, url, age, location, price, tags }) => ({ name, detail, url, age, location, price, tags }))
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: "You are JA, a warm capybara resource guide. Recommend only from candidateResources. Do not diagnose, promise outcomes, or invent facts or URLs. Explain why the top 2–4 options fit. Encourage the user to verify eligibility, cost, and availability. If the request suggests immediate danger, direct them to emergency services first. Use plain, calm language and under 180 words.",
      input: JSON.stringify(input)
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const data = await response.json();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function syncUserRecord(user) {
  const webhook = process.env.USER_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
  const payload = {
    "User name": user.name,
    "Password": "Not stored — secure hash only",
    "response of survey": JSON.stringify(user.profile?.responses || {}),
    "AI summary the response of surve": user.profile?.summary || "",
    "AI personal record": user.profile?.summary || "",
    "history": JSON.stringify(user.history || []),
    "feedback": user.feedback || "",
    email: user.email,
    userId: user.id
  };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`User sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "User sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

async function updateUser(userId, updater) {
  const users = await loadUsers();
  const index = users.findIndex((user) => user.id === userId);
  if (index < 0) return null;
  users[index] = updater(users[index]) || users[index];
  await saveUsers(users);
  return users[index];
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), userSheetConfigured: Boolean(process.env.USER_SHEET_WEBHOOK_URL) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const { name, email, password } = await readJsonBody(req);
    if (!String(name || "").trim()) return sendError(res, 400, "Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return sendError(res, 400, "Please enter a valid email.");
    if (String(password || "").length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
    const users = await loadUsers();
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) return sendError(res, 409, "An account with this email already exists.");
    const user = { id: randomBytes(12).toString("hex"), name: name.trim(), email: email.toLowerCase(), passwordHash: hashPassword(password), surveyCompleted: false, profile: null, history: [], createdAt: new Date().toISOString() };
    users.push(user);
    await saveUsers(users);
    let sync = { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
    try { sync = await syncUserRecord(user); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 201, { user: safeUser(user), sync }, { "Set-Cookie": setSession(res, user.id) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await readJsonBody(req);
    const users = await loadUsers();
    const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return sendError(res, 401, "Email or password is incorrect.");
    return sendJson(res, 200, { user: safeUser(user) }, { "Set-Cookie": setSession(res, user.id) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).capy_session;
    sessions.delete(token);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "capy_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await getSessionUser(req);
    return user ? sendJson(res, 200, { user: safeUser(user) }) : sendError(res, 401, "Not signed in.");
  }

  if (req.method === "GET" && url.pathname === "/api/resources") {
    const data = await getResources(url.searchParams.get("refresh") === "1");
    return sendJson(res, 200, { resources: data.rows, source: data.source, warning: data.warning || null, updatedAt: new Date().toISOString() });
  }

  const user = await getSessionUser(req);
  if (!user) return sendError(res, 401, "Please sign in first.");

  if (req.method === "POST" && url.pathname === "/api/profile") {
    const { responses } = await readJsonBody(req);
    if (!responses || !Array.isArray(responses.interests) || !responses.interests.length) return sendError(res, 400, "Please choose at least one area of interest.");
    const summary = profileSummary(responses);
    const saved = await updateUser(user.id, (item) => ({ ...item, surveyCompleted: true, profile: { responses, summary, updatedAt: new Date().toISOString() } }));
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { user: safeUser(saved), sync });
  }

  if (req.method === "POST" && url.pathname === "/api/ai/recommend") {
    const { topic = "Education", description = "" } = await readJsonBody(req);
    if (String(description).trim().length < 8) return sendError(res, 400, "Tell JA a little more so the recommendations can be useful.");
    const { rows, source } = await getResources();
    const matches = rows
      .map((resource) => ({ ...resource, score: scoreResource(resource, topic, user.profile, description) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ score, ...resource }) => resource);
    let answer;
    let ai = false;
    try {
      answer = await callOpenAI({ topic, description, profile: user.profile, matches });
      ai = Boolean(answer);
    } catch (error) {
      answer = deterministicAnswer(topic, description, matches);
      answer += ` (AI service note: ${error.message})`;
    }
    if (!answer) answer = deterministicAnswer(topic, description, matches);
    const saved = await updateUser(user.id, (item) => ({ ...item, history: [...(item.history || []), { topic, description, at: new Date().toISOString() }].slice(-50) }));
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { answer, resources: matches.slice(0, 4), source, ai, sync });
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const { feedback = "" } = await readJsonBody(req);
    const saved = await updateUser(user.id, (item) => ({ ...item, feedback: String(feedback).slice(0, 2000) }));
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { ok: true, sync });
  }

  sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, url) {
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const safePath = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, "Forbidden.");
  if (!existsSync(filePath)) filePath = join(PUBLIC_DIR, "index.html");
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" || ext === ".js" ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  createReadStream(filePath).pipe(res);
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendError(res, 500, error.message || "Something went wrong.");
      else res.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`Capy Village is running at http://127.0.0.1:${port}`);
  });
}
