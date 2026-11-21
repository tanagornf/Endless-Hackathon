# F04 business-settings

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F04 | business-settings | C3 | DOING | R | A | none | | 40 F04 + isolation tests, ownership, and authenticated production business/AI settings reads passed | 2026-11-21 14:14 +07:00 | Synthetic closure/answer-policy write and restoration smoke pending |

## Log

- Draft PR #123 combines the owner consult, exact-candidate instruction replay and review, and the two factual-reuse files from #119 at e61f8472f7a34daf24c212971d85b7b70cc78a8b. The internal factual-draft service rejects case-only and invalid shop or receipt scope before analysis, rechecks consent before the F05 draft write, and returns a digest of the saved revision. Factual learning, trusted instruction replay, and F10 resume still require runtime callers. Draft preparation leaves publication subject to separate owner approval.
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
- S4 prepares the documented synthetic closure and price-policy production smoke cases with an explicit write-slot opt-in and exact before/after API assertions. Typecheck and four-test Playwright discovery passed. Both mutation cases skipped with opt-in off. The C3 F04 and tenant isolation regression passed all 40 tests in 52.21 seconds. The owner production run awaits the assigned slot.
- C0 confirmed a signed-in Shop A owner read-only on production build 5aa261520d7b09a1b9479730c9d97a5d87e67e26. Business showed the Demo Boardgame Shop profile and Monday hours 10:00–20:00. Bot settings showed the AI switch enabled and the content policy and shop capability switches rendered. No setting or shop data changed. C3's separate mutation preflight stopped before login because the approved Playwright fixture was unconfigured and public readiness returned 502.
- The owner-consult answer outbox keeps its unregistered-handler test in an isolated module. The real application test checks one scoped job and settled receipt under concurrent and repeated registered dispatch. Local focused fake-mode checks passed all 11 tests on tree 6820d15.
