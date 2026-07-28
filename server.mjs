import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { CLARIFICATION_TRANSLATIONS, DEFAULT_SCORE_CONFIG, clarificationQuestions, extractGateKeywords, extractKeywords, extractLifeStages, heuristicKeywordExpansion, inferIssuePreferences, normalizeKeywordList, normalizeResultCount, rankResources } from "./scoring-engine.mjs";
import { communitySimilarity, containsBlockedLanguage, maskBlockedLanguage, normalizeBlockedTerms, pairKey, safeDisplayName } from "./community-logic.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const USERS_FILE = process.env.USERS_FILE || join(DATA_DIR, "users.json");
const SESSIONS_FILE = process.env.SESSIONS_FILE || join(DATA_DIR, "sessions.json");
const COMMUNITY_FILE = process.env.COMMUNITY_FILE || join(DATA_DIR, "community.json");
const PASSWORD_RESETS_FILE = process.env.PASSWORD_RESETS_FILE || join(DATA_DIR, "password-resets.json");
const ANNOUNCEMENTS_FILE = process.env.ANNOUNCEMENTS_FILE || join(DATA_DIR, "announcements.json");
const ACTIVITIES_FILE = process.env.ACTIVITIES_FILE || join(DATA_DIR, "activities.json");
const USER_COUNT_FILE = process.env.USER_COUNT_FILE || join(DATA_DIR, "user-counts.json");
const PRIMARY_KEYWORD_BLOCKLIST_FILE = process.env.PRIMARY_KEYWORD_BLOCKLIST_FILE || join(DATA_DIR, "primary-keyword-blocklist.json");
const COMMUNITY_BLOCKLIST_FILE = process.env.COMMUNITY_BLOCKLIST_FILE || join(DATA_DIR, "community-blocklist.json");
const FALLBACK_FILE = join(DATA_DIR, "resources-fallback.json");
const SCORING_CONFIG_FILE = process.env.SCORING_CONFIG_FILE || join(ROOT, "config", "scoring-config.json");
const RESOURCE_SHEET_ID = process.env.RESOURCE_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const RESOURCE_SHEET_GID = process.env.RESOURCE_SHEET_GID || "1709372674";
const USER_SHEET_ID = process.env.USER_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const USER_SHEET_GID = process.env.USER_SHEET_GID || "697062702";
const USER_COUNT_SHEET_ID = process.env.USER_COUNT_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const USER_COUNT_SHEET_GID = process.env.USER_COUNT_SHEET_GID || "1958570867";
const FEEDBACK_SHEET_ID = process.env.FEEDBACK_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
const FEEDBACK_SHEET_GID = process.env.FEEDBACK_SHEET_GID || "981733839";
const COUNT_TOTAL_GUEST_SESSIONS = "Total Guest Sessions";
const COUNT_TOTAL_ACCOUNTS_CREATED = "Total Accounts Created";
const COUNT_TOTAL_SEARCHES_COMPLETED = "Total Searches Completed";
const COUNT_RECOMMENDATION_USEFULNESS = "Average Recommendation System Usefulness on a 1-5 Scale (5 being the best, 1 being the worst)";
const COUNT_USEFULNESS_SCORE_TOTAL = "__recommendation_usefulness_score_total";
const COUNT_USEFULNESS_RESPONSE_COUNT = "__recommendation_usefulness_response_count";
const USER_COUNT_SYNC_INTERVAL_MS = Math.max(100, Number(process.env.USER_COUNT_SYNC_INTERVAL_MS || 60 * 60_000));
const RESOURCE_CACHE_TTL_MS = Math.max(0, Number(process.env.RESOURCE_CACHE_TTL_MS ?? 60_000));
const sessions = new Map();
const MAX_BODY = 1_000_000;
let resourceCache = { time: 0, rows: [] };
const environmentCache = new Map();
const ENVIRONMENT_CACHE_MS = 10 * 60_000;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_ADMIN_EMAIL = "yanyanweiyue@gmail.com";
const DEFAULT_PRIMARY_KEYWORD_BLOCKLIST = ["waffles"];
const DEFAULT_ACTIVITIES = [
  { id: "seed-quiet-family-picnic", date: "Jul 12", title: "Quiet family picnic", meta: "Palo Alto · Low-stimulation area available", description: "A relaxed community meet-up with optional activities and a calm corner." },
  { id: "seed-volunteer-orientation", date: "Jul 27", title: "Volunteer orientation", meta: "Online · 45 minutes", description: "Learn how to support future It Takes a Village events and resource reviews." },
  { id: "seed-iep-workshop", date: "Aug 09", title: "IEP preparation workshop", meta: "San Jose · Free", description: "Bring your questions and leave with a one-page meeting plan." }
];

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
  const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`;
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
    postComments: [],
    groupInvites: [],
    stickers: [],
    savedMessages: [],
    reports: [],
    notifications: [],
    documents: [],
    documentShares: [],
    documentFolders: [],
    documentCollaborators: [],
    documentVersions: [],
    documentComments: [],
    documentPresence: [],
    documentAudit: [],
    documentApprovals: [],
    documentSignatures: [],
    documentIntegrations: [],
    formResponses: [],
    meetings: [],
    meetingParticipants: [],
    meetingSignals: [],
    whiteboardEvents: [],
    polls: [],
    pollVotes: [],
    meetingMessages: [],
    meetingReactions: []
  };
}

async function loadCommunity() {
  try {
    const saved = JSON.parse(await readFile(COMMUNITY_FILE, "utf8"));
    const base = defaultCommunity();
    return {
      ...base,
      ...saved,
      profiles: saved.profiles || {},
      rooms: Array.isArray(saved.rooms) && saved.rooms.length ? saved.rooms : base.rooms,
      members: saved.members || [],
      messages: saved.messages || [],
      connections: saved.connections || [],
      blocks: saved.blocks || [],
      roomPreferences: saved.roomPreferences || {},
      posts: saved.posts || [],
      postComments: saved.postComments || [],
      groupInvites: saved.groupInvites || [],
      stickers: saved.stickers || [],
      savedMessages: saved.savedMessages || [],
      reports: saved.reports || [],
      notifications: saved.notifications || [],
      documents: saved.documents || [],
      documentShares: saved.documentShares || [],
      documentFolders: saved.documentFolders || [],
      documentCollaborators: saved.documentCollaborators || [],
      documentVersions: saved.documentVersions || [],
      documentComments: saved.documentComments || [],
      documentPresence: saved.documentPresence || [],
      documentAudit: saved.documentAudit || [],
      documentApprovals: saved.documentApprovals || [],
      documentSignatures: saved.documentSignatures || [],
      documentIntegrations: saved.documentIntegrations || [],
      formResponses: saved.formResponses || [],
      meetings: saved.meetings || [],
      meetingParticipants: saved.meetingParticipants || [],
      meetingSignals: saved.meetingSignals || [],
      whiteboardEvents: saved.whiteboardEvents || [],
      polls: saved.polls || [],
      pollVotes: saved.pollVotes || [],
      meetingMessages: saved.meetingMessages || [],
      meetingReactions: saved.meetingReactions || []
    };
  } catch { return defaultCommunity(); }
}

async function saveCommunity(community) {
  await saveJsonAtomically(COMMUNITY_FILE, community);
}

function localDocumentPermission(community, document, userId) {
  if (!document) return "none";
  if (document.ownerId === userId) return "owner";
  const collaborator = community.documentCollaborators.find((item) => item.documentId === document.id && item.userId === userId);
  if (collaborator && (!collaborator.expiresAt || new Date(collaborator.expiresAt).getTime() > Date.now())) return collaborator.permission;
  const roomShared = community.documentShares.some((share) => share.documentId === document.id && community.members.some((member) => member.roomId === share.roomId && member.userId === userId));
  return roomShared ? "viewer" : "none";
}

function localDocumentDto(community, document, user, users) {
  const permission = localDocumentPermission(community, document, user.id);
  return {
    ...document,
    ownerName: users.find((candidate) => candidate.id === document.ownerId)?.name || "Village member",
    permission,
    mine: document.ownerId === user.id,
    canEdit: ["owner", "editor"].includes(permission),
    canComment: ["owner", "editor", "commenter"].includes(permission),
    publicShareToken: document.ownerId === user.id ? document.publicShareToken || "" : "",
    restrictions: document.restrictions || { download: false, copy: false, print: false }
  };
}

async function loadPrimaryKeywordBlocklist() {
  try { return normalizeKeywordList(JSON.parse(await readFile(PRIMARY_KEYWORD_BLOCKLIST_FILE, "utf8")), 200); }
  catch { return normalizeKeywordList(process.env.PRIMARY_KEYWORD_BLOCKLIST || DEFAULT_PRIMARY_KEYWORD_BLOCKLIST, 200); }
}

async function savePrimaryKeywordBlocklist(keywords) {
  const normalized = normalizeKeywordList(keywords, 200);
  await saveJsonAtomically(PRIMARY_KEYWORD_BLOCKLIST_FILE, normalized);
  return normalized;
}

async function loadCommunityBlocklist() {
  try { return normalizeBlockedTerms(JSON.parse(await readFile(COMMUNITY_BLOCKLIST_FILE, "utf8")), 500); }
  catch { return []; }
}

async function saveCommunityBlocklist(terms) {
  const normalized = normalizeBlockedTerms(terms, 500);
  await saveJsonAtomically(COMMUNITY_BLOCKLIST_FILE, normalized);
  return normalized;
}

async function maskLocalCommunityMessage(value) {
  return maskBlockedLanguage(String(value || ""), await loadCommunityBlocklist());
}

function filterPrimaryKeywords(keywords, blockedKeywords) {
  const blocked = new Set(normalizeKeywordList(blockedKeywords, 200));
  return normalizeKeywordList(keywords, 100).filter((keyword) => !blocked.has(keyword) && !keyword.split(" ").some((word) => blocked.has(word)));
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

function localNotification(community, userId, kind, title, body, metadata = {}) {
  if (community.profiles[userId]?.notificationsEnabled === false) return;
  community.notifications.push({
    id: randomBytes(12).toString("hex"),
    userId,
    kind,
    title: String(title).slice(0, 100),
    body: String(body).slice(0, 240),
    metadata,
    readAt: null,
    createdAt: new Date().toISOString()
  });
  community.notifications = community.notifications.slice(-5000);
}

function notifyLocalRoom(community, roomId, senderId, kind, title, body, metadata = {}) {
  community.members.filter((member) => member.roomId === roomId && member.userId !== senderId)
    .forEach((member) => localNotification(community, member.userId, kind, title, body, metadata));
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
  if (!ownProfile?.enabled) return { enabled: false, displayName: ownProfile?.displayName || safeDisplayName(user.name), avatarDataUrl: user.avatarDataUrl || "", groups, recommendations: [], incoming: [], outgoing: [], directRooms: [] };
  const recommendations = users.filter((candidate) => candidate.id !== user.id && community.profiles[candidate.id]?.enabled && community.profiles[candidate.id]?.discoverable !== false && !localBlocked(community, user.id, candidate.id) && !community.connections.some((connection) => connection.pairKey === pairKey(user.id, candidate.id))).map((candidate) => {
    const match = communitySimilarity(user.profile, candidate.profile);
    return { userId: candidate.id, displayName: community.profiles[candidate.id].displayName, avatarDataUrl: candidate.avatarDataUrl || "", score: match.score, reasons: match.reasons };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)).slice(0, 6);
  const withName = (connection, userId) => ({ id: connection.id, user_id: userId, display_name: community.profiles[userId]?.displayName || "Village member", created_at: connection.createdAt });
  const incoming = community.connections.filter((item) => item.recipientId === user.id && item.status === "pending").map((item) => withName(item, item.requesterId));
  const outgoing = community.connections.filter((item) => item.requesterId === user.id && item.status === "pending").map((item) => withName(item, item.recipientId));
  const directRooms = community.rooms.filter((room) => room.kind === "direct" && community.members.some((member) => member.roomId === room.id && member.userId === user.id)).map((room) => {
    const otherId = community.members.find((member) => member.roomId === room.id && member.userId !== user.id)?.userId;
    const other = users.find((item) => item.id === otherId);
    return { id: room.id, user_id: otherId, email: other?.email || "", avatar_data_url: other?.avatarDataUrl || "", name: community.profiles[otherId]?.displayName || "Private conversation", pinned: Boolean(localRoomPreference(community, room.id, user.id).pinnedAt) };
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const blocks = community.blocks.filter((item) => item.blockerId === user.id).map((item) => ({ user_id: item.blockedId, display_name: community.profiles[item.blockedId]?.displayName || users.find((candidate) => candidate.id === item.blockedId)?.name || "Village member" }));
  const groupInvites = community.groupInvites.filter((invite) => invite.recipientId === user.id && invite.status === "pending").map((invite) => {
    const room = community.rooms.find((item) => item.id === invite.roomId);
    return { id: invite.id, room_id: invite.roomId, room_name: room?.name || "Group", description: room?.description || "", inviter_name: community.profiles[invite.inviterId]?.displayName || "Village member", created_at: invite.createdAt };
  });
  const notificationCounts = { direct: 0, groups: 0, moments: 0, requests: 0, meetings: 0, total: 0 };
  community.notifications.filter((item) => item.userId === user.id && !item.readAt).forEach((item) => {
    notificationCounts.total += 1;
    if (["direct-message", "document", "file"].includes(item.kind)) notificationCounts.direct += 1;
    else if (["group-message", "group-document"].includes(item.kind)) notificationCounts.groups += 1;
    else if (["moment", "moment-comment"].includes(item.kind)) notificationCounts.moments += 1;
    else if (["request", "group-invite"].includes(item.kind)) notificationCounts.requests += 1;
    else if (item.kind === "meeting") notificationCounts.meetings += 1;
    else notificationCounts.direct += 1;
  });
  return {
    enabled: true,
    displayName: ownProfile.displayName,
    avatarDataUrl: user.avatarDataUrl || "",
    coverImageDataUrl: ownProfile.coverImageDataUrl || "",
    preferences: {
      notificationsEnabled: ownProfile.notificationsEnabled !== false,
      discoverable: ownProfile.discoverable !== false,
      directMessagesEnabled: ownProfile.directMessagesEnabled !== false,
      locationSharingEnabled: Boolean(ownProfile.locationSharingEnabled),
      momentTheme: ownProfile.momentTheme === "dark" ? "dark" : "light",
      allowStrangerRequests: ownProfile.allowStrangerRequests !== false,
      allowStrangerMoments: Boolean(ownProfile.allowStrangerMoments),
      momentVisibilityDays: Number(ownProfile.momentVisibilityDays || 30)
    },
    notificationCount: notificationCounts.total,
    notificationCounts,
    documentCount: community.documents.filter((item) => item.ownerId === user.id).length,
    groups,
    recommendations,
    incoming,
    outgoing,
    directRooms,
    blocks,
    groupInvites
  };
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

function authenticatedSheetPayload(payload) {
  const webhookSecret = String(process.env.SHEET_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) throw new Error("SHEET_WEBHOOK_SECRET is not configured.");
  return { ...payload, webhookSecret };
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
    body: JSON.stringify(authenticatedSheetPayload({ action: "send-password-reset", email, code, expiresInMinutes: 10, fromAddress: process.env.PASSWORD_EMAIL_FROM_ADDRESS || "", fromName: process.env.PASSWORD_EMAIL_FROM_NAME || "It Takes a Village" })),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Password email webhook returned ${response.status}.`);
  const result = await response.json().catch(() => ({ ok: true }));
  if (result.ok === false) throw new Error(result.error || "Password email webhook failed.");
  return true;
}

