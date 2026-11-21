# F17 line — ช่องทาง LINE

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F17-line.md](../specs/F17-line.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C2 ลำดับ 1/3 (ต่อด้วย F18, F21) · **คน** C · **พึ่ง** F04, F09, F10, F35 (ใช้ fake ได้) · **เป้า** R (golden path, ถึง test OA จริงภายใน 14:30) · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `registerChannelSender('line', sender)` (แทน sandbox capture ของ setup) · **ใช้** `api.webhook()`, `saveMessage()`, `getConversation()` (A1), `isHumanTakeover()` (A1), `getBusinessSettings()` (C3), `jobs`, `notify()` · ไม่มีโควตา (ใช้ได้ไม่จำกัด)

## Papi files to read (in order)
1. `Backend/functions/LineWebhook/src/index.mjs` (ลำดับ resolve store → verify → dedup → normalize → enqueue)
2. `Backend/layers/nodejs-utils/nodejs/signature.mjs`, `gateway.mjs`
3. `Backend/functions/ConnectLineChannel/src/index.mjs` + `Backend/layers/nodejs-utils/nodejs/line-credentials.mjs`
4. `Backend/functions/DisconnectLineChannel/README.md` + `Backend/layers/nodejs-utils/nodejs/channel-disconnect.mjs`
5. `Database/conversationrouting.sql` (unique index + trigger ของ `delivery_generation`)
6. `Backend/functions/OutgoingLine/src/index.mjs` + `quota-alert.mjs`
7. `Backend/functions/Orchestrator/src/flex-templates.mjs` (การ์ด → LINE flex), `Backend/functions/GetLineQuota`, `Backend/functions/RefreshLineAccessTokens/README.md`, `Backend/layers/nodejs-utils/nodejs/profile-enrichment.mjs`, `conversation-presence.mjs`
8. หน้า (host ของ F18 ด้วย): `Frontend/src/pages/Channels.tsx`, `businessdetail_pages/BusinessChannel.tsx`, `LineInstructions.tsx`, `Frontend/src/components/channelLine/`

## Behaviors to keep
- verify ด้วย `rawBody` ตามที่รับ (parse แล้ว stringify ใหม่ทำให้ HMAC พัง): HMAC-SHA256 base64 ใน `x-line-signature` ด้วย channel secret ของ OA นั้น เทียบแบบ constant-time; ไม่มีหรือผิดได้ 401
- หา connection จาก `destination` (bot userId) ก่อน verify; ไม่รู้จักหรือไม่ active ตอบ 200 แล้วทิ้ง (LINE จะได้ไม่ retry); `events` ว่าง (ปุ่ม Verify ของ LINE) ตอบ 200
- ข้อความเข้า: `saveMessage({ customer: { channel: 'line', externalId, displayName, channelAccountId }, externalId: <LINE message id>, providerMeta: { replyToken, replyTokenExpiresAt } })`; `created: false` = webhook ซ้ำ; event ที่ไม่มี sender id ข้าม; follow/unfollow ไม่ใช่ข้อความ: ข้าม (LINE contacts / history ของ Papi ตัดออกจาก scope); event หนึ่งล้มต้องไม่ทำให้ event อื่นหาย: validation ล้ม = ข้าม, ล้มชั่วคราว = ทำ event ที่เหลือต่อแล้วตอบ 500 ตอนจบ (redelivery + dedup จึงไม่ซ้ำ)
- loading bubble (5–60 วินาที หาร 5 ลงตัว) เป็น best effort ห้ามทำให้ webhook 500 และไม่แสดงเมื่อ takeover หรือ AI ปิด
- connect: รับ Channel ID + Secret, ขอ token อายุ 30 วัน, `GET /v2/bot/info` ได้ userId (= destination); business มาจาก session ไม่รับจาก client; ตารางเก็บ token แบบเข้ารหัส ไม่ส่งกลับ browser; ต่อ token ใหม่เมื่ออายุ 25 วัน (schedule รายวัน); claim ภายใต้ advisory lock `channel-owner:line:<id>`: OA ที่ยัง active กับ business อื่นได้ 409; หนึ่ง business มี LINE active ได้ตัวเดียว
- disconnect: lock เดียวกัน → status `inactive` + ล้าง credential → ลบ credential เป็นขั้นสุดท้าย; generation เปลี่ยนเมื่อ status / credential / เจ้าของเปลี่ยน งานส่งของ generation เก่าจึงถูกทิ้ง; ย้าย OA ข้าม business ได้เฉพาะตอน inactive
- sender: ใช้ reply token จาก `lastInboundMeta` ถ้าข้อความเข้าอายุไม่เกิน 25 วินาที ไม่งั้น push; ≤ 5 message ต่อ call (แบ่ง batch และบันทึก batch ที่ส่งแล้วกันส่งซ้ำ); push ใส่ `X-Line-Retry-Key` (UUID ที่ derive จาก message id; 409 + accepted id = ส่งแล้ว)
- ผล: reply 400 = token หมดอายุ ให้ fallback เป็น push; push 400 = `failed` ไม่ retry; push 429 "monthly limit" = `failed` + `notify()` type `system` วันละครั้งต่อ channel; response หาย = `unknown`
- map `MessagePart`: text, image (HTTPS jpg/png), การ์ด → flex (altText ≤ 400 ตัว), location; quick reply ≤ 13 รายการ label ≤ 20 ตัว

## Drop / replace
- `LineWebhook` → SQS → `OutgoingLine` → `api.webhook()` + `saveMessage()` + sender ที่ register (`core.deliver` retry ให้); SSM / Secrets Manager → token เข้ารหัสใน DB; sticker ของร้าน (Creators pack) = A/U; OA Manager crawl และ history import ตัดออกจาก scope; ข้อความเสียงขาเข้า: stretch ถอดด้วย `model.transcribe()` ของ core ([docs/openai-api.md](../openai-api.md) §10.7) เจ้าของ lane ตัดสินใจ

## Tables
- เป็นเจ้าของ: `line_connections` (business_id, channel_account_id, display_name, status, encrypted token + expiry, generation, connected_by; unique `channel_account_id`; active ได้หนึ่งแถวต่อ business) เพราะ `001_core.sql` ไม่มีตาราง connection และห้าม ALTER ตารางของฟีเจอร์อื่น F18 จึงทำตารางของตัวเองตาม shape เดียวกัน
- `line_delivery_batches` (message_id, batch_index, payload_hash, accepted_at) · ข้อความ / ลูกค้าเขียนผ่าน `saveMessage()` เท่านั้น

## Done when
- signature ผิดได้ 401; event ซ้ำได้ข้อความเดียวและตอบครั้งเดียว; destination ที่ไม่รู้จักได้ 200 และไม่สร้างข้อความ
- คำตอบที่ช้าเกิน 25 วินาทีส่งด้วย push; reply ที่มีมากกว่า 5 ส่วนถูกแบ่ง call และ retry ไม่ส่งซ้ำ
- disconnect แล้วงานที่ค้างไม่ถูกส่ง; test OA ของทีมรับคำตอบจริง (replay อย่างเดียว = A)

## Status floor
S (signed fixtures + simulator) ระหว่างทำ → **R** เมื่อ test OA รับข้อความจริง (golden path ต้อง R)
