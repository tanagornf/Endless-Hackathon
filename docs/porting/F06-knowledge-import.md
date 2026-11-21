# F06 knowledge-import — นำเข้าและสกัดข้อมูล
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F06-knowledge-import.md](../specs/F06-knowledge-import.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P1** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P1` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B3 ลำดับ 1/3 (ต่อด้วย F26, F27) · **เจ้าของ** B · **พึ่ง** F05, F35, F08 (สินค้าจาก CSV; F05/F08 อยู่ lane B1 ของคนเดียวกัน เรียกผ่าน export ใน `service.ts`) · **timebox** 60–150 นาที
**ให้** job `knowledge.import` + หน้า `/imports` · **ใช้** `createKnowledgeDraft()` (F05), `importCatalogItems()` (F08), `jobs.enqueue()` + `job.progress()`, `storage.save()`/`read()`, `model.chat({model:'fast', responseFormat})` (ยาวหรือซับซ้อน → `model:'chat'`), `model.moderate()`, `notify()` (C3) · วิธีเรียก model ดู [docs/openai-api.md](../openai-api.md), `publish({type:'job.updated'})`

## Papi files to read (in order)
1. `Backend/functions/CreateKnowledge/README.md` หัวข้อ DRAFT lifecycle (async fill), Failure model, The files contract
2. `Backend/functions/CreateKnowledge/src/knowledge-processing.mjs` (draft, link import, async job, แจ้งผล)
3. `Backend/functions/KnowledgeExtraction/README.md` (reader rules ของ CSV/TXT, Office XML, scanned PDF)
4. `Backend/functions/CreateKnowledge/src/extraction.mjs`: envelope, partial salvage, `KNOWN_FACETS` + `deriveFacets` (ส่วนที่เรียก Gemini ผ่าน OpenRouter อ่านแค่ shape ห้าม port provider)
5. `Backend/functions/CreateKnowledge/src/link-fetch.mjs` + `Backend/layers/nodejs-utils/nodejs/public-url.mjs` (SSRF; อ่านกฎ SSRF/redirect เท่านั้น ห้าม port Jina Reader) · `link-import-policy.mjs` (denylist + ownership)
6. `Backend/functions/GoogleDocsKnowledge/README.md` (scope, หนึ่ง tab = หนึ่ง draft, sync เป็น draft)
7. `Frontend/src/pages/knowledgecreate_pages/KnowledgeCreateByFile.tsx`, `KnowledgeCreateByLink.tsx`, `KnowledgeCreateGenerating.tsx` · `Frontend/src/hooks/useFileUploader.ts`
8. tests: `Backend/tests/kf-imports-link-fetch.test.mjs`, `link-import-policy.test.mjs`, `link-import.test.mjs`

## Behaviors to keep
- ผลนำเข้าเป็น **draft เสมอ** (สินค้าจาก CSV = `active:false`) ไม่มีอะไร active เอง · job ล้มเก็บ error ไว้ที่ job/แถว และ reload ดูได้ ไม่พึ่ง push อย่างเดียว
- **การสกัดทำให้การสร้างล้มไม่ได้**: JSON เสียบางส่วน → เก็บส่วนที่ใช้ได้ (ตัด variant เสีย, ราคาที่เป็นข้อความ → null, URL รูปที่ไม่มีในต้นฉบับ → ทิ้ง, kind แปลก → product) · ใช้ไม่ได้เลย → `extracted = null` แต่ draft ยังถูกสร้าง · ใช้ Structured Outputs แบบ strict ของ `model:'fast'` แทน parser แบบเดา
- อ่านข้อความ: UTF-8, UTF-16 ที่มี BOM และ windows-874 (CSV จาก Excel ไทย) เมื่อ UTF-8 strict ล้มและผลมีอักษรไทย · CSV ที่ parse ไม่ได้ → เก็บเป็นบรรทัดธรรมดา · ตัดความยาวโดยไม่ทิ้ง surrogate ครึ่งตัว
- CSV สินค้า: error **ต่อแถว** (แถว, คอลัมน์, เหตุผล) แถวเสียไม่ล้มทั้งไฟล์ · ราคาแปลงเป็นสตางค์ integer · SKU ซ้ำในร้าน = error ของแถวนั้น
- URL: http/https เท่านั้น · ไม่มี user:pass · resolve DNS ครั้งเดียวแล้วต่อ IP ที่ตรวจแล้ว · ปฏิเสธ 10/8, 127/8, 0/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, `::1`, `fe80::/10`, `fc00::/7`, IPv4-mapped และ `localhost`/`.local`/`.internal` · redirect เองไม่เกิน 4 ครั้งและตรวจทุก hop · timeout 10 วินาที · body ≤2 MB · รับเฉพาะ `text/html`, `text/plain`
- นโยบายลิงก์: ปฏิเสธ marketplace ที่ห้ามเก็บข้อมูลอัตโนมัติ (Shopee, Lazada, TikTok Shop, Amazon ฯลฯ) · ร้านต้องยืนยันว่าเป็นของตัวเอง · ไม่อ่าน robots.txt (Papi ตัดสินใจไว้แล้ว)
- facets คำนวณจาก extracted แบบ pure ไม่เรียกโมเดล (`price promotion attributes faq advice bookable-service timetable policy location practitioner` ไม่มีอะไรเลย = `generic`) เก็บไว้ให้ F07/F10 ใช้
- Google Docs: scope `documents.readonly` (+ `drive.file` สำหรับ picker) ไม่ใช้ `drive.readonly` · หนึ่ง tab = หนึ่ง draft · sync รอบใหม่เป็น draft ให้ตรวจ · unlink แล้ว knowledge ยังอยู่ · callback ใช้ state prefix `gdocs:` ตาม `.env.example`

## Drop / replace
- S3 + GuardDuty malware scan + KnowledgeExtraction Lambda + self-invoke → `storage` + job ของ core · ไฟล์: parse CSV / XLSX / PDF ดิจิทัลเองในเครื่องก่อน แล้วส่ง text ให้ `model:'fast'` สกัด · PDF สแกนหรือรูป → `input_file` / `input_image` บน `model:'chat'` เป็น stretch ([docs/openai-api.md](../openai-api.md) §8) ไม่งั้น PDF/DOCX/XLSX = A
- Bedrock Guardrails / Rekognition → `model.moderate()` ของ core กับข้อความ/รูปที่นำเข้า (สัญญาณเตือน ไม่ใช่ตัวบล็อกเดียว)
- Jina Reader → ไม่ใช้: URL อ่านเองด้วย fetch + SSRF guard ข้างบน ตัด HTML เป็น text แล้วส่ง `model:'fast'` · `line-txt` / `line-mining` / `line-group-import`, `source-preparation` (RAG v2) → OUT · refresh token ใน Secrets Manager → token ref ที่เข้ารหัสใน DB (ถ้าทำ)

## Tables
- เป็นเจ้าของ (`-- dependsOn: core, knowledge, catalog`): `import_jobs` (business_id, kind `text|csv|file|url|gdoc`, file_id, source_url, state, counts, error) · `import_rows` (job_id, row_no, status, error, created_ref) · `knowledge_source_versions` (job_id, sha256, parser_version, complete) · if time `google_doc_links`
- ไม่เขียนตารางของ F05/F08 ตรงๆ: สร้างผ่าน export ใน `service.ts` ของสองฟีเจอร์นั้นเท่านั้น

## Done when
- SPEC F06: ข้อความ + CSV ทำงานจริง · ไฟล์เสีย/URL ไม่อนุญาตไม่สร้างข้อมูล active · provider ที่ไม่พร้อมคง A หรือ S ตามผลจริง · backlog: job progress, source version, ไม่ fetch internal URL
- นำเข้า `products.csv` + `faq.txt` ของ tenant A ได้สินค้า/draft พร้อม progress และ error รายแถว · `http://169.254.169.254/` และ `http://localhost/` ถูกปฏิเสธก่อนส่ง request
- นำเข้าไฟล์เดิมซ้ำ (sha256 เดียวกัน) ไม่สร้างของซ้ำ หรือบอกชัดว่าเป็น revision ใหม่

## Status floor
text + CSV = **R** (ทำก่อน) · URL = R เมื่อ test SSRF ผ่าน · PDF/Office/Google Docs เป็น stretch: PDF/Office = A ถ้าไม่ทัน · Google Docs = A จนมี OAuth test user จริง (`GOOGLE_MODE=real`)
