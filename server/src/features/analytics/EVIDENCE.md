# F27 scoped shop overview

## Status

| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F27 | analytics | B3 | DOING | R | A | Recorded LINE and OpenAI events only | | 7/7 local SQL, route and Thai/English UI tests, typecheck passed | 2026-11-21 16:02 | Hosted CI and production smoke pending. Scoped order/follow-up totals unavailable. |

## Log

- Native /dashboard reads tenant-scoped LINE customer conversations. Date filters use the shop timezone and a half-open UTC window. Demo Chat and synthetic eval/live-sim identities are excluded.
- The dashboard and impact APIs report active chats, customers, incoming and reply messages, daily and hourly splits, current assignment queue, measured handoffs and median first replies within 24 hours. The dashboard distinguishes true zero from unknown or unavailable data.
- AI-only handling counts recorded AI replies without a staff reply or handoff. The time estimate uses versioned, audited shop assumptions. Recorded OpenAI cost per AI-only chat stays unknown when cost rows are missing or unpriced.
- Aggregate order and follow-up services cannot yet distinguish the scoped LINE cohort. Their cards report unavailable. The F26 merchant report remains separate and owns SKU evidence. Usage, trace and export are outside this slice.
- Thai and English React results and two Playwright smoke cases were verified for source layout or discovery. Production execution requires a confirmed serving SHA and authorized operator.
