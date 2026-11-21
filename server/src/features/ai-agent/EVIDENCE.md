# F10 ai-agent

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F10 | ai-agent | B2 | DOING | R | A | Dev S2 verified | af55437 | Locale gate focus 17/17. Receipt recovery #75 passed exact independent 117/117 and hosted CI. Typecheck and ownership passed. | 2026-11-21 14:20 +07:00 | Coordinated production locale retest and trace UI pending. |

## Log

| time (Bangkok) | Codex did (paths) | human review/correction | PR/commit | tests → actual result | mode / provider env |
|---|---|---|---|---|---|
| 2026-11-21 12:00 | Replaced the F10 setup handler with two turn gates, a shared durable claim, SKU quote evidence and Thai/English replies. | — | 1c0d71b | `npm run db:migrate` applied core and F10 on B2 dev. `npm run typecheck` and `npm run check:paths` passed. `npm test -- ai-agent loop.test.ts` passed 44 F10 cases and failed the F01 loop before the first reply. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:14 | Added the P0 single-turn GET and left the page and menu unregistered for S5. Rebased S1 onto F04 policy, F08 catalog and F35 worker. | Lead authorized the one-turn read for the core-loop gate. | 02dbb4c | `npm test -- ai-agent loop.test.ts` passed 49/49 including a real F04/F08/F35 application flow. B2 migrations, typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:27 | Bound multi-SKU prices to their catalog entries and retried transient delivery enqueue errors using the saved message. | Read-only review identified the price association and queue failure cases. | a7a5ac7 | `npm test -- ai-agent loop.test.ts` passed 51/51 after the F09 S1 merge. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:31 | Verified F10 with F07 hybrid retrieval, F08 catalog, F09 inbox, F35 worker and F03 tenant access. Adopted the merged API-only registry fix. | C0 owned the shared registry fix. | c5d65a1 | `npm test -- ai-agent loop.test.ts` 51/51 and `npm test -- registry.test.ts --project web` 1/1. The registry rebase changed only the shared web registry test. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:35 | S1 dev evidence on the merged worker and single-turn GET. | B0 verified both synthetic turns. | a13a7ed | English quoted 1,490 baht with versioned catalog evidence. The next Thai turn answered 10:00–20:00 with knowledge evidence. Both turn details matched sent F09 messages. | Real dev OpenAI. End-to-end 9.84s and 4.35s, provider 5.27s and 1.52s. |
| 2026-11-21 12:37 | Added strict search, quote and total tools. Shared one four-call budget across reply and repair. Code produced the localized receipt and retained provider state. | — | 26f5348 | `npm test -- ai-agent loop.test.ts` passed 63/63 on the S1 merge plus current F07/F08/F09/F35. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:42 | Rebasing onto F11 `ee891ac` verified the real takeover and handback contract. | — | 2f3cca0 | `npm test -- ai-agent loop.test.ts` passed 63/63, including takeover before and during generation. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 12:55 | Fixed the trace fixture to correlate exact message IDs for two same-shop turns and finish both queued deliveries. | — | 6ec0792 | Trace and channels 5/5 and required PR CI passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 13:01 | Added the explicit request path, F11 handoff checkpoint, versioned acknowledgement and fallback after exhausted retries. | — | be677e7 | `npm test -- ai-agent loop.test.ts channels.test.ts` passed 84/84. Includes current-version queue send and suppression after a subsequent staff claim. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 13:10 | Verified the explicit handoff against the real F04 hours service and F35's queued delivery guard. | — | 33c1d28 | `npm test -- ai-agent loop.test.ts channels.test.ts` passed 84/84 on core c291657. A queued acknowledgement sent at the matching version and was suppressed after either staff claim or handback to AI. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 13:23 | Kept generation complete and linked the exact persisted delivery outcome on terminal enqueue failure. | B0 independently replayed both failure and lost acknowledgement with C1's candidate. | d38f851 | `npm test -- ai-agent loop.test.ts channels.test.ts` passed 86/86. Both new cases use one model call and one saved reply. The paired replay matched the terminal error in the F09 row and F10 owner trace, found zero delivery jobs after definitive failure, and one succeeded job after a lost acknowledgement. | `MODEL_MODE=fake`, separate B2 and B0 test DBs. |
| 2026-11-21 13:35 | Released same-reply terminal delivery trace using C1's real reconciliation. | B0 independently verified a failed exact message reopened and sent once. | 07a03dd | Exact head 037e471 passed three focused delivery tests and hosted CI. | `MODEL_MODE=fake`, separate B2 and B0 test DBs. |
| 2026-11-21 13:40 | Added intent classification, bilingual offers and confirmation, the image fallback, and LINE-only capability copy. | — | 9c5cab0 | `npm test -- ai-agent loop.test.ts channels.test.ts` passed 94/94. Covered G19–G21, classifier cancellation, Thai confirmation, denial, the budget fallback and the owner alert when handoff is disabled. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 13:47 | Reproduced the gate's old-SKU price surviving an explicit unknown SKU, a fresh missing-name lookup and a model tool call to an older SKU. | C0 correlated the unknown Thai turn and its one catalog source with the exact sent F09 reply. | 11b613e | Three failure reproductions and one passing follow-up control in 37.97s. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 13:54 | Scoped catalog prefetch, tool results and totals to the active request. Retained unambiguous English/Thai follow-ups, 990-baht negotiation and quantity totals. | B0 independently confirmed the unknown and Thai same-product cases. | c9ef4ea | Scoped local 8/8, independent F10/core suite 101/101 and independent gate pair 2/2. | `MODEL_MODE=fake`, B2 lane and isolated cloud test DBs. |
| 2026-11-21 13:56 | Excluded F10-traced staff-held messages from later AI pricing without changing the superseded-turn backlog. | The UI verifier flagged a separate handback pricing regression. | 6e53dca | `npm test -- ai-agent -t 'F10 catalog reference scope|G1 uses|G17 supersedes'` passed 10/10 in 66.71s. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 14:00 | Released current-subject catalog pricing and post-handback suppression. | B0 reran the exact PR head in the shared cloud. | 41ce65e | Exact head 991da28 passed independent F10/core 102/102 and hosted CI. The UI verifier separately confirmed 99 baht after returning the chat to AI. | `MODEL_MODE=fake`, cloud and synthetic UI. |
| 2026-11-21 14:11 | Persisted the expected F11 assignment version before apply and reconciled the exact receipt before a later takeover gate. | F11 owner published the additive contract in #68. | 74dc80f | `npm test -- ai-agent -t 'F10 F11 receipt recovery'` passed 5/5 in 43.15s. Applied migration `003_handoff_intent.sql`. One committed handoff, one system note, one sent ACK and one staff notification survived simulated worker loss. Stale claim, handback/requeue and AI-off produced no ACK. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 14:17 | Released the F11 receipt consumer. | B0 verified one scoped handoff recovered without duplicate send or notification. | dedbac2 | Exact independent F10/F11/core suite 117/117 and hosted CI passed on ed45f12. | `MODEL_MODE=fake`, isolated cloud test DB. |
| 2026-11-21 14:18 | Reproduced the current English question receiving a Thai quote after an older Thai AI-off inbound. | C0 confirmed the production trace selected Thai for that exact English message. | fd65ac3 | The scoped baseline had 7 failures and 7 passing controls in 34.40s, including a separate mixed-script quote and neutral-input cases. | `MODEL_MODE=fake`, B2 lane test DB. |
| 2026-11-21 14:20 | Selected the current buyer language and validated localized monetary prose. | — | af55437 | Scoped 17/17 in 56.80s, including English after Thai AI-off, reverse Thai, neutral input, mixed-script repair, 990-baht negotiation, G14 and G17. Typecheck and ownership passed. | `MODEL_MODE=fake`, B2 lane test DB. |

