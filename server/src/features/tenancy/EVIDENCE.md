# F03 tenancy

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F03 | tenancy | C3 | DOING | R | A | none | | 37 F03 tests passed, typecheck and ownership passed, anonymous production invitation smoke passed | 2026-11-21 13:28 +07:00 | Authenticated production smoke and shop lifecycle smoke pending |

## Log

- S1 adds the invitation schema and completes tenant-scoped member listing, staff permissions, role changes, revocation and restoration. The bilingual members screen uses the same permission keys as core.
- Only shop A appears among the seeded shops in the owner A session. Any other returned shop has an active membership for owner A. The registry test covered every currently registered business GET endpoint: ten distinct routes and 30 requests by callers outside the corresponding tenant. Future registrations are included automatically. The target of 15 distinct routes depends on the remaining feature registrations.
- Role changes serialize per business. Tests verify revoked staff lose access on the same session's next request, platform admins get no implicit tenant access, owner-only permissions cannot be assigned to staff, and concurrent revocations retain one active owner.
- The two production smoke cases are read-only and do not change seeded users. Playwright discovery passed. Production run, invitations workflow, and business onboarding are pending.
- Review verification added seeded success controls for knowledge item detail and revisions, empty-grant behavior, and a concurrent demotion race. Each knowledge detail is confirmed readable by its own owner and denied under both foreign shop and foreign resource requests. The member tests reuse the authenticated sessions under the existing dev-login rate limit.
- F04 and F03 suites ran together and passed all 36 tests. This includes the shared test database case where F04 provisions additional authorized synthetic shops for owner A.

- S2 adds owner-managed invitations with one-time link delivery, expiry, rotation, revocation, acceptance and anonymous decline. The invitation management and recipient pages support Thai and English. The recipient UI links to F02 sign-in. The signup action is deferred to F02 S2, whose transaction can use the exported post-commit hook.
- S2 checks in the managed checkout on 2026-11-21 Bangkok time: typecheck, two isolated token tests, 31 localization completeness tests, the public invitation UI test, and ownership check passed. The helper checkout has no assigned C3 test environment, so the DB-backed invitation route suite runs in PR CI. Run 44872815368 passed all nine route tests at 0f84485. Production smoke is pending.
- C3 rebased invitations on main containing C1 referrer control  dac2a5226089a4e658a6f24c99b2851f0279de0b. Two invite route tests exceeded the 5-second default on the assigned remote test DB at 5.84 and 5.24 seconds. With a scoped 20-second timeout, all 27 focused tests passed in 91.74 seconds.
- Production initial HTML preflight at exactly dac2a5226089a4e658a6f24c99b2851f0279de0b returned HTTP 200 HTML and Referrer-Policy: no-referrer. The browser token-removal smoke uses the same synthetic invalid token with the first response checked before navigation. On production build 6fadbb4e770a3fb1d9149d84a6141102d28c992c, Playwright passed in 7.4 seconds. The initial synthetic invalid-invite HTML returned HTTP 200 and the no-referrer header, then the anonymous browser removed the URL token and showed the Thai invalid-invitation state. The build SHA matched before and after.

- S3 adds account-owner shop creation, account-serialized soft deletion, idempotent account provisioning, demo seed and reset, and bilingual business management and onboarding. Provisioning with a caller-supplied executor leaves F04 initialization to the caller after commit. Merged F04 settings initialization persists the default settings.
- S3 local evidence on 2026-11-21 Bangkok time: typecheck, 3 isolated input checks, 33 web checks (including onboarding, demo fixture parity and 31 localization checks), and ownership check passed. The five scripted business lifecycle cases, including rollback and two concurrent deletions, require CI or an original C3 DB slot. Production smoke is pending.
- C3 rebased S3 on the merged invitations and persisted F04 defaults. All 37 focused tenancy tests passed across 10 files in 95.68 seconds on a6bafc97f2f9b6c470e172bb7c248f190544777e in the assigned C3 test environment. This included five shop lifecycle tests, provisioning rollback and repeated calls, account-serialized deletion, and prior invitation and tenant checks. Typecheck, ownership and git diff checks passed. Only this evidence changed afterward.
