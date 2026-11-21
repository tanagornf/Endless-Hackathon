# DECK-OUTLINE: สไลด์ 6 หน้า

ตาม D11 ([DECISIONS](../DECISIONS-2026-11-20.md)) · ใช้ทั้งส่งงาน (ถ้าฟอร์มขอสไลด์) และเวที finalist · เสร็จและ export PDF ก่อน 16:30 ([SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md)) · สไลด์ภาษาอังกฤษ ตัวหนังสือน้อย ตัวอักษรใหญ่ · ทุกตัวเลขมีแหล่งที่เขียนไว้ในโน้ตของสไลด์และ footer สั้น ๆ · เลข `<<fill ...>>` คือตัวเลขสดตอน 16:15 ถ้าไม่ได้วัด ลบทั้งบรรทัด ไม่ใส่ค่าประมาณ

ชื่อ brief ที่ใช้อ้าง: [hackathon-brief.md](../research/hackathon-brief.md) (ย่อ "brief") · [openai-api.md §15](../openai-api.md)

## สไลด์ 1: Problem (ปัญหา พร้อมข้อมูล)

- **Headline:** "Thai sellers chat on LINE, Messenger and Instagram. Most new chats get no follow-up."
- **Bullets (3):**
  - More than 90% of new customer chats on LINE OA get no follow-up after the first response
  - Orders from Shopee live and short video are over 25% in Southeast Asia, and Meta-linked creator orders are growing fast
  - A rushed reply with a wrong price, or a slip nobody can verify, costs the seller real money
- **Visual:** เลข ">90%" ตัวใหญ่ตรงกลาง ข้างล่างเป็นแผนผังแชตสามช่องทางไหลเข้าหาคนเดียว ที่ฝั่งขวาโลโก้เป็นข้อความ "Shopee chat assistant: inside Shopee only" ไม่ใช้โลโก้บริษัทอื่น
- **Speaker notes (EN):** "LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response. Sea's own Q3 call says live and short-video orders are over 25% of Shopee's physical-goods orders in Southeast Asia, and affiliate orders from Facebook-linked creators grew 90% quarter on quarter. Those sellers talk to buyers in chat. Shopee's chat assistant exists inside Shopee for selected sellers; the chats on LINE, Messenger and Instagram are not covered. Two things go wrong at night: replies are slow, or they are fast and wrong. Wrong price means the seller must honour it. And buyers can now forge slips: Krungthai warns fake slips keep rising, and ChatGPT has been shown producing a realistic slip. There are no official slip-fraud statistics, so we quote none."
- **ที่มาตัวเลข:** >90% และ >12B conversations: brief §4 (LINE Thailand release, pr.thaiquest.com) · >25% และ +45% YoY: brief §2 (Q3 2026 call) · +90% QoQ: brief §2 · Shopee Chat AI Assistant selected sellers: brief §2 · Krungthai และ ChatGPT slip: brief §4 (Thaiger) · ไม่มีสถิติสลิปปลอมทางการ: brief §4

## สไลด์ 2: Persona (ใครคือผู้ใช้)

- **Headline:** "Prae sells board games alone, and answers chats every night."
- **Bullets (3):**
  - One person, three apps, the same questions: price, stock, shipping, "I paid"
  - Canned replies cannot do arithmetic; a generic chatbot sounds right and invents prices
  - She wants AI to answer while she sleeps, but only if it can be trusted with money
- **Visual:** การ์ดบุคคลสมมติ (ไม่ใช้รูปคนจริง ใช้ภาพวาดหรือไอคอน) + ภาพหน้าจอ inbox ของร้าน `Demo Boardgame Shop` ที่เห็นบทสนทนาจริงจาก production · ป้ายเล็ก "composite persona, synthetic data"
- **Speaker notes (EN):** "Prae is a composite persona based on our team's experience with small Thai shops, not a real customer. Every number in our demo shop is synthetic: a board game at 1,490 baht, a card pack at 99 baht, one sold-out item and a 500-baht game-teaching slot. We chose a shop with three typical question types so the trust rules can be seen quickly."
- **ที่มาตัวเลข:** ราคา seed: SPEC §5 (ข้อมูลสังเคราะห์ของทีม ไม่ใช่ข้อมูลภายนอก) · ไม่มีตัวเลขอื่น

