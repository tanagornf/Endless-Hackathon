# F04 business-settings

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F04 | business-settings | C3 | DOING | R | A | none | | 8 integration tests passed, typecheck and ownership passed, two Playwright smoke cases discovered | 2569-11-21 12:01 +07:00 | Production smoke and remaining F04 slices pending |

## Log

- S1 adds settings, profile and closure tables, seeds both synthetic settings records, and reads effective AI state from the business and account rows.
- Owners can toggle AI on /bot-settings in Thai and English. The server versions and audits changes and publishes a settings event. Repeating the same value does not create a second change or audit.
- The C3 integration suite covers the exact contract, defaults, required permissions, cross-tenant 404s, a malformed request, account and business suspension, and persistence of a toggle. The pre-implementation run had five expected failures. All eight passed after implementation.
- The read-only Thai and English smoke cases avoid altering the production AI switch. C0 owns the end-to-end production toggle in the core-loop gate.
- S2 hours and closures, S3 profile and policy editing, and production validation remain pending.
