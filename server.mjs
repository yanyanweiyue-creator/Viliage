import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { DEFAULT_SCORE_CONFIG, extractKeywords, heuristicKeywordExpansion, inferIssuePreferences, rankResources } from "./scoring-engine.mjs";
import { communitySimilarity, pairKey, safeDisplayName } from "./community-logic.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const USERS_FILE = process.env.USERS_FILE || join(DATA_DIR, "users.json");
const SESSIONS_FILE = process.env.SESSIONS_FILE || join(DATA_DIR, "sessions.json");
const COMMUNITY_FILE = process.env.COMMUNITY_FILE || join(DATA_DIR, "community.json");
const FALLBACK_FILE = join(DATA_DIR, "resources-fallback.json");
const SCORING_CONFIG_FILE = process.env.SCORING_CONFIG_FILE || join(ROOT, "config", "scoring-config.json");
const RESOURCE_SHEET_ID = process.env.RESOURCE_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const RESOURCE_SHEET_GID = process.env.RESOURCE_SHEET_GID || "1709372674";
const sessions = new Map();
const MAX_BODY = 1_000_000;
let resourceCache = { time: 0, rows: [] };
const environmentCache = new Map();
const ENVIRONMENT_CACHE_MS = 10 * 60_000;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

await mkdir(DATA_DIR, { recursive: true });

function sessionKey(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

async function saveJsonAtomically(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, filePath);
}

async function loadSessions() {
  try {
    const saved = JSON.parse(await readFile(SESSIONS_FILE, "utf8"));
    const now = Date.now();
    for (const item of Array.isArray(saved) ? saved : []) {
      if (item?.key && item?.userId && Number(item.expiresAt) > now) sessions.set(item.key, { userId: item.userId, expiresAt: Number(item.expiresAt) });
    }
  } catch {}
}

async function saveSessions() {
  const now = Date.now();
  const active = [...sessions.entries()]
    .filter(([, session]) => session.expiresAt > now)
    .map(([key, session]) => ({ key, userId: session.userId, expiresAt: session.expiresAt }));
  await saveJsonAtomically(SESSIONS_FILE, active);
}

await loadSessions();

async function loadScoringConfig() {
  try {
    const saved = JSON.parse(await readFile(SCORING_CONFIG_FILE, "utf8"));
    return {
      version: saved.version || DEFAULT_SCORE_CONFIG.version,
      weights: { ...DEFAULT_SCORE_CONFIG.weights, ...(saved.weights || {}) },
      limits: { ...DEFAULT_SCORE_CONFIG.limits, ...(saved.limits || {}) }
    };
  } catch (error) {
    console.warn(`Scoring configuration fallback: ${error.message}`);
    return DEFAULT_SCORE_CONFIG;
  }
}

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
  await saveJsonAtomically(USERS_FILE, users);
}

function defaultCommunity() {
  const createdAt = new Date().toISOString();
  return {
    profiles: {},
    rooms: [
      { id: "group-general", kind: "group", name: "Village Commons", description: "A welcoming place for everyday questions, encouragement, and shared experiences.", createdAt },
      { id: "group-school", kind: "group", name: "School & IEP Circle", description: "Share school-navigation experiences and preparation ideas.", createdAt },
      { id: "group-recreation", kind: "group", name: "Inclusive Recreation", description: "Exchange ideas for calm, accessible, and inclusive activities.", createdAt }
    ],
    members: [],
    messages: [],
    connections: []
  };
}

async function loadCommunity() {
  try {
    const saved = JSON.parse(await readFile(COMMUNITY_FILE, "utf8"));
    const base = defaultCommunity();
    return { ...base, ...saved, profiles: saved.profiles || {}, rooms: Array.isArray(saved.rooms) && saved.rooms.length ? saved.rooms : base.rooms, members: saved.members || [], messages: saved.messages || [], connections: saved.connections || [] };
  } catch { return defaultCommunity(); }
}

async function saveCommunity(community) {
  await saveJsonAtomically(COMMUNITY_FILE, community);
}

