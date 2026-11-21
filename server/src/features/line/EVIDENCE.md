# F17 LINE

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F17 | line | C2 | DOING | R | S | LINE test OA pending | b1341c3b79e5fd9969868101305008091d17776a | F17 tests 59/59, typecheck, check:paths, 3 Playwright checks discovered | 2026-11-21 13:08:24 +07:00 | NLess Demo activation and on-device receipt, bilingual production smoke and LINE device evidence |

## Log

- S1 implements raw-body signature checks before parsing, encrypted queued events, deduplicated text ingress through the inbox contract, and signed events from LINE follow and unfollow. It registers the real text sender for LINE mode and keeps accepted or uncertain outcomes in the delivery batch ledger.
- Push retry regression tests reproduced a 5xx followed by a fresh Reply token and a retry after 24 hours. A persisted Push reservation now preserves the original retry key and ends delivery as unknown if that key has expired. The SQL ledger and F17 suite passed 25/25 with typecheck and ownership.
- The test database exercised concurrent delivery of one synthetic signed event, exactly one inbound row and sandbox AI delivery, connection credential encryption, permission and tenant checks, disconnect, reply reservation, and once-only Push accounting.
- The sender uses a 50-second local reply-token window and stable Push retry keys. A claimed reply is retained as uncertain if the worker exits before saving the provider response.
- The deployment smoke uses the verified connection and webhooks without sending customer messages. Production smoke and console/mobile evidence remain pending. S1 merged in PR #10.
- The Reply safety regression reproduced a 502 followed by replay. The sender now keeps the uncertain reservation, with exactly one Reply request and zero Push requests in the regression test.
- The settings slice wires the bilingual channels page to the existing connection and event APIs. Tests exercise both languages and the staff read-only view.
- Media tests cover signed tenant-scoped reads, expiration, variants, provider download limits, file signature checks and external URL handling. The checked postback tests cover order and booking confirmation ownership, expiry, replay and unavailable service behavior.

- The Flex delivery tests cover Thai and English cards, surrogate-pair-safe text, confirmation tokens encrypted in PostgreSQL, stable action IDs across replay, batch size, and refusing to reuse a Push retry key when the recipient, OA, or formatted body changes. The combined scoped suite passed 59/59 before release.

## Production verification

| Check | Result |
|---|---|
| A team test account sent a message to NLess Demo, it appeared in Shop A inbox, and LINE received the answer | C0 confirmed real incoming events, Console Verify, and an English handset reply. The five-second inbox interval was not measured in that record. [Production verification](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058720387) · [English handset and Console Verify](https://github.com/tanagornf/Endless-Hackathon/issues/1#issuecomment-7058802723) |
| Reply older than 50 seconds delivered by Push | Pending provider evidence. The cutoff and retry behavior passed fake-provider tests |
| Image and sticker persisted in the inbox | Pending device evidence. Local file and normalization tests passed |
| Product and review cards displayed with working buttons | Pending device evidence. Formatting and database token integration passed |
| Confirming a review created an order when F13 was available | Pending the real F13 and configured test OA |
| Disconnect stopped delivery and reconnect restored it | Pending device evidence. The local sandbox or API checks passed |
| Production Playwright connection and both page languages | Pending the public production deployment and test OA |

The hosted disconnect regression reproduced a scheduled connection attempt after an owner had disconnected a different OA. Bootstrap now honors the shop's recorded disconnect before calling LINE and checks it again inside the connection transaction. An explicit owner reconnect can still replace it.

For one remaining operator session, C0 first confirms the deployed revision and runs the bilingual LINE smoke. On the team handset, keep OA Chat enabled and check the native Read indicator, product Flex and a synthetic order confirmation. Verify inbound photo and sticker in the inbox. Use one staff reply after the 50-second window to check live Push. Check the missing-media text only when an approved synthetic fixture is available. Use a coordinated maintenance window for disconnect and reconnect. Record the Bangkok time, deployed SHA and test account alias only.
