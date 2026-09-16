import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSheetRows } from "../resource-sheet.mjs";
import { extractKeywords, extractGateKeywords, rankResources } from "../scoring-engine.mjs";
import { resourceColumns, resourceTable } from "./fixtures/resource-sheet.mjs";

test("live sheet headers preserve categories, locations, and tags beyond Tag5", () => {
  const [resource] = normalizeSheetRows(resourceTable());
  assert.deepEqual(resource.categories, ["Recreation"]);
  assert.equal(resource.diagnosis, "Autism");
  assert.equal(resource.location, "Santa Clara, CA");
  assert.deepEqual(resource.tags, ["Adaptive Tennis", "Social Skills Development", "Tennis Instruction", "Volunteer Coaching"]);
  assert.equal(resource.price, "Scholarships available");
  const primaryKeywords = extractKeywords(["volunteer coaching"]);
  const matches = rankResources([resource], { diagnosis: "Autism", category: "Recreation", primaryKeywords, gateKeywords: extractGateKeywords(primaryKeywords) });
  assert.equal(matches.length, 1, "a match present only in Tag15 remains searchable");
});

test("column reordering and normalized header names do not change resource data", () => {
  const reordered = resourceTable([...resourceColumns].reverse());
  reordered.cols = reordered.cols.map(({ label }) => ({ label: ` ${label.replace(/(\d+)$/, "_$1").toUpperCase()} ` }));
  assert.deepEqual(normalizeSheetRows(reordered), normalizeSheetRows(resourceTable()));
});

test("legacy Category1, Location1 and Issue headers remain supported", () => {
  const table = { cols: ["URL", "Description", "Diagnosis", "Category1", "Category2", "Location1", "Tag1", "Issues", "Issue2"].map((label) => ({ label })), rows: [{ c: ["https://example.com/legacy", "Legacy resource", "Both", "Recreation", "Education", "San Jose", "Tennis", "Long waitlist", "High cost"].map((v) => ({ v })) }] };
  const [resource] = normalizeSheetRows(table);
  assert.deepEqual(resource.categories, ["Recreation", "Education"]);
  assert.equal(resource.location, "San Jose");
  assert.deepEqual(resource.issues, ["Long waitlist", "High cost"]);
});

test("missing named columns never fall back to unrelated cells", () => {
  const table = resourceTable(resourceColumns.filter((label) => !/^Category|^Location|^Tag/.test(label)));
  const [resource] = normalizeSheetRows(table);
  assert.deepEqual(resource.categories, []);
  assert.deepEqual(resource.tags, []);
  assert.equal(resource.location, "See website");
});

test("entirely unlabeled sheets retain the original positional layout", () => {
  const values = ["https://example.com/legacy", "Legacy tennis", "Both", "Recreation", "", "All ages", "Tennis", "", "", "", "", "", "San Jose", "", "", "", "", "Free"];
  const [resource] = normalizeSheetRows({ cols: values.map((_, index) => ({ id: String.fromCharCode(65 + index), label: "" })), rows: [{ c: values.map((v) => ({ v })) }] });
  assert.deepEqual(resource.categories, ["Recreation"]);
  assert.deepEqual(resource.tags, ["Tennis"]);
  assert.equal(resource.location, "San Jose");
  assert.equal(resource.price, "Free");
});

test("Error1 warnings reach scoring and retain the configured severity penalties", () => {
  const table = resourceTable();
  const index = resourceColumns.indexOf("Error1");
  table.rows[0].c[index] = { v: "⚠️ Waitlist; Major: service closed" };
  const [resource] = normalizeSheetRows(table);
  assert.deepEqual(resource.issues, ["⚠️ Waitlist", "Major: service closed"]);
  const primaryKeywords = extractKeywords(["tennis"]);
  const [scored] = rankResources([resource], { diagnosis: "Autism", category: "Recreation", primaryKeywords });
  assert.deepEqual(scored.explanation.filter((item) => item.points < 0).map((item) => item.points), [-2, -5]);
});
