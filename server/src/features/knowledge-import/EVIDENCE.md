# F06 knowledge import

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F06 | knowledge-import | B3 | DOING | R | A | OpenAI FAQ extraction pending | | 33/33 F06 tests on isolated B3 Neon with MODEL_MODE=fake. Typecheck passed. | 2026-11-21 14:35 | Draft commit, text import, errors.csv and production smoke pending. |

## Log

- S1 serves `/imports` and `/imports/:importId` in Thai and English. The API creates tenant-scoped import and source-version records, stores CSV/TSV bytes and runs durable parse and validation jobs. Rows and validation failures are persisted separately.
- Tested multipart upload, Thai and English column detection, legacy Thai CSV decoding, row limits, source-version duplicate display, permission checks, cross-tenant 404, state errors and cancellation.
- Catalog preview calls the real F08 import service in dry-run mode. For an active matching SKU, the tests check the old and new price and verify the stored price is unchanged. Old-price detail is unavailable for inactive rows through the active-only F08 lookup contract.
- The list and preview use the shared UI kit. React tests cover English upload, Thai read-only access and loading, empty and error states. Catalog and FAQ entries are not created in S1. The preview has no submit-to-catalog or submit-to-knowledge action.
- S1 has no real OpenAI call. Text, catalog and knowledge draft commits, errors CSV and production measurement are follow-on work. URL, XLSX and PDF choices are hidden.
