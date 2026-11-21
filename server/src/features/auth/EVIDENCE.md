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