S1 serializes direct and queued turns with a short `ai.turn:<conversationId>` transaction lock and a fenced lease. The tests exercise a stale holder, a duplicate inbound, overlapping direct and queued turns, and four queued conversations with the default five-connection pool. The focused expired-lease test on the F35 base passed and verified exactly one AI save and one delivery enqueue call after a replacement holder finished.

After the reply is saved, the shop subscription receives `ai.turn` with `data.turnId`. A business session with `chat.read` can use `GET /api/v1/businesses/:businessId/ai/turns/:turnId` to match the inbound and reply message IDs, catalog evidence, product references and reply language. The route omits raw reply parts. Tests verify the owner read, a missing permission returning 403, another business returning 404 and a missing session returning 401.

The S2 tests cover G2, G3, G4, G5, G13, G14 and G16. They use scripted OpenAI responses and the F07 and F08 application services. The dev S1 observations are recorded separately. [B0 gate evidence](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058026663)

The trace list, metrics and `/ai-settings` remain in S5. S3 covers explicit Thai and English requests, shop-hours-aware acknowledgement, the fallback wait, intent classification, staff offers and consent, and handoff after model failure. LINE is the external customer channel. Demo Chat is an internal test surface. Production verification remains pending.

F10 saves a version marker only after a successful F11 assignment and reuses the same saved acknowledgement on delivery retry. Tests cover AI-off before save, a manual takeover race, and suppression after a later staff claim or handback to AI. [Core delivery guard](https://github.com/tanagornf/Endless-Hackathon/pull/26)

The expected F11 version is stored before apply. If the worker restarts before the local checkpoint or the apply acknowledgement is lost, F10 recovers only the matching receipt for the current open, unassigned human conversation. A staff claim, handback/requeue or AI-off suppresses the buyer acknowledgement. [F11 owner handoff](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7059006190)

After three definite enqueue failures, the generated turn remains complete and keeps the saved reply ID. Its owner trace reports `DELIVERY_ENQUEUE_FAILED` from the scoped F09 delivery state. A committed job with a lost acknowledgement continues to dispatch the same reply. [Independent worker replay](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058708480)

In the earlier production gate, the unknown explicit SKU received the previous known product's price. The fix requires an active product match for price and total tools and limits historical prefetch to explicit or unambiguous follow-ups. It also omits a staff-held request from the first later AI quote after handback while retaining superseded messages in the normal unanswered backlog. [Production owner trace evidence](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058840936)

The subsequent deployed check confirmed the unknown SKU declined without a price. F10 now selects the required reply language from the latest decisive buyer message. A neutral input uses the nearest decisive message. Older unanswered questions stay in model context. [Production visitor evidence](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7059123386)

## S2 OpenAI development acceptance

B2 used `generateReply` with synthetic web conversations and indexed demo knowledge on commit `2f3cca0`. The nine cases passed with `gpt-6.2-sol`. The measurements are F10 generation data and exclude channel delivery and F07 embedding costs. The English return-policy check used the bilingual seed. The controlled G16 test separately covered a Thai-only excerpt.

| Case | Turn ID | Language | Calls | Input tokens | Cached tokens | Output tokens | USD micros | ms |
|---|---|---|---|---|---|---|---|---|
| G1 Thai price | 1a019f40-32f3-415b-94ed-7593729f9a26 | th | 1 | 2715 | 0 | 23 | 7016 | 4210 |
| G1 discount pressure | 5309c410-761b-4a6c-9da6-bae2f1284f3a | th | 1 | 2737 | 0 | 52 | 7361 | 3106 |
| G2 computed 198-baht subtotal | 28b1c8b9-c0c4-40cc-91f2-04ac09f9d073 | th | 2 | 5365 | 2614 | 64 | 7776 | 5324 |
| G3 missing product | ea5be0e1-15e8-4c8f-b1f3-56e1502d1685 | th | 3 | 8005 | 5275 | 90 | 8249 | 7011 |
| G5 tenant marker | 7ac60386-c7ba-4869-b9b7-7895b5abfe4a | en | 2 | 5079 | 2510 | 69 | 7361 | 5547 |
| G5 Thai return policy | 9f2c32eb-f6db-4405-9bc9-aee8416b1ef8 | th | 1 | 2564 | 0 | 25 | 6659 | 3163 |
| G13 English name and catalog price | 28e03daf-f587-4d7c-a339-a68e870fc220 | en | 2 | 5362 | 2609 | 53 | 7671 | 4732 |
| G14 switch back to Thai opening hours | eda5a2ea-09d0-4406-b70c-a26d026c18e0 | th | 1 | 2650 | 2596 | 22 | 613 | 3025 |
| G16 English return policy | f1d4f7a4-9f88-4f5b-8670-776f834cc3c5 | en | 1 | 2564 | 0 | 14 | 6549 | 2992 |

### F10 P1 cited public product facts

- The real turn checks an exact, active F05 suggestion, then the tenant's catalog description and approved knowledge. A web lookup requires an eligible product specification or standards question and the shop's general-knowledge setting.
- C1's Responses adapter receives a canonical product or a recognized public term with a controlled topic. Hosted search has up to 12 seconds and reserves two seconds of the turn budget for follow-up work.
- Public citations appear in the reply and the review-only F05 suggestion. Later visitors receive the merchant-edited active FAQ and its sources. Draft and deleted suggestions stay out of replies.
- With C1 and B1's dependency changes applied locally, 63 focused tests passed across four files. The new tests cover the real generation entry point with stubbed services, Thai and English, catalog and approved knowledge hits, cited web fallback, spend exhaustion, an 8.78-second search, timeout, and reuse after merchant approval. Provider-backed delivery requires an integrated smoke.
