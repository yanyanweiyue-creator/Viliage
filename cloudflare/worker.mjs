import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fallbackResources from "../data/resources-fallback.json" with { type: "json" };
import scoreConfigFile from "../config/scoring-config.json" with { type: "json" };
import { DEFAULT_SCORE_CONFIG, clarificationQuestions, extractGateKeywords, extractKeywords, extractLifeStages, heuristicKeywordExpansion, inferIssuePreferences, normalizeResultCount, rankResources } from "../scoring-engine.mjs";
import { communitySimilarity, containsBlockedLanguage, pairKey, safeDisplayName } from "../community-logic.mjs";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RESOURCE_SHEET_ID = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const DEFAULT_RESOURCE_SHEET_GID = "1709372674";
const scoreConfig = {
  version: scoreConfigFile.version || DEFAULT_SCORE_CONFIG.version,
  weights: { ...DEFAULT_SCORE_CONFIG.weights, ...(scoreConfigFile.weights || {}) },
  limits: { ...DEFAULT_SCORE_CONFIG.limits, ...(scoreConfigFile.limits || {}) }
};

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

async function body(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_000_000) throw new Error("Request is too large.");
  try { return await request.json(); } catch { throw new Error("Request body must be valid JSON."); }
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.get("cookie") || "").split(";").map((part) => part.trim().split("=")).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")]));
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

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function passwordResetHash(email, code, secret) {
  return createHash("sha256").update(`${String(email).toLowerCase()}\u001f${String(code)}\u001f${String(secret || "")}`).digest("hex");
}

function resetCodeMatches(expected, actual) {
  const first = Buffer.from(String(expected || ""), "hex");
  const second = Buffer.from(String(actual || ""), "hex");
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
}

function createPasswordResetCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

async function sendPasswordResetEmail(env, email, code) {
  const webhook = env.PASSWORD_EMAIL_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL;
  if (!webhook) return false;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-password-reset", email, code, expiresInMinutes: 10, fromAddress: env.PASSWORD_EMAIL_FROM_ADDRESS || "", fromName: env.PASSWORD_EMAIL_FROM_NAME || "It Takes a Village" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Password email webhook returned ${response.status}.`);
  const result = await response.json().catch(() => ({ ok: true }));
  if (result.ok === false) throw new Error(result.error || "Password email webhook failed.");
  return true;
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function dbUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    surveyCompleted: Boolean(row.survey_completed),
    onboardingCompleted: Boolean(row.onboarding_completed),
    profile: parseJson(row.profile_json, null),
    history: parseJson(row.history_json, []),
    feedback: row.feedback || "",
    likedResources: parseJson(row.liked_resources_json, []),
    dislikedResources: parseJson(row.disliked_resources_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, surveyCompleted: Boolean(user.surveyCompleted), onboardingCompleted: Boolean(user.onboardingCompleted), profile: user.profile || null, history: user.history || [], feedback: user.feedback || "", likedResources: Array.isArray(user.likedResources) ? user.likedResources : [], dislikedResources: Array.isArray(user.dislikedResources) ? user.dislikedResources : [] };
}

function guestUser() {
  return { id: "guest", name: "Guest", email: "", guest: true, surveyCompleted: true, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [] };
}

async function allRows(statement) {
  const result = await statement.all();
  return Array.isArray(result) ? result : result?.results || [];
}

async function communityProfile(env, userId) {
  return env.DB.prepare("SELECT * FROM community_profiles WHERE user_id = ? LIMIT 1").bind(userId).first();
}

async function areFriends(env, firstId, secondId) {
  return Boolean(await env.DB.prepare(`
    SELECT id FROM chat_connections
    WHERE status = 'accepted' AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))
    LIMIT 1
  `).bind(firstId, secondId, secondId, firstId).first());
}

async function usersBlocked(env, firstId, secondId) {
  return Boolean(await env.DB.prepare("SELECT 1 AS blocked FROM chat_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1").bind(firstId, secondId, secondId, firstId).first());
}

async function cleanupSystemGroupHistory(env) {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  return env.DB.prepare("DELETE FROM chat_messages WHERE created_at < ? AND room_id IN (SELECT id FROM chat_rooms WHERE kind = 'group' AND system_managed = 1)").bind(cutoff).run();
}

function safeImageDataUrl(value) {
  const image = String(value || "");
  if (!image) return null;
  if (image.length > 750000 || !/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(image)) throw new Error("Use a PNG, JPEG, WebP, or GIF image smaller than about 550 KB.");
  return image;
}

