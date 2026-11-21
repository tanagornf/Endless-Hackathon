# Core evidence

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F01 | DOING | R | A |
| F35 | DOING | R | A |

## Log

- C1 lane initialization used the assigned direct PostgreSQL endpoint, API port 3001 and web port 5171. The base migration applied once and the second run reported 0 pending. Two base seeds and two demo seeds exited successfully. The demo count stayed at 8 synthetic customer threads and 12 image aliases. A database query decoded a pgvector value back to its original vector.
- C1 development HTTP returned 200 for `/healthz`, `/readyz` and `/build-info`. Scripted smoke passed all six checks, including 31 loaded features, 29 flags, cross-tenant 404, a delivered price reply containing `1,490`, and silent AI after takeover.
- A 1,000,000-byte synthetic LINE POST arrived unchanged at its webhook handler. Invalid JSON could be rejected before parsing.
- Development OpenAI smoke passed for chat, fast, strong, the two-Round Responses tool loop, 1536-dimensional embeddings, and moderation. Usage rows recorded measured costs. All automated tests use fake mode.
- C1 Playwright core smoke passed 2/2 on the local frontend, including switching to English and keeping it after reload.
- Setup scaffolds include 29 feature placeholders. Their owners implement feature behavior on their assigned branches. Nonessential setup fakes can return `SERVICE_NOT_READY`. Realtime client secret minting in OpenAI mode and full jobs operations are pending. Production and independent C0 acceptance remain pending.
- Final C1 typecheck passed. The full test suite passed with 79 tests across 16 files, including the ownership checks and the English/Thai registry and UI checks.
- Browser flag check passed. The admin API hid F13. Orders disappeared from owner navigation after reload, and the direct route rendered Page not found. The C1 development flag was restored afterward.

### F35 S1 worker

- Migration 002 applied on the C1 Neon development database. A second run applied zero migrations.
- Local typecheck and 115 tests passed across 22 files. The 31 F35 tests covered queue validation, deduplication, concurrent claim, lock contention, distinct claim tokens, stale writes, heartbeats, retry and rescheduling, dead lettering, shutdown release, and redaction.
- The actual local API worker passed all six core-loop checks. Tenant 404, 31 loaded features, the 1,490 delivered reply, and silent takeover were verified.
- Overall F35 remains A while scheduler and outbox improvements, the ops page, and production smoke are pending.
