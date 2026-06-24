const normalize = (value) => String(value || "").trim().toLowerCase();
const values = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(normalize).filter(Boolean);
const interestLabel = (value) => value === "adhd" ? "ADHD" : value === "autism" ? "Autism" : value.replace(/\b\w/g, (letter) => letter.toUpperCase());
const BLOCKED_TERMS = new Set(["bitch", "cunt", "dick", "faggot", "fuck", "maricon", "mierda", "motherfucker", "nigger", "pussy", "puta", "puto", "retard", "shit", "slut", "whore"]);
const BLOCKED_PHRASES = ["kill yourself", "go die", "heil hitler", "white power"];
const BLOCKED_UNICODE_PHRASES = ["去死", "操你妈", "草你妈", "傻逼", "婊子", "狗娘养的", "弱智", "黑鬼"];

export function pairKey(firstUserId, secondUserId) {
  return [String(firstUserId || ""), String(secondUserId || "")].sort().join(":");
}

export function safeDisplayName(value, fallback = "Village member") {
  const cleaned = String(value || "").replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned || fallback;
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
