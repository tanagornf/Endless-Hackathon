# F03 tenancy

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F03 | tenancy | C3 | DOING | R | A | none | | 15 F03 tests passed, 10/15 distinct business GET routes and 30 cross-shop requests, typecheck and path check passed, 2 Playwright tests discovered | 2026-11-21 12:21 +07:00 | Production smoke and later tenancy slices pending |

## Log

- S1 adds the invitation schema and completes tenant-scoped member listing, staff permissions, role changes, revocation and restoration. The bilingual members screen uses the same permission keys as core.
- Only shop A appears among the seeded shops in the owner A session. Any other returned shop has an active membership for owner A. The registry test covered every currently registered business GET endpoint: ten distinct routes and 30 requests by callers outside the corresponding tenant. Future registrations are included automatically. The target of 15 distinct routes depends on the remaining feature registrations.
- Role changes serialize per business. Tests verify revoked staff lose access on the same session's next request, platform admins get no implicit tenant access, owner-only permissions cannot be assigned to staff, and concurrent revocations retain one active owner.
- The two production smoke cases are read-only and do not change seeded users. Playwright discovery passed. Production run, invitations workflow, and business onboarding are pending.
- Review verification added seeded success controls for knowledge item detail and revisions, empty-grant behavior, and a concurrent demotion race. Each knowledge detail is confirmed readable by its own owner and denied under both foreign shop and foreign resource requests. The member tests reuse the authenticated sessions under the existing dev-login rate limit.
- F04 and F03 suites ran together and passed all 36 tests. This includes the shared test database case where F04 provisions additional authorized synthetic shops for owner A.

- S2 adds owner-managed invitations with one-time link delivery, expiry, rotation, revocation, acceptance and anonymous decline. The invitation management and recipient pages support Thai and English. The recipient UI links to F02 sign-in. The signup action is deferred to F02 S2, whose transaction can use the exported post-commit hook.
- S2 checks in the managed checkout on 2026-11-21 Bangkok time: typecheck, two isolated token tests, 31 localization completeness tests, the public invitation UI test, and ownership check passed. The helper checkout has no assigned C3 test environment, so the DB-backed invitation route suite runs in PR CI. Run 44872815368 passed all nine route tests at 0f84485. Production smoke is pending.
