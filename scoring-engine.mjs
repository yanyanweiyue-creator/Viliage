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
  version: "3.0",
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
    maximumFollowUpQuestions: 3
  }
};

const LIFE_STAGE_ALIASES = Object.freeze({
  "0-3": ["0 3", "0-3", "birth to 3", "early intervention", "infant", "toddler"],
  "4-7": ["4 7", "4-7", "preschool", "kindergarten", "early elementary"],
  "8-12": ["8 12", "8-12", "elementary", "primary school", "childhood"],
  "13-18": ["13 18", "13-18", "teen", "teenager", "middle school", "high school", "adolescent"],
  adult: ["adult", "young adult", "transition age", "college", "workforce"],
  "all ages": ["all age", "all ages", "any age", "children and adult", "family"]
});

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

export function extractLifeStages(values, limit = 4) {
  const text = normalizeText(values.flat(Infinity).filter(Boolean).join(" "));
  const matches = [];
  for (const [stage, aliases] of Object.entries(LIFE_STAGE_ALIASES)) {
    if (aliases.some((alias) => {
      const normalized = normalizeText(alias);
      return normalized && (` ${text} `.includes(` ${normalized} `) || text.includes(normalized));
    })) matches.push(stage);
  }
  return [...new Set(matches)].slice(0, limit);
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

function resourceLifeStages(resource) {
  return extractLifeStages([
    resource.age,
    resource.ageRange,
    resource.age_range,
    resource.lifeStage,
    resource.life_stage,
    resource.tags,
    resource.description
  ], 8);
}

function lifeStageMatches(resource, requiredStages = []) {
  const required = extractLifeStages(requiredStages, 8);
  if (!required.length) return true;
  const stages = resourceLifeStages(resource);
  if (!stages.length || stages.includes("all ages")) return true;
  return required.some((stage) => stages.includes(stage));
}

export function filterResources(resources, { diagnosis, category, age, lifeStage, lifeStages = [] } = {}) {
  const requiredStages = extractLifeStages([age, lifeStage, lifeStages], 8);
  return resources.filter((resource) => diagnosisMatches(resource.diagnosis, diagnosis) && categoryMatches(resource.categories, category) && lifeStageMatches(resource, requiredStages));
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
      ...(options.lifeStages?.length ? [`Life stage: ${options.lifeStages.join(", ")}`] : []),
      "Description gate"
    ];
    return { ...resource, ...scored };
  });
}

function categoryBroadeningKeywords(category, keywords = [], limit = 12) {
  const categoryKey = normalizeText(category);
  const broad = {
    education: ["school", "learning", "academic", "student", "accommodation", "iep", "504"],
    legal: ["rights", "advocacy", "lawyer", "attorney", "disability rights", "regional center"],
    recreation: ["activity", "social", "community", "sports", "camp", "sensory friendly"],
    support: ["family", "caregiver", "support group", "navigation", "case management"]
  };
  return uniqueNormalized([categoryKey, ...(broad[categoryKey] || []), ...keywords], limit);
}

