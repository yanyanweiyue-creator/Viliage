import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fallbackResources from "../data/resources-fallback.json" with { type: "json" };
import scoreConfigFile from "../config/scoring-config.json" with { type: "json" };
import { CLARIFICATION_TRANSLATIONS, DEFAULT_SCORE_CONFIG, clarificationQuestions, extractGateKeywords, extractKeywords, extractLifeStages, heuristicKeywordExpansion, inferIssuePreferences, normalizeKeywordList, normalizeResultCount, rankResources } from "../scoring-engine.mjs";
import { communitySimilarity, containsBlockedLanguage, maskBlockedLanguage, normalizeBlockedTerms, pairKey, safeDisplayName } from "../community-logic.mjs";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RESOURCE_SHEET_ID = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const DEFAULT_RESOURCE_SHEET_GID = "1709372674";
const DEFAULT_USER_COUNT_SHEET_ID = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const DEFAULT_USER_COUNT_SHEET_GID = "1958570867";
const DEFAULT_FEEDBACK_SHEET_ID = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const DEFAULT_FEEDBACK_SHEET_GID = "981733839";
const DEFAULT_ADMIN_EMAIL = "yanyanweiyue@gmail.com";
const PASSWORD_RESET_FALLBACK_SECRET = "local-development-only";
const DEFAULT_PRIMARY_KEYWORD_BLOCKLIST = ["waffles"];
const COUNT_TOTAL_GUEST_SESSIONS = "Total Guest Sessions";
const COUNT_TOTAL_ACCOUNTS_CREATED = "Total Accounts Created";
const COUNT_TOTAL_SEARCHES_COMPLETED = "Total Searches Completed";
const COUNT_RECOMMENDATION_USEFULNESS = "Average Recommendation System Usefulness on a 1-5 Scale (5 being the best, 1 being the worst)";
const COUNT_USEFULNESS_SCORE_TOTAL = "__recommendation_usefulness_score_total";
const COUNT_USEFULNESS_RESPONSE_COUNT = "__recommendation_usefulness_response_count";
const ALL_TIME_USER_COUNT_KEY = "user_count_metrics:all-time";
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

function passwordResetHash(email, code, secret = PASSWORD_RESET_FALLBACK_SECRET) {
  return createHash("sha256").update(`${String(email).toLowerCase()}\u001f${String(code)}\u001f${String(secret || "")}`).digest("hex");
}

function passwordResetHashCandidates(email, code, secret) {
  const configuredSecret = String(secret || "");
  const primary = passwordResetHash(email, code, configuredSecret || PASSWORD_RESET_FALLBACK_SECRET);
  if (configuredSecret) return [primary];
  return [primary, passwordResetHash(email, code, "")];
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

function localizedClarificationQuestions({ topic, description, language = "en" }) {
  const translations = CLARIFICATION_TRANSLATIONS[language] || CLARIFICATION_TRANSLATIONS.en || {};
  return clarificationQuestions({ topic, description, maxQuestions: scoreConfig.limits.maximumFollowUpQuestions }).map((item) => ({
    ...item,
    question: translations[item.id] || item.question,
    options: (item.options || []).map((option) => translations[option] || option)
  }));
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
    isAdmin: Boolean(row.is_admin),
    avatarDataUrl: row.avatar_data_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, surveyCompleted: Boolean(user.surveyCompleted), onboardingCompleted: Boolean(user.onboardingCompleted), profile: user.profile || null, history: user.history || [], feedback: user.feedback || "", likedResources: Array.isArray(user.likedResources) ? user.likedResources : [], dislikedResources: Array.isArray(user.dislikedResources) ? user.dislikedResources : [], isAdmin: Boolean(user.isAdmin), avatarDataUrl: user.avatarDataUrl || "" };
}

function guestUser() {
  return { id: "guest", name: "Guest", email: "", guest: true, surveyCompleted: true, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [], avatarDataUrl: "" };
}

async function primaryKeywordBlocklist(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'blocked_primary_keywords' LIMIT 1").first();
  const raw = row?.value || env.PRIMARY_KEYWORD_BLOCKLIST || JSON.stringify(DEFAULT_PRIMARY_KEYWORD_BLOCKLIST);
  try { return normalizeKeywordList(JSON.parse(raw), 200); }
  catch { return normalizeKeywordList(raw, 200); }
}

