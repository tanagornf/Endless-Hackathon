# SUBMISSION-CHECKLIST: 15:30 ถึง 20:30

ตามสไลด์ผู้จัด 21 พ.ย. ส่ง **Google Form หนึ่งครั้งต่อทีมภายใน 17:00** · ต้องมี repo GitHub ใหม่ที่ public, project writeup, live demo/prototype link และ declaration · เป้าของทีมคือ 16:45 เผื่อ 15 นาที · ใช้ลิงก์ฟอร์มที่ผู้จัดให้

**เจ้าของ:** lead = ส่งงาน/ฟอร์ม · C = README, ledger, deploy, video · A = deck, ของที่โต๊ะ · B = ตัวเลข eval · ชื่อผู้พูด `<<PRESENTER>>` (แนะนำคนที่ตอบเรื่อง AI/validator ลึกและพูดอังกฤษคล่อง ตัดสินใจก่อน 15:30; Driver และ Backstop ตาม [demo-loop.md](demo-loop.md))

## ตารางเวลา

| เวลา | ทำอะไร | เจ้าของ | เสร็จเมื่อ |
|---|---|---|---|
| **15:30** | `LEAD: FREEZE` · หยุดเริ่มฟีเจอร์ · ซ่อนฟีเจอร์ที่ไม่ถึง R ด้วย feature flag (`/ops`) · F36 รวม `FEATURE_STATUS.csv` ตามจริง (status + actual_mode) · เลือกผู้พูด · วาง README จาก [README-TEMPLATE](README-TEMPLATE.md) | lead, C | ledger ไม่มีแถว R ที่ซ่อน/ไม่มีแถวที่ฟีเจอร์ถูกซ่อนแต่ยังเขียนว่า R |
| 15:30–15:50 | slice ที่ผ่าน test merge ได้ถึง 15:50 หลังจากนั้นเฉพาะแก้บั๊ก · เริ่มร่าง deck จาก [DECK-OUTLINE](DECK-OUTLINE.md) | ทุกคน | `main` เขียวบน production |
| ~15:45 | **real eval หนึ่งรอบ** (F37 `/ai-quality`, โมเดลจริง ไม่ใช่ fake) · ถ่ายหน้าจอ | B | ได้รอบที่ป้าย "จริง" |
| 15:30–16:30 | ทดสอบบน production ตาม [quality-bar](../day/quality-bar.md): มือถือกรรมการ (A0), ความเร็ว (B0), security + demo data (C0) · ปัญหาที่ไม่ทัน ให้บอก lead เพื่อเลี่ยงใน demo | A0 B0 C0 | ข้อบกพร่องที่เหลือจดไว้ใน [demo-loop](demo-loop.md) ช่อง "ถ้าไม่ R" |
| 16:00 | เดินทางของกรรมการบนมือถือจริงบน 4G (สแกน QR ของ LINE OA) รอบสุดท้าย | A0 | ตาราง quality-bar §1 ผ่านครบ |
| **16:15** | **กรอกตัวเลขสด:** `/ai-quality`, `/dashboard`, `model_usage`, git (PR, commits) · C รวมหลักฐาน handoff จริงหนึ่งรายการ: ลิงก์ board → Codex review → regression test/CI → merged SHA และ smoke บน production · ใส่ใน `docs/evidence/` แล้วลิงก์จาก README/writeup · ระบุว่าตัวเลขมาจาก demo สังเคราะห์เมื่อใช่ | B (AI), C (git), A0 (handoff) | ทุก claim ที่ส่งมีหลักฐานและไม่มี placeholder |
| 16:15 | เลือกแบบ prior-work (A/B) ใส่ README, ฟอร์ม, สไลด์ ให้ตรงกัน | lead | ตรงกับ [PITCH §7](PITCH.md) |
| 16:15 | `FEATURE_STATUS.csv` final: R/S/A/U + provider ตามจริง · ซ่อนฟีเจอร์ไม่ใช่ R ถ้าเพิ่งผ่านเกณฑ์ ให้ตรวจ Playwright smoke บน production ก่อนเปลี่ยนเป็น R | C | ledger ตรงกับสิ่งที่เห็นบน production |
| **16:30** | **วิดีโอ demo อัดเสร็จ** ([VIDEO-SCRIPT](VIDEO-SCRIPT.md)) มีป้าย RECORDED · **deck export PDF** · README ครบ · เปิด uptime monitor ที่ `/healthz` | C (วิดีโอ), A (deck) | ไฟล์เปิดได้ offline บน STAGE และ STANDBY |
| 16:30–16:45 | ซ้อม demo-loop 3 นาทีหนึ่งรอบบน production จับเวลา · เตรียมฟอร์มส่งงาน (ข้อความด้านล่าง) | lead | — |
| **16:45** | **production freeze:** ห้าม merge เข้า `main` · `pg_dump` production · เก็บ `/build-info` sha = `<<FINAL_SHA>>` · แท็ก git `final-<sha7>` · **กดส่งงาน** เก็บใบรับ (screenshot/อีเมล) | lead + C | ได้ receipt |
| 16:45–17:00 | ตั้งโต๊ะ: การ์ด QR ของ LINE OA · การ์ดคำถาม · ต่อไฟ · hotspot · STANDBY login · สลิปสังเคราะห์บนมือถือ | A, B | ตามรายการ "โต๊ะ" ด้านล่าง |
| **17:00** | code freeze ของผู้จัด · **warm-up** ตามรายการใน [demo-loop](demo-loop.md) (LINE 1 ข้อความ, ทีมตรวจภายในผ่าน Demo Chat 1 คำถาม, voice 1 session, upload 1 ไฟล์, demo reset) · ซ้อม loop 90 วินาที | ทุกคน | — |
| 17:15 | Round 1 เริ่ม | Speaker + Driver + Backstop | — |
| 17:15–19:30 | Round 1 (เคล็ดลับด้านล่าง) · warm-up ซ้ำทุก 15 นาทีที่ไม่มีกรรมการ | ทุกคน | — |
| 18:30–19:30 | เตรียม finalist (ด้านล่าง) · ประกาศ top-5 เมื่อไรไม่ทราบ ให้เตรียมไว้ก่อนเสมอ | Speaker + lead | ซ้อมจับเวลา 1 รอบเต็มที่ 6:30 |
| 19:30 | finalist บนเวที (ถ้าเข้ารอบ) [PITCH §3](PITCH.md) · ความยาว UNCONFIRMED | Speaker, Driver, Backstop | — |
| 20:30 | ประกาศรางวัล | — | — |

