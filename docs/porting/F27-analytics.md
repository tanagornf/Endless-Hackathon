# F27 analytics — dashboard, usage/cost และ trace
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F27-analytics.md](../specs/F27-analytics.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B3 ลำดับ 3/3 · **เจ้าของ** B · **พึ่ง** core (`model_usage`, conversations, messages), F09, F10 (trace), F35 · **timebox** 45–120 นาที
**ให้** หน้า `/dashboard`, `/usage`, `/traces` · **ใช้** `db` (อ่าน `model_usage` และตารางกลางของ core แบบ read-only), `getTurnTrace()` ของ F10 (export ของ B2 ไม่ใช่ contract ถ้ายังไม่มีโพสต์ `CHANGE TO:B2`), `requirePlatformAdmin()`, `audit()`

## Papi files to read (in order)
1. `Database/aitokenusage.sql` (header: ใครเห็นได้และทำไม) + header ของ `Backend/layers/nodejs-utils/nodejs/model-usage.mjs`
2. `Backend/layers/nodejs-utils/nodejs/billing/model-pricing.mjs` (rate card, `priceUsageRows`, แยก web / non-web / unknown; ราคาของ provider เดิมใช้ไม่ได้ ใช้ `MODEL_PRICE_TABLE` ของ OpenAI แทน)
3. `Backend/functions/GetAccountUsage/README.md` + `src/usage-summary.mjs`, `src/usage-queries.mjs`
4. `Database/chatturntraces.sql` (header) + `Backend/functions/GetChatTrace/src/index.mjs` (gate, audit, limit)
5. `Backend/functions/Orchestrator/src/turn-trace.mjs`, `dev-trace.mjs` (อะไรถูก redact และตัดขนาด)
6. `Frontend/src/pages/Home.tsx` (เฉพาะ dashboard ร้าน), `components/dashboard/WaitingQueue.tsx`
7. `Frontend/src/pages/AdminAccountUsage.tsx`, `DevTraces.tsx` · `Frontend/src/functions/accountUsage.ts`, `devTrace.ts`
8. tests: `Backend/tests/account-token-usage.test.mjs`, `usage-channel-cost.test.mjs`, `get-chat-trace.test.mjs`, `model-usage-recorder.test.mjs`

## Behaviors to keep
- **(ถูกแทนด้วย spec F27)** Papi ซ่อนต้นทุนจาก tenant เพราะมีโควตาแพ็กเกจ; เราไม่มีโควตา: เจ้าของ (`business.bot_settings`) เห็นต้นทุนของร้านตัวเองได้ · F27 แสดง usage / ต้นทุนอย่างเดียว ไม่มี allowance หรือโควตา (ใช้ได้ไม่จำกัด)
- ต้นทุนเป็น **ประมาณการจาก rate card ไม่ใช่ใบแจ้งหนี้** ติดป้ายทุกที่ · model ที่ไม่มี rate: Papi นับ 0 แล้วระบุชื่อใน `unpriced_models` → ใหม่ `costUsdMicros = null` + `costReason 'no_rate'` และยอดรวมบอกว่ามีส่วนที่ไม่รู้ ห้ามกลายเป็น 0
- แยกต้นทุนตามช่อง web / non-web / unknown · conversation ที่หายไปนับเป็น unknown ห้ามเดา channel จาก business
- trace: platform admin เท่านั้น · ทุกการเปิด trace เดี่ยวเขียน audit (Papi: `chat_trace_views`) · secret ถูก redact ตอนเขียนและมีเพดานขนาดต่อ field · ค้นได้ default 50 สูงสุด 200
- dashboard ร้าน: คิวที่รอ staff, สรุป insight, ทางลัด · ไม่มี platform dashboard ของ admin (ตัดออกจาก scope)
- ตัดวันตาม Asia/Bangkok · KPI นับจากแถวที่ persist จริงด้วย SQL ที่ตรวจซ้ำได้ ห้ามนับจาก state ฝั่งเว็บ
- export: มีแต่ตัวเลขรวมและ id ไม่มี prompt ดิบ ข้อความลูกค้า หรือ secret

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- platform admin เห็น Developer Mode ทุกแชตเป็นค่าเริ่มต้น (`f87c3c26`)

## Drop / replace
- `ai_token_usage` + `TOKEN_LOGGING_ENABLED` + CloudWatch log line → `model_usage` ที่ core เขียนทุก call (F27 อ่านอย่างเดียว) · rate card + อัตรา USD/THB ใน code → `MODEL_PRICE_TABLE` ใน `.env` (JSON ของ OpenAI ใน [docs/openai-api.md](../openai-api.md) §1.1 + อัตรา realtime §10.1) · usage รวม reasoning token, cached token และ realtime (purpose `voice.turn`, `voice.transcribe`)
- `chat_turn_traces` ของ Papi → trace ของ F10 (`ai_turns`) ห้ามสร้าง trace ชุดที่สอง · ExportTurnTraces (S3/Athena) → export CSV/JSON จาก route · GetPlatformUsage 8 topics + DrillModal (platform dashboard) → ไม่ทำ

## Tables
- ไม่มีตารางบังคับ: อ่าน `model_usage`, conversations, messages ของ core · ตัวเลขของฟีเจอร์อื่น (orders, bookings) อ่านผ่าน `service.ts` ถ้าไม่มีให้โพสต์ `CHANGE TO:<เจ้าของ>` ขอ read-only function · บันทึกการเปิด trace ด้วย `audit()` ของ core

## Done when
- SPEC F27: count ตรงกับ record · unknown usage/cost เป็น null · แยก cost / valuation / invoice · ร้านไม่อ่าน trace ของอีก tenant · export ไม่เผย secret
- เจ้าของร้านที่มี `business.bot_settings` เห็นต้นทุนของร้านตัวเอง (พนักงานไม่มีสิทธิ์ = 403) · เห็นต้นทุนรวมของ A พร้อมชื่อ model ที่ไม่มี rate · KPI จำนวนข้อความของ seed ตรงกับ `SELECT count(*)`
- test ใช้ `CLOCK_FIXTURE` และวันตัดที่ 17:00Z (เที่ยงคืน Bangkok)

## Status floor
usage/cost + trace gate = **R** · KPI ของร้าน = R เฉพาะตัวที่มี SQL test · export = A/U ตามจริง