export function rankResources(resources, options = {}) {
  const config = options.config || DEFAULT_SCORE_CONFIG;
  const limits = { ...DEFAULT_SCORE_CONFIG.limits, ...(config.limits || {}) };
  const count = normalizeResultCount(options.count, config);
  const rejected = new Set(uniqueNormalized(options.rejectedKeywords || [], 50));
  const primary = uniqueNormalized(options.primaryKeywords || options.directKeywords || [], limits.maximumPrimaryKeywords).filter((item) => !rejected.has(item));
  const secondary = uniqueNormalized(options.confirmedSecondaryKeywords || [], limits.maximumSecondaryKeywords).filter((item) => !rejected.has(item));
  const lifeStages = extractLifeStages([options.age, options.lifeStage, options.lifeStages], 8);
  const primaryGateKeywords = extractGateKeywords(primary, config).filter((item) => !rejected.has(item));
  const secondaryGateKeywords = extractGateKeywords(secondary, config).filter((item) => !rejected.has(item));
  const gateKeywords = uniqueNormalized(options.gateKeywords?.length ? options.gateKeywords : [...primaryGateKeywords, ...secondaryGateKeywords], 30).filter((item) => !rejected.has(item));
  const scoringOptions = { ...options, lifeStages, config, primaryKeywords: primary, confirmedSecondaryKeywords: secondary };
  const hardFiltered = filterResources(resources, scoringOptions);
  const basePool = hardFiltered.filter((resource) => passesDescriptionGate(resource, gateKeywords));
  const collected = scorePool(basePool, scoringOptions, 1, { predictedKeywords: [] }).map((resource) => ({ ...resource, gateEvidence: descriptionGateEvidence(resource, { primaryGateKeywords, secondaryGateKeywords, fallbackGateKeywords: gateKeywords }) }));
  const seen = new Set(collected.map((resource) => resource.url || resource.name));

  if (collected.length < count && (primary.length || secondary.length || uniqueNormalized(options.predictedKeywords || [], 4).length)) {
    const expansion = uniqueNormalized(options.expansionKeywords || heuristicKeywordExpansion([...primary, ...secondary], limits.maximumSecondaryKeywords), limits.maximumSecondaryKeywords).filter((item) => !rejected.has(item));
    const expansionPool = hardFiltered.filter((resource) => !seen.has(resource.url || resource.name) && passesDescriptionGate(resource, expansion));
    for (const resource of scorePool(expansionPool, scoringOptions, 4, { predictedKeywords: expansion })) {
      collected.push({ ...resource, gateEvidence: descriptionGateEvidence(resource, { fallbackGateKeywords: expansion }) }); seen.add(resource.url || resource.name);
    }
  }

  if (collected.length < count && (primary.length || secondary.length || uniqueNormalized(options.predictedKeywords || [], 4).length)) {
    const predicted = uniqueNormalized(options.predictedKeywords || [], limits.maximumPredictedKeywords).filter((item) => !rejected.has(item));
    const predictedPool = hardFiltered.filter((resource) => !seen.has(resource.url || resource.name) && passesDescriptionGate(resource, predicted));
    for (const resource of scorePool(predictedPool, scoringOptions, 5, { predictedKeywords: predicted })) {
      collected.push({ ...resource, gateEvidence: descriptionGateEvidence(resource, { fallbackGateKeywords: predicted }) });
      seen.add(resource.url || resource.name);
    }
  }

  if (collected.length < count && (primary.length || secondary.length || uniqueNormalized(options.predictedKeywords || [], 4).length)) {
    const broad = categoryBroadeningKeywords(options.category, [...primary, ...secondary], limits.maximumPredictedKeywords).filter((item) => !rejected.has(item));
    const broadPool = hardFiltered.filter((resource) => !seen.has(resource.url || resource.name) && passesDescriptionGate(resource, broad));
    for (const resource of scorePool(broadPool, scoringOptions, 6, { predictedKeywords: broad })) {
      collected.push({ ...resource, gateEvidence: descriptionGateEvidence(resource, { fallbackGateKeywords: broad }) });
      seen.add(resource.url || resource.name);
    }
  }

  return collected.filter((resource) => resource.score >= limits.minimumScore).sort((a, b) => a.tier - b.tier || b.score - a.score || Number(b.gateEvidence?.confidence || 0) - Number(a.gateEvidence?.confidence || 0) || String(a.name).localeCompare(String(b.name))).slice(0, count);
}