## ข้อมูลสำหรับ Google Form

| ช่อง | ค่า |
|---|---|
| Team name / members | `<<TEAM NAME>>` · `<<NAME 1–3>>` (ลงทะเบียนเดี่ยวทุกคนภายใต้ชื่อทีมเดียวกัน, brief §1) |
| Repo link | `<<URL>>` · repo ใหม่ที่สร้างสำหรับงานและเป็น public · เปิดแบบ signed out ตรวจว่า README และลิงก์หลักฐานเข้าถึงได้ |
| Project writeup | ปัญหาของร้านไทยที่ขายผ่านแชต, ทางแก้, AI-Native Products & Operations และหลักฐานการใช้ Codex ที่ลิงก์ไปยัง handoff, review, test และผลบน SHA ที่ส่ง |
| Live URL | `<<production URL>>` · ลูกค้าและกรรมการเริ่มแชตผ่าน QR ของ LINE OA ด้านล่าง |
| LINE OA | ชื่อที่แสดง *Endless* (channel *NLess Demo* ใน console) + ภาพ QR (ไฟล์ `docs/assets/line-oa-qr.png`) |
| Video / deck | เตรียมไว้ใช้พิตช์หรือแนบถ้าฟอร์มมีช่อง · วิดีโอติดป้าย RECORDED · deck PDF 6 หน้า |
| Build direction | หลัก: AI-Native Products & Operations · รอง: Autonomous & Adaptive AI, Deep Domain AI (brief §1) |
| Prior work | ย่อหน้าจาก [PITCH §7](PITCH.md) แบบที่เลือก |
| Codex | ใช้ Codex ในแอป ChatGPT: 3 orchestrators + 9 worker lanes ต่อ worktree, PR ที่ merge `<<n>>` (git) |
| Contact | `<<อีเมลหัวหน้าทีม>>` (ห้ามโพสต์บนบอร์ด) |

### คำอธิบาย 100 คำ (EN)

Endless is an AI chat-commerce assistant for small Thai shops that sell on LINE. It answers from the shop's own knowledge and catalog, takes prices only from the catalog, refuses made-up discounts, proposes orders that the customer confirms, creates a PromptPay QR for each order, checks payment slips in code, and lets staff take over any chat. An in-app Thai eval page and seller impact metrics show how well it works. Built today by three people with Codex. Try the release through its LINE Official Account. Slip checks are not bank verification.

### คำอธิบาย 300 คำ (EN)

Small Thai shops sell in chat, and LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response. Replying slowly loses the order; replying fast with a wrong price means the shop must honour it. Endless is an AI chat-commerce assistant that helps Thai shops sell through a LINE Official Account.

