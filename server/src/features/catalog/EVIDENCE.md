# F08 catalog

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F08 | catalog | B1 | DOING | R | A | None | | Catalog, import, registry and i18n checks passed 66/66 in 50.60 s on 93295d0. Playwright catalog smoke discovered. | 2026-11-21 13:36 | Production smoke and remaining S3 slices pending. |

## Log

- S1 implements database-backed getProduct, getPrice, listCatalogItems and getCatalogItemDetails, the staff read route, seed rows and integer satang parsing.
- S2a adds Thai and English create and edit screens, SQL price and stock history, tenant-scoped CRUD reads and version-checked writes. Staff without product.write can read the editor.
- Integration checks cover canonical price changes, stale and competing writes, SKU normalization and conflicts, request validation, tenant scope and staff permissions.
- S2b adds tenant-scoped categories, SKU availability, price and stock history, and idempotent soft delete. The Thai and English list has search and kind, selling status and category filters. The editor checks SKU availability on blur, shows history and confirms deletion.
- S2b route tests exercise normalized variant collisions, SKU release and reuse, tenant scoping, staff read permissions, delete denial, repeated deletion and retained history.
- The English Playwright smoke creates and reprices a unique synthetic listing, checks its persisted price, then deletes it. It verifies that the seeded A-GAME-01 price remains 149000 minor. Production execution is pending.
- S3 import exposes the real `importCatalogItems` contract for B3. Dry run and abort perform zero writes. Valid new items are inactive, source-linked drafts. Updates preserve publication state. Integration tests use both modes, tenant isolation, SKU and variant collisions, transaction rollback and a concurrent manual create.
- Variant management, stock adjustment, images and CSV export remain pending.
- The F13 stock contract returns the documented no-op adapter. A regression checks the fixed response and verifies there is no stock, version or ledger change. Actual stock adjustment remains in S3.
