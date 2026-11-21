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

- Synthetic SPA unit coverage verified no-referrer on the initial email verification and invitation documents, including trailing slash and token query variants. The Home document retains its usual header behavior.

### F35 S1 worker

- Migration 002 applied on the C1 Neon development database. A second run applied zero migrations.
- Local typecheck and 115 tests passed across 22 files. The 31 F35 tests covered queue validation, deduplication, concurrent claim, lock contention, distinct claim tokens, stale writes, heartbeats, retry and rescheduling, dead lettering, shutdown release, and redaction.
- The actual local API worker passed all six core-loop checks. Tenant 404, 31 loaded features, the 1,490 delivered reply, and silent takeover were verified.
- Overall F35 remains A while scheduler and outbox improvements, the ops page, and production smoke are pending.

### F35 queued AI delivery policy

- The integration test first reproduced a queued AI reply reaching the sender after the business switched AI off.
- The C1 test database verified live toggle and takeover checks in the worker. Staff and system messages still reached the sender. A code-generated F10 handoff acknowledgement carried the assignment version and could be sent for that version while AI stayed on.
- Local typecheck and 12 focused tests passed across delivery, core loop, worker and LINE events. This check covers provider calls before dispatch. Production smoke is pending.

### F01 live chat authorization

- An authenticated WebSocket received chat events after its staff member's chat grant was cleared. A real socket regression now verifies fresh authorization for chat events, continued delivery of unrelated events to the active member, and policy close code 1008 following removal of the membership.
- Local typecheck and focused realtime, auth and core loop tests passed. Production verification is pending.

### F35 outbox checkpoint

- A C1 database test first observed a reclaimed in-flight delivery call the sender again. It also found that an exhausted final attempt left the message pending.
- The worker now checkpoints before dispatch, retries only explicit definite failures, and records uncertain sends as unknown with a delivery audit. Exhausted expired jobs and their in-flight message are updated in one database statement.
- Local typecheck and 22 focused tests passed across six files. Production verification and operator review and resend controls are pending.
- Review extended atomic reconciliation to ordinary dead-job settlement and claims expiring before dispatch. An ambiguous LINE retry stays unknown unless a later provider acknowledgement resolves it.
- Recording the pending message and enqueueing its delivery now share a transaction. New tests exercise both dead-job paths and an enqueue rollback followed by an idempotent retry.