## สไลด์ 3: Live demo flow (ลูกค้าถึงเงินเข้า)

- **Headline:** "From a question to a confirmed, paid order, with a human one tap away."
- **Bullets (3):**
  - Ask: price from the catalog, discount claims refused
  - Confirm: the AI proposes the order, the customer taps confirm, one PromptPay QR for that order
  - Check and hand over: slip checked in code, staff can take over at any moment
- **Visual:** ไทม์ไลน์แนวนอน 5 ขั้นพร้อมภาพหน้าจอจริงจาก Demo Chat/LINE: ถาม → ราคา → ใบสรุปออเดอร์ → QR → ผลตรวจสลิป (จริง vs แก้ยอด) → takeover · QR code ของ Demo Chat และ LINE OA มุมขวาล่าง
- **Speaker notes (EN):** "This is the loop you can try on your phone. The model writes the sentence; the price comes from a tool that reads the shop's catalog; a validator checks every amount before sending. An order is a proposal until the customer confirms. The QR carries the amount and the order reference. Slips are read by code, QR, amount, receiver, duplicate transaction reference, with a vision model only as a helper. This is a first check, not bank verification. Staff can take over from the inbox and the bot goes silent. Messenger and Instagram run in Meta development mode, so we demo those ourselves." แสดงข้อความตรงนี้เฉพาะที่ฟีเจอร์เป็น R: ปรับสไลด์ตาม ledger ที่ freeze
- **ที่มาตัวเลข:** 1,490 / 2,980 บาท: SPEC §5 seed · ไม่มีตัวเลขภายนอก

## สไลด์ 4: Architecture + safety

- **Headline:** "One server, one database, OpenAI only. The model talks, code owns the facts."
- **Bullets (3):**
  - One Node.js server on Render Singapore: Postgres with pgvector, in-process job worker, WebSocket; LINE, Messenger, Instagram and web chat in
  - Safety in code: prices only from tools, validator before send, order proposal then customer confirm, tenant isolation, webhook signatures, takeover checked every turn
  - Honest limits: slip checks are not bank verification; Meta development mode; unfinished features are hidden
- **Visual:** แผนภาพกล่องเดียว: ช่องทาง → webhook → `ai.reply` job → context (knowledge + catalog) → model (tools) → validator → ส่ง · ใต้กล่องมีแถบ "human takeover" และ "turn trace" · สีแยกส่วน "model" กับ "code owns the facts"
- **Speaker notes (EN):** "We kept the architecture small enough to build and verify in one day. Every OpenAI call goes through one wrapper that records tokens and cost, and we send store false so conversations are not stored by the API; the API does not train on our data by default. The model picks tools and writes text. Code owns prices, totals, order state and payment state. A customer saying 'I paid' changes nothing. Only a passed slip check or a staff tap does, and both are audited." (store:false และ no-training จาก openai-api.md ข้อมูล API บรรทัดสรุปข้อมูล)
- **ที่มาตัวเลข:** ไม่มีตัวเลข · ข้อความเรื่อง `store:false` และ "API data not used to train by default": openai-api.md (หัวข้อ caching/ข้อมูล: "ข้อมูล API ไม่ถูกใช้ train เป็นค่าเริ่มต้น · Responses store ค่าเริ่มต้น true (เก็บ 30 วัน) → core ส่ง store:false ทุก call")

## สไลด์ 5: Metrics + evals (วัดผล)

- **Headline:** "We measure it, in the app."
- **Bullets (3):**
  - Thai and English eval set (chat cases in both languages plus synthetic slips), pass rate shown per language runs on demand; latest real-model run: `<<fill at 16:15 from /ai-quality and /dashboard>>`
  - Seller impact tiles: auto-resolved share, median first response time, handoff rate, orders from chat, recovered follow-ups: `<<fill at 16:15 from /ai-quality and /dashboard>>`
  - Cost per answer from our usage ledger: `<<fill at 16:15 from /ai-quality and /dashboard>>`
