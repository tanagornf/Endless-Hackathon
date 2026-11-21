# Endless: ชุด pitch สำหรับกรรมการ

ฉบับ 20 พ.ย. 2569 (ค่ำ) ตาม [PLAN.md](../../PLAN.md) และ D1, D6, D8, D10, D11, D17 ใน [DECISIONS-2026-11-20.md](../DECISIONS-2026-11-20.md) · Sea x OpenAI Regional Codex Hackathon Thailand เสาร์ 21 พ.ย. 2569 · ทุกตัวเลขที่ไม่ใช่ของเราเองมาจาก [hackathon-brief.md](../research/hackathon-brief.md) (ระบุหมายเลข § ทุกครั้ง) ตัวเลขของเราเองมีที่มาเดียวคือหน้า `/ai-quality`, `/dashboard`, `git` และ `model_usage` ของ production ตอน 16:15

ไฟล์คู่กัน: [demo-loop.md](demo-loop.md) · [DECK-OUTLINE.md](DECK-OUTLINE.md) · [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) · [QA-PREP.md](QA-PREP.md) · [SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md) · [README-TEMPLATE.md](README-TEMPLATE.md) · [organizer-email.md](organizer-email.md)

## 0. วิธีใช้ไฟล์นี้

| Placeholder | เติมจากอะไร | ถ้าเติมไม่ได้ |
|---|---|---|
| `<<fill at 16:15 from /ai-quality and /dashboard>>` | ตัวเลขสด: อัตราผ่าน eval **สองตัว (ภาษาไทย และ ภาษาอังกฤษ จากการ์ด "อัตราผ่านแยกตามภาษา")**, เวลาตอบ, จำนวน PR, ต้นทุนต่อ turn (คำสั่งอยู่ใน [SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md) ข้อ 16:15) | ตัดประโยคนั้นทิ้ง ห้ามประมาณ |
| `<<STATUS Fxx>>` | `FEATURE_STATUS.csv` ตอน `LEAD: FREEZE` (status + actual_mode) | พูดว่ายังไม่เสร็จ หรือไม่พูดถึง |
| `<<BASELINE_SHA>>` / `<<FINAL_SHA>>` | commit ก่อน 10:00 / commit ที่ส่ง | ห้ามพูดเรื่อง prior work โดยไม่มี SHA |
| `<<STORY>>` | เรื่อง bug แล้วแก้ที่เกิดจริงหนึ่งเรื่อง (PR + ชื่อ test) | ตัดส่วนนั้น |
| `<<COMPANY>>` | ชื่อบริษัท ถ้าทีมตกลงว่าจะบอก | พูดว่า "our company" |

ก่อนพูดทุกรอบ ไม่มี placeholder เหลือในส่วนที่จะพูด:

```powershell
Select-String -Path docs/pitch/*.md -Pattern '<<' -SimpleMatch
```

**ห้ามเด็ดขาด**

- ตัวเลขที่ไม่ได้วัดในวันงานหรือไม่อยู่ใน brief (ยอดขาย, จำนวนผู้ใช้, เงินที่ประหยัด, ความแม่นยำที่ไม่ได้รัน eval) · ชื่อร้านจริงหรือข้อมูลลูกค้าจริง
- "from zero", "built from scratch" ถ้าไม่จริง: ใช้ "built today from our own specs" (ทีมมี spec, prompt, contracts เป็น prior work ที่ประกาศแล้ว)
<!-- claims:ignore -->
- เรียก recording ว่า live · พูดว่ามี integration กับ Shopee (ไม่มี) · พูดว่าตรวจสลิปคือการยืนยันกับธนาคาร (ไม่ใช่) · พูดว่า Messenger/Instagram เปิดให้สาธารณะ (Meta development mode = เฉพาะ app roles/test users)
<!-- /claims:ignore -->
- เรียกฟีเจอร์ที่ไม่ใช่ R ว่าทำงานแล้ว (ถูกซ่อนด้วย feature flag ตั้งแต่ 15:30)

## 1. 5 มุมที่ใช้เล่า (D10) และแหล่งที่มา

