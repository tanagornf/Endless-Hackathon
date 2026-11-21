# F17 LINE

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F17 | line | C2 | DOING | R | S | LINE test OA pending | 53c1181 | F17 tests 20/20, typecheck, check:paths, 2 Playwright API tests discovered | 2026-11-21 12:05:10 +07:00 | NLess Demo activation and on-device receipt, channels UI in TH/EN, media, postback, Flex |

## Log

- S1 implements raw-body signature checks before parsing, encrypted queued events, deduplicated text ingress through the inbox contract, and signed events from LINE follow and unfollow. It registers the real text sender for LINE mode and keeps accepted or uncertain outcomes in the delivery batch ledger.
- The test database exercised concurrent delivery of one synthetic signed event, exactly one inbound row and sandbox AI delivery, connection credential encryption, permission and tenant checks, disconnect, reply reservation, and once-only Push accounting.
- The sender uses a 50-second local reply-token window and stable Push retry keys. A claimed reply is retained as uncertain if the worker exits before saving the provider response.
- The deployment smoke uses the verified connection and webhooks without sending customer messages. Production smoke and console/mobile evidence remain pending. The S1 branch SHA will be replaced with the squash-merge SHA when production evidence is recorded.
