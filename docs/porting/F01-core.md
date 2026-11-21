# F01 core — ฐานโปรเจกต์และการรัน

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F01-core.md](../specs/F01-core.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C1 ลำดับ 1/3 (setup ตาม [prompts/C1-setup.md](../../prompts/C1-setup.md)) · **คน** C · **พึ่ง** ไม่มี · **เป้า** R (golden path) · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** ตาม [contracts.ts](../competition-plan/templates/contracts.ts): `getUser()`, `getBusiness()`, `requirePermission()`, `requirePlatformAdmin()`, `db`, `model.chat()` / `model.embed()` / `model.moderate()` / `model.transcribe()` / `model.createRealtimeSession()` + `model.recordRealtimeUsage()` (OpenAI API อย่างเดียว ตาม [docs/openai-api.md](../openai-api.md) §13), `sendToCustomer()` + `registerChannelSender()` (sender `web` + sandbox capture ของช่องทางอื่น), `publish()`, `storage`, `audit()`, `AppError`, base ของ `jobs` (F35 ทำต่อ) และ fake ของทุก contract · **ใช้** ไม่มี

## Papi files to read (in order)
1. `AGENTS.md` (runtime flow, shared layer contract) แล้ว `Frontend/src/App.tsx` (route table + gating: `AccountDisabled`, `NoBusinessAccess`, `BusinessSuspended`, `FirstStep`, `PendingInviteReturn`; gate ของแพ็กเกจและ legal ไม่ port)
2. `Backend/layers/nodejs-utils/nodejs/enums.mjs` + `Database/enum.sql` (35 types: ค่าเดิมที่ต้อง map)
3. `Backend/layers/nodejs-utils/nodejs/model-usage.mjs` + `Database/aitokenusage.sql`; `model-routing.mjs`, `openrouter-gateway.mjs` อ่านแค่ shape และ deadline/retry ห้าม port provider
4. `Backend/layers/nodejs-utils/nodejs/websocket-authorization.mjs` + `Backend/functions/WebsocketPush/src/index.mjs`
5. `Backend/layers/nodejs-utils/nodejs/business-scope.mjs` (ลำดับ gate และ body ของ 403; รายละเอียดสถานะอยู่ใน brief F03)
6. `Backend/layers/nodejs-utils/nodejs/db.mjs`, `secrets.mjs`, `request-body.mjs`, `json-response.mjs`
7. หน้า: `Frontend/src/pages/Layout.tsx`, `ErrorPage.tsx`, `LoadingPage.tsx`, `More.tsx`, `Account.tsx`; i18n `Frontend/src/locales/th/common.json`, `nav.json`

## Behaviors to keep
- ค่า enum ของระบบใหม่ยึด contracts.ts + `001_core.sql` แล้ว map ค่าของ Papi ตอน port: sender `bot`→`ai`, `human`→`staff`; role `primary`→`owner`, `secondary`→`staff`; conversation `active`/`escalated` → `handler` ai/human กับ status open/closed; business `inactive`/`blocked` → `suspended`
- `Channel` ต้องมี `web` (Demo Chat): Papi `enum.sql` มี `web` แต่ `enums.mjs` ขาด ห้าม port ความไม่ตรงนี้; ห้ามพิมพ์ string ของ enum เองในฟีเจอร์
- model usage: ทุก call เขียน `model_usage` 1 แถวรวมกรณี error, ห้ามทำให้ reply ล้มหรือช้า, ห้ามเก็บข้อความลูกค้า (เก็บแค่ id, model, tokens), ไม่รู้ราคาให้ `cost_usd_micros` เป็น null ไม่ใช่ 0; ตัวเลขนี้เป็นต้นทุนของเรา tenant ไม่เห็น
- realtime: Papi ผูก permission กับชนิด event (message → `chat.read`, knowledge_status → `product.read`, insight → `insights.read`) และไม่ส่งชนิดที่ไม่รู้จัก (fail closed) ใช้หลักเดียวกันกับ `RealtimeEvent` ของ contract; event ที่เป็นเรื่องล็อกบัญชีห้ามมีเนื้อหาลูกค้า
- error: map 403 ของ Papi เป็น `ErrorCode`: `account_inactive`/`account_blocked` → `ACCOUNT_DISABLED`; `business_inactive`/`blocked`/`deleted` → `BUSINESS_INACTIVE`; `permission_denied` → `PERMISSION_DENIED` + `details.requiredPermission`; ไม่ใช่ member หรือข้าม tenant → `NOT_FOUND` (Papi ตอบ 403 แต่ contract ใช้ 404)
- web: ยังไม่มี business → หน้าเริ่มต้น (Papi `FirstStep`); บัญชีถูกปิด / business ถูกระงับ / ไม่มีสิทธิ์ → หน้าเฉพาะของแต่ละกรณี ไม่ render หน้าว่างหรือวน redirect
- db: ยืม client แล้ว release ใน `finally` เสมอ (Papi เคยมี connection leak จนเกิด alarm)

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- frontend ใช้ `getAccessToken()` ตัวเดียวทั้ง REST และ WebSocket แทนการส่ง `accessToken` prop (`8c696680`)
- ไฟล์ใหม่ใน map: `Frontend/src/functions/accessToken.ts`

## Drop / replace
- Lambda + API Gateway + `formatResponse` → `routes.ts` ที่โหลดอัตโนมัติ; WebSocket API + DynamoDB connections → WebSocket ใน server เดียว
- Bedrock / OpenRouter / Gemini / Cohere / Qwen / Grok และ provider อื่นทั้งหมด → **OpenAI API อย่างเดียว** ผ่าน key เดียวใน `model.*` ตาม [docs/openai-api.md](../openai-api.md): core เป็นที่เดียวที่ import `openai` SDK, ใช้ Responses API (`model:'chat' | 'fast' | 'strong'` อ่าน model ID จาก env), `store:false` ทุก call, ไม่ส่ง `temperature` / `top_p`, role `developer` แทน `system`, tool loop คืน `toolCalls` + `providerState`, embeddings `text-embedding-3-large` `dimensions:1536`, moderation `omni-moderation-latest`, retry 1 ครั้งเมื่อ 429/5xx/timeout และ 429 `insufficient_quota` → `PROVIDER_BUDGET_EXHAUSTED` (ไม่ retry); Secrets Manager → `.env` + token ที่เข้ารหัสใน DB; S3 → `storage` บนดิสก์; `Landing/` → หน้า signed-out หน้าเดียว

## Tables
- `001_core.sql`: `users`, `sessions`, `accounts`, `businesses`, `memberships`, `customers`, `conversations`, `messages`, `jobs`, `model_usage`, `files`, `audit_events`, `seed_aliases` + `schema_migrations` ของ runner
- ใช้ชื่อ `business_id` ทุกที่: Papi ใช้ `account_id` ทั้งที่หมายถึง business (เช่น `conversation_routing.account_id` อ้าง `businesses.id`) ห้ามคัดชื่อนี้มา

## Done when
- fresh clone ติดตั้งและ build ได้; DB ว่าง migrate + seed (SPEC §5) ได้; restart แล้วข้อมูลยังอยู่
- `/health/ready` ตรวจ DB + migration ค้างจริง (ไม่พร้อม = 503); `/build-info` มี sha, schema, modelMode, providerModes และไม่มี key
- ทุก contract มี fake ที่ typecheck ผ่าน; dev login owner.a ได้ 26 permissions, staff.a ได้ 8, owner.a เปิด business B ได้ 404

## Status floor
R: เป็นฐานของ golden path ทั้งหมด