function localizedClarificationQuestions({ topic, description, language = "en", config = DEFAULT_SCORE_CONFIG }) {
  const translations = CLARIFICATION_TRANSLATIONS[language] || CLARIFICATION_TRANSLATIONS.en || {};
  return clarificationQuestions({ topic, description, maxQuestions: config.limits?.maximumFollowUpQuestions || 3 }).map((item) => ({
    ...item,
    question: translations[item.id] || item.question,
    options: (item.options || []).map((option) => translations[option] || option)
  }));
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
    dislikedResources: Array.isArray(user.dislikedResources) ? user.dislikedResources : [],
    isAdmin: Boolean(user.isAdmin),
    avatarDataUrl: user.avatarDataUrl || ""
  };
}

async function ensureLocalAdmin(user) {
  if (!user || user.guest || user.isAdmin) return user;
  const users = await loadUsers();
  const configured = [DEFAULT_ADMIN_EMAIL, ...String(process.env.ADMIN_EMAILS || "").split(",")].map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (configured.includes(user.email.toLowerCase())) {
    const stored = users.find((item) => item.id === user.id);
    if (stored) { stored.isAdmin = true; stored.updatedAt = new Date().toISOString(); await saveUsers(users); }
    user.isAdmin = true;
  }
  return user;
}

async function loadAnnouncements() {
  try { const items = JSON.parse(await readFile(ANNOUNCEMENTS_FILE, "utf8")); return Array.isArray(items) ? items : []; }
  catch { return []; }
}

async function saveAnnouncements(items) { await saveJsonAtomically(ANNOUNCEMENTS_FILE, items); }

function announcementInput(input) {
  const title = String(input.title || "").trim().slice(0, 120);
  const text = String(input.body || "").trim().slice(0, 5000);
  const category = String(input.category || "Update").trim().slice(0, 40) || "Update";
  if (!title) throw new Error("Please add an announcement title.");
  if (!text) throw new Error("Please add announcement details.");
  return { title, body: text, category, isPinned: Boolean(input.isPinned) };
}

async function loadActivities() {
  try { const items = JSON.parse(await readFile(ACTIVITIES_FILE, "utf8")); return Array.isArray(items) ? items : DEFAULT_ACTIVITIES; }
  catch { return DEFAULT_ACTIVITIES.map((item) => ({ ...item })); }
}

async function saveActivities(items) { await saveJsonAtomically(ACTIVITIES_FILE, items); }

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

function guestUser() {
  return { id: "guest", name: "Guest", email: "", guest: true, surveyCompleted: true, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [], avatarDataUrl: "" };
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
  if (!force && resourceCache.rows.length && Date.now() - resourceCache.time < RESOURCE_CACHE_TTL_MS) {
    return { rows: resourceCache.rows, source: "google-sheet-cache" };
  }
  try {
    const url = `https://docs.google.com/spreadsheets/d/${RESOURCE_SHEET_ID}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(RESOURCE_SHEET_GID)}&headers=1`;
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
    const names = matches.slice(0, 3).map((item) => item.name).join("、");
    return `你好，我是 ${guideName}。我找到了 ${matches.length} 个可能合适的${topicText}资源，匹配你的需求：“${description}”。可以先看：${names}。结果已按分数从高到低排列。请直接向服务机构确认资格、费用和当前可用性。`;
  }
  if (language === "es") {
    if (!matches.length) return `${guideName} no encontró un recurso de ${topicText} que pasara todos los filtros requeridos para “${description}”. Prueba una necesidad o ubicación más amplia; el diagnóstico y la categoría del edificio seguirán protegidos como filtros.`;
    const names = matches.slice(0, 3).map((item) => item.name).join(", ");
    return `Hola, soy ${guideName}. Encontré ${matches.length} recursos prometedores de ${topicText} para “${description}”. Empieza con ${names}. Los resultados están ordenados de mayor a menor puntuación. Confirma requisitos, costo y disponibilidad directamente con cada proveedor.`;
  }
  if (!matches.length) return `${guideName} did not find a ${topicText} resource that passed every required filter for “${description}”. Try one broader need or location phrase; diagnosis and building category will remain protected filters.`;
  const names = matches.slice(0, 3).map((item) => item.name).join(", ");
  return `Hi, I’m ${guideName}. I found ${matches.length} promising ${topicText} resources for “${description}”. Start with ${names}. Results are ordered from highest to lowest score. Please confirm eligibility, cost, and current availability directly with each provider.`;
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
  const guideName = buildingGuideName(topic);
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
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
      max_output_tokens: 240,
      instructions: `You are ${guideName}, the warm guide for the ${topic} building. Start by introducing yourself as ${guideName}. Summarize only candidateResources, keep their score order, and never invent facts or URLs. Do not diagnose or promise outcomes. Use plain language, no markdown, and no more than 90 words. Encourage verification of eligibility, cost, and availability. Respond in ${responseLanguageName(language)}.`,
      input: JSON.stringify(input)
    }),
    signal: AbortSignal.timeout(4_000)
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

async function syncUserRecord(user) {
  const webhook = process.env.USER_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
  const payload = {
    action: "upsert-user",
    spreadsheetId: USER_SHEET_ID,
    sheetGid: USER_SHEET_GID,
    "Unique User ID": user.id,
    "Email": user.email,
    "Username": user.name,
    "Password": "Not stored — secure hash only",
    "Summary of Survey Response": user.profile?.summary || "",
    "Survey Response (Unedited)": JSON.stringify(user.profile?.responses || {}),
    "Summary of Search History": JSON.stringify(user.history || []),
    "Save Resource": JSON.stringify(user.likedResources || []),
    "Dislike Resource": JSON.stringify(user.dislikedResources || [])
  };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authenticatedSheetPayload(payload)),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`User sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "User sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

async function loadUserCountState() {
  try {
    const saved = JSON.parse(await readFile(USER_COUNT_FILE, "utf8"));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

async function saveUserCountState(state) {
  await saveJsonAtomically(USER_COUNT_FILE, state);
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

function aggregateUserCountMetrics(state = {}) {
  const entries = state.allTime && typeof state.allTime === "object"
    ? [state.allTime]
    : Object.entries(state)
      .filter(([key, metrics]) => key !== "allTime" && metrics && typeof metrics === "object")
      .map(([, metrics]) => metrics);
  const total = emptyUserCountMetrics();
  for (const metrics of entries) {
    total[COUNT_TOTAL_GUEST_SESSIONS] += Number(metrics[COUNT_TOTAL_GUEST_SESSIONS] || 0);
    total[COUNT_TOTAL_ACCOUNTS_CREATED] += Number(metrics[COUNT_TOTAL_ACCOUNTS_CREATED] || 0);
    total[COUNT_TOTAL_SEARCHES_COMPLETED] += Number(metrics[COUNT_TOTAL_SEARCHES_COMPLETED] || 0);
    total[COUNT_USEFULNESS_SCORE_TOTAL] += Number(metrics[COUNT_USEFULNESS_SCORE_TOTAL] || 0);
    total[COUNT_USEFULNESS_RESPONSE_COUNT] += Number(metrics[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
  }
  const usefulnessResponses = Number(total[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
  total[COUNT_RECOMMENDATION_USEFULNESS] = usefulnessResponses
    ? Number((Number(total[COUNT_USEFULNESS_SCORE_TOTAL] || 0) / usefulnessResponses).toFixed(2))
    : 0;
  return total;
}

let userCountMetricsQueue = Promise.resolve();

function recordUserCountMetrics(increments = {}) {
  const run = async () => {
    const state = await loadUserCountState();
    const metrics = aggregateUserCountMetrics(state);
    for (const [key, value] of Object.entries(increments)) metrics[key] = Number(metrics[key] || 0) + Number(value || 0);
    const usefulnessResponses = Number(metrics[COUNT_USEFULNESS_RESPONSE_COUNT] || 0);
    metrics[COUNT_RECOMMENDATION_USEFULNESS] = usefulnessResponses
      ? Number((Number(metrics[COUNT_USEFULNESS_SCORE_TOTAL] || 0) / usefulnessResponses).toFixed(2))
      : 0;
    state.allTime = metrics;
    await saveUserCountState(state);
    return metrics;
  };
  userCountMetricsQueue = userCountMetricsQueue.then(run, run);
  return userCountMetricsQueue;
}

async function syncUserCountMetrics(metrics = null) {
  const webhook = process.env.USER_COUNT_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "USER_COUNT_SHEET_WEBHOOK_URL is not configured." };
  await userCountMetricsQueue.catch(() => {});
  const state = metrics ? null : await loadUserCountState();
  const allTimeMetrics = metrics || aggregateUserCountMetrics(state);
  const payload = {
    action: "record-user-count",
    spreadsheetId: USER_COUNT_SHEET_ID,
    sheetGid: USER_COUNT_SHEET_GID,
    metrics: userCountSheetMetrics(allTimeMetrics)
  };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authenticatedSheetPayload(payload)),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`User count sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "User count sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

function keywordText(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 50).join(", ");
}

function locatedKeywords(matches = []) {
  return [...new Set((Array.isArray(matches) ? matches : []).flatMap((match) => (match.explanation || []).map((reason) => String(reason.keyword || "").trim())).filter(Boolean))].slice(0, 50);
}

function errorLogPayload({ event, reason, user, topic = "", diagnosis = "", description = "", requestedCount = "", providedCount = "", highScoreCount = "", source = "", resource = null, primaryKeywords = [], confirmedKeywords = [], predictedKeywords = [], locatedKeywords: foundKeywords = [] }) {
  const at = new Date().toISOString();
  return {
    action: "log-resource-error",
    spreadsheetId: process.env.ERROR_SHEET_ID || "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0",
    sheetGid: process.env.ERROR_SHEET_GID || "1952899933",
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
    body: JSON.stringify(authenticatedSheetPayload(errorLogPayload(details))),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Error sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "Error sheet rejected the update.");
  return { synced: true, row: result.row || null };
}

function feedbackRecordPayload({ helpful, rating, details, user }) {
  return {
    action: "record-feedback",
    spreadsheetId: FEEDBACK_SHEET_ID,
    sheetGid: FEEDBACK_SHEET_GID,
    "Time Stamp": new Date().toISOString(),
    "Unique User ID (if applicable)": user?.guest ? "" : (user?.id || ""),
    "Email (if applicable)": user?.guest ? "" : (user?.email || ""),
    "Username (if applicable)": user?.name || "",
    Feedback: details,
    "Star(1-5)": rating,
    "Helpful / Nonhelpful": helpful ? "Helpful" : "Nonhelpful"
  };
}

