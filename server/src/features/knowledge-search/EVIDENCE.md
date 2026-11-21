# F07 knowledge search

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F07 | knowledge-search | B1 | DOING | R | A | OpenAI embed at 1536 dimensions, production smoke | | Workbench API and metrics 5/5. TH/EN Playwright smoke discovered. B1 app-dev real seeded retrieval run 22 cases. | 2026-11-21 14:16 | Full corpus loading, remaining S2 controls and production smoke pending. |

## Log

- S1 adds tenant-scoped Thai and English chunking, F35 indexing, hybrid retrieval and revision citations. F05 now uses the real index port.
- The tests cover F35 deduplication while queued, running and retrying, and a fresh generation after ready, prior-revision availability, stale publication after a concurrent deactivation, tenant and folder isolation, and vector scoring with synthetic vectors.
- Retrieval confirms the source item is still active even if a status write committed before index cleanup. Index publication locks the F05 source row in the same transaction.
- The seed checks that ready metadata has every expected non-null vector with the configured model and dimensions. Ordinary seed repairs incomplete fixtures and corrects visibility using the current item and revision under its publication lock. Visibility-only repairs use the existing vectors. An in-flight generation yields a failed seed step without a competing claim.
- The isolated A0 fake-model run exercised missing chunks, null vectors, stale chunk model, visibility repair without model use, and queued or running generations. B0 independently checked tenant scope and readiness against synthetic PostgreSQL rows. The shared admin reset provider guard is tracked in F35.
- The English FAQ activation smoke is discoverable with Playwright. Production execution remains pending.

- B1 development smoke used real OpenAI embeddings. Eight seed revisions indexed. Thai opening-hours query ranked the matching FAQ first (0.628). English returns query found the return policy (0.529). The other-shop marker returned zero hits. This was a three-query smoke, with full fixture evaluation pending in S2.

## S2 workbench

- `/knowledge-search` shows the tenant's index status and actual search results in Thai and English. The search API returns its effective strategy, scores, snippets and source revision. Source reads and run and saved-case listing are tenant scoped. Evaluation persists its run and compares it with the shop's prior metrics.
- The focused workbench integration and grouped metric checks passed 5/5 in 26.29 s in the isolated B1 test database, with the model in fake mode. Both Thai and English Playwright smoke cases are discoverable. Production execution is pending.
- The B1 app-dev real run `9f15a10e-0c9c-4bb1-9205-0bca7f290f89` at implementation `0936380` used hybrid retrieval with the configured OpenAI model `text-embedding-3-large` at 1536 dimensions. Demo A had three searchable items, five indexed chunks and zero stale-model chunks. There were 22 successful query embeddings, 344 input tokens and 46 USD micros in `model_usage`. The measured run took 5.630 s.
- This seed-only run measured 22 of Demo A's 49 applicable cases from fixture v1, which has 50 across both shops. The evaluated cases included 14 Thai, one English and seven cross-language. Recall at 1, 3 and 5 was 1.000 across the 12 positives, with group positive counts seven, one and four. MRR was 1.000. Off-topic cases passed 7/7 and forbidden-item cases passed 3/3. The results apply to this partial corpus. Fixture loading, saved-case editing, query cache, reranking and production verification remain pending.
- The evaluation continuation records each case's effective retrieval method and the aggregate method counts. Comparisons require the same case set and published index snapshot. Previous runs without stored coverage display unknown coverage, and unresolved forbidden aliases are excluded from measured passes. The focused API, metric and Thai and English UI regressions passed 9/9 in 70.47 s.

## Saved retrieval cases

- `/knowledge-search` has Thai and English saved-case controls for members with `product.write`. A case specifies expected shop knowledge or an empty result. Read-only staff can see the saved cases and use them in evaluation. Create and delete persist with tenant-scoped audit events that omit the question text.
- The isolated B1 PostgreSQL tests passed 2/2 in 26.00 s. They exercised positive and no-result cases through create, read, run and delete, staff write denials, foreign knowledge and case isolation, malformed expectations and concurrent deletion with exactly one audit event. The rendered controls and i18n suite passed 34/34 in 5.97 s across English and Thai. Coordinated production smoke is pending.
