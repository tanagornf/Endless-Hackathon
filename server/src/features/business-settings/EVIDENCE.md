# F04 business-settings

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F04 | business-settings | C3 | DOING | R | A | none | | 36 F04 tests passed and 40 with tenancy isolation, typecheck and ownership passed, four Playwright smoke cases discovered | 2026-11-21 13:13 +07:00 | Production smoke and core-loop gate evidence pending |

## Log

- S1 adds settings, profile and closure tables, seeds both synthetic settings records, and reads effective AI state from the business and account rows.
- Owners can toggle AI on /bot-settings in Thai and English. The server versions and audits changes and publishes a settings event. Repeating the same value does not create a second change or audit.
- The C3 integration suite covers the exact contract, defaults, required permissions, cross-tenant 404s, a malformed request, account and business suspension, and persistence of a toggle. The pre-implementation run had five expected failures. All eight passed after implementation.
- The read-only Thai and English smoke cases avoid altering the production AI switch. C0 owns the end-to-end production toggle in the core-loop gate.
- S2 hours and closures, S3 profile and policy editing, and production validation remain pending.
- S1 merged as PR #8 at 42f2446c37b1d12d15ca9396236e088e9bc52167 with green CI. Production smoke awaits a verified public host.
- The F10 dependency slice makes getEffectiveAnswerRules real. Five integration assertions failed against the setup stub and passed with the database implementation. The full F04 suite passed 21 tests, including eight resolver cases. Tenant-specific restrictions, corrupt stored policy and capabilities, unconfigured businesses, and unknown business IDs are covered.
- The effective-rules contract merged as PR #11 at 7e45255b74cc0a92b5fe55ab91068f7e1faf9ebd with green CI and a B2 handoff.
- S2 adds versioned weekly hours, audited special closures, the public open-state service, and the Thai and English business-hours page. F04 passed 28 tests. Combined checks exercised 14/15 distinct isolation paths with 42 cross-tenant requests.
- Opening calculations use the stored timezone. The current core display helper renders dates and times in Asia/Bangkok. Production smoke and S3 profile and policy editing remain pending.
- Hours and closures merged through #27 at 41e808245e8aebb289aabe45ce527a51bb0ab130 with green CI.
- S3 adds real idempotent settings initialization, profile and capability reads, tenant-scoped policy patches, and audited versioned locale, profile and capability writes. Both settings pages are available in Thai and English. The business tab host passes its scoped business ID to registered extensions.
- Rebased verification passed 40 F04 plus F03-isolation tests across five files. The matrix covered 20 distinct GET paths and 60 cross-tenant requests. Web-only verification passed 32 tests, including locale key parity and the contributed tab regression. Playwright discovery identified four smoke cases. No production smoke has run for S3.
- Opening calculations use the saved business timezone. Until the shared formatter accepts a timezone, the next-opening display explicitly labels Bangkok time for other zones.
