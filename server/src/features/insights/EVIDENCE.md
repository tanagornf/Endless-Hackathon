# F26 scoped merchant insights

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F26 | insights | B3 | DOING | R | A | None for the scoped report | | 7/7 focused PostgreSQL and Thai/English UI tests, typecheck passed | 2026-11-21 15:26 | Hosted CI and authorized production smoke pending. Full F26 summary remains outside this release. |

## Log

- Lead exception #7059821668 covers only the scoped merchant report at /insights and /api/v1/businesses/:businessId/insights/merchant. Current 7- and 30-day windows start at Bangkok midnight and end at the report snapshot, with an exclusive upper bound.
- Distinct live LINE chats and people come from tenant-filtered core messages, conversations and customers. Demo Chat, eval-* and live-sim: records are excluded. Handoffs read actual core audit events. Pending support counts open human-held handoffs with no subsequent sent staff reply in the same period.
- The order count uses A2's listOrdersByCustomer and checks confirmed order lines for each eligible chat. Cancelled orders are excluded. B2's listAiTurnTopics supplies catalog-backed SKU evidence, matched to eligible inbound message IDs and the same half-open period. Suggestions use actual per-SKU distinct chat counts and matching orders. When service limits could hide records, unavailable order/SKU sections do not show zeros or advice.
- The local tests use real F13 proposal and confirmation and F11 handoff code, synthetic topic fixtures supplied through the B2 service boundary, a wrong-shop and staff denial check, exact date boundaries, empty periods and service caps. React tests check source rows, period switching, loading, empty, error and unavailable states in Thai and English.
- Production operator verification is pending. No production data was changed by B3. F27 and broad P2 remain gated.
- Earlier hosted CI included pre-existing synthetic LINE chats in its shared integration database. The assertion now verifies fixture deltas from a stable reporting snapshot and deliberately tests a nonempty baseline.
