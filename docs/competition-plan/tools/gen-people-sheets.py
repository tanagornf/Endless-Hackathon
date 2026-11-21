# Generates prompts/people/{A,B,C}.md (day sheets) and prompts/people/PREP-{A,B,C}.md (prep sheets) from templates so the common steps stay identical.
import sys, os
OUT = sys.argv[1]

PEOPLE = {
 'A': dict(
  title='inbox, ขาย, ลูกค้า',
  intro='A ถือสิ่งที่กรรมการเห็นก่อน: Demo Chat, inbox และการกดรับช่วงแชต (F09, F11 อยู่ใน golden path) ตามด้วยออเดอร์ QR + ตรวจสลิป และ live codes ที่เป็นเรื่องของ Sea/Shopee · orchestrator ของคุณ (A0) ดูแลเส้นทาง demo ทั้งเส้น',
  rows='''| **A0** orchestrator | มอบงาน ตรวจงาน ทดสอบบน production เดิน demo loop | `..\\nless-a0` · 3000 / 5170 | [orchestrators/A0.md](../orchestrators/A0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| A1 | F09 inbox + Demo Chat (P0) → F11 รับช่วงแชต (P0) → F12 template ข้อความ (P2) → F23 broadcast (P2) | `..\\nless-a1` · 3007 / 5177 | [lanes/A1.md](../lanes/A1.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| A2 | F13 ออเดอร์ (P1) → F14 QR ต่อออเดอร์ + ตรวจสลิป (P1) → F22 live codes (P2) | `..\\nless-a2` · 3008 / 5178 | [lanes/A2.md](../lanes/A2.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |
| A3 | F24 ลูกค้าและแท็ก (P1) → F15 จองนัด (P2) → F16 ปฏิทิน Google (P2) | `..\\nless-a3` · 3009 / 5179 | [lanes/A3.md](../lanes/A3.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |''',
  load='855 นาทีงาน (ค่ากลาง) · ถ้า A ตามไม่ทัน หัวหน้าตัด F16 แล้ว F23 ก่อน',
  tonight='''- [ ] **ชำระเงิน (F14):** PromptPay ID ทดสอบของร้านสังเคราะห์ (`PROMPTPAY_TEST_ID` ใช้เบอร์/เลขที่ทีมตกลง ไม่มีการโอนจริง) ใส่ใน `..\\nless.secrets.env` · ลองสแกน QR ที่สร้างจาก payload ตัวอย่างใน [spec F14](../../docs/specs/F14-payments.md) ด้วยแอปธนาคารจริง **สแกนดูยอดอย่างเดียว ไม่โอน**
- [ ] **ปฏิทิน (F16):** Google OAuth client (redirect `http://localhost:5179/oauth/callback`, `http://localhost:5170/oauth/callback` และ URL ของ production) + test user ที่เพิ่มใน consent screen แล้ว
- [ ] อ่าน spec ของ F09, F11 (P0) ให้ครบ และ §1 + §11 ของ F13, F14, F22, F24
- [ ] (ถ้าเป็น presenter) ซ้อม [demo loop](../../docs/pitch/demo-loop.md) และ [pitch](../../docs/pitch/PITCH.md)''',
  day='''| ~10:50 | `SETUP READY` → A1 ตื่นจาก hook (ไม่ตื่นใน 2 นาที วาง prompt 1 GO) · รันใน terminal ของคุณ: `npm ci` ครั้งเดียวต่อ worktree แล้ว `npm run dev` ใน `nless-a0` และ `nless-a1` · เปิด Fast ของ A0 และ A1 |
| 10:50–11:30 | A1 ทำ `saveMessage()` / `getHistory()` ให้จริงก่อน (C2 และ B2 รอ) · คุณลอง Demo Chat บน `http://localhost:5177` |
| 11:30 | บอก % usage ให้ A0 และหัวหน้า · หลัง `LEAD: OPEN P1` A2/A3 เริ่ม: รัน `npm run dev` ให้ lane ที่คุณจะทดสอบด้วยมือ (ไม่เกิน 2–3 ตัวพร้อมกัน) |
| 12:30 | ทดสอบ gate ขั้น 2, 4, 5 บน production ด้วยมือถือของคุณเอง (Demo Chat → inbox → รับช่วง) คู่กับ A0 |
| **13:00** | gate: ถ้าถูกแท็ก `BLOCKED GATE ... TO:A1` ให้ A1 หยุดงานใหม่แล้วแก้ก่อน · ปิด Fast ของ A0 และ A1 |
| 13:00–14:30 | A2: AI เสนอออเดอร์ → ลูกค้ายืนยัน → QR → สลิป · A3: แผงลูกค้าข้างแชต, จองนัด · A1: template และ broadcast เมื่อ P2 เปิด |
| 14:30 | เดิน [demo loop](../../docs/pitch/demo-loop.md) บน production กับ A0 หนึ่งรอบ บอกหัวหน้าว่าขั้นไหนยังไม่ได้ |
| 15:30 | `LEAD: FREEZE` → prompt 5 ทุก worker · เปิด Fast ของ A0 · แก้แค่บั๊ก |
| 16:00–16:30 | เดิน demo loop อีกรอบ แล้วช่วยอัดวิดีโอ ([VIDEO-SCRIPT](../../docs/pitch/VIDEO-SCRIPT.md)) |
| 16:45 | deploy freeze: ไม่ merge อีก ปิด Fast ทุก chat |
| 17:00 | warm แอป: login ค้างไว้ เปิด Demo Chat บนมือถือ ยิงคำถามแรก วาง QR ของ LINE OA บนโต๊ะ |''',
  manual='ข้อความใหม่ขึ้นใน inbox ทันทีโดยไม่ต้อง refresh · Demo Chat บนมือถือจริงอ่านง่ายและกดปุ่มได้ · รับช่วงแชตแล้วบอทเงียบจริงและคืนให้ AI ได้ · ออเดอร์ราคาตรงกับ catalog · สลิปยอดไม่ตรง สลิปซ้ำ หรือสลิปแก้ยอด ไม่ทำให้ออเดอร์เป็นจ่ายแล้ว (สถานะ S เพราะไม่ได้ยืนยันกับธนาคาร และหน้าจอต้องบอกเช่นนั้น) · รหัสสินค้าใน live ตอบถูกตัว',
  stuck='''- ต้องการ field ใหม่ในตาราง core (conversations, messages) → `NEED TO:C1` ห้าม ALTER เอง
- Google ใช้ไม่ได้ในวันงาน → ทำ flow ภายในให้ครบแบบ sandbox ที่ติดป้ายชัด รายงาน S ตามจริง (ฟีเจอร์ที่ไม่ถึง R ถูกซ่อนจากเมนูตอน 15:30)''',
 ),
 'B': dict(
  title='ความรู้ + AI',
  intro='B ถือสมองของระบบ: คลังความรู้ การค้นหา สินค้าและราคา (แหล่งความจริงของ AI), AI ตอบแชต (F10 คือหัวใจของ demo), AI evals ที่พิสูจน์คุณภาพ และ dashboard ผลลัพธ์ของร้าน · orchestrator ของคุณ (B0) ดูแลคุณภาพคำตอบ AI ของทั้งระบบ',
  rows='''| **B0** orchestrator | มอบงาน ตรวจงาน ยิงชุดคำถามตรวจ AI บน production ดูต้นทุนและ latency | `..\\nless-b0` · 3000 / 5170 | [orchestrators/B0.md](../orchestrators/B0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| B1 | F05 คลังความรู้ (P0) → F07 ค้นหา (P0) → F08 สินค้า (P0) → F37 AI evals (P2) | `..\\nless-b1` · 3004 / 5174 | [lanes/B1.md](../lanes/B1.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| B2 | F10 AI ตอบ (P0) → F38 follow-up nudges (P2) → F30 voice (P3) | `..\\nless-b2` · 3005 / 5175 | [lanes/B2.md](../lanes/B2.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| B3 | F06 นำเข้าไฟล์ (P1) → F26 insights (P2) → F27 dashboard + ผลลัพธ์ของร้าน (P2) | `..\\nless-b3` · 3006 / 5176 | [lanes/B3.md](../lanes/B3.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |''',
  load='892.5 นาทีงาน (ค่ากลาง) มากที่สุดในทีมเล็กน้อย เพราะ F30 voice (P3) อยู่ท้าย B2 · ถ้า B ตามไม่ทัน หัวหน้าตัด F30 แล้ว F26 ก่อน **ไม่ตัด F37 และตัวเลขของ F27**',
  tonight='''- [ ] **OpenAI:** รัน smoke test ใน [docs/openai-api.md §14](../../docs/openai-api.md#14-smoke-test-ก่อนวันงาน) ด้วย key `app-dev` ของคุณบนเครื่องวันงาน (preflight ทำให้เมื่อใส่ `-OpenAI`) ถ้า model ไหนได้ 403/404 แจ้งหัวหน้าทันที
- [ ] อ่าน spec ของ F10 ทั้งไฟล์ (prompt, tools, guards) และ F05, F07, F08 · อ่าน §1 + §11 ของ F37, F38, F06, F27
- [ ] เตรียมไฟล์ทดสอบนำเข้า (F06): CSV สินค้า 20 แถวที่มีหัวคอลัมน์ไทย และไฟล์ข้อความ FAQ หนึ่งหน้า (ข้อมูลสังเคราะห์เท่านั้น) เก็บไว้ในเครื่องวันงาน
- [ ] ไมโครโฟนและหูฟังสำหรับ F30 (ถ้าเปิด P3) · ลองว่า browser ขอสิทธิ์ไมค์ได้''',
  day='''| ~10:50 | `SETUP READY` → B1, B2 ตื่นจาก hook (ไม่ตื่นใน 2 นาที วาง prompt 1 GO) · รันใน terminal ของคุณ: `npm ci` ครั้งเดียวต่อ worktree แล้ว `npm run dev` ใน `nless-b0` และ `nless-b2` · เปิด Fast ของ B0, B1, B2 |
| 10:50–11:30 | B1 ทำ knowledge + สินค้าและราคาให้จริงก่อน (A2, B2 รอ `getPrice`) · B2 ทำ gate + ตอบราคาจาก tool |
| 11:30 | บอก % usage ให้ B0 และหัวหน้า · เช็ก usage ของ OpenAI API (project `app-dev` ของคุณ) · หลัง `LEAD: OPEN P1` B3 เริ่ม F06 |
| 12:30 | ทดสอบส่วนที่ขึ้น production แล้วคู่กับ B0: เพิ่ม FAQ และถามราคา `A-GAME-01` ต้องได้ 1,490 บาท (B1 ส่งราคาจริง ~11:55, ค้นหาจริง ~12:40, เพิ่มสินค้าจากหน้าเว็บ ~13:00) |
| 12:45–13:00 | ทดสอบ gate ขั้น 1, 3 ให้ครบ: เพิ่ม FAQ + เพิ่ม/แก้สินค้า `A-GAME-01` จากหน้าเว็บ แล้วถามราคา ต้องได้ 1,490 บาทพร้อม source |
| **13:00** | gate: ถ้าถูกแท็ก `BLOCKED GATE ... TO:B1/B2` ให้ lane นั้นหยุดงานใหม่แล้วแก้ก่อน · ปิด Fast ของ B0, B1, B2 |
| 13:00–14:30 | B1: ปิด F07/F08 แล้ว F37 evals · B2: งาน F10 P1 แล้ว benchmark Decisions API (25 นาทีเมื่อ B0 ส่ง TASK หลัง DONE GATE, คง classifier เดิม live) แล้ว F38 · B3: F06 → F26 → F27 |
| 14:30 | บอกหัวหน้าว่า F30 voice เปิดได้ไหม (เปิดเมื่อ F38 merge แล้วและ P3 ผ่านเงื่อนไขเท่านั้น) |
| 15:30 | `LEAD: FREEZE` → prompt 5 ทุก worker · เปิด Fast ของ B0 |
| 15:45 | อนุมัติ real eval หนึ่งรอบบน production เมื่อ B0 ขอ (เพดาน `EVAL_MAX_COST_USD`) |
| 16:15 | เอาตัวเลขจากหน้า AI quality และ dashboard (pass rate, median latency, ต้นทุนต่อ turn, ผลลัพธ์ของร้าน) ให้ presenter กรอกใน deck |
| 16:45 | deploy freeze: ไม่ merge อีก ปิด Fast ทุก chat |
| 17:00 | warm แอป: ถาม Demo Chat หนึ่งคำถาม เปิดหน้า turn trace, AI quality และ dashboard ค้างไว้ |''',
  manual='คำตอบราคาตรงกับ catalog ทุกครั้งและมี source · ถามของที่ไม่มีแล้วบอกว่าไม่มีข้อมูล ไม่เดา · ขอส่วนลดหรือสั่งให้ลืมกติกาแล้วไม่หลุด · draft ที่ยังไม่ active ไม่ถูกนำไปตอบ · นำเข้า CSV แล้วถามราคาสินค้าใหม่ได้ถูก (จับเวลาตั้งแต่ upload ถึงคำตอบแรก) · หน้า AI quality บอกชัดว่าผลมาจาก fake หรือ model จริง · ตัวเลขบน dashboard ตรงกับที่นับด้วยมือจากแชตทดสอบ',
  stuck='''- คำตอบของ AI ผิด: เปิด turn trace ดูว่าผิดที่ค้นหา (B1), tool หรือ prompt (B2) แล้วบอก B0 ให้ส่ง `TASK` พร้อมข้อความที่ถาม อย่าให้ worker เดา
- OpenAI ตอบ 429 `insufficient_quota` หรือ hard limit เต็ม: แจ้งหัวหน้าทันที (เพิ่ม limit ของ project หรือสลับ key ตาม [failure-drills](../../docs/day/failure-drills.md)) ระหว่างนั้น test ใช้ `MODEL_MODE=fake` ได้''',
 ),
 'C': dict(
  title='platform, ช่องทาง, ตั้งค่าและสิทธิ์ + production',
  intro='C ถือคอขวดของทั้งทีม: setup ของ C1 (ทุก lane รอ), production บน Render, ช่องทาง LINE/Meta และสิทธิ์/login · orchestrator ของคุณ (C0) ตรวจ CORE-LOOP GATE 13:00 และเฝ้า production · คุณคือคนที่ถือบัญชี Render, Railway, LINE Demo channel, Meta app และ tunnel',
  rows='''| **C0** orchestrator | มอบงาน ตรวจงาน **ตรวจ gate 13:00** เฝ้า production หลังทุก merge | `..\\nless-c0` · 3000 / 5170 | [orchestrators/C0.md](../orchestrators/C0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| C1 | **F01 setup + deploy (P0)** → F35 jobs/ops (P0) → F39 ChatGPT-ready catalog (P2) → F36 release (P1, 15:15) | `..\\nless-c1` · 3001 / 5171 | [C1-setup.md](../C1-setup.md) **~10:05** แล้ว [lanes/C1.md](../lanes/C1.md) ใน chat ใหม่หลัง deploy (S9) | Medium · **Fast เปิดตอน setup** แล้วเปิดได้ถึง 13:00 ถ้า usage < 40% |
| C2 | F17 LINE (P0) → F18 Messenger/Instagram (P1) → F21 ตอบคอมเมนต์ (P2) | `..\\nless-c2` · 3002 / 5172 | [lanes/C2.md](../lanes/C2.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| C3 | F04 ตั้งค่าร้าน (P0) → F03 ร้านและสิทธิ์ (P0) → F02 login (P1, ไม่รอ) → F31 แจ้งเตือน (P1) | `..\\nless-c3` · 3003 / 5173 | [lanes/C3.md](../lanes/C3.md) 10:15 | Medium · Fast ปิด |''',
  load='855 นาทีงาน (ค่ากลาง) แต่คุณมีงานมือมากที่สุด (Render, webhook, บัญชี provider) · ถ้า C ตามไม่ทัน หัวหน้าตัด F21 แล้ว F39 แล้ว F31 ก่อน',
  tonight='''- [ ] **ซ้อม C1 setup** จากโฟลเดอร์ว่างตาม [C1-setup.md](../C1-setup.md) จับเวลา (เป้า 45 นาที ช้าสุด 55) แล้วลบ repo ซ้อมทิ้ง
- [ ] **Render:** บัญชี + บัตร + ซ้อม deploy จาก blueprint หนึ่งรอบ เช็ก region สิงคโปร์, disk, Postgres + `CREATE EXTENSION vector`, WebSocket · **Railway:** บัญชี verify แล้วและซ้อมทางสำรองหนึ่งรอบ ([deployment.md](../../docs/day/deployment.md))
- [ ] **LINE:** สอง Messaging API channel: *NLess Demo* (QR ของ OA นี้พิมพ์ไปวางโต๊ะ; webhook จะชี้ production) และ *NLess Dev* (webhook ชี้ tunnel) ใส่ channel secret/token ของ Dev ใน `..\\nless.secrets.env` ส่วนของ Demo ใส่ใน Render เท่านั้น
- [ ] **Meta:** developer app (development mode) + Page ทดสอบ + บัญชี Instagram ทดสอบ + test users/app roles ของทั้งสามคน · จด Graph API version ที่ dashboard แสดง
- [ ] **Tunnel:** cloudflared (หรือ ngrok) ทดสอบรับ webhook ของ LINE Dev ได้ ([environments.md](../../docs/day/environments.md))
- [ ] VAPID keys สำหรับ web push (F31) และ `TOKEN_ENCRYPTION_KEY` สร้างตามคำสั่งใน `.env.example`
- [ ] อ่าน spec ของ F01, F35, F17, F04, F03 ให้ครบ และ §1 + §11 ของ F02, F18, F36, F39''',
  day='''| 10:00 | พิมพ์บรรทัดเดียวของ "10:00–10:15 เปิดงาน" (สคริปต์สร้าง repo แข่ง, push baseline ตาม [C1-setup.md ข้อ 0.2](../C1-setup.md) และสร้าง worktree 4 ตัวให้) · **~10:05 เริ่ม C1-setup ใน chat ของ `..\nless-c1`** (Fast เปิด) ก่อน chat อื่น |
| 10:15 | เปิด C0, C2, C3 ด้วยบรรทัดเดียวของแต่ละ chat · เฝ้า chat ของ C1: อนุมัติสิ่งที่ถาม รัน `npm install` / `npm ci` ใน terminal ถ้า sandbox ล้มด้วย EPERM |
| ~10:50 | C1 โพสต์ `SETUP READY` (ช้าสุด 11:00) → C0 ตรวจ acceptance ข้อ 3 ของ C1-setup (≤ 5 นาที) · รัน `npm run dev` ใน `nless-c0` · เปิด Fast ของ C0 และ C2 |
| 10:50–11:30 | **Deploy แรก (S9) กับ C1:** สร้าง service จาก `render.yaml`, ใส่ตัวแปรของ production (key `app-prod` จากหัวหน้า), รอ build, เปิด `/healthz` และ `/build-info` ([deployment.md](../../docs/day/deployment.md)) → แล้ววาง [lanes/C1.md](../lanes/C1.md) ใน chat ใหม่ของ C1 |
| 11:30 | บอก % usage ให้ C0 และหัวหน้า · production ต้องตอบ `/healthz` แล้ว |
| ~12:00 | รัน seed ร้านสังเคราะห์บน production หนึ่งครั้ง · สลับ webhook ของ LINE *NLess Demo* ไป production · เปลี่ยนชื่อที่แสดงของ OA ตัว demo เป็น **Endless** ใน LINE Official Account Manager (ตั้งค่า → ชื่อบัญชี · ชื่อ channel ใน Developers console ไม่ต้องเปลี่ยน · ถ้าเปลี่ยนไม่ได้ให้บอกหัวหน้า) แล้วกด Verify · ส่งข้อความจริงหนึ่งข้อความจากมือถือ |
| 12:30–13:00 | เดิน gate 5 ขั้นบน production คู่กับ C0 |
| **13:00** | C0 โพสต์ผล gate · ปิด Fast ของ C0, C1, C2 |
| 13:00–14:30 | C2: Messenger/Instagram กับ test users (สลับ webhook ของ Meta ไป production เมื่อ F18 deploy) · C3: login จริง แล้วตั้ง `DEV_LOGIN_ENABLED=false` บน Render ตาม checklist ใน [spec F02 §5.9](../../docs/specs/F02-auth.md) (ห้ามทำช่วง 12:30–13:00 และห้ามปิดก่อน login จริงผ่านบน production) · C1: ops page แล้ว F39 |
| 14:30 | F17 ต้องถึง LINE OA ตัว demo จริงแล้ว · บอกหัวหน้าว่าฟีเจอร์ไหนของ C ไม่ทัน |
| 15:15 | C1 เริ่ม F36 (พัก F39) |
| 15:30 | `LEAD: FREEZE` → prompt 5 ทุก worker · เปิด Fast ของ C0 · **ซ่อนฟีเจอร์ที่ไม่ถึง R ในหน้า ops** ตามรายการที่ C0 รวม |
| 16:30 | เปิด uptime monitor ที่ `/healthz` |
| **16:45** | **deploy freeze** · รัน `pg_dump` production · ช่วยหัวหน้าส่งงาน |
| 17:00 | warm-up บน production (ส่ง LINE หนึ่งข้อความ, upload หนึ่งไฟล์, เปิด voice หนึ่ง session ถ้ามี) แล้วกด demo reset |''',
  manual='login ด้วย owner A เห็นเฉพาะร้าน A และ owner B เข้าข้อมูลร้าน A ไม่ได้ · ปิด AI ใน settings แล้วบอทเงียบจริง · ข้อความจาก LINE OA ตัว demo เข้า inbox และได้คำตอบกลับในมือถือ · Messenger/Instagram ส่งรับกับ test user ได้จริง · production ตอบ `/healthz` และ `/build-info` เป็น sha ล่าสุดหลังทุก merge · เมนู production ไม่มีหน้า placeholder',
  stuck='''- setup ช้ากว่า 10:50: ทำ "ขั้นต่ำ" ของขั้นที่เหลือตาม C1-setup ข้อ 5 แล้วโพสต์ `SETUP READY` ให้ทีมเริ่มก่อน ที่เหลือทำเป็น PR ถัดไป
- deploy ล้มหรือ Render ล่ม: ทำตาม [failure-drills](../../docs/day/failure-drills.md) (rollback ไป deploy ก่อนหน้า หรือสลับไป Railway) และแจ้งทีมด้วย `BLOCKED`
- LINE ไม่ส่ง webhook: เช็ก Verify ใน console, URL, และว่า channel ถูกตัว (Demo ชี้ production เท่านั้น)''',
 ),
}

