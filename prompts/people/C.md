# คน C: platform, ช่องทาง, ตั้งค่าและสิทธิ์ + production

ชื่อ: Tanagorn Fukuhara · GitHub: @tanagornf · หน้านี้คือทุกอย่างที่ C ต้องทำ ถ้าขัดกับ [PLAN.md](../../PLAN.md) ยึด PLAN.md · หัวหน้าทีมดู [LEAD.md](LEAD.md) เพิ่ม

C ถือคอขวดของทั้งทีม: setup ของ C1 (ทุก lane รอ), production บน Render, ช่องทาง LINE/Meta และสิทธิ์/login · orchestrator ของคุณ (C0) ตรวจ CORE-LOOP GATE 13:00 และเฝ้า production · คุณคือคนที่ถือบัญชี Render, Railway, LINE Demo channel, Meta app และ tunnel

## 4 chat ของคุณ (แอป ChatGPT → Codex, model GPT-6.2 Sol ทุกตัว)

| Lane | งาน | worktree · port API/web | prompt ของ chat (เปิดด้วยบรรทัดเดียว) | effort · Fast |
|---|---|---|---|---|
| **C0** orchestrator | มอบงาน ตรวจงาน **ตรวจ gate 13:00** เฝ้า production หลังทุก merge | `..\nless-c0` · 3000 / 5170 | [orchestrators/C0.md](../orchestrators/C0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| C1 | **F01 setup + deploy (P0)** → F35 jobs/ops (P0) → F39 ChatGPT-ready catalog (P2) → F36 release (P1, 15:15) | `..\nless-c1` · 3001 / 5171 | [C1-setup.md](../C1-setup.md) **~10:05** แล้ว [lanes/C1.md](../lanes/C1.md) ใน chat ใหม่หลัง deploy (S9) | Medium · **Fast เปิดตอน setup** แล้วเปิดได้ถึง 13:00 ถ้า usage < 40% |
| C2 | F17 LINE (P0) → F18 Messenger/Instagram (P1) → F21 ตอบคอมเมนต์ (P2) | `..\nless-c2` · 3002 / 5172 | [lanes/C2.md](../lanes/C2.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| C3 | F04 ตั้งค่าร้าน (P0) → F03 ร้านและสิทธิ์ (P0) → F02 login (P1, ไม่รอ) → F31 แจ้งเตือน (P1) | `..\nless-c3` · 3003 / 5173 | [lanes/C3.md](../lanes/C3.md) 10:15 | Medium · Fast ปิด |

855 นาทีงาน (ค่ากลาง) แต่คุณมีงานมือมากที่สุด (Render, webhook, บัญชี provider) · ถ้า C ตามไม่ทัน หัวหน้าตัด F21 แล้ว F39 แล้ว F31 ก่อน

## คืนนี้ (บนเครื่องที่จะใช้วันงาน)

รายการเตรียมฉบับเต็มของคุณ (ทำให้ครบก่อน 10:00 เรียงตามลำดับ พร้อมคำสั่ง): **[PREP-C.md](./PREP-C.md)** · ข้อข้างล่างคือสรุป

- [ ] **เริ่มด้วยบรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงานนี้ (`sea`) เป็น project ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์ `You are C. Prepare this PC: follow START.md section "Prep".` · Codex ตั้งค่าเครื่อง รัน preflight ทดสอบเสียงเตือน บอกวิธีตั้งแจ้งเตือนของแอปและจับคู่มือถือ แล้วบอกสิ่งที่คุณต้องทำเองทีละข้อ ([START.md](../../START.md)) รายการข้างล่างคือสิ่งที่มันจะไล่ให้ครบ
- [ ] ทำ [pc-preparation.md](../../docs/day/pc-preparation.md) ให้ครบ: Git + longpaths, Node.js 24, GitHub CLI, แอป ChatGPT ล่าสุด, Neon project ของคุณ, OpenAI project `app-dev` (hard limit US$30), `..\nless.secrets.env`, Playwright chromium แล้วรัน preflight และแจ้งผลในกลุ่ม
- [ ] ตั้ง Codex ในแอปตาม [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md): rules ของ git/gh, ทดสอบ hook MANGO/PONG, ทดสอบ commit จาก worktree, แจ้งเตือน, power plan ไม่ sleep
- [ ] ทดสอบบอร์ดจากเครื่องนี้: `team-board.ps1 check`, `post`, `status`, `read` ([sites-dashboard.md](../../docs/board/sites-dashboard.md))
- [ ] **ซ้อม C1 setup** จากโฟลเดอร์ว่างตาม [C1-setup.md](../C1-setup.md) จับเวลา (เป้า 45 นาที ช้าสุด 55) แล้วลบ repo ซ้อมทิ้ง
- [ ] **Render:** บัญชี + บัตร + ซ้อม deploy จาก blueprint หนึ่งรอบ เช็ก region สิงคโปร์, disk, Postgres + `CREATE EXTENSION vector`, WebSocket · **Railway:** บัญชี verify แล้วและซ้อมทางสำรองหนึ่งรอบ ([deployment.md](../../docs/day/deployment.md))
- [ ] **LINE:** สอง Messaging API channel: *NLess Demo* (QR ของ OA นี้พิมพ์ไปวางโต๊ะ; webhook จะชี้ production) และ *NLess Dev* (webhook ชี้ tunnel) ใส่ channel secret/token ของ Dev ใน `..\nless.secrets.env` ส่วนของ Demo ใส่ใน Render เท่านั้น
- [ ] **Meta:** developer app (development mode) + Page ทดสอบ + บัญชี Instagram ทดสอบ + test users/app roles ของทั้งสามคน · จด Graph API version ที่ dashboard แสดง
- [ ] **Tunnel:** cloudflared (หรือ ngrok) ทดสอบรับ webhook ของ LINE Dev ได้ ([environments.md](../../docs/day/environments.md))
- [ ] VAPID keys สำหรับ web push (F31) และ `TOKEN_ENCRYPTION_KEY` สร้างตามคำสั่งใน `.env.example`
- [ ] อ่าน spec ของ F01, F35, F17, F04, F03 ให้ครบ และ §1 + §11 ของ F02, F18, F36, F39
- [ ] อ่าน [orchestrators/C0.md](../orchestrators/C0.md) หนึ่งรอบ เพื่อรู้ว่า orchestrator จะขออะไรจากคุณ (ปรับ effort/Fast, รัน dev server, บอก usage)

## 10:00–10:15 เปิดงาน

**บรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงาน (`sea`) ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์

```text
You are C. Start the day: follow START.md section "Day".
```

Codex รัน `docs\competition-plan\tools\start-day.ps1 -Person C -Mode Day` ให้: clone repo แข่ง (เครื่องของ C สร้าง repo และ push baseline เองถ้ายังไม่มี เครื่อง A/B รอจน baseline ขึ้น) → สร้าง worktree 4 ตัวพร้อม `.lane` → ตรวจบอร์ด → พิมพ์รายการ 4 โฟลเดอร์กับ **บรรทัดเดียวที่ต้องพิมพ์ในแต่ละ chat** (เก็บไว้ที่ `..\nless-START-C.txt`) · ติดตรงไหน เครื่องจะร้องเตือน ขึ้นแจ้งเตือน Windows และบอกขั้นที่คุณต้องทำ

จากนั้นในแอป ChatGPT (Codex): **Add new project** ทีละโฟลเดอร์ (`..\nless-c0` … `-c3`) → ในแต่ละ project เปิด **New chat → Work in: This computer** → trust project และ Review hooks → ตั้ง model **GPT-6.2 Sol**, effort และ Fast ตามตารางข้างบน, **Approve for me** → **พิมพ์บรรทัดเดียวของ lane นั้น** เช่น `You are C1. Open prompts/lanes/C1.md and do exactly what its text block says, as if I had pasted it here. Start now.` (ไม่ต้องวาง prompt ทั้งบล็อก; วางทั้งบล็อกแทนได้ถ้าต้องการ) · ทุก chat อ่านและวางแผนได้อย่างเดียวจนกว่า `SETUP READY`

(ไม่บังคับ) เปิด terminal หนึ่งตัวใน `..\nless-c0` ค้างไว้เป็นจอที่สอง: `while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }` (เห็นทุกโพสต์ และร้องเตือนเมื่อมี `BLOCKED` หรือมีคนแท็กคุณ)

สคริปต์ใช้ไม่ได้: ทำมือตาม [chatgpt-app-setup.md ข้อ 2–4](../../docs/day/chatgpt-app-setup.md) แล้ววาง prompt ทั้งบล็อกตามตาราง

## ระหว่างวัน

| เวลา | สิ่งที่คุณทำ |
|---|---|
| 10:00 | พิมพ์บรรทัดเดียวของ "10:00–10:15 เปิดงาน" (สคริปต์สร้าง repo แข่ง, push baseline ตาม [C1-setup.md ข้อ 0.2](../C1-setup.md) และสร้าง worktree 4 ตัวให้) · **~10:05 เริ่ม C1-setup ใน chat ของ `..
less-c1`** (Fast เปิด) ก่อน chat อื่น |
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
| 17:00 | warm-up บน production (ส่ง LINE หนึ่งข้อความ, upload หนึ่งไฟล์, เปิด voice หนึ่ง session ถ้ามี) แล้วกด demo reset |

งานประจำของคุณทั้งวัน: ดูกระดิ่ง Activity ของแอป (chat ที่รออนุมัติจะหยุดรอคุณ) · ทำตามบรรทัด "คน C: ปรับ chat <lane> เป็น <effort>, Fast <on/off>" ที่ orchestrator เขียน · รัน dev server และ `npm ci` ใน terminal ของคุณเอง (agent รันเองไม่ได้) · ดู dashboard ทุก 15–20 นาที

ทดสอบด้วยมือที่คุณรับผิดชอบ: login ด้วย owner A เห็นเฉพาะร้าน A และ owner B เข้าข้อมูลร้าน A ไม่ได้ · ปิด AI ใน settings แล้วบอทเงียบจริง · ข้อความจาก LINE OA ตัว demo เข้า inbox และได้คำตอบกลับในมือถือ · Messenger/Instagram ส่งรับกับ test user ได้จริง · production ตอบ `/healthz` และ `/build-info` เป็น sha ล่าสุดหลังทุก merge · เมนู production ไม่มีหน้า placeholder

## จะสั่งงานอย่างไร

- **สั่งผ่าน orchestrator ก่อน:** พิมพ์ใน chat ของ C0 ว่าต้องการอะไร ("ให้ C2 ทำ slice QR ก่อน", "ตรวจว่าทำไม production ไม่ตอบ") มันจะส่ง `TASK` หรือ `FIX` ให้เอง และ dashboard จะตรงกับงานจริง
- พิมพ์ตรงใน chat ของ worker เมื่อ: ตอบคำถามที่มันถาม, วาง prompt สั้นจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ), หรือหยุดสิ่งที่กำลังผิดทาง
- chat ตอบช้าหรือลืมกติกา (context ยาว): เปิด chat ใหม่ใน project เดิมด้วย prompt 7 (worker) หรือ prompt 10 (orchestrator)
- ติดเรื่องเดียวเกิน 20 นาที: ปรับ chat นั้นเป็น effort xhigh + Fast จนผ่าน แล้วปรับกลับ · เกิน 45 นาที: ขอหัวหน้าใช้ effort max (ทีละ chat เดียวทั้งทีม)

## ถ้าติด

- **chat ต้องการคุณ:** มันโพสต์ `BLOCKED` (เครื่องนี้ร้อง 3 ครั้ง + แจ้งเตือน Windows) แล้วจบ turn ด้วยบล็อกขึ้นต้น "🛑 ต้องการคน:" → **แอป ChatGPT แจ้งเตือนคุณบนเครื่องและมือถือที่จับคู่** → ตอบใน chat นั้น (หรือจากมือถือ) ภายใน 5 นาที · ต้องตั้งไว้ก่อน: Settings → Notifications (turn completion Always, permission on, question on) และจับคู่มือถือที่ Settings → Connections ([START.md ข้อ 3](../../START.md)) · ประวัติอยู่ที่ `..\nless.alerts.log`
- hook ไม่ปลุก → prompt ที่ตรงกรณีจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ)
- แอป ChatGPT ค้าง, commit ไม่ผ่าน (`index.lock`), `npm ci` EPERM → ตารางแก้ใน [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) · ใช้ไม่ได้จริง ๆ ให้เปิด Codex CLI (`codex -C ..\nless-c1`) แทน
- usage ถึง 40%: ปิด Fast ทุก chat · เกิน 50% ก่อน 13:00: ลด worker เป็น effort low · included usage หมด: Codex จะหัก Codex credits US$100 ของคุณต่อเอง (ห้าม login Codex ด้วย API key เว้นแต่หัวหน้าสั่ง)
- Neon ช้าหรือล่ม → สลับ `PG_SERVER_URL` ไป Postgres ใน WSL2 ตาม [environments.md](../../docs/day/environments.md) แล้วรัน `npm run lane:init` + `npm run db:migrate` ใหม่
- setup ช้ากว่า 10:50: ทำ "ขั้นต่ำ" ของขั้นที่เหลือตาม C1-setup ข้อ 5 แล้วโพสต์ `SETUP READY` ให้ทีมเริ่มก่อน ที่เหลือทำเป็น PR ถัดไป
- deploy ล้มหรือ Render ล่ม: ทำตาม [failure-drills](../../docs/day/failure-drills.md) (rollback ไป deploy ก่อนหน้า หรือสลับไป Railway) และแจ้งทีมด้วย `BLOCKED`
- LINE ไม่ส่ง webhook: เช็ก Verify ใน console, URL, และว่า channel ถูกตัว (Demo ชี้ production เท่านั้น)
- เรื่องอื่น ๆ ที่อาจพัง: [failure-drills.md](../../docs/day/failure-drills.md)
