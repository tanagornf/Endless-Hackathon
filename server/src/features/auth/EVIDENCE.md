# F02 auth

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F02 | auth | C3 | DOING | R | A | none | 6c4ecafc2bd1f4a797dbf778a271c61da3457b11 | C3 focused suite passed 16 tests in 4 files with fake model mode. CI passed and 3 Playwright smoke cases were discovered. | 2026-11-21 12:48 | Production smoke, dev-login cutover, and later auth slices pending |

## Log

### 2026-11-21 Bangkok · S1 password sign-in

- Added scrypt verification, email lockout and request limits, CSRF checks, seed-password sync, and password session creation and revocation.
- Added the Thai and English login form with native input labels, inline errors, and a same-site post-login redirect.
- The original C3 owner ran `npm test -- server/src/features/auth web/src/features/auth` against `6c4ecafc2bd1f4a797dbf778a271c61da3457b11` in the approved C3 checkout with `MODEL_MODE=fake`. The run started on 2026-11-21 at 12:48:29 Bangkok time and passed all 16 tests across 4 files in 53.55 seconds.
- TypeScript, C3 path ownership, and all seven database-free tests passed locally. Playwright discovered three smoke cases. The PR's GitHub check also passed. [CI job](https://github.com/tanagornf/Endless-Hackathon/actions/runs/44872642086/job/136750366435)
- The C3 owner handles the merge and production smoke with `npm run e2e -- auth.smoke.spec.ts`. Production smoke and dev-login cutover are pending.
- Links to signup and password recovery will accompany their working flows in S2 and S3. Dev login cutover remains under the production owner's control.

### 2026-11-21 Bangkok · S2 signup and email verification

- Signup provisions a shop or accepts an existing invitation through the landed F03 services in the same transaction as the new user. F04 settings initialization and invitation completion run after commit.
- Verification links are single-use and expire. Resending invalidates the old link. The sandbox outbox encrypts action links and records messages without external delivery.
- Added Thai and English signup and verification pages. The signup page preserves invitation context and the verification page removes the token from the address bar before submitting it.
- Seven isolated S2 tests passed. Playwright discovered three S2 smoke cases. The account-creating smoke runs only when `E2E_ALLOW_SIGNUP=1`.
- The integrated Auth commit `5ef52b13dbb3f1dec9a1a886d2856094e2ad2f20` passed GitHub CI, including Auth S2 route tests. [CI job](https://github.com/tanagornf/Endless-Hackathon/actions/runs/44876140199/job/136761138667)
- The public merge is gated on C1 serving the initial `/verify-email` document with `Referrer-Policy: no-referrer`. The S2 browser smoke checks that header and verifies that the address bar no longer carries the token.
- CI or the approved C3 checkout can run `npm test -- server/src/features/auth web/src/features/auth`. Production smoke, sandbox mailbox UI, password recovery, and dev-login cutover are pending.

### 2026-11-21 Bangkok · S3 password recovery and account management

- Added generic forgot responses, single-use password reset, password change, session revocation, and per-address or per-user rate limits. Password reset changes the credential and consumes its token in the same transaction.
- Added the account section, profile and locale updates, verification status, sign-out everywhere, and the encrypted sandbox mailbox. Ordinary users can read their own mailbox. Administrators can explicitly request all mailboxes.
- Added hourly expiry cleanup and tests for reset retries, session rotation, mailbox permissions, and secret-free logs.
- Twenty isolated Auth tests passed locally, and Playwright discovered eight Auth smoke cases. Database checks run in isolated GitHub CI or in the C3 owner's approved checkout with `MODEL_MODE=fake` using `npm test -- server/src/features/auth web/src/features/auth`.
- All seven S3 route tests passed in the first integrated GitHub run. That run found a Thai label in the English locale selector. The corrected labels pass the focused Auth translation check. [Initial CI results](https://github.com/tanagornf/Endless-Hackathon/actions/runs/44878443110/job/136768222880)
- Public merge requires the C1 `Referrer-Policy: no-referrer` header on the initial `/reset-password` document. The recovery smoke checks the header and verifies that the page removes the token from the URL. Production smoke and the owner-controlled dev-login cutover are pending.
