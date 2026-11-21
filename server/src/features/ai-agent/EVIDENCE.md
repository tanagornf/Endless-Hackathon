# F10 ai-agent

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F10 | ai-agent | B2 | DOING | R | A | Dev S2 verified | 2f3cca0 | S2, F10 trace and core loop 63/63. Real dev generation 9/9. Typecheck and ownership passed. | 2026-11-21 12:41 +07:00 | Production smoke and team handoff pending. |

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

S1 serializes direct and queued turns with a short `ai.turn:<conversationId>` transaction lock and a fenced lease. The tests exercise a stale holder, a duplicate inbound, overlapping direct and queued turns, and four queued conversations with the default five-connection pool. The focused expired-lease test on the F35 base passed and verified exactly one AI save and one delivery enqueue call after a replacement holder finished.

After the reply is saved, the shop subscription receives `ai.turn` with `data.turnId`. A business session with `chat.read` can use `GET /api/v1/businesses/:businessId/ai/turns/:turnId` to match the inbound and reply message IDs, catalog evidence, product references and reply language. The route omits raw reply parts. Tests verify the owner read, a missing permission returning 403, another business returning 404 and a missing session returning 401.

The S2 tests cover G2, G3, G4, G5, G13, G14 and G16. They use scripted OpenAI responses and the F07 and F08 application services. The dev S1 observations are recorded separately. [B0 gate evidence](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058026663)

The trace list, metrics and `/ai-settings` remain in S5. Intent routing, staff handoff and G15 remain in S3. S1/S2 retry transient failures and use a localized apology if generation retries are exhausted. Production provider usage and timing are pending.

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
