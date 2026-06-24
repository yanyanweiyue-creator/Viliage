# Resource recommendation architecture

## Runtime pipeline

The engine is filter-first and score-second:

1. Filter by the diagnosis associated with the current island. `Both` is accepted on either island; every other diagnosis mismatch is permanently removed.
2. Filter by the category associated with the selected building. The required category must be present in `Category1` or `Category2`.
3. Ask zero to two clarification questions only for materially ambiguous requests. User-entered terms are primary, accepted suggestions are confirmed secondary, and explicitly rejected terms are removed from every later stage.
4. Build the Description Gate from at most 20% of the strongest primary and confirmed-secondary concepts. At least one concept must occur in tags or the description.
5. Score the gate survivors. Primary tag matches receive 25/15/4 points; confirmed-secondary tag matches receive 12/7/2. Description evidence is deliberately weaker. Major and minor issues subtract 5 and 2 points.
6. Sort by tier and score. Direct results always precede synonym expansion, and synonym expansion always precedes AI-predicted results.
7. Run expansion only when the requested count has not been filled. Pass 1 uses deterministic synonyms. Pass 2 calls AI lazily, only after the direct and synonym passes remain short, with maximum weights of 3/1/1.

Every result includes `tier`, `score`, `passedFilters`, `gateEvidence`, `matchedKeywords`, and an additive `explanation` array. Gate evidence records whether primary, confirmed-secondary, or fallback concepts allowed the result to proceed and exposes a confidence value for administrative review.

## API contract

`POST /api/ai/recommend` accepts:

```json
{
  "diagnosis": "Autism",
  "topic": "Legal",
  "description": "I need a Medicaid lawyer",
  "count": 5,
  "clarificationHandled": true,
  "confirmedSecondaryKeywords": ["Disability rights"],
  "rejectedKeywords": ["IEP"]
}
```

When clarification would materially improve matching, the first response contains `needsClarification: true` and no recommendations. The client resubmits the original request with the user's confirmed or rejected concepts.

## Database architecture recommendation

The current Google Sheet remains a compatible editorial source. At larger scale, ingest it into normalized tables:

- `resources(id, name, description, diagnosis_scope, age, url, price, active_at)`
- `resource_categories(resource_id, category_id)`
- `categories(id, normalized_name)`
- `resource_tags(resource_id, tag_id)`
- `tags(id, normalized_name, synonym_group_id)`
- `resource_issues(resource_id, severity, normalized_issue, active_at)`
- `synonym_groups(id, authority, enabled)` and `synonym_terms(group_id, normalized_term)`
- `scoring_config(version, json_config, active_at, created_by)`

Use composite indexes on `(diagnosis_scope, active_at)`, `(category_id, resource_id)`, `(tag_id, resource_id)`, and `(resource_id, severity)`. Add a full-text index on name and description. Diagnosis and category predicates must remain in the SQL candidate query; full-text rank must never reintroduce excluded resource IDs.

For tens of thousands of records, use PostgreSQL full-text search or OpenSearch only to retrieve candidates after the relational hard filters. A precomputed normalized tag/inverted index is sufficient for smaller datasets. Keep final tiering and explanation generation in the application service so Node and Cloudflare share one scoring contract.

## Configuration and examples

All v2.1 weights and limits live in `config/scoring-config.json` and are exposed read-only at `GET /api/scoring-config`.

Example: an Autism + Legal resource that passes the Description Gate, has an exact primary `Medicaid` tag, a confirmed-secondary exact `IEP` tag, an exact primary phrase in the description, and one minor issue scores `25 + 12 + 5 - 2 = 40`.

## Verification

`tests/scoring-engine.test.mjs` covers hard-filter permanence, Description Gate behavior, authority ordering, deduplication, stacked issue penalties, expansion tiers, rejected keywords, and the clarification limit. `tests/cloudflare.test.mjs` exercises the deployed API boundary with database-shaped rows and proves that wrong-diagnosis and wrong-category resources do not reach scoring.