TEMPLATE = r'''# คน {P}: {title}

ชื่อ: REPLACE_{P}_NAME · GitHub: @REPLACE_{P}_LOGIN · หน้านี้คือทุกอย่างที่ {P} ต้องทำ ถ้าขัดกับ [PLAN.md](../../PLAN.md) ยึด PLAN.md · หัวหน้าทีมดู [LEAD.md](LEAD.md) เพิ่ม

{intro}

## 4 chat ของคุณ (แอป ChatGPT → Codex, model GPT-6.2 Sol ทุกตัว)

| Lane | งาน | worktree · port API/web | prompt ของ chat (เปิดด้วยบรรทัดเดียว) | effort · Fast |
|---|---|---|---|---|
{rows}

{load}

## คืนนี้ (บนเครื่องที่จะใช้วันงาน)

รายการเตรียมฉบับเต็มของคุณ (ทำให้ครบก่อน 10:00 เรียงตามลำดับ พร้อมคำสั่ง): **[PREP-{P}.md](./PREP-{P}.md)** · ข้อข้างล่างคือสรุป

- [ ] **เริ่มด้วยบรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงานนี้ (`sea`) เป็น project ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์ `You are {P}. Prepare this PC: follow START.md section "Prep".` · Codex ตั้งค่าเครื่อง รัน preflight ทดสอบเสียงเตือน บอกวิธีตั้งแจ้งเตือนของแอปและจับคู่มือถือ แล้วบอกสิ่งที่คุณต้องทำเองทีละข้อ ([START.md](../../START.md)) รายการข้างล่างคือสิ่งที่มันจะไล่ให้ครบ
- [ ] ทำ [pc-preparation.md](../../docs/day/pc-preparation.md) ให้ครบ: Git + longpaths, Node.js 24, GitHub CLI, แอป ChatGPT ล่าสุด, Neon project ของคุณ, OpenAI project `app-dev` (hard limit US$30), `..\nless.secrets.env`, Playwright chromium แล้วรัน preflight และแจ้งผลในกลุ่ม
- [ ] ตั้ง Codex ในแอปตาม [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md): rules ของ git/gh, ทดสอบ hook MANGO/PONG, ทดสอบ commit จาก worktree, แจ้งเตือน, power plan ไม่ sleep
- [ ] ทดสอบบอร์ดจากเครื่องนี้: `team-board.ps1 check`, `post`, `status`, `read` ([sites-dashboard.md](../../docs/board/sites-dashboard.md))
{tonight}
- [ ] อ่าน [orchestrators/{P}0.md](../orchestrators/{P}0.md) หนึ่งรอบ เพื่อรู้ว่า orchestrator จะขออะไรจากคุณ (ปรับ effort/Fast, รัน dev server, บอก usage)

## 10:00–10:15 เปิดงาน

**บรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงาน (`sea`) ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์

```text
You are {P}. Start the day: follow START.md section "Day".
```

Codex รัน `docs\competition-plan\tools\start-day.ps1 -Person {P} -Mode Day` ให้: clone repo แข่ง (เครื่องของ C สร้าง repo และ push baseline เองถ้ายังไม่มี เครื่อง A/B รอจน baseline ขึ้น) → สร้าง worktree 4 ตัวพร้อม `.lane` → ตรวจบอร์ด → พิมพ์รายการ 4 โฟลเดอร์กับ **บรรทัดเดียวที่ต้องพิมพ์ในแต่ละ chat** (เก็บไว้ที่ `..\nless-START-{P}.txt`) · ติดตรงไหน เครื่องจะร้องเตือน ขึ้นแจ้งเตือน Windows และบอกขั้นที่คุณต้องทำ

จากนั้นในแอป ChatGPT (Codex): **Add new project** ทีละโฟลเดอร์ (`..\nless-{p}0` … `-{p}3`) → ในแต่ละ project เปิด **New chat → Work in: This computer** → trust project และ Review hooks → ตั้ง model **GPT-6.2 Sol**, effort และ Fast ตามตารางข้างบน, **Approve for me** → **พิมพ์บรรทัดเดียวของ lane นั้น** เช่น `You are {P}1. Open prompts/lanes/{P}1.md and do exactly what its text block says, as if I had pasted it here. Start now.` (ไม่ต้องวาง prompt ทั้งบล็อก; วางทั้งบล็อกแทนได้ถ้าต้องการ) · ทุก chat อ่านและวางแผนได้อย่างเดียวจนกว่า `SETUP READY`

(ไม่บังคับ) เปิด terminal หนึ่งตัวใน `..\nless-{p}0` ค้างไว้เป็นจอที่สอง: `while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }` (เห็นทุกโพสต์ และร้องเตือนเมื่อมี `BLOCKED` หรือมีคนแท็กคุณ)

สคริปต์ใช้ไม่ได้: ทำมือตาม [chatgpt-app-setup.md ข้อ 2–4](../../docs/day/chatgpt-app-setup.md) แล้ววาง prompt ทั้งบล็อกตามตาราง

## ระหว่างวัน

| เวลา | สิ่งที่คุณทำ |
|---|---|
{day}

งานประจำของคุณทั้งวัน: ดูกระดิ่ง Activity ของแอป (chat ที่รออนุมัติจะหยุดรอคุณ) · ทำตามบรรทัด "คน {P}: ปรับ chat <lane> เป็น <effort>, Fast <on/off>" ที่ orchestrator เขียน · รัน dev server และ `npm ci` ใน terminal ของคุณเอง (agent รันเองไม่ได้) · ดู dashboard ทุก 15–20 นาที

ทดสอบด้วยมือที่คุณรับผิดชอบ: {manual}

## จะสั่งงานอย่างไร

- **สั่งผ่าน orchestrator ก่อน:** พิมพ์ใน chat ของ {P}0 ว่าต้องการอะไร ("ให้ {P}2 ทำ slice QR ก่อน", "ตรวจว่าทำไม production ไม่ตอบ") มันจะส่ง `TASK` หรือ `FIX` ให้เอง และ dashboard จะตรงกับงานจริง
- พิมพ์ตรงใน chat ของ worker เมื่อ: ตอบคำถามที่มันถาม, วาง prompt สั้นจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ), หรือหยุดสิ่งที่กำลังผิดทาง
- chat ตอบช้าหรือลืมกติกา (context ยาว): เปิด chat ใหม่ใน project เดิมด้วย prompt 7 (worker) หรือ prompt 10 (orchestrator)
- ติดเรื่องเดียวเกิน 20 นาที: ปรับ chat นั้นเป็น effort xhigh + Fast จนผ่าน แล้วปรับกลับ · เกิน 45 นาที: ขอหัวหน้าใช้ effort max (ทีละ chat เดียวทั้งทีม)

## ถ้าติด

- **chat ต้องการคุณ:** มันโพสต์ `BLOCKED` (เครื่องนี้ร้อง 3 ครั้ง + แจ้งเตือน Windows) แล้วจบ turn ด้วยบล็อกขึ้นต้น "🛑 ต้องการคน:" → **แอป ChatGPT แจ้งเตือนคุณบนเครื่องและมือถือที่จับคู่** → ตอบใน chat นั้น (หรือจากมือถือ) ภายใน 5 นาที · ต้องตั้งไว้ก่อน: Settings → Notifications (turn completion Always, permission on, question on) และจับคู่มือถือที่ Settings → Connections ([START.md ข้อ 3](../../START.md)) · ประวัติอยู่ที่ `..\nless.alerts.log`
- hook ไม่ปลุก → prompt ที่ตรงกรณีจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ)
- แอป ChatGPT ค้าง, commit ไม่ผ่าน (`index.lock`), `npm ci` EPERM → ตารางแก้ใน [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) · ใช้ไม่ได้จริง ๆ ให้เปิด Codex CLI (`codex -C ..\nless-{p}1`) แทน
- usage ถึง 40%: ปิด Fast ทุก chat · เกิน 50% ก่อน 13:00: ลด worker เป็น effort low · included usage หมด: Codex จะหัก Codex credits US$100 ของคุณต่อเอง (ห้าม login Codex ด้วย API key เว้นแต่หัวหน้าสั่ง)
- Neon ช้าหรือล่ม → สลับ `PG_SERVER_URL` ไป Postgres ใน WSL2 ตาม [environments.md](../../docs/day/environments.md) แล้วรัน `npm run lane:init` + `npm run db:migrate` ใหม่
{stuck}
- เรื่องอื่น ๆ ที่อาจพัง: [failure-drills.md](../../docs/day/failure-drills.md)
'''

