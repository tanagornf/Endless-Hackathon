# Prompt pack วันแข่ง (12 sessions: 3 orchestrators + 9 workers)

ชุดนี้ใช้กับ **repo แข่งใหม่** วันเสาร์ 21 พ.ย. 2569 ตาม [PLAN.md](../PLAN.md) (ฉบับค่ำ 20 พ.ย. ชนะ `docs/competition-plan/02-07`) และ [DECISIONS D1–D17](../docs/DECISIONS-2026-11-20.md) ทุก prompt วางให้ Codex ได้ทันทีหลังแทนค่า `REPLACE_*` · scope = **31 ฟีเจอร์** (ที่ตัดออกดู [PLAN.md](../PLAN.md#ตัดออกจาก-scope)) · สร้างจาก [build specs](../docs/specs/README.md) ของเราเอง ไม่เปิดโค้ด Papi · AI ของแอปใช้ **OpenAI API อย่างเดียว** ผ่าน `model.*` ของ core ([docs/openai-api.md](../docs/openai-api.md)) · ไม่มีแพ็กเกจ ไม่มีโควตา

## ไฟล์ในชุด

| ไฟล์ | คืออะไร | ใครวาง / เมื่อไร |
|---|---|---|
| [../START.md](../START.md) | **บรรทัดเดียวต่อคนและต่อ chat:** เตรียมเครื่อง, เปิดงาน 10:00 (clone, baseline, worktree 4 ตัว) และบรรทัดที่พิมพ์ในแต่ละ chat แทนการวาง prompt ทั้งบล็อก + การตั้งแจ้งเตือนของแอป (เครื่องและมือถือ) เมื่อ chat ต้องการคน | ทุกคน คืนนี้และ 10:00 |
| [people/A.md](people/A.md) · [B.md](people/B.md) · [C.md](people/C.md) · [LEAD.md](people/LEAD.md) | **เริ่มที่นี่:** หน้าเดียวต่อคน (งานคืนนี้, เปิด worktree 4 ตัวและ chat 4 ตัว, วาง prompt ไหนที่ไหน, สิ่งที่ต้องดูแต่ละ checkpoint, ถ้าติดทำอะไร) + งานเพิ่มของหัวหน้า | แต่ละคนอ่านของตัวเองคืนนี้ |
| [people/PREP-A.md](people/PREP-A.md) · [PREP-B.md](people/PREP-B.md) · [PREP-C.md](people/PREP-C.md) | **ก่อน 10:00:** รายการเตรียมต่อคนแบบครบ เรียงตามลำดับ พร้อมคำสั่ง (เครื่อง, บัญชีและไฟล์ secrets, Codex ในแอป, คำสั่งตรวจ, งานเฉพาะของคนนั้น, สิ่งที่ต้องอ่าน, สิ่งที่เปลี่ยนเช้า 21 พ.ย., เกณฑ์ว่าพร้อม) | คนนั้นทำเองก่อนวันงาน |
| [orchestrators/A0.md](orchestrators/A0.md) · [B0.md](orchestrators/B0.md) · [C0.md](orchestrators/C0.md) | orchestrator ของแต่ละคน: ตารางทั้งวัน, วิธีมอบงานให้ worker, สิ่งที่ตรวจหลัง merge, smoke บน production, แก้ข้าม lane, `STAGE` ทุก 30 นาที, เบรกงบ, gate, freeze | แต่ละคนวาง **10:15** ใน chat ของ project `..\nless-<a0\|b0\|c0>` (effort High) |
| [C1-setup.md](C1-setup.md) | setup ของ C1 (F01): core + model wrapper ของ OpenAI, 29 โฟลเดอร์ฟีเจอร์, fakes ของทุก contract, dev login, library ทั้งวัน, feature flags, CI แล้วตามด้วย deploy production (S9) · แบบสร้างเต็มอยู่ใน [docs/specs/F01-core.md](../docs/specs/F01-core.md) | **C** วาง **~10:05** (effort Medium, Fast เปิด) |
| [lanes/C1.md](lanes/C1.md) | งานของ C1 หลัง `SETUP READY`: F35 → F39 (P2) → F36 (15:15), ดูแล core + `NEED TO:C1` | **C** วางใน chat ใหม่ของ C1 หลัง deploy (S9) เสร็จ |
| [lanes/C2.md](lanes/C2.md) · [C3.md](lanes/C3.md) | LINE, Messenger/Instagram, ตอบคอมเมนต์ · ตั้งค่าร้าน, ร้านและสิทธิ์, login, แจ้งเตือน | **C** วาง **10:15** |
| [lanes/B1.md](lanes/B1.md) · [B2.md](lanes/B2.md) · [B3.md](lanes/B3.md) | ความรู้/ค้นหา/สินค้า/AI evals · AI ตอบ + follow-up nudges + voice · นำเข้าไฟล์/insights/dashboard + ผลลัพธ์ของร้าน | **B** วาง **10:15** |
| [lanes/A1.md](lanes/A1.md) · [A2.md](lanes/A2.md) · [A3.md](lanes/A3.md) | inbox/Demo Chat/ทีม/template/broadcast · orders/QR + ตรวจสลิป/live codes · CRM/จอง/ปฏิทิน | **A** วาง **10:15** |
| ไฟล์นี้ | ภาพรวม lane, ตารางเวลา, core loop, gate, prompt สั้นที่ใช้ซ้ำ, evidence, fallback | คนอ่าน ไม่ต้องวางทั้งไฟล์ |

ไฟล์ที่ prompt อ้างถึง (ต้องอยู่ใน **baseline ของ repo แข่ง** ที่ path เดิม ตาม copy list ใน [C1-setup.md ข้อ 0.2](C1-setup.md)):
`AGENTS.md` (จาก [templates/AGENTS.md](../docs/competition-plan/templates/AGENTS.md)) · [templates/contracts.ts](../docs/competition-plan/templates/contracts.ts) · [templates/.env.example](../docs/competition-plan/templates/.env.example) · [docs/specs/](../docs/specs/README.md) (แบบสร้าง 31 ไฟล์) · [docs/openai-api.md](../docs/openai-api.md) · [docs/COOKBOOK.md](../docs/COOKBOOK.md) · [templates/SPEC.md](../docs/competition-plan/templates/SPEC.md) §5–§6 · [feature-backlog.csv](../docs/competition-plan/feature-backlog.csv) · [docs/day/](../docs/day/deployment.md) (deploy, environments, failure drills) · [docs/pitch/](../docs/pitch/PITCH.md) · [docs/budget-and-priority.md](../docs/budget-and-priority.md) · [docs/porting/](../docs/porting/README.md) (know-how เดิม อ่านประกอบได้ แต่ไม่ใช่แบบสร้าง)

ลำดับความจริงเมื่อขัดกัน: `contracts.ts` (signature) → `AGENTS.md` (กติกา repo) → prompt ของ session → build spec → porting brief → เอกสารเก่า 02–07 · เรื่อง AI ทุก call ยึด [docs/openai-api.md](../docs/openai-api.md)

## ภาพรวม 12 sessions

ลำดับใน lane = ลำดับทำงาน · tier ตาม [PLAN.md](../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง) · นาทีงาน low–high จาก backlog · port = API / web

| Lane | คน | บทบาท · ฟีเจอร์ (tier) | เริ่มเขียนโค้ด | branch แรก | ใน gate 13:00 | นาที | port |
|---|---|---|---|---|---|---|---|
| **C0** | C | orchestrator ของ C + **ตรวจ gate** + ดูแล production | ไม่เขียนฟีเจอร์ | `fix/<lane>/…` เมื่อจำเป็น | ตรวจทั้ง 5 ขั้น | — | 3000 / 5170 |
| C1 | C | F01 core + deploy (P0) → F35 jobs/ops (P0) → F39 ChatGPT-ready catalog (P2) → F36 release (P1, 15:15) | ~10:05 setup | `lane/C1/core` | core | 225–480 | 3001 / 5171 |
| C2 | C | F17 LINE (P0) → F30 voice (P3) · F18/F21 U-deferred | `SETUP READY` | `lane/C2/line` | ขั้น 2 (ทางเลือก) | 150–390 | 3002 / 5172 |
| C3 | C | F04 ตั้งค่าร้าน (P0) → F03 ร้านและสิทธิ์ (P0) → F02 login (P1, ไม่รอ) → F31 แจ้งเตือน (P1) | `SETUP READY` | `lane/C3/business-settings` | ขั้น 1, 5 | 150–315 | 3003 / 5173 |
| **B0** | B | orchestrator ของ B + คุณภาพคำตอบ AI | ไม่เขียนฟีเจอร์ | `fix/<lane>/…` เมื่อจำเป็น | ตรวจขั้น 1, 3 ก่อน | — | 3000 / 5170 |
| B1 | B | F05 คลังความรู้ (P0) → F07 ค้นหา (P0) → F08 สินค้า (P0) → F37 AI evals (P2) | `SETUP READY` | `lane/B1/knowledge` | ขั้น 1, 3 | 180–390 | 3004 / 5174 |
| B2 | B | F10 AI ตอบ (P0) → F38 follow-up nudges (P2) | `SETUP READY` | `lane/B2/ai-agent` | ขั้น 3, 5 | 195–465 | 3005 / 5175 |
| B3 | B | F06 นำเข้าไฟล์ (P1) → F26 insights (P2) → F27 dashboard + ผลลัพธ์ของร้าน (P2) | `LEAD: OPEN P1` | `lane/B3/knowledge-import` | — | 150–405 | 3006 / 5176 |
| **A0** | A | orchestrator ของ A + เส้นทาง demo ที่กรรมการเห็น | ไม่เขียนฟีเจอร์ | `fix/<lane>/…` เมื่อจำเป็น | ตรวจขั้น 2, 4, 5 ก่อน | — | 3000 / 5170 |
| A1 | A | F09 inbox + Demo Chat (P0) → F11 คนรับช่วง (P0) → F12 template (P2) → F23 broadcast (P2) | `SETUP READY` | `lane/A1/inbox` | ขั้น 2, 4, 5 | 180–420 | 3007 / 5177 |
| A2 | A | F13 orders (P1) → F14 QR + ตรวจสลิป (P1) → F22 live codes (P2) | `LEAD: OPEN P1` | `lane/A2/orders` | — (F13 stretch) | 180–420 | 3008 / 5178 |
| A3 | A | F24 ลูกค้าและ tags (P1) → F15 จองนัด (P2) → F16 ปฏิทิน (P2) | `LEAD: OPEN P1` | `lane/A3/crm` | — | 150–360 | 3009 / 5179 |

- **รอ tier:** A2, A3, B3 อ่าน spec และทำแผน เมื่อได้ `SETUP READY` เตรียม env ได้แต่ห้ามเขียนโค้ดจนหัวหน้าโพสต์ `LEAD: OPEN P1` · ฟีเจอร์ P1–P3 ของทุก lane รอ `LEAD: OPEN` ของ tier นั้น
- **ข้อยกเว้น:** C3 ทำ F02 ต่อจาก F03 ได้เลย · C1 เริ่ม F36 เวลา 15:15 ตามนาฬิกา (พัก F39)
- **เมื่อ worker ว่าง:** โพสต์ `NEED TO:<orchestrator> next task` แล้วรอ orchestrator ตอบด้วย `TASK TO:<lane> …`
- **Model ของ Codex:** GPT-6.2 Sol ทุก chat · orchestrator = High · worker = Medium (งานกล = Light/low) · Fast เฉพาะ orchestrator (ตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00), C1 setup และ worker A1, B1, B2, C1, C2 ก่อน 13:00 ตามตารางใน [PLAN.md](../PLAN.md#model-และ-effort-ของ-codex-ต่อประเภทงาน)
- **AI ต่อ lane:** B1 embeddings `text-embedding-3-large`@1536 + rerank ด้วย `fast` + judge ของ evals · B2 `chat`/`fast`/`strong` + tool loop + nudge · C2 Realtime (F30) · B3 parse ไฟล์เองแล้ว `fast` สกัด, insights `chat` · A2 อ่านสลิปด้วย `chat` + รูปแล้วตรวจในโค้ด · A1 `fast` แปล · B1/B3/A1 moderation · C2 ถอดเสียง (stretch) · C1 เป็นเจ้าของ `model.*` ทั้งหมด

## คืนนี้ (ส่วนที่เกี่ยวกับ prompts)

- [ ] **กรอก [`docs/competition-plan/team.json`](../docs/competition-plan/team.json)** (ชื่อ + GitHub login ของ A, B, C, หัวหน้า, ชื่อ repo แข่ง) แล้ว push: `start-day.ps1` แทน `Wattanun Teeratanapong/@Ikkyuuuu`, `B`, `C` และ `Ikkyuuuu` ให้ตอน copy baseline (ไม่ต้องแก้ไฟล์ใต้ `prompts/` ด้วยมือ) · repo/issue ของ GitHub mirror ไม่อยู่ใน prompt: ตั้ง `BOARD_REPO`, `BOARD_ISSUE` (และ `BOARD_TEAM_LOGINS`) ใน `..\nless.secrets.env`
- [ ] baseline ของ repo แข่งมี `prompts/`, `docs/` (รวม `docs/specs/`, `docs/day/`), `AGENTS.md`, `contracts.ts`, `.env.example` และ `.lane`, `.env.*` อยู่ใน `.gitignore` · **ไม่มี** `tools/openai-check` และไม่มีอะไรจาก Papi
- [ ] `..\nless.secrets.env` อยู่ข้าง worktree บน**เครื่องวันงาน**ทุกเครื่อง (ชื่อ key ตาม `.env.example`): `PG_SERVER_URL` (Neon direct endpoint ของคนนั้น), `SESSION_SECRET`, `OPENAI_API_KEY` ของ project **`app-dev` ของคนนั้น**, ค่าบอร์ด `SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET`, `BOARD_SOURCE`, `BOARD_REPO`, `BOARD_ISSUE`, `BOARD_TEAM_LOGINS` และ test key ของ provider เฉพาะคนที่ใช้ (C: LINE Dev / Meta, A: Google)
- [ ] **Preflight:** ทุกคนรัน `docs/competition-plan/tools/preflight.ps1` บนเครื่องวันงานตาม [pc-preparation.md](../docs/day/pc-preparation.md) แล้วแจ้งผลในกลุ่ม
- [ ] **Board test (GitHub issue):** จากเครื่องวันงานทั้ง 3 เครื่องตาม [START.md ข้อ 4](../START.md): `tools/team-board.ps1 check`, `post`, `status`, `stage`, `read` ต้องเห็นใน GitHub issue ที่ปักหมุด · ทีมที่ตั้ง Sites dashboard ไว้ (ไม่บังคับ) ทดสอบเพิ่มตาม [docs/board/sites-dashboard.md](../docs/board/sites-dashboard.md)
- [ ] ซ้อมสร้าง worktree 4 ตัว + เปิด chat 4 ตัวในแอป ChatGPT ต่อเครื่อง + hooks ปลุกด้วย `TO:<lane>`, `TASK` และ `LEAD: OPEN P1` ได้จริง ([chatgpt-app-setup.md](../docs/day/chatgpt-app-setup.md)) ถ้าเครื่องรับ 4 chat ไม่ไหวใช้ [fallback](#fallback-orchestrator--2-workers)
- [ ] C ซ้อม [C1-setup.md](C1-setup.md) จากโฟลเดอร์ว่างแล้วจับเวลา (เป้า 45 นาที ช้าสุด 55 นาที) และซ้อม deploy ขึ้น Render หนึ่งรอบ ([deployment.md](../docs/day/deployment.md)) แล้วลบ repo ซ้อมทิ้ง
- [ ] ตกลงว่าใครเป็นหัวหน้าที่โพสต์ `LEAD: OPEN` / `LEAD: BUDGET` / `LEAD: FREEZE` และดู usage ของทั้ง 3 คน ([LEAD.md](people/LEAD.md))

## ใครวางอะไรเมื่อไร

| เวลา | C | B | A |
|---|---|---|---|
| 10:00 | (หัวหน้าหรือ C) copy baseline เข้า repo แข่งแล้ว push · สร้าง worktree C0–C3 เพิ่มเป็น project · วาง **C1-setup.md** ใน chat ของ C1 (~10:05) | สร้าง worktree B0–B3 เพิ่มเป็น project | สร้าง worktree A0–A3 เพิ่มเป็น project |
| 10:15 | วาง **C0.md**, **C2.md**, **C3.md** | วาง **B0.md**, **B1/B2/B3.md** | วาง **A0.md**, **A1/A2/A3.md** |
| 10:15–10:45 | C1 ทำ setup; C0/C2/C3 อ่าน spec แล้วทำแผน | อ่าน spec + แผน | อ่าน spec + แผน |
| ~10:50 | C1 โพสต์ `SETUP READY <sha>` (ช้าสุด 11:00) แล้ว C ทำ deploy (S9) กับ C1 และ C0 จากนั้นวาง **lanes/C1.md** ใน chat ใหม่ของ C1; hook ปลุก C2/C3 (P0) เริ่ม Phase 1 (ไม่ตื่นใน 2 นาที วาง [GO](#1-go-หลัง-setup-ready)); C0 + C1 + คน C เริ่ม deploy (S9) | B1/B2 (P0) เริ่ม Phase 1; B3 เตรียม env แล้วรอ `LEAD: OPEN P1`; คนรัน `npm run dev` ใน worktree ของ B0 | A1 (P0) เริ่ม Phase 1; A2/A3 เตรียม env แล้วรอ `LEAD: OPEN P1`; คนรัน `npm run dev` ใน worktree ของ A0 |
| 10:50–15:30 | worker merge เองทุก 30–45 นาที · orchestrator ตรวจทุก `DONE`, มอบงานด้วย `TASK`, โพสต์ `STAGE` ทุก 30 นาที · C1 ตอบ `NEED TO:C1` | ตาม lane | ตาม lane |
| 11:30 | **Checkpoint 1:** production ตอบ `/healthz`; ทุก lane ที่ทำ P0 merge PR แรกแล้วหรือโพสต์ `BLOCKED`; หัวหน้าโพสต์ `LEAD: BUDGET` แล้ว `LEAD: OPEN P1` ถ้าผ่าน[เงื่อนไข](../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง) | hook ปลุก B3 | hook ปลุก A2/A3 |
| ~12:00 | seed production + สลับ webhook LINE *NLess Demo* ไป production | | |
| 12:30 | working lunch: คนผลัดกันพัก Codex ทำงานต่อ · A0/B0 ตรวจขั้นของตัวเองบน production แล้วแจ้ง C0 | | |
| **13:00** | **C0 ตรวจ [core-loop gate](#core-loop-gate-1300) บน production** แล้วโพสต์ผล; ผ่านแล้วหัวหน้าโพสต์ `LEAD: BUDGET` + `LEAD: OPEN` P1 (ถ้ายังไม่เปิด) / P2 ตามเงื่อนไข | lane ที่ถูกแท็กหยุดฟีเจอร์ใหม่จนแก้ได้ | เหมือนกัน |
| 14:30 | **Checkpoint 3:** golden path เป็น R รวม F17 ถึง LINE OA ตัว demo จริง; orchestrator ส่งตารางสถานะ + ข้อเสนอตัดฟีเจอร์; หลังจากนี้ PR ที่แตะ golden path ต้องเดิน gate ซ้ำก่อน merge; หัวหน้าโพสต์ `LEAD: BUDGET` + `LEAD: OPEN P3` ถ้าผ่านเงื่อนไข | | |
| 15:15 | C1 เริ่ม F36 release + รวมหลักฐาน | | |
| 15:30 | หัวหน้าโพสต์ `LEAD: FREEZE` → ทุก lane รับ [FREEZE](#5-freeze) · ซ่อนฟีเจอร์ที่ไม่ถึง R | | |
| 15:30–16:30 | orchestrator ทดสอบฟีเจอร์ของคนตัวเองบน production · แก้เฉพาะบั๊ก · 16:30 อัดวิดีโอเสร็จ | B0: real eval หนึ่งรอบ | A0: เดิน demo loop |
| **16:45** | **deploy freeze** + `pg_dump` + ส่งงาน · **17:00 code freeze ผู้จัด** | | |
| 17:00–17:15 | warm แอป + demo reset + ซ้อม [demo loop](../docs/pitch/demo-loop.md) · 17:15 กรรมการเดินโต๊ะ · 19:30 finalists | | |

### เปิด worktree และ chat ของแต่ละคน (10:00–10:15)

**ทางปกติ:** เปิดโฟลเดอร์ planning repo ในแอป ChatGPT (Codex) แล้วพิมพ์ `You are <A|B|C>. Start the day: follow START.md section "Day".` สคริปต์ `start-day.ps1` clone repo แข่ง สร้าง worktree 4 ตัวพร้อม `.lane` และพิมพ์บรรทัดเดียวของแต่ละ chat ให้ ([START.md](../START.md)) · คำสั่งข้างล่างคือทางทำมือเมื่อสคริปต์ใช้ไม่ได้

รันจาก clone หลักของ repo แข่ง ชื่อโฟลเดอร์ `..\nless-<lane>` ตามตารางใน [C1-setup.md](C1-setup.md):

```powershell
git fetch origin
$common = (git rev-parse --git-common-dir).Trim()
Add-Content -LiteralPath (Join-Path $common 'info\exclude') '.lane'   # กัน .lane เข้า git ก่อน setup เพิ่มใน .gitignore
foreach ($lane in 'B0', 'B1', 'B2', 'B3') {                           # A: A0..A3, C: C0..C3
    $path = Join-Path '..' ('nless-' + $lane.ToLower())
    git worktree add --detach $path origin/main
    Set-Content -LiteralPath (Join-Path $path '.lane') -Value $lane -NoNewline
}
```

แล้วในแอป ChatGPT (Codex): **Add new project** ทีละโฟลเดอร์ worktree (4 project) → ในแต่ละ project เปิด **New chat → Work in: This computer** (Local, ไม่ใช้ Worktree mode ของแอป) → trust project และ Review hooks → ตั้ง model **GPT-6.2 Sol**, effort (orchestrator High, worker Medium), Fast ตาม prompt, **Approve for me** → ตรวจด้วย `pwd` และ `type .lane` ([ขั้นตอนละเอียด](../docs/day/chatgpt-app-setup.md)) · หลัง `SETUP READY` แต่ละ lane สร้าง branch `lane/<LANE>/<slug>` จาก `origin/main` เอง (slug ที่มี `/` ใช้ `-` เช่น `lane/C1/core-jobs`) port และ `DATABASE_URL` ต่อ lane `npm run lane:init` เขียนให้ พร้อมค่า AI และบอร์ดจาก `..\nless.secrets.env` · **dev server คนเป็นคนรัน** (`npm run dev` ใน terminal ของตัวเอง) agent ไม่รันเอง

## Core loop (ลำดับเรียกข้าม lane)

ถ้า `contracts.ts` ระบุต่างจากนี้ ให้ยึด `contracts.ts`

1. ลูกค้าส่งข้อความ: Demo Chat (**A1**, ช่องทาง `web`) หรือ webhook LINE (**C2**, F17) / Messenger / Instagram (**C2**, F18) → `saveMessage()` inbound (**A1**, dedup ด้วย provider message id)
2. `saveMessage()` ของข้อความลูกค้าใหม่ enqueue job `ai.reply {conversationId, messageId}` dedupKey `ai.reply:<messageId>`, lockKey `conversation:<id>` (`jobs.enqueue`, **C1**)
3. handler ของ job เป็นของ **B2**: `getBusinessSettings().aiEnabled` (**C3**) → `isHumanTakeover()` (**A1**) → lock ต่อ conversation → `generateReply()` ใช้ `searchKnowledge()` + `getPrice()` (**B1**) และ `model.chat()` (**C1** core → OpenAI)
4. B2 ตรวจสวิตช์ซ้ำ (aiEnabled, takeover) ก่อนบันทึก แล้ว `saveMessage()` outbound → `sendToCustomer(conversationId, parts, { messageId })` (**C1** registry → sender `web` จาก setup หรือ `line` / `facebook` / `instagram` ที่ C2 register) · ไม่มีขั้นเช็กโควตาหรือนับ usage: core เขียน `model_usage` ของทุก model call เอง รายละเอียดอยู่ใน [spec ของ F10](../docs/specs/F10-ai-agent.md)
5. inbox (**A1**) เห็นทั้งสองข้อความ; staff กด takeover → `assignConversation(id, userId)` → ข้อความถัดไป bot เงียบ แต่ยังบันทึก

ทุก request ตรวจ tenant ด้วย `getBusiness()` / `requirePermission()` ของ core (**C1**) ซึ่งอ่านตาราง `memberships` ที่ F03 tenancy (**C3**) เขียน · login ก่อน F02 (**C3**) เสร็จใช้ dev login ของ setup

### Core-loop gate 13:00

**C0 ตรวจบน production** (ร้านสังเคราะห์ A ของ SPEC §5) ทุกข้อต้องเป็นของจริง ไม่ใช่ fake (`/build-info` ต้องเป็น sha ล่าสุดของ `main` และ `modelMode: openai`) · A0 และ B0 ตรวจขั้นของตัวเองตั้งแต่ 12:30 แล้วแจ้ง C0:

| # | ขั้น | เจ้าของ | orchestrator ที่ตรวจก่อน |
|---|---|---|---|
| 1 | owner A login (dev login ที่มี token ได้ หรือ login จริงของ F02) เห็นเฉพาะร้าน A แล้วเพิ่ม knowledge FAQ ที่ active และสินค้า `A-GAME-01` ราคา 149000 minor | B1 + C3 (+ C1 core) | B0, C0 |
| 2 | ลูกค้าถามใน Demo Chat (หรือ LINE OA ตัว demo) ว่าราคา A-GAME-01 | A1 / C2 | A0 |
| 3 | AI ตอบ 1,490 บาท พร้อม source (evidence `catalog:` ใน trace `/ai-settings`); ไม่แต่งราคา; ถามสิ่งที่ไม่มีข้อมูลแล้วไม่เดา · **คำถามภาษาอังกฤษหนึ่งข้อ** ในแชตเดียวกัน: `How much is A-GAME-01?` ต้องได้คำตอบภาษาอังกฤษที่มี `1,490 baht` (trace `replyLanguage: en`) แล้วพิมพ์ไทย `ร้านเปิดกี่โมงคะ` ต้องกลับมาตอบไทย | B2 + B1 | B0 |
| 4 | ข้อความทั้งสองฝั่งอยู่ใน inbox หลัง reload | A1 | A0 |
| 5 | staff takeover แล้วถามอีก bot ไม่ตอบ; ปิด AI ใน settings แล้ว bot ไม่ตอบ | A1 + C3 | A0, C0 |

ผ่าน: `DONE GATE core-loop <sha> TO:B1 TO:B2 TO:A1 TO:C2 TO:C3 TO:A0 TO:B0` · ไม่ผ่าน: `BLOCKED GATE core-loop step <n> TO:<lane เจ้าของ> @Ikkyuuuu` lane ที่ถูกแท็กหยุดฟีเจอร์ปัจจุบัน (commit WIP บน branch) แล้วแก้ gate ก่อน C0 ตรวจซ้ำทุก 15 นาทีจนผ่าน

## บอร์ด (สรุปสำหรับคน)

- **ขั้นต่ำคือ GitHub issue ที่ปักหมุดใน repo แข่ง** (ไม่ต้องตั้ง `SITES_*`): สคริปต์โพสต์และอ่านจาก issue ได้ครบ Sites dashboard เป็นส่วนเสริม · chat ที่จบ turn ฟังบอร์ดผ่าน Stop hook รอบละ 9 นาที รอบที่เงียบ hook ส่ง heartbeat ให้ฟังต่อ (orchestrator ทั้งวัน, worker ประมาณ 70 นาที) · hooks ใช้ไม่ได้ในแอป: ตั้ง scheduled task ใน chat ตาม [START.md ข้อ 4](../START.md)
- ทุก session เรียก `tools/team-board.ps1` เท่านั้น (ตัวเขียนตัวเดียว): `post` โพสต์ลง GitHub issue ที่ปักหมุดเสมอ (และเขียนลง Sites dashboard ด้วยเมื่อตั้ง `SITES_*` ไว้) · `status` อัปเดตการ์ด lane (`STATUS <lane> <feature> <R|S|A|U> <note>` ไม่ปลุกใคร) · `stage` อัปเดตการ์ดคน (`STAGE <A|B|C> <สรุป>` เฉพาะ orchestrator ไม่ปลุกใคร) · `read` อ่านโพสต์ที่ถึง lane จากแหล่งตาม `BOARD_SOURCE` (`start-day.ps1` ตั้ง `github`; ทีมที่ใช้ Sites ตั้ง `sites` ได้ ล่มแล้ว fallback GitHub เอง)
- คำสั่งเต็มอยู่ใน prompt ของทุก session: `post -MessageFile handoff/<postId>.txt -PostId <postId>` · `status <LANE> <ID หรือ none> <R|S|A|U> "<note>" [-Sha <sha>] [-Blocked]` (orchestrator ที่ไม่ได้พูดถึงฟีเจอร์ใช้ `none`; ขีด `-` ใช้ไม่ได้กับ `powershell -File`) · `stage <A|B|C> "<สรุป>"` · `read` (repo/issue จาก `BOARD_REPO`/`BOARD_ISSUE`, lane จาก `.lane`) · `SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET` อยู่ใน `..\nless.secrets.env` (และ `.env.local` ที่ git-ignore) เท่านั้น ห้ามอยู่ใน git หรือโพสต์
- ประเภทโพสต์: `DONE`, `STATUS`, `STAGE`, `TASK TO:`, `NEED TO:`, `CHANGE TO:`, `FIX TO:` / `FIX <lane>` / `DONE FIX`, `BLOCKED`, `SETUP READY` (C1), `DONE GATE` / `BLOCKED GATE` (C0), `DEPLOY FREEZE` (C0, 16:45), `LEAD: OPEN P1|P2|P3`, `LEAD: BUDGET`, `LEAD: FREEZE`, `LEAD: PAPI-REF OPEN` ([ตารางใน PLAN.md](../PLAN.md#ชื่อ-การแท็ก-และประเภทโพสต์))
- **เตือนคน:** chat ที่ต้องการคนโพสต์ `BLOCKED @login` แล้ว**จบ turn** ด้วยบล็อกขึ้นต้น "🛑 ต้องการคน:" → แอป ChatGPT แจ้งเตือนคนบนเครื่องและมือถือที่จับคู่ (Stop hook ไม่รอบอร์ดเมื่อเห็น 🛑) · สำรองในเครื่อง: โพสต์ `BLOCKED` / `BLOCKED GATE` และโพสต์ที่มี `@login` ทำให้สคริปต์บอร์ดเรียก `tools/alert.ps1` (ร้อง 3 ครั้ง + แจ้งเตือน Windows) และหน้าต่าง `watch` ร้องเมื่อมี `BLOCKED` หรือถูกแท็ก · ปิดเสียงด้วย `BOARD_ALERT=0` ([START.md ข้อ 3](../START.md))
- ใครถูกปลุกด้วยอะไร: worker = โพสต์ที่มี `TO:<lane>` ของตัวเอง, `FIX <lane>` ของตัวเอง, `SETUP READY`, `LEAD: OPEN`, `LEAD: FREEZE` · orchestrator = เหมือนกัน บวก `DONE` / `BLOCKED` / `NEED` / `FIX` / `CHANGE` ของ worker ทั้งสามของตัวเอง ผล gate และครบ 30 นาทีหลัง `STAGE` ล่าสุด

## Prompt สั้นที่ใช้ซ้ำ

ใช้เมื่อ hook ไม่ปลุก หรือคนต้องสั่งเอง แทน `<...>` ก่อนวาง

### 1. GO หลัง SETUP READY

ใช้กับ worker ที่ฟีเจอร์แรกเป็น P0 (C2, C3, B1, B2, A1) · A2, A3, B3 ใช้ [prompt 9](#9-tier-เปิดแล้ว-lead-open) หลัง `LEAD: OPEN P1` · orchestrator ใช้ [prompt 10](#10-เริ่ม-chat-ใหม่ของ-orchestrator)

```text
SETUP READY <sha> โพสต์บนบอร์ดแล้ว เริ่ม Phase 1 ของ lane <LANE> ตาม lane prompt:
git fetch origin, สร้าง branch lane/<LANE>/<slug ฟีเจอร์แรก> จาก origin/main (npm ci คนเป็นคนรันใน terminal ถ้ายังไม่ได้รัน),
npm run lane:init (เขียน .env.local ตามตาราง lane ใน prompts/C1-setup.md §2), npm run db:migrate,
โพสต์ STATUS <LANE> <ID> U "เริ่ม <branch>" แล้วทำ slice 1 ตาม §14 ของ docs/specs/<ID>-<slug>.md
```

### 2. ต่อหลังมี DONE จาก lane อื่น (เปลี่ยน fake เป็นของจริง)

```text
มีโพสต์ DONE จาก <lane>: <function>() ของจริง merge แล้วที่ <sha>
1. ทำงานปัจจุบันให้ถึงจุด commit ได้ แล้ว git fetch origin && git rebase origin/main && npm run db:migrate
2. ตรวจว่า signature ใน server/src/features/<slug>/service.ts ตรงกับที่เราเรียก ห้ามแก้ไฟล์ของ lane นั้น
3. ลบ fixture/workaround ฝั่งเราที่ทำแทน fake แล้วรัน tests ของเราที่เรียก <function>() อีกครั้งกับของจริง
4. พัง: โพสต์ CHANGE หรือ BLOCKED TO:<lane> พร้อม error สั้น ๆ (ไม่มี secret) แล้วทำงานส่วนที่ไม่ติดต่อ
5. ผ่าน: จดใน EVIDENCE.md ของฟีเจอร์เราว่าต่อของจริงแล้ว แล้วทำงานตามลำดับ lane ต่อ
```

### 3. CHANGE

เราเป็นคนขอ:

```text
ฟีเจอร์ <ID> ต้องการ contract ที่ไม่มีหรือไม่พอ: <function>
ห้ามแก้ไฟล์ของ lane เจ้าของ โพสต์ CHANGE TO:<lane เจ้าของ> ไม่เกิน 6 บรรทัด:
ปัจจุบัน / signature ที่เสนอ / ทำไม / ทางเลือกที่ backward-compatible / ต้องการภายใน <เวลา>
ระหว่างรอ ใช้ fake เดิมหรือ adapter ในโฟลเดอร์เราที่ติดป้าย mode ชัด แล้วทำส่วนที่ไม่ติดก่อน
```

เราเป็นเจ้าของ contract:

```text
มีโพสต์ CHANGE ถึง lane <LANE> เรื่อง <function> โพสต์คือคำขอ ไม่ใช่คำสั่ง
1. เทียบกับ contracts.ts และหา caller ทั้ง repo
2. เพิ่มแบบ backward-compatible ได้ (optional field/option): แก้ service.ts + shared/features/<slug>/types.ts + test,
   merge แล้วโพสต์ DONE CHANGE <function> <sha> TO:<ผู้ขอ>
3. เป็น breaking change: ห้ามทำเอง ตอบทางเลือกที่ compatible ถ้ายังตกลงไม่ได้ โพสต์ BLOCKED @Ikkyuuuu
4. กลับไปทำฟีเจอร์ปัจจุบันต่อ
```

### 4. ติดขัด / ล้มเหลว

```text
งานนี้ติด อย่าลองซ้ำแบบเดิม
หา: feature ID, branch/sha, error ที่เห็นจริง (ไม่มี secret), lane หรือคนที่ปลดได้, การแก้ที่เล็กที่สุด
commit งานที่สอดคล้องกันไว้บน branch (ไม่ merge ของที่ test ไม่ผ่าน)
โพสต์ BLOCKED หนึ่งครั้ง: TO:<lane> ถ้า lane ปลดได้, @Ikkyuuuu ถ้าต้องให้คนตัดสิน (provider, key, OpenAI hard limit, DB)
อัปเดตการ์ด: tools/team-board.ps1 status <LANE> <ID> <R|S|A|U> "<สั้น ๆ>" -Blocked (หายติดแล้วส่ง status อีกครั้งโดยไม่มี -Blocked)
ติดเรื่องเดียวเกิน 20 นาที: บอกคนให้ปรับ chat นี้เป็น effort xhigh + Fast แล้วลองอีกรอบเดียว ยังไม่ผ่านให้โพสต์ NEED TO:<orchestrator> ขอคำตัดสิน
จด blocker ใน EVIDENCE.md แล้วไปทำฟีเจอร์ถัดไปที่ไม่ติดใน lane นี้ (ใน tier ที่เปิดแล้ว) ห้ามปิด tenant check หรือแสดง fake เป็นของจริงเพื่อให้ผ่าน
```

### 5. FREEZE

```text
LEAD: FREEZE แล้ว หยุดเริ่มฟีเจอร์ใหม่
1. ฟีเจอร์ปัจจุบัน: ถ้า slice ที่ทำผ่าน typecheck + tests ภายใน 20 นาที ให้ PR + merge แล้วโพสต์ DONE
   ถ้าไม่ผ่าน ห้าม merge; push branch ไว้และรายงานตามจริง
2. อัปเดต EVIDENCE.md ของทุกฟีเจอร์ใน lane: status, actual_mode (R/S/A/U), commit, tests ที่รันจริง, blocker
   (merge PR ที่แก้เฉพาะ EVIDENCE.md ได้) แล้วโพสต์ STATUS ของแต่ละฟีเจอร์
3. ช่วยทดสอบ acceptance ของฟีเจอร์ตัวเองบน production (npm run e2e -- <slug> ด้วย E2E_BASE_URL) แล้วรายงานผล แก้เฉพาะบั๊กที่ orchestrator หรือหัวหน้ามอบให้
4. 16:45 deploy freeze: หลังจากนี้ห้าม merge และห้าม push เข้า main
ห้ามเพิ่ม dependency ห้าม refactor ห้ามเปลี่ยนสถานะเป็น R โดยไม่มีผลรันจริงบน production
```

### 6. เขียน evidence row

```text
บันทึก evidence ของ <ID> ใน server/src/features/<slug>/EVIDENCE.md (F01/F35: server/src/core/EVIDENCE.md)
แก้แถว Status: status, actual_mode, provider_gate, commit_sha, tests_evidence (คำสั่ง + ผลจริง), checked_at_bangkok, blocker (หรือ next)
เพิ่มหนึ่งแถว Log: เวลา Bangkok / สิ่งที่ Codex ทำ (paths) / สิ่งที่คนตรวจหรือแก้จริง (ไม่มีให้เขียน "-") / PR หรือ commit / tests + ผลจริง / mode + provider env (รวม model id ของ OpenAI ถ้าเรียกจริง)
ห้ามแต่งผล test หรือการแก้ของคน ห้ามใส่ secret, token, ข้อความลูกค้าจริง
```

### 7. เริ่มเซสชันใหม่ (context เต็ม / Codex ปิด / หลัง DONE เพื่อประหยัด token)

```text
คุณคือ Codex ของ lane <LANE> (worker) ต่อจาก chat เดิม อ่าน .lane, AGENTS.md, prompts/lanes/<LANE>.md และ spec ของฟีเจอร์ที่กำลังทำ (docs/specs/<ID>-<slug>.md)
ตรวจ git status, branch, git log -5 และโพสต์บอร์ดล่าสุดที่ถึง lane นี้ก่อน (tools/team-board.ps1 read)
ฟีเจอร์ที่เสร็จแล้ว: <IDs> · กำลังทำ: <ID> บน <branch> · main ล่าสุดที่ได้: <sha> · tier ที่เปิดแล้ว: <P0..P3> · เวลาตอนนี้: <HH:MM>
ห้ามเริ่มฟีเจอร์ที่เสร็จใหม่ ห้าม reset งานคนอื่น ถ้าข้อความนี้ขัดกับสถานะจริงใน repo ให้เชื่อ repo
ทำฟีเจอร์ปัจจุบันต่อจนจบตาม lane prompt แล้วไปฟีเจอร์ถัดไปที่ tier เปิดแล้ว ถ้าไม่มีให้โพสต์ NEED TO:<orchestrator> next task
```

### 8. NEED library หรือ core

```text
ฟีเจอร์ <ID> ต้องใช้ <library@version หรือการแก้ core / option ใหม่ของ model.*> ห้ามแก้ package.json, lockfile หรือ server/src/core เอง
ห้ามขอ AI SDK หรือ provider อื่น (AI ทั้งหมดผ่าน model.* ของ core ที่เรียก OpenAI)
โพสต์ NEED TO:C1: อะไร / ใช้ทำอะไร / ต้องการภายใน <เวลา> แล้วทำส่วนอื่นต่อจนกว่า C1 โพสต์ DONE พร้อม sha
```

### 9. tier เปิดแล้ว (`LEAD: OPEN`)

ใช้เมื่อ hook ไม่ปลุก lane หลังหัวหน้าโพสต์ `LEAD: OPEN <tier>` (A2, A3, B3 ใช้ตัวนี้เริ่มฟีเจอร์แรกหลัง `LEAD: OPEN P1`)

```text
หัวหน้าโพสต์ LEAD: OPEN <tier> แล้ว ฟีเจอร์ถัดไปของ lane <LANE> ที่อยู่ใน tier ที่เปิดแล้วเริ่มได้
git fetch origin → สร้าง branch lane/<LANE>/<slug> จาก origin/main → npm ci → npm run lane:init → npm run db:migrate
→ โพสต์ STATUS <LANE> <ID> U "เริ่ม <branch>" → ทำตาม Phase 1 ของ lane prompt
ฟีเจอร์ที่ tier ยังไม่เปิด ห้ามเริ่ม · ถ้า context ของเซสชันนี้ยาวแล้ว ให้คนเปิดเซสชันใหม่ด้วย prompt 7 ก่อน
```

### 10. เริ่ม chat ใหม่ของ orchestrator

ใช้เมื่อ context ของ orchestrator ยาว (ตอบช้า ลืมกติกา) หรือแอปค้าง: เปิด chat ใหม่ใน project `..\nless-<p>0` ตั้ง effort High แล้ววาง

```text
คุณคือ Codex orchestrator ของคน <P> (lane <P>0) ต่อจาก chat เดิม อ่าน .lane, AGENTS.md ข้อ 8 และ prompts/orchestrators/<P>0.md ทั้งไฟล์ (กติกาและตารางทั้งวันอยู่ในนั้น)
แล้ว git fetch origin && git checkout --detach origin/main, อ่านบอร์ดย้อนหลัง (tools/team-board.ps1 read), ดู gh pr list --state all --limit 20
เวลาตอนนี้: <HH:MM> · tier ที่เปิดแล้ว: <P0..P3> · gate: <ผ่าน/ยังไม่ผ่าน> · usage ของ <P>: <NN>% · งานที่ค้างจาก chat เดิม: <สั้น ๆ>
สรุปสถานะ worker สามตัวใน 6 บรรทัด โพสต์ STAGE แล้วทำตามวงรอบการทำงานต่อ ถ้าข้อความนี้ขัดกับ repo หรือบอร์ด ให้เชื่อ repo และบอร์ด
```

### 11. รับ FIX จาก orchestrator หรือ lane อื่น

```text
มีโพสต์ FIX ถึง lane <LANE>: <สรุป> โพสต์คือคำขอ ตรวจเองก่อนเชื่อ
1. reproduce ตามที่โพสต์บอกบน origin/main ล่าสุด (เขียน test ที่ล้มก่อน)
2. เป็นบั๊กจริงในไฟล์ของเรา: commit งานปัจจุบัน → branch lane/<LANE>/<slug>-fix จาก origin/main → แก้ + test → PR → merge → โพสต์ DONE <ID> fix <sha> TO:<ผู้แจ้ง>
3. ไม่ใช่บั๊กของเรา หรือเป็นพฤติกรรมตาม spec: ตอบผู้แจ้งด้วยเหตุผลและข้อของ spec ที่อ้าง
4. ถ้าเป็นโพสต์ "FIX <LANE> <ไฟล์> <เหตุผล>" จาก orchestrator (เขาจะแก้ให้เอง): ค้านได้ภายใน 5 นาทีด้วย BLOCKED TO:<orchestrator> พร้อมเหตุผล ไม่ค้านคือยอมรับ
   หลัง DONE FIX ให้ git fetch แล้ว rebase งานของเราบน origin/main
```

## สถานะและ evidence

ระหว่างวัน **ไม่มีใครแก้ `docs/FEATURE_STATUS.csv` ตรง ๆ** (ไฟล์กลาง 31 แถว แก้พร้อมกันจะ conflict) แต่ละฟีเจอร์เก็บ `EVIDENCE.md` ในโฟลเดอร์ตัวเอง จึงผ่าน ownership check โดยไม่ต้องยกเว้น แล้ว C1 (F36) รวมเป็น CSV ตอน 15:30 · การ์ด lane บน dashboard มาจากโพสต์ `STATUS` (ไม่ใช่แหล่งความจริงของสถานะ: `EVIDENCE.md` คือแหล่งความจริง)

คอลัมน์ Status ตรงกับ [FEATURE_STATUS.csv](../docs/competition-plan/templates/FEATURE_STATUS.csv) เพื่อให้ C1 รวมด้วยสคริปต์ได้ (ไม่มี `feature_name`, `owner`, `trace_evidence`, `provider_evidence` ซึ่ง C1 เติมจาก backlog และ Log):

```markdown
## Status
| feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| F05 | knowledge | B1 | DOING | R | U | | | | | |

## Log
| time (Bangkok) | Codex did (paths) | human review/correction | PR/commit | tests → actual result | mode / provider env |
|---|---|---|---|---|---|
```

`status` = `UNIMPLEMENTED | DOING | BLOCKED | DONE` · `actual_mode` = `R | S | A | U` ตาม [SPEC §4](../docs/competition-plan/templates/SPEC.md) · ฟีเจอร์ที่บางส่วนต่าง mode ให้แตกแถว เช่น `F17 line webhook=R` กับ `F17 line push=S` หรือ `F14 payments slip-vision=S`

## Fallback: orchestrator + 2 workers

ใช้เมื่อเครื่องหรือ usage ของคนใดรับ 4 chat ไม่ไหว (RAM ต่ำกว่า 16 GB, แอปค้างซ้ำ ๆ หรือเบรกงบสั่งลด) หัวหน้าโพสต์ `CHANGE` ว่าคนไหนใช้ fallback แล้วทุกคนแท็กเจ้าของใหม่ (lane 3 ของคนนั้นไม่มีแล้ว โพสต์ `TO:<X>3` จะไม่มีใครรับ) · orchestrator ยังอยู่เสมอ · ฟีเจอร์ golden path ถูกดันขึ้นหน้า งานท้าย lane อาจไม่ทัน ให้รายงาน U ตามจริง · port/DB ใช้ของ lane 1/2 เดิม · ไม่มีฟีเจอร์ไหนมีเจ้าของสองคน

| คน | Lane 1 ใหม่ | Lane 2 ใหม่ |
|---|---|---|
| C | **C1:** F01 → F35 → F03 → F02 → F39 → F36 | **C2:** F04 → F17 → F18 → F21 → F31 |
| B | **B1:** F05 → F07 → F08 → F06 → F37 → F27 | **B2:** F10 → F38 → F26 |
| A | **A1:** F09 → F11 → F24 → F12 → F23 | **A2:** F13 → F14 → F22 → F15 → F16 |

เหตุผล: C1 ถือ core + tenancy + login (ทั้งหมดอยู่ใกล้ `auth.ts` ของ core) และ F36 อยู่ท้าย C1 เสมอ · C2 ทำ F04 (สวิตช์ AI ที่ gate ใช้) ก่อน F17 เพราะ gate ผ่านด้วย Demo Chat ได้ · F06 นำเข้าไฟล์ กลับไป B1 คู่กับ knowledge/catalog ที่มันเขียน draft ลง ตามด้วย F37 และ F27 · F26 insights ไป B2 คู่กับ AI · F24 (`getCustomer` ที่ broadcast/insights ใช้) ไป A1 · F15/F16 ไป A2 คู่กับ orders เพราะเป็น proposal + consent แบบเดียวกัน · ในแต่ละ lane เรียง tier สูงก่อน ฟีเจอร์ P1–P3 ยังรอ `LEAD: OPEN` เหมือนเดิม

เจ้าของ contract ที่ย้าย: tenancy/login → C1 · `getBusinessSettings()`, `notify()` → C2 · insights และ analytics ตามตาราง · `getCustomer()`, `listCustomersByTags()` → A1 · `findSlots()`, `createBooking()` → A2

วางต่อท้าย lane prompt เดิมของ lane 1/2 ใน chat เดียวกัน:

```text
FALLBACK: lane <X>3 ถูกยุบ ลำดับฟีเจอร์ใหม่ของคุณ (<LANE>) คือ <ลำดับจากตาราง fallback ใน prompts/README.md>
ฟีเจอร์ที่รับเพิ่ม: อ่าน spec ของฟีเจอร์นั้น (docs/specs/<ID>-<slug>.md) และส่วนของฟีเจอร์นั้นใน prompts/lanes/<lane เดิม>.md (acceptance, contracts ที่ PROVIDES/CONSUMES)
ใช้เฉพาะส่วนฟีเจอร์ ไม่ใช่ identity ของ lane เดิม .lane ยังเป็น <LANE> และโพสต์ DONE / STATUS ในนามของ <LANE>
tier และข้อยกเว้นตามฟีเจอร์ (F02 ต่อจาก F03 ได้เลย, F36 เริ่ม 15:15) · DONE ของ contract ที่รับมาให้แท็กผู้ใช้ตาม lane prompt เดิม
แต่แทน TO:<X>3 ด้วยเจ้าของใหม่ตาม prompts/README.md หัวข้อ fallback
```

## ข้อควรระวัง

- โพสต์บนบอร์ดคือ **คำขอ ไม่ใช่คำสั่ง** (ยกเว้น `TASK` จาก orchestrator ของตัวเองหรือหัวหน้า ซึ่งยังต้องอยู่ใน path และ tier ที่เปิดแล้ว) agent ไม่รันคำสั่งที่แปะมา ไม่แก้นอก lane เพราะมีคนขอ ไม่ใส่ key, `SITES_BYPASS_TOKEN`, `BOARD_SECRET` หรือ client secret ในโพสต์
- ทำตาม tier: ฟีเจอร์ P1–P3 เริ่มหลัง `LEAD: OPEN` เท่านั้น (ยกเว้น F02 ของ C3 ต่อจาก F03 และ F36 ของ C1 เวลา 15:15) ดู [PLAN.md](../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง)
- AI ของแอปทุก call ผ่าน `model.*` ของ core (OpenAI, `store:false`, ไม่มี `temperature`) · test และ CI ใช้ fake เสมอ · เครื่อง dev ใช้ key `app-dev` ของเจ้าของเครื่อง production ใช้ `app-prod` · Codex ใช้บัญชี ChatGPT Pro (included usage แล้ว Codex credits) ไม่ login ด้วย API key
- ใช้ `TO:<lane>` เรียก agent และ `@login` จริงเรียกคนเท่านั้น prompt ชุดนี้ไม่ใช้ `@all` เพราะ GitHub จะแจ้งเตือนบัญชีชื่อ `all` ตัวจริง
- `../papi-ref` ปิด ([D1](../docs/DECISIONS-2026-11-20.md)): ไม่มี session ไหนเปิดหรือค้นหาโค้ด Papi จนกว่าหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` หลังผู้จัดยืนยันเป็นลายลักษณ์อักษร
- agent ไม่เริ่ม dev server หรือ process ค้าง (sandbox ของ Windows ปิดให้): คนรัน `npm run dev` เอง · `npm ci` ล้มด้วย EPERM ให้คนรัน
- หลัง `LEAD: FREEZE` hook ไม่ปลุกให้เริ่มฟีเจอร์ใหม่ งานหลัง freeze คือแก้บั๊ก ทดสอบบน production และบันทึกสถานะ · หลัง 16:45 ห้าม merge
