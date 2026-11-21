# แผนวันแข่ง: สร้าง Endless ใหม่ด้วย Codex 12 sessions (3 orchestrators + 9 workers)

**ชื่อ:** ผลิตภัณฑ์ที่ส่งกรรมการชื่อ **Endless** (หน้าแอป, Demo Chat, อีเมล, README, สไลด์, ใบส่งงาน) · **NLess** คือชื่อผลิตภัณฑ์เดิมที่เป็นที่มาของความรู้ และยังอยู่ในชื่อภายในที่ไม่เปลี่ยน: `@nless/shared`, `nless_hack_*`, โฟลเดอร์ `..\nless-*`, `..\nless.secrets.env` และชื่อ LINE channel *NLess Demo* / *NLess Dev* ใน console (ชื่อที่ลูกค้าเห็นของ OA ตัว demo ให้ C เปลี่ยนเป็น Endless ใน LINE Official Account Manager)

อัปเดต **20 พฤศจิกายน 2569 (ค่ำ)** สำหรับงาน **เสาร์ 21 พฤศจิกายน 2569 (เวลาไทย)**: เขียนโค้ด 10:00–17:00 น. (code freeze + ส่งงาน 17:00), กรรมการรอบแรกเดินตามโต๊ะ 17:15, finalists ขึ้นเวที 19:30, ประกาศรางวัล 20:30 ([กำหนดการผู้จัด](https://luma.com/39zve8ph))

ฉบับนี้ **แทนฉบับบ่าย 20 พ.ย.** และใช้การตัดสินใจ D1–D17 ใน [docs/DECISIONS-2026-11-20.md](docs/DECISIONS-2026-11-20.md) ครบทุกข้อ (ข้อเท็จจริงเบื้องหลังอยู่ใน [docs/research/hackathon-brief.md](docs/research/hackathon-brief.md)) ถ้าเอกสารอื่นขัดกับหน้านี้ ให้ยึดหน้านี้ · Codex รับกติกาจาก [AGENTS.md](docs/competition-plan/templates/AGENTS.md), prompt ใน [prompts/](prompts/README.md) และแบบสร้างใน [docs/specs/](docs/specs/README.md) · วิธีเรียก OpenAI อยู่ใน [docs/openai-api.md](docs/openai-api.md)

## สรุปในหนึ่งนาที

- **ผลิตภัณฑ์ที่ต้องได้ตอนจบ:** [docs/PRODUCT.md](docs/PRODUCT.md) อธิบาย Endless ฉบับเต็ม (ใครใช้ ลูกค้าและร้านเห็นอะไร AI ต้องทำตัวอย่างไร อะไรเรียกว่าดี) · Codex ทุก session อ่านไฟล์นี้ก่อนเริ่มงาน
- **เป้าหมาย:** เว็บ **production ที่ใช้ได้จริง** บน URL สาธารณะ: ฟีเจอร์ที่โชว์ต้องทำงานจริงตั้งแต่หน้าจอถึง API ถึง DB ถึง provider ไม่มีปุ่มหลอก ([production bar](#production-bar-ของจริงเท่านั้น)) · ทะเบียนคง **31 ID** และรายงาน R/S/A/U ตามจริง (29 ฟีเจอร์อยู่ในแผนรุ่นนี้ อีก 2 เป็น U-deferred) และ **MVP golden path ต้องเป็น R บน production ภายใน 13:00** ([gate](#mvp-golden-path-และ-core-loop-gate))
- **สร้างจาก spec ของเราเอง** ([docs/specs/](docs/specs/README.md) 31 ไฟล์) จาก repo ว่าง **ไม่เปิดโค้ด Papi** เว้นแต่ผู้จัดยืนยันเป็นลายลักษณ์อักษร ([ที่มาของโค้ด](#ที่มาของโค้ด-สร้างจาก-spec-ไม่เปิดโค้ด-papi))
- **scope:** ทะเบียน 31 ID รวม F37 AI evals, F38 follow-up nudges และ F39 ChatGPT-ready catalog + ส่วนเสริมใน F14 (QR ต่อออเดอร์ + ตรวจสลิปจาก QR) และ F27 (ตัวเลขผลลัพธ์ของร้าน) · ตัดออก 8 ฟีเจอร์ ([รายการ](#ตัดออกจาก-scope)) **ไม่มีแพ็กเกจ ไม่มีโควตา**
- **ช่องทาง:** **LINE เป็นช่องทางภายนอกช่องทางเดียว** · กรรมการสแกน QR ของ LINE OA ที่โต๊ะ · ทีมใช้ Demo Chat บนเว็บตรวจ core loop ภายใน
- **AI ของแอปใช้ OpenAI API อย่างเดียว:** `gpt-6.2-sol` ทุกงาน text + embeddings, realtime voice, ถอดเสียง, moderation ของ OpenAI ผ่าน `model.*` ของ core ([docs/openai-api.md](docs/openai-api.md))
- **3 คน × (1 orchestrator + 3 workers) = 12 Codex sessions** ในแอป ChatGPT บน Windows แต่ละ session อยู่ใน worktree ของตัวเอง · worker สร้างฟีเจอร์ · orchestrator มอบงาน ตรวจงาน ทดสอบรวม แก้บั๊กข้าม lane และรายงาน stage ทุก 30 นาที ([แบ่งคนและ lanes](#แบ่งคนและ-lanes))
- **งานแบ่งเท่ากัน:** A 855 · B 892.5 · C 855 นาทีงาน (ค่ากลาง, ต่างจากค่าเฉลี่ยไม่เกิน ±3%) และต้นทุน Codex ต่อคนเท่ากันโดยโครงสร้าง ([ตาราง](#สมดุลงานและต้นทุนต่อคน))
- **ทำตาม tier P0 → P1 → P2 → P3** เปิด tier ถัดไปที่ checkpoint ตามเวลาและ usage ที่เหลือ ([tier](#tier-core-ก่อน-ส่วนเสริมทีหลัง))
- **Production อยู่บน Render (สิงคโปร์) ตั้งแต่ชั่วโมงแรก** deploy ครั้งแรกภายใน 11:30 และ deploy เองทุก merge เข้า `main` · เครื่องของแต่ละคนรันเฉพาะ dev ของตัวเอง บน Neon ([ทุกอย่างรันที่ไหน](#ทุกอย่างรันที่ไหน))
- **บอร์ดสื่อสาร:** GitHub issue ที่ปักหมุดใน repo แข่ง ผ่านสคริปต์บอร์ดตัวเดียว (dashboard บน ChatGPT Sites เป็นส่วนเสริม ไม่บังคับ) ([บอร์ด](#บอร์ดสื่อสาร-github-issue--chatgpt-sites-ส่วนเสริม))
- **งบต่อคน:** ChatGPT Pro หนึ่งวัน + Codex credits US$100 + API credits US$100 ([งบ](#งบ-token-และ-credits))

สำหรับให้ทีมพิจารณาขอบเขตส่งงาน กรอบเวลา และชื่อโครงการ ดู [ข้อเสนอ Priority ของ Endless](docs/competition-plan/ENDLESS-PRIORITY-PROPOSAL.md)

## ทำไมถึงทันในวันเดียว

ประมาณการเดิมของ backlog ทั้ง 31 ID คือ **1,560–3,645 นาทีงาน** (ค่ากลาง ~2,600) เทียบกับเวลาสร้างจริง **9 lanes × 280 นาที = 2,520 นาที** (10:50–15:30; C1 มีเพิ่มอีก ~105 นาทีจาก setup และงาน release) จึง **เกือบทันที่ค่ากลาง และไม่ทันถ้าทุกอย่างช้าสุด** รุ่น LINE-only มีงานตาม tier 29 ฟีเจอร์ จึงยังเปิดงานตาม tier และตัดฟีเจอร์ท้าย lane ก่อน ใช้ห้าอย่างนี้พร้อมกัน:

1. **ทำคู่ขนาน:** worker 9 ตัว แต่ละตัวมี git worktree, port และ database ของตัวเอง
2. **ไม่ต้องออกแบบในวันงาน:** ทุกฟีเจอร์มี [build spec](docs/specs/README.md) ที่บอกตาราง, endpoint, algorithm, prompt, หน้าจอ, test และลำดับ slice ครบ Codex ทำตามได้ทันที
3. **ไม่รอกัน:** ฟังก์ชันที่เรียกข้ามคนมีตัวปลอม (fake) ตั้งแต่ setup ของจริงมาแทนทีหลังโดยไม่เปลี่ยนรูปแบบการเรียก
4. **มีคนกลางต่อคน:** orchestrator มอบงาน ตรวจงานที่ merge แล้วเทียบกับ spec และแก้บั๊กข้าม lane โดยไม่ต้องรอเจ้าของ
5. **Core ก่อน:** ฟีเจอร์ P0 ต้องจริงบน production ภายใน 13:00 แล้วค่อยขยาย P1 → P2 → P3 ฟีเจอร์ที่ไม่ทันถูกซ่อนจากเมนูและรายงานตามจริง

สิ่งที่โค้ดเร่งไม่ได้คือ **การทดสอบโดยคน** และ **บัญชีของ provider** (LINE OA สองตัว, Google OAuth test user, Render, Neon) จึงต้องเตรียมให้เสร็จคืนนี้ ([เช็กลิสต์](#เตรียมก่อนวันเสาร์))

## Production bar: ของจริงเท่านั้น

ฟีเจอร์นับว่าเสร็จ (**R**) เมื่อครบทุกข้อ ([D6](docs/DECISIONS-2026-11-20.md)):

- หน้าจอจริงต่อ API จริงและ DB จริง ไม่มีปุ่มหรือหน้าที่กดแล้วไม่มีผล
- เรียก provider จริงเมื่อฟีเจอร์มี provider: LINE OA จริง, OpenAI จริง, Google test user
- deploy แล้วบน production URL
- มี unit test + route test และ **Playwright smoke หนึ่งไฟล์ที่รันผ่านกับ production**
- **ใช้ได้ครบทั้งภาษาไทยและภาษาอังกฤษ (บังคับ ไม่ใช่ "ถ้ามีเวลา"):** ทุกหน้า เมนู empty state error toast และข้อความ validation มีทั้ง `th` และ `en` ใน i18n (key ครบทั้งสองไฟล์ CI ตรวจ ฟีเจอร์ที่มีไฟล์ภาษาเดียว merge ไม่ได้) · ตัวสลับภาษาทำงานทุกหน้ารวมหน้าสาธารณะ (Demo Chat, หน้าชำระเงิน) · AI ตอบภาษาเดียวกับที่ลูกค้าพิมพ์และสลับตามทุกข้อความ · ข้อความที่โค้ดส่งถึงลูกค้า (ยืนยันออเดอร์ ชำระเงิน นัดหมาย ส่งต่อพนักงาน ป้ายบนการ์ด) มีสองภาษาและใช้ภาษาของลูกค้า (`getCustomerLanguage`) · Playwright smoke มี case ภาษาอังกฤษ
- มี loading / empty / error state · ตรวจ permission และแยก tenant · audit เมื่อเงินหรือข้อมูลลูกค้าเปลี่ยน

Fake มีได้จนกว่าเจ้าของจะแทนด้วยของจริงเท่านั้น **อะไรที่ไม่ถึง R ตอน 15:30 ถูกซ่อนจากเมนูด้วย feature flag** (ไม่มี placeholder ต่อหน้ากรรมการ) และรายงานตามจริงใน FEATURE_STATUS · สถานะ S / A / U ตาม [AGENTS.md ข้อ 10](docs/competition-plan/templates/AGENTS.md)

## MVP golden path และ CORE-LOOP GATE

| ระดับ | ฟีเจอร์ | สถานะที่ต้องได้ |
|---|---|---|
| **MVP golden path** | F01 core, F35 jobs, F03 tenancy, F04 ตั้งค่าร้าน, F05 คลังความรู้, F07 ค้นหา, F08 สินค้า, F09 inbox + **Demo Chat บนเว็บ**, F10 AI ตอบ, F11 (ส่วน takeover), F17 LINE | **R บน production** |
| Stretch | F13 order proposal (AI เสนอออเดอร์ ลูกค้ายืนยัน), F14 QR + ตรวจสลิป | R/S ถ้าทัน |
| ที่เหลือ | ทุกฟีเจอร์อื่นใน scope | R/S/A/U ตามจริง |

**CORE-LOOP GATE 13:00:** **C0 (orchestrator ของ C) ตรวจบน production** ด้วยร้านสังเคราะห์ A ทุกขั้นต้องใช้ของจริง ไม่ใช่ fake (`/build-info` ต้องบอก `modelMode: openai`)

1. ร้านเพิ่ม knowledge และสินค้าพร้อมราคา
2. ลูกค้าถามใน Demo Chat (หรือ LINE OA)
3. AI ตอบจากข้อมูลจริง ราคาถูกต้อง ถามสิ่งที่ไม่มีข้อมูลแล้วไม่เดา · **ถามภาษาอังกฤษหนึ่งคำถาม** (`How much is A-GAME-01?`) ได้คำตอบภาษาอังกฤษ `1,490 baht` แล้วถามไทยต่อได้คำตอบไทย (พิสูจน์สองภาษาบน production ก่อนเปิด tier ถัดไป)
4. ข้อความทั้งสองฝั่งเห็นใน inbox
5. staff กดรับช่วง (human takeover) แล้ว bot หยุดตอบ · ปิด AI ใน settings แล้ว bot หยุดตอบ

- ลำดับเรียกข้าม lane และเจ้าของแต่ละขั้นอยู่ใน [prompts/README.md](prompts/README.md#core-loop-ลำดับเรียกข้าม-lane) signature อยู่ใน [contracts.ts](docs/competition-plan/templates/contracts.ts)
- A0 และ B0 ตรวจขั้นของคนตัวเองบน production ตั้งแต่ 12:30 แล้วแจ้ง C0
- ผ่าน: C0 โพสต์ `DONE GATE core-loop <sha>` · ไม่ผ่าน: `BLOCKED GATE core-loop step <n> TO:<lane>` แล้ว lane ที่ถูกแท็กหยุดฟีเจอร์ใหม่จนแก้ได้
- gate ผ่านด้วย Demo Chat ได้ แต่ F17 ต้องถึง LINE OA ตัว demo จริงภายใน checkpoint 14:30

## Tier: core ก่อน ส่วนเสริมทีหลัง

| Tier | ฟีเจอร์ | เปิดเร็วสุด | เงื่อนไขเปิด |
|---|---|---|---|
| **P0** core loop (11) | F01, F35, F03, F04, F05, F07, F08, F09 + Demo Chat, F11 (ส่วน takeover = slice 1), F10 (ตอบ + บันทึก trace = slice 1–3), F17 | `SETUP READY` (~10:50) | — |
| **P1** ให้ทีมร้านตรวจคำตอบและจัดการข้อผิดพลาดได้ + ความลึกของ demo (7) | F02, F06, F13, F14, F24, F31 (slice 1: กระดิ่งในแอป), F36 · และ slice สามตัวที่ทำก่อน (ข้อด้านล่าง) | checkpoint 11:30 | checkpoint 1 ผ่าน และ usage ไม่เกิน 20% ต่อคน ไม่งั้นเปิดเมื่อ gate 13:00 ผ่าน |
| **P2** ส่วนเสริม (10) | F12, F15, F16, F22 (เฉพาะรหัสสินค้าจากแชต LINE), F23, F26, F27, **F37, F38, F39** · และส่วนตั้งค่า + web push ของกระดิ่งแจ้งเตือน | gate 13:00 ผ่าน | usage ไม่เกิน 40% ต่อคน ไม่งั้นเช็กใหม่ที่ 14:30 |
| **P3** ของแถม (1) | F30 voice | checkpoint 14:30 | P0 เป็น R, P1 เป็น R/S และ usage ไม่เกิน 55% ต่อคน |

- หัวหน้าเปิด tier ด้วยโพสต์ `LEAD: OPEN P1` (`P2`, `P3`) hook ปลุก lane ที่รออยู่ · lane เริ่มฟีเจอร์ของ tier ที่ยังไม่เปิดไม่ได้ ถ้าว่างให้โพสต์ `NEED TO:<orchestrator> next task` แล้วรอ
- **ข้อยกเว้นสองข้อ:** C3 ทำ F02 (P1) ต่อจาก F03 ได้เลย · C1 เริ่ม F36 เวลา 15:15 ตามนาฬิกา (F39 ที่ค้างให้พัก)
- **สาม slice ของ P1 ที่ทำก่อนงาน P1 อื่น** (ลำดับของ [ข้อเสนอ Endless](docs/competition-plan/ENDLESS-PRIORITY-PROPOSAL.md) ที่ทีมรับแล้ว 21 พ.ย.): B2 หน้า trace ของ F10 (slice 5) · A1 สถานะพนักงาน ว่าง/พัก/นอกเวลา + แจกแชตอัตโนมัติของ F11 (slice 2–3) · C3 กระดิ่งในแอปของ F31 (slice 1) · ทั้งสามเริ่มเมื่อ `LEAD: OPEN P1` และ slice ของ gate ใน lane นั้น merge แล้ว · tier ในตารางนี้นับต่อฟีเจอร์ (F10, F11 ยังเป็น P0 · F31 เป็น P1) ส่วนที่แบ่งเป็น slice เขียนไว้ในวงเล็บ
- **งานเก็บรายละเอียดของ P2 ที่ไม่มี spec** (เลือกทำทีละชิ้นเมื่อเส้นทาง demo เรียบร้อยและหัวหน้าเปิด P2 ไม่นับเป็นฟีเจอร์): responsive polish ข้ามหน้า · กดขยายรูปสินค้า/รูปในแชต · Dark Mode ทั้งแอป · ปัญหาที่กระทบ Demo Chat บนมือถือแก้ใน P0 ไม่รอ P2
- ลำดับตัดเมื่อไม่ทัน (หัวหน้าตัดสินที่ 14:30): F30 → F16 → F23 → F22 → F39 → F12 → F31 ส่วน slice 2–4 (ตั้งค่า + web push) → F26 แต่ **ไม่ตัด F37 และส่วนตัวเลขของ F27** เพราะเป็นหลักฐาน "วัดผลได้" ที่กรรมการถามหา
- **% usage** = ตัวเลขของแต่ละคนที่หน้า chatgpt.com/codex/settings/usage (ดูวิธีนับใน [งบ](#งบ-token-และ-credits)) หัวหน้าโพสต์ `LEAD: BUDGET A <x>% · B <y>% · C <z>%` ที่ 11:30 / 13:00 / 14:30

## เลื่อนออกจากรุ่น LINE-only

คง ID, tier เดิม และแถวรายงานครบ 31 รายการ ให้ F18 Messenger/Instagram (P1) และ F21 คอมเมนต์ (P2) เป็น **U-deferred** รุ่นนี้เว้นการพัฒนา ตั้งค่า provider และสาธิตสองฟีเจอร์นี้

F22 live commerce ยังเป็น **U** ตามหลักฐานปัจจุบัน A2 เริ่มส่วนรหัสสินค้าที่พิมพ์ในแชต LINE → ตะกร้า → ยืนยันออเดอร์ผ่าน F13 ได้เมื่อเปิด P2 ซ่อนเมนูและงดสาธิตจนกว่าจะพิสูจน์เส้นทางครบตาม production bar ส่วนรับคอมเมนต์ผ่าน Meta เลื่อนออกจากรุ่นนี้

## ตัดออกจาก scope

ฟีเจอร์ 8 ตัวนี้ **ไม่ทำและไม่รายงาน** ID เลิกใช้ (ไม่เลื่อนเลข) ไม่มีโฟลเดอร์ ไม่มี contract ไม่มีแถวใน FEATURE_STATUS:

| ID | เดิม | ผลกับระบบที่เหลือ |
|---|---|---|
| F19 | WhatsApp | ใช้ `line` สำหรับลูกค้า และ `web` สำหรับตรวจสอบภายในผ่าน Demo Chat |
| F20 | ประวัติ LINE, OA Manager crawler, session broker | ไม่มี history import ข้อความย้อนหลังไม่มี |
| F25 | ฟอร์มลูกค้า (intake form) | AI ไม่ส่งการ์ดฟอร์ม |
| F28 | แพ็กเกจ, subscription, โควตา | **ใช้ได้ไม่จำกัด** ไม่มี `checkQuota()` / `recordUsage()` · core ยังบันทึก `model_usage` ทุก call เพื่อดูต้นทุน (F27) |
| F29 | billing / ชำระค่าแพ็กเกจ | ไม่มีหน้าชำระค่าแพ็กเกจ (F14 ยังรับเงินจากลูกค้าของร้านแบบ test mode) |
| F32 | help copilot, support, feedback | — |
| F33 | platform admin | ไม่มีหน้าแอดมิน · เครื่องมือ ops ของ F35 ใช้ `requirePlatformAdmin()` ของ core |
| F34 | legal, privacy, PDPA, retention, export/delete | ไม่มีหน้า terms/privacy, consent หรือ data export/delete (คำตอบเรื่อง PDPA สำหรับกรรมการอยู่ใน [docs/pitch/QA-PREP.md](docs/pitch/QA-PREP.md)) |

อธิบาย business model ใน pitch แทนการสร้างหน้า billing

## ที่มาของโค้ด: สร้างจาก spec ไม่เปิดโค้ด Papi

กติกาของงานไทยอนุญาต "personal or open-source projects" และตัดสินเฉพาะงานที่ทำในงาน ไม่พูดถึงโค้ดของบริษัท ส่วนงานประเทศอื่นห้ามโค้ดที่ทำมาก่อนทั้งหมด codebase ของบริษัทไม่ใช่ทั้ง personal และ open source จึงตัดสินใจ ([D1](docs/DECISIONS-2026-11-20.md)):

1. **ค่าเริ่มต้น = สร้างจาก spec จาก repo ว่าง** ไม่มีเครื่องไหนเปิด `../papi-ref` · ความรู้เรื่องพฤติกรรมและกรณีขอบของ Papi ที่ทีมรู้อยู่แล้วถูกเขียนเป็น spec ด้วยคำของเราเอง (ไม่มีโค้ด schema หรือ prompt ที่คัดมา)
2. `../papi-ref` เปิดได้ก็ต่อเมื่อผู้จัดตอบ**เป็นลายลักษณ์อักษร**ว่าใช้โค้ดบริษัทเป็น reference ได้ ([อีเมลถามผู้จัด](docs/pitch/organizer-email.md)) แล้วหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ถึงตอนนั้นก็อ่านอย่างเดียวเพื่อดูพฤติกรรม ไม่คัดโค้ด ([สูตรเตรียม papi-ref](docs/porting/README.md#เตรียม-papi-ref) มีไว้เผื่อกรณีนี้เท่านั้น)
3. **ของที่นำเข้า repo แข่งตอน 10:00 และประกาศเป็น prior work ใน README:** เอกสารวางแผน, spec, prompt, `contracts.ts` (types และ spec ไม่มี implementation), สคริปต์บอร์ด, Codex hooks/config · **ไม่นำเข้า:** `tools/openai-check` (โค้ดทดลองก่อนงาน) และทุกอย่างจาก Papi
4. คำประกาศที่มาของงานสองแบบอยู่ใน [PITCH.md](docs/pitch/PITCH.md) และ [README-TEMPLATE](docs/pitch/README-TEMPLATE.md) · คำตอบของผู้จัดบันทึกใน [SOURCE-BASELINE](docs/competition-plan/templates/SOURCE-BASELINE.md)

## สถาปัตยกรรม

แอปเดียว รันและแก้ได้เร็วในวันงาน โค้ดชุดเดียวกันทั้ง dev และ production:

| ส่วน | ระบบของเรา |
|---|---|
| Server | Node.js 24 + TypeScript ตัวเดียว (Express 5): routes ต่อฟีเจอร์ใน `features/<slug>/routes.ts` |
| งานเบื้องหลัง | job worker ใน process เดียวกันบนตาราง `jobs` ของ PostgreSQL (F35) + scheduler ที่รันบน instance เดียว กันซ้ำด้วย Postgres advisory lock |
| Realtime | WebSocket ใน server เดียวกัน (`/ws`) |
| ไฟล์ | ดิสก์: `var/uploads` ใน dev, Render disk `/var/data/uploads` ใน production |
| Login | อีเมล + รหัสผ่านและ session ของเราเอง (F02) |
| DB | PostgreSQL 17 + pgvector (raw SQL ไม่มี ORM) |
| เว็บ | React 19 + Vite + MUI 9 + i18next (ไทยและอังกฤษครบทุกหน้า ค่าเริ่มต้นตามภาษาเบราว์เซอร์) |
| AI | **OpenAI API อย่างเดียว** ผ่าน `model.*` ของ core: แชต + tool calling, Structured Outputs, embeddings 1536 มิติ, Realtime voice (browser ↔ OpenAI ผ่าน WebRTC, tools รันบน server เรา), ถอดเสียง, vision, moderation |
| ชำระเงิน | PromptPay QR ต่อออเดอร์ที่เราสร้าง payload เอง + ตรวจสลิป (F14) · ไม่มี Omise (ตัดออก 20 พ.ย.) |

**กติกา AI:** ทุก call ไป OpenAI ต้องผ่าน `model.*` ของ core (บันทึก usage และต้นทุน) ห้ามฟีเจอร์ import OpenAI SDK เอง ห้ามใช้ provider อื่น model ID อ่านจาก env ตาม [docs/openai-api.md](docs/openai-api.md) ไม่ hard-code

## ทุกอย่างรันที่ไหน

**ไม่มีเครื่องไหนเป็น production server** production อยู่บน Render เครื่องของแต่ละคนรันเฉพาะ dev ของตัวเอง และเครื่องที่ใช้เตรียมแผนนี้ **ไม่ใช่** เครื่องวันงาน ([D15, D16](docs/DECISIONS-2026-11-20.md) · รายละเอียดและคำสั่งอยู่ใน [docs/day/environments.md](docs/day/environments.md) และ [docs/day/deployment.md](docs/day/deployment.md))

| Environment | รันที่ไหน | Database | OpenAI key | ใช้ทำอะไร |
|---|---|---|---|---|
| Worker lanes (9) | เครื่องของเจ้าของ หนึ่ง worktree ต่อ lane port API 3001–3009 / web 5171–5179 | Neon ของคนนั้น: `nless_hack_<lane>` + `_test` | `app-dev` ของคนนั้น (hard limit US$30) | สร้างและทดสอบฟีเจอร์ |
| Orchestrator (3) | เครื่องของแต่ละคน worktree `a0`/`b0`/`c0` ตาม `origin/main` port 3000 / 5170 | Neon ของคนนั้น: `nless_hack_<a0\|b0\|c0>` | `app-dev` ของคนนั้น | ตรวจ `main` หลัง merge, แก้ข้าม lane |
| CI | GitHub Actions + service container `pgvector/pgvector:pg17` | ชั่วคราว | ไม่มี (`MODEL_MODE=fake`) | typecheck, tests, ownership check ทุก PR |
| **Production** | **Render สิงคโปร์ หนึ่ง web instance deploy เองจาก `main`** | **Render Postgres 17 + pgvector** | **`app-prod` (hard limit US$60)** | กรรมการผ่าน LINE OA ตัว demo · Demo Chat และ gate 13:00 สำหรับตรวจภายใน |
| Production สำรอง | Railway สิงคโปร์ (เตรียมคืนนี้) · สุดท้ายจริง ๆ คือเครื่องของ C + Cloudflare tunnel | Railway pgvector | `app-prod` | เฉพาะเมื่อ Render ล่ม |

- **Dev database = Neon free tier (สิงคโปร์) organization ของทีม `Endless` หนึ่ง project ต่อคน** (C สร้างและเชิญ A, B ทุกคนล็อกอินด้วยบัญชีตัวเอง) ต่อผ่าน **direct endpoint** (ไม่ผ่าน pooler) เพื่อให้ advisory lock และ prepared statement ใช้ได้ pool ไม่เกิน 5 ต่อ process · สำรอง: PostgreSQL 16 + pgvector ใน WSL2
- **Webhook:** LINE มีสอง channel: *NLess Demo* ชี้ production ตั้งแต่ ~12:00 (QR ของ OA นี้คือที่กรรมการสแกน ห้ามชี้เข้าเครื่องใคร) และ *NLess Dev* ชี้ tunnel ของ C2 · Google OAuth ลงทะเบียน redirect ของทุก lane และของ production
- **ใครถืออะไร (แชร์ทรัพยากร ไม่แชร์ login, [environments.md §6](docs/day/environments.md)):** C ถือ Render, Railway, ตัวแปรของ production, LINE Demo channel, tunnel และเป็น Admin ของ Neon org · หัวหน้าถือ key `app-prod` · แต่ละคนถือ key `app-dev`, project Neon ของตัวเอง และค่าบอร์ดใน `..\nless.secrets.env` บนเครื่องตัวเอง (พิมพ์เอง ไม่ส่งผ่านแชตหรือ git)
- **ข้อมูล production:** migration รันใน `preDeployCommand` ทุก deploy · ร้านสังเคราะห์สองร้าน seed ด้วยคำสั่งครั้งเดียวหลัง deploy แรก · หน้า ops มี "demo reset" คืนค่าก่อนกรรมการมา · `pg_dump` สำรองตอน 16:45

## แบ่งคนและ lanes

ทุกคนทำทั้งหน้าเว็บและ server ของฟีเจอร์ตัวเอง C ควรเป็นคนที่ถนัด backend, setup และ deploy ที่สุด แต่ละคนเปิด **4 chat ในแอป ChatGPT (Codex)**: orchestrator 1 + worker 3 ([วิธีตั้งแอป](docs/day/chatgpt-app-setup.md))

| | **C: platform, ช่องทาง, ตั้งค่าและสิทธิ์** | **B: ความรู้ + AI** | **A: inbox, ขาย, ลูกค้า** |
|---|---|---|---|
| **Orchestrator** | **C0** + ตรวจ gate 13:00 + ดูแล production | **B0** + คุณภาพคำตอบ AI ทั้งระบบ | **A0** + เส้นทาง demo ที่กรรมการเห็น |
| **Lane 1** | C1: F01 setup + deploy (P0) → F35 jobs/ops (P0) → F39 ChatGPT-ready catalog (P2) → F36 release (P1, 15:15) | B1: F05 คลังความรู้ (P0) → F07 ค้นหา (P0) → F08 สินค้า (P0) → F37 AI evals (P2) | A1: F09 inbox + Demo Chat (P0) → F11 คนรับช่วง (P0) → F12 template ข้อความ (P2) → F23 broadcast (P2) |
| **Lane 2** | C2: F17 LINE (P0) · F18/F21 U-deferred | B2: F10 AI ตอบ (P0) → benchmark Decisions API หลัง gate ผ่านและงาน F10 P1 เสร็จ (25 นาที, classifier เดิม live) → F38 follow-up nudges (P2) → F30 voice (P3) | A2: F13 orders (P1) → F14 QR + ตรวจสลิป (P1) → F22 รหัสสินค้าจากแชต LINE (P2, สถานะปัจจุบัน U) |
| **Lane 3** | C3: F04 ตั้งค่าร้าน (P0) → F03 ร้านและสิทธิ์ (P0) → F02 login (P1) → F31 แจ้งเตือน (P1) | B3: F06 นำเข้าไฟล์ (P1) → F26 insights (P2) → F27 dashboard + ผลลัพธ์ของร้าน (P2) | A3: F24 ลูกค้าและ tags (P1) → F15 จองนัด (P2) → F16 ปฏิทิน (P2) |

ลำดับใน lane คือลำดับทำงาน ชื่อโฟลเดอร์ (`slug`) และนาทีงานของแต่ละฟีเจอร์อยู่ใน [backlog](docs/competition-plan/feature-backlog.csv) และ [ดัชนี spec](docs/specs/README.md)

### สมดุลงานและต้นทุนต่อคน

นาทีงานค่ากลางจาก backlog (low–high ÷ 2) และประมาณการ Codex ต่อคน (ไม่ใช่ตัวเลขทางการ วิธีคิดอยู่ใน [budget-and-priority.md](docs/budget-and-priority.md)):

| คน | Lane 1 | Lane 2 | Lane 3 | **รวมนาทีงาน** | เทียบค่าเฉลี่ย 867.5 | Codex โดยประมาณ |
|---|---|---|---|---|---|---|
| A | A1 300 | A2 300 | A3 255 | **855** | −1.4% | ~3,190 credits (≈US$127) |
| B | B1 285 | B2 330 | B3 277.5 | **892.5** | +2.9% | ~3,390 credits (≈US$136) |
| C | C1 352.5 | C2 270 | C3 232.5 | **855** | −1.4% | ~3,460 credits (≈US$139) |

- เวลา: ทั้งสามคนอยู่ในช่วง ±5% ของค่าเฉลี่ย ([D4, D17](docs/DECISIONS-2026-11-20.md))
- ต้นทุน: ทุกคนรัน session ชุดเดียวกัน (orchestrator effort high + worker 3 ตัว effort medium) จึงเท่ากันโดยโครงสร้าง ส่วนต่างมาจาก Fast mode ของ worker ก่อน 13:00 จึงกำหนด lane ที่เปิด Fast ได้เป็น **A1 · B1, B2 · C1, C2** เท่านั้น (ต้นทุนสามคนต่างกันไม่เกิน ±5%) ถ้า usage ของใครถึง 40% ให้ปิด Fast ก่อน
- ทุกคนใช้ Pro included usage ก่อน แล้วจึงใช้ Codex credits US$100 ของตัวเอง · API credits แบ่งเท่ากัน: dev ใช้ key `app-dev` ของแต่ละคน (US$30) และ production ใช้ key `app-prod` ตัวเดียว (US$60)

**เปลี่ยนจากฉบับบ่าย 20 พ.ย.:** มี orchestrator ต่อคน (เดิมไม่มี) · F37 อยู่ B1, F38 อยู่ B2, F39 อยู่ C1 และเป็น P2 · gate ตรวจโดย C0 บน production · ไม่มี lane ไหนอ่าน `../papi-ref` · lane ที่ไม่มีงาน P0 (A2, A3, B3) อ่าน spec และวางแผนจนกว่าหัวหน้าโพสต์ `LEAD: OPEN P1`

**ถ้าฟีเจอร์ถัดไปยังติด dependency:** ใช้ fake ของ contract ไปก่อน ถ้าติดตารางของฟีเจอร์อื่น ทำตัวถัดไปที่พร้อมก่อนแล้วโพสต์ `NEED`

### Orchestrator ทำอะไร

- อ่าน spec และบอร์ด มอบงานถัดไปให้ worker ด้วย `TASK TO:<lane> …` (ปลุก worker ผ่าน Stop hook) ปลด block ของ lane ตัวเอง
- ตรวจงานที่ merge แล้วเทียบกับ acceptance ใน spec รัน integration บน worktree ที่ตาม `origin/main` และ Playwright smoke กับ production
- แก้บั๊กข้าม lane ได้ตามกติกา [D5](docs/DECISIONS-2026-11-20.md): เล็ก (ไม่เกิน ~40 บรรทัด ไม่เปลี่ยน contract ไม่แตะ migration), โพสต์ `FIX <lane เจ้าของ> …` ก่อนแล้วรอ 5 นาที (ไม่รอถ้า `main`/production พัง), ใช้ branch `fix/<lane เจ้าของ>/<slug>` พร้อม test, จบด้วย `DONE FIX`
- โพสต์ `STAGE <คน> <สรุป>` ทุก 30 นาที ดู usage ของคนตัวเอง คุยกับ orchestrator อีกสองตัวและหัวหน้า
- ใช้ sub-agent **อ่านอย่างเดียว** ได้ (สำรวจ, ไล่ test ที่ล้ม, review diff) ห้ามใช้ sub-agent เขียนโค้ดใน worktree เดียวกัน
- หัวหน้าทีม (หนึ่งใน A/B/C) ยังเป็นคนเปิด tier โพสต์ BUDGET/FREEZE และย้ายฟีเจอร์ข้าม lane

Prompt ทั้งวันของ orchestrator แต่ละตัวอยู่ใน [prompts/orchestrators/](prompts/README.md#ไฟล์ในชุด)

### Model และ effort ของ Codex ต่อประเภทงาน

ทุก session ใช้ `gpt-6.2-sol` **ไม่ใช้ Astra ไม่ใช้ effort `ultra`** ([D3](docs/DECISIONS-2026-11-20.md)):

| งาน | Effort | Fast mode |
|---|---|---|
| Orchestrator: วางแผน มอบงาน ตรวจ ทดสอบรวม | high | เปิดเฉพาะตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| C1 setup (ทุกคนรอ) | medium | **เปิด** |
| Worker สร้างฟีเจอร์ | medium | เปิดเฉพาะ A1, B1, B2, C1, C2 ก่อน gate 13:00 และ usage ของคนนั้นยังไม่ถึง 40% |
| งานกล (i18n, seed, fixture, rename, เอกสาร) | low | ปิด |
| Sub-agent อ่านอย่างเดียว | low | ตาม parent (ปิด Fast ของ parent ก่อนเปิดหลายตัว) |
| Debug ยาก (ติดเกิน 20 นาที) | xhigh | เปิด |
| ยังติดเกิน 45 นาที | max (ทีละ session) | เปิด |

## กติกากัน merge conflict

```
server/src/core/                 ← C1 เท่านั้น (DB, config, base schema, auth guard, jobs, model wrapper ของ OpenAI, channel registry, เปิด server)
server/src/features/<slug>/      ← เจ้าของฟีเจอร์ (routes, service, migrations, tests)
web/src/core/                    ← C1 เท่านั้น (layout, เมนู, API client, theme, UI kit)
web/src/features/<slug>/         ← เจ้าของฟีเจอร์ (หน้าเว็บ, ข้อความ th/en, e2e smoke)
shared/features/<slug>/          ← เจ้าของฟีเจอร์ (types และ validation)
```

1. **หนึ่งฟีเจอร์ หนึ่งโฟลเดอร์ หนึ่งเจ้าของ** มีแค่เจ้าของที่แก้ได้ (F01 `core` และ F35 `core/jobs` อยู่ใน `server/src/core`)
2. **routes และหน้าเว็บโหลดอัตโนมัติ** จาก `features/*/routes.ts` และ `features/*/pages.tsx` ไม่มีใครแก้ไฟล์ routes หรือเมนูกลาง
3. **C1 สร้างโฟลเดอร์ของทุกฟีเจอร์ใน scope ตอน setup** (29 โฟลเดอร์ + core + core/jobs) พร้อม placeholder และ fake ของทุก contract แล้วไม่แตะอีก
4. **ติดตั้ง library ทั้งวันตอน setup** คนอื่นไม่แก้ `package.json` หรือ lockfile ถ้าต้องการเพิ่ม ให้โพสต์ `NEED TO:C1`
5. **migrations อยู่ในโฟลเดอร์ฟีเจอร์** แต่ละฟีเจอร์ประกาศว่าพึ่งฟีเจอร์ไหน ตัวรันเรียงลำดับจากตรงนั้น · migration ที่ merge แล้วห้ามแก้ (production รันทุก deploy)
6. **เรียกข้ามฟีเจอร์ผ่าน `service.ts` เท่านั้น** ห้าม import ไฟล์ข้างในหรืออ่านตารางของฟีเจอร์อื่น
7. **ไม่มีไฟล์ types รวม ไม่มีไฟล์ภาษารวม** ทุกอย่างแยกตามฟีเจอร์
8. **ทุก PR ผ่าน check ว่าแก้เฉพาะโฟลเดอร์ของ lane ตัวเอง** ถ้าผ่าน check และ test ให้ **merge เองเข้า `main` ได้เลย**
9. **หนึ่ง lane หนึ่ง worktree** แต่ละ PR แตก branch `lane/<LANE>/<slug>` ใหม่จาก `main` ล่าสุด · orchestrator ใช้ `fix/<lane เจ้าของ>/<slug>` เท่านั้น (CI ใช้กติกา path ของ lane เจ้าของ ต้องมี test และจำกัด 40 บรรทัดนอก test)

## ฟังก์ชันที่เรียกข้ามคน (contracts)

คนต้องรอกันเฉพาะผ่านฟังก์ชันชุดนี้ signature อยู่ใน [contracts.ts](docs/competition-plan/templates/contracts.ts) และห้ามเปลี่ยนรูปแบบในวันงาน ถ้าจำเป็นให้โพสต์ `CHANGE`

| ฟังก์ชัน | เจ้าของ | ผู้ใช้ |
|---|---|---|
| `getUser()`, `getBusiness()`, `requirePermission()` | C1 (core) | ทุก lane |
| `db`, `jobs.enqueue()`, `model.*` ของ OpenAI (chat, embed, transcribe, moderate, realtime session — บันทึก usage ทุกครั้ง), `storage`, `audit()`, `publish()` | C1 (core) | ทุก lane |
| `sendToCustomer(conversationId, parts)`, `registerChannelSender(channel, sender)` | C1 (core: registry + sender `web` ของ Demo Chat) | B2, A1, C2 · C2 register `line` |
| สมาชิก, คำเชิญ, บทบาท (F03 tenancy) | C3 | core ใช้ตรวจสิทธิ์ผ่านตาราง memberships |
| `saveMessage()`, `getConversation()`, `getHistory()` | A1 inbox | C2 ช่องทาง, B2 AI, B2 voice, B1 evals |
| `isHumanTakeover(conversationId)`, `assignConversation(conversationId, userId \| null)` | A1 team | B2 AI, C2 ช่องทาง |
| `renderTemplate(templateId, vars)` → `MessagePart[]` | A1 message-templates | A1 broadcast, B2 AI |
| `generateReply(conversationId)` | B2 AI | job ตอบแชตของ B2, B2 voice, A1 (ร่างคำตอบ), B1 evals |
| `getAiTurnMetrics()`, `getFollowUpMetrics()` | B2 | B3 analytics |
| `searchKnowledge(businessId, query)` | B1 knowledge-search | B2 AI, B2 voice |
| `getProduct()`, `getPrice()`, `listCatalogItems()` | B1 catalog | A2 orders, A2 live codes, B2 AI, C1 ChatGPT-ready catalog |
| `getBusinessSettings(businessId)` → `{ aiEnabled, timezone, hours, answerPolicy, language }` | C3 business-settings | B2 AI, C2 ช่องทาง, A3 booking |
| `createOrderFromProposal()`, `listOrdersByCustomer()`, `getOrderMetrics()` | A2 orders | B2 AI tools และ follow-ups, C1 MCP, B3 analytics |
| `analyzeSlip()` | A2 payments | B1 evals |
| `findSlots()`, `createBooking()` | A3 booking | B2 AI tools |
| `getCustomer()`, `listCustomersByTags()` | A3 crm | A1 broadcast, B3 insights |
| `notify()` | C3 notifications | ทุก lane |

## คอขวดเดียว: setup ของ C1

ทุก lane ต้องรอ setup ของ C1 ก่อน prompt อยู่ที่ [prompts/C1-setup.md](prompts/C1-setup.md) และแบบสร้างเต็มอยู่ที่ [docs/specs/F01-core.md](docs/specs/F01-core.md):

- C1 พิมพ์บรรทัดเปิด chat ~10:05 ([START.md](START.md)) ตั้งเป้า `SETUP READY` ใน 45 นาที (~10:50) ช้าสุด 55 นาที (11:00) (chat ของ C1: effort medium + Fast เปิด) และ **ซ้อมจากโฟลเดอร์ว่างแล้วจับเวลาคืนนี้**
- setup ส่ง: core ของ server/web, โฟลเดอร์ทุกฟีเจอร์พร้อม placeholder, auto-load routes/pages, ตัวรัน migration, library ทั้งวัน, ownership check ใน CI (รวมกติกา `fix/`), `.env.example`, **model wrapper ของ OpenAI** (มี fake mode), UI kit, feature flags, Playwright fixture ร่วม และ rate limit ของ core
- **base schema ของตารางกลาง** เพื่อให้ migration ของทุกฟีเจอร์อ้าง FK ได้ทันที · **fake ของทุก contract** · **dev login ชั่วคราว** (บน production ต้องมี token และปิดเมื่อ F02 merge) · seed ร้าน A/B ตาม [SPEC ข้อ 5](docs/competition-plan/templates/SPEC.md)
- **ขั้น S9 หลัง `SETUP READY`: deploy production ครั้งแรกภายใน 11:30** (`Dockerfile`, `render.yaml`, `/healthz`) ร่วมกับคน C ที่ถือบัญชี Render ([deployment.md](docs/day/deployment.md))
- ระหว่างรอ setup lanes อื่น **อ่าน spec ของฟีเจอร์แรกแล้วทำแผน** ห้ามเขียนโค้ดก่อน `SETUP READY`

## ตารางเวลา

| เวลา | สิ่งที่เกิดขึ้น |
|---|---|
| 08:30–10:00 | ลงทะเบียน เปิดเครื่อง ต่อ hotspot สำรอง เปิด dashboard · หัวหน้าเช็กคำตอบผู้จัดเรื่องโค้ดบริษัท (ไม่มีคำตอบเป็นลายลักษณ์อักษร = `../papi-ref` ปิดทั้งวัน) |
| 10:00–10:15 | ทุกคนพิมพ์บรรทัด Day ของ [START.md](START.md) ในแอป: เครื่องของ C copy baseline เข้า repo แข่งแล้ว push เครื่องของทุกคนสร้าง worktree 4 ตัวและพิมพ์บรรทัดเดียวของแต่ละ chat · เพิ่ม worktree เป็น project ในแอป เปิด chat ตั้ง model/effort · **C เริ่ม C1-setup ~10:05** |
| 10:15 | ทุกคนเปิด chat ของ orchestrator และ worker 3 ตัวด้วยบรรทัดเดียวที่ `start-day.ps1` พิมพ์ให้ ([START.md](START.md) ไม่ต้องวาง prompt ทั้งก้อน) · worker อ่าน spec และทำแผน · orchestrator ตรวจสภาพแวดล้อมและบอร์ด |
| ~10:50 | C1 โพสต์ `SETUP READY <sha>` (ช้าสุด 11:00) · lane ที่ฟีเจอร์แรกเป็น P0 (C1, C2, C3, B1, B2, A1) เริ่มเขียนโค้ด · A2, A3, B3 เตรียม env แล้วรอ `LEAD: OPEN P1` · ทุก lane merge ทุก 30–45 นาที |
| **11:30** | **Checkpoint 1:** production ตอบ `/healthz` แล้ว · ทุก lane ที่ทำ P0 merge PR แรกแล้วหรือโพสต์ `BLOCKED` · dev login, base schema, fakes และ `model.chat()` ของจริงใช้ได้บน `main` · หัวหน้าโพสต์ `LEAD: BUDGET` แล้ว `LEAD: OPEN P1` ถ้าผ่านเงื่อนไข |
| ~12:00 | C สลับ webhook ของ LINE *NLess Demo* ไป production · C0 seed ร้านสังเคราะห์บน production |
| 12:30 | working lunch: คนผลัดกันพัก Codex ทำงานต่อ · A0/B0 เริ่มตรวจขั้นของตัวเองบน production |
| **13:00** | **CORE-LOOP GATE** ([5 ขั้น](#mvp-golden-path-และ-core-loop-gate)) C0 ตรวจบน production และโพสต์ผล · ผ่านแล้วหัวหน้าโพสต์ `LEAD: BUDGET` และ `LEAD: OPEN` P1/P2 ตามเงื่อนไข |
| **14:30** | **Checkpoint 3:** golden path เป็น R รวม F17 ถึง LINE OA ตัว demo จริง · ล็อก [demo loop](docs/pitch/demo-loop.md) · หัวหน้าตัดสินว่าตัดฟีเจอร์ไหน และ `LEAD: OPEN P3` ถ้าผ่านเงื่อนไข · `EVIDENCE.md` ทุกฟีเจอร์มีสถานะรอบแรก |
| 15:15 | C1 เริ่ม F36 release + รวมหลักฐาน |
| **15:30** | หัวหน้าโพสต์ `LEAD: FREEZE` หยุดเพิ่มฟีเจอร์ · slice ที่ผ่าน test merge ได้ถึง 15:50 · **ซ่อนฟีเจอร์ที่ไม่ถึง R จากเมนู** |
| 15:30–16:30 | orchestrator ทั้งสามทดสอบทั้งระบบบน production ตาม [quality-bar.md](docs/day/quality-bar.md) (ทางเดินของกรรมการบนมือถือ, ความเร็ว, security review, ข้อมูล demo) แก้เฉพาะบั๊ก · รัน real eval หนึ่งรอบ (F37) และกรอกตัวเลขลง pitch |
| 16:30 | อัดวิดีโอ demo 2–3 นาทีเสร็จ ([VIDEO-SCRIPT](docs/pitch/VIDEO-SCRIPT.md)) · เปิด uptime monitor ที่ `/healthz` |
| **16:45** | **deploy freeze** (ห้าม merge เข้า `main` อีก) · `pg_dump` production · ส่งงาน ([SUBMISSION-CHECKLIST](docs/pitch/SUBMISSION-CHECKLIST.md)) |
| **17:00** | **code freeze ของผู้จัด** · warm แอป (เปิด voice หนึ่ง session, ส่ง LINE หนึ่งข้อความ, upload หนึ่งไฟล์, ทีมถาม Demo Chat หนึ่งคำถามเพื่อตรวจภายใน) · demo reset · ซ้อม demo loop หนึ่งรอบ |
| 17:15 | **Round 1:** กรรมการเดินมาที่โต๊ะ แอป warm แล้ว ให้กรรมการสแกน QR ของ LINE OA เท่านั้น ถ้า LINE ใช้ไม่ได้ ให้บอกตามจริงหรือเปิดวิดีโอที่ติดป้าย RECORDED และบันทึกจากการทดสอบ LINE ที่ผ่านแล้ว |
| 19:30 | finalists: pitch ภาษาอังกฤษบนเวทีตาม [PITCH.md](docs/pitch/PITCH.md) |
| 20:30 | ประกาศรางวัล |

ระหว่างวันแต่ละฟีเจอร์บันทึกสถานะใน `EVIDENCE.md` ของโฟลเดอร์ตัวเอง และโพสต์ `STATUS` ให้การ์ดของ lane บน dashboard ตรง ตอนจบ C1 (F36) รวมทุกฟีเจอร์ตามจริงลง [FEATURE_STATUS](docs/competition-plan/templates/FEATURE_STATUS.csv) ห้ามนับหน้าที่กดแล้วไม่มีผลว่าเสร็จ · สิ่งที่อาจพังและวิธีรับมืออยู่ใน [failure-drills.md](docs/day/failure-drills.md)

## บอร์ดสื่อสาร: GitHub issue + ChatGPT Sites (ส่วนเสริม)

### หลักการ

เหมือนกลุ่มแชตของทีมที่สมาชิกเป็น Codex ทั้ง 12 ตัว แต่มีหน้า dashboard ให้คนเห็นภาพรวม:

- **ขั้นต่ำที่ต้องมีคือ GitHub issue ที่ปักหมุดใน repo แข่ง** (ใช้แค่ `gh` ที่ล็อกอินแล้ว ไม่มี service หรือค่าลับเพิ่ม) สคริปต์บอร์ดทำงานครบด้วย issue อย่างเดียว · dashboard ด้านล่างเป็นส่วนเสริมสำหรับให้คนเห็นภาพรวม ใช้เมื่อ site พร้อมและตั้งค่า `SITES_*` แล้วเท่านั้น ([START.md ข้อ 4](START.md))
- **dashboard** คือเว็บส่วนตัวบน **ChatGPT Sites** ที่เพื่อน (มี ChatGPT subscription) สร้างและ host ก่อนวันงาน แชร์ให้ 3 บัญชีของทีมเท่านั้น เก็บข้อมูลใน D1 database ของ site ([spec ของ dashboard](docs/board/sites-dashboard.md))
- **สิ่งที่เห็นบน dashboard:** แถบ stage ของทีม (Setup → P0 → Gate → P1/P2 → Freeze → Demo), การ์ดคน 3 ใบ (จาก `STAGE` ของ orchestrator), การ์ด lane 12 ใบ (ฟีเจอร์ที่ทำอยู่, tier, สถานะ R/S/A/U, อัปเดตล่าสุด, SHA ล่าสุด, ติดหรือไม่), % usage ต่อคน และ feed ข้อความ
- **ตัวเขียนตัวเดียวคือสคริปต์บอร์ด ไม่ใช่ AI:** ทุก session เรียก `tools/team-board.ps1 post ...` / `status ...` / `stage ...` สคริปต์โพสต์ลง **GitHub issue ที่ปักหมุด** เสมอ และเขียนลง Sites dashboard ด้วยเฉพาะเมื่อตั้งค่า `SITES_*` ทั้งสามตัวไว้
- **การอ่าน** (hooks, โหมดรอ) ใช้แหล่งตาม `BOARD_SOURCE`: `start-day.ps1` ตั้ง `BOARD_SOURCE=github` ในไฟล์ secrets ของทุกเครื่อง (ทางหลักตาม [START.md ข้อ 4](START.md)) · ทีมที่ตั้ง Sites ไว้และอยากอ่านจาก dashboard ตั้ง `BOARD_SOURCE=sites` เอง (Sites ล่มหรือ error สคริปต์สลับไปอ่าน GitHub อัตโนมัติ)
- **Codex hooks** ปลุก agent เมื่อมีโพสต์ถึง lane ของตัวเอง · orchestrator ถูกปลุกด้วยโพสต์ `DONE` / `BLOCKED` / `NEED` / `FIX` / `CHANGE` ของ worker ทั้งสามของตัวเอง และทุก 30 นาทีเพื่อโพสต์ `STAGE`

```
 A1 (Inbox)                 GitHub issue (+ Sites ถ้าตั้งไว้)       C2 (LINE)
 merge inbox เสร็จ                                                  ทำส่วนที่ทำได้เสร็จ กำลังจะหยุด
 board post ──────────────► "DONE F09 inbox                        Stop hook: รอบนบอร์ด (เช็คทุก 30 วิ)
                             saveMessage() ใช้ได้แล้ว
                             TO:C2" ──────────────────────────────► hook เจอ TO:C2 → สั่ง Codex ทำต่อ
        │                                                           ดึง main → ใช้ของจริงแทน fake → merge
        ▼
 A0 (orchestrator) ถูกปลุกด้วย DONE ของ A1 → ตรวจเทียบ spec บน main และ production
 → "TASK TO:A1 F11 slice 1 takeover" → hook ปลุก A1 ทำงานถัดไป
```

### API ของ dashboard และการยืนยันตัว (ส่วนเสริม ใช้เมื่อตั้ง `SITES_*` เท่านั้น)

- route บน site: `POST /api/posts`, `GET /api/posts?after=<id>&to=<lane>`, `PUT /api/lanes/<lane>`, `GET /api/lanes`, `PUT /api/people/<A|B|C>`, `GET /api/people`
- สคริปต์ส่ง header `OAI-Sites-Authorization: Bearer <SIWC bypass token>` และ `Authorization: Bearer <BOARD_SECRET>` ทั้งสองค่าอยู่ใน `..\nless.secrets.env` (`SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET`) เท่านั้น ห้ามอยู่ใน git หรือโพสต์
- เอกสาร Sites ยืนยันว่ามี D1, แชร์แบบส่วนตัว และ bypass token สำหรับ script แต่ **ไม่ได้เขียนชัดว่า script ภายนอก POST เข้า API ของ site ได้** จึง **ต้องทดสอบคืนนี้จากเครื่องวันงานทั้ง 3 เครื่อง** ถ้าไม่ผ่าน ตั้ง `BOARD_SOURCE=github` แล้วใช้ GitHub board
- การสร้าง site ก่อนวันงานคือการเตรียมเครื่องมือของทีม ไม่ใช่โค้ดแอป ให้บันทึกใน [SOURCE-BASELINE](docs/competition-plan/templates/SOURCE-BASELINE.md)

### ชื่อ การแท็ก และประเภทโพสต์

- **ชื่อ agent = ชื่อ lane** (`A0`…`C3`) สคริปต์ขึ้นต้นโพสต์เป็น `[B2/Codex]`
- **แท็ก lane:** `TO:B2` · **แท็กคน:** `@login` จริงเท่านั้น ไม่ใช้ `@all`

| ประเภทโพสต์ | ใคร | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|---|
| `DONE` | worker | merge ฟีเจอร์หรือ contract แล้ว | `DONE F09 inbox merged abc123. saveMessage() ใช้ได้แล้ว TO:C2 TO:B2` |
| `STATUS` | ทุก session | เริ่ม จบ หรือติดฟีเจอร์ (การ์ด lane ไม่ปลุกใคร) | `STATUS A1 F11 S takeover ใช้ได้ assign ยังเป็น fake` |
| `STAGE` | orchestrator | ทุก 30 นาที (การ์ดคน ไม่ปลุกใคร) | `STAGE A done F09 · doing F11 takeover, F13 propose · blocked - · next F14` |
| `TASK` | orchestrator → worker ของตัวเอง | มอบงานถัดไป | `TASK TO:A2 F14 slice 1 payment request + QR (spec §14)` |
| `NEED` | ทุก session | ขอของจาก lane อื่น หรือของานถัดไป | `NEED TO:C1 ขอเพิ่ม library pdf-parse` · `NEED TO:A0 next task · เสร็จแล้ว: F24` |
| `CHANGE` | ทุก session | ขอเปลี่ยน contract | `CHANGE TO:A1 saveMessage() ควรคืน messageId ด้วย` |
| `FIX TO:<lane>` | ทุก session | แจ้งบั๊กให้เจ้าของแก้ | `FIX TO:B1 getPrice คืน null เมื่อ sku ตัวเล็ก · catalog/service.ts · ถาม a-game-01` |
| `FIX <lane>` / `DONE FIX` | orchestrator | ประกาศก่อนแก้ข้าม lane / แจ้งหลัง merge | `FIX B1 catalog/service.ts sku case ทำ gate ขั้น 3 พัง` |
| `BLOCKED` | ทุก session | ติดและต้องให้คนหรือ lane อื่นปลด | `BLOCKED @lead LINE OA ทดสอบรับข้อความไม่ได้` |
| `SETUP READY` | C1 | lane ที่มีงาน P0 เริ่มได้ | `SETUP READY abc123` |
| `DONE GATE` / `BLOCKED GATE` | C0 | ผล gate 13:00 | `BLOCKED GATE core-loop step 3 TO:B2` |
| `DEPLOY FREEZE` | C0 | 16:45 ห้าม merge เข้า `main` อีก (ปลุกทุก lane) | `DEPLOY FREEZE ห้าม merge หรือ push เข้า main` |
| `LEAD: OPEN P1` (`P2`, `P3`) | หัวหน้า | เปิด tier ถัดไป | `LEAD: OPEN P2 gate ผ่านแล้ว usage A 31% B 36% C 28%` |
| `LEAD: BUDGET` · `LEAD: FREEZE` · `LEAD: PAPI-REF OPEN` | หัวหน้า | แจ้ง usage · หยุดเพิ่มฟีเจอร์ · อนุญาตอ่าน `../papi-ref` | `LEAD: BUDGET A 18% · B 22% · C 25%` |

### Codex hooks

Codex ในแอป ChatGPT และ CLI มี hooks ([เอกสาร](https://learn.chatgpt.com/docs/hooks)) ไฟล์อยู่ที่ `.codex/hooks.json` ใน repo แข่ง ([วิธีตั้งและทดสอบ](docs/competition-plan/templates/codex/README.md))

| Hook | ทำงานตอน | ทำอะไร |
|---|---|---|
| `SessionStart` | เปิด session | ใส่โพสต์ที่ส่งถึง lane นี้ให้ Codex อ่าน |
| `UserPromptSubmit` | คนพิมพ์สั่ง | แนบโพสต์ใหม่ที่ส่งถึง lane นี้ไปกับคำสั่ง |
| `Stop` | Codex กำลังจะหยุด | รอบนบอร์ด ถ้ามีโพสต์ถึง lane ให้ตอบ `{"decision":"block","reason":"<โพสต์>"}` แล้ว Codex จะทำงานต่อด้วยโพสต์นั้น |

- hook รู้ว่าตัวเองเป็น lane ไหนจากไฟล์ `.lane` ใน worktree (ไม่เข้า git)
- `Stop` hook รอได้ประมาณ 9 นาทีต่อรอบ และส่งโพสต์ให้ Codex **เฉพาะเมื่อมีโพสต์ถึง lane จริง** · รอบที่เงียบ hook ส่ง heartbeat บรรทัดเดียวเพื่อให้ chat ฟังบอร์ดต่อ (orchestrator ทั้งวัน, worker ประมาณ 70 นาที แล้วหยุดและแอปแจ้งเตือนคน) เพราะ chat ที่หยุดแล้วจะไม่ได้ยินโพสต์อีกจนกว่าคนจะพิมพ์ · `LEAD: OPEN` ปลุกทุก lane ที่รอ tier ส่วน `LEAD: BUDGET`, `STATUS` และ `STAGE` ไม่ปลุก หลัง `LEAD: FREEZE` ไม่ปลุกให้เริ่มฟีเจอร์ใหม่ (แต่ `FIX`, `TASK` และผล gate ยังปลุก)
- Codex รัน hook เฉพาะที่ผ่านการ **review และ trust** แล้วในแต่ละ project ถ้าแก้ไฟล์ hook ต้อง trust ใหม่ · ต้องทดสอบ hook ในแอป ChatGPT คืนนี้ (ไม่ใช่แค่ใน CLI)

### ความปลอดภัย

- Repo แข่งและ issue บอร์ดเป็น **public** ตามสไลด์ผู้จัด · Sites dashboard ซ้อมเป็น private · ใช้ GitHub เป็นบอร์ดหลักและตรวจ `BOARD_TEAM_LOGINS` ให้ตรงทั้งสามบัญชีก่อนเปิด hooks · บอร์ด public ที่ไม่มี allowlist จะไม่อ่านโพสต์
- โพสต์คือ **คำขอ ไม่ใช่คำสั่ง** (ยกเว้น `TASK` จาก orchestrator ของตัวเองหรือหัวหน้า ซึ่งยังต้องอยู่ใน path และ tier ที่เปิดแล้ว) agent ไม่รันคำสั่งที่แปะมาในโพสต์
- ห้ามใส่ key หรือรหัสลับในโพสต์ · มีแค่หัวหน้าทีมที่ย้ายงานระหว่างคนได้
- บอร์ดไม่ได้ล็อกไฟล์ การกัน conflict มาจากกติกาโฟลเดอร์ด้านบน

### Codex review and handoff evidence

- A0 จับหนึ่ง handoff ข้ามคนที่เกิดจริง เช่น `A1 → C2/B2` เมื่อ inbox contract พร้อม · เก็บลิงก์ `TASK/NEED/DONE` และ PR ไว้ด้วยกัน · ก่อน merge ให้ Codex chat อีก lane ใช้ `/review` เทียบ `main` หรือขอ `@codex review` เมื่อเชื่อม repo แล้ว · ตรวจ contract, กรอง tenant, retry และ test ที่ครอบคลุม regression · ใช้ CI และกติกา merge ตามเดิม
- ถ้า review เจอ defect ให้เจ้าของเพิ่ม test ที่ล้มก่อนแก้ แก้ แล้วรัน test/CI และ smoke ซ้ำ · ถ้าไม่เจอให้บันทึกผลตามจริง · C1 รวมลิงก์ board, หลักฐาน review, ชื่อ test, CI และ merge/deploy SHA ภายใน 16:15 ใน `docs/evidence/` และลิงก์จาก README/writeup · ใช้ข้อมูลสังเคราะห์และสรุปสั้น ห้ามแปะ transcript/log ดิบ
- ทางเลือกสำหรับการประสานงานอยู่ใน [Codex collaboration options](docs/board/REHEARSAL-REVIEW-2026-11-20.md#codex-collaboration-options) · ใช้ subagents อ่านและตรวจภายใน chat ของแต่ละคน ส่วนงานข้ามคนผ่าน GitHub issue และ PR
- **A0 ใช้ Codex `@Browser` หลัง core-loop gate** เดิน Demo Chat ที่ขนาดมือถือทั้งไทยและอังกฤษ ตรวจราคาจาก catalog, คำขอส่วนลดที่ร้านไม่อนุญาต และการส่งต่อให้พนักงาน · บันทึกผลจริง ถ้าเจอบั๊กให้แนบ browser annotation หรือภาพที่ไม่มีข้อมูลส่วนตัวใน issue แล้วเพิ่ม Playwright regression ที่ lane เจ้าของ · ตรวจ LINE บนมือถือจริงตามเดิม ([quality bar](docs/day/quality-bar.md#1-ทางเดินของกรรมการบนมือถือ-a0--1430-และ-1600))
- หลัง gate เมื่อ C1 มีเวลา ให้รวมขั้น smoke และ evidence ที่มีแล้วเป็น skill ของ repo ที่ `.agents/skills/endless-smoke/SKILL.md` ใช้คำสั่งเดิม · A0 และ C0 เรียกคนละครั้งและจด SHA กับผลในหลักฐาน · ใช้งานเดิมต่อได้ถ้า skill ยังไม่พร้อม ([Codex skills](https://learn.chatgpt.com/docs/build-skills))
- B2 ใช้ OpenAI Docs MCP ที่เชื่อมแล้วหรือเอกสารทางการตรวจ Decisions API สำหรับ benchmark หลัง gate โดย F10 classifier เดิมยัง live · ถ้า F39 ขึ้น production จริง ให้ C1 ใช้ Codex เป็น MCP client ทดสอบ `search_catalog` และ `get_price` กับร้านสังเคราะห์ แล้วเก็บผลที่ตรวจได้ ([Docs MCP](https://learn.chatgpt.com/learn/docs-mcp) · [F39](docs/specs/F39-chatgpt-catalog.md))

## งบ token และ credits

- **ที่ได้ต่อคน:** ChatGPT Pro สำหรับวันงาน + Codex credits US$100 + OpenAI API credits US$100 (ทีม US$600 ไม่นับ Pro) เช็กวันหมดอายุและ model ที่ใช้ได้ทันทีที่ได้รับ
- **Codex (เขียนโค้ด):** login ด้วยบัญชี ChatGPT Pro ใช้ included usage ก่อน หมดแล้วจึงหัก Codex credits (≈2,500 credits ต่อคน) · ประมาณการ ~3,200–3,500 credits-equivalent ต่อคนต่อวัน ([budget-and-priority.md](docs/budget-and-priority.md)) · **Codex ไม่ login ด้วย API key** เว้นแต่ทั้ง included usage และ Codex credits หมด (API credits อาจใช้กับ Codex ไม่ได้: ยังไม่ยืนยัน)
- **แอป (AI ตอนรันจริง):** เครื่อง dev ของแต่ละคนใช้ key ของตัวเองใน OpenAI project **`app-dev` (hard limit US$30)** · production ใช้ key เดียวใน project **`app-prod` (hard limit US$60, หัวหน้าถือ)** งบ dev จึงกระจายสามบัญชีเท่ากัน และงบ demo ไม่ถูกแตะ
- **วิธีนับ % usage ต่อคน:** ตัวเลข weekly limit ที่หน้า usage แสดง · ถ้า included usage หมดแล้ว นับเป็น 100% + สัดส่วน Codex credits ที่ใช้ไป
- **เบรกงบ:** ถึง 40% → ปิด Fast ทุก chat ของคนนั้น · เกิน 50% ก่อน 13:00 → worker ของคนนั้นลด effort เป็น low และปิด Fast · included usage หมดและ Codex credits เหลือไม่ถึง 30% → เหลือ orchestrator + worker 1 ตัว (lane ที่มีงาน tier สูงสุด)
- Codex ทุก session ใช้ `gpt-6.2-sol` **ไม่ใช้ `gpt-6.2-astra`** (แพงกว่า 4 เท่าโดยไม่จำเป็น) และทำตามกติกาประหยัด token ใน budget-and-priority.md

## เตรียมก่อนวันเสาร์

เช็กลิสต์ต่อคนอยู่ใน [prompts/people/](prompts/README.md#ไฟล์ในชุด) และ [docs/day/pc-preparation.md](docs/day/pc-preparation.md) รายการรวมของทีม:

- [ ] ตั้งชื่อ A / B / C, GitHub login, หัวหน้าทีม และ presenter ใน [`team.json`](docs/competition-plan/team.json) · ซ้อมบน repo และบอร์ดซ้อม · ตอนเริ่มงาน C สร้าง repo แข่งใหม่และปักหมุดบอร์ดใน repo นั้น แล้ว A/B รับคำเชิญและเปลี่ยนค่า repo/issue ตาม [START.md Day](START.md#day-instructions-for-codex) · ตั้งแจ้งเตือนของแอป ChatGPT และจับคู่มือถือ ([START.md ข้อ 3](START.md))
- [ ] **ส่ง [อีเมลถามผู้จัด](docs/pitch/organizer-email.md)** เรื่องโค้ดบริษัท รูปแบบการส่งงาน ความยาว pitch รอบ final และ API credits ใช้กับ Codex ได้ไหม แล้วบันทึกคำตอบใน [SOURCE-BASELINE](docs/competition-plan/templates/SOURCE-BASELINE.md)
- [ ] **เครื่องวันงานทุกเครื่อง** ([pc-preparation.md](docs/day/pc-preparation.md)): Git + longpaths, Node.js 24, GitHub CLI, แอป ChatGPT ล่าสุด (Codex), Playwright chromium, clone สอง repo, `..\nless.secrets.env` แล้วรัน **preflight** ให้ผ่านและแจ้งผลในกลุ่มก่อนนอน
- [ ] **Codex ในแอป ChatGPT** ([chatgpt-app-setup.md](docs/day/chatgpt-app-setup.md)): model/effort/Fast, Approve for me, rules ของ git/gh, trust project + Review hooks, ทดสอบ hook MANGO/PONG ในแอป, ทดสอบ commit จาก worktree, แจ้งเตือน, power plan ไม่ sleep, MCP ของ Neon (ทุกคน, read-only) และ Render (เฉพาะ C, อ่านอย่างเดียว) ล็อกอินด้วยบัญชีตัวเอง · CLI ≥ 0.171 เป็นทางสำรอง
- [ ] **Neon:** C สร้าง org `Endless` + 3 project แล้วเชิญ A, B · หนึ่ง project ต่อคน (สิงคโปร์) ทดสอบ `CREATE DATABASE` + `CREATE EXTENSION vector` ผ่าน direct endpoint · ทางสำรอง WSL2 Postgres 16 + pgvector
- [ ] **OpenAI:** เปิดใช้ credits · ทุกคนสร้าง project `app-dev` + hard limit US$30 · หัวหน้าสร้าง `app-prod` + hard limit US$60 · เช็ก tier/rate limit และ model ตาม [docs/openai-api.md](docs/openai-api.md) (รัน smoke test)
- [ ] **Render:** บัญชี + บัตร + ซ้อม deploy จาก blueprint หนึ่งรอบ · **Railway:** บัญชี verify แล้ว ([deployment.md](docs/day/deployment.md))
- [ ] **ChatGPT Sites dashboard (ไม่บังคับ ข้ามได้: บอร์ดหลักคือ GitHub issue ที่ทดสอบตาม [START.md ข้อ 4](START.md)):** เพื่อนสร้าง site ตาม [docs/board/sites-dashboard.md](docs/board/sites-dashboard.md) แชร์ให้ 3 บัญชี ออก bypass token แล้ว **ทดสอบ POST/GET/PUT จากเครื่องวันงานทั้ง 3 เครื่อง** ไม่ผ่าน = `BOARD_SOURCE=github`
- [ ] **บัญชี provider:** LINE สอง channel (*NLess Demo* และ *NLess Dev*) + **พิมพ์ QR ของ OA ตัว demo** · Google OAuth client + test user · tunnel สำหรับ webhook ตอน dev
- [ ] **ซ้อม:** C1 setup จากโฟลเดอร์ว่างแล้วจับเวลา (เป้า 45 นาที ไม่เกิน 55 นาที) · สอง lane ส่งงานต่อกันผ่านบอร์ดได้จริง · orchestrator ส่ง `TASK` แล้ว worker ตื่น · drill สามข้อใน [failure-drills.md](docs/day/failure-drills.md)
- [ ] **Pitch:** รีวิว [PITCH.md](docs/pitch/PITCH.md), [demo-loop.md](docs/pitch/demo-loop.md), [DECK-OUTLINE](docs/pitch/DECK-OUTLINE.md) และ [QA-PREP](docs/pitch/QA-PREP.md) · ซ้อมพูดหนึ่งรอบ
- [ ] (ถ้ายังเปิดรับ) ลงทะเบียนเพื่อนที่ host Sites เป็นสมาชิกคนที่ 4 ของทีม (กติกาให้ 3–4 คน)

## เรื่องที่ทีมต้องตัดสินใจ

- [ ] **ใครเป็น A / B / C ใครเป็นหัวหน้าทีม ใครเป็น presenter**
- [ ] Production DB: Render Postgres (ค่าเริ่มต้น) หรือ Supabase free ผ่าน session pooler → เลือกก่อน 10:00 แล้วบันทึกใน SOURCE-BASELINE
- [ ] เปิด auto top-up ของ Codex credits หรือไม่ (credits ถูกใช้หลัง included usage หมด)
- [ ] weekly limit ของ Pro พอสำหรับ 4 chat ต่อคนทั้งวันไหม (ผู้ให้บริการไม่บอกขนาด): ดูอัตราการใช้ที่หน้า usage ตอน 11:30 แล้วปรับตามเบรกงบ

## ขั้นต่อไป

1. ทุกคนทำ [pc-preparation](docs/day/pc-preparation.md) และอ่านหน้าของตัวเองใน [prompts/people/](prompts/README.md#ไฟล์ในชุด) คืนนี้
2. C ซ้อม setup + deploy ขึ้น Render หนึ่งรอบ แล้วลบ repo ซ้อมทิ้ง
3. หัวหน้าส่งอีเมลถามผู้จัด และเช็ก Sites board จากสามเครื่อง
4. เช้าวันเสาร์: เช็กคำตอบผู้จัด, เปิด dashboard, 10:00 เริ่มตาม [ตารางเวลา](#ตารางเวลา)