os.makedirs(OUT, exist_ok=True)
for P, d in PEOPLE.items():
    text = TEMPLATE
    for k, v in d.items():
        text = text.replace('{' + k + '}', v)
    text = text.replace('{P}', P).replace('{p}', P.lower())
    path = os.path.join(OUT, P + '.md')
    open(path, 'w', encoding='utf-8', newline='\n').write(text)
    print(path, len(text.encode('utf-8')), 'bytes')

# ---- Prep sheets: prompts/people/PREP-{A,B,C}.md (everything one person finishes before 10:00) ----
PREP_PEOPLE = {
 'A': dict(
  role='inbox, sales, customers',
  owns='A1 inbox and Demo Chat, then staff takeover · A2 orders, payment QR and slip check, live codes · A3 customers, booking, calendar',
  only='''- [ ] **Payment test ID (F14):** agree the synthetic shop's PromptPay test ID with the team and type it into `..\\nless.secrets.env` as `PROMPTPAY_TEST_ID`. No real transfer happens at any point.
- [ ] **Scan one generated QR:** build a QR from the example payload in [spec F14](../../docs/specs/F14-payments.md) and scan it with a real banking app. Look at the amount only. Do not transfer.
- [ ] **Google Calendar (F16):** a Google OAuth client with these redirect URIs: `http://localhost:5179/oauth/callback`, `http://localhost:5170/oauth/callback`, and the production URL once C has it. Add your test user on the consent screen.
- [ ] **Your phone as the judge's phone:** you test Demo Chat, the inbox and takeover on production at 12:30 with your own phone on mobile data, not on the venue Wi-Fi. Check that mobile data works where you will sit.
- [ ] **If you present:** rehearse the [demo loop](../../docs/pitch/demo-loop.md) and the [pitch](../../docs/pitch/PITCH.md) once, out loud, with one Thai and one English question.''',
  read='''- [ ] Specs in full: [F09 inbox](../../docs/specs/F09-inbox.md), [F11 team](../../docs/specs/F11-team.md) (both are in the 13:00 gate).
- [ ] Sections 1 and 11 only: [F13](../../docs/specs/F13-orders.md), [F14](../../docs/specs/F14-payments.md), [F22](../../docs/specs/F22-live-commerce.md), [F24](../../docs/specs/F24-crm.md).''',
  changed='''- F22 live commerce moved to **P2**: A2 starts it only after `LEAD: OPEN P2`.
- After the gate, A1 does F11 slices 2 and 3 first (waiting queue, staff status, automatic assignment) before templates and broadcast.
- Order, payment and booking messages and card labels must exist in Thai and English and follow the customer's language.''',
  bring='Your phone with LINE installed and mobile data · a second browser profile or device to play the customer',
 ),
 'B': dict(
  role='knowledge and AI',
  owns='B1 knowledge, search, catalog, then AI evals · B2 the AI agent, follow-ups, voice · B3 import, insights, dashboard',
  only='''- [ ] **OpenAI models:** your `preflight.ps1 -OpenAI` run (section 5) must show every check passing. A model that answers 403 or 404 is a blocker: tell the lead at once.
- [ ] **Import test files (F06):** one CSV of 20 product rows with Thai column headers, and one page of FAQ text. Synthetic data only. Keep them on this PC.
- [ ] **Voice (F30, only if P3 opens):** microphone and headphones, and check that the browser can ask for microphone permission.
- [ ] **Know B1's four targets before the gate:** knowledge about 11:30, real prices about 11:55, real search about 12:40, add a product from the web page about 13:00. They add up to exactly the 130 minutes available, so tell B0 the moment B1 is 10 minutes late on any of them.
- [ ] **Nothing to re-run for the prompts:** the agent prompt and the search formula were checked against the real API on the morning of 21 Nov (14 of 14, and all 14 cross-language questions found). If you change a prompt in a spec, run `node tools/openai-check/checks/spec-F10.mjs` in this planning repo again.''',
  read='''- [ ] Spec in full: [F10 AI agent](../../docs/specs/F10-ai-agent.md) (prompt, tools, guards, the two-language rules, the scenario table in §13.1).
- [ ] Specs in full: [F05](../../docs/specs/F05-knowledge.md), [F07](../../docs/specs/F07-knowledge-search.md), [F08](../../docs/specs/F08-catalog.md).
- [ ] Sections 1 and 11 only: [F37](../../docs/specs/F37-evals.md), [F38](../../docs/specs/F38-follow-ups.md), [F06](../../docs/specs/F06-knowledge-import.md), [F27](../../docs/specs/F27-analytics.md).''',
  changed='''- B1's order before the gate is now F05 slice 1 → F08 slice 1 → F07 slice 1 → a 20-minute catalog page slice. Real search reaches B2 about 12:40, not 12:05.
- After the gate, B2 builds the F10 trace page (slice 5) before the order and booking tools (slice 4).
- The bot answers in the language of each message, Thai or English. The eval set has 107 chat cases with a pass rate per language.
- Search has a cross-language rule (`W_XLANG` 0.85, `C0_XLANG` 0.15). B1 still measures it on the real index on the day (F07 §5.9 step 3a).''',
  bring='Headphones with a microphone · the two import test files',
 ),
 'C': dict(
  role='platform, channels, settings and access, production',
  owns='C1 setup and the first deploy, jobs, release · C2 LINE, Messenger and Instagram · C3 shop settings, permissions, sign-in, notifications',
  only='''- [ ] **Neon for the team:** create the organization `Endless` with three projects (`nless-hack-a`, `nless-hack-b`, `nless-hack-c`, region Singapore) and invite A and B on the People page ([environments.md](../../docs/day/environments.md)).
- [ ] **Competition repo and board:** during Prep, check the rehearsal board. At the official start, follow [START.md Day](../../START.md#day-instructions-for-codex) to create a fresh competition repo and its pinned issue, then give A and B the new repo and issue URL.
- [ ] **Rehearse the C1 setup** from an empty folder with [C1-setup.md](../C1-setup.md) and time it (target 45 minutes, 55 at most). Delete the rehearsal repo afterwards.
- [ ] **Render:** account with a card, one rehearsal deploy from the blueprint. Check the Singapore region, the disk, Postgres with `CREATE EXTENSION vector`, and WebSocket. **Railway:** a verified account and one rehearsal of the fallback ([deployment.md](../../docs/day/deployment.md)).
- [ ] **LINE:** two Messaging API channels. *NLess Demo* is the one judges scan; its webhook will point at production and its secret and token go into Render only. *NLess Dev* points at your tunnel; its secret and token go into `..\\nless.secrets.env`. Turn off auto-reply and the greeting message on the Demo account.
- [ ] **LINE display name:** change the display name of the demo account to **Endless** in LINE Official Account Manager (Settings → Account name). The channel name in the Developers console stays *NLess Demo*. Do it before the QR is printed if you can; your day sheet repeats it at 12:00. If LINE does not allow the change, tell the lead.
- [ ] **Meta:** a developer app in development mode, a test Page, a test Instagram account, and test users or app roles for all three people. Write down the Graph API version the dashboard shows.
- [ ] **Tunnel:** cloudflared (or ngrok) receives a LINE Dev webhook on this PC ([environments.md](../../docs/day/environments.md)).
- [ ] **Keys you generate:** VAPID keys for web push and `TOKEN_ENCRYPTION_KEY`, with the commands in `.env.example`.
- [ ] **Production key:** the lead holds the `app-prod` OpenAI key and gives it to you privately for Render. It never goes into a file on a PC, a chat or the board.
- [ ] **Render MCP** for C0 only, read-only ([chatgpt-app-setup.md §9](../../docs/day/chatgpt-app-setup.md)).''',
  read='''- [ ] Specs in full: [F01 core](../../docs/specs/F01-core.md), [F35 jobs](../../docs/specs/F35-core-jobs.md), [F17 LINE](../../docs/specs/F17-line.md), [F04 settings](../../docs/specs/F04-business-settings.md), [F03 tenancy](../../docs/specs/F03-tenancy.md).
- [ ] Sections 1 and 11 only: [F02](../../docs/specs/F02-auth.md), [F18](../../docs/specs/F18-meta.md), [F36](../../docs/specs/F36-release.md), [F39](../../docs/specs/F39-chatgpt-catalog.md), [F31](../../docs/specs/F31-notifications.md).
- [ ] [C1-setup.md](../C1-setup.md) once more, and [deployment.md](../../docs/day/deployment.md) section 4 (the first deploy and the LINE webhook switch).''',
  changed='''- F31 notifications moved to **P1** for its first slice (the in-app bell). C3 does it after F02 when `LEAD: OPEN P1` is posted; settings and web push stay P2.
- The C1 setup grew by about 10 minutes: the shared language helpers, the `TH | EN` switch and the check that every feature ships both language files.
- `start-day.ps1` now creates a missing work folder, and `preflight.ps1 -OpenAI` makes its own test images (it needs Python with Pillow).
- The 13:00 gate has one English question: `How much is A-GAME-01?` must be answered in English with `1,490 baht`.''',
  bring='A second phone or account that is a friend of the LINE demo account · the Render and Railway logins · the printed QR codes if you print them',
 ),
}

