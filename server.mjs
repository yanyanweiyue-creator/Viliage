import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { DEFAULT_SCORE_CONFIG, clarificationQuestions, extractGateKeywords, extractKeywords, extractLifeStages, heuristicKeywordExpansion, inferIssuePreferences, normalizeResultCount, rankResources } from "./scoring-engine.mjs";
import { communitySimilarity, containsBlockedLanguage, pairKey, safeDisplayName } from "./community-logic.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const USERS_FILE = process.env.USERS_FILE || join(DATA_DIR, "users.json");
const SESSIONS_FILE = process.env.SESSIONS_FILE || join(DATA_DIR, "sessions.json");
const COMMUNITY_FILE = process.env.COMMUNITY_FILE || join(DATA_DIR, "community.json");
const PASSWORD_RESETS_FILE = process.env.PASSWORD_RESETS_FILE || join(DATA_DIR, "password-resets.json");
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
    connections: [],
    blocks: [],
    roomPreferences: {},
    posts: [],
    groupInvites: []
  };
}

async function loadCommunity() {
  try {
    const saved = JSON.parse(await readFile(COMMUNITY_FILE, "utf8"));
    const base = defaultCommunity();
    return { ...base, ...saved, profiles: saved.profiles || {}, rooms: Array.isArray(saved.rooms) && saved.rooms.length ? saved.rooms : base.rooms, members: saved.members || [], messages: saved.messages || [], connections: saved.connections || [], blocks: saved.blocks || [], roomPreferences: saved.roomPreferences || {}, posts: saved.posts || [], groupInvites: saved.groupInvites || [] };
  } catch { return defaultCommunity(); }
}

async function saveCommunity(community) {
  await saveJsonAtomically(COMMUNITY_FILE, community);
}

function localFriends(community, firstId, secondId) {
  return community.connections.some((item) => item.status === "accepted" && ((item.requesterId === firstId && item.recipientId === secondId) || (item.requesterId === secondId && item.recipientId === firstId)));
}

function localBlocked(community, firstId, secondId) {
  return community.blocks.some((item) => (item.blockerId === firstId && item.blockedId === secondId) || (item.blockerId === secondId && item.blockedId === firstId));
}

function cleanupLocalSystemHistory(community) {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const systemIds = new Set(community.rooms.filter((room) => room.kind === "group" && !room.createdBy).map((room) => room.id));
  community.messages = community.messages.filter((message) => !systemIds.has(message.roomId) || new Date(message.createdAt).getTime() >= cutoff);
}

function localRoomPreference(community, roomId, userId) {
  return community.roomPreferences[`${roomId}:${userId}`] || {};
}

function safeImageDataUrl(value) {
  const image = String(value || "");
  if (!image) return null;
  if (image.length > 750000 || !/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(image)) throw new Error("Use a PNG, JPEG, WebP, or GIF image smaller than about 550 KB.");
  return image;
}