| # | มุม | ประโยคหลัก (EN) | ข้อเท็จจริงที่อ้างได้ (แหล่ง) | สิ่งที่โชว์ |
|---|---|---|---|---|
| 1 | ครึ่งของ chat commerce ไทยที่อยู่นอก Shopee | "Endless serves the half of Thai chat commerce that lives outside Shopee: LINE, Messenger and Instagram." | LINE Thailand: ">90% of new customer chats receive no follow-up after the first response"; >12B LINE OA conversations in 2025 (brief §4) · LINE 56M Thai users, Messenger 36.5M (brief §4) · live/video >25% ของออเดอร์ Shopee (+45% YoY) และออเดอร์ affiliate จากครีเอเตอร์ Facebook +90% QoQ (brief §2) · Shopee Chat AI Assistant มีเฉพาะ seller ที่เลือก และอยู่ในแอป Shopee เท่านั้น (brief §2) | ลูกค้าคุยทาง LINE OA และ Demo Chat บนมือถือกรรมการเอง |
| 2 | agent ที่ทำงานเองแบบมีขอบเขต | "A bounded autonomous agent: prices only from tools, orders only after the customer confirms, a human can take over at any moment." | กรรมการตั้ง direction: Autonomous & Adaptive AI = "agents that can be trusted to operate without constant human oversight" (brief §1) · เราวัดเองว่า Sol ทำงาน text ทุกงานของแผนเป็นภาษาไทยได้ (openai-api.md §15) | ราคามาจาก catalog, ปฏิเสธส่วนลดที่แต่งขึ้น, ใบสรุปออเดอร์ให้ลูกค้ากดยืนยัน, รับช่วงต่อ, turn trace |
| 3 | ความไว้ใจเรื่องการจ่ายเงิน | "Payment trust: one PromptPay QR per order, and slip checks that do not rely on the model alone." | Krungthai: สลิปปลอม "continue to rise" แนะนำให้สแกน QR บนสลิปในแอปธนาคาร · ChatGPT ถูกแสดงว่าปลอมสลิปที่สมจริงได้ (brief §4) · PromptPay 2.38B transactions in May 2026, 82.91M registrations (brief §4) · ไม่มีสถิติทางการเรื่องสลิปปลอม ห้ามอ้างตัวเลข | QR ต่อออเดอร์ที่ล็อกยอด, สลิปจริง vs สลิปที่แก้ยอด, ข้อความที่บอกว่าไม่ใช่การยืนยันจากธนาคาร |
| 4 | วัดผลได้ | "We measure it: eval pass rate and seller impact live in the app." | ตัวเลขทั้งหมดมาจากหน้า `/ai-quality` (F37) และ `/dashboard` (F27) ตอน 16:15 เท่านั้น | หน้า AI quality, ป้ายจริง/จำลอง, ไทล์ seller impact |
| 5 | สร้างด้วย Codex อย่างมีวินัย | "Three people, three orchestrators, nine worktree lanes, one shared board." | วิธีทำงานจาก D2/D9 · Sea เป็นหนึ่งในลูกค้า Codex รายใหญ่ของ OpenAI ในเอเชีย (brief §1, sea.com/news/395) · ตัวเลขสดมาจาก git ตอน 16:15 | หน้า dashboard ของทีม, PR timeline, หนึ่งเรื่อง `<<STORY>>` |

หลักเล่า: **"The model talks. Code owns the facts. A human can always take over."**

Direction ที่เลือก: หลัก **AI-Native Products & Operations** (inbox, knowledge, orders ออกแบบรอบ AI turn) · รอง **Autonomous & Adaptive AI** และ **Deep Domain AI** (LINE, ภาษาไทย, รหัสสินค้าไลฟ์, PromptPay, เวลา Asia/Bangkok) (direction จาก brief §1)

### Persona (สมมติ รวมจากหลายร้าน ไม่ใช่ร้านจริง)

คุณแพร (Prae) ขายบอร์ดเกมออนไลน์คนเดียว ตอบแชตทุกคืนบน LINE, Messenger, Instagram · ตรงกับร้านตัวอย่าง `Demo Boardgame Shop` (`A-GAME-01` 1,490 บาท · `A-CARD-01` 99 บาท · `A-SOLD-01` หมด · `A-SERVICE-01` สอนเล่น 500 บาท) ข้อมูลทั้งหมดสังเคราะห์

## 2. Pitch ที่โต๊ะ 60–90 วินาที (Round 1, 17:15)

