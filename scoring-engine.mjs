const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "child", "find", "for", "from", "help", "high", "i", "in", "is", "it", "local", "looking", "me", "my", "of", "on", "or", "resource", "resources", "that", "the", "this", "to", "want", "we", "with"
]);

const SYNONYMS = {
  autism: ["autistic", "asd", "neurodivergent"],
  adhd: ["attention deficit", "executive function", "executive functioning"],
  education: ["school", "learning", "student", "academic"],
  legal: ["lawyer", "attorney", "rights", "advocacy", "law"],
  iep: ["individualized education program", "special education"],
  "504": ["accommodation plan", "school accommodations"],
  sports: ["sport", "recreation", "athletics", "adaptive sports", "physical activity"],
  therapy: ["therapist", "counseling", "treatment"],
  speech: ["communication", "language", "slp"],
  social: ["peer interaction", "friendship", "group program"],
  parent: ["caregiver", "family", "guardian"],
  affordable: ["free", "low cost", "sliding scale"],
  online: ["virtual", "remote", "telehealth"]
};

export const DEFAULT_SCORE_CONFIG = {
  version: "2.1",
  weights: {
    primaryExactTag: 25,
    primarySimilarTag: 15,
    primaryRelatedTag: 4,
    secondaryExactTag: 12,
    secondarySimilarTag: 7,
    secondaryRelatedTag: 2,
    primaryExactDescription: 5,
    primaryPartialDescription: 3,
    primaryKeywordDescription: 1,
    secondaryExactDescription: 3,
    secondaryPartialDescription: 2,
    secondaryKeywordDescription: 1,
    predictedExactTag: 3,
    predictedSimilarTag: 1,
    predictedDescription: 1,
    majorIssuePenalty: -5,
    minorIssuePenalty: -2
  },
  limits: {
    minimumScore: 0,
    defaultResults: 5,
    minimumResults: 3,
    maximumResults: 10,
    maximumGateRatio: 0.2,
    maximumPrimaryKeywords: 20,
    maximumSecondaryKeywords: 12,
    maximumPredictedKeywords: 12,
    maximumFollowUpQuestions: 2
  }
};

export function normalizeText(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9+]+/g, " ").trim().replace(/\s+/g, " ");
}

