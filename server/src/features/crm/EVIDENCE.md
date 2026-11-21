# F24 CRM

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F24 | crm | A3 | DOING | R | A | None | c2f991d874a66b5716ba9362ef79807355b552b3 | Six database and route tests and three web tests passed. | 2026-11-21 14:51 | Production smoke awaits deployment and the synthetic merchant window. |

## First slice

- Customer profiles, tag audience pagination and tag counts read PostgreSQL. Audience reads exclude eval identities and support granted-only delivery. Profiles on a merged identity share their person's tags and consent. PII fields and full external IDs stay out of directory and audit event payloads, except for the directory's permitted phone field.
- The customer directory supports filtering by tags, consent, channel and search. The Inbox customer panel resolves the selected conversation through F09 with the server's business ID. Owners can manage tags, and staff with reply permission can assign existing tags and record opt-outs.
- Tag assignments and consent changes write audit events within their transaction. A non-staff caller cannot clear a revoked consent. A staff grant through the route requires management permission, attestation and a reason.
- On the isolated A3 database with fake model mode, `npm test -- crm` passed 9/9 in 45.86 seconds at the implementation commit above. Coverage includes tenant isolation, actual route permissions, cross-language tag creation, source precedence, automation suppression, tag limits, concurrent create-or-get, microsecond cursor boundaries, eval filtering, grouped identities, consent and exact contract shape.
- Typecheck and lane ownership passed. Thai and English have the same 62 translation keys. Playwright discovered the Thai and English Inbox smoke cases. Each creates one marker tag on a synthetic seed customer, reloads the Inbox, checks the directory query and deletes the marker in cleanup.
- Later slices cover profile editing, identity merge management and automation rules. Production acceptance remains pending.
