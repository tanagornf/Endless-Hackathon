# F13 orders

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F13 | orders | A2 | DOING | R | A | None for proposals | 6937e4f | A2 order integration and shipping, 41 tests. Typecheck and path ownership passed. | 2026-11-21 14:57 | Staff orders screen and authenticated production smoke pending. |

## Slice 1

- `createOrderFromProposal` persists an immutable Thai or English quote for the scoped F09 conversation. It snapshots F08 prices, item versions, shipping and the customer language. Replays return the saved card; concurrent quotes supersede the preceding version without creating an order.
- `GET /api/v1/businesses/:businessId/orders/settings` requires `orders.read`. `PUT` requires `business.commerce`, validates the expected version and writes the audit event with the settings.
- The A2 test database applied the migration and seed with `MODEL_MODE=fake`. Integration coverage includes both shops, canonical totals, sold-out items, invalid quantities, aliases, replay, concurrency, language switching, tenant visibility and settings permissions.
- `npm run e2e -- orders --list` discovers the read-only settings and isolation check for the synthetic merchant. Production execution is pending. The staff orders screen and confirmation contract belong to later slices.

## Slice 2

- Customer card and provider postback decisions create one order, receipt and outbox in a transaction. Duplicate decisions return the original receipt. Expired, wrong-shop, wrong-conversation and altered-token requests fail before purchase. Price changes produce a fresh localized card.
- F08 stock debit and refund use the same order UUID and item/variant. F13 records the lines that incurred a real debit. The test covers a later sold-out line, compensation of the earlier line, and zero credited lines when the adapter returns null stock. A crash between the separate F08 debit and the F13 commit can leave stock to reconcile as described in §5.2.
- The payment hook fallback and confirmation use stable message keys. The outbox checks F09 delivery before marking these rows done. Local tests include Thai, English, unavailable payment settings, a successful payment hook, and an independent observer.
- Public contracts now include confirm, getOrderMetrics and listOrdersByCustomer. F14 can use getOrderForPayment, setPaymentState and registerOrderHook. Full staff actions, the orders screen and production operational evidence are pending. Local tests used fake model mode and the A2 test database.

## Printable shipping queue

The shop can view outstanding shipments through a selected Bangkok date, including unassigned deadlines and carry-over work. A permitted staff member can edit the recipient, address and shipByAt with order-version checks. The A4 print view includes the order number, recipient, address, payment/packing state, item name, SKU and quantity. A synthetic local database test covered the midnight boundary, unscheduled orders, cancellations, pickup exclusion, foreign shops, stale edits and readback. Chromium at 393px loaded TH and EN from the real local API and printed both PDFs. Workspace typecheck and the production build passed. Production verification is pending.
