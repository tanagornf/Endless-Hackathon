# F13 orders

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F13 | orders | A2 | DOING | R | A | None for proposals | f16a768 | A2 integration and shipping, 33 tests. Typecheck and path ownership passed. | 2026-11-21 14:46 | Confirmation, staff UI and production smoke pending. |

## Slice 1

- `createOrderFromProposal` persists an immutable Thai or English quote for the scoped F09 conversation. It snapshots F08 prices, item versions, shipping and the customer language. Replays return the saved card; concurrent quotes supersede the preceding version without creating an order.
- `GET /api/v1/businesses/:businessId/orders/settings` requires `orders.read`. `PUT` requires `business.commerce`, validates the expected version and writes the audit event with the settings.
- The A2 test database applied the migration and seed with `MODEL_MODE=fake`. Integration coverage includes both shops, canonical totals, sold-out items, invalid quantities, aliases, replay, concurrency, language switching, tenant visibility and settings permissions.
- `npm run e2e -- orders --list` discovers the read-only settings and isolation check for the synthetic merchant. Production execution is pending. The staff orders screen and confirmation contract belong to later slices.
