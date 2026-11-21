# F05 knowledge

## Owner consultation knowledge

- The F05 owner-consultation draft service accepts generalized title and body after rechecking a same-shop F04 receipt with explicit reuse consent. Replayed receipts are idempotent. The stored provenance is separate from imports and web citations. Customer case text, private rationale and reviewed customer-specific copy stay in F04.
- At `/knowledge/:itemId`, the Thai and English approval dialog pins the exact revision the owner reviewed. Only the authenticated shop owner can activate it, and F05 rechecks the consent before approval. The actor, revision and opaque receipt ID are audited with the status change. F07 indexes only after approval, without publishing a pending draft.
- The isolated paired B1/ef2d2ce test tree `1cff9d9` passed 3/3 in 37.93 s with `MODEL_MODE=fake`, including the real F04 answer route and tenant-scoped F07 worker. Thai and English rendered UI and i18n passed 34/34. The paired typecheck passed. Production integration is pending.

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F05 | knowledge | B1 | DOING | R | A | F05 moderation and production smoke | | Typecheck passed. Lane migration applied. Knowledge plus registry and i18n checks passed 55/55. | 2026-11-21 12:54 | Production smoke and S3 remain pending. |

## Log

- S1 adds tenant-scoped draft, review, activation, deactivation, deletion, revision snapshots, bilingual list and editor, and seed data.
- Integration coverage checks state transitions, searchability rollback via a mocked index port, concurrent edits, shop isolation, route permissions and validation, idempotent seeding, and cursor paging.
- F07 S1 wires actual FAQ indexing and adds an English Playwright activation smoke. A combined lane run passed 17 F05 and F07 tests (fake-model mode). Moderation, attachments, revision history UI and production smoke are S3.
- S2 adds tenant-scoped folder management with Thai and English controls, plus idempotent imported drafts. Drafts stay unpublished with one immutable revision and never enqueue indexing on import.
- Six S2 integration cases cover folder permissions, duplicate names and content, tenant isolation, concurrent ensure/import and folder deletion on indexed knowledge. Knowledge plus registry/bilingual checks passed 55/55.
- On main a13a7ed the B1 dev owner smoke used the normal F35 worker and real OpenAI. A new Thai FAQ became ready and active, was found by an English query at rank 1, disappeared after deactivation and was soft-deleted.

## P1 web suggestions for owner approval

- The trusted web worker writes a regular F05 FAQ draft using `createWebKnowledgeDraft`. The tenant and normalized public question deduplicate retries, including after rejection. The original question, citation URLs and titles stay on the item, and the original suggested answer stays in revision 1.
- The bilingual Knowledge page shows web suggestions in the existing list and editor. An authorized owner can edit, approve or reject. Approval exposes the edited body via `readWebKnowledgeAnswer` immediately. F07 indexes the active revision for similar queries. The exact lookup and the draft status check require no web call.
- On 2026-11-21, 57 tests passed across F05, F07 and scripts on an isolated in-memory PostgreSQL-compatible PGlite instance with pgvector and `MODEL_MODE=fake`. The new tests cover concurrent deduplication, two tenants, route permissions, public input validation, first approval before indexing, F07 retrieval after indexing, rejection and source readback. The production build, ownership check for `lane/B1/knowledge-web-suggestions` and Git whitespace check passed.
- A local headless Chromium smoke at a 393 px viewport used the built owner UI and real F05 HTTP routes. The English flow edited and approved a suggestion and read back the approved answer and citation. The Thai flow rejected a separate suggestion and verified it was unavailable to buyer retrieval.
- The real web provider, B2 chat integration and production verification are pending for this slice.
