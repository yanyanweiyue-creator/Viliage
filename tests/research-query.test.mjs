import test from "node:test";
import assert from "node:assert/strict";
import { prepareResearchQuery } from "../research-query.mjs";

test("English keywords and acronyms do not require translation or an API key", async () => {
  for (const text of ["tennis", "IEP", "504", "I need tennis activities"]) {
    assert.deepEqual(await prepareResearchQuery(text), { text, translated: false });
  }
});

test("Chinese search translation sends only the original query and preserves explicit constraints", async () => {
  const originalFetch = globalThis.fetch;
  const query = "寻找适合13-18岁的免费网球活动，不要线上课程";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const input = JSON.parse(options.body);
    assert.equal(input.input, query);
    assert.equal(input.store, false);
    assert.equal(input.text.format.name, "research_query_translation");
    assert.equal(input.model, "test-model");
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ searchText: "Free tennis activities for ages 13-18, not online courses" }) }] }] });
  };
  try {
    assert.deepEqual(await prepareResearchQuery(query, { apiKey: "test-key", model: "test-model" }), {
      text: "Free tennis activities for ages 13-18, not online courses", translated: true
    });
  } finally { globalThis.fetch = originalFetch; }
});

test("translation failures are explicit instead of becoming empty search results", async () => {
  await assert.rejects(prepareResearchQuery("网球"), /Search translation is temporarily unavailable/);
  const originalFetch = globalThis.fetch;
  try {
    for (const payload of [null, { output_text: "not JSON" }, { output_text: '{"searchText":""}' }, { output_text: '{"searchText":"网球"}' }, { status: "incomplete", output_text: '{"searchText":"tennis"}' }]) {
      globalThis.fetch = async () => payload === null ? new Response("Unavailable", { status: 503 }) : Response.json(payload);
      await assert.rejects(prepareResearchQuery("网球", { apiKey: "test-key" }), /Search translation is temporarily unavailable/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
