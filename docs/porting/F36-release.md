# F36 release — ตรวจรวม เผยแพร่ และหลักฐาน

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F36-release.md](../specs/F36-release.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่ม 15:15 ตามเวลา ไม่ต้องรอ `LEAD: OPEN` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

- **Lane** C1 ลำดับ 3/3 (เริ่ม 15:15 ตามนาฬิกา ไม่ว่า F35 ถึงไหน) · **คน** C · **พึ่ง** F01, F09, F10 + `EVIDENCE.md` ของทุกฟีเจอร์ · **เป้า** R · path ของ Papi อยู่ใต้ `../papi-ref/`
- **ให้** `tests/e2e/` (core-loop E2E), `docs/FEATURE_STATUS.csv` (31 แถว + subrows), `docs/evidence/` (`release.md`, `gate-1300.md`, `codex-timeline.md`), หน้า `/release` (platform admin: สถานะทุกฟีเจอร์ + build-info) · **ใช้** ทุกฟีเจอร์ผ่าน HTTP API เท่านั้น ไม่ import ไฟล์ข้างใน, `requirePlatformAdmin()`

## Papi files to read (in order)
1. `AGENTS.md` หัวข้อ "Runtime message flow" และ "Conventions & gotchas" (checklist ขั้นของ core loop และบทเรียน live ≠ git)
2. `Backend/tests/e2e/invite-user.test.mjs`: 401 เมื่อไม่มี token, 400 เมื่อ email/role หายหรือผิด, invite secondary/primary สำเร็จ, 409 เมื่อมี invite ค้างซ้ำ
3. `Backend/tests/e2e/helpers/api-client.mjs` (รูปแบบ client ที่ยิง API พร้อม token)
4. ห้ามรันไฟล์ข้อ 2–3: ยิง AWS จริง ใช้เป็นรายการ scenario เท่านั้น
5. ใน repo นี้: [SPEC §9–§10](../competition-plan/templates/SPEC.md) (16 scenario กลาง), [EVIDENCE.md](../competition-plan/templates/EVIDENCE.md), [FEATURE_STATUS.csv](../competition-plan/templates/FEATURE_STATUS.csv), ตาราง gate ใน [prompts/README.md](../../prompts/README.md)

## Behaviors to keep
- test ที่ต้องใช้ provider ภายนอก skip พร้อมเหตุผลเมื่อไม่มี test credential ห้ามนับเป็น pass (Papi skip suite ที่ต้องใช้ provider เมื่อไม่ได้เปิด และใช้แต่ test key)
- E2E ตรวจทั้ง error envelope (401/400/403/409) และ happy path ไม่ใช่แค่ status 200
- การกระทำที่ทำลายข้อมูลใน test เป็น dry-run เป็นค่าเริ่มต้น ต้องยืนยันชัด และทำกับ tenant สังเคราะห์เท่านั้น
- live ≠ git คือปัญหาจริงของ Papi (ทีม deploy ตรงจากเครื่อง) → build ที่ demo ต้องมาจาก commit ที่ push แล้ว และ build-info ต้องแสดง SHA นั้น ห้าม build จาก working tree ที่ยังไม่ commit
- รวมสถานะจาก `EVIDENCE.md` ด้วยสคริปต์ ไม่แก้ตัวเลขด้วยมือ; แถวที่ไม่มีหลักฐานคง `U`/`A` พร้อมเหตุผล ห้ามลบแถว
- health ผ่านอย่างเดียวไม่นับว่าระบบครบ; หน้าที่กดแล้วไม่มีผลห้ามนับเป็น R

## Drop / replace
- Jest e2e ที่ยิง AWS, SAM/pipeline, Azure pipeline `Backend-Tests` → `npm test` + E2E บน production build (Node เสิร์ฟ web build + `/api/v1` origin เดียว) ใน CI ของ repo แข่ง
- deploy ทีละ Lambda ด้วย `lambda:sync` → artifact เดียวจาก candidate SHA และจด rollback target (SHA เขียวล่าสุด)

## Tables
- ไม่มีตารางของตัวเอง · อ่าน migration ledger / schema version ของ core เพื่อใส่ใน build-info และ `release.md`

## Done when
- clean clone + DB ว่างบน candidate SHA: install → build → migrate → seed → start ผ่าน; `/health/ready` ตรวจ DB จริง; `/build-info` (sha, schema, modelMode, providerModes) ตรงกับ SHA ที่ demo
- core-loop E2E 5 ขั้นของ gate ผ่านบน production build และ model จริง; feature checks ของทุกฟีเจอร์ใน scope (31 ตัว) มีผล (ผ่าน/ไม่ผ่าน/skip พร้อมเหตุผล)
- `FEATURE_STATUS.csv` ครบ 31 แถว (ไม่มีแถวของฟีเจอร์ที่ตัดออก) ทุกแถว R/S ชี้ commit + test + evidence; SheetBot ถ้าคง A ต้องประกาศ
- `codex-timeline.md` มีโพสต์บอร์ดและ PR ที่ merge แล้วพร้อมเวลา; `release.md` มี SHA, schema, modes และ rollback target

## Status floor
R: ถ้า E2E ไม่ผ่าน ให้รายงานขั้นที่ล้มตามจริงแทนการเปลี่ยนสถานะ