ใช้พูดคู่กับ [demo-loop.md](demo-loop.md) เวอร์ชัน 90 วินาที · Round 1 ใช้ไทยหรืออังกฤษก็ได้ ประเมินเท่ากัน (brief §1) · ความยาวต่อโต๊ะยังไม่ทราบ (UNCONFIRMED) ให้เริ่มจากเวอร์ชันสั้นสุดแล้วยื่นมือถือให้กรรมการลองเอง

**TH (พูดประมาณ 60 วินาที)**

> [0:00] ร้านเล็กในไทยขายของทาง LINE, Messenger และ Instagram ตอบช้าก็เสียออเดอร์ ตอบเร็วแต่พิมพ์ราคาผิดก็ต้องขายตามที่พิมพ์ LINE Thailand บอกว่าแชตใหม่เกิน 90% ไม่ได้รับการติดตามต่อหลังตอบครั้งแรก
> [0:15] Endless คือผู้ช่วยตอบแชตที่ตอบจากข้อมูลและแคตตาล็อกของร้าน ราคามาจากฐานข้อมูล ไม่ใช่จากโมเดล ถ้าลูกค้าอ้างส่วนลดที่ไม่มี ระบบไม่ยอมตาม ออเดอร์เป็นเพียงข้อเสนอจนกว่าลูกค้ากดยืนยัน แล้วได้ QR PromptPay ต่อออเดอร์ และสลิปถูกตรวจในโค้ดก่อนตั้งเป็นจ่ายแล้ว
> [0:35] ตรงนี้คือ LINE OA และ Demo Chat จริงบน production ลองสแกนแล้วถามราคา `A-GAME-01` หรือขอลดราคาดูได้เลย พนักงานกดรับช่วงต่อได้ทุกเมื่อ และทุกคำตอบดู trace ย้อนหลังได้
> [0:50] ทีมเรามี 3 คน ใช้ Codex 12 chat (orchestrator 3, worker 9) ทำงานผ่านบอร์ดกลางของทีม (GitHub issue ที่ปักหมุด) วัดคุณภาพด้วย eval ในแอป ล่าสุดผ่าน `<<fill at 16:15 from /ai-quality and /dashboard>>` ตามจริงว่าสลิปตรวจไม่ใช่การยืนยันจากธนาคาร และ Messenger/Instagram อยู่ใน development mode

**EN (about 60 seconds)**

> [0:00] Small Thai shops sell on LINE, Messenger and Instagram. Reply slowly and they lose the sale; reply fast with a wrong price and they have to honour it. LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response.
> [0:15] Endless answers from the shop's own knowledge and catalog. The price comes from the database, not from the model. If a customer claims a discount that doesn't exist, it refuses. An order is only a proposal until the customer confirms; then they get a PromptPay QR for that exact order, and the slip is checked in code before anything is marked paid.
> [0:35] This is the real LINE OA and the real web Demo Chat on production. Scan it and ask for `A-GAME-01`, or try to haggle. Staff can take over at any moment, and every answer has a trace.
> [0:50] We are three people running twelve Codex chats, three orchestrators and nine workers, coordinated on one shared board, a pinned GitHub issue that every chat reads and writes. Our in-app eval shows `<<fill at 16:15 from /ai-quality and /dashboard>>`. To be clear: slip checks are not bank verification, and Messenger and Instagram run in Meta development mode.

ถ้ามีเวลา 90 วินาที เพิ่ม: หนึ่งเหตุการณ์จาก turn trace (ราคาจาก tool, ผล validator) และ/หรือ `<<STORY>>`

## 3. Finalist pitch 5–7 นาที (English, เวที 19:30)

ความยาวจริงของรอบ finalist UNCONFIRMED (brief §1: ราว 8–10 นาทีเป็นการอนุมาน) ให้ซ้อมที่ 6:30 และมีจุดตัดถึง 5:00 กับต่อยอดถึง 7:00 ตามตาราง · ผู้พูดหลัก `<<PRESENTER>>` · คนคุมเครื่อง Driver · ตัวสำรอง Backstop (บทบาทใน [demo-loop.md](demo-loop.md))

