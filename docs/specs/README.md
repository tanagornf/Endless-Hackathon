# Build specs: แบบสร้างของทุกฟีเจอร์ (31 ไฟล์)

อัปเดต 20 พ.ย. 2569 (ค่ำ) · ตาม [DECISIONS D1](../DECISIONS-2026-11-20.md): วันงานสร้างจาก **spec ของเราเอง** ในโฟลเดอร์นี้ ไม่เปิดโค้ด Papi (`../papi-ref` ปิด เว้นแต่หัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` หลังผู้จัดยืนยันเป็นลายลักษณ์อักษร) ทุกไฟล์ต้องครบพอที่ Codex สร้างได้โดยไม่ต้องออกแบบเอง

ลำดับความจริงเมื่อขัดกัน: [`contracts.ts`](../competition-plan/templates/contracts.ts) (signature) → [`AGENTS.md`](../competition-plan/templates/AGENTS.md) (กติกา repo) → lane prompt → **spec ในโฟลเดอร์นี้** → [porting brief](../porting/README.md) (know-how เดิม) → เอกสารเก่า 02–07 · การเรียก AI ทุก call ยึด [openai-api.md](../openai-api.md)

## ดัชนี

| ID | Spec | Lane | Tier | เป้า | นาที (low–high) |
|---|---|---|---|---|---|
| F01 | [core / setup](F01-core.md) | C1 | P0 | R | 60–105 |
| F02 | [auth](F02-auth.md) | C3 | P1 | R | 45–90 |
| F03 | [tenancy](F03-tenancy.md) | C3 | P0 | R | 45–90 |
| F04 | [business-settings](F04-business-settings.md) | C3 | P0 | R | 30–60 |
| F05 | [knowledge](F05-knowledge.md) | B1 | P0 | R | 45–90 |
| F06 | [knowledge-import](F06-knowledge-import.md) | B3 | P1 | R (text/CSV) | 60–150 |
| F07 | [knowledge-search](F07-knowledge-search.md) | B1 | P0 | R | 60–120 |
| F08 | [catalog](F08-catalog.md) | B1 | P0 | R | 30–60 |
| F09 | [inbox + Demo Chat](F09-inbox.md) | A1 | P0 | R | 45–90 |
| F10 | [ai-agent](F10-ai-agent.md) | B2 | P0 | R | 75–180 |
| F11 | [team / takeover](F11-team.md) | A1 | P0 | R | 45–90 |
| F12 | [message-templates](F12-message-templates.md) | A1 | P2 | R | 45–120 |
| F13 | [orders](F13-orders.md) | A2 | P1 | R | 60–150 |
| F14 | [payments (dynamic QR + slip checks)](F14-payments.md) | A2 | P1 | S | 75–180 |
| F15 | [booking](F15-booking.md) | A3 | P2 | R | 60–150 |
| F16 | [calendar](F16-calendar.md) | A3 | P2 | R (Google test user) | 45–120 |
| F17 | [line](F17-line.md) | C2 | P0 | R | 45–120 |
| F18 | [meta (Messenger + Instagram)](F18-meta.md) | C2 | P1 | R (test users) | 60–150 |
| F21 | [comments](F21-comments.md) | C2 | P2 | S | 45–120 |
| F22 | [live-commerce](F22-live-commerce.md) | A2 | P2 | R (in-app) | 45–90 |
| F23 | [broadcast](F23-broadcast.md) | A1 | P2 | R (LINE) | 45–120 |
| F24 | [crm](F24-crm.md) | A3 | P1 | R | 45–90 |
| F26 | [insights](F26-insights.md) | B3 | P2 | R | 30–90 |
| F27 | [analytics (+ seller impact metrics)](F27-analytics.md) | B3 | P2 | R | 60–165 |
| F30 | [voice](F30-voice.md) | C2 | P3 | R (browser) | 90–210 |
| F31 | [notifications](F31-notifications.md) | C3 | P1 | R (in-app) | 30–75 |
| F35 | [core/jobs](F35-core-jobs.md) | C1 | P0 | R | 60–150 |
| F36 | [release](F36-release.md) | C1 | P1 | R | 60–120 |
| F37 | [evals (AI quality)](F37-evals.md) | B1 | P2 | R | 45–120 |
| F38 | [follow-ups](F38-follow-ups.md) | B2 | P2 | R | 30–75 |
| F39 | [chatgpt-catalog (ACP feed + MCP)](F39-chatgpt-catalog.md) | C1 | P2 | R (feed + MCP endpoint) | 45–105 |

เจ้าของ ลำดับใน lane และ tier ต้องตรงกับ `FEATURES` / `LANE_ORDER` ใน `contracts.ts`, [feature-backlog.csv](../competition-plan/feature-backlog.csv) และ [PLAN.md](../../PLAN.md) (ตรวจด้วย `docs/competition-plan/checks/check-consistency.mjs`)

## โครงของ spec (หัวข้อคงที่ 15 ข้อ ห้ามเปลี่ยนชื่อหรือลำดับ)

ทุกไฟล์ขึ้นต้นด้วย `# <ID> <slug> — <ชื่อไทย>` ตามด้วยตารางหัว (lane, คน, tier, เป้าสถานะ, timebox, พึ่งอะไร, ให้อะไร, ใช้อะไร, โฟลเดอร์, web paths) แล้วตามด้วย:

1. `## 1. เป้าหมายและ user stories` — ทำไมมี, ใครใช้, 3–6 user stories, สิ่งที่อยู่นอก scope
2. `## 2. Data model` — SQL `CREATE TABLE` เต็ม (ชนิด, NOT NULL, default, CHECK, UNIQUE, FK + ON DELETE, index) ชื่อไฟล์ migration `NNN_<snake>.sql` พร้อมบรรทัดหัว dependency ตามรูปแบบของ [C1-setup](../../prompts/C1-setup.md) · ทุกตารางมี `business_id` และทุก query กรองด้วยค่านี้
3. `## 3. API endpoints` — ตาราง method / path (ใต้ `/api/v1`) / auth (`none|user|business|platform_admin`) / permission key / request (zod) / response type / error codes แล้วตามด้วย zod schema และ type เป็น TypeScript
4. `## 4. Service functions และ contracts` — ฟังก์ชันใน `service.ts` (signature, พฤติกรรม, error) · contract ข้าม lane ต้องตรง `contracts.ts` ทุกตัวอักษร · ของใหม่ที่ต้องเพิ่มใน contracts อยู่ใต้หัวข้อย่อย `### Contract additions`
5. `## 5. Algorithms` — ทีละขั้นแบบมีเลขข้อ พร้อมค่าคงที่และ threshold (บอกว่าค่าไหนปรับได้ในวันงาน) state machine เป็นตาราง from → event → to
6. `## 6. AI calls` — ต่อ call: ชื่อ purpose (สำหรับ `model_usage`), alias (`chat|fast|strong`), reasoning effort, max output tokens, **developer prompt เต็ม (ภาษาอังกฤษ)**, strict JSON schema, tool definitions, พฤติกรรมใน `MODEL_MODE=fake`, ผล validate กับ API จริง (ถ้าทำ) · ฟีเจอร์ที่ไม่มี AI เขียนว่า "ไม่มี AI call"
7. `## 7. UI` — route, เมนู (`MenuGroup`), component จาก UI kit ของ core, state loading / empty / error, ตาราง i18n key → ไทย / อังกฤษ (ทั้งสองคอลัมน์ต้องมีค่าทุกแถว)
8. `## 8. Jobs, schedules, events` — ชื่อ job + payload + dedupKey + lockKey + retry, schedule, realtime event, audit action, `notify()`
9. `## 9. Seed และ fixtures` — แถว seed ของสองร้านสังเคราะห์ (SPEC §5 / `SEED` ใน contracts) + fixture ของ test (สร้างด้วยโค้ดในวันงาน ไม่พึ่งไฟล์จากเครื่องเตรียมงาน)
10. `## 10. Tests` — unit, route (supertest), และ Playwright smoke 1 ไฟล์ที่รันกับ production (`web/src/features/<slug>/e2e/<slug>.smoke.spec.ts`) พร้อมชื่อ case
11. `## 11. Acceptance: R ตาม D6` — checklist ที่ต้องผ่านทุกข้อจึงนับ R · บอกว่าอะไรทำให้เป็น S / A · status floor
12. `## 12. Security และ privacy` — tenant isolation, permission, webhook signature, rate limit, PII, สิ่งที่ห้าม log
13. `## 13. Edge cases` — รายการกรณีขอบพร้อมผลที่ต้องได้
14. `## 14. Build order (slices)` — slice ละ ≤45 นาที merge ได้ทีละ slice · slice แรกคือส่วนที่ lane อื่นหรือ gate รอ
15. `## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน` — ทุกข้อบอกวิธีตรวจ

## ข้อตกลงร่วมของทุก spec

- **Stack:** Node.js 24 + TypeScript (tsx, ไม่มี build ฝั่ง server), Express 5, PostgreSQL 17 + pgvector (raw SQL ผ่าน `db` ของ core ไม่มี ORM), zod 4, Vitest 4, Playwright, React 19 + Vite + MUI 9 + i18next · library ทั้งหมดติดตั้งตอน setup ([C1-setup S1](../../prompts/C1-setup.md)) ถ้า spec ต้องการเพิ่ม ต้องอยู่ในรายการนั้น
- **Layout:** `server/src/features/<slug>/{routes.ts,service.ts,migrations/,seed.ts,*.test.ts,EVIDENCE.md}` · `web/src/features/<slug>/{pages.tsx,i18n/th.json,i18n/en.json,e2e/}` · `shared/features/<slug>/types.ts` · แพตเทิร์นโค้ดอยู่ใน [COOKBOOK.md](../COOKBOOK.md)
- **HTTP:** ทุก route ประกาศผ่าน `defineFeatureRoutes()` · body สำเร็จ = `ApiResult<T>` · ผิดพลาด = `AppError(code)` จาก `ErrorCode` ใน contracts (ห้ามตั้ง code ใหม่เอง)
- **เงิน:** integer สตางค์ (`*_minor`), `currency 'THB'` · **เวลา:** เก็บ UTC (`timestamptz`), แสดง Asia/Bangkok, test ใช้ `CLOCK_FIXTURE`
- **AI:** เรียกผ่าน `model.*` ของ core เท่านั้น เลือก alias ไม่ใช่ model ID · ทุก alias = `gpt-6.2-sol` · ไม่มี `temperature` · output ของ model เป็นข้อมูล ต้องผ่าน zod และกฎในโค้ดก่อนมีผล · test/CI ใช้ `MODEL_MODE=fake`
- **Production bar (D6):** ฟีเจอร์เป็น R เมื่อ UI จริงต่อ API และ DB จริง, เรียก provider จริงถ้ามี, deploy บน production URL, มี unit + route test และ Playwright smoke ที่รันกับ production ผ่าน, มี loading / empty / error state, **ใช้ได้ครบทั้งภาษาไทยและอังกฤษ** (ดูข้อ "สองภาษา" ข้างล่าง), ตรวจ permission และ tenant, audit เมื่อเงินหรือข้อมูลลูกค้าเปลี่ยน · ฟีเจอร์ที่ไม่ถึง R ตอน 15:30 ถูกซ่อนจากเมนูด้วย feature flag ของ core
- **สองภาษา (ไทย + อังกฤษ บังคับทุกฟีเจอร์ ไม่ใช่ "ถ้ามีเวลา"):** (1) หน้าเว็บ: ทุกข้อความมาจาก `i18n/th.json` และ `i18n/en.json` ที่ key เท่ากันทุกตัว (test กลาง `web/src/core/i18n/completeness.test.ts` ใน CI ทำให้ฟีเจอร์ที่มีภาษาเดียวหรือ key ขาด merge ไม่ได้) และเปลี่ยนภาษาได้ทุกหน้าด้วย `LanguageSwitch` ของ core รวมหน้าสาธารณะที่ไม่ใช้ shell · (2) ข้อความที่โค้ดส่งถึงลูกค้าผ่านช่องทาง (ไม่ใช่ข้อความของโมเดล): เก็บเป็น `{ th, en }` ใน `messages.ts` / `labels.ts` ของฟีเจอร์ เลือกด้วย `getCustomerLanguage(conversationId)` ของ F09 และจัดรูปเงินด้วย `formatMoneyText(minor, lang)` ของ core · (3) AI ตอบภาษาเดียวกับข้อความของลูกค้า ตัดสินใหม่ทุกข้อความ (F10 §5.13) · `BusinessSettings.language` เป็นแค่ค่าเริ่มต้นเมื่อบอกภาษาไม่ได้ ไม่ใช่ตัวล็อก · ข้อความถึงพนักงาน (notify, โน้ตระบบ) ใช้ภาษาของร้าน · (4) **test ที่ครอบภาษาที่สอง (ระบุตายตัว):** ก. completeness test ของ core (ทุก namespace) · ข. Playwright smoke ของทุกฟีเจอร์ที่มีหน้าเว็บมี case `renders in English` เรียก `expectPageInEnglish(page, <path หลัก>, <page.title คอลัมน์ en ใน §7>)` จาก `tests/e2e/fixtures.ts` · ค. ฟีเจอร์ที่ส่งข้อความถึงลูกค้ามี unit test ว่า map ข้อความมีครบสองภาษาและค่า `en` ไม่มีอักษรไทย · ง. เส้นทางแชตมี case อังกฤษเต็มรูปแบบใน F09 (Demo Chat อังกฤษ), F10 (G13–G16 + smoke ข้อ 5), F37 (48 กรณีอังกฤษ) · spec ไหนที่ §10 ยังเขียนเฉพาะ case ไทย ให้ถือว่าข้อ ข และ ค นี้เป็นส่วนหนึ่งของ §10 ของ spec นั้น
- **ชื่อ:** job `<slug>.<verb>` · audit action `<slug>.<noun>.<verb>` · i18n key `<slug>.<area>.<key>` · purpose ของ `model_usage` เป็นคำสั้นตาม `UsageAttribution.purpose`
- **ที่มา:** ทุก spec เขียนด้วยคำของทีมเอง ไม่มีโค้ด schema หรือ prompt ที่คัดจาก Papi และไม่สั่งให้อ่าน `../papi-ref`
