const normalize = (value) => String(value || "").trim().toLowerCase();
const values = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(normalize).filter(Boolean);
const interestLabel = (value) => value === "adhd" ? "ADHD" : value === "autism" ? "Autism" : value.replace(/\b\w/g, (letter) => letter.toUpperCase());
const BLOCKED_TERMS = new Set(["bitch", "cunt", "dick", "faggot", "fuck", "maricon", "mierda", "motherfucker", "nigger", "pussy", "puta", "puto", "retard", "shit", "slut", "whore"]);
const BLOCKED_PHRASES = ["kill yourself", "go die", "heil hitler", "white power"];
const BLOCKED_UNICODE_PHRASES = ["去死", "操你妈", "草你妈", "傻逼", "婊子", "狗娘养的", "弱智", "黑鬼"];
export const COMMUNITY_SANCTION_TYPES = Object.freeze({
  chat_mute: "Chat mute",
  community_ban: "Community suspension",
  site_blacklist: "Site blacklist"
});

const SANCTION_SEVERITY = Object.freeze({
  chat_mute: 1,
  community_ban: 2,
  site_blacklist: 3
});

function maskMatch(value) {
  return [...String(value || "")].map((character) => /\s/u.test(character) ? character : "*").join("");
}

function escapedPattern(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pairKey(firstUserId, secondUserId) {
  return [String(firstUserId || ""), String(secondUserId || "")].sort().join(":");
}

export function safeDisplayName(value, fallback = "Village member") {
  const cleaned = String(value || "").replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned || fallback;
}

export function normalizeMeetingSignalInput(input = {}) {
  const kind = String(input.kind || "");
  if (!["offer", "answer", "candidate", "leave", "state"].includes(kind)) {
    throw new Error("Unsupported meeting signal.");
  }
  const payload = input.payload === undefined && ["leave", "state"].includes(kind)
    ? {}
    : input.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Meeting signal payload must be an object.");
  }
  if (JSON.stringify(payload).length > 30000) throw new Error("Meeting signal is too large.");
  if (["offer", "answer"].includes(kind)) {
    if (typeof payload.sdp !== "string" || !payload.sdp.trim()) {
      throw new Error("Meeting session description is invalid.");
    }
    if (payload.type !== undefined && payload.type !== kind) {
      throw new Error("Meeting session description type does not match the signal.");
    }
  }
  if (kind === "candidate" && typeof payload.candidate !== "string") {
    throw new Error("Meeting ICE candidate is invalid.");
  }
  return { kind, payload };
}

export function containsBlockedLanguage(value) {
  const raw = String(value || "").normalize("NFKC").toLowerCase();
  if (BLOCKED_UNICODE_PHRASES.some((phrase) => raw.includes(phrase))) return true;
  const normalized = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a").replace(/[3]/g, "e").replace(/[1!|]/g, "i").replace(/[0]/g, "o").replace(/[$5]/g, "s").replace(/[7]/g, "t")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  const compact = normalized.replace(/\s+/g, "");
  if ([...BLOCKED_TERMS].some((term) => normalized.split(" ").includes(term) || compact === term)) return true;
  return BLOCKED_PHRASES.some((phrase) => ` ${normalized} `.includes(` ${phrase} `));
}

