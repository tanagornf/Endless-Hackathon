# คน A: inbox, ขาย, ลูกค้า

ชื่อ: Wattanun Teeratanapong · GitHub: @Ikkyuuuu · หน้านี้คือทุกอย่างที่ A ต้องทำ ถ้าขัดกับ [PLAN.md](../../PLAN.md) ยึด PLAN.md · หัวหน้าทีมดู [LEAD.md](LEAD.md) เพิ่ม

A ถือสิ่งที่กรรมการเห็นก่อน: Demo Chat, inbox และการกดรับช่วงแชต (F09, F11 อยู่ใน golden path) ตามด้วยออเดอร์ QR + ตรวจสลิป และ live codes ที่เป็นเรื่องของ Sea/Shopee · orchestrator ของคุณ (A0) ดูแลเส้นทาง demo ทั้งเส้น

## 4 chat ของคุณ (แอป ChatGPT → Codex, model GPT-6.2 Sol ทุกตัว)

| Lane | งาน | worktree · port API/web | prompt ของ chat (เปิดด้วยบรรทัดเดียว) | effort · Fast |
|---|---|---|---|---|
| **A0** orchestrator | มอบงาน ตรวจงาน ทดสอบบน production เดิน demo loop | `..\nless-a0` · 3000 / 5170 | [orchestrators/A0.md](../orchestrators/A0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| A1 | F09 inbox + Demo Chat (P0) → F11 รับช่วงแชต (P0) → F12 template ข้อความ (P2) → F23 broadcast (P2) | `..\nless-a1` · 3007 / 5177 | [lanes/A1.md](../lanes/A1.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| A2 | F13 ออเดอร์ (P1) → F14 QR ต่อออเดอร์ + ตรวจสลิป (P1) → F22 live codes (P2) | `..\nless-a2` · 3008 / 5178 | [lanes/A2.md](../lanes/A2.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |
| A3 | F24 ลูกค้าและแท็ก (P1) → F15 จองนัด (P2) → F16 ปฏิทิน Google (P2) | `..\nless-a3` · 3009 / 5179 | [lanes/A3.md](../lanes/A3.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |

855 นาทีงาน (ค่ากลาง) · ถ้า A ตามไม่ทัน หัวหน้าตัด F16 แล้ว F23 ก่อน

## คืนนี้ (บนเครื่องที่จะใช้วันงาน)

รายการเตรียมฉบับเต็มของคุณ (ทำให้ครบก่อน 10:00 เรียงตามลำดับ พร้อมคำสั่ง): **[PREP-A.md](./PREP-A.md)** · ข้อข้างล่างคือสรุป

- [ ] **เริ่มด้วยบรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงานนี้ (`sea`) เป็น project ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์ `You are A. Prepare this PC: follow START.md section "Prep".` · Codex ตั้งค่าเครื่อง รัน preflight ทดสอบเสียงเตือน บอกวิธีตั้งแจ้งเตือนของแอปและจับคู่มือถือ แล้วบอกสิ่งที่คุณต้องทำเองทีละข้อ ([START.md](../../START.md)) รายการข้างล่างคือสิ่งที่มันจะไล่ให้ครบ
- [ ] ทำ [pc-preparation.md](../../docs/day/pc-preparation.md) ให้ครบ: Git + longpaths, Node.js 24, GitHub CLI, แอป ChatGPT ล่าสุด, Neon project ของคุณ, OpenAI project `app-dev` (hard limit US$30), `..\nless.secrets.env`, Playwright chromium แล้วรัน preflight และแจ้งผลในกลุ่ม
- [ ] ตั้ง Codex ในแอปตาม [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md): rules ของ git/gh, ทดสอบ hook MANGO/PONG, ทดสอบ commit จาก worktree, แจ้งเตือน, power plan ไม่ sleep
- [ ] ทดสอบบอร์ดจากเครื่องนี้: `team-board.ps1 check`, `post`, `status`, `read` ([sites-dashboard.md](../../docs/board/sites-dashboard.md))
- [ ] **ชำระเงิน (F14):** PromptPay ID ทดสอบของร้านสังเคราะห์ (`PROMPTPAY_TEST_ID` ใช้เบอร์/เลขที่ทีมตกลง ไม่มีการโอนจริง) ใส่ใน `..\nless.secrets.env` · ลองสแกน QR ที่สร้างจาก payload ตัวอย่างใน [spec F14](../../docs/specs/F14-payments.md) ด้วยแอปธนาคารจริง **สแกนดูยอดอย่างเดียว ไม่โอน**
- [ ] **ปฏิทิน (F16):** Google OAuth client (redirect `http://localhost:5179/oauth/callback`, `http://localhost:5170/oauth/callback` และ URL ของ production) + test user ที่เพิ่มใน consent screen แล้ว
- [ ] อ่าน spec ของ F09, F11 (P0) ให้ครบ และ §1 + §11 ของ F13, F14, F22, F24
- [ ] (ถ้าเป็น presenter) ซ้อม [demo loop](../../docs/pitch/demo-loop.md) และ [pitch](../../docs/pitch/PITCH.md)
- [ ] อ่าน [orchestrators/A0.md](../orchestrators/A0.md) หนึ่งรอบ เพื่อรู้ว่า orchestrator จะขออะไรจากคุณ (ปรับ effort/Fast, รัน dev server, บอก usage)

## 10:00–10:15 เปิดงาน

**บรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงาน (`sea`) ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์

```text
You are A. Start the day: follow START.md section "Day".
```

Codex รัน `docs\competition-plan\tools\start-day.ps1 -Person A -Mode Day` ให้: clone repo แข่ง (เครื่องของ C สร้าง repo และ push baseline เองถ้ายังไม่มี เครื่อง A/B รอจน baseline ขึ้น) → สร้าง worktree 4 ตัวพร้อม `.lane` → ตรวจบอร์ด → พิมพ์รายการ 4 โฟลเดอร์กับ **บรรทัดเดียวที่ต้องพิมพ์ในแต่ละ chat** (เก็บไว้ที่ `..\nless-START-A.txt`) · ติดตรงไหน เครื่องจะร้องเตือน ขึ้นแจ้งเตือน Windows และบอกขั้นที่คุณต้องทำ

จากนั้นในแอป ChatGPT (Codex): **Add new project** ทีละโฟลเดอร์ (`..\nless-a0` … `-a3`) → ในแต่ละ project เปิด **New chat → Work in: This computer** → trust project และ Review hooks → ตั้ง model **GPT-6.2 Sol**, effort และ Fast ตามตารางข้างบน, **Approve for me** → **พิมพ์บรรทัดเดียวของ lane นั้น** เช่น `You are A1. Open prompts/lanes/A1.md and do exactly what its text block says, as if I had pasted it here. Start now.` (ไม่ต้องวาง prompt ทั้งบล็อก; วางทั้งบล็อกแทนได้ถ้าต้องการ) · ทุก chat อ่านและวางแผนได้อย่างเดียวจนกว่า `SETUP READY`

(ไม่บังคับ) เปิด terminal หนึ่งตัวใน `..\nless-a0` ค้างไว้เป็นจอที่สอง: `while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }` (เห็นทุกโพสต์ และร้องเตือนเมื่อมี `BLOCKED` หรือมีคนแท็กคุณ)

สคริปต์ใช้ไม่ได้: ทำมือตาม [chatgpt-app-setup.md ข้อ 2–4](../../docs/day/chatgpt-app-setup.md) แล้ววาง prompt ทั้งบล็อกตามตาราง

## ระหว่างวัน

| เวลา | สิ่งที่คุณทำ |
|---|---|
| ~10:50 | `SETUP READY` → A1 ตื่นจาก hook (ไม่ตื่นใน 2 นาที วาง prompt 1 GO) · รันใน terminal ของคุณ: `npm ci` ครั้งเดียวต่อ worktree แล้ว `npm run dev` ใน `nless-a0` และ `nless-a1` · เปิด Fast ของ A0 และ A1 |
| 10:50–11:30 | A1 ทำ `saveMessage()` / `getHistory()` ให้จริงก่อน (C2 และ B2 รอ) · คุณลอง Demo Chat บน `http://localhost:5177` |
| 11:30 | บอก % usage ให้ A0 และหัวหน้า · หลัง `LEAD: OPEN P1` A2/A3 เริ่ม: รัน `npm run dev` ให้ lane ที่คุณจะทดสอบด้วยมือ (ไม่เกิน 2–3 ตัวพร้อมกัน) |
| 12:30 | ทดสอบ gate ขั้น 2, 4, 5 บน production ด้วยมือถือของคุณเอง (Demo Chat → inbox → รับช่วง) คู่กับ A0 |
| **13:00** | gate: ถ้าถูกแท็ก `BLOCKED GATE ... TO:A1` ให้ A1 หยุดงานใหม่แล้วแก้ก่อน · ปิด Fast ของ A0 และ A1 |
| 13:00–14:30 | A2: AI เสนอออเดอร์ → ลูกค้ายืนยัน → QR → สลิป · A3: แผงลูกค้าข้างแชต, จองนัด · A1: template และ broadcast เมื่อ P2 เปิด |
| 14:30 | เดิน [demo loop](../../docs/pitch/demo-loop.md) บน production กับ A0 หนึ่งรอบ บอกหัวหน้าว่าขั้นไหนยังไม่ได้ |
| 15:30 | `LEAD: FREEZE` → prompt 5 ทุก worker · เปิด Fast ของ A0 · แก้แค่บั๊ก |
| 16:00–16:30 | เดิน demo loop อีกรอบ แล้วช่วยอัดวิดีโอ ([VIDEO-SCRIPT](../../docs/pitch/VIDEO-SCRIPT.md)) |
| 16:45 | deploy freeze: ไม่ merge อีก ปิด Fast ทุก chat |
| 17:00 | warm แอป: login ค้างไว้ เปิด Demo Chat บนมือถือ ยิงคำถามแรก วาง QR ของ LINE OA บนโต๊ะ |

งานประจำของคุณทั้งวัน: ดูกระดิ่ง Activity ของแอป (chat ที่รออนุมัติจะหยุดรอคุณ) · ทำตามบรรทัด "คน A: ปรับ chat <lane> เป็น <effort>, Fast <on/off>" ที่ orchestrator เขียน · รัน dev server และ `npm ci` ใน terminal ของคุณเอง (agent รันเองไม่ได้) · ดู dashboard ทุก 15–20 นาที

ทดสอบด้วยมือที่คุณรับผิดชอบ: ข้อความใหม่ขึ้นใน inbox ทันทีโดยไม่ต้อง refresh · Demo Chat บนมือถือจริงอ่านง่ายและกดปุ่มได้ · รับช่วงแชตแล้วบอทเงียบจริงและคืนให้ AI ได้ · ออเดอร์ราคาตรงกับ catalog · สลิปยอดไม่ตรง สลิปซ้ำ หรือสลิปแก้ยอด ไม่ทำให้ออเดอร์เป็นจ่ายแล้ว (สถานะ S เพราะไม่ได้ยืนยันกับธนาคาร และหน้าจอต้องบอกเช่นนั้น) · รหัสสินค้าใน live ตอบถูกตัว

## จะสั่งงานอย่างไร

- **สั่งผ่าน orchestrator ก่อน:** พิมพ์ใน chat ของ A0 ว่าต้องการอะไร ("ให้ A2 ทำ slice QR ก่อน", "ตรวจว่าทำไม production ไม่ตอบ") มันจะส่ง `TASK` หรือ `FIX` ให้เอง และ dashboard จะตรงกับงานจริง
- พิมพ์ตรงใน chat ของ worker เมื่อ: ตอบคำถามที่มันถาม, วาง prompt สั้นจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ), หรือหยุดสิ่งที่กำลังผิดทาง
- chat ตอบช้าหรือลืมกติกา (context ยาว): เปิด chat ใหม่ใน project เดิมด้วย prompt 7 (worker) หรือ prompt 10 (orchestrator)
- ติดเรื่องเดียวเกิน 20 นาที: ปรับ chat นั้นเป็น effort xhigh + Fast จนผ่าน แล้วปรับกลับ · เกิน 45 นาที: ขอหัวหน้าใช้ effort max (ทีละ chat เดียวทั้งทีม)

## ถ้าติด

- **chat ต้องการคุณ:** มันโพสต์ `BLOCKED` (เครื่องนี้ร้อง 3 ครั้ง + แจ้งเตือน Windows) แล้วจบ turn ด้วยบล็อกขึ้นต้น "🛑 ต้องการคน:" → **แอป ChatGPT แจ้งเตือนคุณบนเครื่องและมือถือที่จับคู่** → ตอบใน chat นั้น (หรือจากมือถือ) ภายใน 5 นาที · ต้องตั้งไว้ก่อน: Settings → Notifications (turn completion Always, permission on, question on) และจับคู่มือถือที่ Settings → Connections ([START.md ข้อ 3](../../START.md)) · ประวัติอยู่ที่ `..\nless.alerts.log`
- hook ไม่ปลุก → prompt ที่ตรงกรณีจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ)
- แอป ChatGPT ค้าง, commit ไม่ผ่าน (`index.lock`), `npm ci` EPERM → ตารางแก้ใน [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) · ใช้ไม่ได้จริง ๆ ให้เปิด Codex CLI (`codex -C ..\nless-a1`) แทน
- usage ถึง 40%: ปิด Fast ทุก chat · เกิน 50% ก่อน 13:00: ลด worker เป็น effort low · included usage หมด: Codex จะหัก Codex credits US$100 ของคุณต่อเอง (ห้าม login Codex ด้วย API key เว้นแต่หัวหน้าสั่ง)
- Neon ช้าหรือล่ม → สลับ `PG_SERVER_URL` ไป Postgres ใน WSL2 ตาม [environments.md](../../docs/day/environments.md) แล้วรัน `npm run lane:init` + `npm run db:migrate` ใหม่
- ต้องการ field ใหม่ในตาราง core (conversations, messages) → `NEED TO:C1` ห้าม ALTER เอง
- Google ใช้ไม่ได้ในวันงาน → ทำ flow ภายในให้ครบแบบ sandbox ที่ติดป้ายชัด รายงาน S ตามจริง (ฟีเจอร์ที่ไม่ถึง R ถูกซ่อนจากเมนูตอน 15:30)
- เรื่องอื่น ๆ ที่อาจพัง: [failure-drills.md](../../docs/day/failure-drills.md)
