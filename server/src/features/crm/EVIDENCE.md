# F24 CRM

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F24 | crm | A3 | DOING | R | A | None | d32b00d61d909944ebc33d96c26d4d907ddbc625 | Seven database and route tests and seven web tests passed. | 2026-11-21 15:07 | Production smoke awaits deployment and the synthetic merchant window. |

## First slice

- Customer profiles, tag audience pagination and tag counts read PostgreSQL. Audience reads exclude eval identities and support granted-only delivery. Profiles on a merged identity share their person's tags and consent. PII fields and full external IDs stay out of directory and audit event payloads, except for the directory's permitted phone field.
- The customer directory supports filtering by tags, consent, channel and search. The Inbox customer panel resolves the selected conversation through F09 with the server's business ID. Owners can manage tags, and staff with reply permission can assign existing tags and record opt-outs.
- Tag assignments and consent changes write audit events within their transaction. A non-staff caller cannot clear a revoked consent. A staff grant through the route requires management permission, attestation and a reason.
- On the isolated A3 database with fake model mode, `npm test -- crm` passed 9/9 in 45.86 seconds at implementation commit `c2f991d874a66b5716ba9362ef79807355b552b3`. Coverage includes tenant isolation, actual route permissions, cross-language tag creation, source precedence, automation suppression, tag limits, concurrent create-or-get, microsecond cursor boundaries, eval filtering, grouped identities, consent and exact contract shape.
- Typecheck and lane ownership passed. Thai and English have the same 62 translation keys. Playwright discovered the Thai and English Inbox smoke cases. Each creates one marker tag on a synthetic seed customer, reloads the Inbox, checks the directory query and deletes the marker in cleanup.
## Contact editing

- Staff with `chat.reply` can edit a customer’s phone number, email and staff note in the Inbox panel and the customer detail page. The server resolves the customer within the signed-in business. A version check rejects stale writes, including simultaneous first edits. Audit events record changed field names. Realtime events carry the customer ID.
- On implementation commit `d32b00d61d909944ebc33d96c26d4d907ddbc625`, `npm test -- crm` passed 14/14 in 54.37 seconds with the isolated A3 database and fake model mode. The route test covered normalization, clearing one field, preserved values, read-only denial, tenant isolation, matching by phone and email, and audit and realtime redaction. Web tests covered Thai and English autosave, queued edits, version conflicts, and draft isolation across conversations.
- Typecheck, path ownership, whitespace and translation parity passed. Thai and English each have 71 translation keys. Playwright discovered two Inbox smoke cases which add a tag, edit synthetic contact fields, reload the panel, and restore the fields by version before deleting the marker tag. C0 coordinates the signed-in production run and fixture window.
- F24 remains A pending production verification. Identity merge management and automation rules remain outside the two delivered slices.
