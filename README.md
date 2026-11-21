# Endless

Endless is a bilingual sales assistant for Thai shops that sell through chat. The app brings customer conversations into a shared inbox and uses each shop’s catalog and knowledge to answer questions.

## Development

Use Node.js 24. In your assigned worktree, run:

```sh
npm ci
npm run lane:init
npm run db:migrate
npm run db:seed
npm run dev
```

The lane initializer provisions the assigned local and test PostgreSQL databases. Keep workstation configuration in the machine-level secrets file described in the [setup prompt](prompts/C1-setup.md). In development, open the web URL for your lane and visit `/dev-login` to select a synthetic owner or staff account.

```sh
npm run typecheck
npm test
npm run smoke
npm run e2e -- core
```

See [the product brief](docs/PRODUCT.md), [the development cookbook](docs/COOKBOOK.md), and [deployment instructions](docs/day/deployment.md).

## Declared prior work

The baseline contains planning documents, feature specifications, type-only contract references, the team board script, and Codex session configuration. Application implementation for the event starts with the F01 setup branch. The repository uses synthetic fixtures for the demo and development tests.

## Release evidence

The customer and judge entry is the team LINE Official Account. The approved QR export is pending. Demo Chat is reserved for internal QA.

Evidence snapshot based on `926e5c09d7a723abe66adb5d532028b1cadece05`.

0 R · 1 S · 17 A · 13 U

| ID | Feature | Mode | Evidence |
|---|---|---|---|
| F01 | ฐานโปรเจกต์และการรัน | A | [Evidence](server/src/core/EVIDENCE.md) |
| F02 | ตัวตนและ session | A | [Evidence](server/src/features/auth/EVIDENCE.md) |
| F03 | บัญชี ธุรกิจ สมาชิก และสิทธิ์ | A | [Evidence](server/src/features/tenancy/EVIDENCE.md) |
| F04 | การตั้งค่าธุรกิจ | A | [Evidence](server/src/features/business-settings/EVIDENCE.md) |
| F05 | คลังความรู้และวงจรข้อมูล | A | [Evidence](server/src/features/knowledge/EVIDENCE.md) |
| F06 | นำเข้าและสกัดข้อมูล | A | [Evidence](server/src/features/knowledge-import/EVIDENCE.md) |
| F07 | ค้นคืน RAG และประเมิน revision | A | [Evidence](server/src/features/knowledge-search/EVIDENCE.md) |
| F08 | Catalog สินค้า/บริการ/variants | A | [Evidence](server/src/features/catalog/EVIDENCE.md) |
| F09 | Inbox และประวัติ | A | [Evidence](server/src/features/inbox/EVIDENCE.md) |
| F10 | AI turn และเครื่องมือ | A | [Evidence](server/src/features/ai-agent/EVIDENCE.md) |
| F11 | ทีมและ human handoff | A | [Evidence](server/src/features/team/EVIDENCE.md) |
| F12 | Rich messages และ templates | U | [Evidence](server/src/features/message-templates/EVIDENCE.md) |
| F13 | Commerce และ orders | A | [Evidence](server/src/features/orders/EVIDENCE.md) |
| F14 | QR การชำระและตรวจสลิป | A | [Evidence](server/src/features/payments/EVIDENCE.md) |
| F15 | Booking และ reminders | U | [Evidence](server/src/features/booking/EVIDENCE.md) |
| F16 | Google Calendar | U | [Evidence](server/src/features/calendar/EVIDENCE.md) |
| F17 | LINE | S | [Evidence](server/src/features/line/EVIDENCE.md) |
| F18 | Facebook และ Instagram | U | [Evidence](server/src/features/meta/EVIDENCE.md) |
| F21 | Comment-to-DM | U | [Evidence](server/src/features/comments/EVIDENCE.md) |
| F22 | Live commerce และ product codes | U | [Evidence](server/src/features/live-commerce/EVIDENCE.md) |
| F23 | Broadcast และ audiences | U | [Evidence](server/src/features/broadcast/EVIDENCE.md) |
| F24 | CRM และ tags automation | A | [Evidence](server/src/features/crm/EVIDENCE.md) |
| F26 | Insights และ summaries | U | [Evidence](server/src/features/insights/EVIDENCE.md) |
| F27 | Dashboard usage/cost และ traces | U | [Evidence](server/src/features/analytics/EVIDENCE.md) |
| F30 | Browser voice | U | [Evidence](server/src/features/voice/EVIDENCE.md) |
| F31 | Notifications และ push | A | [Evidence](server/src/features/notifications/EVIDENCE.md) |
| F35 | Reliability และเครื่องมือปฏิบัติการ | A | [Evidence](server/src/core/EVIDENCE.md) |
| F36 | ตรวจรวม เผยแพร่ และหลักฐาน | A | [Evidence](server/src/features/release/EVIDENCE.md) |
| F37 | AI evals และหน้า AI quality | U | [Evidence](server/src/features/evals/EVIDENCE.md) |
| F38 | Follow-up nudges | U | [Evidence](server/src/features/follow-ups/EVIDENCE.md) |
| F39 | ChatGPT-ready catalog (ACP feed + MCP) | U | [Evidence](server/src/features/chatgpt-catalog/EVIDENCE.md) |

R means Real, S means Sandbox, A means Adapter, and U means Unimplemented.

112 merged pull requests, 112 commits and 72249 added lines.
Candidate Vitest counts are unavailable.
Candidate golden-path counts are unavailable.

See the [feature ledger](docs/FEATURE_STATUS.csv), [production evidence](docs/evidence/release.md), [Codex timeline](docs/evidence/codex-timeline.md) and [submission checklist](docs/submission/SUBMISSION.md).
