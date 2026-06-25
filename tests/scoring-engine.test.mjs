import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORE_CONFIG, clarificationQuestions, descriptionGateEvidence, extractGateKeywords, extractKeywords, extractLifeStages, heuristicKeywordExpansion, inferIssuePreferences, normalizeResultCount, rankResources, scoreResource } from "../scoring-engine.mjs";

const resource = (overrides = {}) => ({
  name: "Resource",
  url: `https://example.com/${Math.random()}`,
  diagnosis: "Autism",
  categories: ["Legal"],
  tags: ["Medicaid"],
  description: "Legal Medicaid assistance",
  issues: [],
  ...overrides
});

test("diagnosis and category are permanent hard filters", () => {
  const ranked = rankResources([
    resource({ name: "Allowed" }),
    resource({ name: "Wrong diagnosis", diagnosis: "ADHD", tags: ["Medicaid", "lawyer"] }),
    resource({ name: "Wrong category", categories: ["Education"], tags: ["Medicaid", "lawyer"] }),
    resource({ name: "Both is allowed", diagnosis: "Both" })
  ], {
    diagnosis: "Autism", category: "Legal", gateKeywords: ["Medicaid"], primaryKeywords: ["Medicaid"], count: 10
  });
  assert.deepEqual(ranked.map((item) => item.name), ["Allowed", "Both is allowed"]);
  assert.ok(ranked.every((item) => item.passedFilters.length === 3));
});

test("life stage is a permanent hard filter when provided", () => {
  const ranked = rankResources([
    resource({ name: "Middle school", age: "13-18", tags: ["IEP"] }),
    resource({ name: "Elementary", age: "8-12", tags: ["IEP"] }),
    resource({ name: "All ages", age: "All ages", tags: ["IEP"] })
  ], {
    diagnosis: "Autism", category: "Legal", lifeStage: "middle school", gateKeywords: ["IEP"], primaryKeywords: ["IEP"], count: 10
  });
  assert.deepEqual(new Set(ranked.map((item) => item.name)), new Set(["Middle school", "All ages"]));
  assert.ok(ranked.every((item) => item.passedFilters.some((filter) => filter.startsWith("Life stage:"))));
});

test("description gate excludes irrelevant resources before scoring", () => {
  const ranked = rankResources([
    resource({ name: "Gate pass" }),
    resource({ name: "Gate fail", tags: ["lawyer"], description: "General legal help" })
  ], { diagnosis: "Autism", category: "Legal", gateKeywords: ["Medicaid"], primaryKeywords: ["lawyer"], count: 5 });
  assert.equal(ranked[0].name, "Gate pass");
  assert.equal(ranked[0].tier, 3);
  assert.equal(ranked.find((item) => item.name === "Gate fail")?.tier, 4);
});

test("primary tags outrank confirmed secondary and predicted matches", () => {
  const primary = scoreResource(resource({ tags: ["Medicaid"], description: "" }), { primaryKeywords: ["Medicaid"] });
  const secondary = scoreResource(resource({ tags: ["Medicaid"], description: "" }), { confirmedSecondaryKeywords: ["Medicaid"] });
  const predicted = scoreResource(resource({ tags: ["Medicaid"], description: "" }), { predictedKeywords: ["Medicaid"] });
  assert.equal(primary.score, 25);
  assert.equal(secondary.score, 12);
  assert.equal(predicted.score, 3);
  assert.ok(primary.score > secondary.score && secondary.score > predicted.score);
});

test("base candidates are assigned to direct, confirmed-secondary, and description-only tiers", () => {
  const ranked = rankResources([
    resource({ name: "Primary", tags: ["Medicaid"] }),
    resource({ name: "Secondary", tags: ["IEP"], description: "Medicaid and IEP support" }),
    resource({ name: "Description only", tags: [], description: "Medicaid assistance" })
  ], {
    diagnosis: "Autism", category: "Legal", gateKeywords: ["Medicaid"], primaryKeywords: ["Medicaid"], confirmedSecondaryKeywords: ["IEP"], count: 5
  });
  assert.deepEqual(ranked.map((item) => item.tier), [1, 2, 3]);
});