async function localCommunityOverview(user, community) {
  const users = await loadUsers();
  const ownProfile = community.profiles[user.id];
  const groups = community.rooms.filter((room) => room.kind === "group" && (!room.createdBy || community.members.some((member) => member.roomId === room.id && member.userId === user.id))).map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    member_count: community.members.filter((member) => member.roomId === room.id).length,
    joined: community.members.some((member) => member.roomId === room.id && member.userId === user.id),
    created_by: room.createdBy || null,
    system_managed: room.createdBy ? 0 : 1,
    pinned: Boolean(localRoomPreference(community, room.id, user.id).pinnedAt)
  })).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  if (!ownProfile?.enabled) return { enabled: false, displayName: ownProfile?.displayName || safeDisplayName(user.name), groups, recommendations: [], incoming: [], outgoing: [], directRooms: [] };
  const recommendations = users.filter((candidate) => candidate.id !== user.id && community.profiles[candidate.id]?.enabled && !localBlocked(community, user.id, candidate.id) && !community.connections.some((connection) => connection.pairKey === pairKey(user.id, candidate.id))).map((candidate) => {
    const match = communitySimilarity(user.profile, candidate.profile);
    return { userId: candidate.id, displayName: community.profiles[candidate.id].displayName, score: match.score, reasons: match.reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)).slice(0, 6);
  const withName = (connection, userId) => ({ id: connection.id, user_id: userId, display_name: community.profiles[userId]?.displayName || "Village member", created_at: connection.createdAt });
  const incoming = community.connections.filter((item) => item.recipientId === user.id && item.status === "pending").map((item) => withName(item, item.requesterId));
  const outgoing = community.connections.filter((item) => item.requesterId === user.id && item.status === "pending").map((item) => withName(item, item.recipientId));
  const directRooms = community.rooms.filter((room) => room.kind === "direct" && community.members.some((member) => member.roomId === room.id && member.userId === user.id)).map((room) => {
    const otherId = community.members.find((member) => member.roomId === room.id && member.userId !== user.id)?.userId;
    const other = users.find((item) => item.id === otherId);
    return { id: room.id, user_id: otherId, email: other?.email || "", name: community.profiles[otherId]?.displayName || "Private conversation", pinned: Boolean(localRoomPreference(community, room.id, user.id).pinnedAt) };
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const blocks = community.blocks.filter((item) => item.blockerId === user.id).map((item) => ({ user_id: item.blockedId, display_name: community.profiles[item.blockedId]?.displayName || users.find((candidate) => candidate.id === item.blockedId)?.name || "Village member" }));
  const groupInvites = community.groupInvites.filter((invite) => invite.recipientId === user.id && invite.status === "pending").map((invite) => {
    const room = community.rooms.find((item) => item.id === invite.roomId);
    return { id: invite.id, room_id: invite.roomId, room_name: room?.name || "Group", description: room?.description || "", inviter_name: community.profiles[invite.inviterId]?.displayName || "Village member", created_at: invite.createdAt };
  });
  return { enabled: true, displayName: ownProfile.displayName, groups, recommendations, incoming, outgoing, directRooms, blocks, groupInvites };
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

function passwordResetHash(email, code) {
  return createHash("sha256").update(`${String(email).toLowerCase()}\u001f${String(code)}\u001f${process.env.PASSWORD_RESET_SECRET || "local-development-only"}`).digest("hex");
}

function resetCodeMatches(expected, actual) {
  const first = Buffer.from(String(expected || ""), "hex");
  const second = Buffer.from(String(actual || ""), "hex");
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
}

function createPasswordResetCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

async function loadPasswordResets() {
  try {
    const saved = JSON.parse(await readFile(PASSWORD_RESETS_FILE, "utf8"));
    return Array.isArray(saved) ? saved.filter((item) => Number(item.expiresAt) > Date.now() && Number(item.attempts || 0) < 5) : [];
  } catch { return []; }
}

async function savePasswordResets(resets) {
  await saveJsonAtomically(PASSWORD_RESETS_FILE, resets);
}

async function sendPasswordResetEmail(email, code) {
  const webhook = process.env.PASSWORD_EMAIL_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL;
  if (!webhook) return false;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-password-reset", email, code, expiresInMinutes: 10, fromAddress: process.env.PASSWORD_EMAIL_FROM_ADDRESS || "", fromName: process.env.PASSWORD_EMAIL_FROM_NAME || "It Takes a Village" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Password email webhook returned ${response.status}.`);
  const result = await response.json().catch(() => ({ ok: true }));
  if (result.ok === false) throw new Error(result.error || "Password email webhook failed.");
  return true;
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    surveyCompleted: Boolean(user.surveyCompleted),
    onboardingCompleted: user.onboardingCompleted === undefined ? true : Boolean(user.onboardingCompleted),
    profile: user.profile || null,
    history: user.history || [],
    feedback: user.feedback || "",
    likedResources: Array.isArray(user.likedResources) ? user.likedResources : [],
    dislikedResources: Array.isArray(user.dislikedResources) ? user.dislikedResources : []
  };
}

function guestUser() {
  return { id: "guest", name: "Guest", email: "", guest: true, surveyCompleted: true, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [] };
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
        ageRange: valueAt(values, "Age Range") || valueAt(values, "Age range") || valueAt(values, "Age", 5) || "All ages",
        lifeStage: valueAt(values, "Life Stage") || valueAt(values, "Life stage") || "",
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

function deterministicAnswer(topic, description, matches, language = "en") {
  const topicText = String(topic).toLowerCase();
  if (language === "zh") {
    if (!matches.length) return `Waffles 没有找到完全通过必要筛选的${topicText}资源：“${description}”。可以试着输入更宽泛的需求或地点关键词；诊断类型与建筑分类仍会作为硬性筛选保留。`;
    const names = matches.slice(0, 3).map((item) => item.name).join("、");
    return `Waffles 找到了 ${matches.length} 个可能合适的${topicText}资源，匹配你的需求：“${description}”。可以先看：${names}。每个结果都会先按标签评分，再参考描述和潜在冲突项。请直接向服务机构确认资格、费用和当前可用性。`;
  }
  if (language === "es") {
    if (!matches.length) return `Waffles no encontró un recurso de ${topicText} que pasara todos los filtros requeridos para “${description}”. Prueba una necesidad o ubicación más amplia; el diagnóstico y la categoría del edificio seguirán protegidos como filtros.`;
    const names = matches.slice(0, 3).map((item) => item.name).join(", ");
    return `Waffles encontró ${matches.length} recursos prometedores de ${topicText} para “${description}”. Empieza con ${names}. Cada resultado se puntuó primero por etiquetas, luego por descripción y posibles conflictos. Confirma requisitos, costo y disponibilidad directamente con cada proveedor.`;
  }
  if (!matches.length) return `Waffles did not find a ${topicText} resource that passed every required filter for “${description}”. Try one broader need or location phrase; diagnosis and building category will remain protected filters.`;
  const names = matches.slice(0, 3).map((item) => item.name).join(", ");
  return `Waffles found ${matches.length} promising ${topicText} resources for “${description}”. Start with ${names}. Each result was scored against its tags first, then its description and possible issue conflicts. Please confirm eligibility, cost, and current availability directly with each provider.`;
}

function responseLanguageName(language = "en") {
  if (language === "zh") return "Simplified Chinese";
  if (language === "es") return "Spanish";
  return "English";
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
  if (!key) return { keywords: [], ai: false };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4",
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
    return { keywords: [...new Set(keywords)].slice(0, limit), ai: true };
  } catch (error) {
    console.warn(`AI keyword expansion fallback: ${error.message}`);
    return { keywords: [], ai: false };
  }
}

async function callOpenAI({ topic, description, profile, matches, language = "en" }) {
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
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: `You are Waffles, a warm animated capybara resource guide. Recommend only from candidateResources. Treat their score explanations as ranking evidence. Do not diagnose, promise outcomes, or invent facts or URLs. Explain why the top options fit. Encourage the user to verify eligibility, cost, and availability. If the request suggests immediate danger, direct them to emergency services first. Use plain, calm language and under 180 words. Respond in ${responseLanguageName(language)}.`,
      input: JSON.stringify(input)
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const data = await response.json();
  return responseText(data);
}

const WAFFLES_VOICE_INSTRUCTIONS = "Voice style: a high-quality conversational AI companion voice: natural, fluid, emotionally responsive, and softly intelligent. Make it warmer and more tender than a default assistant voice, with a gentle feminine-leaning presence, relaxed pacing, light breath, and small natural pauses. It should feel patient, reassuring, and quick-minded, not robotic, formal, dramatic, commercial, or childish. Keep diction clear and calm, with subtle intonation that sounds like a thoughtful guide helping in real time.";

function ttsSpeed(value) {
  const speed = Number(value || 0.92);
  return Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 0.92;
}

async function generateWafflesSpeech({ text, language }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = String(text || "").trim().slice(0, 700);
  if (!input) return null;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "coral",
      input,
      instructions: `${WAFFLES_VOICE_INSTRUCTIONS} Speak in ${language === "zh" ? "Mandarin Chinese when the text is Chinese, otherwise natural English" : language === "es" ? "natural Spanish when the text is Spanish, otherwise natural English" : "natural English"}.`,
      speed: ttsSpeed(process.env.OPENAI_TTS_SPEED),
      response_format: "mp3"
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`OpenAI speech request failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function parseVoiceIntentWithAI({ transcript, context }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const schema = {
    type: "object",
    properties: {
      action: { type: "string", enum: ["select_island", "open_building", "open_guide", "open_waffles", "search_resources", "open_settings", "open_record", "close_panel", "home", "next", "back", "scroll", "ask_followup"] },
      island: { type: ["string", "null"], enum: ["autism", "adhd", null] },
      buildingId: { type: ["string", "null"] },
      buildingType: { type: ["string", "null"], enum: ["support", "activity", "ai", null] },
      topic: { type: ["string", "null"], enum: ["Education", "Legal", "Recreation", "Caregiver Support", null] },
      direction: { type: ["string", "null"], enum: ["up", "down", null] },
      followUpQuestion: { type: ["string", "null"] },
      searchQuery: { type: ["string", "null"] },
      speech: { type: "string" },
      confidence: { type: "number" }
    },
    required: ["action", "island", "buildingId", "buildingType", "topic", "direction", "followUpQuestion", "searchQuery", "speech", "confidence"],
    additionalProperties: false
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "voice_navigation_intent", strict: true, schema } },
      instructions: "Map natural voice requests to website navigation and resource research for an accessibility assistant. Understand loose, spoken phrases like 'show me the next part', 'open Waffles', 'what is this website', 'who made this', 'take me to school help', 'research 504 plans', 'find resources for executive function', 'compare legal support', or 'I need legal stuff'. Use search_resources when the user asks to research, find, search, compare, look up, or match resources; infer the closest topic and copy the concrete need into searchQuery. Use open_guide for Waffles, site overview, creator, or story requests. Use ask_followup only when the target is genuinely unclear. Do not invent unsupported actions. Keep speech short, warm, and plain.",
      input: JSON.stringify({ transcript: String(transcript || "").slice(0, 500), context })
    }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`OpenAI voice intent returned ${response.status}.`);
  return JSON.parse(responseText(await response.json()) || "{}");
}

function guideActionSchema() {
  return {
    type: "object",
    properties: {
      answer: { type: "string" },
      suggestedActions: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            action: { type: "string", enum: ["select_island", "open_building", "open_settings", "open_record", "none"] },
            island: { type: ["string", "null"], enum: ["autism", "adhd", null] },
            buildingId: { type: ["string", "null"] },
            buildingType: { type: ["string", "null"], enum: ["support", "activity", "ai", null] },
            topic: { type: ["string", "null"], enum: ["Education", "Legal", "Recreation", "Caregiver Support", null] }
          },
          required: ["label", "action", "island", "buildingId", "buildingType", "topic"],
          additionalProperties: false
        }
      }
    },
    required: ["answer", "suggestedActions"],
    additionalProperties: false
  };
}

function localGuideAnswer({ message = "", language = "en" }) {
  const text = String(message || "").toLowerCase();
  const zh = language === "zh";
  const es = language === "es";
  const base = zh
    ? "我是 Waffles，这个网站的互动向导。我可以介绍 It Takes a Village、解释每座岛和建筑的用途，并带你去合适的地方。"
    : es
      ? "Soy Waffles, la guía interactiva del sitio. Puedo explicar It Takes a Village, presentar las islas y edificios, y llevarte al lugar adecuado."
      : "I’m Waffles, the interactive site guider. I can explain It Takes a Village, introduce each island and building, and help you move to the right place.";
  const actions = [];
  if (text.includes("legal") || text.includes("law") || text.includes("法律")) actions.push({ label: zh ? "去法律建筑" : es ? "Ir a Legal" : "Go to Legal", action: "open_building", island: null, buildingId: null, buildingType: "ai", topic: "Legal" });
  else if (text.includes("school") || text.includes("education") || text.includes("教育")) actions.push({ label: zh ? "去教育建筑" : es ? "Ir a Educación" : "Go to Education", action: "open_building", island: null, buildingId: null, buildingType: "ai", topic: "Education" });
  else if (text.includes("park") || text.includes("activity") || text.includes("recreation") || text.includes("活动") || text.includes("休闲")) actions.push({ label: zh ? "去活动建筑" : es ? "Ir a Recreación" : "Go to Recreation", action: "open_building", island: null, buildingId: null, buildingType: "ai", topic: "Recreation" });
  else if (text.includes("support") || text.includes("contact") || text.includes("联系") || text.includes("支持")) actions.push({ label: zh ? "去支持建筑" : es ? "Ir a Apoyo" : "Go to Support", action: "open_building", island: null, buildingId: null, buildingType: "support", topic: "Caregiver Support" });
  else actions.push({ label: zh ? "查看两座岛" : es ? "Ver las islas" : "View the islands", action: "select_island", island: "autism", buildingId: null, buildingType: null, topic: null });
  return { answer: base, suggestedActions: actions };
}

function normalizeGuideResponse(value, fallback) {
  const answer = String(value?.answer || fallback.answer || "").trim().slice(0, 800);
  const suggestedActions = (Array.isArray(value?.suggestedActions) ? value.suggestedActions : fallback.suggestedActions)
    .slice(0, 3)
    .map((item) => ({
      label: String(item.label || "").slice(0, 80),
      action: ["select_island", "open_building", "open_settings", "open_record", "none"].includes(item.action) ? item.action : "none",
      island: ["autism", "adhd"].includes(item.island) ? item.island : null,
      buildingId: String(item.buildingId || "") || null,
      buildingType: ["support", "activity", "ai"].includes(item.buildingType) ? item.buildingType : null,
      topic: ["Education", "Legal", "Recreation", "Caregiver Support"].includes(item.topic) ? item.topic : null
    }))
    .filter((item) => item.label);
  return { answer, suggestedActions };
}

async function guideChat({ message, language = "en", context = {} }) {
  const fallback = localGuideAnswer({ message, language });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ...fallback, ai: false };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "low" },
      text: { verbosity: "low", format: { type: "json_schema", name: "waffles_site_guide", strict: true, schema: guideActionSchema() } },
      instructions: `You are Waffles, the warm interactive site guide for It Takes a Village. Explain only the website, its story, its creators, navigation, islands, buildings, saved/disliked resources, records, settings, and voice controls. The creators are SNP- Group D, 2026, cohort3. Do not recommend specific resources or provider names. If the user asks for resources, guide them to the right building instead. Keep answers under 130 words, calm, friendly, and practical. Respond in ${responseLanguageName(language)}.`,
      input: JSON.stringify({
        userMessage: String(message || "").slice(0, 700),
        context,
        buildings: [
          { label: "School", topic: "Education", action: "open_building" },
          { label: "Courthouse", topic: "Legal", action: "open_building" },
          { label: "Park", topic: "Recreation", action: "open_building" },
          { label: "Village", topic: "Caregiver Support", action: "open_building" },
          { label: "Settings", action: "open_settings" },
          { label: "My record", action: "open_record" }
        ]
      })
    }),
    signal: AbortSignal.timeout(18_000)
  });
  if (!response.ok) throw new Error(`OpenAI guide request failed (${response.status}).`);
  const parsed = JSON.parse(responseText(await response.json()) || "{}");
  return { ...normalizeGuideResponse(parsed, fallback), ai: true };
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
    "Save resource": JSON.stringify(user.likedResources || []),
    "Like resource": JSON.stringify(user.likedResources || []),
    "Dislike resource": JSON.stringify(user.dislikedResources || []),
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

function errorLogPayload({ event, reason, user, topic = "", diagnosis = "", description = "", requestedCount = "", providedCount = "", highScoreCount = "", source = "", resource = null }) {
  const at = new Date().toISOString();
  return {
    action: "log-resource-error",
    spreadsheetId: process.env.ERROR_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0",
    sheetGid: process.env.ERROR_SHEET_GID || "",
    Timestamp: at,
    At: at,
    Event: event,
    Reason: reason,
    "User name": user?.name || "",
    Email: user?.email || "",
    userId: user?.id || "",
    Topic: topic || resource?.topic || "",
    Diagnosis: diagnosis,
    "Search description": description,
    "Requested resources": requestedCount,
    "Provided resources": providedCount,
    "High score resources": highScoreCount,
    "Resource name": resource?.name || "",
    "Resource URL": resource?.url || "",
    "Resource score": resource?.score ?? "",
    "Resource description": resource?.description || "",
    Source: source,
    Helpful: "No",
    helpful: "No"
  };
}

async function logErrorRecord(details) {
  const webhook = process.env.ERROR_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "ERROR_SHEET_WEBHOOK_URL is not configured." };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(errorLogPayload(details)),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Error sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "Error sheet rejected the update.");
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

function resourceIdentityKey(resource) {
  return `${String(resource?.name || "").trim().toLowerCase()}|${String(resource?.url || "").trim().toLowerCase()}`;
}

function resourceSnapshot(resource) {
  const name = String(resource.name || "").trim().slice(0, 180);
  const urlValue = String(resource.url || "").trim().slice(0, 500);
  if (!name || !urlValue) return null;
  return {
    name,
    url: urlValue,
    description: String(resource.description || "").trim().slice(0, 500),
    topic: String(resource.topic || "").trim().slice(0, 80),
    score: Number(resource.score || 0),
    savedAt: new Date().toISOString()
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, storage: "local-json", persistentSessions: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), userSheetConfigured: Boolean(process.env.USER_SHEET_WEBHOOK_URL), errorSheetConfigured: Boolean(process.env.ERROR_SHEET_WEBHOOK_URL), passwordEmailConfigured: Boolean(process.env.PASSWORD_EMAIL_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL), passwordEmailUsesUserSheetWebhook: !process.env.PASSWORD_EMAIL_WEBHOOK_URL && Boolean(process.env.USER_SHEET_WEBHOOK_URL), passwordEmailSender: process.env.PASSWORD_EMAIL_FROM_ADDRESS || "" });
  }

  if (req.method === "POST" && url.pathname === "/api/voice/narrate") {
    const { text = "", language = "en" } = await readJsonBody(req);
    const audio = await generateWafflesSpeech({ text, language });
    if (!audio) return sendError(res, 503, "Waffles voice is not configured.");
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
    return res.end(audio);
  }

  if (req.method === "POST" && url.pathname === "/api/voice/command") {
    const { transcript = "", context = {} } = await readJsonBody(req);
    if (!String(transcript).trim()) return sendError(res, 400, "Voice command is empty.");
    const intent = await parseVoiceIntentWithAI({ transcript, context });
    if (!intent) return sendError(res, 503, "Voice command AI is not configured.");
    return sendJson(res, 200, intent);
  }

  if (req.method === "POST" && url.pathname === "/api/guide/chat") {
    const { message = "", language = "en", context = {} } = await readJsonBody(req);
    if (!String(message).trim()) return sendError(res, 400, "Guide message is empty.");
    try {
      return sendJson(res, 200, await guideChat({ message, language, context }));
    } catch (error) {
      console.warn("Guide chat fallback:", error.message);
      return sendJson(res, 200, { ...localGuideAnswer({ message, language }), ai: false });
    }
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

  if (req.method === "POST" && url.pathname === "/api/auth/password/request") {
    const { email = "" } = await readJsonBody(req);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return sendError(res, 400, "Please enter a valid email address.");
    const deliveryAvailable = Boolean(process.env.PASSWORD_EMAIL_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL);
    const generic = { ok: true, deliveryAvailable, senderAddress: process.env.PASSWORD_EMAIL_FROM_ADDRESS || "", message: "If an account exists for that email, a six-digit code will arrive shortly." };
    const users = await loadUsers();
    const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
    if (!user) {
      passwordResetHash(normalizedEmail, "000000");
      return sendJson(res, 202, generic);
    }
    const now = Date.now();
    const resets = await loadPasswordResets();
    const existing = resets.find((item) => item.email === normalizedEmail);
    if (existing && now - Number(existing.requestedAt) < 60_000) return sendJson(res, 202, generic);
    const code = createPasswordResetCode();
    const next = resets.filter((item) => item.email !== normalizedEmail);
    next.push({ email: normalizedEmail, codeHash: passwordResetHash(normalizedEmail, code), expiresAt: now + 10 * 60_000, attempts: 0, requestedAt: now });
    await savePasswordResets(next);
    try { await sendPasswordResetEmail(normalizedEmail, code); }
    catch (error) { console.error("Password reset email failed:", error.message); }
    return sendJson(res, 202, generic);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password/confirm") {
    const { email = "", code = "", password = "" } = await readJsonBody(req);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !/^\d{6}$/.test(String(code))) return sendError(res, 400, "The verification code is invalid or expired.");
    if (String(password).length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
    const resets = await loadPasswordResets();
    const reset = resets.find((item) => item.email === normalizedEmail);
    const submittedHash = passwordResetHash(normalizedEmail, code);
    if (!reset || Number(reset.expiresAt) < Date.now() || Number(reset.attempts) >= 5 || !resetCodeMatches(reset.codeHash, submittedHash)) {
      if (reset) {
        reset.attempts = Number(reset.attempts || 0) + 1;
        await savePasswordResets(resets);
      }
      return sendError(res, 400, "The verification code is invalid or expired.");
    }
    const users = await loadUsers();
    const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
    if (!user) return sendError(res, 400, "The verification code is invalid or expired.");
    user.passwordHash = hashPassword(String(password));
    user.updatedAt = new Date().toISOString();
    await saveUsers(users);
    await savePasswordResets(resets.filter((item) => item.email !== normalizedEmail));
    for (const [key, session] of sessions.entries()) if (session.userId === user.id) sessions.delete(key);
    await saveSessions();
    return sendJson(res, 200, { ok: true, message: "Your password has been reset. You can now log in." });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const { name, email, password } = await readJsonBody(req);
    if (!String(name || "").trim()) return sendError(res, 400, "Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return sendError(res, 400, "Please enter a valid email.");
    if (String(password || "").length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
    const users = await loadUsers();
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) return sendError(res, 409, "An account with this email already exists.");
    const user = { id: randomBytes(12).toString("hex"), name: name.trim(), email: email.toLowerCase(), passwordHash: hashPassword(password), surveyCompleted: false, onboardingCompleted: false, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [], createdAt: new Date().toISOString() };
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

  if (req.method === "POST" && url.pathname === "/api/auth/guest") return sendJson(res, 200, { user: guestUser() });

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

  const user = await getSessionUser(req) || (req.headers["x-village-guest"] === "1" ? guestUser() : null);
  if (!user) return sendError(res, 401, "Please sign in first.");
  if (user.guest && url.pathname.startsWith("/api/community")) return sendError(res, 403, "Village Community is available to registered members only.");

  if (req.method === "GET" && url.pathname === "/api/community") {
    const community = await loadCommunity();
    return sendJson(res, 200, await localCommunityOverview(user, community));
  }

  if (req.method === "POST" && url.pathname === "/api/community/settings") {
    const input = await readJsonBody(req);
    const community = await loadCommunity();
    const existing = community.profiles[user.id] || {};
    const displayName = safeDisplayName(input.displayName, safeDisplayName(user.name));
    if (containsBlockedLanguage(displayName)) return sendError(res, 400, "Please choose a respectful community name.");
    community.profiles[user.id] = { ...existing, enabled: Boolean(input.enabled), displayName, updatedAt: new Date().toISOString() };
    await saveCommunity(community);
    return sendJson(res, 200, await localCommunityOverview(user, community));
  }

  if (req.method === "GET" && url.pathname === "/api/community/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
    if (query.length < 2) return sendJson(res, 200, { people: [] });
    const [community, users] = await Promise.all([loadCommunity(), loadUsers()]);
    const people = users.filter((candidate) => candidate.id !== user.id && community.profiles[candidate.id]?.enabled && !localBlocked(community, user.id, candidate.id))
      .map((candidate) => {
        const connection = community.connections.find((item) => item.pairKey === pairKey(user.id, candidate.id));
        const relationship = connection?.status === "accepted" ? "friend" : connection?.status === "pending" ? (connection.requesterId === user.id ? "outgoing" : "incoming") : "none";
        return { user_id: candidate.id, email: candidate.email, display_name: community.profiles[candidate.id]?.displayName || candidate.name, relationship, connection_id: connection?.id || null };
      })
      .filter((candidate) => candidate.email.toLowerCase().includes(query) || candidate.display_name.toLowerCase().includes(query)).slice(0, 20);
    return sendJson(res, 200, { people });
  }

  if (req.method === "POST" && url.pathname === "/api/community/groups") {
    const input = await readJsonBody(req);
    const community = await loadCommunity();
    if (!community.profiles[user.id]?.enabled) return sendError(res, 403, "Join the community before creating a group.");
    const memberIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String))].filter((id) => id && id !== user.id).slice(0, 30);
    if (memberIds.some((memberId) => !localFriends(community, user.id, memberId) || localBlocked(community, user.id, memberId))) return sendError(res, 403, "Groups can include accepted, unblocked friends only.");
    const room = { id: `group-${randomBytes(12).toString("hex")}`, kind: "group", name: safeDisplayName(input.name, "New group"), description: String(input.description || "").trim().slice(0, 240), createdBy: user.id, createdAt: new Date().toISOString() };
    if (containsBlockedLanguage(`${room.name} ${room.description}`)) return sendError(res, 400, "Please use respectful language for the group name and description.");
    community.rooms.push(room);
    community.members.push({ roomId: room.id, userId: user.id, role: "moderator", joinedAt: room.createdAt });
    community.groupInvites.push(...memberIds.map((memberId) => ({ id: randomBytes(12).toString("hex"), roomId: room.id, inviterId: user.id, recipientId: memberId, status: "pending", createdAt: room.createdAt, updatedAt: room.createdAt })));
    await saveCommunity(community);
    return sendJson(res, 201, { room: { id: room.id, name: room.name, description: room.description, systemManaged: false } });
  }

  const groupInviteMatch = url.pathname.match(/^\/api\/community\/group-invitations\/([^/]+)\/(accept|decline)$/);
  if (req.method === "POST" && groupInviteMatch) {
    const community = await loadCommunity();
    const invite = community.groupInvites.find((item) => item.id === decodeURIComponent(groupInviteMatch[1]) && item.recipientId === user.id && item.status === "pending");
    if (!invite) return sendError(res, 404, "Group invitation not found.");
    invite.status = groupInviteMatch[2] === "accept" ? "accepted" : "declined";
    invite.updatedAt = new Date().toISOString();
    if (groupInviteMatch[2] === "accept" && !community.members.some((member) => member.roomId === invite.roomId && member.userId === user.id)) community.members.push({ roomId: invite.roomId, userId: user.id, role: "member", joinedAt: invite.updatedAt });
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true, roomId: groupInviteMatch[2] === "accept" ? invite.roomId : null });
  }

  if (url.pathname === "/api/community/posts") {
    const community = await loadCommunity();
    if (req.method === "GET") {
      const users = await loadUsers();
      const posts = community.posts.filter((post) => {
        if (post.userId === user.id) return true;
        if (!localFriends(community, user.id, post.userId) || localBlocked(community, user.id, post.userId)) return false;
        return (!post.allowedUserIds?.length || post.allowedUserIds.includes(user.id)) && !post.deniedUserIds?.includes(user.id);
      }).slice(-100).reverse().map((post) => ({ ...post, author: community.profiles[post.userId]?.displayName || users.find((candidate) => candidate.id === post.userId)?.name || "Village member", mine: post.userId === user.id, allowedUserIds: post.userId === user.id ? post.allowedUserIds : undefined, deniedUserIds: post.userId === user.id ? post.deniedUserIds : undefined }));
      return sendJson(res, 200, { posts });
    }
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      const postBody = String(input.text || "").trim().slice(0, 2000);
      if (containsBlockedLanguage(postBody)) return sendError(res, 400, "Please remove harmful or abusive language before posting.");
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); } catch (error) { return sendError(res, 400, error.message); }
      if (!postBody && !imageDataUrl) return sendError(res, 400, "Add text or an image first.");
      const allowedUserIds = [...new Set((Array.isArray(input.allowedUserIds) ? input.allowedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      const deniedUserIds = [...new Set((Array.isArray(input.deniedUserIds) ? input.deniedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      if ([...allowedUserIds, ...deniedUserIds].some((targetId) => !localFriends(community, user.id, targetId) || localBlocked(community, user.id, targetId))) return sendError(res, 403, "Post visibility can include accepted, unblocked friends only.");
      const post = { id: randomBytes(12).toString("hex"), userId: user.id, body: postBody, imageDataUrl, allowedUserIds, deniedUserIds, createdAt: new Date().toISOString() };
      community.posts.push(post);
      community.posts = community.posts.slice(-1000);
      await saveCommunity(community);
      return sendJson(res, 201, { post });
    }
  }

  const postDeleteMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (req.method === "DELETE" && postDeleteMatch) {
    const community = await loadCommunity();
    const before = community.posts.length;
    community.posts = community.posts.filter((post) => post.id !== decodeURIComponent(postDeleteMatch[1]) || post.userId !== user.id);
    if (community.posts.length === before) return sendError(res, 404, "Post not found.");
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  const friendMatch = url.pathname.match(/^\/api\/community\/friends\/([^/]+)$/);
  if (req.method === "DELETE" && friendMatch) {
    const targetId = decodeURIComponent(friendMatch[1]);
    const community = await loadCommunity();
    community.connections = community.connections.filter((item) => !(item.status === "accepted" && item.pairKey === pairKey(user.id, targetId)));
    const directIds = new Set(community.rooms.filter((room) => room.kind === "direct" && community.members.some((member) => member.roomId === room.id && member.userId === user.id) && community.members.some((member) => member.roomId === room.id && member.userId === targetId)).map((room) => room.id));
    community.members = community.members.filter((member) => !(member.userId === user.id && directIds.has(member.roomId)));
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  const blockMatch = url.pathname.match(/^\/api\/community\/blocks\/([^/]+)$/);
  if (blockMatch && ["POST", "DELETE"].includes(req.method)) {
    const targetId = decodeURIComponent(blockMatch[1]);
    const community = await loadCommunity();
    if (!targetId || targetId === user.id) return sendError(res, 400, "Choose another member.");
    if (req.method === "DELETE") community.blocks = community.blocks.filter((item) => !(item.blockerId === user.id && item.blockedId === targetId));
    else {
      if (!community.blocks.some((item) => item.blockerId === user.id && item.blockedId === targetId)) community.blocks.push({ blockerId: user.id, blockedId: targetId, createdAt: new Date().toISOString() });
      community.connections = community.connections.filter((item) => item.pairKey !== pairKey(user.id, targetId));
      const directIds = new Set(community.rooms.filter((room) => room.kind === "direct" && community.members.some((member) => member.roomId === room.id && member.userId === user.id) && community.members.some((member) => member.roomId === room.id && member.userId === targetId)).map((room) => room.id));
      community.members = community.members.filter((member) => !(member.userId === user.id && directIds.has(member.roomId)));
    }
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  const roomMatch = url.pathname.match(/^\/api\/community\/rooms\/([^/]+)(?:\/(join|messages|leave|pin|history|invite))?$/);
  if (roomMatch) {
    const roomId = decodeURIComponent(roomMatch[1]);
    const operation = roomMatch[2] || "";
    const community = await loadCommunity();
    cleanupLocalSystemHistory(community);
    if (!community.profiles[user.id]?.enabled) return sendError(res, 403, "Join the community before using chat.");
    const room = community.rooms.find((item) => item.id === roomId);
    if (!room) return sendError(res, 404, "Chat room not found.");
    if (req.method === "POST" && operation === "join") {
      if (room.kind !== "group") return sendError(res, 403, "Private conversations cannot be joined directly.");
      if (room.createdBy) return sendError(res, 403, "Member-created groups require an invitation.");
      if (!community.members.some((member) => member.roomId === roomId && member.userId === user.id)) community.members.push({ roomId, userId: user.id, joinedAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (!community.members.some((member) => member.roomId === roomId && member.userId === user.id)) return sendError(res, 403, "Join this room before reading or sending messages.");
    if (req.method === "POST" && operation === "invite") {
      if (room.kind !== "group") return sendError(res, 400, "Invitations are available in group chats only.");
      const input = await readJsonBody(req);
      const memberIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String))].filter((id) => id && id !== user.id).slice(0, 30);
      if (!memberIds.length) return sendError(res, 400, "Choose at least one friend to invite.");
      if (memberIds.some((memberId) => !localFriends(community, user.id, memberId) || localBlocked(community, user.id, memberId))) return sendError(res, 403, "You can invite accepted, unblocked friends only.");
      const now = new Date().toISOString();
      let invited = 0;
      for (const memberId of memberIds) {
        if (community.members.some((member) => member.roomId === roomId && member.userId === memberId)) continue;
        const existingInvite = community.groupInvites.find((invite) => invite.roomId === roomId && invite.recipientId === memberId);
        if (existingInvite) Object.assign(existingInvite, { inviterId: user.id, status: "pending", updatedAt: now });
        else community.groupInvites.push({ id: randomBytes(12).toString("hex"), roomId, inviterId: user.id, recipientId: memberId, status: "pending", createdAt: now, updatedAt: now });
        invited += 1;
      }
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, invited });
    }
    if (req.method === "POST" && operation === "leave") {
      if (room.kind !== "group") return sendError(res, 400, "Use Remove friend to close a private conversation.");
      community.members = community.members.filter((member) => !(member.roomId === roomId && member.userId === user.id));
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && operation === "pin") {
      const pinned = Boolean((await readJsonBody(req)).pinned);
      const key = `${roomId}:${user.id}`;
      community.roomPreferences[key] = { ...community.roomPreferences[key], pinnedAt: pinned ? new Date().toISOString() : null };
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, pinned });
    }
    if (req.method === "DELETE" && operation === "history") {
      const key = `${roomId}:${user.id}`;
      community.roomPreferences[key] = { ...community.roomPreferences[key], clearedBefore: new Date().toISOString() };
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, clearedBefore: community.roomPreferences[key].clearedBefore });
    }
    if (req.method === "GET" && operation === "messages") {
      const preference = localRoomPreference(community, roomId, user.id);
      const messages = community.messages.filter((message) => message.roomId === roomId && (!preference.clearedBefore || message.createdAt > preference.clearedBefore) && !community.blocks.some((block) => block.blockerId === user.id && block.blockedId === message.userId)).slice(-100).map((message) => ({ ...message, author: community.profiles[message.userId]?.displayName || "Village member", mine: message.userId === user.id }));
      await saveCommunity(community);
      const otherUserId = room.kind === "direct" ? community.members.find((member) => member.roomId === roomId && member.userId !== user.id)?.userId || null : null;
      const users = room.kind === "group" ? await loadUsers() : [];
      const members = room.kind === "group" ? community.members.filter((member) => member.roomId === roomId).map((member) => ({ userId: member.userId, displayName: community.profiles[member.userId]?.displayName || users.find((candidate) => candidate.id === member.userId)?.name || "Village member", role: member.role || "member" })).sort((a, b) => Number(b.role === "moderator") - Number(a.role === "moderator") || a.displayName.localeCompare(b.displayName)) : [];
      return sendJson(res, 200, { room: { id: room.id, name: room.name, kind: room.kind, systemManaged: room.kind === "group" && !room.createdBy, createdBy: room.createdBy || null, pinned: Boolean(preference.pinnedAt), otherUserId }, members, messages });
    }
    if (req.method === "POST" && operation === "messages") {
      const messageBody = String((await readJsonBody(req)).message || "").trim().slice(0, 1000);
      if (!messageBody) return sendError(res, 400, "Write a message first.");
      if (containsBlockedLanguage(messageBody)) return sendError(res, 400, "Please remove harmful or abusive language before sending.");
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
    if (localBlocked(community, user.id, targetUserId)) return sendError(res, 403, "This connection is unavailable.");
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
    if (localBlocked(community, connection.requesterId, connection.recipientId)) return sendError(res, 403, "This connection is unavailable.");
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
    if (user.guest) return sendError(res, 403, "Create an account to save a personal record.");
    const { responses } = await readJsonBody(req);
    if (!responses || !Array.isArray(responses.interests) || !responses.interests.length) return sendError(res, 400, "Please choose at least one area of interest.");
    const summary = profileSummary(responses);
    const saved = await updateUser(user.id, (item) => ({ ...item, surveyCompleted: true, profile: { responses, summary, updatedAt: new Date().toISOString() } }));
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { user: safeUser(saved), sync });
  }

  if (req.method === "POST" && url.pathname === "/api/onboarding/complete") {
    if (user.guest) return sendError(res, 403, "Create an account to save onboarding progress.");
    const saved = await updateUser(user.id, (item) => ({ ...item, onboardingCompleted: true, updatedAt: new Date().toISOString() }));
    return sendJson(res, 200, { user: safeUser(saved) });
  }

  if (req.method === "POST" && url.pathname === "/api/ai/recommend") {
    const { topic = "Education", diagnosis = "", description = "", count, clarificationHandled = false, confirmedSecondaryKeywords = [], rejectedKeywords = [], age = "", lifeStage = "", language = "en" } = await readJsonBody(req);
    if (String(description).trim().length < 8) return sendError(res, 400, "Tell Waffles a little more so the recommendations can be useful.");
    if (!diagnosis) return sendError(res, 400, "Choose an island before searching for resources.");
    const config = await loadScoringConfig();
    const questions = clarificationQuestions({ topic, description, maxQuestions: config?.limits?.maximumFollowUpQuestions || 2 });
    if (!clarificationHandled && questions.length) return sendJson(res, 200, { needsClarification: true, questions });
    const { rows, source } = await getResources();
    const primaryKeywords = extractKeywords([description], config.limits.maximumPrimaryKeywords);
    const gateKeywords = extractGateKeywords([...primaryKeywords, ...confirmedSecondaryKeywords], config);
    const expansionKeywords = heuristicKeywordExpansion([...primaryKeywords, ...confirmedSecondaryKeywords], config.limits.maximumSecondaryKeywords);
    const profileAge = user.profile?.responses?.age || "";
    const lifeStages = extractLifeStages([description, age, lifeStage, profileAge], 8);
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const requestedCount = normalizeResultCount(count, config);
    const rankingInput = { diagnosis, category: topic, gateKeywords, primaryKeywords, confirmedSecondaryKeywords, rejectedKeywords, expansionKeywords, issuePreferences, age: profileAge || age, lifeStage, lifeStages, count: requestedCount, config };
    let expanded = { ai: false, keywords: [] };
    let matches = rankResources(rows, { ...rankingInput, predictedKeywords: [] });
    if (matches.length < requestedCount) {
      expanded = await expandKeywordsWithAI({ topic, description, profile: user.profile, directKeywords: primaryKeywords, limit: config.limits.maximumPredictedKeywords });
      matches = rankResources(rows, { ...rankingInput, predictedKeywords: expanded.keywords });
    }
    let answer;
    let ai = false;
    try {
      answer = await callOpenAI({ topic, description, profile: user.profile, matches, language });
      ai = Boolean(answer);
    } catch (error) {
      answer = deterministicAnswer(topic, description, matches, language);
      answer += ` (AI service note: ${error.message})`;
    }
    if (!answer) answer = deterministicAnswer(topic, description, matches, language);
    const highScoreCount = matches.filter((match) => Number(match.score || 0) >= 20).length;
    const errorLogs = [];
    if (matches.length < requestedCount) {
      errorLogs.push({
        event: "insufficient_resources",
        reason: `Requested ${requestedCount} resources, but only ${matches.length} were available from the database.`,
        user,
        topic,
        diagnosis,
        description,
        requestedCount,
        providedCount: matches.length,
        highScoreCount,
        source
      });
    }
    if (requestedCount > 3 && highScoreCount < 3) {
      errorLogs.push({
        event: "insufficient_high_score_resources",
        reason: `Requested ${requestedCount} resources, but only ${highScoreCount} database resources scored at least 20.`,
        user,
        topic,
        diagnosis,
        description,
        requestedCount,
        providedCount: matches.length,
        highScoreCount,
        source
      });
    }
    let sync = { synced: false };
    if (!user.guest) {
      const saved = await updateUser(user.id, (item) => ({ ...item, history: [...(item.history || []), { topic, description, at: new Date().toISOString() }].slice(-50) }));
      try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    }
    const errorSync = [];
    for (const details of errorLogs) {
      try {
        errorSync.push(await logErrorRecord(details));
      } catch (error) {
        errorSync.push({ synced: false, reason: error.message });
      }
    }
    return sendJson(res, 200, {
      answer,
      resources: matches,
      source,
      ai,
      keywordExpansion: { ai: expanded.ai, synonyms: expansionKeywords, predicted: expanded.keywords, suggested: [...expansionKeywords, ...expanded.keywords] },
      scoring: { version: config.version, minimumScore: config.limits.minimumScore },
      errorSync,
      sync
    });
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    if (user.guest) return sendError(res, 403, "Create an account to save feedback.");
    const { feedback = "" } = await readJsonBody(req);
    const saved = await updateUser(user.id, (item) => ({ ...item, feedback: String(feedback).slice(0, 2000) }));
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { ok: true, sync });
  }

  if (req.method === "POST" && url.pathname === "/api/resources/like") {
    if (user.guest) return sendError(res, 403, "Create an account to save liked resources.");
    const { resource = {}, liked = true } = await readJsonBody(req);
    const savedResource = resourceSnapshot(resource);
    if (!savedResource) return sendError(res, 400, "Choose a resource before saving it.");
    const key = resourceIdentityKey(savedResource);
    const saved = await updateUser(user.id, (item) => {
      const current = Array.isArray(item.likedResources) ? item.likedResources : [];
      const filtered = current.filter((entry) => `${String(entry.name || "").toLowerCase()}|${String(entry.url || "").toLowerCase()}` !== key);
      const disliked = Array.isArray(item.dislikedResources) ? item.dislikedResources : [];
      const filteredDisliked = liked ? disliked.filter((entry) => resourceIdentityKey(entry) !== key) : disliked;
      return { ...item, likedResources: liked ? [savedResource, ...filtered].slice(0, 100) : filtered, dislikedResources: filteredDisliked, updatedAt: new Date().toISOString() };
    });
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    return sendJson(res, 200, { ok: true, likedResources: saved.likedResources || [], dislikedResources: saved.dislikedResources || [], sync });
  }

  if (req.method === "POST" && url.pathname === "/api/resources/dislike") {
    if (user.guest) return sendError(res, 403, "Create an account to mark disliked resources.");
    const { resource = {}, disliked = true } = await readJsonBody(req);
    const dislikedResource = resourceSnapshot(resource);
    if (!dislikedResource) return sendError(res, 400, "Choose a resource before marking it.");
    const key = resourceIdentityKey(dislikedResource);
    const saved = await updateUser(user.id, (item) => {
      const current = Array.isArray(item.dislikedResources) ? item.dislikedResources : [];
      const filtered = current.filter((entry) => resourceIdentityKey(entry) !== key);
      const liked = Array.isArray(item.likedResources) ? item.likedResources : [];
      const filteredLiked = disliked ? liked.filter((entry) => resourceIdentityKey(entry) !== key) : liked;
      return { ...item, likedResources: filteredLiked, dislikedResources: disliked ? [dislikedResource, ...filtered].slice(0, 100) : filtered, updatedAt: new Date().toISOString() };
    });
    let sync = { synced: false };
    try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    let errorSync = { synced: false };
    if (disliked) {
      try {
        errorSync = await logErrorRecord({
          event: "resource_disliked",
          reason: "User marked a resource as disliked.",
          user: saved,
          topic: dislikedResource.topic,
          resource: dislikedResource,
          source: "resource-card"
        });
      } catch (error) {
        errorSync = { synced: false, reason: error.message };
      }
    }
    return sendJson(res, 200, { ok: true, likedResources: saved.likedResources || [], dislikedResources: saved.dislikedResources || [], sync, errorSync });
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
