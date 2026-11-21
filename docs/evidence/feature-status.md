# Feature release status

Total: 0 R, 1 S, 17 A, 13 U.
Production flags were not supplied for this roll-up.

| ID | Feature | Lane | Tier | Mode | Evidence | Blocker |
|---|---|---|---|---|---|---|
| F01 | ฐานโปรเจกต์และการรัน | C1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/core/EVIDENCE.md) |  |
| F02 | ตัวตนและ session | C3 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/auth/EVIDENCE.md) | Seeded production login, cutover and recovery production smoke pending |
| F03 | บัญชี ธุรกิจ สมาชิก และสิทธิ์ | C3 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/tenancy/EVIDENCE.md) | Synthetic invitation/shop lifecycle writes pending |
| F04 | การตั้งค่าธุรกิจ | C3 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/business-settings/EVIDENCE.md) | Synthetic closure/answer-policy write and restoration smoke pending |
| F05 | คลังความรู้และวงจรข้อมูล | B1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/knowledge/EVIDENCE.md) | Production smoke and S3 remain pending. |
| F06 | นำเข้าและสกัดข้อมูล | B3 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/knowledge-import/EVIDENCE.md) | Production deploy and smoke, three-run pitch metric, and real F31 completion notification pending. |
| F07 | ค้นคืน RAG และประเมิน revision | B1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/knowledge-search/EVIDENCE.md) | Remaining saved-case editing, cache, rerank and production source-drawer smoke pending. |
| F08 | Catalog สินค้า/บริการ/variants | B1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/catalog/EVIDENCE.md) | Production smoke and remaining S3 slices pending. |
| F09 | Inbox และประวัติ | A1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/inbox/EVIDENCE.md) |  |
| F10 | AI turn และเครื่องมือ | B2 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/ai-agent/EVIDENCE.md) | S5 trace UI and its production smoke pending. |
| F11 | ทีมและ human handoff | A1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/team/EVIDENCE.md) | F10 restart-to-delivery integration and shared production gate pending |
| F12 | Rich messages และ templates | A1 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/message-templates/EVIDENCE.md) |  |
| F13 | Commerce และ orders | A2 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/orders/EVIDENCE.md) | Staff orders screen and authenticated production smoke pending. |
| F14 | QR การชำระและตรวจสลิป | A2 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/payments/EVIDENCE.md) |  |
| F15 | Booking และ reminders | A3 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/booking/EVIDENCE.md) |  |
| F16 | Google Calendar | A3 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/calendar/EVIDENCE.md) |  |
| F17 | LINE | C2 | P0 | S | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/line/EVIDENCE.md) | NLess Demo activation and on-device receipt, bilingual production smoke and LINE device evidence |
| F18 | Facebook และ Instagram | C2 | P1 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/meta/EVIDENCE.md) | Deferred by the LINE-only release scope |
| F21 | Comment-to-DM | C2 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/comments/EVIDENCE.md) | Deferred by the LINE-only release scope |
| F22 | Live commerce และ product codes | A2 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/live-commerce/EVIDENCE.md) |  |
| F23 | Broadcast และ audiences | A1 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/broadcast/EVIDENCE.md) |  |
| F24 | CRM และ tags automation | A3 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/crm/EVIDENCE.md) | Production smoke awaits deployment and the synthetic merchant window. |
| F26 | Insights และ summaries | B3 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/insights/EVIDENCE.md) |  |
| F27 | Dashboard usage/cost และ traces | B3 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/analytics/EVIDENCE.md) |  |
| F30 | Browser voice | C2 | P3 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/voice/EVIDENCE.md) |  |
| F31 | Notifications และ push | C3 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/notifications/EVIDENCE.md) | PostgreSQL route CI, release smoke, consent producer, and physical iPhone proof pending |
| F35 | Reliability และเครื่องมือปฏิบัติการ | C1 | P0 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/core/EVIDENCE.md) |  |
| F36 | ตรวจรวม เผยแพร่ และหลักฐาน | C1 | P1 | A | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/release/EVIDENCE.md) | Final serving SHA, golden-path run, operator privileges and approved judge QR still require verification. |
| F37 | AI evals และหน้า AI quality | B1 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/evals/EVIDENCE.md) |  |
| F38 | Follow-up nudges | B2 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/follow-ups/EVIDENCE.md) |  |
| F39 | ChatGPT-ready catalog (ACP feed + MCP) | C1 | P2 | U | [Evidence](https://github.com/tanagornf/Endless-Hackathon/blob/main/server/src/features/chatgpt-catalog/EVIDENCE.md) |  |
