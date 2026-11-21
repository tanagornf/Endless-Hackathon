# F10 ai-agent

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F10 | ai-agent | B2 | DOING | R | A | Pending | 02dbb4c | F10, authenticated trace and core loop 49/49. Typecheck, ownership and lane migration passed. | 2026-11-21 12:14 +07:00 | Production deployment and live model smoke pending. |

## Log

| time (Bangkok) | Codex did (paths) | human review/correction | PR/commit | tests → actual result | mode / provider env |
|---|---|---|---|---|---|
| 2026-11-21 12:00 | Replaced the F10 setup handler with two turn gates, a shared durable claim, SKU quote evidence and Thai/English replies. | — | 1c0d71b | `npm run db:migrate` applied core and F10 on B2 dev. `npm run typecheck` and `npm run check:paths` passed. `npm test -- ai-agent loop.test.ts` passed 44 F10 cases and failed the F01 loop before the first reply. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:14 | Added the P0 single-turn GET and left the page and menu unregistered for S5. Rebased S1 onto F04 policy, F08 catalog and F35 worker. | Lead authorized the one-turn read for the core-loop gate. | 02dbb4c | `npm test -- ai-agent loop.test.ts` passed 49/49 including a real F04/F08/F35 application flow. B2 migrations, typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |

S1 serializes direct and queued turns with a short `ai.turn:<conversationId>` transaction lock and a fenced lease. The tests exercise a stale holder, a duplicate inbound, overlapping direct and queued turns, and four queued conversations with the default five-connection pool. The focused expired-lease test on the F35 base passed and verified exactly one AI save and one delivery enqueue call after a replacement holder finished.

After the reply is saved, the shop subscription receives `ai.turn` with `data.turnId`. A business session with `chat.read` can use `GET /api/v1/businesses/:businessId/ai/turns/:turnId` to match the inbound and reply message IDs, catalog evidence, product references and reply language. The route omits raw reply parts. Tests verify the owner read, a missing permission returning 403, another business returning 404 and a missing session returning 401.

The trace list, metrics and `/ai-settings` remain in S5. Tool-loop acceptance, intent routing and team handoff remain later slices. S1 retries transient generation failures and uses a localized apology if retries are exhausted. Production provider usage and timing are pending.
