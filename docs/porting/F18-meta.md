# F18 meta — Facebook Messenger และ Instagram

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F18-meta.md](../specs/F18-meta.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C2 ลำดับ 2/3 (หลัง F17 ต่อด้วย F21) · **คน** C · **พึ่ง** F09, F10, F35 · **เป้า** **R** ต่อ provider: ใช้ Meta developer app ของทีมใน development mode (app roles / test users) ส่งถึงบัญชีทดสอบจริงได้ ไม่ต้องรอ Meta app review หรือ business verification · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `registerChannelSender('facebook')`, `registerChannelSender('instagram')`; event คอมเมนต์ + private reply ให้ F21 (lane เดียวกัน: export ใน `service.ts` ไม่ใช่ contract ข้ามคน) · **ใช้** `api.webhook()`, `saveMessage()`, `getConversation()` (A1), `getBusinessSettings()` (C3), `jobs`, consent ของ F24 (A3) · ไม่มีโควตา (ใช้ได้ไม่จำกัด)

## Papi files to read (in order)
1. `Backend/functions/MessengerWebhook/README.md` + `src/index.mjs` (GET handshake, POST signature, echo, opt-in)
2. `Backend/layers/nodejs-utils/nodejs/meta-inbound.mjs` (หลายรูปเป็นหลายข้อความ), `signature.mjs`, `meta.mjs`
3. `Backend/functions/InstagramWebhook/README.md` + `src/index.mjs`
4. Facebook connect: `Backend/functions/GetMessengerPages/src/index.mjs` → `SelectMessengerPage/src/index.mjs` → `ConnectMessengerChannel/src/index.mjs`
5. Instagram connect: `Backend/functions/ConnectInstagramChannel/src/index.mjs` (Instagram Login, code flow)
6. `Backend/functions/OutgoingMessenger/src/index.mjs`, `OutgoingInstagram/src/index.mjs`, `Backend/layers/nodejs-utils/nodejs/meta-outgoing.mjs`, `meta-human-agent.mjs`
7. `Backend/functions/DisconnectMessengerChannel/README.md`, `DisconnectInstagramChannel/README.md`, `RefreshInstagramAccessTokens/README.md`
8. `Database/marketingsubscriptions.sql`, `marketingmessagesettings.sql`; `Backend/functions/Orchestrator/src/generic-templates.mjs` (การ์ด Meta) + `Backend/functions/ImagePad` (pad รูปเป็นสี่เหลี่ยม)
9. หน้า: `Frontend/src/pages/InstagramOAuthCallback.tsx`, `Frontend/src/functions/connectFacebook.js`, `connectInstagram.ts`, `Frontend/src/components/modal/ChannelSelectModal.tsx`

## Behaviors to keep
- signature: `x-hub-signature-256` = `sha256=` + hex HMAC-SHA256 ของ `rawBody` ด้วย app secret (Instagram ลอง Instagram app secret ก่อน แล้วค่อย Meta app secret); GET ตอบ `hub.challenge` เมื่อ `hub.mode=subscribe` และ verify token ตรง; ข้าม `is_echo`; marketing opt-in / stop / resume (`messaging_optins`) บันทึกแยกและไม่สร้างข้อความ
- หลายรูปในข้อความเดียวเป็น 1 inbound ต่อรูป: รูปแรกใช้ `mid` เดิม รูปถัดไป `mid:2`, `mid:3`… (webhook ซ้ำได้ id เดิม), text อยู่กับรูปแรก, สูงสุด 20 รูป; แต่ละส่วนเป็น `externalId` ของ `saveMessage()` จึง dedup ทีละส่วน
- connect Facebook: Facebook Login → long-lived user token → list Pages โดย page token ไม่ออกไปถึง browser (เก็บแบบเข้ารหัส TTL 900 วินาที) → เลือก page → subscribe + upsert connection; list ว่างต้องบอกเหตุผล `missing_permission` หรือ `no_pages_shared`
- connect Instagram: code → short-lived → long-lived token (~60 วัน) โดยไม่ผ่าน Facebook Page; IG id ที่ผูกกับ business อื่นอยู่ได้ 409
- ข้อความจากคน (staff): ภายใน 24 ชม. หลังข้อความลูกค้าล่าสุดส่งปกติ (Facebook ใส่ `messaging_type: RESPONSE`); 24 ชม.–7 วันต้องใช้ tag `HUMAN_AGENT` และเปิดสิทธิ์ไว้; เกิน 7 วันหรือไม่มีเวลาข้อความลูกค้า = block พร้อมเหตุผล (bot ตอบทันทีหลังข้อความลูกค้า จึงใช้แบบปกติ)
- Meta error code 10, 100, 200, 551 = `failed` ไม่ retry (Meta ตอบ 10 เมื่อส่งนอกหน้าต่าง); throttle (4, 613), transient (1, 2), token (190), 429, 5xx = `failed` + `retryable: true`
- disconnect: เปลี่ยน row ภายใต้ owner lock ก่อน แล้ว unsubscribe page / revoke token เป็นขั้นสุดท้าย (แบบเดียวกับ F17)

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- เก็บข้อความของ Page เอง (`message_echoes`) รวมรูป/ไฟล์ใน storage (`8ac95ff3`, `4ea561c2`)
- handover protocol: รู้เมื่อ Meta AI หรือ app อื่นถือแชต + หน้าคู่มือปิด Meta AI (`3faa0fcf`, `5bc89d5e`)
- Lambda ใหม่ `RefillMessengerProfiles` เติมชื่อ/รูปลูกค้าทุก 15 นาที (`bf3736fb`)
- ข้อความยาวแบ่งส่ง (Messenger 2,000 ตัวอักษร, IG 1,000 bytes) (`0252ba51`)
- หา Page ได้เมื่อให้สิทธิ์ "ทุก Page" (`39430256`)
- ไฟล์ใหม่ใน map: `Backend/functions/RefillMessengerProfiles`, `Backend/functions/MessengerWebhook/src/page-echo.mjs`, `Backend/functions/MessengerWebhook/src/thread-control.mjs`, `Backend/functions/GetLatestConversation/src/meta-agent.mjs`, `Backend/layers/nodejs-utils/nodejs/customer-profile.mjs`, `Backend/layers/nodejs-utils/nodejs/meta-business-agent.mjs`, `Frontend/src/pages/MetaAiGuide.tsx`, `Frontend/src/components/messenger/MetaAgentNotice.tsx`, `Frontend/src/functions/metaAgent.ts`, `Frontend/src/functions/metaAiGuide.ts`

## Drop / replace
- DynamoDB pending pages → ตารางชั่วคราวที่เข้ารหัสและหมดอายุ 15 นาที; Secrets Manager → token เข้ารหัสใน DB; SQS + `Outgoing*` → sender ที่ register (`core.deliver` retry ให้); `ImagePad` Lambda → resize ฝั่ง server ถ้าทัน ไม่งั้นการ์ดใช้รูปเดิม (A); ข้อความเสียงขาเข้า: stretch ถอดด้วย `model.transcribe()` ของ core ([docs/openai-api.md](../openai-api.md) §10.7) เจ้าของ lane ตัดสินใจ

## Tables
- เป็นเจ้าของ: `meta_connections` (channel facebook/instagram, page/IG id, encrypted token + expiry, status, generation; shape เดียวกับ `line_connections` ของ F17), `meta_pending_pages` (TTL), `marketing_subscriptions`, `marketing_message_settings`
- consent กลางของลูกค้าเป็นของ F24 (อ่านผ่าน `getCustomer()`); ข้อความ / ลูกค้าเขียนผ่าน `saveMessage()` เท่านั้น

## Done when
- signature ผิดถูกปฏิเสธ; webhook ซ้ำไม่สร้างข้อความซ้ำ; ข้อความ 3 รูปได้ 3 inbound ที่ id คงที่
- connection ที่ถูกเพิกถอนส่งไม่ได้ (`CHANNEL_NOT_CONNECTED`); staff ส่งหลัง 24 ชม. โดยไม่มีสิทธิ์ `HUMAN_AGENT` ถูก block พร้อมเหตุผล
- R เฉพาะ provider ที่ test user (role ใน Meta app โหมด development) ได้รับคำตอบจริง; ไม่มี app / สิทธิ์ให้รายงาน A/S

## Status floor
S (signed fixtures + simulator) ระหว่างทำ → **R** แยกต่อ Facebook / Instagram เมื่อ test user ของ Meta app (development mode) ได้รับคำตอบจริง
