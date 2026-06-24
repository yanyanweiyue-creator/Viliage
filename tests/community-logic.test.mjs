import test from "node:test";
import assert from "node:assert/strict";
import { communitySimilarity, pairKey, safeDisplayName } from "../community-logic.mjs";

test("community matching uses shared survey fields without exposing notes", () => {
  const current = { responses: { interests: ["ADHD", "Autism"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"], note: "private current note" } };
  const candidate = { responses: { interests: ["ADHD"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"], note: "private candidate note" } };
  const match = communitySimilarity(current, candidate);
  assert.equal(match.score, 10);
  assert.ok(match.reasons.some((reason) => reason.includes("ADHD")));
  assert.equal(JSON.stringify(match).includes("private"), false);
});

test("connection pairs are stable and display names are sanitized", () => {
  assert.equal(pairKey("z-user", "a-user"), "a-user:z-user");
  assert.equal(pairKey("a-user", "z-user"), "a-user:z-user");
  assert.equal(safeDisplayName(" <Mira>\n "), "Mira");
});
