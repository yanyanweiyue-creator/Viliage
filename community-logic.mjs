const normalize = (value) => String(value || "").trim().toLowerCase();
const values = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(normalize).filter(Boolean);
const interestLabel = (value) => value === "adhd" ? "ADHD" : value === "autism" ? "Autism" : value.replace(/\b\w/g, (letter) => letter.toUpperCase());

export function pairKey(firstUserId, secondUserId) {
  return [String(firstUserId || ""), String(secondUserId || "")].sort().join(":");
}

export function safeDisplayName(value, fallback = "Village member") {
  const cleaned = String(value || "").replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned || fallback;
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
