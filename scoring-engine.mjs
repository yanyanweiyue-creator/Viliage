const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "for", "from", "help", "i", "in", "is", "it", "me", "my", "of", "on", "or", "that", "the", "this", "to", "want", "we", "with"
]);

const SYNONYMS = {
  autism: ["autistic", "asd", "neurodivergent"],
  adhd: ["attention deficit", "executive function", "executive functioning"],
  education: ["school", "learning", "student", "academic"],
  legal: ["rights", "advocacy", "law", "iep", "504"],
  therapy: ["therapist", "counseling", "treatment"],
  speech: ["communication", "language", "slp"],
  social: ["peer interaction", "friendship", "group program"],
  parent: ["caregiver", "family", "guardian"],
  affordable: ["free", "low cost", "sliding scale"],
  online: ["virtual", "remote", "telehealth"]
};

export const DEFAULT_SCORE_CONFIG = {
  version: "1.0",
  weights: {
    directExactTag: 10,
    directPartialTag: 5,
    directExactDescription: 3,
    directPartialDescription: 1,
    directCategory: 4,
    suggestedExactTag: 5,
    suggestedPartialTag: 2,
    suggestedExactDescription: 1,
    suggestedPartialDescription: 0.5,
    suggestedCategory: 2,
    issueExactPenalty: -10,
    issuePartialPenalty: -5
  },
  limits: { minimumScore: 0.5, defaultResults: 5, maximumResults: 10, maximumDirectKeywords: 24, maximumSuggestedKeywords: 16 }
};

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularize(value) {
  return value
    .split(" ")
    .map((word) => word.length > 4 && word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word)
    .join(" ");
}