async function communityOverview(env, user) {
  const profile = await communityProfile(env, user.id);
  const groups = await allRows(env.DB.prepare(`
    SELECT r.id, r.name, r.description, r.created_by, r.system_managed,
      (SELECT COUNT(*) FROM chat_members members WHERE members.room_id = r.id) AS member_count,
      EXISTS(SELECT 1 FROM chat_members mine WHERE mine.room_id = r.id AND mine.user_id = ?) AS joined,
      EXISTS(SELECT 1 FROM chat_room_preferences pref WHERE pref.room_id = r.id AND pref.user_id = ? AND pref.pinned_at IS NOT NULL) AS pinned
    FROM chat_rooms r WHERE r.kind = 'group' AND (r.system_managed = 1 OR EXISTS(SELECT 1 FROM chat_members visible WHERE visible.room_id = r.id AND visible.user_id = ?))
    ORDER BY pinned DESC, r.created_at, r.name
  `).bind(user.id, user.id, user.id));
  if (!profile?.enabled) return { enabled: false, displayName: profile?.display_name || safeDisplayName(user.name), groups, recommendations: [], incoming: [], outgoing: [], directRooms: [] };

  const candidates = await allRows(env.DB.prepare(`
    SELECT u.id, u.profile_json, cp.display_name
    FROM community_profiles cp JOIN users u ON u.id = cp.user_id
    WHERE cp.enabled = 1 AND u.id != ?
      AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
      AND NOT EXISTS (SELECT 1 FROM chat_connections c WHERE (c.requester_id = ? AND c.recipient_id = u.id) OR (c.recipient_id = ? AND c.requester_id = u.id))
    LIMIT 60
  `).bind(user.id, user.id, user.id, user.id, user.id));
  const recommendations = candidates.map((candidate) => {
    const match = communitySimilarity(user.profile, parseJson(candidate.profile_json, null));
    return { userId: candidate.id, displayName: candidate.display_name, score: match.score, reasons: match.reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)).slice(0, 6);

  const incoming = await allRows(env.DB.prepare(`
    SELECT c.id, c.requester_id AS user_id, cp.display_name, c.created_at
    FROM chat_connections c JOIN community_profiles cp ON cp.user_id = c.requester_id
    WHERE c.recipient_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC
  `).bind(user.id));
  const outgoing = await allRows(env.DB.prepare(`
    SELECT c.id, c.recipient_id AS user_id, cp.display_name, c.created_at
    FROM chat_connections c JOIN community_profiles cp ON cp.user_id = c.recipient_id
    WHERE c.requester_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC
  `).bind(user.id));
  const directRooms = await allRows(env.DB.prepare(`
    SELECT r.id, other.user_id AS user_id, other_user.email, COALESCE(cp.display_name, other_user.name) AS name,
      EXISTS(SELECT 1 FROM chat_room_preferences pref WHERE pref.room_id = r.id AND pref.user_id = ? AND pref.pinned_at IS NOT NULL) AS pinned
    FROM chat_rooms r
    JOIN chat_members mine ON mine.room_id = r.id AND mine.user_id = ?
    JOIN chat_members other ON other.room_id = r.id AND other.user_id != ?
    JOIN users other_user ON other_user.id = other.user_id
    LEFT JOIN community_profiles cp ON cp.user_id = other.user_id
    WHERE r.kind = 'direct' ORDER BY pinned DESC, r.created_at DESC
  `).bind(user.id, user.id, user.id));
  const blocks = await allRows(env.DB.prepare(`
    SELECT b.blocked_id AS user_id, COALESCE(cp.display_name, u.name) AS display_name
    FROM chat_blocks b JOIN users u ON u.id = b.blocked_id LEFT JOIN community_profiles cp ON cp.user_id = b.blocked_id
    WHERE b.blocker_id = ? ORDER BY display_name
  `).bind(user.id));
  const groupInvites = await allRows(env.DB.prepare(`
    SELECT invite.id, invite.room_id, room.name AS room_name, room.description,
      COALESCE(profile.display_name, inviter.name) AS inviter_name, invite.created_at
    FROM chat_group_invitations invite JOIN chat_rooms room ON room.id = invite.room_id
    JOIN users inviter ON inviter.id = invite.inviter_id LEFT JOIN community_profiles profile ON profile.user_id = invite.inviter_id
    WHERE invite.recipient_id = ? AND invite.status = 'pending' ORDER BY invite.created_at DESC
  `).bind(user.id));
  return { enabled: true, displayName: profile.display_name, groups, recommendations, incoming, outgoing, directRooms, blocks, groupInvites };
}

async function sessionUser(request, env) {
  const token = cookies(request).capy_session;
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`)
    .bind(tokenHash(token), Date.now()).first();
  return dbUser(row);
}

async function createSession(env, userId) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(tokenHash(token), userId, now, now + SESSION_MAX_AGE_SECONDS * 1000)
  ]);
  return `capy_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function cellValue(cell) {
  if (!cell) return "";
  if (cell.f != null) return String(cell.f).trim();
  if (cell.v != null) return String(cell.v).trim();
  return "";
}

function stripGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Unexpected sheet response.");
  return JSON.parse(text.slice(start, end + 1));
}

function deriveName(description, url) {
  const first = String(description || "").split(/[—–-]/)[0].trim();
  if (first.length > 3 && first.length < 90) return first;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Community resource"; }
}

function normalizeSheetRows(table) {
  const columns = new Map((table.cols || []).map((column, index) => [String(column.label || column.id || "").trim().toLowerCase(), index]));
  const valueAt = (values, label, fallbackIndex) => values[columns.has(label.toLowerCase()) ? columns.get(label.toLowerCase()) : fallbackIndex] || "";
  const valuesAt = (values, labels) => labels.map((label) => valueAt(values, label, -1)).filter(Boolean);
  return (table.rows || []).map((row) => {
    const values = (row.c || []).map(cellValue);
    const url = valueAt(values, "URL", 0);
    const description = valueAt(values, "Description", 1);
    const categories = [valueAt(values, "Category1", 3), valueAt(values, "Category2", 4)].filter(Boolean).flatMap((value) => value.split(/[,;/]/)).map((value) => value.trim()).filter(Boolean);
    const tags = ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"].map((label, index) => valueAt(values, label, index + 6)).filter(Boolean);
    const locations = ["Location1", "Location2", "Location3", "Location4"].map((label, index) => valueAt(values, label, index + 12)).filter(Boolean);
    const issues = valuesAt(values, ["Issues", "Issue", "Issue1", "Issue2", "Issue3", "Issue4"]).flatMap((value) => value.split(/[,;/]/)).map((value) => value.trim()).filter(Boolean);
    return {
      url,
      name: valueAt(values, "Resource Name", -1) || valueAt(values, "Name", -1) || deriveName(description, url),
      description,
      diagnosis: valueAt(values, "Diagnosis", 2) || "Both",
      categories: categories.length ? categories : ["Education"],
      age: valueAt(values, "Age", 5) || "All ages",
      ageRange: valueAt(values, "Age Range") || valueAt(values, "Age range") || valueAt(values, "Age", 5) || "All ages",
      lifeStage: valueAt(values, "Life Stage") || valueAt(values, "Life stage") || "",
      tags,
      issues,
      location: locations[0] || "See website",
      price: valueAt(values, "Price", 17) || "See website"
    };
  }).filter((row) => /^https?:\/\//.test(row.url || ""));
}

async function resources(env, force = false) {
  try {
    const sheetId = env.RESOURCE_SHEET_ID || DEFAULT_RESOURCE_SHEET_ID;
    const gid = env.RESOURCE_SHEET_GID || DEFAULT_RESOURCE_SHEET_GID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}${force ? `&cache=${Date.now()}` : ""}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: force ? 0 : 60, cacheEverything: true } });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}.`);
    const rows = normalizeSheetRows(stripGviz(await response.text()).table);
    if (!rows.length) throw new Error("Sheet has no readable resource rows.");
    return { rows, source: "google-sheet-live" };
  } catch (error) {
    return { rows: fallbackResources, source: "bundled-fallback", warning: error.message };
  }
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
    return `Waffles 找到了 ${matches.length} 个可能合适的${topicText}资源，匹配你的需求：“${description}”。可以先看：${matches.slice(0, 3).map((item) => item.name).join("、")}。每个结果都会先按标签评分，再参考描述和潜在冲突项。请直接向服务机构确认资格、费用和当前可用性。`;
  }
  if (language === "es") {
    if (!matches.length) return `Waffles no encontró un recurso de ${topicText} que pasara todos los filtros requeridos para “${description}”. Prueba una necesidad o ubicación más amplia; el diagnóstico y la categoría del edificio seguirán protegidos como filtros.`;
    return `Waffles encontró ${matches.length} recursos prometedores de ${topicText} para “${description}”. Empieza con ${matches.slice(0, 3).map((item) => item.name).join(", ")}. Cada resultado se puntuó primero por etiquetas, luego por descripción y posibles conflictos. Confirma requisitos, costo y disponibilidad directamente con cada proveedor.`;
  }
  if (!matches.length) return `Waffles did not find a ${topicText} resource that passed every required filter for “${description}”. Try one broader need or location phrase; diagnosis and building category will remain protected filters.`;
  return `Waffles found ${matches.length} promising ${topicText} resources for “${description}”. Start with ${matches.slice(0, 3).map((item) => item.name).join(", ")}. Each result was scored against its tags first, then its description and possible issue conflicts. Please confirm eligibility, cost, and current availability directly with each provider.`;
}

function responseLanguageName(language = "en") {
  if (language === "zh") return "Simplified Chinese";
  if (language === "es") return "Spanish";
  return "English";
}

function responseText(data) {
  return (data.output || []).flatMap((item) => item.content || []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n").trim();
}

async function expandKeywords(env, { topic, description, profile, directKeywords, limit }) {
  if (!env.OPENAI_API_KEY) return { keywords: [], ai: false };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.4",
        reasoning: { effort: "low" },
        text: { verbosity: "low", format: { type: "json_schema", name: "keyword_expansion", strict: true, schema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, maxItems: limit } }, required: ["keywords"], additionalProperties: false } } },
        instructions: "Suggest only short search synonyms, related resource tags, category terms, and common alternative phrases. Avoid duplicates and sensitive inferences.",
        input: JSON.stringify({ topic, query: description, personalRecord: profile?.summary || "", directKeywords })
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Keyword expansion returned ${response.status}.`);
    const parsed = JSON.parse(responseText(await response.json()) || "{}");
    const keywords = extractKeywords(parsed.keywords || [], limit).filter((keyword) => !directKeywords.includes(keyword));
    return { keywords: [...new Set(keywords)].slice(0, limit), ai: true };
  } catch { return { keywords: [], ai: false }; }
}