async function localCommunityOverview(user, community) {
  const users = await loadUsers();
  const ownProfile = community.profiles[user.id];
  const groups = community.rooms.filter((room) => room.kind === "group").map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    member_count: community.members.filter((member) => member.roomId === room.id).length,
    joined: community.members.some((member) => member.roomId === room.id && member.userId === user.id)
  }));
  if (!ownProfile?.enabled) return { enabled: false, displayName: ownProfile?.displayName || safeDisplayName(user.name), groups, recommendations: [], incoming: [], outgoing: [], directRooms: [] };
  const recommendations = users.filter((candidate) => candidate.id !== user.id && community.profiles[candidate.id]?.enabled && !community.connections.some((connection) => connection.pairKey === pairKey(user.id, candidate.id))).map((candidate) => {
    const match = communitySimilarity(user.profile, candidate.profile);
    return { userId: candidate.id, displayName: community.profiles[candidate.id].displayName, score: match.score, reasons: match.reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)).slice(0, 6);
  const withName = (connection, userId) => ({ id: connection.id, user_id: userId, display_name: community.profiles[userId]?.displayName || "Village member", created_at: connection.createdAt });
  const incoming = community.connections.filter((item) => item.recipientId === user.id && item.status === "pending").map((item) => withName(item, item.requesterId));
  const outgoing = community.connections.filter((item) => item.requesterId === user.id && item.status === "pending").map((item) => withName(item, item.recipientId));
  const directRooms = community.rooms.filter((room) => room.kind === "direct" && community.members.some((member) => member.roomId === room.id && member.userId === user.id)).map((room) => {
    const otherId = community.members.find((member) => member.roomId === room.id && member.userId !== user.id)?.userId;
    return { id: room.id, name: community.profiles[otherId]?.displayName || "Private conversation" };
  });
  return { enabled: true, displayName: ownProfile.displayName, groups, recommendations, incoming, outgoing, directRooms };
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
  const session = sessions.get(sessionKey(token));
  if (!session || session.expiresAt <= Date.now()) return null;
  const users = await loadUsers();
  return users.find((user) => user.id === session.userId) || null;
}

async function setSession(userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(sessionKey(token), { userId, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  await saveSessions();
  return `capy_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
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
  const valuesAt = (values, labels) => labels.map((label) => valueAt(values, label, -1)).filter(Boolean);

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
      const tags = ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"].map((label, index) => valueAt(values, label, index + 6)).filter(Boolean);
      const locations = ["Location1", "Location2", "Location3", "Location4"]
        .map((label, index) => valueAt(values, label, index + 12))
        .filter(Boolean);
      const issues = valuesAt(values, ["Issues", "Issue", "Issue1", "Issue2", "Issue3", "Issue4"])
        .flatMap((value) => value.split(/[,;/]/))
        .map((value) => value.trim())
        .filter(Boolean);
      return {
        url,
        name: valueAt(values, "Resource Name", -1) || valueAt(values, "Name", -1) || deriveName(description, url),
        description,
        diagnosis,
        categories: categories.length ? categories : ["Education"],
        age: valueAt(values, "Age", 5) || "All ages",
        tags,
        issues,
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

function normalizeIp(value) {
  const candidate = String(Array.isArray(value) ? value[0] : value || "")
    .split(",")[0]
    .trim()
    .replace(/^::ffff:/, "");
  return isIP(candidate) ? candidate : "";
}

function isPrivateIp(ip) {
  if (!ip || ip === "::1") return true;
  if (ip.includes(":")) return /^(fc|fd|fe80)/i.test(ip);
  const parts = ip.split(".").map(Number);
  return parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function requestIp(req) {
  const forwarded = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const ip = normalizeIp(forwarded);
  return isPrivateIp(ip) ? "" : ip;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function getEnvironment(req, force = false) {
  const ip = requestIp(req);
  const cacheKey = createHash("sha256").update(ip || "local-preview").digest("hex");
  const cached = environmentCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.time < ENVIRONMENT_CACHE_MS) return cached.value;

  const geoUrl = ip ? `https://reallyfreegeoip.org/json/${encodeURIComponent(ip)}` : "https://reallyfreegeoip.org/json/";
  const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
  if (!geoResponse.ok) throw new Error(`IP location returned ${geoResponse.status}.`);
  const geo = await geoResponse.json();
  if (geo.error) throw new Error("Approximate IP location is unavailable.");

  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("IP location did not include coordinates.");

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,is_day,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "1"
  }).toString();
  const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
  if (!weatherResponse.ok) throw new Error(`Open-Meteo returned ${weatherResponse.status}.`);
  const weather = await weatherResponse.json();

  const value = {
    location: {
      city: String(geo.city || ""),
      region: String(geo.region_name || ""),
      country: String(geo.country_name || ""),
      countryCode: String(geo.country_code || ""),
      timezone: String(weather.timezone || geo.time_zone || "UTC"),
      approximate: true
    },
    hemisphere: latitude < 0 ? "south" : "north",
    current: {
      time: String(weather.current?.time || ""),
      temperature: finiteNumber(weather.current?.temperature_2m),
      apparentTemperature: finiteNumber(weather.current?.apparent_temperature),
      isDay: Boolean(weather.current?.is_day),
      weatherCode: finiteNumber(weather.current?.weather_code),
      cloudCover: finiteNumber(weather.current?.cloud_cover),
      precipitation: finiteNumber(weather.current?.precipitation),
      rain: finiteNumber(weather.current?.rain),
      snowfall: finiteNumber(weather.current?.snowfall),
      windSpeed: finiteNumber(weather.current?.wind_speed_10m)
    },
    sun: {
      sunrise: String(weather.daily?.sunrise?.[0] || ""),
      sunset: String(weather.daily?.sunset?.[0] || "")
    },
    source: "Open-Meteo",
    fetchedAt: new Date().toISOString()
  };

  environmentCache.set(cacheKey, { time: Date.now(), value });
  if (environmentCache.size > 200) environmentCache.delete(environmentCache.keys().next().value);
  return value;
}