- **Visual:** ภาพหน้าจอจริงของ `/ai-quality` (อัตราผ่านต่อหมวด + ป้าย "real run") และ `/dashboard` (ไทล์) ถ่ายหลัง real eval ตอน ~15:45 ห้ามใช้ภาพรอบ `fake`/จำลองโดยไม่ติดป้าย
- **Speaker notes (EN):** "The eval set is written by our team, so it is a signal, not a guarantee. It checks prices, out-of-catalog questions, bargaining, jailbreaks, handoffs, order extraction and synthetic slips including forged and duplicate ones, with code checks first and a model judge only for tone and grounding. Runs on the fake model in CI only prove the harness works; the page labels them as simulated. The numbers on this slide come from the real-model run at 15:45 and from today's production traffic. Before the event we measured Sol chat turns of 7 to 11.5 seconds with tools; today's figure is `<<fill at 16:15 from /ai-quality and /dashboard>>`."
- **ที่มาตัวเลข:** ตัวเลขสด: หน้า `/ai-quality`, `/dashboard`, ตาราง `model_usage` ตอน 16:15 · ก่อนงาน 7–11.5 s: openai-api.md §15 (ผลทดสอบซ้ำด้วย gpt-6.2-sol) · ขนาดชุด eval ≥ 40 chat cases และ ≥ 10 slips: D8 (เป็นขนาดขั้นต่ำที่ออกแบบ ใช้ตัวจริงจากหน้า `/ai-quality`)

## สไลด์ 6: Codex usage (ใช้ Codex อย่างไร)

- **Headline:** "Three people, twelve Codex chats, nine worktree lanes, one shared board."
- **Bullets (3):**
  - Humans decided the product, the safety rules and the gates; Codex wrote the code, the tests and the evals
  - 3 orchestrators dispatch, review and fix cross-lane bugs; 9 workers build features from specs, each in its own git worktree
  - `<<n merged PRs from git at 16:15>>` and one Codex handoff from board to review, test, merged SHA and verified result · `<<STORY>>`
- **Visual:** ซ้าย: ผัง 3 คน × (1 orchestrator + 3 workers); ขวา: ภาพหน้าจอ dashboard ของทีม + PR timeline จาก git · ล่างสุดตารางสองคอลัมน์ "Humans decided / Codex built" (จาก [PITCH §5](PITCH.md))
- **Speaker notes (EN):** "Codex runs in the ChatGPT desktop app, one chat per git worktree. Orchestrators never write code in a worker's folder; they send tasks through the board, review merged work against the spec, and fix small cross-lane bugs in their own branches. Workers write the feature, its tests and its smoke test, and merge when CI is green. We prepared specs, prompts and a contracts file before 10:00 and declare them as prior work at baseline `<<BASELINE_SHA>>`; all application code was written today. `<<STORY>>`"
- **ที่มาตัวเลข:** 3 + 9 = 12 chats, 12 worktrees: D2 · จำนวน PR/commit: git ตอน 16:15 (`gh pr list`, คำสั่งใน [SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md)) · "Sea is one of OpenAI's largest Codex customers in Asia" ถ้าใช้ในสไลด์: brief §1 (sea.com/news/395)

## สไลด์สำรอง (ไม่นับใน 6 หน้า, ใช้ตอน Q&A เท่านั้น)

- Feature ledger (R/S/A/U ตาม `FEATURE_STATUS.csv`) · prior-work declaration ([PITCH §7](PITCH.md)) · ตาราง "why not Shopee chat / LINE Seller AI Automation" ([QA-PREP](QA-PREP.md))

## เช็กก่อน export

- [ ] ไม่มี `<<` เหลือในสไลด์ที่จะใช้ · ตัวเลขทุกตัวมีบรรทัดแหล่งที่มา · ไม่มีชื่อร้านจริง/รูปคนจริง · สไลด์ 3 ตรงกับ ledger (ไม่โชว์ฟีเจอร์ที่ซ่อน) · ภาพหน้าจอมาจาก production ไม่มี secret/URL ภายใน
- [ ] export PDF และไฟล์ต้นฉบับเก็บใน repo ที่ `docs/pitch/deck/` ตอนส่งงาน (ถ้าผู้จัดไม่ต้องการไฟล์ ใช้ลิงก์)
