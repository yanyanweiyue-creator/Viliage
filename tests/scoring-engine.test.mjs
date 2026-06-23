import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORE_CONFIG, extractKeywords, heuristicKeywordExpansion, inferIssuePreferences, rankResources, scoreResource } from "../scoring-engine.mjs";

test("tag matches outrank description matches and are not double counted", () => {
  const exactTag = scoreResource({ name: "Tag resource", tags: ["autism"], description: "Autism family support", categories: [], issues: [] }, {
    directKeywords: ["autism"], config: DEFAULT_SCORE_CONFIG
  });
  const descriptionOnly = scoreResource({ name: "Description resource", tags: [], description: "Autism family support", categories: [], issues: [] }, {
    directKeywords: ["autism"], config: DEFAULT_SCORE_CONFIG
  });
  assert.equal(exactTag.score, 10);
  assert.equal(exactTag.explanation.length, 1);
  assert.equal(descriptionOnly.score, 3);
  assert.ok(exactTag.score > descriptionOnly.score);
});

test("AI-style synonyms use reduced weights and issue penalties stack", () => {
  const scored = scoreResource({
    name: "Community group",
    tags: ["peer interaction"],
    description: "Friendship practice for families",
    categories: ["Education"],
    issues: ["Expensive", "Long waitlist"]
  }, {
    directKeywords: ["education"],
    suggestedKeywords: ["peer interaction", "friendship"],
    issuePreferences: ["expensive", "long waitlist"],
    config: DEFAULT_SCORE_CONFIG
  });
  assert.equal(scored.score, -10);
  assert.equal(scored.explanation.filter((reason) => reason.points < 0).length, 2);
});

test("ranking enforces configurable threshold and requested result count", () => {
  const resources = Array.from({ length: 12 }, (_, index) => ({
    name: `Resource ${index}`,
    tags: [index < 8 ? "autism" : "unrelated"],
    description: "Community support",
    categories: [],
    issues: [],
    url: `https://example.com/${index}`
  }));
  const ranked = rankResources(resources, { directKeywords: ["autism"], count: 7, config: DEFAULT_SCORE_CONFIG });
  assert.equal(ranked.length, 7);
  assert.ok(ranked.every((resource) => resource.score === 10));
});

test("keyword helpers normalize plural forms, expand synonyms, and infer conflicts", () => {
  const direct = extractKeywords(["Social skills, parents"], 10);
  const expanded = heuristicKeywordExpansion(direct, 10);
  const issues = inferIssuePreferences(["I need an affordable option soon that takes insurance"]);
  assert.ok(direct.includes("parent"));
  assert.ok(expanded.includes("peer interaction"));
  assert.ok(issues.includes("expensive"));
  assert.ok(issues.includes("long waitlist"));
  assert.ok(issues.includes("not insurance accepted"));
});
