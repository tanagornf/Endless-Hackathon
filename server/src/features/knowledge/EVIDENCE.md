# F05 knowledge

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
