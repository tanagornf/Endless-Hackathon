# F09 inbox

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F09 | ADAPTER | R | A |

## Log

- 2026-11-21 · S1 implements scoped message persistence, provider/client replay and job repair, stable history pagination, customer language and three authenticated conversation routes. The inbox UI and public Demo Chat are scheduled for later slices.
- A 95-message fixture at a 30-message limit has four pages. The test checks all messages occur once and tests group extension separately.

### S1 verification

- `npm run typecheck` passed for shared, server, and web workspaces.
- `npm test -- inbox` passed 11/11 against the A1 test database with `MODEL_MODE=fake`. Covers tenant scope, permission denial, delayed enqueue recovery, paging, Thai and English, and the fake takeover flow.
- `npm run check:paths` passed for `lane/A1/inbox`.
- Production inbox and Demo Chat smoke are pending their UI slices and deployment.

- Web registry and public routing tests passed 4/4 after adding the staff-protected, bilingual history route.

### S2 staff inbox

- Added the authenticated staff inbox with queue filters, search, cursor pagination, conversation history, live refresh, and staff replies. Staff sends take over before delivery when the user has permission, and display the recorded delivery state.
- `npm test -- inbox` passed 13/13 on A1's test database with the model in fake mode. Includes tied conversation timestamps, literal search, tenant checks, staff takeover and send replay.
- `npm run typecheck` passed. F09 remains A while the public Demo Chat slice and production smoke are pending.

### S3 public Demo Chat and staff tester

- Customers can open a shop link in Thai or English, send a message, see typing and receive persisted updates by long poll. The staff tester uses the signed-in user and business. The public route uses a signed visitor session, text limits, IP and visitor throttles, moderation, and a daily shop cap.
- A1 ran all 18 inbox integration tests against its test database with `MODEL_MODE=fake`. The cases cover signed visitor sessions, tenant isolation, duplicate sends, length and moderation rejection, visitor and daily shop limits, staff replies during long poll, and a fresh conversation after reset.
- Full workspace typecheck and whitespace checks passed before rebase. Migration and seed ran on the A1 development database. F09 remains A pending production verification with the deployed AI worker. No live model or production smoke result is claimed here.

- After rebase onto the merged F11 takeover implementation, all 18 inbox tests passed in 84.58 seconds. GitHub CI also passed these tests. Its B2 trace fixture observed an unrelated synthetic AI job before its own trace. The F09 suite now removes its own queued replies by the fixture request IDs during teardown.

### S4 mobile inbox and Demo Chat follow-up

- The staff inbox filters the desktop-only Team side panel below the MUI md breakpoint. Details remains available when a mobile-capable side panel is registered.
- Public Demo Chat follows the visual viewport during keyboard resize and scroll. The layout respects the top and bottom safe-area insets.
- `npm test -- --project web web/src/features/inbox` passed 4/4. Both mobile Details assertions reproduced the issue before the filter. The desktop Team panel and visual viewport regressions passed on the finished branch.
- `npm run typecheck`, `npm run check:paths`, and `git diff --check` passed.
- Local Chromium with intercepted synthetic responses verified Thai wrapping at 360 px without horizontal overflow and a 44 × 44 px Send target. At a simulated keyboard viewport height of 435 px, the composer bottom moved from 451 px to 435 px and Send from 443 px to 427 px. Chromium also verified the 55 px viewport offset, 24 px top and bottom safe-area insets, and desktop at 1280 × 900.
- Production smoke for this patch is pending.

### Customer-visible AI delivery

- The public and tester polls show AI replies only after the web delivery worker records a successful send. New messages advance on their own cursor. The visitor rechecks in-flight AI replies in bounded pages. Failed and unknown attempts stay hidden. Staff can still inspect attempted replies in the inbox. Visitor attachment and card action reads apply the same visibility rule.
- The delivery regression covers the interval between message persistence and queuing, pending to sent, and failed or unknown attempts followed by a successful reply. The first version also held back later staff replies after an orphaned send, and waited through a full page of hidden messages. Both cases failed on c2e7a0e. The corrected queries filter terminal rows before paging and let delivered messages pass an unresolved row. Deployed takeover smoke remains pending.

- Before the evidence-only rebase, the combined F09 and F11 integration suites passed 25/25 in 108.35 seconds with the fake model. Full typecheck and path ownership passed.
- The corrected F09 and F11 suites passed 30/30 in 140.03 seconds on the A1 test database with the fake model. The visitor received a staff message and a later sent AI message while the earlier AI attempt stayed pending, then received the earlier reply after it became sent. Thirty-two hidden rows did not delay a later staff reply.
- Additional focused regressions passed 2/2. Two unresolved sends surrounding an already delivered reply did not echo that reply on consecutive long polls. Each 1.1-second poll waited at least 950 ms. With 31 unresolved replies, a new visitor poll retained the earlier customer and staff messages and surfaced the oldest AI message after successful delivery. The cold-load query selects recent visible history and outstanding delivery metadata from a single database snapshot.
- Final local verification passed all 32 F09 and F11 tests in 154.62 seconds, including the four mobile web regressions, on the A1 test database with the fake model. Full workspace typecheck passed.

### Internal test chat recovery

- The visitor history returns the client request ID for the visitor's own inbound messages. The client uses that exact ID to reconcile a lost send acknowledgement, leaves an independent identical message alone, and preserves a newer draft. A poll that detects a different conversation after a reset in another tab starts fresh for that conversation.
- The internal test badge and test-link control are labeled in Thai and English. LINE remains the customer messaging channel in this release.
- The affected F09 suite passed 28/28 with the fake model and the A1 test database. The three client regressions passed together, including the cross-tab case added during the DB run. Full workspace typecheck passed.
- A release rerun exposed a missed wake when a staff message committed between the first database read and long-poll registration. The original request took 12.213 seconds against a 9-second assertion. The poll now subscribes before the read and releases the watcher on every return. The deterministic interleaving test and the original integration test pass. Final local verification passed 30/30 in 127.51 seconds with the A1 test database and fake model, plus full workspace typecheck.
