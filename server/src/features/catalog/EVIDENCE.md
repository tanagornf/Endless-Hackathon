# F08 catalog

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F08 | catalog | B1 | DOING | R | A | None | | Catalog, stock, registry and i18n passed 72/72 in 72.27 s, with migration 002. Playwright catalog smoke discovered. | 2026-11-21 14:00 | Production smoke and remaining S3 slices pending. |

## Log

- S1 implements database-backed getProduct, getPrice, listCatalogItems and getCatalogItemDetails, the staff read route, seed rows and integer satang parsing.
- S2a adds Thai and English create and edit screens, SQL price and stock history, tenant-scoped CRUD reads and version-checked writes. Staff without product.write can read the editor.
- Integration checks cover canonical price changes, stale and competing writes, SKU normalization and conflicts, request validation, tenant scope and staff permissions.
- S2b adds tenant-scoped categories, SKU availability, price and stock history, and idempotent soft delete. The Thai and English list has search and kind, selling status and category filters. The editor checks SKU availability on blur, shows history and confirms deletion.
- S2b route tests exercise normalized variant collisions, SKU release and reuse, tenant scoping, staff read permissions, delete denial, repeated deletion and retained history.
- The English Playwright smoke creates and reprices a unique synthetic listing, checks its persisted price, then deletes it. It verifies that the seeded A-GAME-01 price remains 149000 minor. Production execution is pending.
- S3 import exposes the real `importCatalogItems` contract for B3. Dry run and abort perform zero writes. Valid new items are inactive, source-linked drafts. Updates preserve publication state. Lookup and writes use the same SKU canonicalization, including padded item and variant SKUs. Integration tests use both modes, tenant isolation, collisions and a concurrent manual create.
- The shared transaction audit helper commits catalog rows, SKU registrations, ledgers and audit as one unit. An injected audit write failure after inserting a draft and updating an existing item rolls them all back. An identical retry then creates the draft and updates the original exactly once.
- The isolated B1 price check returned 149000 minor for A-GAME-01. ZZZ-SMOKE-UNKNOWN-914 returned no product, NOT_FOUND for price and zero list matches in the same synthetic business.
- S3 stock implements the existing F13 adjustment contract. Debit and cancellation use the same order reference with separate `order` and `order_cancel` keys. Replays preserve the first stock and version result. Cancellation restores the original bucket, even after variant tracking changes, when the bucket remains tracked.
- Idempotency records distinguish actual movements from historical adapter and untracked no-ops. The stock value, item version, movement ledger and audit commit together. Tests cover concurrent duplicate and distinct debits, sold out, tenant scope, inactive and deleted items, and audit rollback.
- The merchant editor can upload, reorder and remove up to five JPEG, PNG or WebP product photos. Customer product details expose ordered, unflagged file IDs for F10. The Google Cloud Node 24 and PostgreSQL run passed 31/31 catalog, item and image tests on 2026-11-21 at 14:31 Bangkok, including actual file bytes, concurrent uploads, tenant scope and staff permissions. The production build passed in the same checkout. Production acceptance is pending.
- Variant management, manual stock UI, synthetic seed photos and CSV export remain pending.
