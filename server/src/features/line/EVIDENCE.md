# F17 LINE

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F17 | line | C2 | DOING | R | S | LINE test OA pending | 3c9664e551fc35c009a001172a16333c6b417ea5 | F17 tests 21/21, typecheck, check:paths, 2 Playwright API tests discovered | 2026-11-21 12:16:20 +07:00 | NLess Demo activation and on-device receipt, channels UI in TH/EN, media, postback, Flex |

## Log

- S1 implements raw-body signature checks before parsing, encrypted queued events, deduplicated text ingress through the inbox contract, and signed events from LINE follow and unfollow. It registers the real text sender for LINE mode and keeps accepted or uncertain outcomes in the delivery batch ledger.
- The test database exercised concurrent delivery of one synthetic signed event, exactly one inbound row and sandbox AI delivery, connection credential encryption, permission and tenant checks, disconnect, reply reservation, and once-only Push accounting.
- The sender uses a 50-second local reply-token window and stable Push retry keys. A claimed reply is retained as uncertain if the worker exits before saving the provider response.
- The deployment smoke uses the verified connection and webhooks without sending customer messages. Production smoke and console/mobile evidence remain pending. S1 merged in PR #10.
- The Reply safety regression reproduced a 502 followed by replay. The sender now keeps the uncertain reservation, with exactly one Reply request and zero Push requests in the regression test.