function profileSummary(responses = {}) {
  const interests = Array.isArray(responses.interests) ? responses.interests.join(", ") : "neurodiversity";
  const situation = Array.isArray(responses.situation) ? responses.situation.join(", ") : responses.situation || "not specified";
  return `Exploring ${interests}. Age group: ${responses.age || "not specified"}. Journey: ${responses.journey || "not specified"}. Current situation: ${situation}. ${responses.note ? `Priority: ${responses.note}` : ""}`.trim();
}

function deterministicAnswer(topic, description, matches) {
  const names = matches.slice(0, 3).map((item) => item.name).join(", ");
  return `Waffles found ${matches.length} promising ${topic.toLowerCase()} resources for “${description}”. Start with ${names}. Each result was scored against its tags first, then its description and possible issue conflicts. Please confirm eligibility, cost, and current availability directly with each provider.`;
}

function responseText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function expandKeywordsWithAI({ topic, description, profile, directKeywords, limit }) {
  const key = process.env.OPENAI_API_KEY;
  const fallback = heuristicKeywordExpansion(directKeywords, limit);
  if (!key) return { keywords: fallback, ai: false };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "keyword_expansion",
            strict: true,
            schema: {
              type: "object",
              properties: { keywords: { type: "array", items: { type: "string" }, maxItems: limit } },
              required: ["keywords"],
              additionalProperties: false
            }
          }
        },
        instructions: "Suggest only short search synonyms, related resource tags, category terms, and common alternative phrases. Do not answer the user or add sensitive inferences. Avoid duplicates and keep phrases under five words.",
        input: JSON.stringify({ topic, query: description, personalRecord: profile?.summary || "", directKeywords })
      }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`keyword expansion returned ${response.status}`);
    const parsed = JSON.parse(responseText(await response.json()) || "{}");
    const keywords = extractKeywords(parsed.keywords || [], limit).filter((keyword) => !directKeywords.includes(keyword));
    return { keywords: [...new Set([...keywords, ...fallback])].slice(0, limit), ai: true };
  } catch (error) {
    console.warn(`AI keyword expansion fallback: ${error.message}`);
    return { keywords: fallback, ai: false };
  }
}