function uniqueNormalized(values, limit = 24) {
  const seen = new Set();
  const output = [];
  for (const raw of values.flat(Infinity)) {
    const value = singularize(normalizeText(raw));
    if (!value || STOP_WORDS.has(value) || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

export function extractKeywords(values, limit = 24) {
  const phrases = [];
  for (const value of values.flat(Infinity).filter(Boolean)) {
    const normalized = normalizeText(value);
    phrases.push(...String(value).split(/\s*(?:,|;|\/|\band\b|\bor\b)\s*/i).map(normalizeText));
    phrases.push(...normalized.split(" ").filter((word) => word.length > 2));
  }
  return uniqueNormalized(phrases, limit);
}

export function heuristicKeywordExpansion(directKeywords, limit = 16) {
  const suggestions = [];
  for (const keyword of directKeywords) {
    for (const [root, related] of Object.entries(SYNONYMS)) {
      if (keyword.includes(root) || related.some((term) => keyword.includes(normalizeText(term)))) suggestions.push(root, ...related);
    }
  }
  return uniqueNormalized(suggestions, limit).filter((keyword) => !directKeywords.includes(keyword));
}

export function inferIssuePreferences(values) {
  const text = normalizeText(values.flat(Infinity).filter(Boolean).join(" "));
  const conflicts = [];
  if (/\b(free|affordable|low cost|sliding scale|budget)\b/.test(text)) conflicts.push("expensive", "high cost", "no sliding scale");
  if (/\b(soon|urgent|quick|immediate|now)\b/.test(text)) conflicts.push("long waitlist", "limited availability", "wait list");
  if (/\b(insurance|covered|coverage)\b/.test(text)) conflicts.push("not insurance accepted", "no insurance", "out of network");
  if (/\b(local|nearby|near me|in person)\b/.test(text)) conflicts.push("geographic restriction", "out of area", "online only");
  if (/\b(online|virtual|remote|telehealth)\b/.test(text)) conflicts.push("in person only", "no virtual");
  return uniqueNormalized(conflicts, 16);
}

function normalizedList(values) {
  return uniqueNormalized((values || []).flatMap((value) => String(value).split(/[,;/]/)), 100);
}

function phraseMatch(keyword, values, containedExact = false, symmetricPartial = false) {
  const exact = values.includes(keyword) || (containedExact && values.some((value) => ` ${value} `.includes(` ${keyword} `)));
  const partial = !exact && values.some((value) => value.includes(keyword) || (symmetricPartial && keyword.includes(value)));
  return exact ? "exact" : partial ? "partial" : "none";
}

function addReason(result, seen, key, points, label, keyword) {
  if (!points || seen.has(key)) return;
  seen.add(key);
  result.score += points;
  result.explanation.push({ points, label, keyword });
}

export function scoreResource(resource, { directKeywords = [], suggestedKeywords = [], issuePreferences = [], config = DEFAULT_SCORE_CONFIG } = {}) {
  const weights = { ...DEFAULT_SCORE_CONFIG.weights, ...(config.weights || {}) };
  const tags = normalizedList(resource.tags);
  const categories = normalizedList(resource.categories);
  const descriptions = uniqueNormalized([resource.name, resource.description, resource.diagnosis, resource.age, resource.location], 100);
  const issues = normalizedList(resource.issues);
  const result = { score: 0, explanation: [], matchedKeywords: [] };
  const seen = new Set();

  const evaluateKeyword = (keyword, source) => {
    const normalized = singularize(normalizeText(keyword));
    if (!normalized) return;
    const prefix = source === "direct" ? "direct" : "suggested";
    const tagMatch = phraseMatch(normalized, tags);
    if (tagMatch !== "none") {
      const points = weights[`${prefix}${tagMatch === "exact" ? "Exact" : "Partial"}Tag`];
      addReason(result, seen, `${prefix}:tag:${normalized}`, points, `${source} ${tagMatch} tag match`, normalized);
      result.matchedKeywords.push(normalized);
      return;
    }
    const categoryMatch = phraseMatch(normalized, categories);
    if (categoryMatch !== "none") {
      addReason(result, seen, `${prefix}:category:${normalized}`, weights[`${prefix}Category`], `${source} category match`, normalized);
      result.matchedKeywords.push(normalized);
    }
    const descriptionMatch = phraseMatch(normalized, descriptions, true);
    if (descriptionMatch !== "none") {
      const points = weights[`${prefix}${descriptionMatch === "exact" ? "Exact" : "Partial"}Description`];
      addReason(result, seen, `${prefix}:description:${normalized}`, points, `${source} ${descriptionMatch} description match`, normalized);
      result.matchedKeywords.push(normalized);
    }
  };

  uniqueNormalized(directKeywords, 50).forEach((keyword) => evaluateKeyword(keyword, "direct"));
  uniqueNormalized(suggestedKeywords, 50).filter((keyword) => !directKeywords.includes(keyword)).forEach((keyword) => evaluateKeyword(keyword, "suggested"));

  for (const preference of uniqueNormalized(issuePreferences, 30)) {
    const issueMatch = phraseMatch(preference, issues, false, true);
    if (issueMatch === "none") continue;
    const points = issueMatch === "exact" ? weights.issueExactPenalty : weights.issuePartialPenalty;
    addReason(result, seen, `issue:${preference}`, points, `${issueMatch} issue conflict`, preference);
  }

  result.score = Math.round(result.score * 10) / 10;
  result.matchedKeywords = [...new Set(result.matchedKeywords)];
  return result;
}

export function rankResources(resources, options = {}) {
  const config = options.config || DEFAULT_SCORE_CONFIG;
  const limits = { ...DEFAULT_SCORE_CONFIG.limits, ...(config.limits || {}) };
  const requested = Number(options.count || limits.defaultResults);
  const count = Math.max(3, Math.min(limits.maximumResults, Number.isFinite(requested) ? Math.round(requested) : limits.defaultResults));
  return resources
    .map((resource) => ({ ...resource, ...scoreResource(resource, options) }))
    .filter((resource) => resource.score >= limits.minimumScore)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, count);
}
