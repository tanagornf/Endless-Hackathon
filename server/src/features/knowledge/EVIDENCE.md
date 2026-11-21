# F05 knowledge

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F05 | knowledge | B1 | DOING | R | A | F07 real index, F05 moderation, production smoke | | Typecheck passed. Lane migration applied. 8 integration tests passed in fake-model mode. | 2026-11-21 11:54 | S1 index port returns seed readiness only until F07 S1. |

## Log

- S1 adds tenant-scoped draft, review, activation, deactivation, deletion, revision snapshots, bilingual list and editor, and seed data.
- Integration coverage checks state transitions, searchability rollback via a mocked index port, concurrent edits, shop isolation, route permissions and validation, idempotent seeding, and cursor paging.
- The new FAQ activation flow awaits F07 indexing. Folder management and import contracts are S2. Moderation, attachments, revision history UI and production smoke are S3.