async function aiAnswer(env, { topic, description, profile, matches, language = "en" }) {
  if (!env.OPENAI_API_KEY) return null;
  const candidateResources = matches.map(({ name, description: detail, url, age, location, price, tags, score, explanation }) => ({ name, detail, url, age, location, price, tags, score, explanation }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: `You are Waffles, a warm animated capybara resource guide. Recommend only from candidateResources. Do not diagnose, promise outcomes, or invent facts or URLs. Explain why the top options fit in under 180 words. Respond in ${responseLanguageName(language)}.`,
      input: JSON.stringify({ topic, userDescription: description, personalRecord: profile?.summary || "", candidateResources })
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  return responseText(await response.json());
}

const WAFFLES_VOICE_INSTRUCTIONS = "Voice style: a high-quality conversational AI companion voice: natural, fluid, emotionally responsive, and softly intelligent. Make it warmer and more tender than a default assistant voice, with a gentle feminine-leaning presence, relaxed pacing, light breath, and small natural pauses. It should feel patient, reassuring, and quick-minded, not robotic, formal, dramatic, commercial, or childish. Keep diction clear and calm, with subtle intonation that sounds like a thoughtful guide helping in real time.";

function ttsSpeed(value) {
  const speed = Number(value || 0.92);
  return Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 0.92;
}

async function wafflesSpeech(env, { text, language }) {
  if (!env.OPENAI_API_KEY) return null;
  const input = String(text || "").trim().slice(0, 700);
  if (!input) return null;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: env.OPENAI_TTS_VOICE || "coral",
      input,
      instructions: `${WAFFLES_VOICE_INSTRUCTIONS} Speak in ${language === "zh" ? "Mandarin Chinese when the text is Chinese, otherwise natural English" : language === "es" ? "natural Spanish when the text is Spanish, otherwise natural English" : "natural English"}.`,
      speed: ttsSpeed(env.OPENAI_TTS_SPEED),
      response_format: "mp3"
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`OpenAI speech request failed (${response.status}).`);
  return response.arrayBuffer();
}

async function voiceIntent(env, { transcript, context }) {
  if (!env.OPENAI_API_KEY) return null;
  const schema = { type: "object", properties: {
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
  }, required: ["action", "island", "buildingId", "buildingType", "topic", "direction", "followUpQuestion", "searchQuery", "speech", "confidence"], additionalProperties: false };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "voice_navigation_intent", strict: true, schema } },
      instructions: "Map natural voice requests to website navigation and resource research for an accessibility assistant. Understand loose, spoken phrases like 'show me the next part', 'open Waffles', 'what is this website', 'who made this', 'take me to school help', 'research 504 plans', 'find resources for executive function', 'compare legal support', or 'I need legal stuff'. Use search_resources when the user asks to research, find, search, compare, look up, or match resources; infer the closest topic and copy the concrete need into searchQuery. Use open_guide for Waffles, site overview, creator, or story requests. Use ask_followup only when the target is genuinely unclear. Do not invent unsupported actions. Keep speech short, warm, and plain.",
      input: JSON.stringify({ transcript: String(transcript || "").slice(0, 500), context })
    }),
    signal: AbortSignal.timeout(12000)
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

async function guideChat(env, { message, language = "en", context = {} }) {
  const fallback = localGuideAnswer({ message, language });
  if (!env.OPENAI_API_KEY) return { ...fallback, ai: false };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4",
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
    signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) throw new Error(`OpenAI guide request failed (${response.status}).`);
  const parsed = JSON.parse(responseText(await response.json()) || "{}");
  return { ...normalizeGuideResponse(parsed, fallback), ai: true };
}

async function userChatHistory(env, userId) {
  const rows = await allRows(env.DB.prepare(`
    SELECT r.name AS room, m.body AS message, m.created_at AS at
    FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id
    WHERE m.user_id = ? ORDER BY m.created_at DESC LIMIT 100
  `).bind(userId));
  return rows.reverse();
}

