# หัวหน้าทีม: งานเพิ่มจากหน้าคนของตัวเอง

หัวหน้า: Wattanun Teeratanapong (@Ikkyuuuu) · ทำงานใน lane ของตัวเองตาม [A.md](A.md) / [B.md](B.md) / [C.md](C.md) ด้วย · ใช้หน้านี้คู่กับ [PLAN.md](../../PLAN.md) และ [DECISIONS](../../docs/DECISIONS-2026-11-20.md)

หัวหน้าเป็นคนเดียวที่: เปิด tier, ประกาศ usage, freeze, ย้ายหรือตัดฟีเจอร์ข้าม lane, ตัดสินเรื่องโค้ด Papi และถือ key ของ production · agent และ orchestrator ทำสิ่งเหล่านี้เองไม่ได้ (orchestrator เสนอได้ใน `STAGE`)

## คืนนี้

- [ ] **กรอก [`docs/competition-plan/team.json`](../../docs/competition-plan/team.json) แล้ว push ก่อนอย่างอื่น:** ชื่อ + GitHub login ของ A, B, C · `lead` (A, B หรือ C) · `competitionRepo` (`<login ของ C>/<ชื่อ repo ใหม่>`) สคริปต์เริ่มงานอ่านไฟล์นี้เพื่อแทน `REPLACE_*` ใน prompts, เติมค่าบอร์ดในไฟล์ secrets และ clone repo แข่ง ([START.md ข้อ 2](../../START.md)) · จากนั้นให้ C รัน Prep พร้อม `-CreateRepo` (สร้าง repo ว่าง เชิญ A/B สร้าง issue บอร์ด) แล้ว A, B **กดรับคำเชิญคืนนี้**
- [ ] **ทุกคนตั้งแจ้งเตือนของแอป ChatGPT และจับคู่มือถือ** ([START.md ข้อ 3](../../START.md)): Settings → Notifications (turn completion Always, permission on, question on) และ Settings → Connections → Control this Mac or PC → สแกน QR ด้วยแอป ChatGPT ในมือถือ นี่คือทางที่ chat ซึ่งต้องการคนจะถึงทั้งเครื่องและมือถือ · ถ้าบัญชีของใครจับคู่มือถือไม่ได้ ให้บอกทีมคืนนี้
- [ ] ทุกคนเริ่มเตรียมเครื่องด้วยบรรทัดเดียวใน [START.md](../../START.md) (`You are <A|B|C>. Prepare this PC: follow START.md section "Prep".`) และแจ้งผลในกลุ่ม
- [ ] ส่ง [อีเมลถามผู้จัด](../../docs/pitch/organizer-email.md): ใช้โค้ดบริษัทเป็น reference ได้ไหม, รูปแบบการส่งงาน, ความยาว pitch รอบ final, API credits ใช้กับ Codex ได้ไหม · จดคำตอบใน [SOURCE-BASELINE](../../docs/competition-plan/templates/SOURCE-BASELINE.md)
- [ ] ตกลงชื่อ A / B / C และ presenter (`REPLACE_*` ใต้ `prompts/` ถูกแทนจาก team.json ตอน copy baseline ไม่ต้องแก้มือ)
- [ ] ยืนยันว่าทุกคนได้ **ChatGPT Pro + Codex credits US$100 + API credits US$100** · เช็กวันหมดอายุและว่า `gpt-6.2-sol` ใช้ได้ทั้งใน Codex และ API
- [ ] OpenAI: ทุกคนมี project `app-dev` ที่ตั้ง **hard limit US$30** · คุณสร้าง project **`app-prod` + hard limit US$60** (Project settings → Limits → Enforce a hard limit) และเก็บ key ไว้ส่งให้ C ใส่ใน Render เท่านั้น
- [ ] ตัดสิน: เปิด auto top-up ของ Codex credits ไหม · production DB ใช้ Render Postgres (ค่าเริ่มต้น) หรือ Supabase · บันทึกใน SOURCE-BASELINE
- [ ] **ทดสอบบอร์ดไปกลับจากทั้ง 3 เครื่องคืนนี้** ([START.md ข้อ 4](../../START.md)): `check` เห็น `Board: … state=open`, โพสต์ทดสอบหนึ่งโพสต์แล้วอีกสองคนเห็นบน issue, และทดสอบ hook MANGO/PONG ในแอป · บอร์ดใช้ GitHub issue อย่างเดียวได้ครบ Sites dashboard ([sites-dashboard.md](../../docs/board/sites-dashboard.md)) เป็นส่วนเสริม ใช้เมื่อผ่านการทดสอบจาก 3 เครื่องแล้วเท่านั้น
- [ ] ทุกคนแจ้งผล preflight ([pc-preparation.md](../../docs/day/pc-preparation.md)) และผ่าน checklist ในหน้าคนของตัวเอง · C ซ้อม setup + deploy แล้ว
- [ ] พิมพ์: QR ของ LINE OA *NLess Demo*, QR ของ URL Demo Chat (ใส่ URL หลัง deploy จริงได้ด้วย QR ที่ชี้ short link), การ์ดชื่อทีม · เตรียม hotspot สำรอง ปลั๊กพ่วง สายชาร์จ
- [ ] อ่าน [PITCH.md](../../docs/pitch/PITCH.md), [QA-PREP.md](../../docs/pitch/QA-PREP.md), [SUBMISSION-CHECKLIST.md](../../docs/pitch/SUBMISSION-CHECKLIST.md) และ [failure-drills.md](../../docs/day/failure-drills.md) หนึ่งรอบ

