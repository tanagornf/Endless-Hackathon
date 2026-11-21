# F11 team

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F11 | team | A1 | DOING | R | A | F10 production reply and F09 production inbox | 635e83c3b7e625777a82e6771aeb4de8ea9be8b3 | Team suite 6/6, typecheck, path ownership, migration and TH/EN key parity | 2026-11-21 12:29 | Production deployment and smoke pending |

## Slice 1

- Takeover and handback persist the handler, assignee and version. The transition and internal handover note commit together. Core writes the audit event after commit and publishes a tenant-scoped conversation update.
- Human handoff queues an AI-handled chat and calls F31 once per transition. F31 currently returns sandbox mode. Automatic assignment is part of F11 slice 3.
- F09 hosts the F11 side panel from MUI md upward and the composer contribution below md. Both use the F11 resource routes.

## Local verification

- npm test -- team passed 6 service and route tests on the reserved A1 test database with MODEL_MODE=fake. The suite covered concurrent takeover, forced takeover, stale versions, tenant isolation, permissions, handoff idempotency, audit and internal notes.
- The job test observed a Thai reply, preserved an inbound message while takeover paused replies, then observed an English reply on the next customer message after handback.
- npm run typecheck and npm run check:paths passed. The initial local run reached the five-second default timeout in two cases. Both passed with a remote database test timeout of twenty seconds.
- The first GitHub check passed all six F11 tests and identified a missing web registry entry. The unlisted /team route now redirects to /chat while the team schedule page awaits its slice. The local web registry and i18n suites passed 32/32 and typecheck passed.

## Missed takeover or handback update

- A synthetic staff tab initially showed a human handler. After the simulated server returned the chat to AI without a socket event, the original control issued only its initial GET. A focus event left the old release button visible.
- The mounted control now reads the selected conversation on focus, on return to a visible tab, on the browser online event, and after 15 seconds while visible. It retains the last handler during a background read, disables pending actions, and discards pending responses and cached controls when the business, user, or conversation changes.
- The regression, inbox host, and route registry web suites passed 7/7 on the rebased branch with MODEL_MODE=fake. Typecheck and path ownership passed. The API integration suite now checks that an explicit mismatched business yields 404 on all three team routes. Local verification used the web test project only.

## AI handoff receipts

F10 can persist an intent containing the business ID, conversation ID, turn ID, reason and expected conversation version. `applyAiHandoff(intent)` locks the scoped conversation. An open, unassigned AI conversation at that version moves to the human queue. The receipt records the committed version. The transition, receipt, internal note and handoff audit share one database transaction. `getAiHandoffReceipt(intent)` reads the receipt only while the exact unassigned human queue version is current.

An identical retry returns the same receipt. A competing turn, manual staff claim, close, handback or later requeue invalidates an earlier intent. F10 owns its checkpoint, acknowledgement and delivery guard. The existing `requestHumanHandoff` entry point is preserved.

The receipt also records when a staff notification is due. The F11 schedule retries interruptions using the same conversation/version key and retires a notification if the queue version changes before dispatch. The exact database lease timestamp fences preflight and completion. F11 rechecks the queue version after preparing recipient content and immediately before invoking F31. A later staff claim cannot recall an F31 call already in progress. Staff notification titles follow the shop language. The F31 adapter currently reports sandbox. Its production contract exposes an empty successful result for both deduplication and some persistence failures, so the adapter response alone cannot prove recipient delivery. Socket updates are best effort. The staff control reloads current state after a missed update.

The feature migration applied on the A1 development and isolated A1 test databases. Local checks use synthetic data and the fake model. The production gate and the F10 restart-to-delivery verification are tracked separately.
