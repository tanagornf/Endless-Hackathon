# F07 knowledge search

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F07 | knowledge-search | B1 | DOING | R | A | OpenAI embed at 1536 dimensions, production smoke | | Fixture lifecycle 3/3 in 76.27 s. B1 app-dev real full fixture A 49/49 and B 1/1 executed. C0 deployed TH/EN retrieval verified partially. | 2026-11-21 14:36 | Remaining saved-case editing, cache, rerank and production source-drawer smoke pending. |

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
- This seed-only run measured 22 of Demo A's 49 applicable cases from fixture v1, which has 50 across both shops. The evaluated cases included 14 Thai, one English and seven cross-language. Recall at 1, 3 and 5 was 1.000 across the 12 positives, with group positive counts seven, one and four. MRR was 1.000. Off-topic cases passed 7/7 and forbidden-item cases passed 3/3. These results apply to the seed-only corpus.
- The evaluation continuation records each case's effective retrieval method and the aggregate method counts. Comparisons require the same case set and published index snapshot. Previous runs without stored coverage display unknown coverage, and unresolved forbidden aliases are excluded from measured passes. The focused API, metric and Thai and English UI regressions passed 9/9 in 70.47 s.

## Saved retrieval cases

- `/knowledge-search` has Thai and English saved-case controls for members with `product.write`. A case specifies expected shop knowledge or an empty result. Read-only staff can see the saved cases and use them in evaluation. Create and delete persist with tenant-scoped audit events that omit the question text.
- The isolated B1 PostgreSQL tests passed 2/2 in 26.00 s. They exercised positive and no-result cases through create, read, run and delete, staff write denials, foreign knowledge and case isolation, malformed expectations and concurrent deletion with exactly one audit event. The rendered controls and i18n suite passed 34/34 in 5.97 s across English and Thai. Coordinated production smoke is pending.

## S2 full synthetic corpus

- The Thai and English merchant workbench can load and archive the Demo A sample set. Its durable job yields while the normal F07 index jobs run, then activates ready items through F05. The test used one worker. Three regressions passed in 76.27 s, covering permission and tenant limits, deduplication, 12 active indexed items, 49 available cases, archive safety, and a queued replay after removal.
- The B1 app-dev loader job `e7dfff06-6b41-46eb-8845-d43ba67c8e81` on `43207fc` loaded and activated 12 items in 27.110 s. Demo A evaluation `3883f04a-c034-4e39-8b84-011641a0f10c` executed 49/49 cases with 15 searchable items and 17 chunks. Recall at 1/3/5 was 0.872/0.974/0.974 and MRR was 0.923 over 39 positives. The only failed case was `q12`. Off-topic passed 7/7 and forbidden 3/3.
- Demo A recall at 1/3/5 by group was Thai 0.870/0.957/0.957 (23 positives), English 1.000/1.000/1.000 (two positives), and cross-language 0.857/1.000/1.000 (14 positives). Cross-language off-topic passed 3/3. Demo B evaluation `5c964103-711d-41c1-886c-757c97cc9cbe` executed its one Thai case with recall at 1/3/5 and MRR all 1.000. Demo B has no off-topic or forbidden fixture cases.
- Both measured runs used live hybrid retrieval with `text-embedding-3-large` at 1536 dimensions and no stale vectors. The 62 calls comprised 12 document and 50 query embeddings, with zero errors, 2,263 input tokens and 296 USD micros in `model_usage`. Demo A evaluation took 9.013 s and Demo B took 1.564 s. All 12 added B1 dev fixtures were archived afterward and none remained active.
- C0's production check on deployed `638e150` verified live Thai hours and English returns ranked first at revision 2. The other-shop marker was excluded on the completed check after an initial search error during rollout. The revised Playwright cases follow the returned item and revision into the source panel. Production browser verification of that panel and saved-case controls remains pending.

## S2 query embedding cache

- `/search` reports cache hits and separate embedding and database timings. The cache stores a tenant-scoped hash of the normalized query, model and dimension with the embedding and creation time. Entries expire after 14 days, indexing prunes expired entries and demo reset clears both demo tenants' caches.
- The isolated B1 PostgreSQL suite passed 3/3 in 28.00 s. Tests cover an API miss followed by a normalized hit with a single embedding call, separation by tenant and model, the fixed index dimension guard, expired refresh and pruning, and uncached lexical fallback for fake embeddings and provider errors. Embeddings were synthetic during this test run.
- B1 app-dev at `ac47dab` ran two normalized synthetic lookups in real hybrid mode with `text-embedding-3-large` at 1536 dimensions. The first query missed and the second hit, with one successful OpenAI call (30 input tokens, 4 USD micros). Observed embedding time was 1,790 ms then 87 ms, and total time was 1,986 ms then 292 ms. The unique synthetic cache row was removed after verification. These two observations are development measurements. Production smoke is pending.
- The combined reset regression checks that F07 clears cached vectors, fixture requests, saved cases and measured runs for both demo shops in one transaction.
