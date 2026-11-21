# F38 follow-ups

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F38 | follow-ups | B2 | DOING | R | A | Controlled model only | | 33/33 local across settings routes, quiet hours, opt-out and bilingual generation | 2026-11-21 16:23 +07:00 | Scheduler, sending, recovery, metrics and merchant UI pending. |

## Log

- S1 adds tenant-scoped versioned follow-up settings and audit history. The default is disabled. LINE and internal Demo Chat are the supported channel choices.
- Thai and English opt-outs and local quiet hours have deterministic tests. The localized follow-up generator uses the buyer language from F09 and substitutes a guarded template if the model fails or returns unsafe copy. The test suite made no provider calls or customer sends.