async function syncFeedbackRecord(details) {
  const webhook = process.env.FEEDBACK_SHEET_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL || process.env.ERROR_SHEET_WEBHOOK_URL;
  if (!webhook) return { synced: false, reason: "FEEDBACK_SHEET_WEBHOOK_URL is not configured." };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authenticatedSheetPayload(feedbackRecordPayload(details))),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Feedback sheet webhook returned ${response.status}.`);
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch {}
  if (result.ok === false) throw new Error(result.error || "Feedback sheet rejected the update.");
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
    return sendJson(res, 200, { ok: true, storage: "local-json", persistentSessions: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), sheetWebhookSecretConfigured: Boolean(process.env.SHEET_WEBHOOK_SECRET), userSheetConfigured: Boolean(process.env.USER_SHEET_WEBHOOK_URL && process.env.SHEET_WEBHOOK_SECRET), errorSheetConfigured: Boolean(process.env.ERROR_SHEET_WEBHOOK_URL && process.env.SHEET_WEBHOOK_SECRET), feedbackSheetConfigured: Boolean((process.env.FEEDBACK_SHEET_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL || process.env.ERROR_SHEET_WEBHOOK_URL) && process.env.SHEET_WEBHOOK_SECRET), passwordEmailConfigured: Boolean((process.env.PASSWORD_EMAIL_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL) && process.env.SHEET_WEBHOOK_SECRET), passwordEmailUsesUserSheetWebhook: !process.env.PASSWORD_EMAIL_WEBHOOK_URL && Boolean(process.env.USER_SHEET_WEBHOOK_URL), passwordEmailSender: process.env.PASSWORD_EMAIL_FROM_ADDRESS || "" });
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
    const deliveryAvailable = Boolean((process.env.PASSWORD_EMAIL_WEBHOOK_URL || process.env.USER_SHEET_WEBHOOK_URL) && process.env.SHEET_WEBHOOK_SECRET);
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
    let delivered = false;
    try {
      delivered = await sendPasswordResetEmail(normalizedEmail, code);
    } catch (error) {
      await savePasswordResets(resets.filter((item) => item.email !== normalizedEmail));
      console.error("Password reset email failed:", error.message);
      return sendError(res, 502, "The verification email could not be sent. Please try again later or ask the site administrator for help.");
    }
    if (!delivered) {
      await savePasswordResets(resets.filter((item) => item.email !== normalizedEmail));
      return sendError(res, 503, "Email delivery is not configured yet. Please ask the site administrator for help.");
    }
    return sendJson(res, 202, { ...generic, delivered });
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
    const normalizedEmail = email.toLowerCase();
    const configuredAdmins = [DEFAULT_ADMIN_EMAIL, ...String(process.env.ADMIN_EMAILS || "").split(",")].map((item) => item.trim().toLowerCase()).filter(Boolean);
    const user = { id: randomBytes(12).toString("hex"), name: name.trim(), email: normalizedEmail, passwordHash: hashPassword(password), surveyCompleted: false, onboardingCompleted: false, profile: null, history: [], feedback: "", likedResources: [], dislikedResources: [], isAdmin: configuredAdmins.includes(normalizedEmail), createdAt: new Date().toISOString() };
    users.push(user);
    await saveUsers(users);
    let sync = { synced: false, reason: "USER_SHEET_WEBHOOK_URL is not configured." };
    try { sync = await syncUserRecord(user); } catch (error) { sync = { synced: false, reason: error.message }; }
    const cookie = await setSession(user.id);
    recordUserCountMetrics({ [COUNT_TOTAL_ACCOUNTS_CREATED]: 1 }).catch((error) => console.warn(`User count update failed: ${error.message}`));
    return sendJson(res, 201, { user: safeUser(user), sync }, { "Set-Cookie": cookie });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const { email, password } = await readJsonBody(req);
    const users = await loadUsers();
    const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return sendError(res, 401, "Email or password is incorrect.");
    await ensureLocalAdmin(user);
    const cookie = await setSession(user.id);
    return sendJson(res, 200, { user: safeUser(user) }, { "Set-Cookie": cookie });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/guest") {
    recordUserCountMetrics({ [COUNT_TOTAL_GUEST_SESSIONS]: 1 }).catch((error) => console.warn(`User count update failed: ${error.message}`));
    return sendJson(res, 200, { user: guestUser() });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).capy_session;
    sessions.delete(sessionKey(token));
    await saveSessions();
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "capy_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await getSessionUser(req);
    return user ? sendJson(res, 200, { user: safeUser(await ensureLocalAdmin(user)) }) : sendError(res, 401, "Not signed in.");
  }

  if (req.method === "GET" && url.pathname === "/api/resources") {
    const data = await getResources(url.searchParams.get("refresh") === "1");
    return sendJson(res, 200, { resources: data.rows, source: data.source, warning: data.warning || null, updatedAt: new Date().toISOString() });
  }

  const publicDocumentMatch = url.pathname.match(/^\/api\/community\/public-documents\/([^/]+)$/);
  if (req.method === "GET" && publicDocumentMatch) {
    const community = await loadCommunity();
    const users = await loadUsers();
    const document = community.documents.find((item) => item.publicShareToken === decodeURIComponent(publicDocumentMatch[1]) && !item.trashedAt && (!item.permissionExpiresAt || new Date(item.permissionExpiresAt).getTime() > Date.now()));
    if (!document) return sendError(res, 404, "This document link is unavailable or has expired.");
    return sendJson(res, 200, {
      document: {
        id: document.id,
        ownerName: users.find((candidate) => candidate.id === document.ownerId)?.name || "Village member",
        kind: document.kind,
        title: document.title,
        content: document.content || {},
        settings: document.settings || {},
        publicPermission: document.publicPermission || "viewer",
        restrictions: document.restrictions || { download: false, copy: false, print: false },
        watermark: document.watermark || "",
        encrypted: Boolean(document.encrypted),
        updatedAt: document.updatedAt
      }
    });
  }

  const user = await ensureLocalAdmin(await getSessionUser(req) || (req.headers["x-village-guest"] === "1" ? guestUser() : null));
  if (!user) return sendError(res, 401, "Please sign in first.");

  if (req.method === "GET" && url.pathname === "/api/announcements") {
    const announcements = (await loadAnnouncements()).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100);
    return sendJson(res, 200, { announcements, isAdmin: Boolean(user.isAdmin) });
  }
  if (req.method === "GET" && url.pathname === "/api/activities") {
    return sendJson(res, 200, { activities: await loadActivities(), isAdmin: Boolean(user.isAdmin) });
  }
  if (req.method === "POST" && url.pathname === "/api/activities") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    let input;
    try { input = activityInput(await readJsonBody(req)); } catch (error) { return sendError(res, 400, error.message); }
    const now = new Date().toISOString();
    const activity = { id: randomBytes(12).toString("hex"), ...input, createdBy: user.id, createdAt: now, updatedAt: now };
    const activities = await loadActivities(); activities.push(activity); await saveActivities(activities);
    return sendJson(res, 201, { activity });
  }
  const activityDelete = url.pathname.match(/^\/api\/activities\/([^/]+)$/);
  if (req.method === "DELETE" && activityDelete) {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const activities = await loadActivities();
    const next = activities.filter((item) => item.id !== decodeURIComponent(activityDelete[1]));
    if (next.length === activities.length) return sendError(res, 404, "Activity not found.");
    await saveActivities(next); return sendJson(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/announcements") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    let input;
    try { input = announcementInput(await readJsonBody(req)); } catch (error) { return sendError(res, 400, error.message); }
    const now = new Date().toISOString();
    const announcement = { id: randomBytes(12).toString("hex"), ...input, authorName: user.name, createdAt: now, updatedAt: now };
    const announcements = await loadAnnouncements(); announcements.push(announcement); await saveAnnouncements(announcements);
    return sendJson(res, 201, { announcement });
  }
  const announcementDelete = url.pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (req.method === "PATCH" && announcementDelete) {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    let input;
    try { input = announcementInput(await readJsonBody(req)); } catch (error) { return sendError(res, 400, error.message); }
    const id = decodeURIComponent(announcementDelete[1]); const announcements = await loadAnnouncements(); const announcement = announcements.find((item) => item.id === id);
    if (!announcement) return sendError(res, 404, "Announcement not found.");
    Object.assign(announcement, input, { updatedAt: new Date().toISOString() }); await saveAnnouncements(announcements);
    return sendJson(res, 200, { announcement });
  }
  if (req.method === "DELETE" && announcementDelete) {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const announcements = await loadAnnouncements();
    const next = announcements.filter((item) => item.id !== decodeURIComponent(announcementDelete[1]));
    if (next.length === announcements.length) return sendError(res, 404, "Announcement not found.");
    await saveAnnouncements(next); return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    return sendJson(res, 200, { users: (await loadUsers()).filter((item) => item.isAdmin).map((item) => ({ id: item.id, name: item.name, email: item.email, isAdmin: true, isOwner: item.email.toLowerCase() === DEFAULT_ADMIN_EMAIL })).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  if (req.method === "POST" && url.pathname === "/api/admin/users") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const email = String((await readJsonBody(req)).email || "").trim().toLowerCase();
    const users = await loadUsers(); const target = users.find((item) => item.email.toLowerCase() === email);
    if (!target) return sendError(res, 404, "No registered account uses that email.");
    target.isAdmin = true; target.updatedAt = new Date().toISOString(); await saveUsers(users);
    return sendJson(res, 200, { user: { id: target.id, name: target.name, email: target.email, isAdmin: true } });
  }
  if (req.method === "GET" && url.pathname === "/api/admin/primary-keyword-blocklist") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    return sendJson(res, 200, { keywords: await loadPrimaryKeywordBlocklist() });
  }
  if (req.method === "PUT" && url.pathname === "/api/admin/primary-keyword-blocklist") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const input = await readJsonBody(req);
    const keywords = await savePrimaryKeywordBlocklist(input.keywords ?? input.text ?? "");
    return sendJson(res, 200, { keywords });
  }
  if (req.method === "GET" && url.pathname === "/api/admin/community-blocklist") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    return sendJson(res, 200, { terms: await loadCommunityBlocklist() });
  }
  if (req.method === "PUT" && url.pathname === "/api/admin/community-blocklist") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const input = await readJsonBody(req);
    return sendJson(res, 200, { terms: await saveCommunityBlocklist(input.terms ?? input.text ?? "") });
  }
  const adminDelete = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === "DELETE" && adminDelete) {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const targetId = decodeURIComponent(adminDelete[1]);
    if (targetId === user.id) return sendError(res, 400, "You cannot remove your own administrator access.");
    const users = await loadUsers(); const target = users.find((item) => item.id === targetId);
    if (!target) return sendError(res, 404, "User not found.");
    const protectedEmails = [DEFAULT_ADMIN_EMAIL, ...String(process.env.ADMIN_EMAILS || "").split(",")].map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (protectedEmails.includes(target.email.toLowerCase())) return sendError(res, 400, "A configured village owner cannot be removed.");
    target.isAdmin = false; target.updatedAt = new Date().toISOString(); await saveUsers(users);
    return sendJson(res, 200, { ok: true });
  }
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
    community.profiles[user.id] = {
      ...existing,
      enabled: Boolean(input.enabled),
      displayName,
      notificationsEnabled: input.notificationsEnabled !== false,
      discoverable: input.discoverable !== false,
      directMessagesEnabled: input.directMessagesEnabled !== false,
      locationSharingEnabled: input.locationSharingEnabled === true,
      momentTheme: input.momentTheme === "dark" ? "dark" : "light",
      allowStrangerRequests: input.allowStrangerRequests !== false,
      allowStrangerMoments: input.allowStrangerMoments === true,
      momentVisibilityDays: Math.max(1, Math.min(3650, Number(input.momentVisibilityDays || 30))),
      updatedAt: new Date().toISOString()
    };
    await saveCommunity(community);
    return sendJson(res, 200, await localCommunityOverview(user, community));
  }

  if (req.method === "PUT" && url.pathname === "/api/community/avatar") {
    let avatarDataUrl;
    try { avatarDataUrl = safeImageDataUrl((await readJsonBody(req)).imageDataUrl); }
    catch (error) { return sendError(res, 400, error.message); }
    const users = await loadUsers();
    const stored = users.find((candidate) => candidate.id === user.id);
    if (!stored) return sendError(res, 404, "User not found.");
    stored.avatarDataUrl = avatarDataUrl || "";
    stored.updatedAt = new Date().toISOString();
    await saveUsers(users);
    user.avatarDataUrl = stored.avatarDataUrl;
    return sendJson(res, 200, { user: safeUser(user), avatarDataUrl: stored.avatarDataUrl });
  }

  if (req.method === "PUT" && url.pathname === "/api/community/cover") {
    let coverImageDataUrl;
    try { coverImageDataUrl = safeImageDataUrl((await readJsonBody(req)).imageDataUrl); }
    catch (error) { return sendError(res, 400, error.message); }
    const community = await loadCommunity();
    community.profiles[user.id] = { ...(community.profiles[user.id] || {}), coverImageDataUrl: coverImageDataUrl || "", updatedAt: new Date().toISOString() };
    await saveCommunity(community);
    return sendJson(res, 200, { coverImageDataUrl: coverImageDataUrl || "" });
  }

  if (req.method === "GET" && url.pathname === "/api/community/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
    if (query.length < 2) return sendJson(res, 200, { people: [] });
    const [community, users] = await Promise.all([loadCommunity(), loadUsers()]);
    const people = users.filter((candidate) => candidate.id !== user.id && community.profiles[candidate.id]?.enabled && community.profiles[candidate.id]?.discoverable !== false && !localBlocked(community, user.id, candidate.id))
      .map((candidate) => {
        const connection = community.connections.find((item) => item.pairKey === pairKey(user.id, candidate.id));
        const relationship = connection?.status === "accepted" ? "friend" : connection?.status === "pending" ? (connection.requesterId === user.id ? "outgoing" : "incoming") : "none";
        return { user_id: candidate.id, email: candidate.email, avatar_data_url: candidate.avatarDataUrl || "", display_name: community.profiles[candidate.id]?.displayName || candidate.name, relationship, connection_id: connection?.id || null };
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
    memberIds.forEach((memberId) => localNotification(community, memberId, "group-invite", "Village group invitation", `${community.profiles[user.id]?.displayName || user.name} invited you to ${room.name}`, { roomId: room.id, inviterId: user.id }));
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
      const targetUserId = String(url.searchParams.get("userId") || "");
      if (targetUserId && targetUserId !== user.id) {
        const targetProfile = community.profiles[targetUserId];
        if (!targetProfile?.enabled || localBlocked(community, user.id, targetUserId) || (!localFriends(community, user.id, targetUserId) && !targetProfile.allowStrangerMoments)) return sendError(res, 403, "This member's Moments are private.");
      }
      const posts = community.posts.filter((post) => {
        if (targetUserId && post.userId !== targetUserId) return false;
        if (post.userId === user.id) return true;
        const profile = community.profiles[post.userId];
        if ((!localFriends(community, user.id, post.userId) && !profile?.allowStrangerMoments) || localBlocked(community, user.id, post.userId)) return false;
        if (new Date(post.createdAt).getTime() < Date.now() - Math.max(1, Number(profile?.momentVisibilityDays || 30)) * 86400000) return false;
        return (!post.allowedUserIds?.length || post.allowedUserIds.includes(user.id)) && !post.deniedUserIds?.includes(user.id);
      }).slice(-100).reverse().map((post) => {
        const account = users.find((candidate) => candidate.id === post.userId);
        return {
          ...post,
          author: community.profiles[post.userId]?.displayName || account?.name || "Village member",
          avatarDataUrl: account?.avatarDataUrl || "",
          comments: community.postComments.filter((comment) => comment.postId === post.id).map((comment) => {
            const author = users.find((candidate) => candidate.id === comment.userId);
            return { ...comment, author: community.profiles[comment.userId]?.displayName || author?.name || "Village member", avatarDataUrl: author?.avatarDataUrl || "", mine: comment.userId === user.id };
          }),
          mine: post.userId === user.id,
          allowedUserIds: post.userId === user.id ? post.allowedUserIds : undefined,
          deniedUserIds: post.userId === user.id ? post.deniedUserIds : undefined
        };
      });
      const profileUserId = targetUserId || user.id;
      const profileAccount = users.find((candidate) => candidate.id === profileUserId);
      const profile = community.profiles[profileUserId];
      return sendJson(res, 200, {
        posts,
        profile: profileAccount && profile ? {
          userId: profileUserId,
          displayName: profile.displayName || profileAccount.name,
          avatarDataUrl: profileAccount.avatarDataUrl || "",
          coverImageDataUrl: profile.coverImageDataUrl || "",
          momentTheme: profile.momentTheme || "light",
          mine: profileUserId === user.id
        } : null
      });
    }
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      const postBody = (await maskLocalCommunityMessage(String(input.text || "").trim().slice(0, 2000))).trim();
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); } catch (error) { return sendError(res, 400, error.message); }
      if (!postBody && !imageDataUrl) return sendError(res, 400, "Add text or an image first.");
      const allowedUserIds = [...new Set((Array.isArray(input.allowedUserIds) ? input.allowedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      const deniedUserIds = [...new Set((Array.isArray(input.deniedUserIds) ? input.deniedUserIds : []).map(String))].filter((id) => id !== user.id).slice(0, 100);
      if ([...allowedUserIds, ...deniedUserIds].some((targetId) => !localFriends(community, user.id, targetId) || localBlocked(community, user.id, targetId))) return sendError(res, 403, "Post visibility can include accepted, unblocked friends only.");
      const post = { id: randomBytes(12).toString("hex"), userId: user.id, body: postBody, imageDataUrl, allowedUserIds, deniedUserIds, createdAt: new Date().toISOString() };
      community.posts.push(post);
      community.posts = community.posts.slice(-1000);
      community.connections.filter((connection) => connection.status === "accepted" && (connection.requesterId === user.id || connection.recipientId === user.id)).forEach((connection) => {
        const recipientId = connection.requesterId === user.id ? connection.recipientId : connection.requesterId;
        if ((allowedUserIds.length && !allowedUserIds.includes(recipientId)) || deniedUserIds.includes(recipientId)) return;
        localNotification(community, recipientId, "moment", "New Moment", `${community.profiles[user.id]?.displayName || user.name} shared a new Moment`, { postId: post.id, userId: user.id });
      });
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

  const postCommentMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments(?:\/([^/]+))?$/);
  if (postCommentMatch) {
    const community = await loadCommunity();
    const postId = decodeURIComponent(postCommentMatch[1]);
    const commentId = postCommentMatch[2] ? decodeURIComponent(postCommentMatch[2]) : "";
    const post = community.posts.find((item) => item.id === postId);
    if (!post) return sendError(res, 404, "This Moment is unavailable.");
    const visible = post.userId === user.id || ((!post.allowedUserIds?.length || post.allowedUserIds.includes(user.id)) && !post.deniedUserIds?.includes(user.id) && !localBlocked(community, user.id, post.userId) && (localFriends(community, user.id, post.userId) || community.profiles[post.userId]?.allowStrangerMoments));
    if (!visible) return sendError(res, 404, "This Moment is unavailable.");
    if (req.method === "POST" && !commentId) {
      const input = await readJsonBody(req);
      const commentBody = (await maskLocalCommunityMessage(String(input.text || "").trim().slice(0, 1000))).trim();
      let imageDataUrl;
      let stickerDataUrl;
      try {
        imageDataUrl = safeImageDataUrl(input.imageDataUrl);
        stickerDataUrl = safeImageDataUrl(input.stickerDataUrl);
      } catch (error) { return sendError(res, 400, error.message); }
      if (!commentBody && !imageDataUrl && !stickerDataUrl) return sendError(res, 400, "Write a comment or add an image.");
      const comment = { id: randomBytes(12).toString("hex"), postId, userId: user.id, body: commentBody, imageDataUrl, stickerDataUrl, createdAt: new Date().toISOString(), mine: true };
      community.postComments.push(comment);
      if (post.userId !== user.id) localNotification(community, post.userId, "moment-comment", "New Moment comment", `${community.profiles[user.id]?.displayName || user.name} commented on your Moment`, { postId, commentId: comment.id });
      await saveCommunity(community);
      return sendJson(res, 201, { comment: { ...comment, author: community.profiles[user.id]?.displayName || user.name, avatarDataUrl: user.avatarDataUrl || "" } });
    }
    if (req.method === "DELETE" && commentId) {
      const comment = community.postComments.find((item) => item.id === commentId && item.postId === postId);
      if (!comment || (comment.userId !== user.id && post.userId !== user.id)) return sendError(res, 404, "Comment not found.");
      community.postComments = community.postComments.filter((item) => item.id !== commentId);
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/community/stickers") {
    const community = await loadCommunity();
    if (req.method === "GET") return sendJson(res, 200, { stickers: community.stickers.filter((item) => item.ownerId === user.id).slice(-100).reverse() });
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      let imageDataUrl;
      try { imageDataUrl = safeImageDataUrl(input.imageDataUrl); } catch (error) { return sendError(res, 400, error.message); }
      if (!imageDataUrl) return sendError(res, 400, "Choose an image for this sticker.");
      const existing = community.stickers.find((item) => item.ownerId === user.id && item.imageDataUrl === imageDataUrl);
      if (existing) return sendJson(res, 200, { sticker: existing, saved: false });
      const sticker = { id: randomBytes(12).toString("hex"), ownerId: user.id, name: String(input.name || "Custom sticker").trim().slice(0, 60) || "Custom sticker", imageDataUrl, createdAt: new Date().toISOString() };
      community.stickers.push(sticker);
      await saveCommunity(community);
      return sendJson(res, 201, { sticker, saved: true });
    }
  }

  const stickerDeleteMatch = url.pathname.match(/^\/api\/community\/stickers\/([^/]+)$/);
  if (req.method === "DELETE" && stickerDeleteMatch) {
    const community = await loadCommunity();
    const before = community.stickers.length;
    community.stickers = community.stickers.filter((item) => item.id !== decodeURIComponent(stickerDeleteMatch[1]) || item.ownerId !== user.id);
    if (community.stickers.length === before) return sendError(res, 404, "Sticker not found.");
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  const communityProfileMatch = url.pathname.match(/^\/api\/community\/profiles\/([^/]+)$/);
  if (req.method === "GET" && communityProfileMatch) {
    const targetUserId = decodeURIComponent(communityProfileMatch[1]);
    const [community, users] = await Promise.all([loadCommunity(), loadUsers()]);
    const target = users.find((candidate) => candidate.id === targetUserId);
    const profile = community.profiles[targetUserId];
    if (!target || !profile?.enabled || localBlocked(community, user.id, targetUserId)) return sendError(res, 404, "Community member not found.");
    const friend = targetUserId === user.id || localFriends(community, user.id, targetUserId);
    if (!friend && !profile.allowStrangerMoments) return sendError(res, 403, "This member's Moments are private.");
    return sendJson(res, 200, { profile: { userId: targetUserId, displayName: profile.displayName || target.name, avatarDataUrl: target.avatarDataUrl || "", coverImageDataUrl: profile.coverImageDataUrl || "", momentTheme: profile.momentTheme || "light", momentVisibilityDays: Number(profile.momentVisibilityDays || 30), friend, mine: targetUserId === user.id } });
  }

  if (req.method === "GET" && url.pathname === "/api/community/notifications") {
    const community = await loadCommunity();
    const unreadOnly = url.searchParams.get("unread") === "true";
    const notifications = community.notifications.filter((item) => item.userId === user.id && (!unreadOnly || !item.readAt)).slice(-100).reverse().map((item) => ({ id: item.id, kind: item.kind, title: item.title, body: item.body, metadata: item.metadata || {}, read: Boolean(item.readAt), createdAt: item.createdAt }));
    return sendJson(res, 200, { notifications });
  }

  if (req.method === "POST" && url.pathname === "/api/community/notifications/read") {
    const input = await readJsonBody(req);
    const ids = new Set((Array.isArray(input.ids) ? input.ids : []).map(String));
    const kinds = new Set((Array.isArray(input.kinds) ? input.kinds : []).map(String));
    const community = await loadCommunity();
    const at = new Date().toISOString();
    community.notifications.forEach((item) => {
      if (item.userId !== user.id || item.readAt) return;
      if (!ids.size && !kinds.size || ids.has(item.id) || kinds.has(item.kind)) item.readAt = at;
    });
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  const messageActionMatch = url.pathname.match(/^\/api\/community\/messages\/([^/]+)\/(save|report)$/);
  if (messageActionMatch) {
    const community = await loadCommunity();
    const messageId = decodeURIComponent(messageActionMatch[1]);
    const action = messageActionMatch[2];
    const message = community.messages.find((item) => item.id === messageId && community.members.some((member) => member.roomId === item.roomId && member.userId === user.id));
    if (!message) return sendError(res, 404, "Message not found.");
    if (action === "save" && ["POST", "DELETE"].includes(req.method)) {
      if (req.method === "DELETE") community.savedMessages = community.savedMessages.filter((item) => item.userId !== user.id || item.messageId !== messageId);
      else if (!community.savedMessages.some((item) => item.userId === user.id && item.messageId === messageId)) community.savedMessages.push({ userId: user.id, messageId, savedAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, saved: req.method === "POST" });
    }
    if (action === "report" && req.method === "POST") {
      const report = { id: randomBytes(12).toString("hex"), reporterId: user.id, messageId, reportedUserId: message.userId, reason: String((await readJsonBody(req)).reason || "Inappropriate or unsafe content").trim().slice(0, 500), status: "open", createdAt: new Date().toISOString() };
      community.reports.push(report);
      await saveCommunity(community);
      return sendJson(res, 201, { ok: true, reportId: report.id });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/community/saved") {
    const [community, users] = await Promise.all([loadCommunity(), loadUsers()]);
    const messages = community.savedMessages.filter((item) => item.userId === user.id).slice(-100).reverse().map((saved) => {
      const message = community.messages.find((item) => item.id === saved.messageId);
      const account = users.find((candidate) => candidate.id === message?.userId);
      return message ? { ...message, author: community.profiles[message.userId]?.displayName || account?.name || "Village member", avatarDataUrl: account?.avatarDataUrl || "", saved: true } : null;
    }).filter(Boolean);
    return sendJson(res, 200, { messages });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/community-reports") {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const [community, users] = await Promise.all([loadCommunity(), loadUsers()]);
    return sendJson(res, 200, { reports: community.reports.slice(-200).reverse().map((report) => ({ id: report.id, status: report.status, reason: report.reason, reporterName: users.find((candidate) => candidate.id === report.reporterId)?.name || "", reportedName: users.find((candidate) => candidate.id === report.reportedUserId)?.name || "", messageBody: community.messages.find((item) => item.id === report.messageId)?.body || "", createdAt: report.createdAt })) });
  }

  const reportReviewMatch = url.pathname.match(/^\/api\/admin\/community-reports\/([^/]+)$/);
  if (req.method === "PATCH" && reportReviewMatch) {
    if (!user.isAdmin) return sendError(res, 403, "Administrator access is required.");
    const status = String((await readJsonBody(req)).status || "");
    if (!["reviewed", "dismissed"].includes(status)) return sendError(res, 400, "Choose reviewed or dismissed.");
    const community = await loadCommunity();
    const report = community.reports.find((item) => item.id === decodeURIComponent(reportReviewMatch[1]));
    if (!report) return sendError(res, 404, "Report not found.");
    report.status = status;
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === "/api/community/document-folders") {
    const community = await loadCommunity();
    if (req.method === "GET") {
      return sendJson(res, 200, {
        folders: community.documentFolders.filter((folder) => folder.ownerId === user.id).map((folder) => ({
          ...folder,
          documentCount: community.documents.filter((document) => document.ownerId === user.id && document.folderId === folder.id && !document.trashedAt).length
        }))
      });
    }
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      const name = String(input.name || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 80);
      if (!name) return sendError(res, 400, "Add a folder name.");
      const at = new Date().toISOString();
      const folder = { id: randomBytes(12).toString("hex"), ownerId: user.id, parentId: String(input.parentId || ""), name, documentCount: 0, createdAt: at, updatedAt: at };
      community.documentFolders.push(folder);
      await saveCommunity(community);
      return sendJson(res, 201, { folder });
    }
  }

  const documentFolderMatch = url.pathname.match(/^\/api\/community\/document-folders\/([^/]+)$/);
  if (documentFolderMatch) {
    const community = await loadCommunity();
    const folderId = decodeURIComponent(documentFolderMatch[1]);
    const folder = community.documentFolders.find((item) => item.id === folderId && item.ownerId === user.id);
    if (!folder) return sendError(res, 404, "Folder not found.");
    if (req.method === "PATCH") {
      const input = await readJsonBody(req);
      folder.name = String(input.name || folder.name).trim().replace(/[<>\r\n]/g, " ").slice(0, 80);
      folder.parentId = input.parentId === undefined ? folder.parentId : String(input.parentId || "");
      folder.updatedAt = new Date().toISOString();
      await saveCommunity(community);
      return sendJson(res, 200, { folder });
    }
    if (req.method === "DELETE") {
      community.documents.forEach((document) => { if (document.folderId === folderId && document.ownerId === user.id) document.folderId = ""; });
      community.documentFolders = community.documentFolders.filter((item) => item.id !== folderId);
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/community/documents") {
    const community = await loadCommunity();
    const users = await loadUsers();
    if (req.method === "GET") {
      const view = String(url.searchParams.get("view") || "active");
      const folderId = String(url.searchParams.get("folderId") || "");
      const search = String(url.searchParams.get("search") || "").toLowerCase();
      const documents = community.documents
        .filter((document) => localDocumentPermission(community, document, user.id) !== "none")
        .filter((document) => view === "trash" ? Boolean(document.trashedAt) : !document.trashedAt)
        .filter((document) => view !== "favorites" || document.favorite)
        .filter((document) => !folderId || document.folderId === folderId)
        .filter((document) => !search || `${document.title} ${document.content?.plainText || ""}`.toLowerCase().includes(search))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 300)
        .map((document) => localDocumentDto(community, document, user, users));
      return sendJson(res, 200, { documents });
    }
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      const kind = ["doc", "pdf", "form"].includes(String(input.kind || "").toLowerCase()) ? String(input.kind).toLowerCase() : "doc";
      const title = String(input.title || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 180);
      const content = input.content && typeof input.content === "object" ? input.content : {};
      const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
      if (!title) return sendError(res, 400, "Add a document title.");
      if (JSON.stringify(content).length > 900000) return sendError(res, 400, "This Village document is too large.");
      const at = new Date().toISOString();
      const document = {
        id: randomBytes(12).toString("hex"), ownerId: user.id, kind, title, content, settings,
        folderId: String(input.folderId || ""), favorite: Boolean(input.favorite), trashedAt: null,
        templateKey: String(input.templateKey || ""), versionNumber: 1, publicShareToken: "",
        publicPermission: "viewer", permissionExpiresAt: "", restrictions: { download: false, copy: false, print: false },
        watermark: "", encrypted: false, createdAt: at, updatedAt: at
      };
      community.documents.push(document);
      community.documentVersions.push({ id: randomBytes(12).toString("hex"), documentId: document.id, versionNumber: 1, title, content, settings, changeSummary: "Document created", userId: user.id, createdAt: at });
      community.documentAudit.push({ id: randomBytes(8).toString("hex"), documentId: document.id, userId: user.id, action: "create", metadata: { templateKey: document.templateKey }, createdAt: at });
      await saveCommunity(community);
      return sendJson(res, 201, { document: localDocumentDto(community, document, user, users) });
    }
  }

  const documentMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)(?:\/(share|responses|workspace|metadata|versions|comments|presence|collaborators|share-link|audit|approvals|signatures|integrations|assist))?$/);
  if (documentMatch) {
    const documentId = decodeURIComponent(documentMatch[1]);
    const operation = documentMatch[2] || "";
    const community = await loadCommunity();
    const users = await loadUsers();
    const document = community.documents.find((item) => item.id === documentId);
    const permission = localDocumentPermission(community, document, user.id);
    if (!document || permission === "none") return sendError(res, 404, "Village document not found.");
    const canEdit = ["owner", "editor"].includes(permission);
    const canComment = ["owner", "editor", "commenter"].includes(permission);
    const dto = () => localDocumentDto(community, document, user, users);

    if (!operation && req.method === "GET") return sendJson(res, 200, { document: dto() });
    if (!operation && req.method === "PATCH") {
      if (!canEdit) return sendError(res, 403, "You need edit permission for this document.");
      const input = await readJsonBody(req);
      const title = String(input.title || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 180);
      const content = input.content && typeof input.content === "object" ? input.content : {};
      const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
      if (!title) return sendError(res, 400, "Add a document title.");
      const at = new Date().toISOString();
      Object.assign(document, { title, content, settings, updatedAt: at });
      if (document.ownerId === user.id) {
        document.folderId = String(input.folderId || document.folderId || "");
        document.favorite = Boolean(input.favorite);
        document.templateKey = String(input.templateKey || document.templateKey || "");
        const security = settings.security || {};
        document.restrictions = { download: Boolean(security.restrictDownload), copy: Boolean(security.restrictCopy), print: Boolean(security.restrictPrint) };
        document.watermark = String(security.watermark || "");
        document.encrypted = Boolean(security.encrypted);
      }
      if (input.createVersion) {
        document.versionNumber = Number(document.versionNumber || 1) + 1;
        community.documentVersions.push({ id: randomBytes(12).toString("hex"), documentId, versionNumber: document.versionNumber, title, content, settings, changeSummary: String(input.changeSummary || "Saved changes"), userId: user.id, createdAt: at });
      }
      community.documentAudit.push({ id: randomBytes(8).toString("hex"), documentId, userId: user.id, action: "edit", metadata: { autosave: !input.createVersion }, createdAt: at });
      await saveCommunity(community);
      return sendJson(res, 200, { document: dto() });
    }
    if (!operation && req.method === "DELETE") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the document owner can delete it.");
      if (url.searchParams.get("permanent") === "1") {
        community.documents = community.documents.filter((item) => item.id !== documentId);
        for (const key of ["documentShares", "documentCollaborators", "documentVersions", "documentComments", "documentPresence", "documentAudit", "documentApprovals", "documentSignatures", "documentIntegrations", "formResponses"]) {
          community[key] = community[key].filter((item) => item.documentId !== documentId);
        }
      } else {
        document.trashedAt = new Date().toISOString();
      }
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (operation === "metadata" && req.method === "PATCH") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the owner can organize this document.");
      const input = await readJsonBody(req);
      if (input.title !== undefined) document.title = String(input.title || "").trim().replace(/[<>\r\n]/g, " ").slice(0, 180);
      if (input.folderId !== undefined) document.folderId = String(input.folderId || "");
      if (input.favorite !== undefined) document.favorite = Boolean(input.favorite);
      if (input.trashed !== undefined) document.trashedAt = input.trashed ? new Date().toISOString() : null;
      document.updatedAt = new Date().toISOString();
      await saveCommunity(community);
      return sendJson(res, 200, { document: dto() });
    }
    if (operation === "workspace" && req.method === "GET") {
      const names = (id) => community.profiles[id]?.displayName || users.find((candidate) => candidate.id === id)?.name || "Village member";
      const collaborators = community.documentCollaborators.filter((item) => item.documentId === documentId).map((item) => ({ ...item, name: names(item.userId), email: users.find((candidate) => candidate.id === item.userId)?.email || "" }));
      return sendJson(res, 200, {
        document: dto(),
        versions: community.documentVersions.filter((item) => item.documentId === documentId).sort((a, b) => b.versionNumber - a.versionNumber).map((item) => ({ ...item, author: names(item.userId) })),
        comments: community.documentComments.filter((item) => item.documentId === documentId).map((item) => ({ ...item, author: names(item.userId), mentionedName: names(item.mentionedUserId), assignedName: names(item.assignedTo), mine: item.userId === user.id })),
        collaborators,
        presence: community.documentPresence.filter((item) => item.documentId === documentId && Date.now() - new Date(item.lastSeenAt).getTime() < 45000).map((item) => ({ ...item, name: names(item.userId), mine: item.userId === user.id })),
        approvals: community.documentApprovals.filter((item) => item.documentId === documentId).map((item) => ({ ...item, requesterName: names(item.requestedBy), reviewerName: names(item.reviewerId), mine: item.reviewerId === user.id })),
        signatures: community.documentSignatures.filter((item) => item.documentId === documentId).map((item) => ({ ...item, signerName: names(item.userId) })),
        integrations: document.ownerId === user.id ? community.documentIntegrations.filter((item) => item.documentId === documentId) : [],
        audit: document.ownerId === user.id ? community.documentAudit.filter((item) => item.documentId === documentId).map((item) => ({ ...item, actorName: names(item.userId) })) : [],
        responses: document.ownerId === user.id ? community.formResponses.filter((item) => item.documentId === documentId).map((item) => ({ ...item, author: names(item.userId) })) : [],
        permission
      });
    }
    if (operation === "share" && req.method === "POST") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the document owner can share it.");
      const roomId = String((await readJsonBody(req)).roomId || "");
      const room = community.rooms.find((item) => item.id === roomId);
      if (!room || !community.members.some((member) => member.roomId === roomId && member.userId === user.id)) return sendError(res, 403, "Choose a chat you belong to.");
      const at = new Date().toISOString();
      if (!community.documentShares.some((share) => share.documentId === documentId && share.roomId === roomId)) community.documentShares.push({ documentId, roomId, sharedBy: user.id, createdAt: at });
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: `Shared ${document.kind.toUpperCase()}: ${document.title}`, messageType: "document", metadata: { documentId, kind: document.kind, title: document.title }, createdAt: at };
      community.messages.push(message);
      notifyLocalRoom(community, roomId, user.id, room.kind === "direct" ? "document" : "group-document", room.name, `${community.profiles[user.id]?.displayName || user.name} shared ${document.title}`, { roomId, documentId, messageId: message.id });
      await saveCommunity(community);
      return sendJson(res, 201, { ok: true, roomId, messageId: message.id });
    }
    if (operation === "responses" && req.method === "POST") {
      if (document.kind !== "form") return sendError(res, 400, "Responses are available for forms only.");
      const response = (await readJsonBody(req)).response;
      const formResponse = { id: randomBytes(12).toString("hex"), documentId, userId: user.id, response: response && typeof response === "object" ? response : {}, createdAt: new Date().toISOString() };
      community.formResponses.push(formResponse);
      await saveCommunity(community);
      return sendJson(res, 201, { ok: true, responseId: formResponse.id });
    }
    if (operation === "responses" && req.method === "GET") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the form owner can review responses.");
      return sendJson(res, 200, { responses: community.formResponses.filter((item) => item.documentId === documentId).map((item) => ({ ...item, author: users.find((candidate) => candidate.id === item.userId)?.name || "Village member" })) });
    }
    if (operation === "versions" && req.method === "GET") {
      return sendJson(res, 200, { versions: community.documentVersions.filter((item) => item.documentId === documentId).sort((a, b) => b.versionNumber - a.versionNumber).map((item) => ({ ...item, author: users.find((candidate) => candidate.id === item.userId)?.name || "Village member" })) });
    }
    if (operation === "versions" && req.method === "POST") {
      if (!canEdit) return sendError(res, 403, "You need edit permission to create a version.");
      const input = await readJsonBody(req);
      const at = new Date().toISOString();
      document.versionNumber = Number(document.versionNumber || 1) + 1;
      document.updatedAt = at;
      const version = { id: randomBytes(12).toString("hex"), documentId, versionNumber: document.versionNumber, title: document.title, content: document.content, settings: document.settings, changeSummary: String(input.changeSummary || "Named version").slice(0, 240), userId: user.id, author: user.name, createdAt: at };
      community.documentVersions.push(version);
      await saveCommunity(community);
      return sendJson(res, 201, { version });
    }
    if (operation === "comments" && req.method === "GET") return sendJson(res, 200, { comments: community.documentComments.filter((item) => item.documentId === documentId) });
    if (operation === "comments" && req.method === "POST") {
      if (!canComment) return sendError(res, 403, "You need comment permission for this document.");
      const input = await readJsonBody(req);
      const text = String(input.body || "").trim().slice(0, 2500);
      if (!text) return sendError(res, 400, "Write a comment first.");
      const at = new Date().toISOString();
      const comment = { id: randomBytes(12).toString("hex"), documentId, userId: user.id, parentId: String(input.parentId || ""), anchorText: String(input.anchorText || "").slice(0, 500), body: text, author: user.name, mentionedUserId: String(input.mentionedUserId || ""), assignedTo: String(input.assignedTo || ""), status: "open", mine: true, createdAt: at, updatedAt: at };
      community.documentComments.push(comment);
      await saveCommunity(community);
      return sendJson(res, 201, { comment });
    }
    if (operation === "presence" && req.method === "GET") return sendJson(res, 200, { presence: community.documentPresence.filter((item) => item.documentId === documentId && Date.now() - new Date(item.lastSeenAt).getTime() < 45000) });
    if (operation === "presence" && req.method === "POST") {
      const input = await readJsonBody(req);
      const sessionId = String(input.sessionId || "").slice(0, 80);
      if (!sessionId) return sendError(res, 400, "Presence session is missing.");
      let presence = community.documentPresence.find((item) => item.documentId === documentId && item.userId === user.id && item.sessionId === sessionId);
      if (!presence) { presence = { documentId, userId: user.id, sessionId }; community.documentPresence.push(presence); }
      Object.assign(presence, { cursor: input.cursor || {}, name: user.name, lastSeenAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, lastSeenAt: presence.lastSeenAt });
    }
    if (operation === "presence" && req.method === "DELETE") {
      const sessionId = String(url.searchParams.get("sessionId") || "");
      community.documentPresence = community.documentPresence.filter((item) => item.documentId !== documentId || item.userId !== user.id || (sessionId && item.sessionId !== sessionId));
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (operation === "collaborators" && req.method === "POST") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the owner can invite collaborators.");
      const input = await readJsonBody(req);
      const account = users.find((candidate) => input.userId ? candidate.id === String(input.userId) : candidate.email.toLowerCase() === String(input.email || "").toLowerCase());
      if (!account || account.id === user.id) return sendError(res, 400, "Choose another registered Village member.");
      const permissionValue = ["viewer", "commenter", "editor"].includes(input.permission) ? input.permission : "viewer";
      const at = new Date().toISOString();
      let collaborator = community.documentCollaborators.find((item) => item.documentId === documentId && item.userId === account.id);
      if (!collaborator) { collaborator = { documentId, userId: account.id, createdAt: at }; community.documentCollaborators.push(collaborator); }
      Object.assign(collaborator, { permission: permissionValue, expiresAt: String(input.expiresAt || ""), updatedAt: at });
      await saveCommunity(community);
      return sendJson(res, 201, { collaborator: { ...collaborator, name: account.name, email: account.email } });
    }
    if (operation === "collaborators" && req.method === "DELETE") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the owner can remove collaborators.");
      community.documentCollaborators = community.documentCollaborators.filter((item) => item.documentId !== documentId || item.userId !== url.searchParams.get("userId"));
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (operation === "share-link" && req.method === "POST") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the owner can manage the share link.");
      const input = await readJsonBody(req);
      document.publicShareToken = input.enabled === false ? "" : document.publicShareToken || randomBytes(24).toString("hex");
      document.publicPermission = ["viewer", "commenter", "editor"].includes(input.permission) ? input.permission : "viewer";
      document.permissionExpiresAt = String(input.expiresAt || "");
      document.restrictions = { download: Boolean(input.restrictDownload), copy: Boolean(input.restrictCopy), print: Boolean(input.restrictPrint) };
      document.watermark = String(input.watermark || "").slice(0, 120);
      await saveCommunity(community);
      return sendJson(res, 200, { enabled: Boolean(document.publicShareToken), token: document.publicShareToken, permission: document.publicPermission, expiresAt: document.permissionExpiresAt, restrictions: document.restrictions, watermark: document.watermark });
    }
    if (operation === "approvals" && req.method === "POST") {
      if (!canEdit) return sendError(res, 403, "You need edit permission to request approval.");
      const input = await readJsonBody(req);
      const reviewer = users.find((candidate) => input.reviewerId ? candidate.id === String(input.reviewerId) : candidate.email.toLowerCase() === String(input.email || "").toLowerCase());
      if (!reviewer || reviewer.id === user.id) return sendError(res, 400, "Choose another registered reviewer.");
      const at = new Date().toISOString();
      if (!community.documentCollaborators.some((item) => item.documentId === documentId && item.userId === reviewer.id)) community.documentCollaborators.push({ documentId, userId: reviewer.id, permission: "viewer", expiresAt: "", createdAt: at, updatedAt: at });
      const approval = { id: randomBytes(12).toString("hex"), documentId, requestedBy: user.id, requesterName: user.name, reviewerId: reviewer.id, reviewerName: reviewer.name, status: "pending", note: String(input.note || "").slice(0, 1000), mine: false, createdAt: at, updatedAt: at };
      community.documentApprovals.push(approval);
      await saveCommunity(community);
      return sendJson(res, 201, { approval });
    }
    if (operation === "signatures" && req.method === "POST") {
      const input = await readJsonBody(req);
      const signature = { id: randomBytes(12).toString("hex"), documentId, userId: user.id, signerName: user.name, signatureText: String(input.signatureText || user.name).slice(0, 160), signatureDataUrl: "", createdAt: new Date().toISOString() };
      community.documentSignatures.unshift(signature);
      await saveCommunity(community);
      return sendJson(res, 201, { signature });
    }
    if (operation === "integrations" && req.method === "POST") {
      if (document.ownerId !== user.id) return sendError(res, 403, "Only the owner can manage integrations.");
      const input = await readJsonBody(req);
      const integration = { id: randomBytes(12).toString("hex"), documentId, name: String(input.name || "").slice(0, 80), type: input.type || "link", config: input.config || {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      community.documentIntegrations.unshift(integration);
      await saveCommunity(community);
      return sendJson(res, 201, { integration });
    }
    if (operation === "integrations" && req.method === "DELETE") {
      community.documentIntegrations = community.documentIntegrations.filter((item) => item.id !== url.searchParams.get("id"));
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (operation === "audit" && req.method === "GET") return sendJson(res, 200, { audit: document.ownerId === user.id ? community.documentAudit.filter((item) => item.documentId === documentId) : [] });
    if (operation === "assist" && req.method === "POST") {
      const input = await readJsonBody(req);
      const text = String(input.text || "").trim();
      if (!text) return sendError(res, 400, "Select or write some text first.");
      const result = input.action === "summarize" ? text.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ") : text;
      return sendJson(res, 200, { text: result });
    }
  }

  const documentCommentMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/comments\/([^/]+)$/);
  if (documentCommentMatch) {
    const community = await loadCommunity();
    const document = community.documents.find((item) => item.id === decodeURIComponent(documentCommentMatch[1]));
    const comment = community.documentComments.find((item) => item.id === decodeURIComponent(documentCommentMatch[2]));
    if (!document || !comment || localDocumentPermission(community, document, user.id) === "none") return sendError(res, 404, "Comment not found.");
    if (req.method === "PATCH") {
      if (comment.userId !== user.id && document.ownerId !== user.id) return sendError(res, 403, "Only the comment author or document owner can update it.");
      const input = await readJsonBody(req);
      if (input.body !== undefined) comment.body = String(input.body || "").slice(0, 2500);
      comment.status = input.status === "resolved" ? "resolved" : "open";
      comment.updatedAt = new Date().toISOString();
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, status: comment.status, body: comment.body, updatedAt: comment.updatedAt });
    }
  }

  const documentVersionRestoreMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/versions\/([^/]+)\/restore$/);
  if (req.method === "POST" && documentVersionRestoreMatch) {
    const community = await loadCommunity();
    const documentId = decodeURIComponent(documentVersionRestoreMatch[1]);
    const document = community.documents.find((item) => item.id === documentId);
    const version = community.documentVersions.find((item) => item.id === decodeURIComponent(documentVersionRestoreMatch[2]) && item.documentId === documentId);
    if (!document || !version || !["owner", "editor"].includes(localDocumentPermission(community, document, user.id))) return sendError(res, 404, "Version not found.");
    Object.assign(document, { title: version.title, content: version.content, settings: version.settings, versionNumber: Number(document.versionNumber || 1) + 1, updatedAt: new Date().toISOString() });
    await saveCommunity(community);
    return sendJson(res, 200, { document: localDocumentDto(community, document, user, await loadUsers()) });
  }

  const documentApprovalMatch = url.pathname.match(/^\/api\/community\/documents\/([^/]+)\/approvals\/([^/]+)$/);
  if (req.method === "PATCH" && documentApprovalMatch) {
    const community = await loadCommunity();
    const document = community.documents.find((item) => item.id === decodeURIComponent(documentApprovalMatch[1]));
    const approval = community.documentApprovals.find((item) => item.id === decodeURIComponent(documentApprovalMatch[2]));
    if (!document || !approval || (approval.reviewerId !== user.id && document.ownerId !== user.id)) return sendError(res, 404, "Approval request not found.");
    const input = await readJsonBody(req);
    approval.status = ["approved", "changes_requested", "cancelled"].includes(input.status) ? input.status : "pending";
    approval.note = String(input.note || approval.note || "").slice(0, 1000);
    approval.updatedAt = new Date().toISOString();
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true, status: approval.status, note: approval.note, updatedAt: approval.updatedAt });
  }

  if (url.pathname === "/api/community/meetings") {
    const community = await loadCommunity();
    if (req.method === "GET") {
      const roomId = String(url.searchParams.get("roomId") || "");
      if (!community.members.some((member) => member.roomId === roomId && member.userId === user.id)) return sendError(res, 403, "Choose a chat you belong to.");
      return sendJson(res, 200, { meetings: community.meetings.filter((meeting) => meeting.roomId === roomId).slice().sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))).slice(0, 50) });
    }
    if (req.method === "POST") {
      const input = await readJsonBody(req);
      const roomId = String(input.roomId || "");
      const room = community.rooms.find((item) => item.id === roomId);
      if (!room || !community.members.some((member) => member.roomId === roomId && member.userId === user.id)) return sendError(res, 403, "Choose a chat you belong to.");
      const startsAt = new Date(input.startsAt || Date.now());
      if (!Number.isFinite(startsAt.getTime())) return sendError(res, 400, "Choose a valid meeting date and time.");
      const at = new Date().toISOString();
      const meeting = { id: randomBytes(12).toString("hex"), roomId, hostId: user.id, title: String(input.title || "Village meeting").trim().slice(0, 120) || "Village meeting", startsAt: startsAt.toISOString(), durationMinutes: Math.max(10, Math.min(480, Number(input.durationMinutes || 45))), status: "scheduled", settings: meetingSettings(input.settings), createdAt: at, updatedAt: at };
      community.meetings.push(meeting);
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: `Meeting: ${meeting.title}`, messageType: "meeting", metadata: { meetingId: meeting.id, title: meeting.title, startsAt: meeting.startsAt, durationMinutes: meeting.durationMinutes }, createdAt: at };
      community.messages.push(message);
      notifyLocalRoom(community, roomId, user.id, "meeting", meeting.title, `${community.profiles[user.id]?.displayName || user.name} scheduled a village meeting`, { roomId, meetingId: meeting.id, startsAt: meeting.startsAt });
      await saveCommunity(community);
      return sendJson(res, 201, { meeting, messageId: message.id });
    }
  }

  const meetingMatch = url.pathname.match(/^\/api\/community\/meetings\/([^/]+)(?:\/(join|signals|state|whiteboard|polls|messages|end))?$/);
  if (meetingMatch) {
    const community = await loadCommunity();
    const meetingId = decodeURIComponent(meetingMatch[1]);
    const operation = meetingMatch[2] || "";
    const meeting = community.meetings.find((item) => item.id === meetingId);
    if (!meeting || !community.members.some((member) => member.roomId === meeting.roomId && member.userId === user.id)) return sendError(res, 404, "Meeting not found.");
    if (!operation && req.method === "GET") {
      const users = await loadUsers();
      meeting.settings = meetingSettings(meeting.settings || {});
      const participants = community.meetingParticipants.filter((item) => item.meetingId === meetingId && !item.leftAt).map((participant) => {
        const account = users.find((candidate) => candidate.id === participant.userId);
        return { userId: participant.userId, displayName: community.profiles[participant.userId]?.displayName || account?.name || "Village member", avatarDataUrl: account?.avatarDataUrl || "", role: participant.role, raisedHand: Boolean(participant.raisedHand), breakoutRoom: participant.breakoutRoom || "", mine: participant.userId === user.id };
      });
      let changed = false;
      const polls = community.polls.filter((poll) => poll.meetingId === meetingId).map((poll) => {
        if ((poll.status || "active") === "active" && poll.endsAt && new Date(poll.endsAt).getTime() <= Date.now()) {
          poll.status = "closed";
          poll.closedAt = poll.closedAt || new Date().toISOString();
          changed = true;
        }
        const votes = {};
        const ballots = community.pollVotes.filter((vote) => vote.pollId === poll.id);
        ballots.forEach((vote) => {
          const indexes = Array.isArray(vote.optionIndexes) ? vote.optionIndexes : [vote.optionIndex];
          indexes.forEach((index) => { votes[index] = Number(votes[index] || 0) + 1; });
        });
        const anonymous = Boolean(poll.anonymous);
        const canSeeVoters = !anonymous && (meeting.hostId === user.id || participants.find((participant) => participant.userId === user.id)?.role === "cohost");
        return {
          id: poll.id,
          creatorId: poll.creatorId,
          question: poll.question,
          options: poll.options,
          status: poll.status || (poll.closedAt ? "closed" : "active"),
          closed: Boolean(poll.closedAt || poll.status === "closed"),
          multiple: Boolean(poll.multiple),
          anonymous,
          showLiveResults: poll.showLiveResults !== false,
          durationSeconds: Number(poll.durationSeconds || 0),
          startedAt: poll.startedAt || null,
          endsAt: poll.endsAt || null,
          closedAt: poll.closedAt || null,
          votes,
          totalVoters: ballots.length,
          participantCount: participants.length,
          mySelections: ballots.find((vote) => vote.userId === user.id)?.optionIndexes || (ballots.find((vote) => vote.userId === user.id) ? [ballots.find((vote) => vote.userId === user.id).optionIndex] : []),
          voters: canSeeVoters ? ballots.map((vote) => ({
            userId: vote.userId,
            displayName: community.profiles[vote.userId]?.displayName || users.find((candidate) => candidate.id === vote.userId)?.name || "Village member",
            optionIndexes: vote.optionIndexes || [vote.optionIndex]
          })) : [],
          createdAt: poll.createdAt
        };
      });
      if (changed) await saveCommunity(community);
      return sendJson(res, 200, { meeting, participants, polls });
    }
    if (operation === "join" && req.method === "POST") {
      if (["ended", "cancelled"].includes(meeting.status)) return sendError(res, 400, "This meeting has ended.");
      const at = new Date().toISOString();
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id);
      if (participant) Object.assign(participant, { lastSeenAt: at, leftAt: null });
      else community.meetingParticipants.push({ meetingId, userId: user.id, role: meeting.hostId === user.id ? "host" : "participant", raisedHand: false, breakoutRoom: "", joinedAt: at, lastSeenAt: at, leftAt: null });
      if (meeting.status === "scheduled") meeting.status = "live";
      meeting.updatedAt = at;
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, participantIds: community.meetingParticipants.filter((item) => item.meetingId === meetingId && item.userId !== user.id && !item.leftAt).map((item) => item.userId) });
    }
    if (operation === "join" && req.method === "DELETE") {
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id);
      if (participant) Object.assign(participant, { leftAt: new Date().toISOString(), raisedHand: false });
      community.meetingSignals.push({ id: randomBytes(12).toString("hex"), meetingId, senderId: user.id, recipientId: null, kind: "leave", payload: {}, createdAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true });
    }
    if (operation === "signals" && req.method === "GET") {
      const after = String(url.searchParams.get("after") || "");
      const signals = community.meetingSignals.filter((signal) => signal.meetingId === meetingId && signal.senderId !== user.id && (!signal.recipientId || signal.recipientId === user.id) && signal.createdAt > after).slice(-200);
      return sendJson(res, 200, { signals });
    }
    if (operation === "signals" && req.method === "POST") {
      const input = await readJsonBody(req);
      const kind = String(input.kind || "");
      if (!["offer", "answer", "candidate", "leave", "state"].includes(kind)) return sendError(res, 400, "Unsupported meeting signal.");
      const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
      if (JSON.stringify(payload).length > 30000) return sendError(res, 400, "Meeting signal is too large.");
      const signal = { id: randomBytes(12).toString("hex"), meetingId, senderId: user.id, recipientId: String(input.recipientId || "") || null, kind, payload, createdAt: new Date().toISOString() };
      community.meetingSignals.push(signal);
      community.meetingSignals = community.meetingSignals.filter((item) => new Date(item.createdAt).getTime() > Date.now() - 10 * 60_000);
      await saveCommunity(community);
      return sendJson(res, 201, { ok: true, createdAt: signal.createdAt });
    }
    if (operation === "state" && req.method === "PATCH") {
      const input = await readJsonBody(req);
      const actor = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id && !item.leftAt);
      const canHost = meeting.hostId === user.id || actor?.role === "cohost";
      if (input.settings && canHost) {
        meeting.settings = meetingSettings({ ...(meeting.settings || {}), ...input.settings });
        meeting.updatedAt = new Date().toISOString();
      }
      const targetId = meeting.hostId === user.id && input.userId ? String(input.userId) : user.id;
      if (input.remove === true && meeting.hostId === user.id && targetId !== user.id) {
        const target = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === targetId);
        if (target) Object.assign(target, { leftAt: new Date().toISOString(), raisedHand: false });
        await saveCommunity(community);
        return sendJson(res, 200, { ok: true, removed: targetId });
      }
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === targetId && !item.leftAt);
      if (!participant) return sendError(res, 404, "Participant is not in this meeting.");
      if (meeting.hostId === user.id && ["cohost", "participant"].includes(input.role)) participant.role = input.role;
      if (meeting.hostId === user.id && Object.prototype.hasOwnProperty.call(input, "breakoutRoom")) participant.breakoutRoom = String(input.breakoutRoom || "").slice(0, 80);
      if (Object.prototype.hasOwnProperty.call(input, "raisedHand")) participant.raisedHand = Boolean(input.raisedHand);
      participant.lastSeenAt = new Date().toISOString();
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, meeting: { ...meeting, settings: meeting.settings }, participant: { userId: targetId, role: participant.role, breakoutRoom: participant.breakoutRoom || "", raisedHand: participant.raisedHand } });
    }
    if (operation === "whiteboard" && req.method === "GET") {
      const after = Math.max(0, Number(url.searchParams.get("after") || 0));
      return sendJson(res, 200, { events: community.whiteboardEvents.filter((item) => item.meetingId === meetingId && item.id > after).slice(0, 1000) });
    }
    if (operation === "whiteboard" && req.method === "POST") {
      const event = (await readJsonBody(req)).event;
      const encoded = JSON.stringify(event || {});
      if (encoded.length > 900000) return sendError(res, 400, "Whiteboard event is too large.");
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id && !item.leftAt);
      const permission = meetingSettings(meeting.settings || {}).whiteboardPermission;
      const canManage = meeting.hostId === user.id || participant?.role === "cohost";
      const eventType = String(event?.type || "");
      if (!canManage && permission === "view" && eventType !== "cursor") return sendError(res, 403, "The whiteboard is view-only.");
      if (!canManage && permission === "comment" && !["cursor", "comment", "reaction", "stamp"].includes(eventType)) return sendError(res, 403, "The whiteboard is limited to comments.");
      const record = { id: Math.max(0, ...community.whiteboardEvents.map((item) => Number(item.id || 0))) + 1, meetingId, userId: user.id, event: event && typeof event === "object" ? event : {}, createdAt: new Date().toISOString() };
      community.whiteboardEvents.push(record);
      community.whiteboardEvents = community.whiteboardEvents.slice(-20000);
      await saveCommunity(community);
      return sendJson(res, 201, { ok: true, id: record.id });
    }
    if (operation === "messages" && req.method === "GET") {
      const users = await loadUsers();
      const messages = community.meetingMessages.filter((message) => {
        if (message.meetingId !== meetingId) return false;
        if (message.audience === "everyone" || message.senderId === user.id) return true;
        return (message.recipientIds || []).includes(user.id);
      }).slice(-250).map((message) => {
        const account = users.find((candidate) => candidate.id === message.senderId);
        const reply = message.replyToId ? community.meetingMessages.find((candidate) => candidate.id === message.replyToId) : null;
        const reactions = {};
        community.meetingReactions.filter((reaction) => reaction.messageId === message.id).forEach((reaction) => {
          reactions[reaction.emoji] ||= { count: 0, mine: false };
          reactions[reaction.emoji].count += 1;
          if (reaction.userId === user.id) reactions[reaction.emoji].mine = true;
        });
        return {
          ...message,
          author: community.profiles[message.senderId]?.displayName || account?.name || "Village member",
          avatarDataUrl: account?.avatarDataUrl || "",
          mine: message.senderId === user.id,
          reactions,
          replyTo: reply ? { id: reply.id, author: community.profiles[reply.senderId]?.displayName || users.find((candidate) => candidate.id === reply.senderId)?.name || "Village member", body: reply.deletedAt ? "Message deleted" : reply.body } : null
        };
      });
      return sendJson(res, 200, { messages, meetingId });
    }
    if (operation === "messages" && req.method === "POST") {
      const input = await readJsonBody(req);
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id && !item.leftAt);
      const canHost = meeting.hostId === user.id || participant?.role === "cohost";
      const settings = meetingSettings(meeting.settings || {});
      if (!canHost && settings.chatPolicy === "disabled") return sendError(res, 403, "The host turned meeting chat off.");
      const audience = ["everyone", "private", "group"].includes(input.audience) ? input.audience : "everyone";
      if (!canHost && settings.chatPolicy === "host-only" && !(audience === "private" && (input.recipientIds || []).includes(meeting.hostId))) return sendError(res, 403, "Participants can only message the host.");
      if (!canHost && !settings.privateChat && audience !== "everyone") return sendError(res, 403, "Private meeting chat is off.");
      const activeIds = new Set(community.meetingParticipants.filter((item) => item.meetingId === meetingId && !item.leftAt).map((item) => item.userId));
      activeIds.add(meeting.hostId);
      const recipientIds = [...new Set((Array.isArray(input.recipientIds) ? input.recipientIds : []).map(String).filter((id) => id !== user.id && activeIds.has(id)))].slice(0, 20);
      if (audience === "private" && recipientIds.length !== 1) return sendError(res, 400, "Choose one person for a private message.");
      if (audience === "group" && recipientIds.length < 1) return sendError(res, 400, "Choose at least one person for this group chat.");
      let attachment;
      try { attachment = safeAttachment(input.attachment); } catch (error) { return sendError(res, 400, error.message); }
      let metadata;
      try { metadata = safeMeetingMetadata(input.metadata || {}); } catch (error) { return sendError(res, 400, error.message); }
      const rawBody = String(input.message || "").trim().slice(0, 4000);
      const messageBody = rawBody ? (await maskLocalCommunityMessage(rawBody)).trim() : "";
      if (!messageBody && !attachment && !metadata.cloudUrl) return sendError(res, 400, "Write a message or attach something first.");
      const reply = input.replyToId ? community.meetingMessages.find((candidate) => candidate.id === String(input.replyToId) && candidate.meetingId === meetingId) : null;
      const message = {
        id: randomBytes(12).toString("hex"),
        meetingId,
        senderId: user.id,
        audience,
        recipientIds,
        body: messageBody,
        format: safeMeetingFormat(input.format || {}),
        attachment,
        metadata,
        replyToId: reply?.id || null,
        deletedAt: null,
        createdAt: new Date().toISOString()
      };
      community.meetingMessages.push(message);
      community.meetingMessages = community.meetingMessages.slice(-10000);
      await saveCommunity(community);
      return sendJson(res, 201, { message: { ...message, author: community.profiles[user.id]?.displayName || user.name, avatarDataUrl: user.avatarDataUrl || "", mine: true, reactions: {}, replyTo: reply ? { id: reply.id, body: reply.body } : null } });
    }
    if (operation === "polls" && req.method === "POST") {
      const input = await readJsonBody(req);
      const participant = community.meetingParticipants.find((item) => item.meetingId === meetingId && item.userId === user.id && !item.leftAt);
      const canCreate = meeting.hostId === user.id || participant?.role === "cohost" || meetingSettings(meeting.settings || {}).allowMemberPolls;
      if (!canCreate) return sendError(res, 403, "Only the host or co-host can create a poll.");
      const question = String(input.question || "").trim().slice(0, 240);
      const options = [...new Set((Array.isArray(input.options) ? input.options : []).map((option) => String(option || "").trim().slice(0, 120)).filter(Boolean))].slice(0, 8);
      if (!question || options.length < 2) return sendError(res, 400, "Add a poll question and at least two choices.");
      const poll = {
        id: randomBytes(12).toString("hex"),
        meetingId,
        creatorId: user.id,
        question,
        options,
        status: "draft",
        multiple: Boolean(input.multiple),
        anonymous: Boolean(input.anonymous),
        showLiveResults: input.showLiveResults !== false,
        durationSeconds: Math.max(0, Math.min(600, Number(input.durationSeconds || 0))),
        startedAt: null,
        endsAt: null,
        closedAt: null,
        createdAt: new Date().toISOString()
      };
      community.polls.push(poll);
      await saveCommunity(community);
      return sendJson(res, 201, { poll: { ...poll, votes: {}, totalVoters: 0, mySelections: [] } });
    }
    if (operation === "end" && req.method === "POST") {
      if (meeting.hostId !== user.id) return sendError(res, 403, "Only the host can end this meeting.");
      meeting.status = "ended";
      meeting.updatedAt = new Date().toISOString();
      community.meetingParticipants.filter((item) => item.meetingId === meetingId && !item.leftAt).forEach((item) => Object.assign(item, { leftAt: meeting.updatedAt, raisedHand: false }));
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, status: "ended" });
    }
  }

  const meetingMessageMatch = url.pathname.match(/^\/api\/community\/meeting-messages\/([^/]+)(?:\/(reactions))?$/);
  if (meetingMessageMatch) {
    const community = await loadCommunity();
    const message = community.meetingMessages.find((item) => item.id === decodeURIComponent(meetingMessageMatch[1]));
    const meeting = community.meetings.find((item) => item.id === message?.meetingId);
    if (!message || !meeting || !community.members.some((member) => member.roomId === meeting.roomId && member.userId === user.id)) return sendError(res, 404, "Meeting message not found.");
    if (!meetingMessageMatch[2] && req.method === "DELETE") {
      const participant = community.meetingParticipants.find((item) => item.meetingId === meeting.id && item.userId === user.id);
      if (message.senderId !== user.id && meeting.hostId !== user.id && participant?.role !== "cohost") return sendError(res, 403, "You can only delete your own meeting messages.");
      Object.assign(message, { body: "", attachment: null, metadata: {}, deletedAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, deletedAt: message.deletedAt });
    }
    if (meetingMessageMatch[2] === "reactions" && req.method === "POST") {
      const emoji = String((await readJsonBody(req)).emoji || "").trim().slice(0, 12);
      if (!emoji || !/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+$/u.test(emoji)) return sendError(res, 400, "Choose an emoji reaction.");
      const existing = community.meetingReactions.find((item) => item.messageId === message.id && item.userId === user.id && item.emoji === emoji);
      if (existing) community.meetingReactions = community.meetingReactions.filter((item) => item !== existing);
      else community.meetingReactions.push({ messageId: message.id, userId: user.id, emoji, createdAt: new Date().toISOString() });
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, active: !existing });
    }
  }

  const pollActionMatch = url.pathname.match(/^\/api\/community\/polls\/([^/]+)\/(vote|start|end)$/);
  if (req.method === "POST" && pollActionMatch) {
    const community = await loadCommunity();
    const poll = community.polls.find((item) => item.id === decodeURIComponent(pollActionMatch[1]));
    const meeting = community.meetings.find((item) => item.id === poll?.meetingId);
    if (!poll || !meeting || !community.members.some((member) => member.roomId === meeting.roomId && member.userId === user.id)) return sendError(res, 404, "This poll is unavailable.");
    const participant = community.meetingParticipants.find((item) => item.meetingId === meeting.id && item.userId === user.id && !item.leftAt);
    const canManage = meeting.hostId === user.id || participant?.role === "cohost";
    const action = pollActionMatch[2];
    if (["start", "end"].includes(action)) {
      if (!canManage) return sendError(res, 403, "Only the host or co-host can manage this poll.");
      const at = new Date().toISOString();
      if (action === "start") {
        poll.status = "active";
        poll.startedAt = at;
        poll.closedAt = null;
        poll.endsAt = poll.durationSeconds ? new Date(Date.now() + poll.durationSeconds * 1000).toISOString() : null;
      } else {
        poll.status = "closed";
        poll.closedAt = at;
      }
      await saveCommunity(community);
      return sendJson(res, 200, { ok: true, status: poll.status, startedAt: poll.startedAt || null, endsAt: poll.endsAt || null, closedAt: poll.closedAt || null });
    }
    if ((poll.status || "active") !== "active" || poll.closedAt || (poll.endsAt && new Date(poll.endsAt).getTime() <= Date.now())) return sendError(res, 404, "This poll is unavailable.");
    const input = await readJsonBody(req);
    const requested = Array.isArray(input.optionIndexes) ? input.optionIndexes : [input.optionIndex];
    const optionIndexes = [...new Set(requested.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < poll.options.length))];
    if (!optionIndexes.length || (!poll.multiple && optionIndexes.length !== 1)) return sendError(res, 400, poll.multiple ? "Choose one or more poll options." : "Choose one poll option.");
    const existing = community.pollVotes.find((item) => item.pollId === poll.id && item.userId === user.id);
    if (existing) Object.assign(existing, { optionIndex: optionIndexes[0], optionIndexes, createdAt: new Date().toISOString() });
    else community.pollVotes.push({ pollId: poll.id, userId: user.id, optionIndex: optionIndexes[0], optionIndexes, createdAt: new Date().toISOString() });
    await saveCommunity(community);
    return sendJson(res, 200, { ok: true, optionIndex: optionIndexes[0], optionIndexes });
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
        localNotification(community, memberId, "group-invite", "Village group invitation", `${community.profiles[user.id]?.displayName || user.name} invited you to ${room.name}`, { roomId, inviterId: user.id });
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
      const users = await loadUsers();
      const messages = community.messages.filter((message) => message.roomId === roomId && (!preference.clearedBefore || message.createdAt > preference.clearedBefore) && !community.blocks.some((block) => block.blockerId === user.id && block.blockedId === message.userId)).slice(-100).map((message) => {
        const account = users.find((candidate) => candidate.id === message.userId);
        return { ...message, author: community.profiles[message.userId]?.displayName || account?.name || "Village member", avatarDataUrl: account?.avatarDataUrl || "", saved: community.savedMessages.some((saved) => saved.userId === user.id && saved.messageId === message.id), mine: message.userId === user.id };
      });
      await saveCommunity(community);
      const otherUserId = room.kind === "direct" ? community.members.find((member) => member.roomId === roomId && member.userId !== user.id)?.userId || null : null;
      const members = room.kind === "group" ? community.members.filter((member) => member.roomId === roomId).map((member) => {
        const account = users.find((candidate) => candidate.id === member.userId);
        return { userId: member.userId, displayName: community.profiles[member.userId]?.displayName || account?.name || "Village member", avatarDataUrl: account?.avatarDataUrl || "", role: member.role || "member" };
      }).sort((a, b) => Number(b.role === "moderator") - Number(a.role === "moderator") || a.displayName.localeCompare(b.displayName)) : [];
      return sendJson(res, 200, { room: { id: room.id, name: room.name, kind: room.kind, systemManaged: room.kind === "group" && !room.createdBy, createdBy: room.createdBy || null, pinned: Boolean(preference.pinnedAt), otherUserId }, members, messages });
    }
    if (req.method === "POST" && operation === "messages") {
      const input = await readJsonBody(req);
      let attachment;
      try { attachment = safeAttachment(input.attachment); } catch (error) { return sendError(res, 400, error.message); }
      const requestedType = String(input.messageType || "").toLowerCase();
      const messageType = requestedType === "location" ? "location" : requestedType === "sticker" && attachment?.mime?.startsWith("image/") ? "sticker" : attachment ? "file" : "text";
      let metadata = {};
      if (messageType === "location") {
        if (!community.profiles[user.id]?.locationSharingEnabled) return sendError(res, 403, "Turn on location sharing in Community settings first.");
        const latitude = Number(input.location?.latitude);
        const longitude = Number(input.location?.longitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return sendError(res, 400, "Choose a valid location.");
        metadata = { latitude: Number(latitude.toFixed(5)), longitude: Number(longitude.toFixed(5)), label: String(input.location?.label || "Shared location").trim().slice(0, 80) };
      }
      if (room.kind === "direct") {
        const recipientId = community.members.find((member) => member.roomId === roomId && member.userId !== user.id)?.userId;
        if (recipientId && community.profiles[recipientId]?.directMessagesEnabled === false) return sendError(res, 403, "This friend is not accepting private messages right now.");
      }
      const rawBody = String(input.message || "").trim().slice(0, 1000);
      const messageBody = messageType === "text" ? (await maskLocalCommunityMessage(rawBody)).trim() : rawBody || (messageType === "file" ? `Shared ${attachment.name}` : messageType === "location" ? "Shared a location" : "Shared a sticker");
      if (!messageBody) return sendError(res, 400, "Write a message or attach something first.");
      const message = { id: randomBytes(12).toString("hex"), roomId, userId: user.id, body: messageBody, messageType, attachment, metadata, createdAt: new Date().toISOString() };
      community.messages.push(message);
      community.messages = community.messages.slice(-5000);
      notifyLocalRoom(community, roomId, user.id, room.kind === "direct" ? "direct-message" : "group-message", room.name, `${community.profiles[user.id]?.displayName || user.name}: ${message.body}`, { roomId, messageId: message.id });
      await saveCommunity(community);
      let sync = { synced: false };
      try { sync = await syncUserRecord(user); } catch (error) { sync = { synced: false, reason: error.message }; }
      return sendJson(res, 201, { message: { ...message, author: community.profiles[user.id].displayName, avatarDataUrl: user.avatarDataUrl || "", saved: false, mine: true }, sync });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/community/connect") {
    const targetUserId = String((await readJsonBody(req)).targetUserId || "");
    const community = await loadCommunity();
    if (!targetUserId || targetUserId === user.id) return sendError(res, 400, "Choose another community member.");
    if (!community.profiles[user.id]?.enabled || !community.profiles[targetUserId]?.enabled) return sendError(res, 403, "Both members must opt in to community matching.");
    if (community.profiles[targetUserId]?.allowStrangerRequests === false) return sendError(res, 403, "This member is not accepting new friend requests.");
    if (localBlocked(community, user.id, targetUserId)) return sendError(res, 403, "This connection is unavailable.");
    const key = pairKey(user.id, targetUserId);
    if (community.connections.some((item) => item.pairKey === key)) return sendError(res, 409, "A connection request or private chat already exists.");
    const connection = { id: randomBytes(12).toString("hex"), pairKey: key, requesterId: user.id, recipientId: targetUserId, status: "pending", roomId: null, createdAt: new Date().toISOString() };
    community.connections.push(connection);
    localNotification(community, targetUserId, "request", "New friend request", `${community.profiles[user.id]?.displayName || user.name} would like to connect`, { connectionId: connection.id, requesterId: user.id });
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
    localNotification(community, connection.requesterId, "request", "Friend request accepted", `${community.profiles[user.id]?.displayName || user.name} accepted your request`, { roomId, userId: user.id });
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
    const { topic = "Education", diagnosis = "", description = "", count, confirmedSecondaryKeywords = [], rejectedKeywords = [], age = "", lifeStage = "", language = "en", allowFollowUpQuestions = false } = await readJsonBody(req);
    if (String(description).trim().length < 8) return sendError(res, 400, "Tell Waffles a little more so the recommendations can be useful.");
    if (!diagnosis) return sendError(res, 400, "Choose an island before searching for resources.");
    const config = await loadScoringConfig();
    const { rows, source } = await getResources();
    const blockedPrimaryKeywords = await loadPrimaryKeywordBlocklist();
    const primaryKeywords = filterPrimaryKeywords(extractKeywords([description], config.limits.maximumPrimaryKeywords), blockedPrimaryKeywords).slice(0, config.limits.maximumPrimaryKeywords);
    const gateKeywords = extractGateKeywords([...primaryKeywords, ...confirmedSecondaryKeywords], config);
    const expansionKeywords = heuristicKeywordExpansion([...primaryKeywords, ...confirmedSecondaryKeywords], config.limits.maximumSecondaryKeywords);
    const profileAge = user.profile?.responses?.age || "";
    const lifeStages = extractLifeStages([description, age, lifeStage, profileAge], 8);
    const issuePreferences = inferIssuePreferences([description, user.profile?.responses?.note || ""]);
    const requestedCount = normalizeResultCount(count, config);
    const rankingInput = { diagnosis, category: topic, gateKeywords, primaryKeywords, confirmedSecondaryKeywords, rejectedKeywords, expansionKeywords, issuePreferences, age: profileAge || age, lifeStage, lifeStages, count: requestedCount, config };
    const expanded = { ai: false, keywords: [] };
    const matches = rankResources(rows, { ...rankingInput, predictedKeywords: [] });
    let answer;
    let ai = false;
    try {
      answer = await callOpenAI({ topic, description, profile: user.profile, matches, language });
      ai = Boolean(answer);
    } catch (error) {
      answer = deterministicAnswer(topic, description, matches, language);
    }
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
      source
    };
    const shortageReasons = [];
    if (matches.length < requestedCount) {
      shortageReasons.push(`Requested ${requestedCount} resources, but only ${matches.length} were available from the database.`);
    }
    if (highScoreCount < 3) {
      shortageReasons.push(`Only ${highScoreCount} displayed resources scored at least 20; at least 3 are required.`);
    }
    let sync = { synced: false };
    if (!user.guest) {
      const saved = await updateUser(user.id, (item) => ({ ...item, history: [...(item.history || []), { topic, description, at: new Date().toISOString() }].slice(-50) }));
      try { sync = await syncUserRecord(saved); } catch (error) { sync = { synced: false, reason: error.message }; }
    }
    const errorSync = [];
    if (shortageReasons.length) {
      try {
        errorSync.push(await logErrorRecord({
          event: matches.length < requestedCount && highScoreCount < 3 ? "insufficient_resources_and_high_scores" : matches.length < requestedCount ? "insufficient_resources" : "insufficient_high_score_resources",
          reason: shortageReasons.join(" "),
          user,
          topic,
          diagnosis,
          description,
          requestedCount,
          providedCount: matches.length,
          highScoreCount,
          source,
          primaryKeywords,
          confirmedKeywords: confirmedSecondaryKeywords,
          predictedKeywords: expanded.keywords,
          locatedKeywords: foundKeywords
        }));
      } catch (error) {
        errorSync.push({ synced: false, reason: error.message });
      }
    }
    recordUserCountMetrics({ [COUNT_TOTAL_SEARCHES_COMPLETED]: 1 }).catch((error) => console.warn(`User count update failed: ${error.message}`));
    return sendJson(res, 200, {
      answer,
      resources: matches,
      source,
      ai,
      summaryGuide: buildingGuideName(topic),
      researchContext,
      followUpQuestions: allowFollowUpQuestions ? localizedClarificationQuestions({ topic, description, language, config }) : [],
      keywordExpansion: { ai: expanded.ai, synonyms: expansionKeywords, predicted: expanded.keywords, suggested: [...expansionKeywords, ...expanded.keywords] },
      scoring: { version: config.version, minimumScore: config.limits.minimumScore },
      errorSync,
      sync
    });
  }

  if (req.method === "POST" && url.pathname === "/api/research-feedback") {
    const { helpful = true, rating = 0, details = "", source = "research-results", research = {} } = await readJsonBody(req);
    const isHelpful = helpful === true || helpful === "true";
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return sendError(res, 400, "Choose a star rating from 1 to 5.");
    const feedbackDetails = String(details || "").trim().slice(0, 2000);
    let feedbackSync = { synced: false, reason: "FEEDBACK_SHEET_WEBHOOK_URL is not configured." };
    try {
      feedbackSync = await syncFeedbackRecord({ helpful: isHelpful, rating: numericRating, details: feedbackDetails, user });
    } catch (error) {
      feedbackSync = { synced: false, reason: error.message };
    }
    if (feedbackSync.synced) {
      recordUserCountMetrics({
        [COUNT_USEFULNESS_SCORE_TOTAL]: numericRating,
        [COUNT_USEFULNESS_RESPONSE_COUNT]: 1
      }).catch((error) => console.warn(`User count update failed: ${error.message}`));
    }

    const description = String(research.fullInput || research.description || "").trim().slice(0, 2000);
    let sync = { synced: false, reason: isHelpful ? "Helpful feedback does not require an Error row." : "Research context is unavailable." };
    if (!isHelpful && description) {
      try {
        const reasonPrefix = source === "daily-return" ? "User chose Not really in the daily return-to-home research check-in." : "User chose Not Helpful for the completed research.";
        sync = await logErrorRecord({
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
    return sendJson(res, 200, { ok: true, recorded: Boolean(feedbackSync.synced), feedbackSync, sync });
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

  return sendError(res, 404, "API route not found.");
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized === "/" ? "/index.html" : normalized;
  const filePath = join(PUBLIC_DIR, relative);
  return filePath.startsWith(PUBLIC_DIR) ? filePath : join(PUBLIC_DIR, "index.html");
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    let filePath = safeStaticPath(url.pathname);
    if (!existsSync(filePath)) filePath = join(PUBLIC_DIR, "index.html");
    const type = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": type.startsWith("text/html") ? "no-store" : "public, max-age=3600" });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) return sendError(res, 500, error.message || "Something went wrong.");
    res.end();
  }
}

let userCountSyncTimer = null;

function scheduleUserCountSync() {
  if (userCountSyncTimer) return;
  userCountSyncTimer = setInterval(() => {
    syncUserCountMetrics().catch((error) => console.warn(`Hourly user count sync failed: ${error.message}`));
  }, USER_COUNT_SYNC_INTERVAL_MS);
  userCountSyncTimer.unref?.();
}

export function createAppServer() {
  scheduleUserCountSync();
  return http.createServer(handleRequest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, () => {
    console.log(`It Takes a Village is running at http://127.0.0.1:${port}`);
  });
}