async function callOpenAI({ topic, description, profile, matches }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = {
    topic,
    userDescription: description,
    personalRecord: profile?.summary || "No personal record available",
    candidateResources: matches.map(({ name, description: detail, url, age, location, price, tags, score, explanation }) => ({ name, detail, url, age, location, price, tags, score, explanation }))
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: "You are Waffles, a warm animated capybara resource guide. Recommend only from candidateResources. Treat their score explanations as ranking evidence. Do not diagnose, promise outcomes, or invent facts or URLs. Explain why the top options fit. Encourage the user to verify eligibility, cost, and availability. If the request suggests immediate danger, direct them to emergency services first. Use plain, calm language and under 180 words.",
      input: JSON.stringify(input)
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const data = await response.json();
  return responseText(data);
}

async function localChatHistory(userId) {
  const community = await loadCommunity();
  return community.messages.filter((message) => message.userId === userId).slice(-100).map((message) => ({
    room: community.rooms.find((room) => room.id === message.roomId)?.name || "Village chat",
    message: message.body,
    at: message.createdAt
  }));
}

async function syncUserRecord(user) {
  const webhook = process.env.USER_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
  const chatHistory = await localChatHistory(user.id);
  const payload = {
    "User name": user.name,
    "Password": "Not stored — secure hash only",
    "response of survey": JSON.stringify(user.profile?.responses || {}),
    "AI personal record": user.profile?.summary || "",
    "history": JSON.stringify(user.history || []),
    "feedback": user.feedback || "",
    "Chat History": JSON.stringify(chatHistory),
    "Email": user.email,
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
    return sendJson(res, 200, { ok: true, storage: "local-json", persistentSessions: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), userSheetConfigured: Boolean(process.env.USER_SHEET_WEBHOOK_URL) });
  }

  if (req.method === "GET" && url.pathname === "/api/scoring-config") {
    const config = await loadScoringConfig();
    return sendJson(res, 200, { version: config.version, weights: config.weights, limits: config.limits });
  }

  if (req.method === "GET" && url.pathname === "/api/environment") {
    try {
      return sendJson(res, 200, await getEnvironment(req, url.searchParams.get("refresh") === "1"));
    } catch (error) {
      console.error("Environment update failed:", error.message);
      return sendError(res, 503, "Local weather is temporarily unavailable.");
    }
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
    return sendJson(res, 201, { user: safeUser(user), sync }, { "Set-Cookie": await setSession(user.id) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await readJsonBody(req);
    const users = await loadUsers();
    const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return sendError(res, 401, "Email or password is incorrect.");
    return sendJson(res, 200, { user: safeUser(user) }, { "Set-Cookie": await setSession(user.id) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).capy_session;
    sessions.delete(sessionKey(token));
    await saveSessions();
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

  if (req.method === "GET" && url.pathname === "/api/community") {
    const community = await loadCommunity();
    return sendJson(res, 200, await localCommunityOverview(user, community));
  }

  if (req.method === "POST" && url.pathname === "/api/community/settings") {
    const input = await readJsonBody(req);
    const community = await loadCommunity();
    const existing = community.profiles[user.id] || {};
    community.profiles[user.id] = { ...existing, enabled: Boolean(input.enabled), displayName: safeDisplayName(input.displayName, safeDisplayName(user.name)), updatedAt: new Date().toISOString() };
    await saveCommunity(community);
    return sendJson(res, 200, await localCommunityOverview(user, community));
  }

  const roomMatch = url.pathname.match(/^\/api\/community\/rooms\/([^/]+)(?:\/(join|messages))?$/);
  if (roomMatch) {
    const roomId = decodeURIComponent(roomMatch[1]);
    const operation = roomMatch[2] || "";
    const community = await loadCommunity();
    if (!community.profiles[user.id]?.enabled) return sendError(res, 403, "Join the community before using chat.");
    const room = community.rooms.find((item) => item.id === roomId);
    if (!room) return sendError(res, 404, "Chat room not found.");
    if (req.method === "POST" && operation === "join") {
      if (room.kind !== "group") return sendError(res, 403, "Private conversations cannot be joined directly.");
      if (!community.members.some((member) => member.roomId === roomId && member.userId === user.id)) community.members.push({ roomId, userId: user.id, joinedAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (!community.members.some((member) => member.roomId === roomId && member.userId === user.id)) return sendError(res, 403, "Join this room before reading or sending messages.");
    if (req.method === "GET" && operation === "messages") {
      const messages = community.messages.filter((message) => message.roomId === roomId).slice(-100).map((message) => ({ ...message, author: community.profiles[message.userId]?.displayName || "Village member", mine: message.userId === user.id }));
      return sendJson(res, 200, { room: { id: room.id, name: room.name, kind: room.kind }, messages });
    }
    if (req.method === "POST" && operation === "messages") {
      const messageBody = String((await readJsonBody(req)).message || "").trim().slice(0, 1000);
      if (!messageBody) return sendError(res, 400, "Write a message first.");
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: messageBody, createdAt: new Date().toISOString() };
      community.messages.push(message);
      community.messages = community.messages.slice(-5000);
      await saveCommunity(community);
      let sync = { synced: false };
      try { sync = await syncUserRecord(user); } catch (error) { sync = { synced: false, reason: error.message }; }
      return sendJson(res, 201, { message: { ...message, author: community.profiles[user.id].displayName, mine: true }, sync });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/community/connect") {
    const targetUserId = String((await readJsonBody(req)).targetUserId || "");
    const community = await loadCommunity();
    if (!targetUserId || targetUserId === user.id) return sendError(res, 400, "Choose another community member.");
    if (!community.profiles[user.id]?.enabled || !community.profiles[targetUserId]?.enabled) return sendError(res, 403, "Both members must opt in to community matching.");
    const key = pairKey(user.id, targetUserId);
    if (community.connections.some((item) => item.pairKey === key)) return sendError(res, 409, "A connection request or private chat already exists.");
    community.connections.push({ id: randomBytes(12).toString("hex"), pairKey: key, requesterId: user.id, recipientId: targetUserId, status: "pending", roomId: null, createdAt: new Date().toISOString() });
    await saveCommunity(community);
    return sendJson(res, 201, { ok: true });
  }

  const connectionMatch = url.pathname.match(/^\/api\/community\/connections\/([^/]+)\/(accept|decline)$/);
  if (req.method === "POST" && connectionMatch) {
    const community = await loadCommunity();
    const connection = community.connections.find((item) => item.id === decodeURIComponent(connectionMatch[1]) && item.recipientId === user.id && item.status === "pending");
    if (!connection) return sendError(res, 404, "Connection request not found.");
    if (connectionMatch[2] === "decline") {
      connection.status = "declined";
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    const roomId = `direct-${randomBytes(12).toString("hex")}`;
    connection.status = "accepted";
    connection.roomId = roomId;
    community.rooms.push({ id: roomId, kind: "direct", name: "Private conversation", description: "", createdAt: new Date().toISOString() });
    community.members.push({ roomId, userId: connection.requesterId, joinedAt: new Date().toISOString() }, { roomId, userId: connection.recipientId, joinedAt: new Date().toISOString() });
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true, roomId });
  }

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
    const { topic = "Education", description = "", count } = await readJsonBody(req);
    if (String(description).trim().length < 8) return sendError(res, 400, "Tell Waffles a little more so the recommendations can be useful.");
    const { rows, source } = await getResources();
    const config = await loadScoringConfig();
    const profileInputs = [user.profile?.responses?.age, ...(user.profile?.responses?.interests || []), ...(user.profile?.responses?.situation || []), user.profile?.responses?.note];
    const directKeywords = extractKeywords([topic, description, ...profileInputs], config.limits.maximumDirectKeywords);
    const expanded = await expandKeywordsWithAI({ topic, description, profile: user.profile, directKeywords, limit: config.limits.maximumSuggestedKeywords });
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const matches = rankResources(rows, { directKeywords, suggestedKeywords: expanded.keywords, issuePreferences, count, config });
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
    return sendJson(res, 200, {
      answer,
      resources: matches,
      source,
      ai,
      keywordExpansion: { ai: expanded.ai, suggested: expanded.keywords },
      scoring: { version: config.version, minimumScore: config.limits.minimumScore },
      sync
    });
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
    "Cache-Control": ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css" ? "no-cache" : "public, max-age=3600",
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
    console.log(`It Takes a Village is running at http://127.0.0.1:${port}`);
  });
}
