# F26 insights — สรุปบทสนทนาและ insight
> **Build spec (ใช้ตัวนี้สร้าง):** [docs/specs/F26-insights.md](../specs/F26-insights.md) · หน้านี้คือ know-how เดิมจาก Papi · ส่วน "Papi files to read" ใช้ได้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ([D1](../DECISIONS-2026-11-20.md))

> **Tier P2** · เริ่มเขียนโค้ดเมื่อหัวหน้าโพสต์ `LEAD: OPEN P2` เท่านั้น · [tier และงบ](../../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)

**Lane** B3 ลำดับ 2/3 (หลัง F06 ต่อด้วย F27) · **เจ้าของ** B · **พึ่ง** F09 (`getConversation`, `getHistory`), F10, F24 (`getCustomer`), F35 · **timebox** 30–90 นาที
**ให้** job `insights.summarize` และ `insights.close` (lane อื่น enqueue ด้วยชื่อ type ไม่ต้อง import) + หน้า `/insights` · **ใช้** `model.chat()` + Structured Outputs strict: rolling summary = `model:'fast'`, insight = `model:'chat'` ([docs/openai-api.md](../openai-api.md)), `jobs`, `db`, `requirePermission('insights.read')` · ขอผ่านบอร์ด: `NEED TO:A1` ให้ enqueue `insights.close` ตอนปิดบทสนทนา · ไม่มี plan gating ของ chart (ทุก chart เปิดเต็ม)

## Papi files to read (in order)
1. `Backend/functions/InsightExtraction/README.md` (ทั้งไฟล์: queue contract, idempotency, ธุรกิจไม่ active, insight format, customer brief)
2. `Backend/functions/InsightExtraction/src/domain.mjs` (enum + validate) และ `processor.mjs` (prompt, lock, การปิด)
3. `Backend/functions/Orchestrator/src/rolling-summary.mjs` (`SUMMARY_TRIGGER`, ภาษา, ช่วง seq)
4. `Database/rollingsummary.sql`, `Database/customerinsightprofiles.sql`, คอลัมน์ `insight` ใน `Database/conversation.sql`
5. `Backend/functions/GetInsights/src/index.mjs` (routes), `range.mjs` (วัน Bangkok), `sections.mjs` (`SECTION_NAMES`, SQL ของ trends/keywords)
6. `Frontend/src/pages/Insight.tsx`, `components/dashboard/panels/OverviewPanel.tsx`, `TopicsPanel.tsx`, `InsightRangeCard.tsx` · `pages/messager/customerInfo/CustomerInfoPane.tsx`
7. tests: `Backend/tests/customer-insight-memory.test.mjs`, `insights-range.test.mjs`

## Behaviors to keep
- insight ต่อบทสนทนา: `customer_intent` ∈ `asking|tend_to_buy|asking_manual_safety|general` · `segment` ∈ `ready_to_buy|just_exploring|price_sensitive` · `sentiment` ∈ `positive|neutral|negative` · `keywords` 1–8 คำที่มีอยู่จริงใน transcript · `extracted_at`
- output ไม่ผ่าน schema → ให้แก้ 1 รอบ แล้ว job fail **โดยไม่เขียนอะไร** · คำตอบภาษาไทยที่มีอักษรจีน/ญี่ปุ่น/เกาหลีถือว่าไม่ผ่าน
- idempotent: lock ต่อ conversation (`lockKey`) · insight ที่มีแล้วห้ามเขียนทับ (เขียนเฉพาะตอนยังว่าง) · enqueue ด้วย `dedupKey` ต่อ conversation
- ธุรกิจไม่ active: ปิดบทสนทนาได้แต่ไม่เรียกโมเดล บันทึกว่า deferred แล้วทำให้เมื่อกลับมา active
- rolling summary: ทุก 6 ข้อความใหม่ (`SUMMARY_TRIGGER`) สรุปจาก summary เดิม + ข้อความใหม่ · เก็บ `from_seq..to_seq` เป็นหลักฐาน · ภาษาเดียวกับลูกค้า · สรุปล้มต้อง throw ให้ job retry และความจำเดิมยังอยู่
- customer brief (if time): summary ≤900 ตัว + needs / preferences / concerns รายการละ ≤140 ตัว · ห้ามอนุมานเพศ อายุ สุขภาพ รายได้ บุคลิก และห้ามคัดเบอร์หรือข้อมูลจ่ายเงิน · brief ล้มไม่ย้อนผลของ insight · ลบ tag ได้เฉพาะที่มาจาก insight ไม่แตะ manual/automation (ต้องขอ F24)
- dashboard: `?days=` 1–365 หรือ `?from=&to=` เป็นวันเต็มตามเวลา Bangkok รวมปลายทั้งสอง ไม่เกิน 366 วัน · section ที่ไม่รู้จักถูกทิ้ง
- summary ไม่ใช่สิทธิ์และไม่ใช่ fact ที่ยืนยันแล้ว: F10 ห้ามใช้ตัดสินราคา สถานะออเดอร์ หรือสิทธิ์

## Drop / replace
- SQS `InsightQueue` + DLQ + advisory lock 424242 → job + `lockKey: conversation:<id>` · TimeoutCloseConversation → schedule ของ F35/F09 · Bedrock / โมเดลเดิม → `model.chat()` ของ core (OpenAI อย่างเดียว)
- TranslateSummary (`content_summary_i18n`) → if time ด้วย `model:'fast'` · section escalation / knowledge_gaps / team / booking / crosstab → if time ทีละ section

## Tables
- เป็นเจ้าของ (`-- dependsOn: core`): `insight_runs` (business_id, conversation_id, from_seq, to_seq, state, insight jsonb, usage_id, error) · `conversation_summaries` (conversation_id, from_seq, to_seq, summary) · if time `customer_insight_profiles` (business_id, customer_id, …)
- ไม่เพิ่มคอลัมน์ในตาราง conversations ของ core · อ่านข้อความผ่าน `getHistory()` เท่านั้น

## Done when
- SPEC F26: ตัวเลขและ summary อ้าง message range · model output เสียหรือ fail ไม่เขียนข้อมูลมั่ว · ไม่ถือ summary เป็นสิทธิ์หรือ fact · backlog: structured output ตาม schema
- ปิดบทสนทนาของ tenant A แล้วได้ insight 1 แถวพร้อม seq range · รัน job ซ้ำไม่เกิดแถวที่สอง · fake model คืน enum ผิด → ไม่มีแถว
- `/insights?days=7` นับบทสนทนาตรงกับ SQL จริงและตัดวันตาม Bangkok

## Status floor
insight job + rolling summary = **R** (โมเดลจริง) · section ของ dashboard ที่ยังไม่ทำแยกบรรทัด U · ไม่มี plan gating (ทุก chart เปิดเต็ม)