## เช้าวันงาน

- **08:30** เช็กคำตอบผู้จัดเรื่องโค้ดบริษัท: ไม่มีคำตอบเป็นลายลักษณ์อักษร หรือตอบว่าห้าม → `../papi-ref` ปิดทั้งวัน (ค่าเริ่มต้นของแผน ไม่ต้องทำอะไรเพิ่ม) · ตอบว่าได้เป็นลายลักษณ์อักษร → จดใน SOURCE-BASELINE แล้วตัดสินว่าจะโพสต์ `LEAD: PAPI-REF OPEN` หรือไม่ (แนะนำ: ไม่เปิด เว้นแต่ติดพฤติกรรมที่ spec ไม่ครอบคลุม เพราะ spec ครบอยู่แล้วและการไม่เปิดทำให้คำประกาศ prior work ง่ายกว่า)
- **10:00** ดูว่า baseline ถูก copy เข้า repo แข่งและ push แล้ว (ไม่มี `tools/openai-check`, ไม่มี secret), dashboard เปิดได้, ทุกคนเปิด 4 chat ใน project ของ worktree ที่ถูก (`type .lane`)

## โพสต์ของหัวหน้า

โพสต์ด้วยสคริปต์บอร์ดตัวเดียวกับ agent (ขึ้นต้น `[LEAD]` ให้เอง):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 post -AgentId LEAD -Text "LEAD: OPEN P1 checkpoint 1 ผ่าน usage A 15% B 18% C 20%" -PostId lead-open-p1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 post -AgentId LEAD -Text "LEAD: BUDGET A 15% · B 18% · C 20%" -PostId lead-budget-1130
powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 post -AgentId LEAD -Text "LEAD: FREEZE หยุดเพิ่มฟีเจอร์ merge slice ที่ผ่าน test ได้ถึง 15:50" -PostId lead-freeze
```

`-PostId` ต้องไม่ซ้ำ (ใช้ซ้ำ = กันโพสต์ซ้ำตอน retry) · `LEAD: OPEN` และ `LEAD: FREEZE` ปลุกทุก lane · `LEAD: BUDGET` ไม่ปลุกใคร · ย้ายหรือตัดฟีเจอร์ใช้โพสต์ `CHANGE` ที่แท็ก `TO:` lane และ orchestrator ที่เกี่ยวข้อง

## Checkpoint และการเปิด tier

| เวลา | ดูอะไร (จาก `STAGE` ของ orchestrator ทั้งสาม + dashboard) | โพสต์ |
|---|---|---|
| **11:30** | production ตอบ `/healthz` · ทุก lane ที่ทำ P0 merge PR แรกหรือโพสต์ BLOCKED · dev login, base schema, fakes, `model.chat()` จริงบน `main` · usage แต่ละคน ≤ 20% | `LEAD: BUDGET ...` แล้ว `LEAD: OPEN P1` ถ้าผ่าน (ไม่ผ่าน → เปิดตอน gate 13:00 ผ่าน) |
| **13:00** | ผล CORE-LOOP GATE จาก **C0** (ตรวจบน production) · usage ≤ 40% | `LEAD: BUDGET ...` + `LEAD: OPEN P1` (ถ้ายังไม่เปิด) / `LEAD: OPEN P2` |
| **14:30** | P0 เป็น R รวม LINE OA ตัว demo จริง, P1 เป็น R/S, usage ≤ 55% · ตารางสถานะและข้อเสนอตัดฟีเจอร์จาก orchestrator | `LEAD: BUDGET ...` + `LEAD: OPEN P3` (F30 voice) ถ้าผ่าน + โพสต์ตัดฟีเจอร์ |
| **15:30** | — | `LEAD: FREEZE` แล้วให้ C ซ่อนฟีเจอร์ที่ไม่ถึง R |
| **16:45** | smoke บน production ผ่าน, วิดีโออัดแล้ว | ยืนยัน deploy freeze แล้วส่งงาน |

**วิธีนับ usage ต่อคน:** ตัวเลข weekly limit ที่หน้า chatgpt.com/codex/settings/usage ของแต่ละคน (ให้แต่ละคนอ่านแล้วบอก) · ถ้า included usage หมดแล้ว นับ 100% + สัดส่วน Codex credits ที่ใช้ · ดู usage ของ OpenAI API แยก (project `app-dev` ของแต่ละคน และ `app-prod`)

**เบรกงบ (บอกเจ้าตัวและ orchestrator ของเขา):** ถึง 40% → ปิด Fast ทุก chat ของคนนั้น · เกิน 50% ก่อน 13:00 → worker ลดเป็น effort low · included usage หมดและ Codex credits เหลือไม่ถึง 30% → เหลือ orchestrator + worker ที่มีงาน tier สูงสุด ([fallback](../README.md#fallback-orchestrator--2-workers)) · API ของ project ใดเกิน 70% ของ hard limit → หาสาเหตุ (test ที่เรียก model จริงซ้ำ ๆ) ก่อนเพิ่ม limit

## ตัดสินใจระหว่างวัน

- **ย้ายฟีเจอร์ข้าม lane** (มีแค่หัวหน้า): โพสต์ชัดว่า "ย้าย Fxx จาก <lane> ไป <lane>" ทั้งสอง lane และ orchestrator ของทั้งสองต้องเห็นก่อนเริ่ม
- **ตัดฟีเจอร์เมื่อไม่ทัน (ตัดสินที่ 14:30):** F30 → F16 → F21 → F23 → F22 → F39 → F12 → F31 ส่วน slice 2–4 (ตั้งค่า + web push) → F26 · **ไม่ตัด P0, ไม่ตัด F37 และตัวเลขผลลัพธ์ของร้านใน F27** (หลักฐาน "วัดผลได้") · ฟีเจอร์ที่ตัดถูกซ่อนจากเมนูและอยู่ในตารางพร้อมสถานะจริง
- **effort max:** อนุญาตทีละ chat เดียวทั้งทีม เมื่อเรื่องนั้นขวาง golden path และติดเกิน 45 นาที
- **BLOCKED ที่แท็กคุณ:** (เครื่องที่โพสต์ร้องเตือน และ GitHub แจ้งเตือนคุณจาก @mention) ตอบภายใน 10 นาที ถ้าเป็นเรื่อง provider (LINE/Meta/OpenAI/Render) ทำตาม [failure-drills.md](../../docs/day/failure-drills.md) แล้วรายงานตามจริง
- **ไม่โกหกสถานะ:** หน้าที่กดแล้วไม่มีผล = U · fake ที่ยังไม่ถูกแทน = A · ไม่ได้ยืนยันกับธนาคาร/provider = S · R ต้องผ่าน smoke บน production

## ส่งงานและ demo

ทำตาม [SUBMISSION-CHECKLIST.md](../../docs/pitch/SUBMISSION-CHECKLIST.md) (มีเวลากำกับทุกข้อ) สรุป:

- 15:30–16:30 orchestrator ทั้งสามทดสอบบน production · C1 รวม `FEATURE_STATUS.csv` จาก `EVIDENCE.md` และสร้าง README จาก [README-TEMPLATE](../../docs/pitch/README-TEMPLATE.md) (F36) · B กรอกตัวเลขจริงลง deck
- **16:30** วิดีโอ demo 2–3 นาทีอัดเสร็จ · **16:45** deploy freeze, `pg_dump`, ส่งงาน (ผู้จัดปิด 17:00) · จด SHA สุดท้ายและ URL ใน SOURCE-BASELINE
- 17:00–17:15 warm แอป, demo reset, ซ้อม [demo loop](../../docs/pitch/demo-loop.md) กับ presenter, เปิดวิดีโอสำรองไว้ (ติดป้ายว่าเป็นบันทึก)
- 17:15 Round 1 ที่โต๊ะ: ให้กรรมการสแกน QR แล้วลองเอง · 19:30 ถ้าเข้ารอบ ใช้ pitch ภาษาอังกฤษใน [PITCH.md](../../docs/pitch/PITCH.md) และ [QA-PREP.md](../../docs/pitch/QA-PREP.md)
