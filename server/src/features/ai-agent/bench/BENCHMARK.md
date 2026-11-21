# F10 staff handoff benchmark

[Issue #118](https://github.com/tanagornf/Endless-Hackathon/issues/118) compares only the decision to connect the customer to staff. It uses synthetic customer messages and a routing context that allows staff handoff. The benchmark scripts run separately from the app.

## Fixture and scoring

The [frozen fixture](https://github.com/tanagornf/Endless-Hackathon/blob/9c866cbed1a1152bab644fa1fb9b21949bb4a4ff/server/src/features/ai-agent/bench/handoff-fixture.json) has eight Thai and eight English messages. Each language has two requests and one greeting resolved by the existing deterministic functions. Its five model-scored messages contain two handoff requests and three negatives covering negation, mention of staff, and order status. Contextual acceptance cases include both the shop's previous message and whether it offered staff help.

F10 uses its `fast` alias and requires `ESCALATION` with confidence at least 0.85, with the existing offer-decline override. Decisions uses a single handoff predicate with a probability threshold of 0.80 fixed before execution. Evaluate the model paths on the same ten eligible messages. Measure one serial classifier call per case with an 8-second deadline. Calculate p50 and p95 using the nearest rank among successful scored cases. Count request errors, timeouts and unscored fallbacks separately from routing errors on completed classifications. A missed handoff is a scored negative on a positive fixture. An unnecessary handoff is a scored positive on a negative fixture. [OpenAI Decisions API reference](https://developers.openai.com/api/reference/resources/decisions/methods/create)

## Current F10 result

The app-dev run used `gpt-6.2-sol` with the runtime classifier and core metering at `794909f99bf5d5cab01d370199b995584f25e97e` on November 21, 2026 ICT. The core recorded all ten responses. Wall timings cover `classifyIntent` including its usage write. The provider path times exclude the usage write and include core request processing.

| Language | Correct | Expected handoffs | Missed | Unnecessary | Errors / timeouts / fallbacks | Wall p50 / p95 (ms) | Provider path p50 / p95 (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Thai | 5/5 | 2 | 0 | 0 | 0 / 0 / 0 | 2147 / 4680 | 1847 / 4609 |
| English | 5/5 | 2 | 0 | 0 | 0 / 0 / 0 | 1722 / 2012 | 1679 / 1967 |
| Total | 10/10 | 4 | 0 | 0 | 0 / 0 / 0 | 1804 / 4680 | 1758 / 4609 |

All six deterministic results were correct and made zero model requests. The serial model run took 21.840 seconds. Provider responses reported 7,142 input and 372 output tokens, with zero cache hits or writes. The app's token meter estimated USD 0.018004 across ten priced responses. The runner made no retries of its own. The core's built-in retry count is unavailable. [Per-case timing and usage](./current-f10-2026-11-21.json)

| Sample | Runtime label | Confidence | Staff handoff |
|---|---|---:|---|
| `th-indirect` | `ESCALATION` | .99 | Yes |
| `th-accept-context` | `ESCALATION` | .99 | Yes |
| `th-negation` | `QUESTION` | .97 | No |
| `th-mention` | `QUESTION` | .99 | No |
| `th-status` | `STATUS_CHECK` | .99 | No |
| `en-indirect` | `ESCALATION` | .99 | Yes |
| `en-accept-context` | `ESCALATION` | .99 | Yes |
| `en-negation` | `STATUS_CHECK` | .85 | No |
| `en-mention` | `QUESTION` | .99 | No |
| `en-status` | `STATUS_CHECK` | 1.00 | No |

## Decisions API result

C1 ran ten serial app-dev calls to `POST /v1/decisions` using `gpt-6-luna` without retries. The input carried the same latest message, previous shop message, and pending staff offer in structured JSON. The runner asked whether the customer wanted human staff to join or take over and used the predeclared probability threshold. The recorded case IDs, labels, probability, latency and metering were checked against the frozen fixture and the F10 result. [Per-case timing, usage and provenance](./decisions-app-dev-2026-11-21.json)

| Language | Correct | Expected handoffs | Missed | Unnecessary | Errors / timeouts / refusals or unscored | SDK call p50 / p95 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Thai | 5/5 | 2 | 0 | 0 | 0 / 0 / 0 | 345 / 1460 |
| English | 5/5 | 2 | 0 | 0 | 0 / 0 / 0 | 307 / 323 |
| Total | 10/10 | 4 | 0 | 0 | 0 / 0 / 0 | 313 / 1460 |

The serial Decisions run took 4.339 seconds. Provider responses recorded 2,623 input tokens and zero output tokens, cache reads, or cache writes. At the published uncached input rate of USD 0.10 per million tokens, the estimated total was USD 0.0002623. [OpenAI Decisions pricing](https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability)

Both scorers matched all ten labels. Decisions was faster in this run than the measured F10 provider path. The Decisions timing covers the SDK call and result handling. The F10 provider timing includes core request preparation, and its wall timing also includes database metering. Models, prompts, and input encoding differ. The ten synthetic cases measure this routing predicate and provide no estimate of the production error rate.

## Reproduce the current F10 side

Run `node --import tsx server/src/features/ai-agent/bench/current-f10.ts` from the worktree root to confirm the path of all 16 samples without provider calls. To run the ten paid calls, load the private B2 app-dev configuration in the benchmark process and pass `--baseline`. The runner checks the official API origin, development mode, B2 lane, and B2 database name before invoking the existing classifier. The core writes usage rows without a tenant or conversation association. The script does not send messages or create businesses or conversations.
