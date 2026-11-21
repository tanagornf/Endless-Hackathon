# F04 business-settings

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F04 | business-settings | C3 | DOING | R | A | none | | 21 F04 tests passed, typecheck and ownership passed, two Playwright smoke cases discovered | 2569-11-21 12:08 +07:00 | Production smoke and remaining F04 slices pending |

## Log

- S1 adds settings, profile and closure tables, seeds both synthetic settings records, and reads effective AI state from the business and account rows.
- Owners can toggle AI on /bot-settings in Thai and English. The server versions and audits changes and publishes a settings event. Repeating the same value does not create a second change or audit.
- The C3 integration suite covers the exact contract, defaults, required permissions, cross-tenant 404s, a malformed request, account and business suspension, and persistence of a toggle. The pre-implementation run had five expected failures. All eight passed after implementation.
- The read-only Thai and English smoke cases avoid altering the production AI switch. C0 owns the end-to-end production toggle in the core-loop gate.
- S2 hours and closures, S3 profile and policy editing, and production validation remain pending.
- S1 merged as PR #8 at 42f2446c37b1d12d15ca9396236e088e9bc52167 with green CI. Production smoke awaits a verified public host.
- The F10 dependency slice makes getEffectiveAnswerRules real. Five integration assertions failed against the setup stub and passed with the database implementation. The full F04 suite passed 21 tests, including eight resolver cases. Tenant-specific restrictions, corrupt stored policy and capabilities, unconfigured businesses, and unknown business IDs are covered.