export function clarificationQuestions({ topic = "", description = "", maxQuestions = 3 } = {}) {
  const text = normalizeText(description);
  const topicKey = normalizeText(topic);
  const questions = [];
  const legalSpecific = /\b(iep|idea|504|medicaid|discrimination|conservatorship|guardianship|regional center)\b/.test(text);
  if (topicKey === "legal" && !legalSpecific && text.split(" ").length < 14) {
    questions.push({
      id: "legal_issue",
      question: "Which legal issue is most important for this search?",
      options: ["IEP", "IDEA", "504", "Disability rights", "Medicaid", "Conservatorship", "Guardianship", "Regional Center support"]
    });
  }
  if (/\b(sport|activity|program|support)\b/.test(text) && !/\b(online|in person|small group|1 on 1|individual|sensory|quiet)\b/.test(text)) {
    questions.push({ id: "format", question: "Do you prefer small-group, 1-on-1, sensory-friendly, online, or in-person support?", options: ["Small group", "1-on-1", "Sensory-friendly", "Online", "In person"] });
  }
  if (!extractLifeStages([text]).length) {
    questions.push({ id: "life_stage", question: "Which age or life stage should Waffles prioritize?", options: ["0-3", "4-7", "8-12", "13-18", "Adult", "All ages"] });
  }
  if (!questions.length) {
    questions.push({ id: "priority", question: "Which detail should Waffles prioritize for this search?", options: ["Most relevant match", "Low cost", "Available soon", "Local/in-person", "Online"] });
  }
  return questions.slice(0, Math.max(1, Math.min(3, maxQuestions)));
}

export const CLARIFICATION_TRANSLATIONS = Object.freeze({
  en: {
    legal_issue: "Which legal issue is most important for this search?",
    format: "Do you prefer small-group, 1-on-1, sensory-friendly, online, or in-person support?",
    life_stage: "Which age or life stage should Waffles prioritize?",
    priority: "Which detail should Waffles prioritize for this search?",
    "Disability rights": "Disability rights",
    Medicaid: "Medicaid",
    Conservatorship: "Conservatorship",
    Guardianship: "Guardianship",
    "Regional Center support": "Regional Center support",
    "Small group": "Small group",
    "1-on-1": "1-on-1",
    "Sensory-friendly": "Sensory-friendly",
    Online: "Online",
    "In person": "In person",
    Adult: "Adult",
    "All ages": "All ages",
    "Most relevant match": "Most relevant match",
    "Low cost": "Low cost",
    "Available soon": "Available soon",
    "Local/in-person": "Local/in-person"
  },
  zh: {
    legal_issue: "这次搜索最重要的法律议题是什么？",
    format: "你更偏好小组、1 对 1、低感官刺激、线上，还是线下支持？",
    life_stage: "Waffles 应该优先考虑哪个年龄或人生阶段？",
    priority: "这次搜索最应该优先考虑哪一项？",
    "Disability rights": "残障权益",
    Medicaid: "Medicaid / 医疗补助",
    Conservatorship: "监护/保佐相关",
    Guardianship: "监护权相关",
    "Regional Center support": "区域中心支持",
    "Small group": "小组",
    "1-on-1": "1 对 1",
    "Sensory-friendly": "低感官刺激",
    Online: "线上",
    "In person": "线下",
    Adult: "成人",
    "All ages": "所有年龄",
    "Most relevant match": "最相关",
    "Low cost": "低费用",
    "Available soon": "近期可用",
    "Local/in-person": "本地/线下"
  },
  es: {
    legal_issue: "¿Qué tema legal es más importante para esta búsqueda?",
    format: "¿Prefieres apoyo en grupo pequeño, 1 a 1, sensorialmente amable, en línea o presencial?",
    life_stage: "¿Qué edad o etapa debe priorizar Waffles?",
    priority: "¿Qué detalle debe priorizar Waffles en esta búsqueda?",
    "Disability rights": "Derechos de discapacidad",
    Medicaid: "Medicaid",
    Conservatorship: "Curatela",
    Guardianship: "Tutela",
    "Regional Center support": "Apoyo del Regional Center",
    "Small group": "Grupo pequeño",
    "1-on-1": "1 a 1",
    "Sensory-friendly": "Sensorialmente amable",
    Online: "En línea",
    "In person": "Presencial",
    Adult: "Adulto",
    "All ages": "Todas las edades",
    "Most relevant match": "Coincidencia más relevante",
    "Low cost": "Bajo costo",
    "Available soon": "Disponible pronto",
    "Local/in-person": "Local/presencial"
  }
});