| เวลา | ส่วน | พูด (EN) | จอ | ตัดได้ไหม |
|---|---|---|---|---|
| 0:00–0:40 | Problem + persona | "Meet Prae. She sells board games alone, every night, on LINE, Messenger and Instagram. LINE Thailand reports more than 90% of new customer chats get no follow-up after the first response. Shopee's chat assistant stays inside Shopee, and only for selected sellers. The chats outside Shopee, on LINE, Messenger and Instagram, are where small sellers like Prae still answer every price question by hand." | สไลด์ 1–2 | ไม่ตัด (ตัดประโยค Shopee ได้) |
| 0:40–1:00 | Solution + rule | "Endless is an AI front desk with one rule: the model talks, code owns the facts. Three build directions meet here: an agent bounded enough to leave alone, an AI-native shop workflow, and Thai commerce depth." | สไลด์ 3 | ไม่ตัด |
| 1:00–3:00 | Live demo | ดู [demo-loop.md](demo-loop.md) เวอร์ชัน 3 นาที ตัดเหลือ 2 นาทีบนเวที: ราคาจาก catalog, ปฏิเสธส่วนลดที่แต่งขึ้น, ยืนยันออเดอร์, QR PromptPay, สลิปจริง vs สลิปที่แก้ยอด, รับช่วงต่อ | Demo Chat + inbox | ตัดสลิปจริง vs แก้ยอดได้ถ้าเวลาไม่พอ ห้ามตัดราคา + ส่วนลดปลอม |
| 3:00–3:50 | Depth of thinking | "The model never produces a price. It calls a tool, the tool reads the price from the shop's catalog, and a validator checks every amount before the message leaves. A customer saying 'I paid' changes nothing; only a slip check or a staff tap does, and both are audited. Every turn has a trace." เปิด trace หนึ่ง turn | `/ai-settings` | ตัดได้เหลือ 20 วินาที |
| 3:50–4:30 | Measured | "We don't ask you to trust us, we measure: our eval set, in Thai and in English, runs in the app and reports a pass rate for each language. Latest real-model run: `<<fill at 16:15 from /ai-quality and /dashboard>>`. Seller impact tiles: auto-resolved share, median first response time, handoff rate, orders from chat, recovered follow-ups: `<<fill at 16:15 from /ai-quality and /dashboard>>`." | `/ai-quality`, `/dashboard` | ไม่ตัด (ตัดไทล์เหลือสองตัวได้) |
| 4:30–5:20 | Built with Codex | "Three people, three orchestrator chats, nine worker chats, each in its own git worktree. Orchestrators dispatch, review and fix cross-lane bugs; workers build features from specs; one shared board, a pinned GitHub issue, shows every lane's posts. Humans decided the product, the safety rules and the gates. Codex wrote the code, the tests and the evals. `<<fill at 16:15 from /ai-quality and /dashboard>>` merged pull requests. `<<STORY>>`" | dashboard + PR timeline | ตัด `<<STORY>>` ก่อน |
| 5:20–5:50 | Why it matters + business | "Shops pay a monthly subscription that scales with AI replies handled; we did not build billing today. The same catalog is ChatGPT-ready through a product feed and an MCP server `<<STATUS F39>>`, so a small shop can be found where buyers already ask." | สไลด์ 6 | ตัดประโยค MCP ถ้า F39 ไม่ใช่ R |
| 5:50–6:30 | Honesty + prior work + close | อ่านย่อหน้า prior-work (ข้อ 7) ที่เลือก + "Slip checks are not bank verification. Messenger and Instagram are in Meta development mode, so we demo those ourselves. Anything not production-ready is hidden, and our feature ledger shows what is real." | ledger | ห้ามตัดย่อหน้า prior-work |
| 6:30–7:00 | บัฟเฟอร์ / ชวนกรรมการลองเอง | "Scan the QR and try to make it lie." | QR | ใช้เมื่อมีเวลา |

**ลำดับตัดเมื่อเวลาไม่พอ (ถึง 5:00):** `<<STORY>>` → MCP/feed → สลิปจริง vs แก้ยอด → trace เหลือ 20 วินาที ห้ามตัด: ราคาจาก catalog, ส่วนลดปลอมถูกปฏิเสธ, ตัวเลขวัดผล, ย่อหน้า prior-work, ข้อจำกัด

## 4. เกณฑ์กรรมการแต่ละข้อ ตอบด้วยอะไรที่โชว์ได้

