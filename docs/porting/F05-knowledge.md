# F05 knowledge — คลังความรู้และวงจรข้อมูล

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F05-knowledge.md](../specs/F05-knowledge.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B1 ลำดับ 1/4 · golden path (gate ขั้น 1) · **เจ้าของ** B · **พึ่ง** core, F03 (`businesses` อยู่ใน base schema แล้ว), F35 jobs · **timebox** 45–90 นาที
**ให้** export ใน `service.ts` สำหรับฟีเจอร์ของคน B (ไม่ใช่ contract ข้ามคน): `getKnowledgeItem()`, `createKnowledgeDraft()` (ให้ F06 ใน lane B3) · **ใช้** `getBusiness()`, `requirePermission()`, `db`, `storage.save()`, `publish()`, `audit()` และ export ของ F07: `indexKnowledgeRevision()`, `setSearchable()`, `getIndexStates()`

## Papi files to read (in order)
1. `AGENTS.md` หัวข้อ Knowledge & RAG → `Backend/functions/CreateKnowledge/README.md` หัวข้อ Knowledge and Live folders, DRAFT lifecycle, API reference
2. `Backend/functions/CreateKnowledge/src/knowledge-lifecycle.mjs`: ตาราง action × role, soft delete, purge
3. `Backend/functions/CreateKnowledge/src/knowledge-folders.mjs` + `Database/knowledgefolders.sql` · `knowledge-read.mjs` (list, search, keyset) · `knowledge-edit.mjs`
4. `Backend/functions/CreateKnowledge/src/knowledge-detail-service.mjs`: `knowledgeRevision`, `mutable`
5. `Database/knowledgeitems.sql` + `Database/enum.sql` (`knowledge_item_type`, `knowledge_item_status`) · `Backend/layers/nodejs-utils/nodejs/upload-limits.mjs` · header ของ `moderation.mjs` (อ่านเจตนาเท่านั้น ห้าม port Bedrock Guardrails / Rekognition)
6. `Frontend/src/pages/KnowledgeList.tsx`, `KnowledgeDetail.tsx`, `knowledgecreate_pages/KnowledgeCreateManual.tsx` · `Frontend/src/functions/knowledgeFolders.ts`, `knowledgeList.ts` · `Frontend/src/locales/th/knowledge.json`
7. ตัวอย่าง acceptance (อ่านอย่างเดียว): `Backend/tests/knowledge-lifecycle-module.test.mjs`, `knowledge-folders.test.mjs`, `tenant-auth-knowledge.test.mjs`

## Behaviors to keep
- RAG และ tool ทุกตัวอ่านเฉพาะ `active` **draft จึงไม่มีวันหลุดไปถึงคำตอบ** · `POST` body ว่างได้ draft + id ทันที แล้วค่อยเติมเนื้อหา
- `submit` เป็นทางเดียวที่ออกจาก draft: ไม่ใช่ draft → 409 · ไม่มีเนื้อหา → 400 · สั่ง active/inactive ตรงๆ บน draft → 409 · ระบบใหม่ใช้ `KnowledgeStatus` ของ contracts.ts: `draft →submit→ reviewed →activate→ active ⇄ inactive` · submit สั่ง index revision นั้น และ activate ผ่านเมื่อ index `ready` เท่านั้น (ไม่งั้น `KNOWLEDGE_NOT_READY`)
- `deleted` เป็นทางตัน: soft delete เก็บแถวและไฟล์ไว้ให้ประวัติแชทอ้างได้ · `deleted_at` ตั้งครั้งเดียว ลบซ้ำได้ 200 · เปลี่ยนสถานะของ item ที่ deleted → 409 · activate/deactivate/delete เรียก `setSearchable()` ของ F07 ในคำขอเดียวกัน
- ทุก UPDATE เป็น compare-and-swap (Papi: `WHERE status = ค่าเดิม AND content = ค่าเดิม` และ revision = sha256 ของ title/content/status/raw_data) → ใหม่ใช้ `revision` int + `expectedRevision` ไม่ตรง → `VERSION_CONFLICT` · แก้เนื้อหา = revision ใหม่ + snapshot ที่แก้ย้อนไม่ได้
- folder: item อยู่ได้ไม่เกิน 1 folder · ลบ folder ลบแค่การผูก ไม่ลบหรือปิด knowledge · ชื่อ trim ไม่ซ้ำแบบไม่สนตัวพิมพ์ในร้าน ≤100 ตัว บรรทัดเดียว (ปฏิเสธ control/bidi char) · error มี `code` (`folder_name_invalid`, `folder_name_taken`) ให้ i18n · จำนวนใน folder ไม่นับ deleted · filter `folder_id` หรือ `unfiled`
- list: ค้นจาก id หรือ title (escape `%` `_`, ตัดที่ 160 ตัว) · keyset (`id < cursor`) page ≤200 · title ≤255 ตัว
- สิทธิ์: อ่าน `product.read` · เขียน `product.write` · ลบ `product.delete` · `business_id` มาจาก `getBusiness()` เท่านั้น · platform admin ไม่ได้สิทธิ์ร้านโดยอัตโนมัติ
- ไฟล์แนบเก็บเป็น tag `{fileId, description, sendToUser}` ค่าเริ่ม: รูปส่งได้ เอกสารไม่ส่ง · ขนาดตรวจที่ server (Papi: รูป 8 MB เอกสาร 16 MB)
- if time: draft ที่ไม่ได้แก้ 7 วันถูก purge รายวัน (schedule ของ F35) และไฟล์ที่ item อื่นยังใช้ต้องไม่ถูกลบ

## เปลี่ยนถึง 71ee7659 (Papi 19 พ.ย.)

brief นี้เขียนจากโค้ดที่ `6959a92f` ส่วนนี้คือพฤติกรรมที่ Papi เพิ่มหรือเปลี่ยนหลังจากนั้น ถ้าทำส่วนที่เกี่ยวข้องให้ port ตามโค้ดใน `../papi-ref` (ตอนนี้เป็น `71ee7659`) **Done when และ tier ไม่เปลี่ยน**

- เตือนความรู้คล้ายกันก่อนบันทึก + การ์ดรายการซ้ำพร้อม preview (`01aca060`)
- เติม vector ที่หายเฉพาะตอนบันทึก draft (`974cd90f`)
- extraction เก็บข้อเท็จจริงเชิง "ไม่มี" และเก็บ attribute อิสระเฉพาะที่ไม่กำกวม (AB#2655)
- ไฟล์ใหม่ใน map: `Backend/functions/CreateKnowledge/src/knowledge-similar.mjs`, `Frontend/src/components/knowledge/SimilarKnowledgeDialog.tsx`, `Frontend/src/components/knowledge/SimilarKnowledgeNotice.tsx`, `Frontend/src/components/knowledge/KnowledgeMatchCard.tsx`, `Frontend/src/components/knowledge/KnowledgePreviewPanel.tsx`, `Frontend/src/hooks/useSimilarKnowledgeGate.tsx`, `Frontend/src/functions/knowledgeMatches.ts`

## Drop / replace
- `GetPresignedUrl` + S3 → route `upload` + `storage.save()` · `business-scope.mjs` + Cognito → `auth:'business'` ใน `routes.ts` · self-invoke Lambda + WebsocketPush → `jobs.enqueue()` + `publish({type:'knowledge.status'})`
- `/products` legacy, Live folders (F22), สถานะ `blocked` ของ admin, section revisions (`knowledge-detail-*`) → OUT · Bedrock Guardrails / Rekognition → `model.moderate()` ของ core (`omni-moderation-latest`, ข้อความ + รูป, ฟรี) ตอนบันทึก ใช้เป็นสัญญาณเตือน ไม่ใช่ตัวบล็อกเดียว ([docs/openai-api.md](../openai-api.md) §6) · if time ไม่งั้นรายงาน U แยกบรรทัด

## Tables
- เป็นเจ้าของ (`-- dependsOn: core`): `knowledge_items` (business_id, title, body, status, revision, folder_id, files jsonb, timestamps, deleted_at) · `knowledge_revisions` (snapshot ต่อ revision) · `knowledge_folders` (item อ้างด้วย FK `ON DELETE SET NULL`)
- อ่านจากคนอื่น: index state ผ่าน `getIndexStates()` ของ F07 เท่านั้น · seed `SEED.knowledgeFolders` + `SEED.knowledge` ใน `seed.ts`

## Done when
- SPEC F05: draft/deleted/index ไม่พร้อม ไม่ถูกใช้ตอบ · activate มีผลใน query ใหม่ · ทุก read/write จำกัด tenant · backlog: ลบ folder ไม่ลบ knowledge
- `kn_a_draft`, `kn_a_deleted`, `kn_b_inactive` ไม่โผล่ใน `searchKnowledge()` · owner A แก้ FAQ แล้ว query ถัดไปได้ revision ใหม่ · PATCH ด้วย `expectedRevision` เก่า → 409 · staff A (ไม่มี `product.write`) แก้ไม่ได้ · ลบซ้ำได้ 200 และ `deleted_at` ไม่เปลี่ยน

## Status floor
**R** (golden path) · moderation และ draft purge เป็นบรรทัดย่อยใน EVIDENCE (U/A ตามจริง)