The model talks, code owns the facts, and a human can always take over. The assistant answers from the shop's own knowledge and catalog. Prices come from catalog tools, and a validator checks every amount before a reply is sent, so a made-up discount is refused. An order is only a proposal until the customer taps confirm. Each confirmed order gets its own PromptPay QR with the exact amount and an order reference, and payment slips are checked in code (the QR on the slip, duplicate transaction reference, amount and receiver, with a vision read as a helper) before anything is marked paid. Slip checks are not bank verification, and we say so in the product. Staff can take over any chat; the bot stops immediately.

We measure it inside the app: an evaluation set in Thai and English with synthetic slips, an AI quality page that labels real versus simulated runs, a trace for every AI turn, and seller impact metrics.

Everything runs as one Node.js server on Render with PostgreSQL and pgvector, using OpenAI only.

Three people built it today with Codex in the ChatGPT desktop app: three orchestrator chats and nine worker chats, each in its own git worktree, coordinated through one shared board (a pinned GitHub issue), specifications and hooks. Codex wrote the code, the tests and the evals; humans decided the product, the safety rules and the gates. Prior work is declared in the README.

(ถ้าจะเพิ่มประโยคเรื่อง follow-up nudges, MCP/ChatGPT-ready catalog, bookings หรือ live-commerce ให้เพิ่มเฉพาะฟีเจอร์ที่เป็น R ใน ledger ที่ freeze และตัดประโยคอื่นให้ไม่เกิน 300 คำ)

## โต๊ะ (16:45–17:00)

- [ ] การ์ด QR ของ LINE OA พิมพ์แล้ว 2 สำเนา ตั้งสูงพอเห็นจากหน้าโต๊ะ · การ์ดคำถาม · ป้ายชื่อทีม
- [ ] STAGE laptop ต่อไฟ ปิด sleep · STANDBY login owner A อีกเครื่อง · มือถือทีมเปิด hotspot + LINE ที่เพิ่ม OA แล้ว · สายชาร์จ ปลั๊กพ่วง
- [ ] recording และ deck PDF ในเครื่องทั้งสอง (เปิดได้โดยไม่ต่อเน็ต) · สลิปสังเคราะห์ 2 ใบ
- [ ] เบอร์ผู้ติดต่อผู้จัด · น้ำและของกิน สลับกันกิน

## Round 1: เคล็ดลับ (17:15–19:30)

- เริ่มจากให้กรรมการหยิบมือถือสแกน QR ของ LINE OA ก่อนพูด ถ้า LINE ใช้ไม่ได้ ให้บอกตามจริงหรือเปิดหลักฐาน LINE ที่ทดสอบผ่านแล้วและติดป้าย RECORDED · พูด 60–90 วินาทีจาก [PITCH §2](PITCH.md) พร้อมกัน · ถ้ากรรมการเงียบ ถามว่า "ลองขอลดราคาดูไหม" · ไม่เถียงเมื่อบอกว่าตอบช้า ให้เปิด trace
- ตอบคำถามจาก [QA-PREP](QA-PREP.md) ด้วยสิ่งที่เปิดให้ดูได้ · ถ้าไม่ทราบ ให้บอกว่าไม่ทราบ ห้ามเดา
- ระหว่างกรรมการเวียน: reset (demo-loop) ทุกชุด · จดชื่อและคำถามของกรรมการสั้น ๆ ไว้ใช้เตรียมรอบ finalist · อย่าแก้โค้ดหรือ deploy
- อยู่โต๊ะอย่างน้อย 2 คนเสมอ คนที่ไม่อยู่โต๊ะเตรียมรอบ finalist

## เตรียม finalist (18:30–19:30)

- [ ] ซ้อม [PITCH §3](PITCH.md) จับเวลา 6:30 หนึ่งรอบ (ตัดเหลือ 5:00 ตามลำดับตัด) · ผู้พูดเดียวกับที่เตรียม
- [ ] HDMI + adapter USB-C ของทีม · จอ mirror · font ใหญ่ · deck PDF เปิดแล้วบนเครื่อง STAGE · tabs demo เปิดแล้ว · demo reset ก่อนขึ้นเวที
- [ ] ประกาศ top-5 ช้า: อย่ารอ เตรียมให้พร้อมตั้งแต่ 18:30 · Backstop ถือ STANDBY และวิดีโอ
- [ ] ทบทวน 5 คำถามที่ทุกคนตอบได้เหมือนกัน (prior work, สลิปปลอม, ทำไมไม่ใช้ Shopee/LINE ที่มี, โมเดลล่ม, ใช้ Codex อย่างไร)
- [ ] ตรวจ `/healthz` และเครดิต API อีกครั้ง 19:15