ใช้เกณฑ์หกข้อจากสไลด์เปิดงาน 21 พ.ย. ตาม [research brief](../research/hackathon-brief.md#1-the-hackathon-sea-x-openai-regional-codex-hackathon-thailand-sat-21-nov-2026) · สไลด์ไม่ระบุน้ำหนักคะแนน

| เกณฑ์ | คำตอบของเรา | หลักฐานที่เปิดให้ดู |
|---|---|---|
| Problem & Solution Fit | ร้านไทยเล็กขายผ่านแชตต้องตอบไวและตอบราคาถูก | ให้กรรมการถามราคาใน LINE หรือ Demo Chat · แหล่งใน [DECK-OUTLINE](DECK-OUTLINE.md) |
| Build quality | production จริงบน Render, กรรมการลองเองบน LINE OA และ Demo Chat, ทุกฟีเจอร์ที่เห็นเป็น R (ไม่มีปุ่มหลอก), ฟีเจอร์ที่ไม่ถึง R ถูกซ่อน, ทดสอบด้วย Playwright smoke บน production, ซ่อนสถานะไม่ได้ | ฟีเจอร์ทำงานบนมือถือกรรมการ · ledger `FEATURE_STATUS.csv` · `/build-info` |
| Insight & Originality | ราคาอ้าง catalog, ปฏิเสธส่วนลดที่ไม่มีจริง, ส่งต่อพร้อมบริบท | turn trace · [F10](../specs/F10-ai-agent.md) · [F11](../specs/F11-team.md) |
| Real-World Value | วัดเวลาตอบแรกและสัดส่วนแชตที่ส่งต่อจากการทดสอบ · ระบุขนาดตัวอย่างและว่าเป็นข้อมูล demo | `/dashboard` · `/ai-quality` แยก TH/EN · [F27](../specs/F27-analytics.md) |
| Alignment with Build Direction | AI-Native Products & Operations เป็นหลัก · ให้กรรมการเดินจากคำถามราคา ไปคำขอส่วนลด แล้วขอคุยกับพนักงาน | LINE / Demo Chat และ seller inbox ใน flow เดียว |
| Use of Codex | 3 orchestrators + 9 worktree lanes, hooks + board, review จาก Codex อีก lane และทดสอบก่อน merge | ลิงก์ board → review → regression test/CI → merged SHA และ smoke · `<<STORY>>` · [README-TEMPLATE](README-TEMPLATE.md) |

## 5. มนุษย์ตัดสินใจอะไร vs Codex สร้างอะไร (สำหรับสไลด์ 6 และ Q&A)

| มนุษย์ตัดสินใจ (ก่อนและระหว่างงาน) | Codex สร้าง (10:00–17:00) |
|---|---|
| ปัญหา, persona, scope 31 ฟีเจอร์, สิ่งที่ตัดออก | server, web, migrations, seed ตาม spec |
| กฎความปลอดภัย: ราคาจาก tool เท่านั้น, ข้อเสนอ→ยืนยัน, takeover, ซ่อนฟีเจอร์ที่ไม่ใช่ R | test ทุกระดับ (unit, route, Playwright smoke) |
| OpenAI อย่างเดียว, `store:false`, ลำดับ tier P0–P3, gate 13:00 และ freeze 15:30 | ชุด eval ภาษาไทยและอังกฤษ และสลิปสังเคราะห์ (F37) และตัวรัน |
| spec, prompt, contracts.ts, สคริปต์บอร์ด (prior work ที่ประกาศ) | การแก้บั๊กข้าม lane โดย orchestrator, รายงาน STAGE ทุก 30 นาที |
| ตัดสินใจเปิด/ตัด tier, ข้อความที่พูดกับกรรมการ, สถานะที่รายงาน | การ rebase, merge, deploy ผ่าน CI (มนุษย์เป็นคนตรวจ gate) |

## 6. ธุรกิจและความซื่อสัตย์

ข้อความไทยและอังกฤษสำหรับส่งงาน กลุ่มค้าปลีกและค้าส่ง และ Canvas ฉบับย่ออยู่ใน [ขอบเขตโครงการและโมเดลธุรกิจ Endless](ENDLESS-SCOPE-AND-BUSINESS-MODEL.md)

**Business model (2 ประโยค):** "Shops pay a monthly subscription that scales with the AI replies they use; pricing is not set and we did not build billing today. Every model call is logged with its cost, which is the basis for pricing later."

**ข้อจำกัดที่ต้องพูดเอง ไม่รอให้ถาม**

<!-- claims:ignore -->
- ตรวจสลิป = อ่าน QR บนสลิป + กฎในโค้ด (ยอด ผู้รับ เลขรายการซ้ำ) + vision ช่วยอ่าน **ไม่ใช่การยืนยันกับธนาคาร** สลิปปลอมที่แก้ละเอียดอาจผ่านได้ ร้านยังต้องดูเงินเข้าบัญชี ([F14](../specs/F14-payments.md) §1) วันงานไม่มีเงินจริง
<!-- /claims:ignore -->
- Messenger และ Instagram ใช้ได้เฉพาะ app roles/test users ของ Meta developer app (development mode ยังไม่ผ่าน app review) กรรมการลองผ่าน LINE OA และ Demo Chat
<!-- claims:ignore -->
- ChatGPT-ready catalog (F39) คือ product feed ตามรูปแบบ ACP และ MCP server ที่เราเปิดเองและทดสอบด้วย MCP client เท่านั้น: **ห้ามพูดว่า** สินค้า "ขึ้นหรือขายอยู่ใน ChatGPT แล้ว", "OpenAI อนุมัติแล้ว" หรือ "จ่ายเงินใน ChatGPT ได้" (checkout ปิดไว้ และการส่ง feed เข้า OpenAI ยังไม่ได้ทำ)
<!-- /claims:ignore -->
- ชุด eval เล็กและเขียนโดยทีม เป็นสัญญาณ ไม่ใช่การรับประกัน ([F37](../specs/F37-evals.md) §1) ตัวเลข `จำลอง` ไม่ใช่คุณภาพจริง
- ตัวเลขเวลาตอบที่วัดไว้ก่อนงาน: turn แชตที่มี tool 7–11.5 วินาทีบนหน้าเว็บกับ Sol (openai-api.md §15) ตัวเลขวันงานให้ใช้จาก `<<fill at 16:15 from /ai-quality and /dashboard>>`
- ไม่ได้สร้างหน้า PDPA, ลบข้อมูลลูกค้า หรือ billing วันนี้ ([QA-PREP](QA-PREP.md) มีคำตอบ)

## 7. Prior-work declaration

กติกา (Luma, brief §1): "You're welcome to arrive with ideas or build on existing personal or open-source projects"; new work "must take place during the event and be significant and substantial"; "Only work completed during the event will be judged." โค้ดของบริษัทไม่ถูกพูดถึง (ประเทศอื่นห้ามโค้ดที่ทำมาก่อนทั้งหมด) จึงตัดสินใจ (D1) ใช้แบบ A เป็นค่าเริ่มต้น

ใช้ย่อหน้าเดียวกันทุกที่: README ของ repo แข่ง, แบบฟอร์มส่งงาน, สไลด์ 6, เวทีและ Q&A

### แบบ A (ค่าเริ่มต้น): สร้างจาก spec ของเราเอง ไม่เปิดโค้ดของบริษัท

**EN:** Endless draws on our experience with an existing product in our company's field of work `<<COMPANY>>`. None of that product's code is in this repository, and our Codex agents never opened it. Before 10:00 we prepared only documents and interface declarations, committed at baseline `<<BASELINE_SHA>>`: the plan, per-feature build specifications written in our own words, Codex prompts, a TypeScript contracts file (types and signatures, no implementation), the team-board script and Codex hooks/config. We also did research on the OpenAI API before the event; that research code was not brought in. Every line of application code (server, web, database migrations, tests, evals) was written today between 10:00 and 17:00 by our team with Codex, from those specifications. The git history from `<<BASELINE_SHA>>` to `<<FINAL_SHA>>` shows today's work.

**TH:** Endless ใช้ประสบการณ์ของทีมจากผลิตภัณฑ์เดิมในสายงานของบริษัท `<<COMPANY>>` แต่โค้ดของผลิตภัณฑ์นั้นไม่อยู่ใน repository นี้ และ Codex ของเราไม่ได้เปิดอ่านเลย ก่อน 10:00 เราเตรียมเฉพาะเอกสารและการประกาศ interface ที่ commit ไว้ที่ baseline `<<BASELINE_SHA>>` ได้แก่ แผน, spec ต่อฟีเจอร์ที่เขียนด้วยคำของเราเอง, prompt ของ Codex, ไฟล์ contracts แบบ TypeScript (type และ signature ไม่มี implementation), สคริปต์บอร์ดทีม และ hooks/config ของ Codex เรามีงานทดลองกับ OpenAI API ก่อนงานด้วย แต่ไม่ได้นำโค้ดนั้นเข้ามา โค้ดของแอปทุกบรรทัด (server, web, migrations, tests, evals) เขียนวันนี้ 10:00–17:00 โดยทีมกับ Codex จาก spec เหล่านั้น ประวัติ git จาก `<<BASELINE_SHA>>` ถึง `<<FINAL_SHA>>` คืองานของวันนี้

### แบบ B: ผู้จัดยืนยันเป็นลายลักษณ์อักษรว่าใช้โค้ดบริษัทเป็น reference แบบ read-only ได้

ใช้เฉพาะเมื่อมีอีเมลตอบเป็นลายลักษณ์อักษร และหัวหน้าทีมโพสต์ `LEAD: PAPI-REF OPEN` แล้ว

**EN:** Endless draws on an existing product of our company `<<COMPANY>>`. We did not copy its code into this repository. Before 10:00 we prepared only documents and interface declarations, committed at baseline `<<BASELINE_SHA>>` (the same list as above). On `<<organizer reply date>>` the organizers confirmed in writing that our company's code may be used as a read-only behaviour reference, and our company approved this. During the event Codex read that code only to check behaviour and edge cases, never to copy it. Every line of application code in this repository was written today between 10:00 and 17:00 by our team with Codex. The git history from `<<BASELINE_SHA>>` to `<<FINAL_SHA>>` shows today's work.

**TH:** Endless ใช้ประสบการณ์จากผลิตภัณฑ์เดิมของบริษัท `<<COMPANY>>` เราไม่ได้คัดลอกโค้ดเดิมเข้า repository นี้ ก่อน 10:00 เราเตรียมเฉพาะเอกสารและการประกาศ interface ที่ commit ไว้ที่ baseline `<<BASELINE_SHA>>` (รายการเดียวกับแบบ A) เมื่อ `<<organizer reply date>>` ผู้จัดยืนยันเป็นลายลักษณ์อักษรว่าใช้โค้ดของบริษัทเป็น reference เรื่องพฤติกรรมแบบอ่านอย่างเดียวได้ และบริษัทอนุญาตแล้ว ระหว่างงาน Codex อ่านโค้ดนั้นเพื่อตรวจพฤติกรรมและกรณีขอบเท่านั้น ไม่ได้คัดลอก โค้ดของแอปทุกบรรทัดใน repository นี้เขียนวันนี้ 10:00–17:00 โดยทีมกับ Codex ประวัติ git จาก `<<BASELINE_SHA>>` ถึง `<<FINAL_SHA>>` คืองานของวันนี้

กฎเลือก: ไม่มีคำตอบเป็นลายลักษณ์อักษรก่อนหรือระหว่าง registration 08:30 = แบบ A เสมอ ([organizer-email.md](organizer-email.md)) · ห้ามพูดว่า "หลายร้านใช้อยู่" หรืออ้างลูกค้าจริงของผลิตภัณฑ์เดิม ถ้าบริษัทไม่อนุญาตเป็นลายลักษณ์อักษร

## 8. เช็กลิสต์ก่อนพูด

- [ ] เลือกแบบ prior-work แล้ว ตรงกับ README และแบบฟอร์มส่งงาน
- [ ] `Select-String` ด้านบนไม่เจอ `<<` ในส่วนที่จะพูด
- [ ] ตัวเลขสดทุกตัวมีที่มา (หน้า `/ai-quality`, `/dashboard`, git) และ screenshot เก็บไว้
- [ ] จำนวน R/S/A/U ตรงกับ `FEATURE_STATUS.csv` ที่ freeze แล้ว
- [ ] ไม่มีชื่อร้านจริง ไม่มี "from zero" ไม่มีการเคลม Shopee integration ไม่เรียก recording ว่า live
- [ ] ทุกคนตอบ 5 คำถามได้เหมือนกัน: prior work, สลิปปลอม, ทำไมไม่ใช้ Shopee/LINE ที่มีอยู่, โมเดลล่ม, ใช้ Codex อย่างไร ([QA-PREP](QA-PREP.md))