export function maskBlockedLanguage(value, customTerms = []) {
  let output = String(value || "");
  const terms = [...BLOCKED_TERMS, ...BLOCKED_PHRASES, ...BLOCKED_UNICODE_PHRASES, ...(Array.isArray(customTerms) ? customTerms : [])]
    .map((term) => String(term || "").normalize("NFKC").trim())
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);
  for (const term of terms) {
    const expression = /[\p{L}\p{N}]/u.test(term.charAt(0)) && /[\p{L}\p{N}]/u.test(term.at(-1))
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escapedPattern(term)}(?![\\p{L}\\p{N}])`, "giu")
      : new RegExp(escapedPattern(term), "giu");
    output = output.replace(expression, maskMatch);
  }
  return output;
}

export function normalizeBlockedTerms(value, max = 500) {
  const source = Array.isArray(value) ? value : [value];
  const terms = source
    .flatMap((item) => String(item || "").split(/[\n,;]+/u))
    .map((term) => term.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim().slice(0, 80))
    .filter(Boolean);
  return [...new Set(terms)].slice(0, Math.max(1, Number(max) || 500));
}

export function normalizeCommunitySanctionInput(input = {}, now = Date.now()) {
  const type = String(input.type || "");
  if (!Object.hasOwn(COMMUNITY_SANCTION_TYPES, type)) throw new Error("Choose a valid penalty type.");
  const reason = String(input.reason || "").replace(/\s+/gu, " ").trim().slice(0, 1000);
  if (reason.length < 3) throw new Error("Add a clear penalty reason.");
  const startsAt = new Date(now).toISOString();
  if (input.permanent === true || String(input.durationSeconds || "") === "permanent") {
    return { type, reason, startsAt, endsAt: null, durationSeconds: null };
  }
  const durationSeconds = Math.round(Number(input.durationSeconds));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 60 || durationSeconds > 315360000) {
    throw new Error("Choose a duration from 1 minute to 10 years, or permanent.");
  }
  return {
    type,
    reason,
    startsAt,
    endsAt: new Date(now + durationSeconds * 1000).toISOString(),
    durationSeconds
  };
}

export function isCommunitySanctionActive(sanction, now = Date.now()) {
  if (!sanction || sanction.revokedAt || sanction.revoked_at) return false;
  const startsAt = new Date(sanction.startsAt || sanction.starts_at || 0).getTime();
  const endsValue = sanction.endsAt ?? sanction.ends_at;
  const endsAt = endsValue ? new Date(endsValue).getTime() : Infinity;
  return Number.isFinite(startsAt) && startsAt <= now && endsAt > now;
}

export function communityModerationState(sanctions = [], now = Date.now()) {
  const activeSanctions = (Array.isArray(sanctions) ? sanctions : [])
    .filter((sanction) => isCommunitySanctionActive(sanction, now))
    .map((sanction) => ({
      ...sanction,
      type: String(sanction.type || ""),
      label: COMMUNITY_SANCTION_TYPES[sanction.type] || "Community penalty",
      startsAt: sanction.startsAt || sanction.starts_at || "",
      endsAt: sanction.endsAt ?? sanction.ends_at ?? null,
      durationSeconds: sanction.durationSeconds ?? sanction.duration_seconds ?? null,
      createdAt: sanction.createdAt || sanction.created_at || ""
    }))
    .sort((first, second) => (SANCTION_SEVERITY[second.type] || 0) - (SANCTION_SEVERITY[first.type] || 0)
      || String(first.endsAt || "9999").localeCompare(String(second.endsAt || "9999")));
  const types = new Set(activeSanctions.map((sanction) => sanction.type));
  return {
    active: activeSanctions.length > 0,
    access: {
      site: !types.has("site_blacklist"),
      community: !types.has("community_ban") && !types.has("site_blacklist"),
      chatWrite: !types.has("chat_mute") && !types.has("community_ban") && !types.has("site_blacklist")
    },
    sanctions: activeSanctions
  };
}

export function isCommunityChatWrite(method, pathname) {
  if (String(method || "").toUpperCase() !== "POST") return false;
  const path = String(pathname || "");
  return path === "/api/community/connect"
    || path === "/api/community/groups"
    || path === "/api/community/meetings"
    || path === "/api/community/posts"
    || /^\/api\/community\/posts\/[^/]+\/comments$/.test(path)
    || /^\/api\/community\/rooms\/[^/]+\/(?:messages|invite)$/.test(path)
    || /^\/api\/community\/meetings\/[^/]+\/(?:invitations|messages|polls|whiteboard)$/.test(path)
    || /^\/api\/community\/meeting-messages\/[^/]+\/reactions$/.test(path)
    || /^\/api\/community\/documents\/[^/]+\/(?:comments|share)$/.test(path);
}

export function communitySimilarity(currentProfile, candidateProfile) {
  const current = currentProfile?.responses || {};
  const candidate = candidateProfile?.responses || {};
  const currentInterests = new Set(values(current.interests));
  const sharedInterests = values(candidate.interests).filter((interest) => currentInterests.has(interest));
  let score = sharedInterests.length * 4;
  const reasons = sharedInterests.slice(0, 2).map((interest) => `Both exploring ${interestLabel(interest)}`);

  if (normalize(current.age) && normalize(current.age) === normalize(candidate.age)) {
    score += 3;
    reasons.push(`Similar age group: ${String(current.age).slice(0, 30)}`);
  }
  if (normalize(current.journey) && normalize(current.journey) === normalize(candidate.journey)) {
    score += 2;
    reasons.push("At a similar point in the journey");
  }
  const currentSituation = new Set(values(current.situation));
  if (values(candidate.situation).some((item) => currentSituation.has(item))) {
    score += 1;
    reasons.push("Shared support priorities");
  }
  return { score, reasons: reasons.slice(0, 3) };
}
