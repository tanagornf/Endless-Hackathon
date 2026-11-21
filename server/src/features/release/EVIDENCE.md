# F36 release evidence

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F36 | release | C1 | DOING | R | A | Verified historical LINE and internal QA paths | | Parser and gate-count fixtures on the C1 branch | 2026-11-21 15:18 | Final serving SHA, golden-path run, operator privileges and approved judge QR still require verification. |

## Evidence links

- trace: docs/evidence/release.md
- provider: Historical LINE Official Account connection was verified. The final candidate must be verified independently.

## Log

- The 31-feature roll-up reads lane evidence and reports missing, hidden or unverified features without treating them as real.
- The production verification command reports the exact serving SHA, checks readiness and records skips separately from passes. The public customer entry is LINE. The browser Demo Chat is used only for internal QA.
