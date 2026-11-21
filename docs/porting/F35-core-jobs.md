# F35 core/jobs — jobs, schedules และความทนทาน

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F35-core-jobs.md](../specs/F35-core-jobs.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C1 ลำดับ 2/3 (ต่อด้วย F36) · **คน** C · **พึ่ง** F01 (setup ส่ง worker พื้นฐานแล้ว) · **เป้า** R (golden path) · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `jobs.enqueue()` / `jobs.get()` ครบตาม contract, `schedules` (cron), หน้า `/ops` (retry / dead-letter), logger ที่ redact · **ใช้** `db`, `publish()` (`job.updated`)
- contract กำหนดแล้ว ห้ามเปลี่ยน: lease 60 วินาที, backoff 5s × attempt², `maxAttempts` 5, ครบแล้วเป็น `dead`, `dedupKey` unique, `lockKey` = advisory lock, schedule ใช้ dedupKey `<name>@<slot>`

## Papi files to read (in order)
1. `Backend/functions/CommerceJobRunner/src/repository.mjs` (claim / complete / retry / cancel) + `Database/commercejobs.sql`
2. `Backend/layers/nodejs-utils/nodejs/chat-outbox.mjs` + `Database/channeldelivery.sql` + `Backend/functions/ChatOutboxDispatch/README.md`
3. `Backend/layers/nodejs-utils/nodejs/channel-delivery.mjs` (checkpoint ต่อ provider request + generation fence: แนวทางให้ sender ของ C2)
4. `Backend/layers/nodejs-utils/nodejs/inbound-enqueue.mjs` + `Database/chatinboundreceipts.sql` (บันทึกก่อน publish)
5. `Backend/layers/nodejs-utils/nodejs/job-limits.mjs`, `log-redaction.mjs`, `upload-limits.mjs`
6. ตาราง "Scheduled handlers" ใน [README.md](README.md) (job, cadence, ฟีเจอร์เจ้าของ)
7. annex: `Backend/functions/SheetBot/README.md` (`SrsBot` เป็น DROP และถูกลบออกจาก `papi-ref`)

## Behaviors to keep
- claim ด้วย `FOR UPDATE SKIP LOCKED` พร้อม token ของรอบนั้น (Papi `claim_token`); ทำเสร็จ / retry / cancel มีผลเฉพาะเมื่อ token ตรง worker ที่เสีย lease ไปแล้วจึงเขียนทับผลไม่ได้
- งานที่ยังเริ่มไม่ได้ (เช่นติด lock) คืนคิวโดยไม่นับ attempt = `{ retryAt }` ของ contract; error ที่ retry ไม่ช่วย (`retryable: false`) เป็น `dead` ทันที
- payload เป็น object ขนาดเล็ก (Papi ≤ 16 KB) ห้ามมี secret, ข้อความลูกค้าเต็ม หรือ provider body; `last_error` เก็บเป็น code / ข้อความสั้นที่ redact แล้ว
- staff send ซ้ำ: id คำขอเดิม + payload เดิมคืนผลเดิม, payload ต่างได้ `IDEMPOTENCY_CONFLICT` (Papi เทียบ `request_hash`; ใน core คือ `messages.client_request_id`)
- `core.deliver` ที่ผลเป็น `unknown` (provider อาจรับแล้วแต่ response หาย) ห้าม retry แบบไม่ดู และแสดงใน `/ops`; Papi ไม่อ้าง exactly-once
- แนวทางให้ sender: checkpoint ทีละ request/chunk ด้วย `payload_hash` + provider id (retry ข้าม chunk ที่ยืนยันแล้ว); งานของ connection generation เก่า (disconnect/reconnect) ให้ทิ้ง
- รับข้อความเข้า: บันทึกก่อนแล้วค่อย enqueue (Papi บันทึก receipt ก่อนส่ง SQS) ใน core คือ `saveMessage()` ที่ dedup ด้วย external id แล้วค่อย enqueue `ai.reply`
- log: allowlist field ของ request; key ที่มี authorization / token / secret / password / cookie / code / verifier / invite → `[REDACTED]`
- upload: Papi จำกัด image 8 MB, document 16 MB, attachment 16 MB, ทุกชนิด ≤ 32 MB ตรวจจากขนาดจริง (ใช้กับ `storage.save` ผ่าน `allowedMime` / `UPLOAD_MAX_MB`); ตัวเลขจาก env ต้องเป็น integer ในช่วง ไม่งั้น `VALIDATION_ERROR`

## Drop / replace
- SQS ขาเข้า/ขาออกต่อช่องทาง, DLQ, `DlqAutoRedrive`, EventBridge, `ChatOutboxDispatch`, `chat_inbound_receipts` → ตาราง `jobs` + worker + `schedules` + `core.deliver`

## Tables
- ใช้ `jobs` จาก `001_core.sql` (state `queued` / `running` / `succeeded` / `failed` / `dead` / `cancelled`); ตารางเพิ่มของ F35 เป็น core migration ไฟล์ใหม่เท่านั้น ห้ามแก้ไฟล์ที่ apply แล้ว
- ไม่มีตาราง outbox แยก: persist-before-send ใช้ `messages.delivery_*` + job `core.deliver` ตาม contract

## Done when
- commit job แล้ว kill worker กลางงาน เมื่อ lease หมด worker ใหม่ทำต่อจนเสร็จครั้งเดียว; enqueue `dedupKey` เดิมได้ `deduped: true`
- job ที่ล้มตลอดหยุดที่ `dead` และ `/ops` แสดงพร้อมปุ่ม retry; worker เก่าที่ token ไม่ตรงเขียนผลไม่ได้; log ไม่มี secret
- `schedules` ครบทุก job ในตาราง README (ชื่อ, cadence, เจ้าของ) แม้ handler ยังเป็น U; schedule slot เดิมไม่รันซ้ำ

## Status floor
R สำหรับ jobs / schedules / `/ops` · SheetBot เป็น annex: A หรือ U พร้อมเหตุผลใน EVIDENCE.md