test("tag matches are not double counted in descriptions and issue penalties stack", () => {
  const scored = scoreResource(resource({ description: "Medicaid help", issues: ["Minor: long waitlist", "Major: service closed"] }), {
    primaryKeywords: ["Medicaid"]
  });
  assert.equal(scored.score, 18);
  assert.equal(scored.explanation.filter((reason) => reason.keyword === "medicaid").length, 1);
  assert.equal(scored.explanation.filter((reason) => reason.points < 0).length, 2);
});

test("expansion runs only to fill missing slots and never outranks tier 1", () => {
  const ranked = rankResources([
    resource({ name: "Direct", tags: ["sports"], description: "Sports program", categories: ["Activities"] }),
    resource({ name: "Expanded", tags: ["recreation"], description: "Recreation program", categories: ["Activities"] })
  ], {
    diagnosis: "Autism", category: "Activities", gateKeywords: ["sports"], primaryKeywords: ["sports"], expansionKeywords: ["recreation"], count: 5
  });
  assert.equal(ranked[0].name, "Direct");
  assert.equal(ranked[0].tier, 1);
  assert.equal(ranked[1].tier, 4);
});

test("category broadening is the lowest-priority expansion tier", () => {
  const ranked = rankResources([
    resource({ name: "Direct", tags: ["lawyer"], description: "Lawyer support" }),
    resource({ name: "Broad", tags: ["advocacy"], description: "Advocacy clinic" })
  ], {
    diagnosis: "Autism", category: "Legal", gateKeywords: ["lawyer"], primaryKeywords: ["lawyer"], expansionKeywords: [], count: 5
  });
  assert.equal(ranked[0].tier, 1);
  assert.equal(ranked[1].tier, 6);
});

test("rejected keywords never enter filtering or scoring", () => {
  const ranked = rankResources([resource()], {
    diagnosis: "Autism", category: "Legal", gateKeywords: ["Medicaid"], primaryKeywords: ["Medicaid"], rejectedKeywords: ["Medicaid"], count: 5
  });
  assert.equal(ranked.length, 0);
});

test("keyword helpers enforce a small gate set and clarification asks one to three questions", () => {
  const primary = extractKeywords(["local quiet sports activities for a child with autism and small group attention"], 20);
  const gate = extractGateKeywords(primary, DEFAULT_SCORE_CONFIG);
  assert.ok(gate.length <= Math.max(1, Math.floor(primary.length * 0.2)));
  assert.ok(heuristicKeywordExpansion(["sports"], 10).includes("recreation"));
  assert.ok(inferIssuePreferences(["affordable and soon"]).includes("long waitlist"));
  const questions = clarificationQuestions({ topic: "Legal", description: "Find a lawyer" });
  assert.ok(questions.length >= 1 && questions.length <= 3);
  assert.deepEqual(extractKeywords(["Find me a lawyer"], 10), ["lawyer"]);
  assert.deepEqual(extractLifeStages(["middle school student"]), ["13-18"]);
});

test("description gate evidence preserves primary authority over confirmed secondary terms", () => {
  const evidence = descriptionGateEvidence(resource({ tags: ["Medicaid", "IEP"] }), {
    primaryGateKeywords: ["Medicaid"],
    secondaryGateKeywords: ["IEP"]
  });
  assert.equal(evidence.authority, "primary");
  assert.equal(evidence.confidence, 3);
  assert.deepEqual(evidence.primaryMatches, ["medicaid"]);
  assert.deepEqual(evidence.secondaryMatches, ["iep"]);
});

test("requested resource count is rounded and clamped to configured limits", () => {
  assert.equal(normalizeResultCount(1), 3);
  assert.equal(normalizeResultCount(6.6), 7);
  assert.equal(normalizeResultCount(99), 10);
  assert.equal(normalizeResultCount("not-a-number"), 5);
});
