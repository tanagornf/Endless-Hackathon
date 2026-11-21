# F11 team

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F11 | team | A1 | DOING | R | A | F10 receipt adoption, F31 adapter, production smoke | e74d1fc94b70c90137fb2e32264f5b6d861753c8 | Team suite 19/19, full typecheck and path ownership | 2026-11-21 13:53 | F10 restart-to-delivery integration and shared production gate pending |

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

On 2026-11-21 at 13:53 Bangkok, implementation `e74d1fc94b70c90137fb2e32264f5b6d861753c8` passed all 19 F11 tests in 69.99 seconds on the exclusive A1 test database. The branch used the merged C1 audit dependency `fc36d5e71f3bccc2e68157b8de0a6a3a60729208`. Workspace typecheck, path ownership and diff checks passed. The suite covered precommit rollback after audit, recovery after a lost commit acknowledgement, competing turns, exact tenant and version checks, manual takeover, closure, handback/requeue and Thai/English notifications.

Both notification races first failed against the original implementation. One paused shop settings lookup allowed a stale F31 call after takeover. An expired dispatcher could also complete a newer worker's claim. Both passed on the release implementation, including independent return modes for the two dispatchers.

The first hosted full suite passed all 494 collected cases and caught an F04 business-hours module initialization failure before that file's tests could run. F11's eager settings import entered a cycle through the core feature registry. Commit `71d552d0a060da83c6d038ecb1ede4643abef54b` resolves the settings service when preparing a staff notification. A fresh process initialized the F04 hours and schemas modules and validated a synthetic week. Full workspace typecheck and path ownership also passed on the corrected implementation.
