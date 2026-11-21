# F08 catalog

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F08 | catalog | B1 | DOING | R | A | None | | B1 migration passed. Catalog 26/26, including the stock contract regression. | 2026-11-21 12:43 | Production smoke and S2b–S3 remain pending. |

## Log

- S1 implements database-backed getProduct, getPrice, listCatalogItems and getCatalogItemDetails, the staff read route, seed rows and integer satang parsing.
- S2a adds Thai and English create and edit screens, SQL price and stock history, tenant-scoped CRUD reads and version-checked writes. Staff without product.write can read the editor.
- Integration checks cover canonical price changes, stale and competing writes, SKU normalization and conflicts, request validation, tenant scope and staff permissions.
- Playwright discovers the English create and reprice smoke. It turns off its synthetic listing when done. Production execution is pending.
- Delete, SKU checking and other catalog routes remain in S2b. Variant management, stock adjustment, images and import remain in S3.
- The F13 stock contract returns the documented no-op adapter. A regression checks the fixed response and verifies there is no stock, version or ledger change. Actual stock adjustment remains in S3.
