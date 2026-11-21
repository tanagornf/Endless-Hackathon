# F10 ai-agent

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F10 | ai-agent | B2 | BLOCKED | R | A | Pending | 1c0d71b | F10 44/44 in fake mode. Typecheck, ownership and lane migration passed. | 2026-11-21 12:00 +07:00 | F04 effective rules unavailable on main 245e76f. No production provider or owner trace read verified. |

## Log

| time (Bangkok) | Codex did (paths) | human review/correction | PR/commit | tests → actual result | mode / provider env |
|---|---|---|---|---|---|
| 2026-11-21 12:00 | Replaced the F10 setup handler with two turn gates, a shared durable claim, SKU quote evidence and Thai/English replies. | — | 1c0d71b | `npm run db:migrate` applied core and F10 on B2 dev. `npm run typecheck` and `npm run check:paths` passed. `npm test -- ai-agent loop.test.ts` passed 44 F10 cases and failed the F01 loop before the first reply. | `MODEL_MODE=fake`, B2 lane test DB. |

The F10 integration tests supply an explicit effective-policy fixture. Main's F04 scaffold throws `SERVICE_NOT_READY` for `getEffectiveAnswerRules`. F10 records that failure, delays the job and does not call the model with assumed permissions.

S1 serializes direct and queued turns with a short `ai.turn:<conversationId>` transaction lock and a fenced lease. The tests exercise a stale holder, a duplicate inbound, overlapping direct and queued turns, and four queued conversations with the default five-connection pool.

S1 records the inbound and reply message IDs, catalog evidence, product references and reply language in `ai_turns`. The S1 routes and F09 history do not expose that combined record to a business session. The owner-authenticated trace route and `/ai-settings` are scheduled for S5.

Tool-loop acceptance, intent routing and team handoff remain later slices. S1 retries transient generation failures and uses a localized apology if retries are exhausted. No production delivery, model timing or provider-cost evidence is claimed.
