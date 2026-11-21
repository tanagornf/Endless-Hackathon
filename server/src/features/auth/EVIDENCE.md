# F02 auth

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F02 | UNIMPLEMENTED | R | U |

## Log

### 2026-11-21 Bangkok · S1 password sign-in

- Added scrypt verification, email lockout and request limits, CSRF checks, seed-password sync, and password session creation and revocation.
- Added the Thai and English login form with native input labels, inline errors, and a same-site post-login redirect.
- Local verification passed for TypeScript, C3 path ownership, and seven database-free assertions. Playwright discovered all three F02 smoke cases.
- Focused database suite for the C3 owner or CI: `npm test -- server/src/features/auth web/src/features/auth`. Browser smoke after deployment: `npm run e2e -- auth.smoke.spec.ts`.
- The managed checkout has no assigned test database configuration. Database tests and browser execution are pending. The C3 owner tracks the feature status, merge, and production smoke.
- Links to signup and password recovery will accompany their working flows in S2 and S3. Dev login cutover remains under the production owner's control.