PREP_TEMPLATE = r"""# Prep sheet, person {P}: {role}

Name: REPLACE_{P}_NAME · GitHub: @REPLACE_{P}_LOGIN

Everything you finish **before 10:00 on Saturday 21 Nov 2026**, in order. Tick each box. Your lanes on the day: {owns}. What you do during the day is on your day sheet, [{P}.md](./{P}.md).

If this page disagrees with [START.md](../../START.md) on how to start, START.md wins. On scope and schedule, [PLAN.md](../../PLAN.md) wins.

## 1. Start with one line

- [ ] In the ChatGPT app (Codex), open the folder of this planning repo (`sea`) as a project → **New chat → Work in: This computer** → model **GPT-6.2 Sol**, effort **Medium**, **Approve for me**, then type:

```text
You are {P}. Prepare this PC: follow START.md section "Prep".
```

Codex pulls the repo, runs the checks, fixes what it can and tells you each step that only you can do. The sections below are those steps, so you can also work through them by hand.

## 2. This PC

- [ ] **Folders:** one short work folder with no spaces and no Thai letters, for example `C:\hack`. The planning repo is `C:\hack\sea`. The secrets file will be `C:\hack\nless.secrets.env`, next to the repo and never inside one.
- [ ] **Git for Windows**, then `git config --global core.longpaths true`, and set `user.name` and `user.email`. If GitHub rejects a push because of e-mail privacy, set `user.email` to your GitHub noreply address.
- [ ] **Node.js 24 LTS:** `node -v` prints `v24.x` and `npm -v` works.
- [ ] **GitHub CLI:** `gh auth login` (GitHub.com, HTTPS, in the browser), then `gh auth status`. You run this yourself; Codex must not.
- [ ] **ChatGPT app:** latest version, signed in with the Pro account, Codex visible, model GPT-6.2 Sol available.
- [ ] **Playwright browser:** `npx playwright install chromium` (about 300 MB, once).
- [ ] **No global Codex rules file:** if `%USERPROFILE%\.codex\AGENTS.md` exists, rename it for the day. Together with the project rules it goes over the size limit.
- [ ] **The PC stays awake:** the power settings block in [chatgpt-app-setup.md §6](../../docs/day/chatgpt-app-setup.md). Plug in the charger.
- [ ] Not needed: Docker, a local Postgres.

## 3. Accounts and the secrets file

You type every value yourself, from the dashboard, into `..\nless.secrets.env`, one `NAME=value` per line. Never paste a key into a chat, an e-mail or the board, and never ask Codex to read one out.

- [ ] **OpenAI:** your own project `app-dev` with a hard limit of US$30 → `OPENAI_API_KEY`.
- [ ] **Neon:** your own project (Singapore), **Direct connection** string → `PG_SERVER_URL`.
- [ ] **Board:** `BOARD_REPO`, `BOARD_ISSUE` and `BOARD_TEAM_LOGINS`. Use rehearsal coordinates in Prep. At the official start, switch to the new repo and board using [START.md Day](../../START.md#day-instructions-for-codex).
- [ ] **GitHub access:** verify access on the rehearsal repo in Prep. A and B accept the new competition repo invitations when C shares them at the official start.
- [ ] Not needed on your PC: the production key (`app-prod`), which lives in Render only.

## 4. Codex in the ChatGPT app

Follow [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) once. The parts that matter most:

- [ ] `config.toml` and `rules\default.rules` are installed in `%USERPROFILE%\.codex\` (the Prep line installs them). Restart the app fully afterwards, tray icon included.
- [ ] **Hook test (MANGO / PONG):** the five-minute test in [the Codex README](../../docs/competition-plan/templates/codex/README.md). It proves a board post wakes a chat.
- [ ] **Commit test:** a chat can commit from inside a worktree.
- [ ] **Neon MCP**, read-only, for your own project ([§9](../../docs/day/chatgpt-app-setup.md)).
- [ ] **Notifications, three steps** ([START.md section 3](../../START.md)): in the app, turn completion = Always, permission on, question on · pair your own phone under Settings → Connections · type `Reply with one word, then stop.` in a chat, switch windows, and check that the desktop and the phone both notify you.
- [ ] **Alert test:** `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\alert.ps1 -Test` beeps and shows a Windows notification.

## 5. Checks to run

Run these in the planning repo. None of them prints a secret.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1 -OpenAI
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\team-board.ps1 check -AgentId LEAD
```

- [ ] The first prints a table with **0 FAIL**.
- [ ] The second calls the real OpenAI API once with your key (about US$0.08) and every check passes.
- [ ] The third prints `Board: … state=open`.
- [ ] One test post reaches the others: the round trip in [START.md section 4](../../START.md).

## 6. Only you

{only}

## 7. Read before 10:00

- [ ] [docs/PRODUCT.md](../../docs/PRODUCT.md): what the finished product is. About ten minutes. Every Codex session reads it too, so you will be judging their work against it.
- [ ] Your day sheet [{P}.md](./{P}.md) and your orchestrator's prompt [{P}0.md](../orchestrators/{P}0.md), so you know what it will ask of you (change effort or Fast, run a dev server, report usage).
- [ ] [START.md](../../START.md) sections 3, 5 and 6: how Codex reaches you, the times that do not move, and what to do if the start breaks.
{read}

## 8. If you prepared before the morning of 21 Nov

Pull `main` again (`git pull --ff-only`) and note what changed:

- The product is called **Endless** wherever a user sees a name. Folder names, `nless.secrets.env` and the LINE channel names keep the old name.
- Both languages are mandatory: every page and every message to a customer exists in Thai and English.
{changed}

## 9. Bring

Laptop and charger · your own phone, paired with the ChatGPT app · a hotspot you can fall back on · {bring}

## 10. You are ready when

- [ ] `preflight.ps1` shows 0 FAIL and the `-OpenAI` run passed.
- [ ] The board check prints `state=open` and your test post was seen by the other two.
- [ ] A notification reached both the desktop and your phone.
- [ ] You can open the competition repo.
- [ ] Every box in section 6 is ticked, or the lead knows which one is not.
- [ ] You told the team your preflight result.

At 10:00 sharp you type the Day line from [START.md](../../START.md): `You are {P}. Start the day: follow START.md section "Day".`
"""

for P, d in PREP_PEOPLE.items():
    text = PREP_TEMPLATE
    for k, v in d.items():
        text = text.replace('{' + k + '}', v)
    text = text.replace('{P}', P)
    path = os.path.join(OUT, 'PREP-' + P + '.md')
    open(path, 'w', encoding='utf-8', newline='\n').write(text)
    print(path, len(text.encode('utf-8')), 'bytes')
