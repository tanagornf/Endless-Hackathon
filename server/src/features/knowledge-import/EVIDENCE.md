# F06 knowledge import

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F06 | knowledge-import | B3 | DOING | R | A | App-dev FAQ extraction passed; production pending | | S2 isolated F06 42/42 and final web 5/5 (43 unique tests). Typecheck passed. | 2026-11-21 14:50 | Production deploy and smoke, three-run pitch metric, and real F31 completion notification pending. |

## Log

### S1 upload and preview

- S1 serves `/imports` and `/imports/:importId` in Thai and English. The API creates tenant-scoped import and source-version records, stores CSV/TSV bytes and runs durable parse and validation jobs. Rows and validation failures are persisted separately.
- Tested multipart upload, Thai and English column detection, legacy Thai CSV decoding, row limits, source-version duplicate display, permission checks, cross-tenant 404, state errors and cancellation.
- Catalog preview calls the real F08 import service in dry-run mode. For an active matching SKU, the tests check the old and new price and verify the stored price is unchanged. Old-price detail is unavailable for inactive rows through the active-only F08 lookup contract.
- The list and preview use the shared UI kit. React tests cover English upload, Thai read-only access and loading, empty and error states. Catalog and FAQ entries are not created in S1. The preview has no submit-to-catalog or submit-to-knowledge action.
- S1 has no real OpenAI call. Text, catalog and knowledge draft commits, errors CSV and production measurement are follow-on work. URL, XLSX and PDF choices are hidden.

### S2 draft writes and text

- S1 merged at `5efe56b7ae604d6eee2e40a3237a68054ac40ec5`. Hosted CI passed, and the independent cloud check passed 65/65 against the exact PR head.
- Catalog commit saves new inactive drafts and applies explicitly selected updates to existing items. Unmapped stock, descriptions, categories and translated names stay intact. Confirmation and source versions guard repeat submissions. CSV export includes a UTF-8 BOM and escapes spreadsheet formulas.
- Pasted text and .txt/.md files become editable or excludable article and FAQ preview rows. Committing calls the real F05 draft contract. Article and FAQ entries remain unpublished. The completion notification calls the F31 sandbox adapter on this base.
- App-dev real OpenAI acceptance used the isolated B3 development database and synthetic Thai shop text. One F06 extraction produced three ready preview rows with no warnings. Usage ID `9a77b8c3-d274-4475-a89b-8df4f92e6776`, model `gpt-6.2-sol`, 526 input and 220 output tokens, 3,252 USD micros estimated cost, 4,328 ms.
- Playwright discovered two smoke tests for English text and Thai CSV. No production deployment, production smoke, or upload-to-answer timing is claimed here. URL, XLSX and PDF are outside this slice.
