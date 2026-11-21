# F07 knowledge search

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F07 | knowledge-search | B1 | DOING | R | A | OpenAI embed at 1536 dimensions, production smoke | | Lane migration passed. 17 F05 and F07 tests passed under fake-model mode. | 2026-11-21 12:24 | Production provider verification and workbench slices pending. |

## Log

- S1 adds tenant-scoped Thai and English chunking, F35 indexing, hybrid retrieval and revision citations. F05 now uses the real index port.
- The tests cover F35 deduplication while queued, running and retrying, and a fresh generation after ready, prior-revision availability, stale publication after a concurrent deactivation, tenant and folder isolation, and vector scoring with synthetic vectors.
- Retrieval confirms the source item is still active even if a status write committed before index cleanup. Index publication locks the F05 source row in the same transaction.
- The English FAQ activation smoke is discoverable with Playwright. Production execution and real-provider retrieval metrics remain pending.

- B1 development smoke used real OpenAI embeddings. Eight seed revisions indexed. Thai opening-hours query ranked the matching FAQ first (0.628). English returns query found the return policy (0.529). The other-shop marker returned zero hits. This was a three-query smoke, with full fixture evaluation pending in S2.