async function syncUser(env, user) {
  if (!env.USER_SHEET_WEBHOOK_URL) return { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
  const chatHistory = await userChatHistory(env, user.id);
  const payload = {
    "User name": user.name,
    "Password": "Not stored — secure hash only",
    "response of survey": JSON.stringify(user.profile?.responses || {}),
    "AI personal record": user.profile?.summary || "",
    history: JSON.stringify(user.history || []),
    feedback: user.feedback || "",
    "Chat History": JSON.stringify(chatHistory),
    "Save resource": JSON.stringify(user.likedResources || []),
    "Like resource": JSON.stringify(user.likedResources || []),
    "Dislike resource": JSON.stringify(user.dislikedResources || []),
    "Email": user.email,
    userId: user.id
  };
  const response = await fetch(env.USER_SHEET_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`User sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "User sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

function errorLogPayload(env, { event, reason, user, topic = "", diagnosis = "", description = "", requestedCount = "", providedCount = "", highScoreCount = "", source = "", resource = null }) {
  const at = new Date().toISOString();
  return {
    action: "log-resource-error",
    spreadsheetId: env.ERROR_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0",
    sheetGid: env.ERROR_SHEET_GID || "",
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

async function logErrorRecord(env, details) {
  if (!env.ERROR_SHEET_WEBHOOK_URL) return { synced: false, reason: "ERROR_SHEET_WEBHOOK_URL is not configured." };
  const response = await fetch(env.ERROR_SHEET_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(errorLogPayload(env, details)),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Error sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "Error sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

async function environment(request) {
  let latitude = Number(request.cf?.latitude);
  let longitude = Number(request.cf?.longitude);
  let location = {
    city: String(request.cf?.city || ""), region: String(request.cf?.region || ""), country: String(request.cf?.country || ""), countryCode: String(request.cf?.country || ""), timezone: String(request.cf?.timezone || "UTC"), approximate: true
  };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const geoResponse = await fetch("https://reallyfreegeoip.org/json/", { signal: AbortSignal.timeout(8000) });
    if (!geoResponse.ok) throw new Error("Approximate location is unavailable.");
    const geo = await geoResponse.json();
    latitude = Number(geo.latitude); longitude = Number(geo.longitude);
    location = { city: String(geo.city || ""), region: String(geo.region_name || ""), country: String(geo.country_name || ""), countryCode: String(geo.country_code || ""), timezone: String(geo.time_zone || "UTC"), approximate: true };
  }
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: "temperature_2m,apparent_temperature,is_day,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m", daily: "sunrise,sunset", timezone: "auto", forecast_days: "1" }).toString();
  const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
  if (!weatherResponse.ok) throw new Error(`Open-Meteo returned ${weatherResponse.status}.`);
  const weather = await weatherResponse.json();
  location.timezone = String(weather.timezone || location.timezone);
  return {
    location,
    hemisphere: latitude < 0 ? "south" : "north",
    current: { time: String(weather.current?.time || ""), temperature: Number(weather.current?.temperature_2m || 0), apparentTemperature: Number(weather.current?.apparent_temperature || 0), isDay: Boolean(weather.current?.is_day), weatherCode: Number(weather.current?.weather_code || 0), cloudCover: Number(weather.current?.cloud_cover || 0), precipitation: Number(weather.current?.precipitation || 0), rain: Number(weather.current?.rain || 0), snowfall: Number(weather.current?.snowfall || 0), windSpeed: Number(weather.current?.wind_speed_10m || 0) },
    sun: { sunrise: String(weather.daily?.sunrise?.[0] || ""), sunset: String(weather.daily?.sunset?.[0] || "") },
    source: "Open-Meteo",
    fetchedAt: new Date().toISOString()
  };
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, storage: "cloudflare-d1", openaiConfigured: Boolean(env.OPENAI_API_KEY), userSheetConfigured: Boolean(env.USER_SHEET_WEBHOOK_URL), errorSheetConfigured: Boolean(env.ERROR_SHEET_WEBHOOK_URL), passwordEmailConfigured: Boolean(env.PASSWORD_EMAIL_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL), passwordEmailUsesUserSheetWebhook: !env.PASSWORD_EMAIL_WEBHOOK_URL && Boolean(env.USER_SHEET_WEBHOOK_URL), passwordEmailSender: env.PASSWORD_EMAIL_FROM_ADDRESS || "" });
  if (request.method === "POST" && url.pathname === "/api/voice/narrate") {
    const audio = await wafflesSpeech(env, await body(request));
    if (!audio) return fail("Waffles voice is not configured.", 503);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method === "POST" && url.pathname === "/api/voice/command") {
    const payload = await body(request);
    if (!String(payload.transcript || "").trim()) return fail("Voice command is empty.");
    const intent = await voiceIntent(env, payload);
    if (!intent) return fail("Voice command AI is not configured.", 503);
    return json(intent);
  }
  if (request.method === "POST" && url.pathname === "/api/guide/chat") {
    const payload = await body(request);
    if (!String(payload.message || "").trim()) return fail("Guide message is empty.");
    try { return json(await guideChat(env, payload)); }
    catch { return json({ ...localGuideAnswer(payload), ai: false }); }
  }
  if (request.method === "GET" && url.pathname === "/api/scoring-config") return json(scoreConfig);
  if (request.method === "GET" && url.pathname === "/api/environment") {
    try { return json(await environment(request)); } catch { return fail("Local weather is temporarily unavailable.", 503); }
  }
  if (request.method === "GET" && url.pathname === "/api/resources") {
    const data = await resources(env, url.searchParams.get("refresh") === "1");
    return json({ resources: data.rows, source: data.source, warning: data.warning || null, updatedAt: new Date().toISOString() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password/request") {
    const { email = "" } = await body(request);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return fail("Please enter a valid email address.");
    const response = { ok: true, deliveryAvailable: Boolean(env.PASSWORD_EMAIL_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL), senderAddress: env.PASSWORD_EMAIL_FROM_ADDRESS || "", message: "If an account exists for that email, a six-digit code will arrive shortly." };
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    if (!user) {
      passwordResetHash(normalizedEmail, "000000", env.PASSWORD_RESET_SECRET);
      return json(response, 202);
    }
    const now = Date.now();
    const prior = await env.DB.prepare("SELECT requested_at FROM password_reset_codes WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    if (prior && now - Number(prior.requested_at) < 60_000) return json(response, 202);
    const code = createPasswordResetCode();
    const codeHash = passwordResetHash(normalizedEmail, code, env.PASSWORD_RESET_SECRET);
    await env.DB.prepare(`
      INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, requested_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, requested_at = excluded.requested_at
    `).bind(normalizedEmail, codeHash, now + 10 * 60_000, now).run();
    try { await sendPasswordResetEmail(env, normalizedEmail, code); }
    catch (error) { console.error("Password reset email failed:", error.message); }
    return json(response, 202);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password/confirm") {
    const { email = "", code = "", password = "" } = await body(request);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !/^\d{6}$/.test(String(code))) return fail("The verification code is invalid or expired.");
    if (String(password).length < 8) return fail("Password must be at least 8 characters.");
    if (!env.PASSWORD_RESET_SECRET) return fail("Password reset is temporarily unavailable.", 503);
    const reset = await env.DB.prepare("SELECT * FROM password_reset_codes WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    const submittedHash = passwordResetHash(normalizedEmail, code, env.PASSWORD_RESET_SECRET);
    if (!reset || Number(reset.expires_at) < Date.now() || Number(reset.attempts) >= 5 || !resetCodeMatches(reset.code_hash, submittedHash)) {
      if (reset) await env.DB.prepare("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE email = ?").bind(normalizedEmail).run();
      return fail("The verification code is invalid or expired.");
    }
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    if (!user) return fail("The verification code is invalid or expired.");
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(hashPassword(String(password)), now, user.id),
      env.DB.prepare("DELETE FROM password_reset_codes WHERE email = ?").bind(normalizedEmail),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id)
    ]);
    return json({ ok: true, message: "Your password has been reset. You can now log in." });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const { name, email, password } = await body(request);
    if (!String(name || "").trim()) return fail("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return fail("Please enter a valid email.");
    if (String(password || "").length < 8) return fail("Password must be at least 8 characters.");
    const normalizedEmail = String(email).toLowerCase();
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first()) return fail("An account with this email already exists.", 409);
    const now = new Date().toISOString();
    const user = { id: randomBytes(12).toString("hex"), name: String(name).trim(), email: normalizedEmail, passwordHash: hashPassword(String(password)), surveyCompleted: false, onboardingCompleted: false, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [], createdAt: now, updatedAt: now };
    await env.DB.prepare("INSERT INTO users (id, name, email, password_hash, survey_completed, onboarding_completed, profile_json, history_json, feedback, liked_resources_json, disliked_resources_json, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, NULL, '[]', '', '[]', '[]', ?, ?)").bind(user.id, user.name, user.email, user.passwordHash, now, now).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ user: safeUser(user), sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } }, 201, { "Set-Cookie": await createSession(env, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await body(request);
    const user = dbUser(await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(String(email || "").toLowerCase()).first());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return fail("Email or password is incorrect.", 401);
    return json({ user: safeUser(user) }, 200, { "Set-Cookie": await createSession(env, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/guest") return json({ user: guestUser() });

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookies(request).capy_session;
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": "capy_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await sessionUser(request, env);
    return user ? json({ user: safeUser(user) }) : fail("Not signed in.", 401);
  }

  const user = await sessionUser(request, env) || (request.headers.get("X-Village-Guest") === "1" ? guestUser() : null);
  if (!user) return fail("Please sign in first.", 401);
  if (user.guest && url.pathname.startsWith("/api/community")) return fail("Village Community is available to registered members only.", 403);

  if (request.method === "GET" && url.pathname === "/api/community") {
    return json(await communityOverview(env, user));
  }

  if (request.method === "POST" && url.pathname === "/api/community/settings") {
    const input = await body(request);
    const enabled = Boolean(input.enabled);
    const displayName = safeDisplayName(input.displayName, safeDisplayName(user.name));
    if (containsBlockedLanguage(displayName)) return fail("Please choose a respectful community name.");
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO community_profiles (user_id, enabled, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, display_name = excluded.display_name, updated_at = excluded.updated_at
    `).bind(user.id, enabled ? 1 : 0, displayName, now, now).run();
    return json(await communityOverview(env, user));
  }

  if (request.method === "GET" && url.pathname === "/api/community/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
    if (query.length < 2) return json({ people: [] });
    const people = await allRows(env.DB.prepare(`
      SELECT u.id AS user_id, u.email, COALESCE(cp.display_name, u.name) AS display_name,
        c.id AS connection_id, c.status AS connection_status, c.requester_id
      FROM users u JOIN community_profiles cp ON cp.user_id = u.id AND cp.enabled = 1
      LEFT JOIN chat_connections c ON (c.requester_id = ? AND c.recipient_id = u.id) OR (c.recipient_id = ? AND c.requester_id = u.id)
      WHERE u.id != ? AND (LOWER(u.email) LIKE ? OR LOWER(COALESCE(cp.display_name, u.name)) LIKE ?)
        AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
      ORDER BY display_name LIMIT 20
    `).bind(user.id, user.id, user.id, `%${query}%`, `%${query}%`, user.id, user.id));
    return json({ people: people.map((person) => ({ ...person, relationship: person.connection_status === "accepted" ? "friend" : person.connection_status === "pending" ? (person.requester_id === user.id ? "outgoing" : "incoming") : "none" })) });
  }

  if (request.method === "POST" && url.pathname === "/api/community/groups") {
    const input = await body(request);
    const profile = await communityProfile(env, user.id);
    if (!profile?.enabled) return fail("Join the community before creating a group.", 403);
    const name = safeDisplayName(input.name, "New group");
    const description = String(input.description || "").trim().slice(0, 240);
    if (containsBlockedLanguage(`${name} ${description}`)) return fail("Please use respectful language for the group name and description.");
    const memberIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String))].filter((id) => id && id !== user.id).slice(0, 30);
    for (const memberId of memberIds) if (!await areFriends(env, user.id, memberId) || await usersBlocked(env, user.id, memberId)) return fail("Groups can include accepted, unblocked friends only.", 403);
    const roomId = `group-${randomBytes(12).toString("hex")}`;
    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare("INSERT INTO chat_rooms (id, kind, name, description, created_by, created_at, system_managed) VALUES (?, 'group', ?, ?, ?, ?, 0)").bind(roomId, name, description, user.id, now),
      env.DB.prepare("INSERT INTO chat_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'moderator', ?)").bind(roomId, user.id, now),
      ...memberIds.map((memberId) => env.DB.prepare("INSERT INTO chat_group_invitations (id, room_id, inviter_id, recipient_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").bind(randomBytes(12).toString("hex"), roomId, user.id, memberId, now, now))
    ];
    await env.DB.batch(statements);
    return json({ room: { id: roomId, name, description, systemManaged: false } }, 201);
  }

  const groupInviteMatch = url.pathname.match(/^\/api\/community\/group-invitations\/([^/]+)\/(accept|decline)$/);
  if (request.method === "POST" && groupInviteMatch) {
    const invitationId = decodeURIComponent(groupInviteMatch[1]);
    const decision = groupInviteMatch[2];
    const invite = await env.DB.prepare("SELECT * FROM chat_group_invitations WHERE id = ? AND recipient_id = ? AND status = 'pending' LIMIT 1").bind(invitationId, user.id).first();
    if (!invite) return fail("Group invitation not found.", 404);
    const now = new Date().toISOString();
    const statements = [env.DB.prepare("UPDATE chat_group_invitations SET status = ?, updated_at = ? WHERE id = ?").bind(decision === "accept" ? "accepted" : "declined", now, invitationId)];
    if (decision === "accept") statements.push(env.DB.prepare("INSERT OR IGNORE INTO chat_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(invite.room_id, user.id, now));
    await env.DB.batch(statements);
    return json({ ok: true, roomId: decision === "accept" ? invite.room_id : null });
  }

  if (url.pathname === "/api/community/posts") {
    if (request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT p.*, COALESCE(cp.display_name, u.name) AS author
        FROM community_posts p JOIN users u ON u.id = p.user_id LEFT JOIN community_profiles cp ON cp.user_id = p.user_id
        WHERE p.user_id = ? OR (
          EXISTS (SELECT 1 FROM chat_connections c WHERE c.status = 'accepted' AND ((c.requester_id = ? AND c.recipient_id = p.user_id) OR (c.recipient_id = ? AND c.requester_id = p.user_id)))
          AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))
        ) ORDER BY p.created_at DESC LIMIT 100
      `).bind(user.id, user.id, user.id, user.id, user.id));
      const posts = rows.filter((row) => {
        if (row.user_id === user.id) return true;
        const allowed = parseJson(row.allowed_user_ids_json, []);
        const denied = parseJson(row.denied_user_ids_json, []);
        return (!allowed.length || allowed.includes(user.id)) && !denied.includes(user.id);
      }).map((row) => ({ id: row.id, userId: row.user_id, author: row.author, body: row.body, imageDataUrl: row.image_data_url, allowedUserIds: row.user_id === user.id ? parseJson(row.allowed_user_ids_json, []) : undefined, deniedUserIds: row.user_id === user.id ? parseJson(row.denied_user_ids_json, []) : undefined, createdAt: row.created_at, mine: row.user_id === user.id }));
      return json({ posts });
    }
    if (request.method === "POST") {
      const input = await body(request);
      const postBody = String(input.text || "").trim().slice(0, 2000);
      if (containsBlockedLanguage(postBody)) return fail("Please remove harmful or abusive language before posting.");
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); } catch (error) { return fail(error.message); }
      if (!postBody && !imageDataUrl) return fail("Add text or an image first.");
      const allowed = [...new Set((Array.isArray(input.allowedUserIds) ? input.allowedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      const denied = [...new Set((Array.isArray(input.deniedUserIds) ? input.deniedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      for (const targetId of [...allowed, ...denied]) if (!await areFriends(env, user.id, targetId) || await usersBlocked(env, user.id, targetId)) return fail("Post visibility can include accepted, unblocked friends only.", 403);
      const post = { id: randomBytes(12).toString("hex"), userId: user.id, body: postBody, imageDataUrl, createdAt: new Date().toISOString() };
      await env.DB.prepare("INSERT INTO community_posts (id, user_id, body, image_data_url, allowed_user_ids_json, denied_user_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(post.id, user.id, post.body, post.imageDataUrl, JSON.stringify(allowed), JSON.stringify(denied), post.createdAt).run();
      return json({ post }, 201);
    }
  }

  const postDeleteMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (request.method === "DELETE" && postDeleteMatch) {
    const result = await env.DB.prepare("DELETE FROM community_posts WHERE id = ? AND user_id = ?").bind(decodeURIComponent(postDeleteMatch[1]), user.id).run();
    if (!Number(result.meta?.changes || 0)) return fail("Post not found.", 404);
    return json({ ok: true });
  }

  const friendMatch = url.pathname.match(/^\/api\/community\/friends\/([^/]+)$/);
  if (request.method === "DELETE" && friendMatch) {
    const targetId = decodeURIComponent(friendMatch[1]);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM chat_connections WHERE status = 'accepted' AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))").bind(user.id, targetId, targetId, user.id),
      env.DB.prepare("DELETE FROM chat_members WHERE user_id = ? AND room_id IN (SELECT mine.room_id FROM chat_members mine JOIN chat_members other ON other.room_id = mine.room_id AND other.user_id = ? JOIN chat_rooms r ON r.id = mine.room_id WHERE mine.user_id = ? AND r.kind = 'direct')").bind(user.id, targetId, user.id)
    ]);
    return json({ ok: true });
  }

  const blockMatch = url.pathname.match(/^\/api\/community\/blocks\/([^/]+)$/);
  if (blockMatch && ["POST", "DELETE"].includes(request.method)) {
    const targetId = decodeURIComponent(blockMatch[1]);
    if (!targetId || targetId === user.id) return fail("Choose another member.");
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM chat_blocks WHERE blocker_id = ? AND blocked_id = ?").bind(user.id, targetId).run();
      return json({ ok: true });
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO chat_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").bind(user.id, targetId, now),
      env.DB.prepare("DELETE FROM chat_connections WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)").bind(user.id, targetId, targetId, user.id),
      env.DB.prepare("DELETE FROM chat_members WHERE user_id = ? AND room_id IN (SELECT mine.room_id FROM chat_members mine JOIN chat_members other ON other.room_id = mine.room_id AND other.user_id = ? JOIN chat_rooms r ON r.id = mine.room_id WHERE mine.user_id = ? AND r.kind = 'direct')").bind(user.id, targetId, user.id)
    ]);
    return json({ ok: true });
  }

  const roomMatch = url.pathname.match(/^\/api\/community\/rooms\/([^/]+)(?:\/(join|messages|leave|pin|history|invite))?$/);
  if (roomMatch) {
    const roomId = decodeURIComponent(roomMatch[1]);
    const operation = roomMatch[2] || "";
    const profile = await communityProfile(env, user.id);
    if (!profile?.enabled) return fail("Join the community before using chat.", 403);
    const room = await env.DB.prepare("SELECT * FROM chat_rooms WHERE id = ? LIMIT 1").bind(roomId).first();
    if (!room) return fail("Chat room not found.", 404);

    if (request.method === "POST" && operation === "join") {
      if (room.kind !== "group") return fail("Private conversations cannot be joined directly.", 403);
      if (!room.system_managed) return fail("Member-created groups require an invitation.", 403);
      await env.DB.prepare("INSERT OR IGNORE INTO chat_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(roomId, user.id, new Date().toISOString()).run();
      return json({ ok: true });
    }

    const membership = await env.DB.prepare("SELECT user_id FROM chat_members WHERE room_id = ? AND user_id = ? LIMIT 1").bind(roomId, user.id).first();
    if (!membership) return fail("Join this room before reading or sending messages.", 403);

    if (request.method === "POST" && operation === "invite") {
      if (room.kind !== "group") return fail("Invitations are available in group chats only.");
      const input = await body(request);
      const memberIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String))].filter((id) => id && id !== user.id).slice(0, 30);
      if (!memberIds.length) return fail("Choose at least one friend to invite.");
      const now = new Date().toISOString();
      const statements = [];
      for (const memberId of memberIds) {
        if (!await areFriends(env, user.id, memberId) || await usersBlocked(env, user.id, memberId)) return fail("You can invite accepted, unblocked friends only.", 403);
        const joined = await env.DB.prepare("SELECT 1 AS joined FROM chat_members WHERE room_id = ? AND user_id = ? LIMIT 1").bind(roomId, memberId).first();
        if (!joined) statements.push(env.DB.prepare(`INSERT INTO chat_group_invitations (id, room_id, inviter_id, recipient_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(room_id, recipient_id) DO UPDATE SET inviter_id = excluded.inviter_id, status = 'pending', updated_at = excluded.updated_at`).bind(randomBytes(12).toString("hex"), roomId, user.id, memberId, now, now));
      }
      if (statements.length) await env.DB.batch(statements);
      return json({ ok: true, invited: statements.length });
    }

    if (request.method === "POST" && operation === "leave") {
      if (room.kind !== "group") return fail("Use Remove friend to close a private conversation.");
      await env.DB.prepare("DELETE FROM chat_members WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).run();
      return json({ ok: true });
    }

    if (request.method === "POST" && operation === "pin") {
      const pinned = Boolean((await body(request)).pinned);
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO chat_room_preferences (room_id, user_id, pinned_at) VALUES (?, ?, ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET pinned_at = excluded.pinned_at
      `).bind(roomId, user.id, pinned ? now : null).run();
      return json({ ok: true, pinned });
    }

    if (request.method === "DELETE" && operation === "history") {
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO chat_room_preferences (room_id, user_id, cleared_before) VALUES (?, ?, ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET cleared_before = excluded.cleared_before
      `).bind(roomId, user.id, now).run();
      return json({ ok: true, clearedBefore: now });
    }

    if (request.method === "GET" && operation === "messages") {
      if (room.system_managed) await cleanupSystemGroupHistory(env);
      const rows = await allRows(env.DB.prepare(`
        SELECT m.id, m.user_id, m.body, m.created_at, COALESCE(cp.display_name, u.name) AS author
        FROM chat_messages m JOIN users u ON u.id = m.user_id
        LEFT JOIN community_profiles cp ON cp.user_id = m.user_id
        WHERE m.room_id = ?
          AND m.created_at > COALESCE((SELECT cleared_before FROM chat_room_preferences WHERE room_id = ? AND user_id = ?), '')
          AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.blocker_id = ? AND b.blocked_id = m.user_id)
        ORDER BY m.created_at DESC LIMIT 100
      `).bind(roomId, roomId, user.id, user.id));
      const pref = await env.DB.prepare("SELECT pinned_at FROM chat_room_preferences WHERE room_id = ? AND user_id = ? LIMIT 1").bind(roomId, user.id).first();
      const other = room.kind === "direct" ? await env.DB.prepare("SELECT user_id FROM chat_members WHERE room_id = ? AND user_id != ? LIMIT 1").bind(roomId, user.id).first() : null;
      const members = room.kind === "group" ? await allRows(env.DB.prepare(`SELECT member.user_id, member.role, COALESCE(profile.display_name, account.name) AS display_name FROM chat_members member JOIN users account ON account.id = member.user_id LEFT JOIN community_profiles profile ON profile.user_id = member.user_id WHERE member.room_id = ? ORDER BY member.role = 'moderator' DESC, display_name`).bind(roomId)) : [];
      return json({ room: { id: room.id, name: room.name, kind: room.kind, systemManaged: Boolean(room.system_managed), createdBy: room.created_by, pinned: Boolean(pref?.pinned_at), otherUserId: other?.user_id || null }, members: members.map((member) => ({ userId: member.user_id, displayName: member.display_name, role: member.role })), messages: rows.reverse().map((row) => ({ id: row.id, userId: row.user_id, author: row.author, body: row.body, createdAt: row.created_at, mine: row.user_id === user.id })) });
    }

    if (request.method === "POST" && operation === "messages") {
      const messageBody = String((await body(request)).message || "").trim().slice(0, 1000);
      if (!messageBody) return fail("Write a message first.");
      if (containsBlockedLanguage(messageBody)) return fail("Please remove harmful or abusive language before sending.");
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: messageBody, createdAt: new Date().toISOString() };
      await env.DB.prepare("INSERT INTO chat_messages (id, room_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)").bind(message.id, roomId, user.id, message.body, message.createdAt).run();
      ctx.waitUntil(syncUser(env, user).catch(() => {}));
      return json({ message: { ...message, author: profile.display_name, mine: true }, sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } }, 201);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/community/connect") {
    const targetUserId = String((await body(request)).targetUserId || "");
    if (!targetUserId || targetUserId === user.id) return fail("Choose another community member.");
    const ownProfile = await communityProfile(env, user.id);
    const targetProfile = await communityProfile(env, targetUserId);
    if (!ownProfile?.enabled || !targetProfile?.enabled) return fail("Both members must opt in to community matching.", 403);
    if (await usersBlocked(env, user.id, targetUserId)) return fail("This connection is unavailable.", 403);
    const key = pairKey(user.id, targetUserId);
    const existing = await env.DB.prepare("SELECT id, status FROM chat_connections WHERE pair_key = ? LIMIT 1").bind(key).first();
    if (existing) return fail(existing.status === "accepted" ? "You already have a private chat." : "A connection request already exists.", 409);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO chat_connections (id, pair_key, requester_id, recipient_id, status, room_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)")
      .bind(randomBytes(12).toString("hex"), key, user.id, targetUserId, now, now).run();
    return json({ ok: true }, 201);
  }

  const connectionMatch = url.pathname.match(/^\/api\/community\/connections\/([^/]+)\/(accept|decline)$/);
  if (request.method === "POST" && connectionMatch) {
    const connectionId = decodeURIComponent(connectionMatch[1]);
    const action = connectionMatch[2];
    const connection = await env.DB.prepare("SELECT * FROM chat_connections WHERE id = ? AND recipient_id = ? AND status = 'pending' LIMIT 1").bind(connectionId, user.id).first();
    if (!connection) return fail("Connection request not found.", 404);
    if (await usersBlocked(env, connection.requester_id, connection.recipient_id)) return fail("This connection is unavailable.", 403);
    const now = new Date().toISOString();
    if (action === "decline") {
      await env.DB.prepare("UPDATE chat_connections SET status = 'declined', updated_at = ? WHERE id = ?").bind(now, connection.id).run();
      return json({ ok: true });
    }
    const roomId = `direct-${randomBytes(12).toString("hex")}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_rooms (id, kind, name, description, created_by, created_at) VALUES (?, 'direct', 'Private conversation', '', ?, ?)").bind(roomId, connection.requester_id, now),
      env.DB.prepare("INSERT INTO chat_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(roomId, connection.requester_id, now),
      env.DB.prepare("INSERT INTO chat_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(roomId, connection.recipient_id, now),
      env.DB.prepare("UPDATE chat_connections SET status = 'accepted', room_id = ?, updated_at = ? WHERE id = ?").bind(roomId, now, connection.id)
    ]);
    return json({ ok: true, roomId });
  }

  if (request.method === "POST" && url.pathname === "/api/profile") {
    if (user.guest) return fail("Create an account to save a personal record.", 403);
    const { responses } = await body(request);
    if (!responses || !Array.isArray(responses.interests) || !responses.interests.length) return fail("Please choose at least one area of interest.");
    user.profile = { responses, summary: profileSummary(responses), updatedAt: new Date().toISOString() };
    user.surveyCompleted = true;
    user.updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET survey_completed = 1, profile_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.profile), user.updatedAt, user.id).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ user: safeUser(user), sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } });
  }

  if (request.method === "POST" && url.pathname === "/api/onboarding/complete") {
    if (user.guest) return fail("Create an account to save onboarding progress.", 403);
    user.onboardingCompleted = true;
    user.updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET onboarding_completed = 1, updated_at = ? WHERE id = ?").bind(user.updatedAt, user.id).run();
    return json({ user: safeUser(user) });
  }

  if (request.method === "POST" && url.pathname === "/api/ai/recommend") {
    const { topic = "Education", diagnosis = "", description = "", count, clarificationHandled = false, confirmedSecondaryKeywords = [], rejectedKeywords = [], age = "", lifeStage = "", language = "en" } = await body(request);
    if (String(description).trim().length < 8) return fail("Tell Waffles a little more so the recommendations can be useful.");
    if (!diagnosis) return fail("Choose an island before searching for resources.");
    const questions = clarificationQuestions({ topic, description, maxQuestions: scoreConfig.limits.maximumFollowUpQuestions });
    if (!clarificationHandled && questions.length) return json({ needsClarification: true, questions });
    const data = await resources(env);
    const primaryKeywords = extractKeywords([description], scoreConfig.limits.maximumPrimaryKeywords);
    const gateKeywords = extractGateKeywords([...primaryKeywords, ...confirmedSecondaryKeywords], scoreConfig);
    const expansionKeywords = heuristicKeywordExpansion([...primaryKeywords, ...confirmedSecondaryKeywords], scoreConfig.limits.maximumSecondaryKeywords);
    const profileAge = user.profile?.responses?.age || "";
    const lifeStages = extractLifeStages([description, age, lifeStage, profileAge], 8);
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const requestedCount = normalizeResultCount(count, scoreConfig);
    const rankingInput = { diagnosis, category: topic, gateKeywords, primaryKeywords, confirmedSecondaryKeywords, rejectedKeywords, expansionKeywords, issuePreferences, age: profileAge || age, lifeStage, lifeStages, count: requestedCount, config: scoreConfig };
    let expanded = { ai: false, keywords: [] };
    let matches = rankResources(data.rows, { ...rankingInput, predictedKeywords: [] });
    if (matches.length < requestedCount) {
      expanded = await expandKeywords(env, { topic, description, profile: user.profile, directKeywords: primaryKeywords, limit: scoreConfig.limits.maximumPredictedKeywords });
      matches = rankResources(data.rows, { ...rankingInput, predictedKeywords: expanded.keywords });
    }
    let answer = null;
    try { answer = await aiAnswer(env, { topic, description, profile: user.profile, matches, language }); } catch {}
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
        source: data.source
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
        source: data.source
      });
    }
    if (!user.guest) {
      user.history = [...(user.history || []), { topic, description, at: new Date().toISOString() }].slice(-50);
      await env.DB.prepare("UPDATE users SET history_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.history), new Date().toISOString(), user.id).run();
      ctx.waitUntil(syncUser(env, user).catch(() => {}));
    }
    const errorSync = [];
    for (const details of errorLogs) {
      try {
        errorSync.push(await logErrorRecord(env, details));
      } catch (error) {
        errorSync.push({ synced: false, reason: error.message });
      }
    }
    return json({ answer, resources: matches, source: data.source, ai: Boolean(env.OPENAI_API_KEY), keywordExpansion: { ai: expanded.ai, synonyms: expansionKeywords, predicted: expanded.keywords, suggested: [...expansionKeywords, ...expanded.keywords] }, scoring: { version: scoreConfig.version, minimumScore: scoreConfig.limits.minimumScore }, errorSync, sync: { queued: !user.guest && Boolean(env.USER_SHEET_WEBHOOK_URL) } });
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    if (user.guest) return fail("Create an account to save feedback.", 403);
    user.feedback = String((await body(request)).feedback || "").slice(0, 2000);
    await env.DB.prepare("UPDATE users SET feedback = ?, updated_at = ? WHERE id = ?").bind(user.feedback, new Date().toISOString(), user.id).run();
    let sync = { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
    try { sync = await syncUser(env, user); } catch (error) { sync = { synced: false, reason: error.message }; }
    return json({ ok: true, sync });
  }

  if (request.method === "POST" && url.pathname === "/api/resources/like") {
    if (user.guest) return fail("Create an account to save liked resources.", 403);
    const { resource = {}, liked = true } = await body(request);
    const name = String(resource.name || "").trim().slice(0, 180);
    const urlValue = String(resource.url || "").trim().slice(0, 500);
    if (!name || !urlValue) return fail("Choose a resource before saving it.");
    const savedResource = {
      name,
      url: urlValue,
      description: String(resource.description || "").trim().slice(0, 500),
      topic: String(resource.topic || "").trim().slice(0, 80),
      score: Number(resource.score || 0),
      savedAt: new Date().toISOString()
    };
    const key = `${name.toLowerCase()}|${urlValue.toLowerCase()}`;
    const current = Array.isArray(user.likedResources) ? user.likedResources : [];
    const filtered = current.filter((entry) => `${String(entry.name || "").toLowerCase()}|${String(entry.url || "").toLowerCase()}` !== key);
    const currentDisliked = Array.isArray(user.dislikedResources) ? user.dislikedResources : [];
    user.likedResources = liked ? [savedResource, ...filtered].slice(0, 100) : filtered;
    user.dislikedResources = liked ? currentDisliked.filter((entry) => `${String(entry.name || "").toLowerCase()}|${String(entry.url || "").toLowerCase()}` !== key) : currentDisliked;
    user.updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET liked_resources_json = ?, disliked_resources_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.likedResources), JSON.stringify(user.dislikedResources), user.updatedAt, user.id).run();
    let sync = { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
    try { sync = await syncUser(env, user); } catch (error) { sync = { synced: false, reason: error.message }; }
    return json({ ok: true, likedResources: user.likedResources, dislikedResources: user.dislikedResources, sync });
  }

  if (request.method === "POST" && url.pathname === "/api/resources/dislike") {
    if (user.guest) return fail("Create an account to mark disliked resources.", 403);
    const { resource = {}, disliked = true } = await body(request);
    const name = String(resource.name || "").trim().slice(0, 180);
    const urlValue = String(resource.url || "").trim().slice(0, 500);
    if (!name || !urlValue) return fail("Choose a resource before marking it.");
    const dislikedResource = {
      name,
      url: urlValue,
      description: String(resource.description || "").trim().slice(0, 500),
      topic: String(resource.topic || "").trim().slice(0, 80),
      score: Number(resource.score || 0),
      savedAt: new Date().toISOString()
    };
    const key = `${name.toLowerCase()}|${urlValue.toLowerCase()}`;
    const currentDisliked = Array.isArray(user.dislikedResources) ? user.dislikedResources : [];
    const filteredDisliked = currentDisliked.filter((entry) => `${String(entry.name || "").toLowerCase()}|${String(entry.url || "").toLowerCase()}` !== key);
    const currentLiked = Array.isArray(user.likedResources) ? user.likedResources : [];
    user.likedResources = disliked ? currentLiked.filter((entry) => `${String(entry.name || "").toLowerCase()}|${String(entry.url || "").toLowerCase()}` !== key) : currentLiked;
    user.dislikedResources = disliked ? [dislikedResource, ...filteredDisliked].slice(0, 100) : filteredDisliked;
    user.updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET liked_resources_json = ?, disliked_resources_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.likedResources), JSON.stringify(user.dislikedResources), user.updatedAt, user.id).run();
    let sync = { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
    try { sync = await syncUser(env, user); } catch (error) { sync = { synced: false, reason: error.message }; }
    let errorSync = { synced: false };
    if (disliked) {
      try {
        errorSync = await logErrorRecord(env, {
          event: "resource_disliked",
          reason: "User marked a resource as disliked.",
          user,
          topic: dislikedResource.topic,
          resource: dislikedResource,
          source: "resource-card"
        });
      } catch (error) {
        errorSync = { synced: false, reason: error.message };
      }
    }
    return json({ ok: true, likedResources: user.likedResources, dislikedResources: user.dislikedResources, sync, errorSync });
  }

  return fail("API route not found.", 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await api(request, env, ctx);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return fail(error.message || "Something went wrong.", 500);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanupSystemGroupHistory(env));
  }
};