async function savePrimaryKeywordBlocklist(env, keywords) {
  const normalized = normalizeKeywordList(keywords, 200);
  await env.DB.prepare(`
    INSERT INTO app_meta (key, value, updated_at) VALUES ('blocked_primary_keywords', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(normalized), new Date().toISOString()).run();
  return normalized;
}

async function communityBlockedTerms(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'community_blocked_terms' LIMIT 1").first();
  return normalizeBlockedTerms(parseJson(row?.value, row?.value || []), 500);
}

async function saveCommunityBlockedTerms(env, terms) {
  const normalized = normalizeBlockedTerms(terms, 500);
  await env.DB.prepare(`
    INSERT INTO app_meta (key, value, updated_at) VALUES ('community_blocked_terms', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(normalized), new Date().toISOString()).run();
  return normalized;
}

async function maskCommunityMessage(env, value) {
  return maskBlockedLanguage(String(value || ""), await communityBlockedTerms(env));
}

function filterPrimaryKeywords(keywords, blockedKeywords) {
  const blocked = new Set(normalizeKeywordList(blockedKeywords, 200));
  return normalizeKeywordList(keywords, 100).filter((keyword) => !blocked.has(keyword) && !keyword.split(" ").some((word) => blocked.has(word)));
}

async function ensureAdmin(env, user) {
  if (!user || user.guest || user.isAdmin) return user;
  const configured = [DEFAULT_ADMIN_EMAIL, ...String(env.ADMIN_EMAILS || "").split(",")].map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (configured.includes(user.email.toLowerCase())) {
    await env.DB.prepare("UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
    user.isAdmin = true;
  }
  return user;
}

function announcementInput(input) {
  const title = String(input.title || "").trim().slice(0, 120);
  const text = String(input.body || "").trim().slice(0, 5000);
  const category = String(input.category || "Update").trim().slice(0, 40) || "Update";
  if (!title) throw new Error("Please add an announcement title.");
  if (!text) throw new Error("Please add announcement details.");
  return { title, body: text, category, isPinned: Boolean(input.isPinned) };
}

function activityInput(input) {
  const date = String(input.date || "").trim().slice(0, 40);
  const title = String(input.title || "").trim().slice(0, 120);
  const meta = String(input.meta || "").trim().slice(0, 160);
  const description = String(input.description || "").trim().slice(0, 1200);
  if (!date) throw new Error("Please add a date label.");
  if (!title) throw new Error("Please add an activity title.");
  if (!description) throw new Error("Please add an activity description.");
  return { date, title, meta, description };
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

function safeAttachment(input = {}) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 140);
  const mime = String(input.mime || "").trim().toLowerCase().slice(0, 100);
  const dataUrl = String(input.dataUrl || "");
  if (!name || !mime || !dataUrl) return null;
  const allowed = /^(?:image\/(?:png|jpe?g|webp|gif)|application\/pdf|text\/plain|application\/(?:msword|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/i;
  if (!allowed.test(mime)) throw new Error("Attach an image, PDF, text, Word, Excel, or PowerPoint file.");
  if (dataUrl.length > 900000 || !new RegExp(`^data:${mime.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};base64,[a-z0-9+/=]+$`, "i").test(dataUrl)) throw new Error("Choose a supported file smaller than about 650 KB.");
  return { name, mime, dataUrl };
}

function safeMeetingFormat(input = {}) {
  return {
    bold: Boolean(input.bold),
    italic: Boolean(input.italic),
    list: [true, "bullets", "numbered"].includes(input.list) ? input.list : false
  };
}

function safeMeetingMetadata(input = {}) {
  const metadata = {};
  const cloudUrl = String(input.cloudUrl || "").trim().slice(0, 1000);
  if (cloudUrl) {
    try {
      const parsed = new URL(cloudUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      metadata.cloudUrl = parsed.toString();
      metadata.cloudProvider = String(input.cloudProvider || "Cloud file").trim().slice(0, 60) || "Cloud file";
    } catch {
      throw new Error("Use a valid HTTPS cloud-file link.");
    }
  }
  return metadata;
}

function meetingSettings(input = {}) {
  return {
    waitingRoom: input.waitingRoom !== false,
    recordingAllowed: input.recordingAllowed !== false,
    captionsEnabled: input.captionsEnabled !== false,
    chatPolicy: ["everyone", "host-only", "disabled"].includes(input.chatPolicy) ? input.chatPolicy : "everyone",
    privateChat: input.privateChat !== false,
    allowMemberPolls: Boolean(input.allowMemberPolls),
    whiteboardPermission: ["edit", "comment", "view"].includes(input.whiteboardPermission) ? input.whiteboardPermission : "edit",
    presenterMode: Boolean(input.presenterMode)
  };
}

function communityDocumentInput(input = {}) {
  const kind = ["doc", "pdf", "form"].includes(String(input.kind || "").toLowerCase()) ? String(input.kind).toLowerCase() : "doc";
  const title = String(input.title || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 180);
  if (!title) throw new Error("Add a document title.");
  const content = input.content && typeof input.content === "object" ? input.content : {};
  const encoded = JSON.stringify(content);
  if (encoded.length > 900000) throw new Error("This Village document is too large. Remove an embedded image or attachment and try again.");
  const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
  const settingsEncoded = JSON.stringify(settings);
  if (settingsEncoded.length > 25000) throw new Error("Document settings are too large.");
  const folderId = String(input.folderId || "").trim().slice(0, 80) || null;
  const templateKey = String(input.templateKey || "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || null;
  return { kind, title, content, encoded, settings, settingsEncoded, folderId, templateKey };
}

function documentPermission(document, userId) {
  if (!document) return "none";
  if (document.owner_id === userId) return "owner";
  const expiresAt = document.collaborator_expires_at ? new Date(document.collaborator_expires_at).getTime() : 0;
  if (document.collaborator_permission && (!expiresAt || expiresAt > Date.now())) return document.collaborator_permission;
  return document.room_shared ? "viewer" : "none";
}

function canEditDocument(document, userId) {
  return ["owner", "editor"].includes(documentPermission(document, userId));
}

function canCommentDocument(document, userId) {
  return ["owner", "editor", "commenter"].includes(documentPermission(document, userId));
}

function mapCommunityDocument(document, userId, extra = {}) {
  const permission = documentPermission(document, userId);
  return {
    id: document.id,
    ownerId: document.owner_id,
    ownerName: document.owner_name,
    kind: document.kind,
    title: document.title,
    content: parseJson(document.content_json, {}),
    settings: parseJson(document.settings_json, {}),
    folderId: document.folder_id || "",
    favorite: Boolean(document.favorite),
    trashedAt: document.trashed_at || null,
    templateKey: document.template_key || "",
    versionNumber: Number(document.version_number || 1),
    publicShareToken: document.owner_id === userId ? document.public_share_token || "" : "",
    publicPermission: document.public_permission || "viewer",
    permissionExpiresAt: document.permission_expires_at || "",
    restrictions: {
      download: Boolean(document.restrict_download),
      copy: Boolean(document.restrict_copy),
      print: Boolean(document.restrict_print)
    },
    watermark: document.watermark || "",
    encrypted: Boolean(document.encrypted),
    permission,
    mine: document.owner_id === userId,
    canEdit: canEditDocument(document, userId),
    canComment: canCommentDocument(document, userId),
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    ...extra
  };
}

async function recordDocumentAudit(env, documentId, userId, action, metadata = {}) {
  const encoded = JSON.stringify(metadata && typeof metadata === "object" ? metadata : {});
  await env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(documentId, userId, String(action || "view").slice(0, 80), encoded.slice(0, 10000), new Date().toISOString()).run();
}

async function communityDocumentForUser(env, documentId, userId) {
  return env.DB.prepare(`
    SELECT document.*, owner.name AS owner_name,
      collaborator.permission AS collaborator_permission,
      collaborator.expires_at AS collaborator_expires_at,
      CASE WHEN EXISTS (
        SELECT 1 FROM community_document_shares share
        JOIN chat_members member ON member.room_id = share.room_id
        WHERE share.document_id = document.id AND member.user_id = ?
      ) THEN 1 ELSE 0 END AS room_shared
    FROM community_documents document
    JOIN users owner ON owner.id = document.owner_id
    LEFT JOIN community_document_collaborators collaborator
      ON collaborator.document_id = document.id AND collaborator.user_id = ?
    WHERE document.id = ? AND (
      document.owner_id = ? OR collaborator.user_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM community_document_shares share
        JOIN chat_members member ON member.room_id = share.room_id
        WHERE share.document_id = document.id AND member.user_id = ?
      )
    ) LIMIT 1
  `).bind(userId, userId, documentId, userId, userId).first();
}

async function roomForMember(env, roomId, userId) {
  return env.DB.prepare(`
    SELECT room.* FROM chat_rooms room
    JOIN chat_members member ON member.room_id = room.id
    WHERE room.id = ? AND member.user_id = ? LIMIT 1
  `).bind(roomId, userId).first();
}

async function createCommunityNotifications(env, roomId, senderId, kind, title, bodyText, metadata = {}) {
  const recipients = await allRows(env.DB.prepare(`
    SELECT member.user_id FROM chat_members member
    LEFT JOIN community_profiles profile ON profile.user_id = member.user_id
    WHERE member.room_id = ? AND member.user_id != ? AND COALESCE(profile.notifications_enabled, 1) = 1
  `).bind(roomId, senderId));
  if (!recipients.length) return;
  const at = new Date().toISOString();
  await env.DB.batch(recipients.map((recipient) => env.DB.prepare(`
    INSERT INTO community_notifications (id, user_id, kind, title, body, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(randomBytes(12).toString("hex"), recipient.user_id, kind, String(title).slice(0, 100), String(bodyText).slice(0, 240), JSON.stringify(metadata), at)));
}

async function createFriendNotifications(env, senderId, kind, title, bodyText, metadata = {}, visibility = {}) {
  const allowedUserIds = [...new Set((Array.isArray(visibility.allowedUserIds) ? visibility.allowedUserIds : []).map(String))];
  const deniedUserIds = new Set((Array.isArray(visibility.deniedUserIds) ? visibility.deniedUserIds : []).map(String));
  const recipients = await allRows(env.DB.prepare(`
    SELECT CASE WHEN connection.requester_id = ? THEN connection.recipient_id ELSE connection.requester_id END AS user_id
    FROM chat_connections connection
    LEFT JOIN community_profiles profile ON profile.user_id = CASE WHEN connection.requester_id = ? THEN connection.recipient_id ELSE connection.requester_id END
    WHERE connection.status = 'accepted' AND (connection.requester_id = ? OR connection.recipient_id = ?)
      AND COALESCE(profile.notifications_enabled, 1) = 1
  `).bind(senderId, senderId, senderId, senderId));
  const visibleRecipients = recipients.filter((recipient) => (!allowedUserIds.length || allowedUserIds.includes(recipient.user_id)) && !deniedUserIds.has(recipient.user_id));
  if (!visibleRecipients.length) return;
  const at = new Date().toISOString();
  await env.DB.batch(visibleRecipients.map((recipient) => env.DB.prepare(`
    INSERT INTO community_notifications (id, user_id, kind, title, body, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(randomBytes(12).toString("hex"), recipient.user_id, kind, String(title).slice(0, 100), String(bodyText).slice(0, 240), JSON.stringify(metadata), at)));
}

async function createUserNotification(env, userId, kind, title, bodyText, metadata = {}) {
  const profile = await communityProfile(env, userId);
  if (profile && !profile.notifications_enabled) return;
  await env.DB.prepare(`
    INSERT INTO community_notifications (id, user_id, kind, title, body, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomBytes(12).toString("hex"),
    userId,
    kind,
    String(title).slice(0, 100),
    String(bodyText).slice(0, 240),
    JSON.stringify(metadata),
    new Date().toISOString()
  ).run();
}

async function canViewCommunityPost(env, viewerId, post) {
  if (!post) return false;
  if (post.user_id === viewerId) return true;
  if (await usersBlocked(env, viewerId, post.user_id)) return false;
  const profile = await communityProfile(env, post.user_id);
  if (!profile?.enabled) return false;
  const friend = await areFriends(env, viewerId, post.user_id);
  if (!friend && !profile.allow_stranger_moments) return false;
  const visibilityDays = Math.max(1, Number(profile.moment_visibility_days || 30));
  if (new Date(post.created_at).getTime() < Date.now() - visibilityDays * 86400000) return false;
  const allowed = parseJson(post.allowed_user_ids_json, []);
  const denied = parseJson(post.denied_user_ids_json, []);
  return (!allowed.length || allowed.includes(viewerId)) && !denied.includes(viewerId);
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
  if (!profile?.enabled) return { enabled: false, displayName: profile?.display_name || safeDisplayName(user.name), avatarDataUrl: user.avatarDataUrl || "", groups, recommendations: [], incoming: [], outgoing: [], directRooms: [] };

  const candidates = await allRows(env.DB.prepare(`
    SELECT u.id, u.profile_json, u.avatar_data_url, cp.display_name
    FROM community_profiles cp JOIN users u ON u.id = cp.user_id
    WHERE cp.enabled = 1 AND cp.discoverable = 1 AND u.id != ?
      AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
      AND NOT EXISTS (SELECT 1 FROM chat_connections c WHERE (c.requester_id = ? AND c.recipient_id = u.id) OR (c.recipient_id = ? AND c.requester_id = u.id))
    LIMIT 60
  `).bind(user.id, user.id, user.id, user.id, user.id));
  const recommendations = candidates.map((candidate) => {
    const match = communitySimilarity(user.profile, parseJson(candidate.profile_json, null));
    return { userId: candidate.id, displayName: candidate.display_name, avatarDataUrl: candidate.avatar_data_url || "", score: match.score, reasons: match.reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)).slice(0, 6);

  const incoming = await allRows(env.DB.prepare(`
    SELECT c.id, c.requester_id AS user_id, cp.display_name, account.avatar_data_url, c.created_at
    FROM chat_connections c JOIN community_profiles cp ON cp.user_id = c.requester_id
    JOIN users account ON account.id = c.requester_id
    WHERE c.recipient_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC
  `).bind(user.id));
  const outgoing = await allRows(env.DB.prepare(`
    SELECT c.id, c.recipient_id AS user_id, cp.display_name, c.created_at
    FROM chat_connections c JOIN community_profiles cp ON cp.user_id = c.recipient_id
    WHERE c.requester_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC
  `).bind(user.id));
  const directRooms = await allRows(env.DB.prepare(`
    SELECT r.id, other.user_id AS user_id, other_user.email, other_user.avatar_data_url, COALESCE(cp.display_name, other_user.name) AS name,
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
  const notificationRows = await allRows(env.DB.prepare(`
    SELECT kind, COUNT(*) AS count FROM community_notifications
    WHERE user_id = ? AND read_at IS NULL GROUP BY kind
  `).bind(user.id));
  const notificationCounts = { direct: 0, groups: 0, moments: 0, requests: 0, meetings: 0, total: 0 };
  notificationRows.forEach((row) => {
    const count = Number(row.count || 0);
    const kind = String(row.kind || "");
    notificationCounts.total += count;
    if (["direct-message", "document", "file"].includes(kind)) notificationCounts.direct += count;
    else if (["group-message", "group-document"].includes(kind)) notificationCounts.groups += count;
    else if (["moment", "moment-comment"].includes(kind)) notificationCounts.moments += count;
    else if (["request", "group-invite"].includes(kind)) notificationCounts.requests += count;
    else if (kind === "meeting") notificationCounts.meetings += count;
    else notificationCounts.direct += count;
  });
  const documentCount = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM community_documents WHERE owner_id = ?").bind(user.id).first())?.count || 0);
  return {
    enabled: true,
    displayName: profile.display_name,
    avatarDataUrl: user.avatarDataUrl || "",
    coverImageDataUrl: profile.cover_image_data_url || "",
    preferences: {
      notificationsEnabled: Boolean(profile.notifications_enabled),
      discoverable: Boolean(profile.discoverable),
      directMessagesEnabled: Boolean(profile.direct_messages_enabled),
      locationSharingEnabled: Boolean(profile.location_sharing_enabled),
      momentTheme: profile.moment_theme || "light",
      allowStrangerRequests: Boolean(profile.allow_stranger_requests),
      allowStrangerMoments: Boolean(profile.allow_stranger_moments),
      momentVisibilityDays: Number(profile.moment_visibility_days || 30)
    },
    notificationCount: notificationCounts.total,
    notificationCounts,
    documentCount,
    groups,
    recommendations,
    incoming,
    outgoing,
    directRooms,
    blocks,
    groupInvites
  };
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
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}&headers=1${force ? `&cache=${Date.now()}` : ""}`;
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

function buildingGuideName(topic) {
  const key = String(topic || "").toLowerCase();
  if (key === "education") return "Muffins";
  if (key === "legal") return "Bacon";
  if (key === "recreation") return "Granola";
  if (key === "caregiver support" || key === "support") return "Eggy";
  if (key === "activity" || key === "activities") return "Mayor Crumpet";
  return "Waffles";
}

function deterministicAnswer(topic, description, matches, language = "en") {
  const topicText = String(topic).toLowerCase();
  const guideName = buildingGuideName(topic);
  if (language === "zh") {
    if (!matches.length) return `${guideName} 没有找到完全通过必要筛选的${topicText}资源：“${description}”。可以试着输入更宽泛的需求或地点关键词；诊断类型与建筑分类仍会作为硬性筛选保留。`;
    return `你好，我是 ${guideName}。我找到了 ${matches.length} 个可能合适的${topicText}资源，匹配你的需求：“${description}”。可以先看：${matches.slice(0, 3).map((item) => item.name).join("、")}。结果已按分数从高到低排列。请直接向服务机构确认资格、费用和当前可用性。`;
  }
  if (language === "es") {
    if (!matches.length) return `${guideName} no encontró un recurso de ${topicText} que pasara todos los filtros requeridos para “${description}”. Prueba una necesidad o ubicación más amplia; el diagnóstico y la categoría del edificio seguirán protegidos como filtros.`;
    return `Hola, soy ${guideName}. Encontré ${matches.length} recursos prometedores de ${topicText} para “${description}”. Empieza con ${matches.slice(0, 3).map((item) => item.name).join(", ")}. Los resultados están ordenados de mayor a menor puntuación. Confirma requisitos, costo y disponibilidad directamente con cada proveedor.`;
  }
  if (!matches.length) return `${guideName} did not find a ${topicText} resource that passed every required filter for “${description}”. Try one broader need or location phrase; diagnosis and building category will remain protected filters.`;
  return `Hi, I’m ${guideName}. I found ${matches.length} promising ${topicText} resources for “${description}”. Start with ${matches.slice(0, 3).map((item) => item.name).join(", ")}. Results are ordered from highest to lowest score. Please confirm eligibility, cost, and current availability directly with each provider.`;
}

function responseLanguageName(language = "en") {
  if (language === "zh") return "Simplified Chinese";
  if (language === "es") return "Spanish";
  return "English";
}

function responseText(data) {
  return (data.output || []).flatMap((item) => item.content || []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n").trim();
}

async function assistDocumentText(env, { action, text, language = "English", instruction = "" }) {
  const source = String(text || "").trim().slice(0, 30000);
  if (!source) throw new Error("Select or write some document text first.");
  const allowed = {
    continue: "Continue the writing naturally without repeating the source.",
    summarize: "Summarize the source accurately and concisely.",
    rewrite: "Rewrite the source for clarity while preserving its meaning.",
    polish: "Polish grammar, spelling, tone, and flow without inventing facts.",
    translate: `Translate the source into ${String(language || "English").slice(0, 60)}.`,
    grammar: "Return a corrected version and preserve the original structure."
  };
  const task = allowed[action];
  if (!task) throw new Error("Choose a supported writing action.");
  if (!env.OPENAI_API_KEY) {
    if (action === "summarize") return source.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
    if (action === "grammar" || action === "polish") return source.replace(/\s+/g, " ").trim();
    throw new Error("AI writing is not configured on this environment.");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      instructions: `You are the Village document writing assistant. ${task} Return only the requested document text, with no preface, markdown fence, diagnosis, or invented claims. Respect this optional direction: ${String(instruction || "none").slice(0, 500)}.`,
      input: source
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Writing assistant returned ${response.status}.`);
  const result = responseText(await response.json());
  if (!result) throw new Error("The writing assistant returned an empty response.");
  return result;
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
  const guideName = buildingGuideName(topic);
  const candidateResources = matches.map(({ name, description: detail, url, age, location, price, tags, score, explanation }) => ({ name, detail, url, age, location, price, tags, score, explanation }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4",
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
      max_output_tokens: 240,
      instructions: `You are ${guideName}, the warm guide for the ${topic} building. Start by introducing yourself as ${guideName}. Summarize only candidateResources, keep their score order, and never invent facts or URLs. Do not diagnose or promise outcomes. Use plain language, no markdown, and no more than 90 words. Encourage verification of eligibility, cost, and availability. Respond in ${responseLanguageName(language)}.`,
      input: JSON.stringify({ topic, userDescription: description, personalRecord: profile?.summary || "", candidateResources })
    }),
    signal: AbortSignal.timeout(4000)
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

function emptyUserCountMetrics() {
  return {
    [COUNT_TOTAL_GUEST_SESSIONS]: 0,
    [COUNT_TOTAL_ACCOUNTS_CREATED]: 0,
    [COUNT_TOTAL_SEARCHES_COMPLETED]: 0,
    [COUNT_RECOMMENDATION_USEFULNESS]: 0,
    [COUNT_USEFULNESS_SCORE_TOTAL]: 0,
    [COUNT_USEFULNESS_RESPONSE_COUNT]: 0
  };
}

function userCountSheetMetrics(metrics = {}) {
  return {
    [COUNT_TOTAL_GUEST_SESSIONS]: Number(metrics[COUNT_TOTAL_GUEST_SESSIONS] || 0),
    [COUNT_TOTAL_ACCOUNTS_CREATED]: Number(metrics[COUNT_TOTAL_ACCOUNTS_CREATED] || 0),
    [COUNT_TOTAL_SEARCHES_COMPLETED]: Number(metrics[COUNT_TOTAL_SEARCHES_COMPLETED] || 0),
    [COUNT_RECOMMENDATION_USEFULNESS]: Number(metrics[COUNT_RECOMMENDATION_USEFULNESS] || 0)
  };
}

function aggregateUserCountMetrics(entries = []) {
  const total = emptyUserCountMetrics();
  for (const metrics of entries) {
    total[COUNT_TOTAL_GUEST_SESSIONS] += Number(metrics?.[COUNT_TOTAL_GUEST_SESSIONS] || 0);
    total[COUNT_TOTAL_ACCOUNTS_CREATED] += Number(metrics?.[COUNT_TOTAL_ACCOUNTS_CREATED] || 0);
    total[COUNT_TOTAL_SEARCHES_COMPLETED] += Number(metrics?.[COUNT_TOTAL_SEARCHES_COMPLETED] || 0);
    total[COUNT_USEFULNESS_SCORE_TOTAL] += Number(metrics?.[COUNT_USEFULNESS_SCORE_TOTAL] || 0);
    total[COUNT_USEFULNESS_RESPONSE_COUNT] += Number(metrics?.[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
  }
  const usefulnessResponses = Number(total[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
  total[COUNT_RECOMMENDATION_USEFULNESS] = usefulnessResponses
    ? Number((Number(total[COUNT_USEFULNESS_SCORE_TOTAL] || 0) / usefulnessResponses).toFixed(2))
    : 0;
  return total;
}

async function loadUserCountMetrics(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1").bind(ALL_TIME_USER_COUNT_KEY).first();
  const saved = parseJson(row?.value, {});
  if (row && saved && typeof saved === "object") return { ...emptyUserCountMetrics(), ...saved };
  const legacyRows = await allRows(env.DB.prepare("SELECT value FROM app_meta WHERE key LIKE ?").bind("user_count_metrics:%"));
  const migrated = aggregateUserCountMetrics(legacyRows.map((legacyRow) => parseJson(legacyRow.value, {})));
  await saveUserCountMetrics(env, migrated);
  return migrated;
}

async function saveUserCountMetrics(env, metrics) {
  await env.DB.prepare(`
    INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(ALL_TIME_USER_COUNT_KEY, JSON.stringify(metrics), new Date().toISOString()).run();
}

async function recordUserCountMetrics(env, increments = {}) {
  if (!env.DB) return emptyUserCountMetrics();
  const metrics = await loadUserCountMetrics(env);
  for (const [key, value] of Object.entries(increments)) metrics[key] = Number(metrics[key] || 0) + Number(value || 0);
  const usefulnessResponses = Number(metrics[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
  metrics[COUNT_RECOMMENDATION_USEFULNESS] = usefulnessResponses
    ? Number((Number(metrics[COUNT_USEFULNESS_SCORE_TOTAL] || 0) / usefulnessResponses).toFixed(2))
    : 0;
  await saveUserCountMetrics(env, metrics);
  return metrics;
}

async function syncUserCountMetrics(env) {
  if (!env.DB) return { synced: false, reason: "D1 database is not configured." };
  if (!env.USER_COUNT_SHEET_WEBHOOK_URL) return { synced: false, reason: "USER_COUNT_SHEET_WEBHOOK_URL is not configured." };
  const metrics = await loadUserCountMetrics(env);
  const response = await fetch(env.USER_COUNT_SHEET_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "record-user-count",
      spreadsheetId: env.USER_COUNT_SHEET_ID || DEFAULT_USER_COUNT_SHEET_ID,
      sheetGid: env.USER_COUNT_SHEET_GID || DEFAULT_USER_COUNT_SHEET_GID,
      metrics: userCountSheetMetrics(metrics)
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`User count sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "User count sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

async function recordUserCountSafely(env, increments = {}) {
  try { return await recordUserCountMetrics(env, increments); }
  catch (error) {
    console.error("User count update failed:", error.message);
    return null;
  }
}

function keywordText(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 50).join(", ");
}

function locatedKeywords(matches = []) {
  return [...new Set((Array.isArray(matches) ? matches : []).flatMap((match) => (match.explanation || []).map((reason) => String(reason.keyword || "").trim())).filter(Boolean))].slice(0, 50);
}

function errorLogPayload(env, { event, reason, user, topic = "", diagnosis = "", description = "", requestedCount = "", providedCount = "", highScoreCount = "", source = "", resource = null, primaryKeywords = [], confirmedKeywords = [], predictedKeywords = [], locatedKeywords: foundKeywords = [] }) {
  const at = new Date().toISOString();
  return {
    action: "log-resource-error",
    spreadsheetId: env.ERROR_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0",
    sheetGid: env.ERROR_SHEET_GID || "1952899933",
    "Helpful?": "No",
    "Full Input": description,
    Diagnosis: diagnosis,
    Category: topic || resource?.topic || "",
    "Primary Keywords": keywordText(primaryKeywords),
    "Confirmed Keywords": keywordText(confirmedKeywords),
    "Predicted Keywords": keywordText(predictedKeywords),
    "Located Key Words": keywordText(foundKeywords),
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

function feedbackRecordPayload(env, { helpful, rating, details, user }) {
  return {
    action: "record-feedback",
    spreadsheetId: env.FEEDBACK_SHEET_ID || DEFAULT_FEEDBACK_SHEET_ID,
    sheetGid: env.FEEDBACK_SHEET_GID || DEFAULT_FEEDBACK_SHEET_GID,
    "Time Stamp": new Date().toISOString(),
    "Unique User ID (if applicable)": user?.guest ? "" : (user?.id || ""),
    "Email (if applicable)": user?.guest ? "" : (user?.email || ""),
    "Username (if applicable)": user?.name || "",
    Feedback: details,
    "Star(1-5)": rating,
    "Helpful / Nonhelpful": helpful ? "Helpful" : "Nonhelpful"
  };
}

async function syncFeedbackRecord(env, details) {
  const webhook = env.FEEDBACK_SHEET_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL || env.ERROR_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "FEEDBACK_SHEET_WEBHOOK_URL is not configured." };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedbackRecordPayload(env, details)),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Feedback sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "Feedback sheet rejected the update.");
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
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, storage: "cloudflare-d1", openaiConfigured: Boolean(env.OPENAI_API_KEY), userSheetConfigured: Boolean(env.USER_SHEET_WEBHOOK_URL), errorSheetConfigured: Boolean(env.ERROR_SHEET_WEBHOOK_URL), feedbackSheetConfigured: Boolean(env.FEEDBACK_SHEET_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL || env.ERROR_SHEET_WEBHOOK_URL), passwordEmailConfigured: Boolean(env.PASSWORD_EMAIL_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL), passwordEmailUsesUserSheetWebhook: !env.PASSWORD_EMAIL_WEBHOOK_URL && Boolean(env.USER_SHEET_WEBHOOK_URL), passwordEmailSender: env.PASSWORD_EMAIL_FROM_ADDRESS || "" });
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
  const publicDocumentMatch = url.pathname.match(/^\/api\/community\/public-documents\/([^/]+)$/);
  if (request.method === "GET" && publicDocumentMatch) {
    const token = decodeURIComponent(publicDocumentMatch[1]);
    const document = await env.DB.prepare(`
      SELECT document.*, owner.name AS owner_name
      FROM community_documents document JOIN users owner ON owner.id = document.owner_id
      WHERE document.public_share_token = ? AND document.trashed_at IS NULL
        AND (document.permission_expires_at IS NULL OR document.permission_expires_at > ?)
      LIMIT 1
    `).bind(token, new Date().toISOString()).first();
    if (!document) return fail("This document link is unavailable or has expired.", 404);
    return json({
      document: {
        id: document.id,
        ownerName: document.owner_name,
        kind: document.kind,
        title: document.title,
        content: parseJson(document.content_json, {}),
        settings: parseJson(document.settings_json, {}),
        publicPermission: document.public_permission || "viewer",
        restrictions: {
          download: Boolean(document.restrict_download),
          copy: Boolean(document.restrict_copy),
          print: Boolean(document.restrict_print)
        },
        watermark: document.watermark || "",
        encrypted: Boolean(document.encrypted),
        updatedAt: document.updated_at
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password/request") {
    const { email = "" } = await body(request);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return fail("Please enter a valid email address.");
    const response = { ok: true, deliveryAvailable: Boolean(env.PASSWORD_EMAIL_WEBHOOK_URL || env.USER_SHEET_WEBHOOK_URL), senderAddress: env.PASSWORD_EMAIL_FROM_ADDRESS || "", message: "If an account exists for that email, a six-digit code will arrive shortly." };
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    if (!user) {
      passwordResetHash(normalizedEmail, "000000", env.PASSWORD_RESET_SECRET || PASSWORD_RESET_FALLBACK_SECRET);
      return json(response, 202);
    }
    const now = Date.now();
    const prior = await env.DB.prepare("SELECT requested_at FROM password_reset_codes WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    if (prior && now - Number(prior.requested_at) < 60_000) return json(response, 202);
    const code = createPasswordResetCode();
    const codeHash = passwordResetHash(normalizedEmail, code, env.PASSWORD_RESET_SECRET || PASSWORD_RESET_FALLBACK_SECRET);
    await env.DB.prepare(`
      INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, requested_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, requested_at = excluded.requested_at
    `).bind(normalizedEmail, codeHash, now + 10 * 60_000, now).run();
    let delivered = false;
    try { delivered = await sendPasswordResetEmail(env, normalizedEmail, code); }
    catch (error) {
      await env.DB.prepare("DELETE FROM password_reset_codes WHERE email = ?").bind(normalizedEmail).run();
      console.error("Password reset email failed:", error.message);
      return fail("The verification email could not be sent. Please try again later or ask the site administrator for help.", 502);
    }
    if (!delivered) {
      await env.DB.prepare("DELETE FROM password_reset_codes WHERE email = ?").bind(normalizedEmail).run();
      return fail("Email delivery is not configured yet. Please ask the site administrator for help.", 503);
    }
    return json({ ...response, delivered }, 202);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password/confirm") {
    const { email = "", code = "", password = "" } = await body(request);
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !/^\d{6}$/.test(String(code))) return fail("The verification code is invalid or expired.");
    if (String(password).length < 8) return fail("Password must be at least 8 characters.");
    const reset = await env.DB.prepare("SELECT * FROM password_reset_codes WHERE email = ? LIMIT 1").bind(normalizedEmail).first();
    const submittedHashes = passwordResetHashCandidates(normalizedEmail, code, env.PASSWORD_RESET_SECRET);
    if (!reset || Number(reset.expires_at) < Date.now() || Number(reset.attempts) >= 5 || !submittedHashes.some((hash) => resetCodeMatches(reset.code_hash, hash))) {
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
    await ensureAdmin(env, user);
    const cookie = await createSession(env, user.id);
    await recordUserCountSafely(env, { [COUNT_TOTAL_ACCOUNTS_CREATED]: 1 });
    return json({ user: safeUser(user), sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } }, 201, { "Set-Cookie": cookie });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await body(request);
    const user = dbUser(await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(String(email || "").toLowerCase()).first());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return fail("Email or password is incorrect.", 401);
    await ensureAdmin(env, user);
    const cookie = await createSession(env, user.id);
    return json({ user: safeUser(user) }, 200, { "Set-Cookie": cookie });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/guest") {
    await recordUserCountSafely(env, { [COUNT_TOTAL_GUEST_SESSIONS]: 1 });
    return json({ user: guestUser() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookies(request).capy_session;
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": "capy_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await sessionUser(request, env);
    return user ? json({ user: safeUser(await ensureAdmin(env, user)) }) : fail("Not signed in.", 401);
  }

  const user = await ensureAdmin(env, await sessionUser(request, env) || (request.headers.get("X-Village-Guest") === "1" ? guestUser() : null));
  if (!user) return fail("Please sign in first.", 401);

  if (request.method === "GET" && url.pathname === "/api/announcements") {
    const announcements = await allRows(env.DB.prepare(`SELECT a.id, a.title, a.body, a.category, a.is_pinned, a.created_at, a.updated_at, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.created_by ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 100`));
    return json({ announcements: announcements.map((item) => ({ id: item.id, title: item.title, body: item.body, category: item.category, isPinned: Boolean(item.is_pinned), createdAt: item.created_at, updatedAt: item.updated_at, authorName: item.author_name })), isAdmin: Boolean(user.isAdmin) });
  }

  if (request.method === "GET" && url.pathname === "/api/activities") {
    const activities = await allRows(env.DB.prepare("SELECT id, date_label, title, meta, description, created_at, updated_at FROM activities ORDER BY created_at, id LIMIT 200"));
    return json({ activities: activities.map((item) => ({ id: item.id, date: item.date_label, title: item.title, meta: item.meta, description: item.description, createdAt: item.created_at, updatedAt: item.updated_at })), isAdmin: Boolean(user.isAdmin) });
  }

  if (request.method === "POST" && url.pathname === "/api/activities") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    let input;
    try { input = activityInput(await body(request)); } catch (error) { return fail(error.message); }
    const id = randomBytes(12).toString("hex");
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO activities (id, date_label, title, meta, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.date, input.title, input.meta, input.description, user.id, now, now).run();
    return json({ activity: { id, ...input, createdAt: now, updatedAt: now } }, 201);
  }

  const activityDelete = url.pathname.match(/^\/api\/activities\/([^/]+)$/);
  if (request.method === "DELETE" && activityDelete) {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const result = await env.DB.prepare("DELETE FROM activities WHERE id = ?").bind(decodeURIComponent(activityDelete[1])).run();
    return Number(result?.meta?.changes || 0) ? json({ ok: true }) : fail("Activity not found.", 404);
  }

  if (request.method === "POST" && url.pathname === "/api/announcements") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    let input;
    try { input = announcementInput(await body(request)); } catch (error) { return fail(error.message); }
    const id = randomBytes(12).toString("hex");
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO announcements (id, title, body, category, is_pinned, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.title, input.body, input.category, input.isPinned ? 1 : 0, user.id, now, now).run();
    return json({ announcement: { id, ...input, authorName: user.name, createdAt: now, updatedAt: now } }, 201);
  }

  const announcementDelete = url.pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (request.method === "PATCH" && announcementDelete) {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    let input;
    try { input = announcementInput(await body(request)); } catch (error) { return fail(error.message); }
    const announcementId = decodeURIComponent(announcementDelete[1]);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE announcements SET title = ?, body = ?, category = ?, is_pinned = ?, updated_at = ? WHERE id = ?").bind(input.title, input.body, input.category, input.isPinned ? 1 : 0, now, announcementId).run();
    if (!Number(result?.meta?.changes || 0)) return fail("Announcement not found.", 404);
    const saved = await env.DB.prepare("SELECT a.id, a.title, a.body, a.category, a.is_pinned, a.created_at, a.updated_at, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.created_by WHERE a.id = ?").bind(announcementId).first();
    return json({ announcement: { id: saved.id, title: saved.title, body: saved.body, category: saved.category, isPinned: Boolean(saved.is_pinned), createdAt: saved.created_at, updatedAt: saved.updated_at, authorName: saved.author_name } });
  }
  if (request.method === "DELETE" && announcementDelete) {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const result = await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(decodeURIComponent(announcementDelete[1])).run();
    return Number(result?.meta?.changes || 0) ? json({ ok: true }) : fail("Announcement not found.", 404);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const users = await allRows(env.DB.prepare("SELECT id, name, email, is_admin FROM users WHERE is_admin = 1 ORDER BY name, email"));
    return json({ users: users.map((item) => ({ id: item.id, name: item.name, email: item.email, isAdmin: true, isOwner: item.email.toLowerCase() === DEFAULT_ADMIN_EMAIL })) });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const email = String((await body(request)).email || "").trim().toLowerCase();
    const target = await env.DB.prepare("SELECT id, name, email FROM users WHERE email = ? LIMIT 1").bind(email).first();
    if (!target) return fail("No registered account uses that email.", 404);
    await env.DB.prepare("UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), target.id).run();
    return json({ user: { ...target, isAdmin: true } });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/primary-keyword-blocklist") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    return json({ keywords: await primaryKeywordBlocklist(env) });
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/primary-keyword-blocklist") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const input = await body(request);
    return json({ keywords: await savePrimaryKeywordBlocklist(env, input.keywords ?? input.text ?? "") });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/community-blocklist") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    return json({ terms: await communityBlockedTerms(env) });
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/community-blocklist") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const input = await body(request);
    return json({ terms: await saveCommunityBlockedTerms(env, input.terms ?? input.text ?? "") });
  }

  const adminDelete = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "DELETE" && adminDelete) {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const targetId = decodeURIComponent(adminDelete[1]);
    if (targetId === user.id) return fail("You cannot remove your own administrator access.");
    const target = await env.DB.prepare("SELECT email FROM users WHERE id = ? LIMIT 1").bind(targetId).first();
    if (!target) return fail("User not found.", 404);
    const protectedEmails = [DEFAULT_ADMIN_EMAIL, ...String(env.ADMIN_EMAILS || "").split(",")].map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (protectedEmails.includes(target.email.toLowerCase())) return fail("A configured village owner cannot be removed.");
    const adminCount = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").first())?.count || 0);
    if (adminCount <= 1) return fail("The village must keep at least one administrator.");
    await env.DB.prepare("UPDATE users SET is_admin = 0, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), targetId).run();
    return json({ ok: true });
  }
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
      INSERT INTO community_profiles (
        user_id, enabled, display_name, notifications_enabled, discoverable,
        direct_messages_enabled, location_sharing_enabled, moment_theme,
        allow_stranger_requests, allow_stranger_moments, moment_visibility_days,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        enabled = excluded.enabled,
        display_name = excluded.display_name,
        notifications_enabled = excluded.notifications_enabled,
        discoverable = excluded.discoverable,
        direct_messages_enabled = excluded.direct_messages_enabled,
        location_sharing_enabled = excluded.location_sharing_enabled,
        moment_theme = excluded.moment_theme,
        allow_stranger_requests = excluded.allow_stranger_requests,
        allow_stranger_moments = excluded.allow_stranger_moments,
        moment_visibility_days = excluded.moment_visibility_days,
        updated_at = excluded.updated_at
    `).bind(
      user.id,
      enabled ? 1 : 0,
      displayName,
      input.notificationsEnabled === false ? 0 : 1,
      input.discoverable === false ? 0 : 1,
      input.directMessagesEnabled === false ? 0 : 1,
      input.locationSharingEnabled === true ? 1 : 0,
      input.momentTheme === "dark" ? "dark" : "light",
      input.allowStrangerRequests === false ? 0 : 1,
      input.allowStrangerMoments === true ? 1 : 0,
      Math.max(1, Math.min(3650, Number(input.momentVisibilityDays || 30))),
      now,
      now
    ).run();
    return json(await communityOverview(env, user));
  }

  if (request.method === "PUT" && url.pathname === "/api/community/avatar") {
    let avatarDataUrl;
    try { avatarDataUrl = safeImageDataUrl((await body(request)).imageDataUrl); }
    catch (error) { return fail(error.message); }
    await env.DB.prepare("UPDATE users SET avatar_data_url = ?, updated_at = ? WHERE id = ?").bind(avatarDataUrl, new Date().toISOString(), user.id).run();
    user.avatarDataUrl = avatarDataUrl || "";
    return json({ user: safeUser(user), avatarDataUrl: user.avatarDataUrl });
  }

  if (request.method === "PUT" && url.pathname === "/api/community/cover") {
    let coverImageDataUrl;
    try { coverImageDataUrl = safeImageDataUrl((await body(request)).imageDataUrl); }
    catch (error) { return fail(error.message); }
    await env.DB.prepare("UPDATE community_profiles SET cover_image_data_url = ?, updated_at = ? WHERE user_id = ?").bind(coverImageDataUrl, new Date().toISOString(), user.id).run();
    return json({ coverImageDataUrl: coverImageDataUrl || "" });
  }

  if (request.method === "GET" && url.pathname === "/api/community/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
    if (query.length < 2) return json({ people: [] });
    const people = await allRows(env.DB.prepare(`
      SELECT u.id AS user_id, u.email, u.avatar_data_url, COALESCE(cp.display_name, u.name) AS display_name,
        c.id AS connection_id, c.status AS connection_status, c.requester_id
      FROM users u JOIN community_profiles cp ON cp.user_id = u.id AND cp.enabled = 1 AND cp.discoverable = 1
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
    memberIds.forEach((memberId) => ctx.waitUntil(createUserNotification(env, memberId, "group-invite", "Village group invitation", `${profile.display_name} invited you to ${name}`, { roomId, inviterId: user.id }).catch(() => {})));
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
      const targetUserId = String(url.searchParams.get("userId") || "");
      if (targetUserId && targetUserId !== user.id) {
        const targetProfile = await communityProfile(env, targetUserId);
        const friend = await areFriends(env, user.id, targetUserId);
        if (!targetProfile?.enabled || await usersBlocked(env, user.id, targetUserId) || (!friend && !targetProfile.allow_stranger_moments)) return fail("This member's Moments are private.", 403);
      }
      const rows = await allRows(env.DB.prepare(`
        SELECT p.*, u.avatar_data_url, cp.cover_image_data_url, cp.moment_theme,
          cp.moment_visibility_days, COALESCE(cp.display_name, u.name) AS author
        FROM community_posts p JOIN users u ON u.id = p.user_id LEFT JOIN community_profiles cp ON cp.user_id = p.user_id
        WHERE (? = '' OR p.user_id = ?) AND (p.user_id = ? OR (? != '' AND p.user_id = ?) OR (
          EXISTS (SELECT 1 FROM chat_connections c WHERE c.status = 'accepted' AND ((c.requester_id = ? AND c.recipient_id = p.user_id) OR (c.recipient_id = ? AND c.requester_id = p.user_id)))
          AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))
        )) ORDER BY p.created_at DESC LIMIT 100
      `).bind(targetUserId, targetUserId, user.id, targetUserId, targetUserId, user.id, user.id, user.id, user.id));
      const posts = (await Promise.all(rows.filter((row) => {
        const visibilityDays = Math.max(1, Number(row.moment_visibility_days || 30));
        if (row.user_id !== user.id && new Date(row.created_at).getTime() < Date.now() - visibilityDays * 86400000) return false;
        if (row.user_id === user.id) return true;
        const allowed = parseJson(row.allowed_user_ids_json, []);
        const denied = parseJson(row.denied_user_ids_json, []);
        return (!allowed.length || allowed.includes(user.id)) && !denied.includes(user.id);
      }).map(async (row) => {
        const comments = await allRows(env.DB.prepare(`
          SELECT comment.*, account.avatar_data_url, COALESCE(profile.display_name, account.name) AS author
          FROM community_post_comments comment JOIN users account ON account.id = comment.user_id
          LEFT JOIN community_profiles profile ON profile.user_id = comment.user_id
          WHERE comment.post_id = ? ORDER BY comment.created_at LIMIT 200
        `).bind(row.id));
        return {
          id: row.id,
          userId: row.user_id,
          author: row.author,
          avatarDataUrl: row.avatar_data_url || "",
          coverImageDataUrl: row.cover_image_data_url || "",
          momentTheme: row.moment_theme || "light",
          body: row.body,
          imageDataUrl: row.image_data_url,
          comments: comments.map((comment) => ({ id: comment.id, userId: comment.user_id, author: comment.author, avatarDataUrl: comment.avatar_data_url || "", body: comment.body, imageDataUrl: comment.image_data_url, stickerDataUrl: comment.sticker_data_url, mine: comment.user_id === user.id, createdAt: comment.created_at })),
          allowedUserIds: row.user_id === user.id ? parseJson(row.allowed_user_ids_json, []) : undefined,
          deniedUserIds: row.user_id === user.id ? parseJson(row.denied_user_ids_json, []) : undefined,
          createdAt: row.created_at,
          mine: row.user_id === user.id
        };
      })));
      const profileUserId = targetUserId || user.id;
      const profileAccount = await env.DB.prepare(`
        SELECT account.id, account.avatar_data_url, COALESCE(profile.display_name, account.name) AS display_name,
          profile.cover_image_data_url, profile.moment_theme
        FROM users account LEFT JOIN community_profiles profile ON profile.user_id = account.id
        WHERE account.id = ? LIMIT 1
      `).bind(profileUserId).first();
      return json({ posts, profile: profileAccount ? { userId: profileAccount.id, displayName: profileAccount.display_name, avatarDataUrl: profileAccount.avatar_data_url || "", coverImageDataUrl: profileAccount.cover_image_data_url || "", momentTheme: profileAccount.moment_theme || "light", mine: profileAccount.id === user.id } : null });
    }
    if (request.method === "POST") {
      const input = await body(request);
      const postBody = (await maskCommunityMessage(env, String(input.text || "").trim().slice(0, 2000))).trim();
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); } catch (error) { return fail(error.message); }
      if (!postBody && !imageDataUrl) return fail("Add text or an image first.");
      const allowed = [...new Set((Array.isArray(input.allowedUserIds) ? input.allowedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      const denied = [...new Set((Array.isArray(input.deniedUserIds) ? input.deniedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      for (const targetId of [...allowed, ...denied]) if (!await areFriends(env, user.id, targetId) || await usersBlocked(env, user.id, targetId)) return fail("Post visibility can include accepted, unblocked friends only.", 403);
      const post = { id: randomBytes(12).toString("hex"), userId: user.id, body: postBody, imageDataUrl, createdAt: new Date().toISOString() };
      await env.DB.prepare("INSERT INTO community_posts (id, user_id, body, image_data_url, allowed_user_ids_json, denied_user_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(post.id, user.id, post.body, post.imageDataUrl, JSON.stringify(allowed), JSON.stringify(denied), post.createdAt).run();
      ctx.waitUntil(createFriendNotifications(
        env,
        user.id,
        "moment",
        "New Moment",
        `${user.name} shared a new Moment`,
        { postId: post.id, userId: user.id },
        { allowedUserIds: allowed, deniedUserIds: denied }
      ).catch(() => {}));
      return json({ post }, 201);
    }
  }

  const postDeleteMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (request.method === "DELETE" && postDeleteMatch) {
    const result = await env.DB.prepare("DELETE FROM community_posts WHERE id = ? AND user_id = ?").bind(decodeURIComponent(postDeleteMatch[1]), user.id).run();
    if (!Number(result.meta?.changes || 0)) return fail("Post not found.", 404);
    return json({ ok: true });
  }

  const postCommentMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments(?:\/([^/]+))?$/);
  if (postCommentMatch) {
    const postId = decodeURIComponent(postCommentMatch[1]);
    const commentId = postCommentMatch[2] ? decodeURIComponent(postCommentMatch[2]) : "";
    const post = await env.DB.prepare("SELECT * FROM community_posts WHERE id = ? LIMIT 1").bind(postId).first();
    if (!await canViewCommunityPost(env, user.id, post)) return fail("This Moment is unavailable.", 404);

    if (request.method === "POST" && !commentId) {
      const input = await body(request);
      const commentBody = (await maskCommunityMessage(env, String(input.text || "").trim().slice(0, 1000))).trim();
      let imageDataUrl;
      let stickerDataUrl;
      try {
        imageDataUrl = safeImageDataUrl(input.imageDataUrl);
        stickerDataUrl = safeImageDataUrl(input.stickerDataUrl);
      } catch (error) { return fail(error.message); }
      if (!commentBody && !imageDataUrl && !stickerDataUrl) return fail("Write a comment or add an image.");
      const comment = {
        id: randomBytes(12).toString("hex"),
        postId,
        userId: user.id,
        author: (await communityProfile(env, user.id))?.display_name || user.name,
        avatarDataUrl: user.avatarDataUrl || "",
        body: commentBody,
        imageDataUrl,
        stickerDataUrl,
        createdAt: new Date().toISOString(),
        mine: true
      };
      await env.DB.prepare(`
        INSERT INTO community_post_comments (id, post_id, user_id, body, image_data_url, sticker_data_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(comment.id, postId, user.id, comment.body, imageDataUrl, stickerDataUrl, comment.createdAt).run();
      if (post.user_id !== user.id) {
        ctx.waitUntil(createUserNotification(env, post.user_id, "moment-comment", "New Moment comment", `${comment.author} commented on your Moment`, { postId, commentId: comment.id, userId: user.id }).catch(() => {}));
      }
      return json({ comment }, 201);
    }

    if (request.method === "DELETE" && commentId) {
      const comment = await env.DB.prepare("SELECT * FROM community_post_comments WHERE id = ? AND post_id = ? LIMIT 1").bind(commentId, postId).first();
      if (!comment || (comment.user_id !== user.id && post.user_id !== user.id)) return fail("Comment not found.", 404);
      await env.DB.prepare("DELETE FROM community_post_comments WHERE id = ?").bind(commentId).run();
      return json({ ok: true });
    }
  }

  if (url.pathname === "/api/community/stickers") {
    if (request.method === "GET") {
      const rows = await allRows(env.DB.prepare("SELECT * FROM community_stickers WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id));
      return json({ stickers: rows.map((row) => ({ id: row.id, name: row.name, imageDataUrl: row.image_data_url, createdAt: row.created_at })) });
    }
    if (request.method === "POST") {
      const input = await body(request);
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); }
      catch (error) { return fail(error.message); }
      if (!imageDataUrl) return fail("Choose an image for this sticker.");
      const name = String(input.name || "Custom sticker").trim().replace(/[<>\r\n]/g, " ").slice(0, 60) || "Custom sticker";
      const existing = await env.DB.prepare("SELECT * FROM community_stickers WHERE owner_id = ? AND image_data_url = ? LIMIT 1").bind(user.id, imageDataUrl).first();
      if (existing) return json({ sticker: { id: existing.id, name: existing.name, imageDataUrl: existing.image_data_url, createdAt: existing.created_at }, saved: false });
      const sticker = { id: randomBytes(12).toString("hex"), name, imageDataUrl, createdAt: new Date().toISOString() };
      await env.DB.prepare("INSERT INTO community_stickers (id, owner_id, name, image_data_url, created_at) VALUES (?, ?, ?, ?, ?)").bind(sticker.id, user.id, sticker.name, sticker.imageDataUrl, sticker.createdAt).run();
      return json({ sticker, saved: true }, 201);
    }
  }

  const stickerDeleteMatch = url.pathname.match(/^\/api\/community\/stickers\/([^/]+)$/);
  if (request.method === "DELETE" && stickerDeleteMatch) {
    const result = await env.DB.prepare("DELETE FROM community_stickers WHERE id = ? AND owner_id = ?").bind(decodeURIComponent(stickerDeleteMatch[1]), user.id).run();
    if (!Number(result.meta?.changes || 0)) return fail("Sticker not found.", 404);
    return json({ ok: true });
  }

  const communityProfileMatch = url.pathname.match(/^\/api\/community\/profiles\/([^/]+)$/);
  if (request.method === "GET" && communityProfileMatch) {
    const targetUserId = decodeURIComponent(communityProfileMatch[1]);
    const profile = await env.DB.prepare(`
      SELECT account.id, account.avatar_data_url, COALESCE(profile.display_name, account.name) AS display_name,
        profile.enabled, profile.cover_image_data_url, profile.moment_theme, profile.allow_stranger_moments,
        profile.moment_visibility_days
      FROM users account JOIN community_profiles profile ON profile.user_id = account.id
      WHERE account.id = ? LIMIT 1
    `).bind(targetUserId).first();
    if (!profile?.enabled || await usersBlocked(env, user.id, targetUserId)) return fail("Community member not found.", 404);
    const friend = targetUserId === user.id || await areFriends(env, user.id, targetUserId);
    if (!friend && !profile.allow_stranger_moments) return fail("This member's Moments are private.", 403);
    return json({
      profile: {
        userId: profile.id,
        displayName: profile.display_name,
        avatarDataUrl: profile.avatar_data_url || "",
        coverImageDataUrl: profile.cover_image_data_url || "",
        momentTheme: profile.moment_theme || "light",
        momentVisibilityDays: Number(profile.moment_visibility_days || 30),
        friend,
        mine: targetUserId === user.id
      }
    });
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

  if (url.pathname === "/api/community/meetings") {
    if (request.method === "GET") {
      const roomId = String(url.searchParams.get("roomId") || "");
      const room = await roomForMember(env, roomId, user.id);
      if (!room) return fail("Choose a chat you belong to.", 403);
      const rows = await allRows(env.DB.prepare("SELECT * FROM community_meetings WHERE room_id = ? ORDER BY starts_at DESC LIMIT 50").bind(roomId));
      return json({ meetings: rows.map((row) => ({ id: row.id, roomId: row.room_id, hostId: row.host_id, title: row.title, startsAt: row.starts_at, durationMinutes: row.duration_minutes, status: row.status, settings: parseJson(row.settings_json, {}), createdAt: row.created_at })) });
    }
    if (request.method === "POST") {
      const input = await body(request);
      const roomId = String(input.roomId || "");
      const room = await roomForMember(env, roomId, user.id);
      if (!room) return fail("Choose a chat you belong to.", 403);
      const title = String(input.title || "Village meeting").trim().slice(0, 120) || "Village meeting";
      const startsAt = new Date(input.startsAt || Date.now());
      if (!Number.isFinite(startsAt.getTime())) return fail("Choose a valid meeting date and time.");
      const durationMinutes = Math.max(10, Math.min(480, Number(input.durationMinutes || 45)));
      const settings = meetingSettings(input.settings || {});
      const at = new Date().toISOString();
      const meeting = { id: randomBytes(12).toString("hex"), roomId, hostId: user.id, title, startsAt: startsAt.toISOString(), durationMinutes, status: "scheduled", settings, createdAt: at };
      const messageId = randomBytes(12).toString("hex");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO community_meetings (id, room_id, host_id, title, starts_at, duration_minutes, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(meeting.id, roomId, user.id, title, meeting.startsAt, durationMinutes, JSON.stringify(settings), at, at),
        env.DB.prepare("INSERT INTO chat_messages (id, room_id, user_id, body, message_type, metadata_json, created_at) VALUES (?, ?, ?, ?, 'meeting', ?, ?)").bind(messageId, roomId, user.id, `Meeting: ${title}`, JSON.stringify({ meetingId: meeting.id, title, startsAt: meeting.startsAt, durationMinutes }), at)
      ]);
      ctx.waitUntil(createCommunityNotifications(env, roomId, user.id, "meeting", title, `${user.name} scheduled a village meeting`, { roomId, meetingId: meeting.id, startsAt: meeting.startsAt }).catch(() => {}));
      return json({ meeting, messageId }, 201);
    }
  }

  const meetingMatch = url.pathname.match(/^\/api\/community\/meetings\/([^/]+)(?:\/(join|signals|state|whiteboard|polls|messages|end))?$/);
  if (meetingMatch) {
    const meetingId = decodeURIComponent(meetingMatch[1]);
    const operation = meetingMatch[2] || "";
    const meeting = await env.DB.prepare(`
      SELECT meeting.* FROM community_meetings meeting
      JOIN chat_members member ON member.room_id = meeting.room_id
      WHERE meeting.id = ? AND member.user_id = ? LIMIT 1
    `).bind(meetingId, user.id).first();
    if (!meeting) return fail("Meeting not found.", 404);

    if (!operation && request.method === "GET") {
      const participants = await allRows(env.DB.prepare(`
        SELECT participant.*, account.avatar_data_url, COALESCE(profile.display_name, account.name) AS display_name
        FROM meeting_participants participant JOIN users account ON account.id = participant.user_id
        LEFT JOIN community_profiles profile ON profile.user_id = participant.user_id
        WHERE participant.meeting_id = ? AND participant.left_at IS NULL
        ORDER BY participant.role = 'host' DESC, participant.joined_at
      `).bind(meetingId));
      const polls = await allRows(env.DB.prepare("SELECT * FROM meeting_polls WHERE meeting_id = ? ORDER BY created_at DESC").bind(meetingId));
      const actor = participants.find((participant) => participant.user_id === user.id);
      return json({
        meeting: { id: meeting.id, roomId: meeting.room_id, hostId: meeting.host_id, title: meeting.title, startsAt: meeting.starts_at, durationMinutes: meeting.duration_minutes, status: meeting.status, settings: meetingSettings(parseJson(meeting.settings_json, {})) },
        participants: participants.map((participant) => ({ userId: participant.user_id, displayName: participant.display_name, avatarDataUrl: participant.avatar_data_url || "", role: participant.role, raisedHand: Boolean(participant.raised_hand), breakoutRoom: participant.breakout_room || "", mine: participant.user_id === user.id })),
        polls: await Promise.all(polls.map(async (poll) => {
          let status = poll.status || (poll.closed_at ? "closed" : "active");
          let closedAt = poll.closed_at || null;
          if (status === "active" && poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now()) {
            status = "closed";
            closedAt ||= new Date().toISOString();
            await env.DB.prepare("UPDATE meeting_polls SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'active'").bind(closedAt, poll.id).run();
          }
          const ballotRows = await allRows(env.DB.prepare(`
            SELECT vote.*, COALESCE(profile.display_name, account.name) AS display_name
            FROM meeting_poll_votes vote
            JOIN users account ON account.id = vote.user_id
            LEFT JOIN community_profiles profile ON profile.user_id = vote.user_id
            WHERE vote.poll_id = ?
          `).bind(poll.id));
          const votes = {};
          const ballots = ballotRows.map((vote) => {
            const indexes = parseJson(vote.option_indexes_json, [Number(vote.option_index)]);
            indexes.forEach((index) => { votes[index] = Number(votes[index] || 0) + 1; });
            return { userId: vote.user_id, displayName: vote.display_name, optionIndexes: indexes };
          });
          const settings = parseJson(poll.settings_json, {});
          const anonymous = Boolean(settings.anonymous);
          const canSeeVoters = !anonymous && (meeting.host_id === user.id || actor?.role === "cohost");
          return {
            id: poll.id,
            creatorId: poll.creator_id,
            question: poll.question,
            options: parseJson(poll.options_json, []),
            status,
            closed: status === "closed",
            multiple: Boolean(settings.multiple),
            anonymous,
            showLiveResults: settings.showLiveResults !== false,
            durationSeconds: Number(settings.durationSeconds || 0),
            startedAt: poll.started_at || null,
            endsAt: poll.ends_at || null,
            closedAt,
            votes,
            totalVoters: ballots.length,
            participantCount: participants.length,
            mySelections: ballots.find((vote) => vote.userId === user.id)?.optionIndexes || [],
            voters: canSeeVoters ? ballots : [],
            createdAt: poll.created_at
          };
        }))
      });
    }
    if (operation === "join" && request.method === "POST") {
      if (["ended", "cancelled"].includes(meeting.status)) return fail("This meeting has ended.");
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO meeting_participants (meeting_id, user_id, role, joined_at, last_seen_at, left_at)
          VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT(meeting_id, user_id) DO UPDATE
          SET last_seen_at = excluded.last_seen_at, left_at = NULL
        `).bind(meetingId, user.id, meeting.host_id === user.id ? "host" : "participant", at, at),
        env.DB.prepare("UPDATE community_meetings SET status = 'live', updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(at, meetingId)
      ]);
      const participants = await allRows(env.DB.prepare("SELECT user_id FROM meeting_participants WHERE meeting_id = ? AND user_id != ? AND left_at IS NULL").bind(meetingId, user.id));
      return json({ ok: true, participantIds: participants.map((participant) => participant.user_id) });
    }
    if (operation === "join" && request.method === "DELETE") {
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE meeting_participants SET left_at = ?, raised_hand = 0, last_seen_at = ? WHERE meeting_id = ? AND user_id = ?").bind(at, at, meetingId, user.id),
        env.DB.prepare("INSERT INTO meeting_signals (id, meeting_id, sender_id, kind, payload_json, created_at) VALUES (?, ?, ?, 'leave', '{}', ?)").bind(randomBytes(12).toString("hex"), meetingId, user.id, at)
      ]);
      return json({ ok: true });
    }
    if (operation === "signals" && request.method === "GET") {
      const after = String(url.searchParams.get("after") || "");
      const rows = await allRows(env.DB.prepare(`
        SELECT * FROM meeting_signals
        WHERE meeting_id = ? AND sender_id != ? AND (recipient_id IS NULL OR recipient_id = ?) AND created_at > ?
        ORDER BY created_at LIMIT 200
      `).bind(meetingId, user.id, user.id, after));
      return json({ signals: rows.map((row) => ({ id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, kind: row.kind, payload: parseJson(row.payload_json, {}), createdAt: row.created_at })) });
    }
    if (operation === "signals" && request.method === "POST") {
      const input = await body(request);
      const kind = String(input.kind || "");
      if (!["offer", "answer", "candidate", "leave", "state"].includes(kind)) return fail("Unsupported meeting signal.");
      const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
      if (JSON.stringify(payload).length > 30000) return fail("Meeting signal is too large.");
      const recipientId = String(input.recipientId || "") || null;
      const at = new Date().toISOString();
      await env.DB.prepare("INSERT INTO meeting_signals (id, meeting_id, sender_id, recipient_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(randomBytes(12).toString("hex"), meetingId, user.id, recipientId, kind, JSON.stringify(payload), at).run();
      ctx.waitUntil(env.DB.prepare("DELETE FROM meeting_signals WHERE meeting_id = ? AND created_at < ?").bind(meetingId, new Date(Date.now() - 10 * 60_000).toISOString()).run());
      return json({ ok: true, createdAt: at }, 201);
    }
    if (operation === "state" && request.method === "PATCH") {
      const input = await body(request);
      const actor = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(meetingId, user.id).first();
      const canHost = meeting.host_id === user.id || actor?.role === "cohost";
      let currentSettings = meetingSettings(parseJson(meeting.settings_json, {}));
      if (input.settings && canHost) {
        currentSettings = meetingSettings({ ...currentSettings, ...input.settings });
        await env.DB.prepare("UPDATE community_meetings SET settings_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(currentSettings), new Date().toISOString(), meetingId).run();
      }
      const targetId = meeting.host_id === user.id && input.userId ? String(input.userId) : user.id;
      if (input.remove === true && meeting.host_id === user.id && targetId !== user.id) {
        const at = new Date().toISOString();
        await env.DB.prepare("UPDATE meeting_participants SET left_at = ?, raised_hand = 0, last_seen_at = ? WHERE meeting_id = ? AND user_id = ?").bind(at, at, meetingId, targetId).run();
        return json({ ok: true, removed: targetId });
      }
      const existing = await env.DB.prepare("SELECT * FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(meetingId, targetId).first();
      if (!existing) return fail("Participant is not in this meeting.", 404);
      const role = meeting.host_id === user.id && ["cohost", "participant"].includes(input.role) ? input.role : existing.role;
      const breakoutRoom = meeting.host_id === user.id && Object.prototype.hasOwnProperty.call(input, "breakoutRoom") ? String(input.breakoutRoom || "").slice(0, 80) || null : existing.breakout_room;
      const raisedHand = Object.prototype.hasOwnProperty.call(input, "raisedHand") ? Boolean(input.raisedHand) : Boolean(existing.raised_hand);
      await env.DB.prepare("UPDATE meeting_participants SET role = ?, breakout_room = ?, raised_hand = ?, last_seen_at = ? WHERE meeting_id = ? AND user_id = ?").bind(role, breakoutRoom, raisedHand ? 1 : 0, new Date().toISOString(), meetingId, targetId).run();
      return json({ ok: true, meeting: { id: meetingId, settings: currentSettings }, participant: { userId: targetId, role, breakoutRoom: breakoutRoom || "", raisedHand } });
    }
    if (operation === "whiteboard" && request.method === "GET") {
      const after = Math.max(0, Number(url.searchParams.get("after") || 0));
      const rows = await allRows(env.DB.prepare("SELECT * FROM meeting_whiteboard_events WHERE meeting_id = ? AND id > ? ORDER BY id LIMIT 1000").bind(meetingId, after));
      return json({ events: rows.map((row) => ({ id: row.id, userId: row.user_id, event: parseJson(row.event_json, {}), createdAt: row.created_at })) });
    }
    if (operation === "whiteboard" && request.method === "POST") {
      const event = (await body(request)).event;
      const encoded = JSON.stringify(event && typeof event === "object" ? event : {});
      if (encoded.length > 900000) return fail("Whiteboard event is too large.");
      const participant = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(meetingId, user.id).first();
      const permission = meetingSettings(parseJson(meeting.settings_json, {})).whiteboardPermission;
      const canManage = meeting.host_id === user.id || participant?.role === "cohost";
      const eventType = String(event?.type || "");
      if (!canManage && permission === "view" && eventType !== "cursor") return fail("The whiteboard is view-only.", 403);
      if (!canManage && permission === "comment" && !["cursor", "comment", "reaction", "stamp"].includes(eventType)) return fail("The whiteboard is limited to comments.", 403);
      const result = await env.DB.prepare("INSERT INTO meeting_whiteboard_events (meeting_id, user_id, event_json, created_at) VALUES (?, ?, ?, ?)").bind(meetingId, user.id, encoded, new Date().toISOString()).run();
      return json({ ok: true, id: Number(result.meta?.last_row_id || 0) }, 201);
    }
    if (operation === "messages" && request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT message.*, account.avatar_data_url,
          COALESCE(profile.display_name, account.name) AS author
        FROM meeting_chat_messages message
        JOIN users account ON account.id = message.sender_id
        LEFT JOIN community_profiles profile ON profile.user_id = message.sender_id
        WHERE message.meeting_id = ?
        ORDER BY message.created_at DESC LIMIT 250
      `).bind(meetingId));
      const ordered = rows.reverse();
      const visible = ordered.filter((message) => {
        if (message.audience === "everyone" || message.sender_id === user.id) return true;
        return parseJson(message.recipient_ids_json, []).includes(user.id);
      });
      const reactions = visible.length ? await allRows(env.DB.prepare(`
        SELECT reaction.* FROM meeting_chat_reactions reaction
        JOIN meeting_chat_messages message ON message.id = reaction.message_id
        WHERE message.meeting_id = ? ORDER BY reaction.created_at
      `).bind(meetingId)) : [];
      const byId = new Map(ordered.map((message) => [message.id, message]));
      return json({
        meetingId,
        messages: visible.map((message) => {
          const grouped = {};
          reactions.filter((reaction) => reaction.message_id === message.id).forEach((reaction) => {
            grouped[reaction.emoji] ||= { count: 0, mine: false };
            grouped[reaction.emoji].count += 1;
            if (reaction.user_id === user.id) grouped[reaction.emoji].mine = true;
          });
          const reply = message.reply_to_id ? byId.get(message.reply_to_id) : null;
          return {
            id: message.id,
            meetingId,
            senderId: message.sender_id,
            author: message.author,
            avatarDataUrl: message.avatar_data_url || "",
            audience: message.audience,
            recipientIds: parseJson(message.recipient_ids_json, []),
            body: message.deleted_at ? "" : message.body,
            format: parseJson(message.format_json, {}),
            attachment: message.deleted_at || !message.attachment_data_url ? null : { name: message.attachment_name, mime: message.attachment_mime, dataUrl: message.attachment_data_url },
            metadata: message.deleted_at ? {} : parseJson(message.metadata_json, {}),
            replyToId: message.reply_to_id || null,
            replyTo: reply ? { id: reply.id, author: reply.author || "Village member", body: reply.deleted_at ? "Message deleted" : reply.body } : null,
            deletedAt: message.deleted_at || null,
            createdAt: message.created_at,
            mine: message.sender_id === user.id,
            reactions: grouped
          };
        })
      });
    }
    if (operation === "messages" && request.method === "POST") {
      const input = await body(request);
      const participant = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(meetingId, user.id).first();
      const canHost = meeting.host_id === user.id || participant?.role === "cohost";
      const settings = meetingSettings(parseJson(meeting.settings_json, {}));
      if (!canHost && settings.chatPolicy === "disabled") return fail("The host turned meeting chat off.", 403);
      const audience = ["everyone", "private", "group"].includes(input.audience) ? input.audience : "everyone";
      const requestedRecipients = Array.isArray(input.recipientIds) ? input.recipientIds.map(String) : [];
      if (!canHost && settings.chatPolicy === "host-only" && !(audience === "private" && requestedRecipients.includes(meeting.host_id))) return fail("Participants can only message the host.", 403);
      if (!canHost && !settings.privateChat && audience !== "everyone") return fail("Private meeting chat is off.", 403);
      const activeRows = await allRows(env.DB.prepare("SELECT user_id FROM meeting_participants WHERE meeting_id = ? AND left_at IS NULL").bind(meetingId));
      const activeIds = new Set(activeRows.map((row) => row.user_id));
      activeIds.add(meeting.host_id);
      const recipientIds = [...new Set(requestedRecipients.filter((id) => id !== user.id && activeIds.has(id)))].slice(0, 20);
      if (audience === "private" && recipientIds.length !== 1) return fail("Choose one person for a private message.");
      if (audience === "group" && recipientIds.length < 1) return fail("Choose at least one person for this group chat.");
      let attachment;
      try { attachment = safeAttachment(input.attachment); } catch (error) { return fail(error.message); }
      let metadata;
      try { metadata = safeMeetingMetadata(input.metadata || {}); } catch (error) { return fail(error.message); }
      const rawBody = String(input.message || "").trim().slice(0, 4000);
      const messageBody = rawBody ? (await maskCommunityMessage(env, rawBody)).trim() : "";
      if (!messageBody && !attachment && !metadata.cloudUrl) return fail("Write a message or attach something first.");
      const replyToId = String(input.replyToId || "") || null;
      const reply = replyToId ? await env.DB.prepare("SELECT id FROM meeting_chat_messages WHERE id = ? AND meeting_id = ? LIMIT 1").bind(replyToId, meetingId).first() : null;
      const id = randomBytes(12).toString("hex");
      const createdAt = new Date().toISOString();
      const format = safeMeetingFormat(input.format || {});
      await env.DB.prepare(`
        INSERT INTO meeting_chat_messages (
          id, meeting_id, sender_id, audience, recipient_ids_json, body, format_json,
          attachment_name, attachment_mime, attachment_data_url, metadata_json,
          reply_to_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, meetingId, user.id, audience, JSON.stringify(recipientIds), messageBody, JSON.stringify(format),
        attachment?.name || null, attachment?.mime || null, attachment?.dataUrl || null,
        JSON.stringify(metadata), reply?.id || null, createdAt
      ).run();
      return json({
        message: {
          id,
          meetingId,
          senderId: user.id,
          author: user.name,
          avatarDataUrl: user.avatarDataUrl || "",
          audience,
          recipientIds,
          body: messageBody,
          format,
          attachment,
          metadata,
          replyToId: reply?.id || null,
          deletedAt: null,
          createdAt,
          mine: true,
          reactions: {}
        }
      }, 201);
    }
    if (operation === "polls" && request.method === "POST") {
      const input = await body(request);
      const participant = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(meetingId, user.id).first();
      const canCreate = meeting.host_id === user.id || participant?.role === "cohost" || meetingSettings(parseJson(meeting.settings_json, {})).allowMemberPolls;
      if (!canCreate) return fail("Only the host or co-host can create a poll.", 403);
      const question = String(input.question || "").trim().slice(0, 240);
      const options = [...new Set((Array.isArray(input.options) ? input.options : []).map((option) => String(option || "").trim().slice(0, 120)).filter(Boolean))].slice(0, 8);
      if (!question || options.length < 2) return fail("Add a poll question and at least two choices.");
      const pollId = randomBytes(12).toString("hex");
      const settings = {
        multiple: Boolean(input.multiple),
        anonymous: Boolean(input.anonymous),
        showLiveResults: input.showLiveResults !== false,
        durationSeconds: Math.max(0, Math.min(600, Number(input.durationSeconds || 0)))
      };
      const createdAt = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO meeting_polls (
          id, meeting_id, creator_id, question, options_json, status,
          settings_json, started_at, ends_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?)
      `).bind(pollId, meetingId, user.id, question, JSON.stringify(options), JSON.stringify(settings), createdAt).run();
      return json({ poll: { id: pollId, creatorId: user.id, question, options, status: "draft", ...settings, votes: {}, totalVoters: 0, mySelections: [], createdAt } }, 201);
    }
    if (operation === "end" && request.method === "POST") {
      if (meeting.host_id !== user.id) return fail("Only the host can end this meeting.", 403);
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE community_meetings SET status = 'ended', updated_at = ? WHERE id = ?").bind(at, meetingId),
        env.DB.prepare("UPDATE meeting_participants SET left_at = ?, raised_hand = 0, last_seen_at = ? WHERE meeting_id = ? AND left_at IS NULL").bind(at, at, meetingId)
      ]);
      return json({ ok: true, status: "ended" });
    }
  }

  const meetingMessageMatch = url.pathname.match(/^\/api\/community\/meeting-messages\/([^/]+)(?:\/(reactions))?$/);
  if (meetingMessageMatch) {
    const messageId = decodeURIComponent(meetingMessageMatch[1]);
    const message = await env.DB.prepare(`
      SELECT message.*, meeting.host_id, meeting.room_id
      FROM meeting_chat_messages message
      JOIN community_meetings meeting ON meeting.id = message.meeting_id
      JOIN chat_members member ON member.room_id = meeting.room_id
      WHERE message.id = ? AND member.user_id = ? LIMIT 1
    `).bind(messageId, user.id).first();
    if (!message) return fail("Meeting message not found.", 404);
    const visible = message.audience === "everyone" || message.sender_id === user.id || parseJson(message.recipient_ids_json, []).includes(user.id);
    if (!visible) return fail("Meeting message not found.", 404);
    if (!meetingMessageMatch[2] && request.method === "DELETE") {
      const participant = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? LIMIT 1").bind(message.meeting_id, user.id).first();
      if (message.sender_id !== user.id && message.host_id !== user.id && participant?.role !== "cohost") return fail("You can only delete your own meeting messages.", 403);
      const deletedAt = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE meeting_chat_messages
        SET body = '', attachment_name = NULL, attachment_mime = NULL,
          attachment_data_url = NULL, metadata_json = '{}', deleted_at = ?
        WHERE id = ?
      `).bind(deletedAt, messageId).run();
      return json({ ok: true, deletedAt });
    }
    if (meetingMessageMatch[2] === "reactions" && request.method === "POST") {
      const emoji = String((await body(request)).emoji || "").trim().slice(0, 12);
      if (!emoji || !/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+$/u.test(emoji)) return fail("Choose an emoji reaction.");
      const existing = await env.DB.prepare("SELECT 1 AS found FROM meeting_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1").bind(messageId, user.id, emoji).first();
      if (existing) await env.DB.prepare("DELETE FROM meeting_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?").bind(messageId, user.id, emoji).run();
      else await env.DB.prepare("INSERT INTO meeting_chat_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)").bind(messageId, user.id, emoji, new Date().toISOString()).run();
      return json({ ok: true, active: !existing });
    }
  }

  const pollActionMatch = url.pathname.match(/^\/api\/community\/polls\/([^/]+)\/(vote|start|end)$/);
  if (request.method === "POST" && pollActionMatch) {
    const pollId = decodeURIComponent(pollActionMatch[1]);
    const poll = await env.DB.prepare(`
      SELECT poll.*, meeting.host_id FROM meeting_polls poll
      JOIN community_meetings meeting ON meeting.id = poll.meeting_id
      JOIN chat_members member ON member.room_id = meeting.room_id
      WHERE poll.id = ? AND member.user_id = ? LIMIT 1
    `).bind(pollId, user.id).first();
    if (!poll) return fail("This poll is unavailable.", 404);
    const participant = await env.DB.prepare("SELECT role FROM meeting_participants WHERE meeting_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1").bind(poll.meeting_id, user.id).first();
    const canManage = poll.host_id === user.id || participant?.role === "cohost";
    const action = pollActionMatch[2];
    if (["start", "end"].includes(action)) {
      if (!canManage) return fail("Only the host or co-host can manage this poll.", 403);
      const at = new Date().toISOString();
      if (action === "start") {
        const durationSeconds = Number(parseJson(poll.settings_json, {}).durationSeconds || 0);
        const endsAt = durationSeconds ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null;
        await env.DB.prepare("UPDATE meeting_polls SET status = 'active', started_at = ?, ends_at = ?, closed_at = NULL WHERE id = ?").bind(at, endsAt, pollId).run();
        return json({ ok: true, status: "active", startedAt: at, endsAt, closedAt: null });
      }
      await env.DB.prepare("UPDATE meeting_polls SET status = 'closed', closed_at = ? WHERE id = ?").bind(at, pollId).run();
      return json({ ok: true, status: "closed", startedAt: poll.started_at || null, endsAt: poll.ends_at || null, closedAt: at });
    }
    if ((poll.status || "active") !== "active" || poll.closed_at || (poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now())) return fail("This poll is unavailable.", 404);
    const input = await body(request);
    const options = parseJson(poll.options_json, []);
    const settings = parseJson(poll.settings_json, {});
    const requested = Array.isArray(input.optionIndexes) ? input.optionIndexes : [input.optionIndex];
    const optionIndexes = [...new Set(requested.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < options.length))];
    if (!optionIndexes.length || (!settings.multiple && optionIndexes.length !== 1)) return fail(settings.multiple ? "Choose one or more poll options." : "Choose one poll option.");
    await env.DB.prepare(`
      INSERT INTO meeting_poll_votes (poll_id, user_id, option_index, option_indexes_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(poll_id, user_id) DO UPDATE SET
        option_index = excluded.option_index,
        option_indexes_json = excluded.option_indexes_json,
        created_at = excluded.created_at
    `).bind(pollId, user.id, optionIndexes[0], JSON.stringify(optionIndexes), new Date().toISOString()).run();
    return json({ ok: true, optionIndex: optionIndexes[0], optionIndexes });
  }

  if (url.pathname === "/api/community/document-folders") {
    if (request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT folder.*, COUNT(document.id) AS document_count
        FROM community_document_folders folder
        LEFT JOIN community_documents document
          ON document.folder_id = folder.id AND document.owner_id = folder.owner_id AND document.trashed_at IS NULL
        WHERE folder.owner_id = ?
        GROUP BY folder.id ORDER BY folder.name COLLATE NOCASE
      `).bind(user.id));
      return json({ folders: rows.map((row) => ({ id: row.id, parentId: row.parent_id || "", name: row.name, documentCount: Number(row.document_count || 0), createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (request.method === "POST") {
      const input = await body(request);
      const name = String(input.name || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 80);
      const parentId = String(input.parentId || "").trim() || null;
      if (!name) return fail("Add a folder name.");
      if (parentId && !await env.DB.prepare("SELECT id FROM community_document_folders WHERE id = ? AND owner_id = ? LIMIT 1").bind(parentId, user.id).first()) return fail("Parent folder not found.", 404);
      const at = new Date().toISOString();
      const folder = { id: randomBytes(12).toString("hex"), parentId: parentId || "", name, documentCount: 0, createdAt: at, updatedAt: at };
      try {
        await env.DB.prepare("INSERT INTO community_document_folders (id, owner_id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(folder.id, user.id, parentId, name, at, at).run();
      } catch { return fail("A folder with that name already exists here.", 409); }
      return json({ folder }, 201);
    }
  }

  const documentFolderMatch = url.pathname.match(/^\/api\/community\/document-folders\/([^/]+)$/);
  if (documentFolderMatch) {
    const folderId = decodeURIComponent(documentFolderMatch[1]);
    const folder = await env.DB.prepare("SELECT * FROM community_document_folders WHERE id = ? AND owner_id = ? LIMIT 1").bind(folderId, user.id).first();
    if (!folder) return fail("Folder not found.", 404);
    if (request.method === "PATCH") {
      const input = await body(request);
      const name = String(input.name || folder.name).trim().replace(/[<>\r\n]/g, " ").slice(0, 80);
      const parentId = input.parentId === undefined ? folder.parent_id : String(input.parentId || "").trim() || null;
      if (!name || parentId === folderId) return fail("Choose a valid folder name and location.");
      const at = new Date().toISOString();
      try {
        await env.DB.prepare("UPDATE community_document_folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
          .bind(name, parentId, at, folderId, user.id).run();
      } catch { return fail("That folder name is already in use.", 409); }
      return json({ folder: { id: folderId, parentId: parentId || "", name, updatedAt: at } });
    }
    if (request.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("UPDATE community_documents SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?").bind(folderId, user.id),
        env.DB.prepare("UPDATE community_document_folders SET parent_id = NULL WHERE parent_id = ? AND owner_id = ?").bind(folderId, user.id),
        env.DB.prepare("DELETE FROM community_document_folders WHERE id = ? AND owner_id = ?").bind(folderId, user.id)
      ]);
      return json({ ok: true });
    }
  }

  if (url.pathname === "/api/community/documents") {
    if (request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT DISTINCT document.*, owner.name AS owner_name,
          collaborator.permission AS collaborator_permission,
          collaborator.expires_at AS collaborator_expires_at,
          CASE WHEN member.user_id IS NOT NULL THEN 1 ELSE 0 END AS room_shared
        FROM community_documents document
        JOIN users owner ON owner.id = document.owner_id
        LEFT JOIN community_document_collaborators collaborator
          ON collaborator.document_id = document.id AND collaborator.user_id = ?
        LEFT JOIN community_document_shares share ON share.document_id = document.id
        LEFT JOIN chat_members member ON member.room_id = share.room_id
        WHERE document.owner_id = ? OR collaborator.user_id = ? OR member.user_id = ?
        ORDER BY document.updated_at DESC LIMIT 300
      `).bind(user.id, user.id, user.id, user.id));
      const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
      const folderId = String(url.searchParams.get("folderId") || "");
      const view = String(url.searchParams.get("view") || "active");
      const documents = rows
        .filter((row) => (view === "trash" ? Boolean(row.trashed_at) : !row.trashed_at))
        .filter((row) => view !== "favorites" || Boolean(row.favorite))
        .filter((row) => !folderId || row.folder_id === folderId)
        .filter((row) => !search || `${row.title} ${parseJson(row.content_json, {}).plainText || ""}`.toLowerCase().includes(search))
        .map((row) => mapCommunityDocument(row, user.id));
      return json({ documents });
    }
    if (request.method === "POST") {
      let input;
      let payload;
      try {
        payload = await body(request);
        input = communityDocumentInput(payload);
      }
      catch (error) { return fail(error.message); }
      const at = new Date().toISOString();
      if (input.folderId && !await env.DB.prepare("SELECT id FROM community_document_folders WHERE id = ? AND owner_id = ? LIMIT 1").bind(input.folderId, user.id).first()) return fail("Folder not found.", 404);
      const document = {
        id: randomBytes(12).toString("hex"), ownerId: user.id, ownerName: user.name, kind: input.kind, title: input.title,
        content: input.content, settings: input.settings, folderId: input.folderId || "", favorite: Boolean(payload.favorite),
        templateKey: input.templateKey || "", versionNumber: 1, permission: "owner", mine: true, canEdit: true, canComment: true,
        restrictions: { download: false, copy: false, print: false }, watermark: "", encrypted: false, createdAt: at, updatedAt: at
      };
      const versionId = randomBytes(12).toString("hex");
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO community_documents
            (id, owner_id, kind, title, content_json, folder_id, favorite, settings_json, template_key, version_number, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).bind(document.id, user.id, input.kind, input.title, input.encoded, input.folderId, payload.favorite ? 1 : 0, input.settingsEncoded, input.templateKey, at, at),
        env.DB.prepare(`
          INSERT INTO community_document_versions
            (id, document_id, version_number, title, content_json, settings_json, change_summary, created_by, created_at)
          VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
        `).bind(versionId, document.id, input.title, input.encoded, input.settingsEncoded, "Document created", user.id, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'create', ?, ?)")
          .bind(document.id, user.id, JSON.stringify({ templateKey: input.templateKey || "" }), at)
      ]);
      return json({ document }, 201);
    }
  }

  const documentMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)(?:\/(share|responses))?$/);
  if (documentMatch) {
    const documentId = decodeURIComponent(documentMatch[1]);
    const operation = documentMatch[2] || "";
    const document = await communityDocumentForUser(env, documentId, user.id);
    if (!document) return fail("Village document not found.", 404);

    if (!operation && request.method === "GET") {
      ctx.waitUntil(recordDocumentAudit(env, documentId, user.id, "view").catch(() => {}));
      return json({ document: mapCommunityDocument(document, user.id) });
    }
    if (!operation && request.method === "PATCH") {
      if (!canEditDocument(document, user.id)) return fail("You need edit permission for this document.", 403);
      let input;
      let payload;
      try {
        payload = await body(request);
        input = communityDocumentInput({ ...payload, kind: document.kind });
      }
      catch (error) { return fail(error.message); }
      if (input.folderId && document.owner_id === user.id && !await env.DB.prepare("SELECT id FROM community_document_folders WHERE id = ? AND owner_id = ? LIMIT 1").bind(input.folderId, user.id).first()) return fail("Folder not found.", 404);
      const at = new Date().toISOString();
      const security = input.settings?.security && typeof input.settings.security === "object" ? input.settings.security : {};
      const createVersion = payload.createVersion !== false;
      const nextVersion = Number(document.version_number || 1) + (createVersion ? 1 : 0);
      const updates = [
        env.DB.prepare(`
          UPDATE community_documents SET title = ?, content_json = ?, settings_json = ?,
            folder_id = CASE WHEN owner_id = ? THEN ? ELSE folder_id END,
            favorite = CASE WHEN owner_id = ? THEN ? ELSE favorite END,
            template_key = CASE WHEN owner_id = ? THEN ? ELSE template_key END,
            version_number = ?,
            restrict_download = CASE WHEN owner_id = ? THEN ? ELSE restrict_download END,
            restrict_copy = CASE WHEN owner_id = ? THEN ? ELSE restrict_copy END,
            restrict_print = CASE WHEN owner_id = ? THEN ? ELSE restrict_print END,
            watermark = CASE WHEN owner_id = ? THEN ? ELSE watermark END,
            encrypted = CASE WHEN owner_id = ? THEN ? ELSE encrypted END,
            updated_at = ?
          WHERE id = ?
        `).bind(
          input.title, input.encoded, input.settingsEncoded,
          user.id, input.folderId, user.id, payload.favorite ? 1 : 0,
          user.id, input.templateKey, nextVersion,
          user.id, security.restrictDownload ? 1 : 0,
          user.id, security.restrictCopy ? 1 : 0,
          user.id, security.restrictPrint ? 1 : 0,
          user.id, String(security.watermark || "").trim().slice(0, 120) || null,
          user.id, security.encrypted ? 1 : 0,
          at, documentId
        ),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'edit', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ autosave: !createVersion, versionNumber: nextVersion }), at)
      ];
      if (createVersion) {
        updates.push(env.DB.prepare(`
          INSERT INTO community_document_versions
            (id, document_id, version_number, title, content_json, settings_json, change_summary, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(randomBytes(12).toString("hex"), documentId, nextVersion, input.title, input.encoded, input.settingsEncoded, String(payload.changeSummary || "Saved changes").trim().slice(0, 240), user.id, at));
      }
      await env.DB.batch(updates);
      const refreshed = await communityDocumentForUser(env, documentId, user.id);
      return json({ document: mapCommunityDocument(refreshed, user.id) });
    }
    if (!operation && request.method === "DELETE") {
      if (document.owner_id !== user.id) return fail("Only the document owner can delete it.", 403);
      const permanent = url.searchParams.get("permanent") === "1";
      if (permanent) {
        await env.DB.prepare("DELETE FROM community_documents WHERE id = ? AND owner_id = ?").bind(documentId, user.id).run();
        return json({ ok: true, permanent: true });
      }
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE community_documents SET trashed_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?").bind(at, at, documentId, user.id),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'trash', '{}', ?)").bind(documentId, user.id, at)
      ]);
      return json({ ok: true, trashedAt: at });
    }
    if (operation === "share" && request.method === "POST") {
      if (document.owner_id !== user.id) return fail("Only the document owner can share it.", 403);
      const roomId = String((await body(request)).roomId || "");
      const room = await roomForMember(env, roomId, user.id);
      if (!room) return fail("Choose a chat you belong to.", 403);
      const at = new Date().toISOString();
      const messageId = randomBytes(12).toString("hex");
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO community_document_shares (document_id, room_id, shared_by, created_at) VALUES (?, ?, ?, ?)").bind(documentId, roomId, user.id, at),
        env.DB.prepare("INSERT INTO chat_messages (id, room_id, user_id, body, message_type, metadata_json, created_at) VALUES (?, ?, ?, ?, 'document', ?, ?)").bind(messageId, roomId, user.id, `Shared ${document.kind.toUpperCase()}: ${document.title}`, JSON.stringify({ documentId, kind: document.kind, title: document.title }), at)
      ]);
      const notificationKind = room.kind === "direct" ? "document" : "group-document";
      ctx.waitUntil(createCommunityNotifications(env, roomId, user.id, notificationKind, room.name, `${user.name} shared ${document.title}`, { roomId, documentId, messageId }).catch(() => {}));
      return json({ ok: true, roomId, messageId }, 201);
    }
    if (operation === "responses" && request.method === "POST") {
      if (document.kind !== "form") return fail("Responses are available for forms only.");
      const response = (await body(request)).response;
      const encoded = JSON.stringify(response && typeof response === "object" ? response : {});
      if (encoded.length > 25000) return fail("The form response is too large.");
      const responseId = randomBytes(12).toString("hex");
      await env.DB.prepare("INSERT INTO community_form_responses (id, document_id, user_id, response_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(responseId, documentId, user.id, encoded, new Date().toISOString()).run();
      return json({ ok: true, responseId }, 201);
    }
    if (operation === "responses" && request.method === "GET") {
      if (document.owner_id !== user.id) return fail("Only the form owner can review responses.", 403);
      const rows = await allRows(env.DB.prepare(`
        SELECT response.*, COALESCE(profile.display_name, account.name) AS author
        FROM community_form_responses response JOIN users account ON account.id = response.user_id
        LEFT JOIN community_profiles profile ON profile.user_id = response.user_id
        WHERE response.document_id = ? ORDER BY response.created_at DESC
      `).bind(documentId));
      return json({ responses: rows.map((row) => ({ id: row.id, userId: row.user_id, author: row.author, response: parseJson(row.response_json, {}), createdAt: row.created_at })) });
    }
  }

  const documentWorkspaceMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/(workspace|metadata|versions|comments|presence|collaborators|share-link|audit|approvals|signatures|integrations|assist)$/);
  if (documentWorkspaceMatch) {
    const documentId = decodeURIComponent(documentWorkspaceMatch[1]);
    const operation = documentWorkspaceMatch[2];
    const document = await communityDocumentForUser(env, documentId, user.id);
    if (!document) return fail("Village document not found.", 404);
    const permission = documentPermission(document, user.id);

    if (operation === "metadata" && request.method === "PATCH") {
      if (document.owner_id !== user.id) return fail("Only the owner can organize this document.", 403);
      const input = await body(request);
      const title = input.title === undefined ? document.title : String(input.title || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 180);
      if (!title) return fail("Add a document title.");
      const folderId = input.folderId === undefined ? document.folder_id : String(input.folderId || "").trim() || null;
      if (folderId && !await env.DB.prepare("SELECT id FROM community_document_folders WHERE id = ? AND owner_id = ? LIMIT 1").bind(folderId, user.id).first()) return fail("Folder not found.", 404);
      const favorite = input.favorite === undefined ? Number(document.favorite || 0) : input.favorite ? 1 : 0;
      const trashedAt = input.trashed === undefined ? document.trashed_at : input.trashed ? new Date().toISOString() : null;
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE community_documents SET title = ?, folder_id = ?, favorite = ?, trashed_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
          .bind(title, folderId, favorite, trashedAt, at, documentId, user.id),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'organize', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ title, folderId, favorite: Boolean(favorite), trashed: Boolean(trashedAt) }), at)
      ]);
      const refreshed = await communityDocumentForUser(env, documentId, user.id);
      return json({ document: mapCommunityDocument(refreshed, user.id) });
    }

    if (operation === "workspace" && request.method === "GET") {
      const presenceCutoff = new Date(Date.now() - 45_000).toISOString();
      await env.DB.prepare("DELETE FROM community_document_presence WHERE document_id = ? AND last_seen_at < ?").bind(documentId, presenceCutoff).run();
      const [versions, comments, collaborators, presence, approvals, signatures, integrations, audit, responses] = await Promise.all([
        allRows(env.DB.prepare(`
          SELECT version.id, version.version_number, version.change_summary, version.created_at,
            COALESCE(profile.display_name, account.name) AS author
          FROM community_document_versions version JOIN users account ON account.id = version.created_by
          LEFT JOIN community_profiles profile ON profile.user_id = version.created_by
          WHERE version.document_id = ? ORDER BY version.version_number DESC LIMIT 100
        `).bind(documentId)),
        allRows(env.DB.prepare(`
          SELECT comment.*, COALESCE(profile.display_name, account.name) AS author,
            mentioned.name AS mentioned_name, assigned.name AS assigned_name
          FROM community_document_comments comment JOIN users account ON account.id = comment.user_id
          LEFT JOIN community_profiles profile ON profile.user_id = comment.user_id
          LEFT JOIN users mentioned ON mentioned.id = comment.mentioned_user_id
          LEFT JOIN users assigned ON assigned.id = comment.assigned_to
          WHERE comment.document_id = ? ORDER BY comment.created_at
        `).bind(documentId)),
        allRows(env.DB.prepare(`
          SELECT collaborator.*, account.name, account.email, account.avatar_data_url
          FROM community_document_collaborators collaborator JOIN users account ON account.id = collaborator.user_id
          WHERE collaborator.document_id = ? ORDER BY account.name COLLATE NOCASE
        `).bind(documentId)),
        allRows(env.DB.prepare(`
          SELECT presence.*, COALESCE(profile.display_name, account.name) AS name, account.avatar_data_url
          FROM community_document_presence presence JOIN users account ON account.id = presence.user_id
          LEFT JOIN community_profiles profile ON profile.user_id = presence.user_id
          WHERE presence.document_id = ? AND presence.last_seen_at >= ? ORDER BY presence.last_seen_at DESC
        `).bind(documentId, presenceCutoff)),
        allRows(env.DB.prepare(`
          SELECT approval.*, requester.name AS requester_name, reviewer.name AS reviewer_name
          FROM community_document_approvals approval
          JOIN users requester ON requester.id = approval.requested_by
          JOIN users reviewer ON reviewer.id = approval.reviewer_id
          WHERE approval.document_id = ? ORDER BY approval.updated_at DESC
        `).bind(documentId)),
        allRows(env.DB.prepare(`
          SELECT signature.*, account.name AS signer_name
          FROM community_document_signatures signature JOIN users account ON account.id = signature.user_id
          WHERE signature.document_id = ? ORDER BY signature.created_at DESC
        `).bind(documentId)),
        document.owner_id === user.id ? allRows(env.DB.prepare("SELECT * FROM community_document_integrations WHERE document_id = ? ORDER BY updated_at DESC").bind(documentId)) : Promise.resolve([]),
        document.owner_id === user.id ? allRows(env.DB.prepare(`
          SELECT audit.*, account.name AS actor_name FROM community_document_audit audit
          JOIN users account ON account.id = audit.user_id
          WHERE audit.document_id = ? ORDER BY audit.created_at DESC LIMIT 200
        `).bind(documentId)) : Promise.resolve([]),
        document.owner_id === user.id ? allRows(env.DB.prepare(`
          SELECT response.*, COALESCE(profile.display_name, account.name) AS author
          FROM community_form_responses response
          JOIN users account ON account.id = response.user_id
          LEFT JOIN community_profiles profile ON profile.user_id = response.user_id
          WHERE response.document_id = ? ORDER BY response.created_at DESC
        `).bind(documentId)) : Promise.resolve([])
      ]);
      ctx.waitUntil(recordDocumentAudit(env, documentId, user.id, "open-workspace").catch(() => {}));
      return json({
        document: mapCommunityDocument(document, user.id),
        versions: versions.map((row) => ({ id: row.id, versionNumber: Number(row.version_number), changeSummary: row.change_summary, author: row.author, createdAt: row.created_at })),
        comments: comments.map((row) => ({ id: row.id, userId: row.user_id, parentId: row.parent_id || "", anchorText: row.anchor_text, body: row.body, author: row.author, mentionedUserId: row.mentioned_user_id || "", mentionedName: row.mentioned_name || "", assignedTo: row.assigned_to || "", assignedName: row.assigned_name || "", status: row.status, mine: row.user_id === user.id, createdAt: row.created_at, updatedAt: row.updated_at })),
        collaborators: collaborators.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, avatarDataUrl: row.avatar_data_url || "", permission: row.permission, expiresAt: row.expires_at || "", createdAt: row.created_at })),
        presence: presence.map((row) => ({ userId: row.user_id, sessionId: row.session_id, name: row.name, avatarDataUrl: row.avatar_data_url || "", cursor: parseJson(row.cursor_json, {}), mine: row.user_id === user.id, lastSeenAt: row.last_seen_at })),
        approvals: approvals.map((row) => ({ id: row.id, requestedBy: row.requested_by, requesterName: row.requester_name, reviewerId: row.reviewer_id, reviewerName: row.reviewer_name, status: row.status, note: row.note, mine: row.reviewer_id === user.id, createdAt: row.created_at, updatedAt: row.updated_at })),
        signatures: signatures.map((row) => ({ id: row.id, userId: row.user_id, signerName: row.signer_name, signatureText: row.signature_text, signatureDataUrl: row.signature_data_url || "", createdAt: row.created_at })),
        integrations: integrations.map((row) => ({ id: row.id, name: row.name, type: row.integration_type, config: parseJson(row.config_json, {}), createdAt: row.created_at, updatedAt: row.updated_at })),
        audit: audit.map((row) => ({ id: Number(row.id), actorName: row.actor_name, action: row.action, metadata: parseJson(row.metadata_json, {}), createdAt: row.created_at })),
        responses: responses.map((row) => ({ id: row.id, userId: row.user_id, author: row.author, response: parseJson(row.response_json, {}), createdAt: row.created_at })),
        permission
      });
    }

    if (operation === "versions" && request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT version.*, account.name AS author FROM community_document_versions version
        JOIN users account ON account.id = version.created_by
        WHERE version.document_id = ? ORDER BY version.version_number DESC LIMIT 100
      `).bind(documentId));
      return json({ versions: rows.map((row) => ({ id: row.id, versionNumber: Number(row.version_number), title: row.title, content: parseJson(row.content_json, {}), settings: parseJson(row.settings_json, {}), changeSummary: row.change_summary, author: row.author, createdAt: row.created_at })) });
    }
    if (operation === "versions" && request.method === "POST") {
      if (!canEditDocument(document, user.id)) return fail("You need edit permission to create a version.", 403);
      const at = new Date().toISOString();
      const versionNumber = Number(document.version_number || 1) + 1;
      const versionId = randomBytes(12).toString("hex");
      const summary = String((await body(request)).changeSummary || "Named version").trim().slice(0, 240);
      await env.DB.batch([
        env.DB.prepare("UPDATE community_documents SET version_number = ?, updated_at = ? WHERE id = ?").bind(versionNumber, at, documentId),
        env.DB.prepare(`
          INSERT INTO community_document_versions
            (id, document_id, version_number, title, content_json, settings_json, change_summary, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(versionId, documentId, versionNumber, document.title, document.content_json, document.settings_json || "{}", summary, user.id, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'version', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ versionNumber, summary }), at)
      ]);
      return json({ version: { id: versionId, versionNumber, changeSummary: summary, author: user.name, createdAt: at } }, 201);
    }

    if (operation === "comments" && request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT comment.*, account.name AS author FROM community_document_comments comment
        JOIN users account ON account.id = comment.user_id
        WHERE comment.document_id = ? ORDER BY comment.created_at
      `).bind(documentId));
      return json({ comments: rows.map((row) => ({ id: row.id, userId: row.user_id, parentId: row.parent_id || "", anchorText: row.anchor_text, body: row.body, author: row.author, mentionedUserId: row.mentioned_user_id || "", assignedTo: row.assigned_to || "", status: row.status, mine: row.user_id === user.id, createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (operation === "comments" && request.method === "POST") {
      if (!canCommentDocument(document, user.id)) return fail("You need comment permission for this document.", 403);
      const input = await body(request);
      const text = String(input.body || "").trim().slice(0, 2500);
      const parentId = String(input.parentId || "").trim() || null;
      const anchorText = String(input.anchorText || "").trim().slice(0, 500);
      const mentionedUserId = String(input.mentionedUserId || "").trim() || null;
      const assignedTo = String(input.assignedTo || "").trim() || null;
      if (!text) return fail("Write a comment first.");
      if (parentId && !await env.DB.prepare("SELECT id FROM community_document_comments WHERE id = ? AND document_id = ? LIMIT 1").bind(parentId, documentId).first()) return fail("The parent comment no longer exists.", 404);
      const at = new Date().toISOString();
      const commentId = randomBytes(12).toString("hex");
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO community_document_comments
            (id, document_id, user_id, parent_id, anchor_text, body, mentioned_user_id, assigned_to, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(commentId, documentId, user.id, parentId, anchorText, text, mentionedUserId, assignedTo, at, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'comment', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ commentId, assignedTo, mentionedUserId }), at)
      ]);
      const notifyIds = [...new Set([mentionedUserId, assignedTo].filter((id) => id && id !== user.id))];
      for (const recipientId of notifyIds) {
        ctx.waitUntil(createUserNotification(env, recipientId, "document-comment", document.title, `${user.name}: ${text}`, { documentId, commentId }).catch(() => {}));
      }
      return json({ comment: { id: commentId, userId: user.id, parentId: parentId || "", anchorText, body: text, author: user.name, mentionedUserId: mentionedUserId || "", assignedTo: assignedTo || "", status: "open", mine: true, createdAt: at, updatedAt: at } }, 201);
    }

    if (operation === "presence" && request.method === "GET") {
      const cutoff = new Date(Date.now() - 45_000).toISOString();
      const rows = await allRows(env.DB.prepare(`
        SELECT presence.*, account.name, account.avatar_data_url FROM community_document_presence presence
        JOIN users account ON account.id = presence.user_id
        WHERE presence.document_id = ? AND presence.last_seen_at >= ? ORDER BY presence.last_seen_at DESC
      `).bind(documentId, cutoff));
      return json({ presence: rows.map((row) => ({ userId: row.user_id, sessionId: row.session_id, name: row.name, avatarDataUrl: row.avatar_data_url || "", cursor: parseJson(row.cursor_json, {}), mine: row.user_id === user.id, lastSeenAt: row.last_seen_at })) });
    }
    if (operation === "presence" && request.method === "POST") {
      const input = await body(request);
      const sessionId = String(input.sessionId || "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
      const cursor = input.cursor && typeof input.cursor === "object" ? input.cursor : {};
      if (!sessionId) return fail("Presence session is missing.");
      const at = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO community_document_presence (document_id, user_id, session_id, cursor_json, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id, user_id, session_id)
        DO UPDATE SET cursor_json = excluded.cursor_json, last_seen_at = excluded.last_seen_at
      `).bind(documentId, user.id, sessionId, JSON.stringify(cursor).slice(0, 5000), at).run();
      return json({ ok: true, lastSeenAt: at });
    }
    if (operation === "presence" && request.method === "DELETE") {
      const sessionId = String(url.searchParams.get("sessionId") || "");
      await env.DB.prepare("DELETE FROM community_document_presence WHERE document_id = ? AND user_id = ? AND (? = '' OR session_id = ?)").bind(documentId, user.id, sessionId, sessionId).run();
      return json({ ok: true });
    }

    if (operation === "collaborators" && request.method === "GET") {
      if (document.owner_id !== user.id) return fail("Only the owner can manage collaborators.", 403);
      const rows = await allRows(env.DB.prepare(`
        SELECT collaborator.*, account.name, account.email FROM community_document_collaborators collaborator
        JOIN users account ON account.id = collaborator.user_id
        WHERE collaborator.document_id = ? ORDER BY account.name COLLATE NOCASE
      `).bind(documentId));
      return json({ collaborators: rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, permission: row.permission, expiresAt: row.expires_at || "", createdAt: row.created_at })) });
    }
    if (operation === "collaborators" && request.method === "POST") {
      if (document.owner_id !== user.id) return fail("Only the owner can invite collaborators.", 403);
      const input = await body(request);
      const permissionValue = ["viewer", "commenter", "editor"].includes(input.permission) ? input.permission : "viewer";
      const account = input.userId
        ? await env.DB.prepare("SELECT id, name, email FROM users WHERE id = ? LIMIT 1").bind(String(input.userId)).first()
        : await env.DB.prepare("SELECT id, name, email FROM users WHERE email = ? LIMIT 1").bind(String(input.email || "").trim().toLowerCase()).first();
      if (!account || account.id === user.id) return fail("Choose another registered Village member.");
      const expiresAt = input.expiresAt && Number.isFinite(new Date(input.expiresAt).getTime()) ? new Date(input.expiresAt).toISOString() : null;
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO community_document_collaborators (document_id, user_id, permission, expires_at, invited_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(document_id, user_id)
          DO UPDATE SET permission = excluded.permission, expires_at = excluded.expires_at, updated_at = excluded.updated_at
        `).bind(documentId, account.id, permissionValue, expiresAt, user.id, at, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'share-user', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ collaboratorId: account.id, permission: permissionValue, expiresAt }), at)
      ]);
      ctx.waitUntil(createUserNotification(env, account.id, "document-share", document.title, `${user.name} invited you as ${permissionValue}.`, { documentId }).catch(() => {}));
      return json({ collaborator: { userId: account.id, name: account.name, email: account.email, permission: permissionValue, expiresAt: expiresAt || "", createdAt: at } }, 201);
    }
    if (operation === "collaborators" && request.method === "DELETE") {
      if (document.owner_id !== user.id) return fail("Only the owner can remove collaborators.", 403);
      const collaboratorId = String(url.searchParams.get("userId") || "");
      await env.DB.prepare("DELETE FROM community_document_collaborators WHERE document_id = ? AND user_id = ?").bind(documentId, collaboratorId).run();
      ctx.waitUntil(recordDocumentAudit(env, documentId, user.id, "remove-collaborator", { collaboratorId }).catch(() => {}));
      return json({ ok: true });
    }

    if (operation === "share-link" && request.method === "POST") {
      if (document.owner_id !== user.id) return fail("Only the owner can manage the share link.", 403);
      const input = await body(request);
      const enabled = input.enabled !== false;
      const token = enabled ? (document.public_share_token || randomBytes(24).toString("hex")) : null;
      const publicPermission = ["viewer", "commenter", "editor"].includes(input.permission) ? input.permission : "viewer";
      const expiresAt = input.expiresAt && Number.isFinite(new Date(input.expiresAt).getTime()) ? new Date(input.expiresAt).toISOString() : null;
      const watermark = String(input.watermark || "").trim().slice(0, 120) || null;
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE community_documents SET public_share_token = ?, public_permission = ?, permission_expires_at = ?,
            restrict_download = ?, restrict_copy = ?, restrict_print = ?, watermark = ?, updated_at = ?
          WHERE id = ? AND owner_id = ?
        `).bind(token, publicPermission, expiresAt, input.restrictDownload ? 1 : 0, input.restrictCopy ? 1 : 0, input.restrictPrint ? 1 : 0, watermark, at, documentId, user.id),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'share-link', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ enabled, permission: publicPermission, expiresAt }), at)
      ]);
      return json({ enabled, token: token || "", permission: publicPermission, expiresAt: expiresAt || "", restrictions: { download: Boolean(input.restrictDownload), copy: Boolean(input.restrictCopy), print: Boolean(input.restrictPrint) }, watermark: watermark || "" });
    }

    if (operation === "audit" && request.method === "GET") {
      if (document.owner_id !== user.id) return fail("Only the owner can view access records.", 403);
      const rows = await allRows(env.DB.prepare(`
        SELECT audit.*, account.name AS actor_name FROM community_document_audit audit
        JOIN users account ON account.id = audit.user_id
        WHERE audit.document_id = ? ORDER BY audit.created_at DESC LIMIT 300
      `).bind(documentId));
      return json({ audit: rows.map((row) => ({ id: Number(row.id), actorName: row.actor_name, action: row.action, metadata: parseJson(row.metadata_json, {}), createdAt: row.created_at })) });
    }

    if (operation === "approvals" && request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT approval.*, requester.name AS requester_name, reviewer.name AS reviewer_name
        FROM community_document_approvals approval
        JOIN users requester ON requester.id = approval.requested_by
        JOIN users reviewer ON reviewer.id = approval.reviewer_id
        WHERE approval.document_id = ? ORDER BY approval.updated_at DESC
      `).bind(documentId));
      return json({ approvals: rows.map((row) => ({ id: row.id, requestedBy: row.requested_by, requesterName: row.requester_name, reviewerId: row.reviewer_id, reviewerName: row.reviewer_name, status: row.status, note: row.note, mine: row.reviewer_id === user.id, createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (operation === "approvals" && request.method === "POST") {
      if (!canEditDocument(document, user.id)) return fail("You need edit permission to request approval.", 403);
      const input = await body(request);
      const reviewer = input.reviewerId
        ? await env.DB.prepare("SELECT id, name FROM users WHERE id = ? LIMIT 1").bind(String(input.reviewerId)).first()
        : await env.DB.prepare("SELECT id, name FROM users WHERE email = ? LIMIT 1").bind(String(input.email || "").trim().toLowerCase()).first();
      if (!reviewer || reviewer.id === user.id) return fail("Choose another registered reviewer.");
      const at = new Date().toISOString();
      const approvalId = randomBytes(12).toString("hex");
      const note = String(input.note || "").trim().slice(0, 1000);
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO community_document_approvals (id, document_id, requested_by, reviewer_id, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(approvalId, documentId, user.id, reviewer.id, note, at, at),
        env.DB.prepare(`
          INSERT OR IGNORE INTO community_document_collaborators
            (document_id, user_id, permission, expires_at, invited_by, created_at, updated_at)
          VALUES (?, ?, 'viewer', NULL, ?, ?, ?)
        `).bind(documentId, reviewer.id, user.id, at, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'request-approval', ?, ?)")
          .bind(documentId, user.id, JSON.stringify({ approvalId, reviewerId: reviewer.id }), at)
      ]);
      ctx.waitUntil(createUserNotification(env, reviewer.id, "document-approval", document.title, `${user.name} requested your approval.`, { documentId, approvalId }).catch(() => {}));
      return json({ approval: { id: approvalId, requestedBy: user.id, requesterName: user.name, reviewerId: reviewer.id, reviewerName: reviewer.name, status: "pending", note, mine: false, createdAt: at, updatedAt: at } }, 201);
    }

    if (operation === "signatures" && request.method === "GET") {
      const rows = await allRows(env.DB.prepare(`
        SELECT signature.*, account.name AS signer_name FROM community_document_signatures signature
        JOIN users account ON account.id = signature.user_id
        WHERE signature.document_id = ? ORDER BY signature.created_at DESC
      `).bind(documentId));
      return json({ signatures: rows.map((row) => ({ id: row.id, userId: row.user_id, signerName: row.signer_name, signatureText: row.signature_text, signatureDataUrl: row.signature_data_url || "", createdAt: row.created_at })) });
    }
    if (operation === "signatures" && request.method === "POST") {
      const input = await body(request);
      const signatureText = String(input.signatureText || user.name).trim().slice(0, 160);
      let signatureDataUrl = null;
      try { signatureDataUrl = safeImageDataUrl(input.signatureDataUrl); }
      catch (error) { return fail(error.message); }
      if (!signatureText) return fail("Add your signature name.");
      const signatureId = randomBytes(12).toString("hex");
      const at = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO community_document_signatures (id, document_id, user_id, signature_text, signature_data_url, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(signatureId, documentId, user.id, signatureText, signatureDataUrl, at),
        env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'sign', ?, ?)").bind(documentId, user.id, JSON.stringify({ signatureId }), at)
      ]);
      return json({ signature: { id: signatureId, userId: user.id, signerName: user.name, signatureText, signatureDataUrl: signatureDataUrl || "", createdAt: at } }, 201);
    }

    if (operation === "integrations" && request.method === "GET") {
      if (document.owner_id !== user.id) return fail("Only the owner can manage integrations.", 403);
      const rows = await allRows(env.DB.prepare("SELECT * FROM community_document_integrations WHERE document_id = ? ORDER BY updated_at DESC").bind(documentId));
      return json({ integrations: rows.map((row) => ({ id: row.id, name: row.name, type: row.integration_type, config: parseJson(row.config_json, {}), createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (operation === "integrations" && request.method === "POST") {
      if (document.owner_id !== user.id) return fail("Only the owner can manage integrations.", 403);
      const input = await body(request);
      const name = String(input.name || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 80);
      const type = ["link", "webhook", "api"].includes(input.type) ? input.type : "link";
      const config = input.config && typeof input.config === "object" ? input.config : {};
      const endpoint = String(config.url || "").trim();
      if (!name) return fail("Name the integration.");
      if (endpoint && !/^https:\/\//i.test(endpoint)) return fail("Integration URLs must use HTTPS.");
      const at = new Date().toISOString();
      const integrationId = randomBytes(12).toString("hex");
      await env.DB.prepare(`
        INSERT INTO community_document_integrations (id, document_id, owner_id, name, integration_type, config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(integrationId, documentId, user.id, name, type, JSON.stringify(config).slice(0, 10000), at, at).run();
      return json({ integration: { id: integrationId, name, type, config, createdAt: at, updatedAt: at } }, 201);
    }
    if (operation === "integrations" && request.method === "DELETE") {
      if (document.owner_id !== user.id) return fail("Only the owner can manage integrations.", 403);
      const integrationId = String(url.searchParams.get("id") || "");
      await env.DB.prepare("DELETE FROM community_document_integrations WHERE id = ? AND document_id = ? AND owner_id = ?").bind(integrationId, documentId, user.id).run();
      return json({ ok: true });
    }

    if (operation === "assist" && request.method === "POST") {
      if (!canEditDocument(document, user.id)) return fail("You need edit permission to use writing assistance.", 403);
      try {
        const input = await body(request);
        const text = await assistDocumentText(env, input);
        ctx.waitUntil(recordDocumentAudit(env, documentId, user.id, "ai-assist", { action: input.action }).catch(() => {}));
        return json({ text });
      } catch (error) { return fail(error.message, 400); }
    }
  }

  const documentCommentMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/comments\/([^/]+)$/);
  if (documentCommentMatch) {
    const documentId = decodeURIComponent(documentCommentMatch[1]);
    const commentId = decodeURIComponent(documentCommentMatch[2]);
    const document = await communityDocumentForUser(env, documentId, user.id);
    if (!document) return fail("Village document not found.", 404);
    const comment = await env.DB.prepare("SELECT * FROM community_document_comments WHERE id = ? AND document_id = ? LIMIT 1").bind(commentId, documentId).first();
    if (!comment) return fail("Comment not found.", 404);
    if (request.method === "PATCH") {
      const input = await body(request);
      const canModerate = comment.user_id === user.id || document.owner_id === user.id;
      if (!canModerate) return fail("Only the comment author or document owner can update it.", 403);
      const status = input.status === "resolved" ? "resolved" : "open";
      const text = input.body === undefined ? comment.body : String(input.body || "").trim().slice(0, 2500);
      if (!text) return fail("Comment text cannot be empty.");
      const at = new Date().toISOString();
      await env.DB.prepare("UPDATE community_document_comments SET body = ?, status = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND document_id = ?")
        .bind(text, status, status === "resolved" ? at : null, at, commentId, documentId).run();
      return json({ ok: true, status, body: text, updatedAt: at });
    }
    if (request.method === "DELETE") {
      if (comment.user_id !== user.id && document.owner_id !== user.id) return fail("Only the comment author or document owner can delete it.", 403);
      await env.DB.prepare("DELETE FROM community_document_comments WHERE id = ? AND document_id = ?").bind(commentId, documentId).run();
      return json({ ok: true });
    }
  }

  const documentVersionRestoreMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/versions\/([^/]+)\/restore$/);
  if (request.method === "POST" && documentVersionRestoreMatch) {
    const documentId = decodeURIComponent(documentVersionRestoreMatch[1]);
    const versionId = decodeURIComponent(documentVersionRestoreMatch[2]);
    const document = await communityDocumentForUser(env, documentId, user.id);
    if (!document || !canEditDocument(document, user.id)) return fail("You need edit permission to restore this version.", 403);
    const version = await env.DB.prepare("SELECT * FROM community_document_versions WHERE id = ? AND document_id = ? LIMIT 1").bind(versionId, documentId).first();
    if (!version) return fail("Version not found.", 404);
    const at = new Date().toISOString();
    const nextVersion = Number(document.version_number || 1) + 1;
    await env.DB.batch([
      env.DB.prepare("UPDATE community_documents SET title = ?, content_json = ?, settings_json = ?, version_number = ?, updated_at = ? WHERE id = ?")
        .bind(version.title, version.content_json, version.settings_json || "{}", nextVersion, at, documentId),
      env.DB.prepare(`
        INSERT INTO community_document_versions
          (id, document_id, version_number, title, content_json, settings_json, change_summary, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(randomBytes(12).toString("hex"), documentId, nextVersion, version.title, version.content_json, version.settings_json || "{}", `Restored version ${version.version_number}`, user.id, at),
      env.DB.prepare("INSERT INTO community_document_audit (document_id, user_id, action, metadata_json, created_at) VALUES (?, ?, 'restore-version', ?, ?)")
        .bind(documentId, user.id, JSON.stringify({ restoredVersion: Number(version.version_number), newVersion: nextVersion }), at)
    ]);
    const refreshed = await communityDocumentForUser(env, documentId, user.id);
    return json({ document: mapCommunityDocument(refreshed, user.id) });
  }

  const documentApprovalMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/approvals\/([^/]+)$/);
  if (request.method === "PATCH" && documentApprovalMatch) {
    const documentId = decodeURIComponent(documentApprovalMatch[1]);
    const approvalId = decodeURIComponent(documentApprovalMatch[2]);
    const document = await communityDocumentForUser(env, documentId, user.id);
    if (!document) return fail("Village document not found.", 404);
    const approval = await env.DB.prepare("SELECT * FROM community_document_approvals WHERE id = ? AND document_id = ? LIMIT 1").bind(approvalId, documentId).first();
    if (!approval || (approval.reviewer_id !== user.id && document.owner_id !== user.id)) return fail("Approval request not found.", 404);
    const input = await body(request);
    const status = ["approved", "changes_requested", "cancelled"].includes(input.status) ? input.status : "pending";
    const note = String(input.note || approval.note || "").trim().slice(0, 1000);
    const at = new Date().toISOString();
    await env.DB.prepare("UPDATE community_document_approvals SET status = ?, note = ?, updated_at = ? WHERE id = ? AND document_id = ?").bind(status, note, at, approvalId, documentId).run();
    if (approval.requested_by !== user.id) ctx.waitUntil(createUserNotification(env, approval.requested_by, "document-approval", document.title, `${user.name}: ${status.replace("_", " ")}`, { documentId, approvalId }).catch(() => {}));
    return json({ ok: true, status, note, updatedAt: at });
  }

  if (request.method === "GET" && url.pathname === "/api/community/notifications") {
    const unreadOnly = url.searchParams.get("unread") === "true";
    const rows = await allRows(env.DB.prepare(`
      SELECT * FROM community_notifications WHERE user_id = ? AND (? = 0 OR read_at IS NULL)
      ORDER BY created_at DESC LIMIT 100
    `).bind(user.id, unreadOnly ? 1 : 0));
    return json({ notifications: rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, metadata: parseJson(row.metadata_json, {}), read: Boolean(row.read_at), createdAt: row.created_at })) });
  }

  if (request.method === "POST" && url.pathname === "/api/community/notifications/read") {
    const input = await body(request);
    const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(String))].slice(0, 100);
    const kinds = [...new Set((Array.isArray(input.kinds) ? input.kinds : []).map(String))].slice(0, 20);
    const at = new Date().toISOString();
    if (ids.length) await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE community_notifications SET read_at = ? WHERE id = ? AND user_id = ?").bind(at, id, user.id)));
    else if (kinds.length) await env.DB.batch(kinds.map((kind) => env.DB.prepare("UPDATE community_notifications SET read_at = ? WHERE user_id = ? AND kind = ? AND read_at IS NULL").bind(at, user.id, kind)));
    else await env.DB.prepare("UPDATE community_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(at, user.id).run();
    return json({ ok: true });
  }

  const messageActionMatch = url.pathname.match(/^\/api\/community\/messages\/([^/]+)\/(save|report)$/);
  if (messageActionMatch) {
    const messageId = decodeURIComponent(messageActionMatch[1]);
    const action = messageActionMatch[2];
    const message = await env.DB.prepare(`
      SELECT message.* FROM chat_messages message
      JOIN chat_members member ON member.room_id = message.room_id
      WHERE message.id = ? AND member.user_id = ? LIMIT 1
    `).bind(messageId, user.id).first();
    if (!message) return fail("Message not found.", 404);
    if (action === "save" && ["POST", "DELETE"].includes(request.method)) {
      if (request.method === "DELETE") await env.DB.prepare("DELETE FROM chat_saved_messages WHERE user_id = ? AND message_id = ?").bind(user.id, messageId).run();
      else await env.DB.prepare("INSERT OR IGNORE INTO chat_saved_messages (user_id, message_id, saved_at) VALUES (?, ?, ?)").bind(user.id, messageId, new Date().toISOString()).run();
      return json({ ok: true, saved: request.method === "POST" });
    }
    if (action === "report" && request.method === "POST") {
      const reason = String((await body(request)).reason || "Inappropriate or unsafe content").trim().slice(0, 500);
      const report = { id: randomBytes(12).toString("hex"), createdAt: new Date().toISOString() };
      await env.DB.prepare(`
        INSERT INTO community_reports (id, reporter_id, message_id, reported_user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(report.id, user.id, messageId, message.user_id, reason, report.createdAt).run();
      return json({ ok: true, reportId: report.id }, 201);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/community/saved") {
    const rows = await allRows(env.DB.prepare(`
      SELECT message.*, saved.saved_at, COALESCE(profile.display_name, account.name) AS author
      FROM chat_saved_messages saved
      JOIN chat_messages message ON message.id = saved.message_id
      JOIN users account ON account.id = message.user_id
      LEFT JOIN community_profiles profile ON profile.user_id = message.user_id
      WHERE saved.user_id = ? ORDER BY saved.saved_at DESC LIMIT 100
    `).bind(user.id));
    return json({ messages: rows.map((row) => ({ id: row.id, roomId: row.room_id, userId: row.user_id, author: row.author, body: row.body, messageType: row.message_type, attachment: row.attachment_data_url ? { name: row.attachment_name, mime: row.attachment_mime, dataUrl: row.attachment_data_url } : null, metadata: parseJson(row.metadata_json, {}), saved: true, createdAt: row.created_at })) });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/community-reports") {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const rows = await allRows(env.DB.prepare(`
      SELECT report.*, reporter.name AS reporter_name, reported.name AS reported_name, message.body AS message_body
      FROM community_reports report
      JOIN users reporter ON reporter.id = report.reporter_id
      LEFT JOIN users reported ON reported.id = report.reported_user_id
      LEFT JOIN chat_messages message ON message.id = report.message_id
      ORDER BY report.created_at DESC LIMIT 200
    `));
    return json({ reports: rows.map((row) => ({ id: row.id, status: row.status, reason: row.reason, reporterName: row.reporter_name, reportedName: row.reported_name || "", messageBody: row.message_body || "", createdAt: row.created_at })) });
  }

  const reportReviewMatch = url.pathname.match(/^\/api\/admin\/community-reports\/([^/]+)$/);
  if (request.method === "PATCH" && reportReviewMatch) {
    if (!user.isAdmin) return fail("Administrator access is required.", 403);
    const status = String((await body(request)).status || "");
    if (!["reviewed", "dismissed"].includes(status)) return fail("Choose reviewed or dismissed.");
    await env.DB.prepare("UPDATE community_reports SET status = ? WHERE id = ?").bind(status, decodeURIComponent(reportReviewMatch[1])).run();
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
      memberIds.forEach((memberId) => ctx.waitUntil(createUserNotification(env, memberId, "group-invite", "Village group invitation", `${profile.display_name} invited you to ${room.name}`, { roomId, inviterId: user.id }).catch(() => {})));
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
        SELECT m.id, m.user_id, m.body, m.message_type, m.attachment_name, m.attachment_mime,
          m.attachment_data_url, m.metadata_json, m.created_at, u.avatar_data_url,
          COALESCE(cp.display_name, u.name) AS author,
          EXISTS(SELECT 1 FROM chat_saved_messages saved WHERE saved.message_id = m.id AND saved.user_id = ?) AS saved
        FROM chat_messages m JOIN users u ON u.id = m.user_id
        LEFT JOIN community_profiles cp ON cp.user_id = m.user_id
        WHERE m.room_id = ?
          AND m.created_at > COALESCE((SELECT cleared_before FROM chat_room_preferences WHERE room_id = ? AND user_id = ?), '')
          AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.blocker_id = ? AND b.blocked_id = m.user_id)
        ORDER BY m.created_at DESC LIMIT 100
      `).bind(user.id, roomId, roomId, user.id, user.id));
      const pref = await env.DB.prepare("SELECT pinned_at FROM chat_room_preferences WHERE room_id = ? AND user_id = ? LIMIT 1").bind(roomId, user.id).first();
      const other = room.kind === "direct" ? await env.DB.prepare("SELECT user_id FROM chat_members WHERE room_id = ? AND user_id != ? LIMIT 1").bind(roomId, user.id).first() : null;
      const members = room.kind === "group" ? await allRows(env.DB.prepare(`SELECT member.user_id, member.role, account.avatar_data_url, COALESCE(profile.display_name, account.name) AS display_name FROM chat_members member JOIN users account ON account.id = member.user_id LEFT JOIN community_profiles profile ON profile.user_id = member.user_id WHERE member.room_id = ? ORDER BY member.role = 'moderator' DESC, display_name`).bind(roomId)) : [];
      return json({
        room: { id: room.id, name: room.name, kind: room.kind, systemManaged: Boolean(room.system_managed), createdBy: room.created_by, pinned: Boolean(pref?.pinned_at), otherUserId: other?.user_id || null },
        members: members.map((member) => ({ userId: member.user_id, displayName: member.display_name, role: member.role, avatarDataUrl: member.avatar_data_url || "" })),
        messages: rows.reverse().map((row) => ({
          id: row.id,
          userId: row.user_id,
          author: row.author,
          avatarDataUrl: row.avatar_data_url || "",
          body: row.body,
          messageType: row.message_type || "text",
          attachment: row.attachment_data_url ? { name: row.attachment_name, mime: row.attachment_mime, dataUrl: row.attachment_data_url } : null,
          metadata: parseJson(row.metadata_json, {}),
          saved: Boolean(row.saved),
          createdAt: row.created_at,
          mine: row.user_id === user.id
        }))
      });
    }

    if (request.method === "POST" && operation === "messages") {
      const input = await body(request);
      let attachment;
      try { attachment = safeAttachment(input.attachment); } catch (error) { return fail(error.message); }
      const requestedType = String(input.messageType || "").toLowerCase();
      let messageType = requestedType === "location" ? "location" : requestedType === "sticker" && attachment?.mime?.startsWith("image/") ? "sticker" : attachment ? "file" : "text";
      let metadata = {};
      if (messageType === "location") {
        if (!profile.location_sharing_enabled) return fail("Turn on location sharing in Community settings first.", 403);
        const latitude = Number(input.location?.latitude);
        const longitude = Number(input.location?.longitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return fail("Choose a valid location.");
        metadata = { latitude: Number(latitude.toFixed(5)), longitude: Number(longitude.toFixed(5)), label: String(input.location?.label || "Shared location").trim().slice(0, 80) };
      }
      const rawBody = String(input.message || "").trim().slice(0, 1000);
      const messageBody = messageType === "text"
        ? (await maskCommunityMessage(env, rawBody)).trim()
        : rawBody || (messageType === "file" ? `Shared ${attachment.name}` : messageType === "location" ? "Shared a location" : "Shared a sticker");
      if (!messageBody) return fail("Write a message or attach something first.");
      if (room.kind === "direct") {
        const recipient = await env.DB.prepare(`
          SELECT profile.direct_messages_enabled FROM chat_members member
          LEFT JOIN community_profiles profile ON profile.user_id = member.user_id
          WHERE member.room_id = ? AND member.user_id != ? LIMIT 1
        `).bind(roomId, user.id).first();
        if (recipient && !recipient.direct_messages_enabled) return fail("This friend is not accepting private messages right now.", 403);
      }
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: messageBody, messageType, attachment, metadata, createdAt: new Date().toISOString() };
      await env.DB.prepare(`
        INSERT INTO chat_messages (
          id, room_id, user_id, body, message_type, attachment_name,
          attachment_mime, attachment_data_url, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(message.id, roomId, user.id, message.body, message.messageType, attachment?.name || null, attachment?.mime || null, attachment?.dataUrl || null, JSON.stringify(metadata), message.createdAt).run();
      const notificationKind = room.kind === "direct" ? "direct-message" : "group-message";
      ctx.waitUntil(createCommunityNotifications(env, roomId, user.id, notificationKind, room.name, `${profile.display_name}: ${message.body}`, { roomId, messageId: message.id }).catch(() => {}));
      ctx.waitUntil(syncUser(env, user).catch(() => {}));
      return json({ message: { ...message, author: profile.display_name, avatarDataUrl: user.avatarDataUrl || "", saved: false, mine: true }, sync: { queued: Boolean(env.USER_SHEET_WEBHOOK_URL) } }, 201);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/community/connect") {
    const targetUserId = String((await body(request)).targetUserId || "");
    if (!targetUserId || targetUserId === user.id) return fail("Choose another community member.");
    const ownProfile = await communityProfile(env, user.id);
    const targetProfile = await communityProfile(env, targetUserId);
    if (!ownProfile?.enabled || !targetProfile?.enabled) return fail("Both members must opt in to community matching.", 403);
    if (!targetProfile.allow_stranger_requests) return fail("This member is not accepting new friend requests.", 403);
    if (await usersBlocked(env, user.id, targetUserId)) return fail("This connection is unavailable.", 403);
    const key = pairKey(user.id, targetUserId);
    const existing = await env.DB.prepare("SELECT id, status FROM chat_connections WHERE pair_key = ? LIMIT 1").bind(key).first();
    if (existing) return fail(existing.status === "accepted" ? "You already have a private chat." : "A connection request already exists.", 409);
    const now = new Date().toISOString();
    const connectionId = randomBytes(12).toString("hex");
    await env.DB.prepare("INSERT INTO chat_connections (id, pair_key, requester_id, recipient_id, status, room_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)")
      .bind(connectionId, key, user.id, targetUserId, now, now).run();
    ctx.waitUntil(createUserNotification(env, targetUserId, "request", "New friend request", `${ownProfile.display_name} would like to connect`, { connectionId, requesterId: user.id }).catch(() => {}));
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
    ctx.waitUntil(createUserNotification(env, connection.requester_id, "request", "Friend request accepted", `${(await communityProfile(env, user.id))?.display_name || user.name} accepted your request`, { roomId, userId: user.id }).catch(() => {}));
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
    const { topic = "Education", diagnosis = "", description = "", count, confirmedSecondaryKeywords = [], rejectedKeywords = [], age = "", lifeStage = "", language = "en", allowFollowUpQuestions = false } = await body(request);
    if (String(description).trim().length < 8) return fail("Tell Waffles a little more so the recommendations can be useful.");
    if (!diagnosis) return fail("Choose an island before searching for resources.");
    const data = await resources(env);
    const blockedPrimaryKeywords = await primaryKeywordBlocklist(env);
    const primaryKeywords = filterPrimaryKeywords(extractKeywords([description], scoreConfig.limits.maximumPrimaryKeywords), blockedPrimaryKeywords).slice(0, scoreConfig.limits.maximumPrimaryKeywords);
    const gateKeywords = extractGateKeywords([...primaryKeywords, ...confirmedSecondaryKeywords], scoreConfig);
    const expansionKeywords = heuristicKeywordExpansion([...primaryKeywords, ...confirmedSecondaryKeywords], scoreConfig.limits.maximumSecondaryKeywords);
    const profileAge = user.profile?.responses?.age || "";
    const lifeStages = extractLifeStages([description, age, lifeStage, profileAge], 8);
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const requestedCount = normalizeResultCount(count, scoreConfig);
    const rankingInput = { diagnosis, category: topic, gateKeywords, primaryKeywords, confirmedSecondaryKeywords, rejectedKeywords, expansionKeywords, issuePreferences, age: profileAge || age, lifeStage, lifeStages, count: requestedCount, config: scoreConfig };
    const expanded = { ai: false, keywords: [] };
    const matches = rankResources(data.rows, { ...rankingInput, predictedKeywords: [] });
    let answer = null;
    let ai = false;
    try { answer = await aiAnswer(env, { topic, description, profile: user.profile, matches, language }); ai = Boolean(answer); } catch {}
    if (!answer) answer = deterministicAnswer(topic, description, matches, language);
    const highScoreCount = matches.filter((match) => Number(match.score || 0) >= 20).length;
    const foundKeywords = locatedKeywords(matches);
    const researchContext = {
      fullInput: String(description),
      diagnosis,
      category: topic,
      primaryKeywords,
      confirmedKeywords: confirmedSecondaryKeywords,
      predictedKeywords: expanded.keywords,
      locatedKeywords: foundKeywords,
      requestedCount,
      providedCount: matches.length,
      highScoreCount,
      source: data.source
    };
    const shortageReasons = [];
    if (matches.length < requestedCount) {
      shortageReasons.push(`Requested ${requestedCount} resources, but only ${matches.length} were available from the database.`);
    }
    if (highScoreCount < 3) {
      shortageReasons.push(`Only ${highScoreCount} displayed resources scored at least 20; at least 3 are required.`);
    }
    if (!user.guest) {
      user.history = [...(user.history || []), { topic, description, at: new Date().toISOString() }].slice(-50);
      await env.DB.prepare("UPDATE users SET history_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(user.history), new Date().toISOString(), user.id).run();
      ctx.waitUntil(syncUser(env, user).catch(() => {}));
    }
    const errorSync = [];
    if (shortageReasons.length) {
      try {
        errorSync.push(await logErrorRecord(env, {
          event: matches.length < requestedCount && highScoreCount < 3 ? "insufficient_resources_and_high_scores" : matches.length < requestedCount ? "insufficient_resources" : "insufficient_high_score_resources",
          reason: shortageReasons.join(" "),
          user,
          topic,
          diagnosis,
          description,
          requestedCount,
          providedCount: matches.length,
          highScoreCount,
          source: data.source,
          primaryKeywords,
          confirmedKeywords: confirmedSecondaryKeywords,
          predictedKeywords: expanded.keywords,
          locatedKeywords: foundKeywords
        }));
      } catch (error) {
        errorSync.push({ synced: false, reason: error.message });
      }
    }
    await recordUserCountSafely(env, { [COUNT_TOTAL_SEARCHES_COMPLETED]: 1 });
    return json({ answer, resources: matches, source: data.source, ai, summaryGuide: buildingGuideName(topic), researchContext, followUpQuestions: allowFollowUpQuestions ? localizedClarificationQuestions({ topic, description, language }) : [], keywordExpansion: { ai: expanded.ai, synonyms: expansionKeywords, predicted: expanded.keywords, suggested: [...expansionKeywords, ...expanded.keywords] }, scoring: { version: scoreConfig.version, minimumScore: scoreConfig.limits.minimumScore }, errorSync, sync: { queued: !user.guest && Boolean(env.USER_SHEET_WEBHOOK_URL) } });
  }

  if (request.method === "POST" && url.pathname === "/api/research-feedback") {
    const { helpful = true, rating = 0, details = "", source = "research-results", research = {} } = await body(request);
    const isHelpful = helpful === true || helpful === "true";
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return fail("Choose a star rating from 1 to 5.", 400);
    const feedbackDetails = String(details || "").trim().slice(0, 2000);
    let feedbackSync = { synced: false, reason: "FEEDBACK_SHEET_WEBHOOK_URL is not configured." };
    try {
      feedbackSync = await syncFeedbackRecord(env, { helpful: isHelpful, rating: numericRating, details: feedbackDetails, user });
    } catch (error) {
      feedbackSync = { synced: false, reason: error.message };
    }
    if (feedbackSync.synced) {
      await recordUserCountSafely(env, {
        [COUNT_USEFULNESS_SCORE_TOTAL]: numericRating,
        [COUNT_USEFULNESS_RESPONSE_COUNT]: 1
      });
    }

    const description = String(research.fullInput || research.description || "").trim().slice(0, 2000);
    let sync = { synced: false, reason: isHelpful ? "Helpful feedback does not require an Error row." : "Research context is unavailable." };
    if (!isHelpful && description) {
      try {
        const reasonPrefix = source === "daily-return" ? "User chose Not really in the daily return-to-home research check-in." : "User chose Not Helpful for the completed research.";
        sync = await logErrorRecord(env, {
          event: "research_not_helpful",
          reason: `${reasonPrefix} Rating: ${numericRating}/5.${feedbackDetails ? ` Details: ${feedbackDetails}` : ""}`,
          user,
          topic: String(research.category || research.topic || ""),
          diagnosis: String(research.diagnosis || ""),
          description,
          requestedCount: research.requestedCount ?? "",
          providedCount: research.providedCount ?? "",
          highScoreCount: research.highScoreCount ?? "",
          source,
          primaryKeywords: research.primaryKeywords,
          confirmedKeywords: research.confirmedKeywords,
          predictedKeywords: research.predictedKeywords,
          locatedKeywords: research.locatedKeywords
        });
      } catch (error) {
        sync = { synced: false, reason: error.message };
      }
    }
    return json({ ok: true, recorded: Boolean(feedbackSync.synced), feedbackSync, sync });
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
    ctx.waitUntil(syncUserCountMetrics(env).catch((error) => console.error("Hourly user count sync failed:", error.message)));
  }
};
