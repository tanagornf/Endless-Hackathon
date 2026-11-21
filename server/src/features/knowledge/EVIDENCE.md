# F05 knowledge

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F05 | knowledge | B1 | DOING | R | A | F05 moderation and production smoke | | Typecheck passed. Lane migration applied. 8 integration tests passed in fake-model mode. | 2026-11-21 11:54 | F07 index port is wired. Production smoke and S2–S3 remain pending. |

## Log

- S1 adds tenant-scoped draft, review, activation, deactivation, deletion, revision snapshots, bilingual list and editor, and seed data.
- Integration coverage checks state transitions, searchability rollback via a mocked index port, concurrent edits, shop isolation, route permissions and validation, idempotent seeding, and cursor paging.
- F07 S1 wires actual FAQ indexing and adds an English Playwright activation smoke. A combined lane run passed 16 F05 and F07 tests (fake-model mode). Folder management and import contracts are S2. Moderation, attachments, revision history UI and production smoke are S3.
