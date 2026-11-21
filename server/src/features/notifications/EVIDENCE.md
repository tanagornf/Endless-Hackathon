# F31 notifications

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F31 | notifications | C3 | DOING | R | A | iPhone Web Push | | 52 isolated server tests, 4 web tests, 4 Playwright smoke cases discovered | 2026-11-21 15:02 +07:00 | PostgreSQL route CI, release smoke, consent producer, and physical iPhone proof pending |

## Log

- S1 replaces the shared notify stub with per-recipient database writes, permission-aware filtering, race-safe deduplication and user-targeted realtime publication. The scoped read endpoints and bilingual bell cover list, unread, mark read and synthetic self-test.
- The committed-handoff producer is F11. An initial request, declined choice, expired or inactive offer and retry with an existing receipt must produce no new staff alert. F31 cannot establish consent from a notification payload. The producer's consent-first gate requires an end-to-end test before release.
- Server unit regressions and bell component tests ran without the shared C3 database. The PostgreSQL route suite uses isolated synthetic shops in PR CI.
- Physical iPhone acceptance requires separate evidence for provider acceptance, the service worker displaying and acknowledging a generic alert, and a tap navigating into the authorized shop and case.


- S2 persists per-user, per-type preferences. System alerts stay available in the bell. The existing realtime event uses generic text, while the feed applies current permissions before serving a stored title or body.
- The PR CI route tests use isolated shop feeds and compare changes to existing elsewhere counts. The consent delivery test applies confirmed producer receipts and replays from the 28-case consent matrix using synthetic memberships. It verifies F31 delivery handling at that boundary. The producer still needs to prove which customer inputs emit a receipt.
- Initial full CI on S1 exposed two F11 test spies that counted every core publish. Real F31 adds recipient events to the existing F11 conversation event. The F11 owner received the failure details.


- F31 tests all passed on CI run 44881885910 at a7d7a23. Both remaining failures were F11 publish-count test expectations, addressed separately in F11 PR #96.
- Integrated C3 Web Push transport commit 25959062947a1f9eb0f398112548f6387af4f796 and the v3 fixture's canonical owner action keys. Local, DB-free tests cover reservation/worker/transport modules and new-row-only scheduling for an authorized receipt. PostgreSQL CI covers the full expected recipient/device queue pairs using a mocked enqueue to avoid provider calls.
- Device delivery remains unverified. Run the physical iPhone check only on an approved deployed build with the Home Screen manifest, configured VAPID, and the consent and owner-consult producers. Evidence should distinguish provider acceptance, display acknowledgment, and an authorized tap.


- Full CI passed at bbd8104 in run 44882525004. A follow-up regression reproduced the crash between writing the bell and enqueueing push. This revision records the enqueue intent in the same write, then reconciles due intents every 30 seconds using the idempotent job key. The worker rechecks case, recipient and preferences before sending a reserved delivery.
- Local red/green covered the failed immediate enqueue. PostgreSQL CI covers one existing bell row and one actual queued job after replay, plus cancellation before provider contact if the case resolves during dispatch. Four Playwright smoke cases were discovered for the post-deploy check. No production smoke or iPhone run is recorded.
- F31 phone dispatch and authenticated tap now read the current confirmed LINE handoff receipt from F11 (merged #114). The owner-run fake provider suite passed all 8 focused integrations on tree 8ed548c, including one actual confirmed LINE notice, stale tap rejection after assignment, and Demo Chat bell-only behavior even if private push-purpose metadata is present. All 39 database-free push checks passed. Installed iPhone display and acknowledgment remain pending.
