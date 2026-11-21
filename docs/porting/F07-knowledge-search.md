# F07 knowledge-search — ค้นคืน RAG และประเมิน revision

> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F07-knowledge-search.md](../specs/F07-knowledge-search.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P0** · core loop · เริ่มเขียนโค้ดหลัง `SETUP READY` · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B1 ลำดับ 2/4 · golden path (gate ขั้น 3) · **เจ้าของ** B · **พึ่ง** F05 เท่านั้น (ไม่รอ F06) · **timebox** 60–120 นาที
**ให้** contract `searchKnowledge(businessId, query, opts)` → `KnowledgeSearchResult` (B2: ai-agent, voice) · export ใน lane: `indexKnowledgeRevision()`, `setSearchable()`, `getIndexStates()` ให้ F05 · if time `getCapabilities(businessId)` ตามที่ F10 ขอ · **ใช้** `model.embed({purpose:'document'|'query'})` (`text-embedding-3-large` `dimensions:1536` ทั้งสองฝั่ง [docs/openai-api.md](../openai-api.md) §4), `db`, `jobs` (handler `knowledge.index`), `publish({type:'knowledge.status'})`, `getKnowledgeItem()` ของ F05

## Papi files to read (in order)
1. `Backend/layers/nodejs-utils/nodejs/knowledge-search.mjs` (ทั้งไฟล์ 106 บรรทัด: SQL ที่กรอง tenant, NaN, threshold)
2. `Backend/layers/nodejs-utils/nodejs/knowledge-hybrid.mjs`: `eligibleSourceSql`, `lexicalCandidates`, `reciprocalRankFusion`
3. `Backend/layers/nodejs-utils/nodejs/knowledge-document.mjs` (`lexicalTerms`) · `Backend/functions/Orchestrator/src/lexical-knowledge-fallback.mjs` (stopword ไทย, NFKC)
4. `Backend/functions/CreateKnowledge/src/knowledge-indexing.mjs` (dispatch หลัง commit, สถานะ processing/failed)
5. `Backend/layers/nodejs-utils/nodejs/knowledge-chunks.mjs`, `knowledge-source-search.mjs` (`mergeSourceHits`, จำนวน passage ต่อ item)
6. `Backend/RAG_LOCAL.md` + `Backend/tests/rag-local-eval/README.md` (วิธีวัดและข้อจำกัดของผลวัด) · `Database/knowledgesources.sql` ดูแค่ shape ของ chunks/versions
7. `Frontend/src/functions/knowledgeReadiness.ts`, `knowledgeIndex.ts`, `Frontend/src/hooks/useKnowledgeIndex.ts`
8. tests: `Backend/tests/multi-click-knowledge-search.test.mjs`, `parent-lexical-fusion.test.mjs`, `orchestrator-lexical-fallback.test.mjs`

## Behaviors to keep
- กรอง `business_id` + `searchable` + state `ready` **ใน SQL ทุกครั้ง** ไม่กรองหลังดึง · marker ของอีกร้านต้องได้ 0 hit
- ตัด vector เสื่อม (ศูนย์/NaN) และ threshold **ก่อน** `ORDER BY … LIMIT` เพราะ Postgres เรียง NaN ไว้บนสุดของ DESC แล้วดันของจริงตกจาก top-K
- คะแนน item = ค่าที่สูงกว่าระหว่าง title กับ content · passage ต่อ item ≤3 · Papi ใช้ top-K 6, min 0.1 ที่จูนกับ Cohere → ใช้ default ของ contract (5, สูงสุด 20) แล้ว **จูน `minScore` ใหม่บน OpenAI** ด้วย fixture SPEC §5 และจดคะแนนลง EVIDENCE
- passage ใช้ได้เฉพาะ revision ปัจจุบัน (Papi เทียบ `parent_state` กับ item ทุก query) → ใหม่: chunk ผูก `(item_id, revision)` และ `setSearchable(itemId, revision, on)` เปิดเฉพาะ revision ที่ F05 activate ส่วน revision อื่นปิดหมด
- hybrid: lexical terms = `Intl.Segmenter('th', word)` + token แบบ SKU ที่มี `- _ . /` เก็บทั้งก้อน (`a-game-01`) · รวมผลด้วย RRF k=60 · เก็บคะแนนแต่ละช่องไว้ดู ไม่บวกข้ามสเกล
- embedding ล่ม: fallback lexical ที่ตัด stopword ไทย (ขอ ค่ะ ครับ ไหม เท่าไหร่ …) และ normalize NFKC แล้วรวมสระอำกลับ (`U+0E4D U+0E32` → `U+0E33`) · `strategy` ในผลต้องตรงกับที่ใช้จริง
- index เป็นงานหลัง commit: ล้มแล้วเห็นได้และ retry ได้ (`failed` + error) แต่ไม่ทำให้การบันทึกของ F05 fail · ก่อนเขียน `ready` job ถาม F05 ว่า revision ยังเป็นปัจจุบัน (กัน job เก่าเขียนทับ)
- คะแนน retrieval ไม่ใช่หลักฐานว่าคำตอบถูก (Papi เขียนไว้ใน eval README) · snippet ≤400 ตัวเป็นข้อมูล ไม่ใช่คำสั่ง

## Drop / replace
- Cohere / Gemini / Qwen embeddings (`gemini-*`, `google-query-embedding.mjs`, `embedding-routing.mjs`: อ่านแค่ shape ห้าม port provider) → `model.embed()` = `text-embedding-3-large` `dimensions:1536` ชุดเดียวทั้ง document และ query (ไม่มี `input_type`) ค้นด้วย pgvector cosine (`<=>`) · ห้ามผสมสอง embedding model ใน index เดียว · vector เดิมใช้ไม่ได้ ต้อง embed ใหม่ · ภาษาไทยแบ่ง chunk ตามจำนวน token/ตัวอักษร (~500–800 token, overlap ~80) ไม่ใช่ตามช่องว่าง
- Cohere rerank / OpenRouter reranker → OpenAI ไม่มี rerank endpoint: if time ดึง top 20 จาก pgvector แล้วให้ `model:'fast'` เรียงด้วย strict schema `{ ids_ranked }` ที่รับเฉพาะ id ที่ส่งไป (ล้ม = ใช้ลำดับ cosine) · query embedding cache → if time ใน DB (key = business + model + dim + sha256 ของ query)
- TextToVector Lambda + self-invoke → job `knowledge.index` · knowledge bases, categories, taxonomy, context expansion, coverage → OUT

## Tables
- เป็นเจ้าของ (`-- dependsOn: core, knowledge`): `knowledge_chunks` (business_id, item_id, revision, folder_id, chunk_no, text, lexical_terms text[], embedding vector(1536), searchable) · `knowledge_index_states` (item_id, revision, state `not_started|indexing|ready|failed`, error, indexed_at) · if time `retrieval_evals`
- ไม่ query ตารางของ F05 (กติกา AGENTS.md): ข้อมูลมาทาง payload ของ job หรือ `getKnowledgeItem()` · seed index จาก `SEED.knowledge` ที่ `active` + `ready` ใน `seed.ts`

## Done when
- SPEC F07: คำถามไทย/SKU คืน source ถูก scope · inactive ของ A และ source ของ B ไม่หลุด · revision ที่ใช้ตอบตรวจกลับได้ (hit มี `knowledgeItemId` + `revision`) · ไม่อ้างคะแนน retrieval เป็นความถูกต้องของคำตอบ
- ถาม "ร้านเปิดกี่โมง" จาก A ได้ `kn_a_faq` · ถาม `TENANT_B_ONLY_OWL_482` จาก A ได้ 0 hit · ถาม "โปรโมชันลด 50%" ไม่ได้ `kn_a_draft` · deactivate แล้ว query ถัดไปหายทันที
- ก่อน/หลังเปลี่ยน strategy หรือ `minScore` วัดด้วย fixture ที่ label แล้ว (อย่างน้อย recall@5) และจดผลจริง · unit test ใช้ fake embed ของ core

## Status floor
**R** สำหรับ search + index · workbench/evaluation และ publish/rollback เป็นบรรทัดย่อย (A/U ตามจริง)
