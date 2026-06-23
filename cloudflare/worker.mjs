import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fallbackResources from "../data/resources-fallback.json" with { type: "json" };
import scoreConfigFile from "../config/scoring-config.json" with { type: "json" };
import { DEFAULT_SCORE_CONFIG, extractKeywords, heuristicKeywordExpansion, inferIssuePreferences, rankResources } from "../scoring-engine.mjs";

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
    profile: parseJson(row.profile_json, null),
    history: parseJson(row.history_json, []),
    feedback: row.feedback || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, surveyCompleted: Boolean(user.surveyCompleted), profile: user.profile || null, history: user.history || [] };
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

function deterministicAnswer(topic, description, matches) {
  return `Waffles found ${matches.length} promising ${String(topic).toLowerCase()} resources for “${description}”. Start with ${matches.slice(0, 3).map((item) => item.name).join(", ")}. Each result was scored against its tags first, then its description and possible issue conflicts. Please confirm eligibility, cost, and current availability directly with each provider.`;
}

function responseText(data) {
  return (data.output || []).flatMap((item) => item.content || []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n").trim();
}

async function expandKeywords(env, { topic, description, profile, directKeywords, limit }) {
  const fallback = heuristicKeywordExpansion(directKeywords, limit);
  if (!env.OPENAI_API_KEY) return { keywords: fallback, ai: false };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.5",
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
    return { keywords: [...new Set([...keywords, ...fallback])].slice(0, limit), ai: true };
  } catch { return { keywords: fallback, ai: false }; }
}

async function aiAnswer(env, { topic, description, profile, matches }) {
  if (!env.OPENAI_API_KEY) return null;
  const candidateResources = matches.map(({ name, description: detail, url, age, location, price, tags, score, explanation }) => ({ name, detail, url, age, location, price, tags, score, explanation }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: "You are Waffles, a warm animated capybara resource guide. Recommend only from candidateResources. Do not diagnose, promise outcomes, or invent facts or URLs. Explain why the top options fit in under 180 words.",
      input: JSON.stringify({ topic, userDescription: description, personalRecord: profile?.summary || "", candidateResources })
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  return responseText(await response.json());
}

async function syncUser(env, user) {
  if (!env.USER_SHEET_WEBHOOK_URL) return { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
  const payload = {
    "User name": user.name,
    "Password": "Not stored — secure hash only",
    "response of survey": JSON.stringify(user.profile?.responses || {}),
    "AI summary the response of surve": user.profile?.summary || "",
    "AI personal record": user.profile?.summary || "",
    history: JSON.stringify(user.history || []),
    feedback: user.feedback || "",
    email: user.email,
    userId: user.id
  };
  const response = await fetch(env.USER_SHEET_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`User sheet webhook returned ${response.status}.`);
  return { synced: true };
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
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, storage: "cloudflare-d1", openaiConfigured: Boolean(env.OPENAI_API_KEY), userSheetConfigured: Boolean(env.USER_SHEET_WEBHOOK_URL) });
  if (request.method === "GET" && url.pathname === "/api/scoring-config") return json(scoreConfig);
  if (request.method === "GET" && url.pathname === "/api/environment") {
    try { return json(await environment(request)); } catch { return fail("Local weather is temporarily unavailable.", 503); }
  }
  if (request.method === "GET" && url.pathname === "/api/resources") {
    const data = await resources(env, url.searchParams.get("refresh") === "1");
    return json({ resources: data.rows, source: data.source, warning: data.warning || null, updatedAt: new Date().toISOString() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const { name, email, password } = await body(request);
    if (!String(name || "").trim()) return fail("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return fail("Please enter a valid email.");
    if (String(password || "").length < 8) return fail("Password must be at least 8 characters.");
    const normalizedEmail = String(email).toLowerCase();
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first()) return fail("An account with this email already exists.", 409);
    const now = new Date().toISOString();
    const user = { id: randomBytes(12).toString("hex"), name: String(name).trim(), email: normalizedEmail, passwordHash: hashPassword(String(password)), surveyCompleted: false, profile: null, history: [], feedback: "", createdAt: now, updatedAt: now };
    await env.DB.prepare("INSERT INTO users (id, name, email, password_hash, survey_completed, profile_json, history_json, feedback, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, '[]', '', ?, ?)").bind(user.id, user.name, user.email, user.passwordHash, now, now).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ user: safeUser(user), sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } }, 201, { "Set-Cookie": await createSession(env, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await body(request);
    const user = dbUser(await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(String(email || "").toLowerCase()).first());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return fail("Email or password is incorrect.", 401);
    return json({ user: safeUser(user) }, 200, { "Set-Cookie": await createSession(env, user.id) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookies(request).capy_session;
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": "capy_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await sessionUser(request, env);
    return user ? json({ user: safeUser(user) }) : fail("Not signed in.", 401);
  }

  const user = await sessionUser(request, env);
  if (!user) return fail("Please sign in first.", 401);

  if (request.method === "POST" && url.pathname === "/api/profile") {
    const { responses } = await body(request);
    if (!responses || !Array.isArray(responses.interests) || !responses.interests.length) return fail("Please choose at least one area of interest.");
    user.profile = { responses, summary: profileSummary(responses), updatedAt: new Date().toISOString() };
    user.surveyCompleted = true;
    user.updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET survey_completed = 1, profile_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.profile), user.updatedAt, user.id).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ user: safeUser(user), sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } });
  }

  if (request.method === "POST" && url.pathname === "/api/ai/recommend") {
    const { topic = "Education", description = "", count } = await body(request);
    if (String(description).trim().length < 8) return fail("Tell Waffles a little more so the recommendations can be useful.");
    const data = await resources(env);
    const profileInputs = [user.profile?.responses?.age, ...(user.profile?.responses?.interests || []), ...(user.profile?.responses?.situation || []), user.profile?.responses?.note];
    const directKeywords = extractKeywords([topic, description, ...profileInputs], scoreConfig.limits.maximumDirectKeywords);
    const expanded = await expandKeywords(env, { topic, description, profile: user.profile, directKeywords, limit: scoreConfig.limits.maximumSuggestedKeywords });
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const matches = rankResources(data.rows, { directKeywords, suggestedKeywords: expanded.keywords, issuePreferences, count, config: scoreConfig });
    let answer = null;
    try { answer = await aiAnswer(env, { topic, description, profile: user.profile, matches }); } catch {}
    if (!answer) answer = deterministicAnswer(topic, description, matches);
    user.history = [...(user.history || []), { topic, description, at: new Date().toISOString() }].slice(-50);
    await env.DB.prepare("UPDATE users SET history_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.history), new Date().toISOString(), user.id).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ answer, resources: matches, source: data.source, ai: Boolean(env.OPENAI_API_KEY), keywordExpansion: { ai: expanded.ai, suggested: expanded.keywords }, scoring: { version: scoreConfig.version, minimumScore: scoreConfig.limits.minimumScore }, sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } });
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    user.feedback = String((await body(request)).feedback || "").slice(0, 2000);
    await env.DB.prepare("UPDATE users SET feedback = ?, updated_at = ? WHERE id = ?").bind(user.feedback, new Date().toISOString(), user.id).run();
    ctx.waitUntil(syncUser(env, user).catch(() => {}));
    return json({ ok: true, sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } });
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
  }
};
