# F08 catalog

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F08 | catalog | B1 | DOING | R | A | None | | B1 migration passed. 22 catalog tests plus registry and bilingual key checks passed (54 total). | 2026-11-21 12:07 | S2a catalog create and edit UI, production smoke. |

## Log

- S1 implements database-backed getProduct, getPrice, listCatalogItems and getCatalogItemDetails, the staff read route, seed rows and integer satang parsing.
- Tests cover the canonical seed prices, variant and stock fallback, normalization, bilingual lookup, list filters, tenant boundaries, cursor paging and read permissions.
- The bilingual catalog list shows the staff read route. Create and edit follow in S2a. Import, stock adjustment, image management and production smoke remain pending.
