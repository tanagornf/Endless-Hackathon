# F31 notifications

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F31 | notifications | C3 | DOING | R | A | iPhone Web Push | | 10 isolated server tests, 2 bell tests, typecheck | 2026-11-21 14:47 +07:00 | PostgreSQL route CI, release smoke, consent producer, and physical iPhone proof pending |

## Log

- S1 replaces the shared notify stub with per-recipient database writes, permission-aware filtering, race-safe deduplication and user-targeted realtime publication. The scoped read endpoints and bilingual bell cover list, unread, mark read and synthetic self-test.
- The committed-handoff producer is F11. An initial request, declined choice, expired or inactive offer and retry with an existing receipt must produce no new staff alert. F31 cannot establish consent from a notification payload. The producer's consent-first gate requires an end-to-end test before release.
- Server unit regressions and bell component tests ran without the shared C3 database. The PostgreSQL route suite uses isolated synthetic shops in PR CI.
- Physical iPhone acceptance requires separate evidence for provider acceptance, the service worker displaying and acknowledging a generic alert, and a tap navigating into the authorized shop and case.


- S2 persists per-user, per-type preferences. System alerts stay available in the bell. The existing realtime event uses generic text, while the feed applies current permissions before serving a stored title or body.
- The PR CI route tests use isolated shop feeds and compare changes to existing elsewhere counts. The consent delivery test applies confirmed producer receipts and replays from the 28-case v2 matrix using synthetic memberships. It verifies F31 delivery handling at that boundary. The producer still needs to prove which customer inputs emit a receipt.
- Initial full CI on S1 exposed two F11 test spies that counted every core publish. Real F31 adds recipient events to the existing F11 conversation event. The F11 owner received the failure details.
