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