function singularize(value) {
  return value.split(" ").map((word) => word.length > 4 && word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word).join(" ");
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

export function extractKeywords(values, limit = 20) {
  const concepts = [];
  for (const value of values.flat(Infinity).filter(Boolean)) {
    const normalized = normalizeText(value);
    for (const segment of String(value).split(/\s*(?:,|;|\/|\band\b|\bor\b)\s*/i).map(normalizeText)) {
      const words = segment.split(" ").filter(Boolean);
      if (words.length > 1 && words.length <= 4 && words.every((word) => !STOP_WORDS.has(word))) concepts.push(segment);
    }
    concepts.push(...normalized.split(" ").filter((word) => word.length > 2));
  }
  return uniqueNormalized(concepts, limit);
}

export function extractGateKeywords(values, config = DEFAULT_SCORE_CONFIG) {
  const limits = { ...DEFAULT_SCORE_CONFIG.limits, ...(config.limits || {}) };
  const all = extractKeywords(values, limits.maximumPrimaryKeywords);
  if (!all.length) return [];
  const cap = Math.max(1, Math.floor(all.length * limits.maximumGateRatio));
  const phrases = all.filter((item) => /\b(small group|1 on 1|one on one|regional center|disability rights|executive function|low cost|sensory friendly|adaptive sport)\b/.test(item));
  const distinctive = all.filter((item) => !item.includes(" ") && item.length > 3);
  return uniqueNormalized([...phrases, ...distinctive], cap);
}

export function heuristicKeywordExpansion(primaryKeywords, limit = 12) {
  const suggestions = [];
  for (const keyword of uniqueNormalized(primaryKeywords, 50)) {
    for (const [root, related] of Object.entries(SYNONYMS)) {
      if (keyword.includes(root) || related.some((term) => keyword.includes(normalizeText(term)))) suggestions.push(root, ...related);
    }
  }
  return uniqueNormalized(suggestions, limit).filter((keyword) => !primaryKeywords.includes(keyword));
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

function synonymGroup(keyword) {
  for (const [root, related] of Object.entries(SYNONYMS)) {
    const group = uniqueNormalized([root, ...related], 30);
    if (group.some((item) => item === keyword || item.includes(keyword) || keyword.includes(item))) return group;
  }
  return [];
}

function matchStrength(keyword, values) {
  if (values.includes(keyword)) return "exact";
  if (values.some((value) => value.includes(keyword) || keyword.includes(value))) return "similar";
  const related = synonymGroup(keyword);
  if (related.length && values.some((value) => related.some((term) => value === term || value.includes(term) || term.includes(value)))) return "related";
  return "none";
}

function descriptionStrength(keyword, description) {
  if (!description) return "none";
  if (description === keyword || ` ${description} `.includes(` ${keyword} `)) return keyword.includes(" ") ? "exact" : "keyword";
  const words = keyword.split(" ");
  if (words.length > 1 && words.some((word) => word.length > 2 && ` ${description} `.includes(` ${word} `))) return "partial";
  return "none";
}

function addReason(result, seen, key, points, label, keyword) {
  if (!points || seen.has(key)) return;
  seen.add(key);
  result.score += points;
  result.explanation.push({ points, label, keyword });
}

function diagnosisMatches(resourceDiagnosis, requiredDiagnosis) {
  const required = singularize(normalizeText(requiredDiagnosis));
  if (!required) return true;
  const diagnoses = normalizedList([resourceDiagnosis]);
  return diagnoses.some((value) => value === "both" || value === required || value.includes(required));
}

function categoryMatches(resourceCategories, requiredCategory) {
  const required = singularize(normalizeText(requiredCategory));
  if (!required) return true;
  return normalizedList(resourceCategories).includes(required);
}

export function filterResources(resources, { diagnosis, category } = {}) {
  return resources.filter((resource) => diagnosisMatches(resource.diagnosis, diagnosis) && categoryMatches(resource.categories, category));
}

export function passesDescriptionGate(resource, gateKeywords = []) {
  if (!gateKeywords.length) return false;
  const tags = normalizedList(resource.tags);
  const description = singularize(normalizeText(resource.description));
  return uniqueNormalized(gateKeywords, 30).some((keyword) => {
    const tagMatch = matchStrength(keyword, tags);
    return (tagMatch === "exact" || tagMatch === "similar") || descriptionStrength(keyword, description) !== "none";
  });
}

export function descriptionGateEvidence(resource, { primaryGateKeywords = [], secondaryGateKeywords = [], fallbackGateKeywords = [] } = {}) {
  const matches = (keywords) => uniqueNormalized(keywords, 30).filter((keyword) => passesDescriptionGate(resource, [keyword]));
  const primaryMatches = matches(primaryGateKeywords);
  const secondaryMatches = matches(secondaryGateKeywords).filter((keyword) => !primaryMatches.includes(keyword));
  const fallbackMatches = primaryMatches.length || secondaryMatches.length ? [] : matches(fallbackGateKeywords);
  return {
    confidence: primaryMatches.length * 2 + secondaryMatches.length + fallbackMatches.length * .5,
    authority: primaryMatches.length ? "primary" : secondaryMatches.length ? "confirmed-secondary" : fallbackMatches.length ? "fallback" : "none",
    primaryMatches,
    secondaryMatches,
    fallbackMatches
  };
}

export function scoreResource(resource, { primaryKeywords = [], confirmedSecondaryKeywords = [], predictedKeywords = [], rejectedKeywords = [], issuePreferences = [], config = DEFAULT_SCORE_CONFIG, tier = 1 } = {}) {
  const weights = { ...DEFAULT_SCORE_CONFIG.weights, ...(config.weights || {}) };
  const tags = normalizedList(resource.tags);
  const description = singularize(normalizeText([resource.name, resource.description].filter(Boolean).join(" ")));
  const issues = normalizedList(resource.issues);
  const rejected = new Set(uniqueNormalized(rejectedKeywords, 50));
  const result = { score: 0, tier, explanation: [], matchedKeywords: [], passedFilters: [] };
  const seen = new Set();

  const evaluate = (keyword, authority) => {
    const normalized = singularize(normalizeText(keyword));
    if (!normalized || rejected.has(normalized)) return;
    const tagStrength = matchStrength(normalized, tags);
    if (tagStrength !== "none") {
      const strength = tagStrength[0].toUpperCase() + tagStrength.slice(1);
      const points = weights[`${authority}${strength}Tag`] || 0;
      addReason(result, seen, `${authority}:tag:${normalized}`, points, `${authority} ${tagStrength} tag match`, normalized);
      if (points) result.matchedKeywords.push(normalized);
      return;
    }
    const descriptionMatch = descriptionStrength(normalized, description);
    if (descriptionMatch !== "none") {
      const strength = descriptionMatch[0].toUpperCase() + descriptionMatch.slice(1);
      const key = authority === "predicted" ? "predictedDescription" : `${authority}${strength}Description`;
      const points = weights[key] || 0;
      addReason(result, seen, `${authority}:description:${normalized}`, points, `${authority} ${descriptionMatch} description match`, normalized);
      if (points) result.matchedKeywords.push(normalized);
    }
  };

  uniqueNormalized(primaryKeywords, 50).forEach((keyword) => evaluate(keyword, "primary"));
  uniqueNormalized(confirmedSecondaryKeywords, 50).forEach((keyword) => evaluate(keyword, "secondary"));
  uniqueNormalized(predictedKeywords, 50).forEach((keyword) => evaluate(keyword, "predicted"));

  const preferences = uniqueNormalized(issuePreferences, 30);
  for (const issue of issues) {
    if (preferences.length && matchStrength(issue, preferences) === "none") continue;
    const major = /\b(major|severe|unsafe|closed|ineligible)\b/.test(issue);
    addReason(result, seen, `issue:${issue}`, major ? weights.majorIssuePenalty : weights.minorIssuePenalty, `${major ? "major" : "minor"} issue`, issue);
  }

  result.score = Math.round(result.score * 10) / 10;
  result.matchedKeywords = [...new Set(result.matchedKeywords)];
  return result;
}

export function normalizeResultCount(value, config = DEFAULT_SCORE_CONFIG) {
  const limits = { ...DEFAULT_SCORE_CONFIG.limits, ...(config.limits || {}) };
  const requested = Number(value || limits.defaultResults);
  return Math.max(limits.minimumResults, Math.min(limits.maximumResults, Number.isFinite(requested) ? Math.round(requested) : limits.defaultResults));
}

function scorePool(resources, options, tier, keywordOptions) {
  return resources.map((resource) => {
    const scored = scoreResource(resource, { ...options, ...keywordOptions, tier });
    if (tier <= 3) {
      if (scored.explanation.some((reason) => /^primary (exact|similar|related) tag match$/.test(reason.label))) scored.tier = 1;
      else if (scored.explanation.some((reason) => /^secondary (exact|similar|related) tag match$/.test(reason.label))) scored.tier = 2;
      else scored.tier = 3;
    }
    scored.passedFilters = [
      `Diagnosis: ${options.diagnosis}`,
      `Category: ${options.category}`,
      "Description gate"
    ];
    return { ...resource, ...scored };
  });
}

export function rankResources(resources, options = {}) {
  const config = options.config || DEFAULT_SCORE_CONFIG;
  const limits = { ...DEFAULT_SCORE_CONFIG.limits, ...(config.limits || {}) };
  const count = normalizeResultCount(options.count, config);
  const rejected = new Set(uniqueNormalized(options.rejectedKeywords || [], 50));
  const primary = uniqueNormalized(options.primaryKeywords || options.directKeywords || [], limits.maximumPrimaryKeywords).filter((item) => !rejected.has(item));
  const secondary = uniqueNormalized(options.confirmedSecondaryKeywords || [], limits.maximumSecondaryKeywords).filter((item) => !rejected.has(item));
  const primaryGateKeywords = extractGateKeywords(primary, config).filter((item) => !rejected.has(item));
  const secondaryGateKeywords = extractGateKeywords(secondary, config).filter((item) => !rejected.has(item));
  const gateKeywords = uniqueNormalized(options.gateKeywords?.length ? options.gateKeywords : [...primaryGateKeywords, ...secondaryGateKeywords], 30).filter((item) => !rejected.has(item));
  const hardFiltered = filterResources(resources, options);
  const basePool = hardFiltered.filter((resource) => passesDescriptionGate(resource, gateKeywords));
  const collected = scorePool(basePool, { ...options, config, primaryKeywords: primary, confirmedSecondaryKeywords: secondary }, 1, { predictedKeywords: [] }).map((resource) => ({ ...resource, gateEvidence: descriptionGateEvidence(resource, { primaryGateKeywords, secondaryGateKeywords, fallbackGateKeywords: gateKeywords }) }));
  const seen = new Set(collected.map((resource) => resource.url || resource.name));

  if (collected.length < count) {
    const expansion = uniqueNormalized(options.expansionKeywords || heuristicKeywordExpansion([...primary, ...secondary], limits.maximumSecondaryKeywords), limits.maximumSecondaryKeywords).filter((item) => !rejected.has(item));
    const expansionPool = hardFiltered.filter((resource) => !seen.has(resource.url || resource.name) && passesDescriptionGate(resource, expansion));
    for (const resource of scorePool(expansionPool, { ...options, config, primaryKeywords: primary, confirmedSecondaryKeywords: secondary }, 4, { predictedKeywords: expansion })) {
      collected.push({ ...resource, gateEvidence: descriptionGateEvidence(resource, { fallbackGateKeywords: expansion }) }); seen.add(resource.url || resource.name);
    }
  }

  if (collected.length < count) {
    const predicted = uniqueNormalized(options.predictedKeywords || [], limits.maximumPredictedKeywords).filter((item) => !rejected.has(item));
    const predictedPool = hardFiltered.filter((resource) => !seen.has(resource.url || resource.name) && passesDescriptionGate(resource, predicted));
    for (const resource of scorePool(predictedPool, { ...options, config, primaryKeywords: primary, confirmedSecondaryKeywords: secondary }, 5, { predictedKeywords: predicted })) collected.push({ ...resource, gateEvidence: descriptionGateEvidence(resource, { fallbackGateKeywords: predicted }) });
  }

  return collected.filter((resource) => resource.score >= limits.minimumScore).sort((a, b) => a.tier - b.tier || b.score - a.score || Number(b.gateEvidence?.confidence || 0) - Number(a.gateEvidence?.confidence || 0) || String(a.name).localeCompare(String(b.name))).slice(0, count);
}

export function clarificationQuestions({ topic = "", description = "", maxQuestions = 2 } = {}) {
  const text = normalizeText(description);
  const questions = [];
  const legalSpecific = /\b(iep|idea|504|medicaid|discrimination|conservatorship|guardianship|regional center)\b/.test(text);
  if (normalizeText(topic) === "legal" && !legalSpecific && text.split(" ").length < 14) {
    questions.push({
      id: "legal_issue",
      question: "Which legal issue is most important for this search?",
      options: ["IEP", "IDEA", "504", "Disability rights", "Medicaid", "Conservatorship", "Guardianship", "Regional Center support"]
    });
  }
  if (/\b(sport|activity|program|support)\b/.test(text) && !/\b(online|in person|small group|1 on 1|individual|sensory|quiet)\b/.test(text)) {
    questions.push({ id: "format", question: "Do you prefer small-group, 1-on-1, sensory-friendly, online, or in-person support?", options: ["Small group", "1-on-1", "Sensory-friendly", "Online", "In person"] });
  }
  return questions.slice(0, Math.max(0, Math.min(2, maxQuestions)));
}
