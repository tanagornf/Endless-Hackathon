# Task REPLACE_ID

> **อัปเดต 18 พ.ย. 2569:** `PLAN.md` และ `prompts/` ของชุดเตรียมงานแทนการแบ่งงานตามชั้นแล้ว ปกติ lane prompt ใช้แทนแบบฟอร์มนี้ได้ ถ้าใช้ ให้กรอกตาม lane/slug และ **อ่าน `../papi-ref` แบบ read-only ได้**

- Lane: REPLACE_A1_C3 (owner A/B/C ตาม backlog)
- Feature: REPLACE_F01_F39 / slug: REPLACE_SLUG
- Branch: `lane/<LANE>/<slug>` แตกจาก `origin/main` ล่าสุด
- Allowed paths: `server/src/features/<slug>/**`, `web/src/features/<slug>/**`, `shared/features/<slug>/**` (C1 เพิ่ม `server/src/core/**`, `web/src/core/**`)
- Build spec: `docs/specs/<ID>-<slug>.md` (slice ตาม §14) · know-how เดิม: `docs/porting/<ID>-<slug>.md` (`../papi-ref` ปิด เว้นแต่หัวหน้าโพสต์ `LEAD: PAPI-REF OPEN`)
- Dependencies and accepted commit versions: REPLACE
- Runtime target: R / S / A
- Provider environment: none / simulated / test / live
- Timebox/checkpoint: REPLACE_BANGKOK_TIME

## พฤติกรรมที่ต้องได้

ระบุผู้ใช้ trigger input ปลายทางและข้อมูลที่ต้องpersist ไม่เขียนเพียง “ทำหน้าให้สวย” หรือ “เชื่อมAI”

## Contract

ระบุendpoint/function, schema/fixture, success/error, authorization, tenant, idempotencyและversionที่เกี่ยวข้อง

## Acceptance

- [ ] happy path มีผลที่ตรวจจากstateจริง
- [ ] missing/invalidinputและunauthorized/tenantผิดถูกปฏิเสธ
- [ ] retry/conflict/failureตามกติกาที่เกี่ยวข้อง
- [ ] modes/providerreceiptsถูกต้อง ไม่มีmockถูกอ้างlive
- [ ] testsที่มีความหมายผ่าน และ checks (typecheck, tests, ownership) เขียวก่อน self-merge

## Delivery

Commit/PR: ยังไม่มี
Tests run/results: ยังไม่ได้รัน
Changed paths: ยังไม่มี
Evidence links: ยังไม่มี
Known gaps/blockers: REPLACE

เมื่อเสร็จโพสต์บนบอร์ดด้วยtask ID, paths, contractversion, testresults, mode, commit/PRและผู้รับ ห้ามเปลี่ยนช่องยังไม่มีเป็นpassโดยไม่มีผลจริง
