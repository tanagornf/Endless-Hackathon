# คน B: ความรู้ + AI

ชื่อ: Ratha Rotruchiphong (Tart) · GitHub: @RathaTart · หน้านี้คือทุกอย่างที่ B ต้องทำ ถ้าขัดกับ [PLAN.md](../../PLAN.md) ยึด PLAN.md · หัวหน้าทีมดู [LEAD.md](LEAD.md) เพิ่ม

B ถือสมองของระบบ: คลังความรู้ การค้นหา สินค้าและราคา (แหล่งความจริงของ AI), AI ตอบแชต (F10 คือหัวใจของ demo), AI evals ที่พิสูจน์คุณภาพ และ dashboard ผลลัพธ์ของร้าน · orchestrator ของคุณ (B0) ดูแลคุณภาพคำตอบ AI ของทั้งระบบ

## 4 chat ของคุณ (แอป ChatGPT → Codex, model GPT-6.2 Sol ทุกตัว)

| Lane | งาน | worktree · port API/web | prompt ของ chat (เปิดด้วยบรรทัดเดียว) | effort · Fast |
|---|---|---|---|---|
| **B0** orchestrator | มอบงาน ตรวจงาน ยิงชุดคำถามตรวจ AI บน production ดูต้นทุนและ latency | `..\nless-b0` · 3000 / 5170 | [orchestrators/B0.md](../orchestrators/B0.md) 10:15 | High · Fast เปิดตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 |
| B1 | F05 คลังความรู้ (P0) → F07 ค้นหา (P0) → F08 สินค้า (P0) → F37 AI evals (P2) | `..\nless-b1` · 3004 / 5174 | [lanes/B1.md](../lanes/B1.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| B2 | F10 AI ตอบ (P0) → F38 follow-up nudges (P2) → F30 voice (P3) | `..\nless-b2` · 3005 / 5175 | [lanes/B2.md](../lanes/B2.md) 10:15 | Medium · Fast เปิดได้ถึง 13:00 ถ้า usage < 40% |
| B3 | F06 นำเข้าไฟล์ (P1) → F26 insights (P2) → F27 dashboard + ผลลัพธ์ของร้าน (P2) | `..\nless-b3` · 3006 / 5176 | [lanes/B3.md](../lanes/B3.md) 10:15 (รอ `LEAD: OPEN P1`) | Medium · Fast ปิด |

892.5 นาทีงาน (ค่ากลาง) มากที่สุดในทีมเล็กน้อย เพราะ F30 voice (P3) อยู่ท้าย B2 · ถ้า B ตามไม่ทัน หัวหน้าตัด F30 แล้ว F26 ก่อน **ไม่ตัด F37 และตัวเลขของ F27**

## คืนนี้ (บนเครื่องที่จะใช้วันงาน)

รายการเตรียมฉบับเต็มของคุณ (ทำให้ครบก่อน 10:00 เรียงตามลำดับ พร้อมคำสั่ง): **[PREP-B.md](./PREP-B.md)** · ข้อข้างล่างคือสรุป

- [ ] **เริ่มด้วยบรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงานนี้ (`sea`) เป็น project ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์ `You are B. Prepare this PC: follow START.md section "Prep".` · Codex ตั้งค่าเครื่อง รัน preflight ทดสอบเสียงเตือน บอกวิธีตั้งแจ้งเตือนของแอปและจับคู่มือถือ แล้วบอกสิ่งที่คุณต้องทำเองทีละข้อ ([START.md](../../START.md)) รายการข้างล่างคือสิ่งที่มันจะไล่ให้ครบ
- [ ] ทำ [pc-preparation.md](../../docs/day/pc-preparation.md) ให้ครบ: Git + longpaths, Node.js 24, GitHub CLI, แอป ChatGPT ล่าสุด, Neon project ของคุณ, OpenAI project `app-dev` (hard limit US$30), `..\nless.secrets.env`, Playwright chromium แล้วรัน preflight และแจ้งผลในกลุ่ม
- [ ] ตั้ง Codex ในแอปตาม [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md): rules ของ git/gh, ทดสอบ hook MANGO/PONG, ทดสอบ commit จาก worktree, แจ้งเตือน, power plan ไม่ sleep
- [ ] ทดสอบบอร์ดจากเครื่องนี้: `team-board.ps1 check`, `post`, `status`, `read` ([sites-dashboard.md](../../docs/board/sites-dashboard.md))
- [ ] **OpenAI:** รัน smoke test ใน [docs/openai-api.md §14](../../docs/openai-api.md#14-smoke-test-ก่อนวันงาน) ด้วย key `app-dev` ของคุณบนเครื่องวันงาน (preflight ทำให้เมื่อใส่ `-OpenAI`) ถ้า model ไหนได้ 403/404 แจ้งหัวหน้าทันที
- [ ] อ่าน spec ของ F10 ทั้งไฟล์ (prompt, tools, guards) และ F05, F07, F08 · อ่าน §1 + §11 ของ F37, F38, F06, F27
- [ ] เตรียมไฟล์ทดสอบนำเข้า (F06): CSV สินค้า 20 แถวที่มีหัวคอลัมน์ไทย และไฟล์ข้อความ FAQ หนึ่งหน้า (ข้อมูลสังเคราะห์เท่านั้น) เก็บไว้ในเครื่องวันงาน
- [ ] ไมโครโฟนและหูฟังสำหรับ F30 (ถ้าเปิด P3) · ลองว่า browser ขอสิทธิ์ไมค์ได้
- [ ] อ่าน [orchestrators/B0.md](../orchestrators/B0.md) หนึ่งรอบ เพื่อรู้ว่า orchestrator จะขออะไรจากคุณ (ปรับ effort/Fast, รัน dev server, บอก usage)

## 10:00–10:15 เปิดงาน

**บรรทัดเดียว:** เปิดโฟลเดอร์ repo เตรียมงาน (`sea`) ในแอป ChatGPT (Codex) → New chat (This computer) → พิมพ์

```text
You are B. Start the day: follow START.md section "Day".
```

Codex รัน `docs\competition-plan\tools\start-day.ps1 -Person B -Mode Day` ให้: clone repo แข่ง (เครื่องของ C สร้าง repo และ push baseline เองถ้ายังไม่มี เครื่อง A/B รอจน baseline ขึ้น) → สร้าง worktree 4 ตัวพร้อม `.lane` → ตรวจบอร์ด → พิมพ์รายการ 4 โฟลเดอร์กับ **บรรทัดเดียวที่ต้องพิมพ์ในแต่ละ chat** (เก็บไว้ที่ `..\nless-START-B.txt`) · ติดตรงไหน เครื่องจะร้องเตือน ขึ้นแจ้งเตือน Windows และบอกขั้นที่คุณต้องทำ

จากนั้นในแอป ChatGPT (Codex): **Add new project** ทีละโฟลเดอร์ (`..\nless-b0` … `-b3`) → ในแต่ละ project เปิด **New chat → Work in: This computer** → trust project และ Review hooks → ตั้ง model **GPT-6.2 Sol**, effort และ Fast ตามตารางข้างบน, **Approve for me** → **พิมพ์บรรทัดเดียวของ lane นั้น** เช่น `You are B1. Open prompts/lanes/B1.md and do exactly what its text block says, as if I had pasted it here. Start now.` (ไม่ต้องวาง prompt ทั้งบล็อก; วางทั้งบล็อกแทนได้ถ้าต้องการ) · ทุก chat อ่านและวางแผนได้อย่างเดียวจนกว่า `SETUP READY`

(ไม่บังคับ) เปิด terminal หนึ่งตัวใน `..\nless-b0` ค้างไว้เป็นจอที่สอง: `while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }` (เห็นทุกโพสต์ และร้องเตือนเมื่อมี `BLOCKED` หรือมีคนแท็กคุณ)

สคริปต์ใช้ไม่ได้: ทำมือตาม [chatgpt-app-setup.md ข้อ 2–4](../../docs/day/chatgpt-app-setup.md) แล้ววาง prompt ทั้งบล็อกตามตาราง

## ระหว่างวัน

| เวลา | สิ่งที่คุณทำ |
|---|---|
| ~10:50 | `SETUP READY` → B1, B2 ตื่นจาก hook (ไม่ตื่นใน 2 นาที วาง prompt 1 GO) · รันใน terminal ของคุณ: `npm ci` ครั้งเดียวต่อ worktree แล้ว `npm run dev` ใน `nless-b0` และ `nless-b2` · เปิด Fast ของ B0, B1, B2 |
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
| 17:00 | warm แอป: ถาม Demo Chat หนึ่งคำถาม เปิดหน้า turn trace, AI quality และ dashboard ค้างไว้ |

งานประจำของคุณทั้งวัน: ดูกระดิ่ง Activity ของแอป (chat ที่รออนุมัติจะหยุดรอคุณ) · ทำตามบรรทัด "คน B: ปรับ chat <lane> เป็น <effort>, Fast <on/off>" ที่ orchestrator เขียน · รัน dev server และ `npm ci` ใน terminal ของคุณเอง (agent รันเองไม่ได้) · ดู dashboard ทุก 15–20 นาที

ทดสอบด้วยมือที่คุณรับผิดชอบ: คำตอบราคาตรงกับ catalog ทุกครั้งและมี source · ถามของที่ไม่มีแล้วบอกว่าไม่มีข้อมูล ไม่เดา · ขอส่วนลดหรือสั่งให้ลืมกติกาแล้วไม่หลุด · draft ที่ยังไม่ active ไม่ถูกนำไปตอบ · นำเข้า CSV แล้วถามราคาสินค้าใหม่ได้ถูก (จับเวลาตั้งแต่ upload ถึงคำตอบแรก) · หน้า AI quality บอกชัดว่าผลมาจาก fake หรือ model จริง · ตัวเลขบน dashboard ตรงกับที่นับด้วยมือจากแชตทดสอบ

## จะสั่งงานอย่างไร

- **สั่งผ่าน orchestrator ก่อน:** พิมพ์ใน chat ของ B0 ว่าต้องการอะไร ("ให้ B2 ทำ slice QR ก่อน", "ตรวจว่าทำไม production ไม่ตอบ") มันจะส่ง `TASK` หรือ `FIX` ให้เอง และ dashboard จะตรงกับงานจริง
- พิมพ์ตรงใน chat ของ worker เมื่อ: ตอบคำถามที่มันถาม, วาง prompt สั้นจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ), หรือหยุดสิ่งที่กำลังผิดทาง
- chat ตอบช้าหรือลืมกติกา (context ยาว): เปิด chat ใหม่ใน project เดิมด้วย prompt 7 (worker) หรือ prompt 10 (orchestrator)
- ติดเรื่องเดียวเกิน 20 นาที: ปรับ chat นั้นเป็น effort xhigh + Fast จนผ่าน แล้วปรับกลับ · เกิน 45 นาที: ขอหัวหน้าใช้ effort max (ทีละ chat เดียวทั้งทีม)

## ถ้าติด

- **chat ต้องการคุณ:** มันโพสต์ `BLOCKED` (เครื่องนี้ร้อง 3 ครั้ง + แจ้งเตือน Windows) แล้วจบ turn ด้วยบล็อกขึ้นต้น "🛑 ต้องการคน:" → **แอป ChatGPT แจ้งเตือนคุณบนเครื่องและมือถือที่จับคู่** → ตอบใน chat นั้น (หรือจากมือถือ) ภายใน 5 นาที · ต้องตั้งไว้ก่อน: Settings → Notifications (turn completion Always, permission on, question on) และจับคู่มือถือที่ Settings → Connections ([START.md ข้อ 3](../../START.md)) · ประวัติอยู่ที่ `..\nless.alerts.log`
- hook ไม่ปลุก → prompt ที่ตรงกรณีจาก [prompts/README.md](../README.md#prompt-สั้นที่ใช้ซ้ำ)
- แอป ChatGPT ค้าง, commit ไม่ผ่าน (`index.lock`), `npm ci` EPERM → ตารางแก้ใน [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) · ใช้ไม่ได้จริง ๆ ให้เปิด Codex CLI (`codex -C ..\nless-b1`) แทน
- usage ถึง 40%: ปิด Fast ทุก chat · เกิน 50% ก่อน 13:00: ลด worker เป็น effort low · included usage หมด: Codex จะหัก Codex credits US$100 ของคุณต่อเอง (ห้าม login Codex ด้วย API key เว้นแต่หัวหน้าสั่ง)
- Neon ช้าหรือล่ม → สลับ `PG_SERVER_URL` ไป Postgres ใน WSL2 ตาม [environments.md](../../docs/day/environments.md) แล้วรัน `npm run lane:init` + `npm run db:migrate` ใหม่
- คำตอบของ AI ผิด: เปิด turn trace ดูว่าผิดที่ค้นหา (B1), tool หรือ prompt (B2) แล้วบอก B0 ให้ส่ง `TASK` พร้อมข้อความที่ถาม อย่าให้ worker เดา
- OpenAI ตอบ 429 `insufficient_quota` หรือ hard limit เต็ม: แจ้งหัวหน้าทันที (เพิ่ม limit ของ project หรือสลับ key ตาม [failure-drills](../../docs/day/failure-drills.md)) ระหว่างนั้น test ใช้ `MODEL_MODE=fake` ได้
- เรื่องอื่น ๆ ที่อาจพัง: [failure-drills.md](../../docs/day/failure-drills.md)
