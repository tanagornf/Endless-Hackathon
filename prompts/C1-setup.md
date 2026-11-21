# C1 setup: จาก repo ว่างถึง `SETUP READY <sha>` แล้ว production deploy (S9)

คนเปิด chat: **C** (ทางปกติ: พิมพ์บรรทัดเดียวของ C1 ใน [START.md](../START.md) แล้ว Codex อ่านบล็อกข้อ 1 เอง · การวางทั้งบล็อกเป็นทางสำรอง) · แชต Codex ของ **C1** (โปรเจกต์ `..\nless-c1` → New chat → This computer / Local) · ก่อนส่งข้อความแรก: model **GPT-6.2 Sol**, effort **Medium**, **Fast เปิด**, Approve for me · วางประมาณ **10:05** (หลังข้อ 0.2 เสร็จ) · เป้า `SETUP READY` **≈ 10:45–10:50** (ช้าสุด **11:00** = timebox S1–S8 เต็ม 55 นาที) แล้ว **S9 production deploy ก่อน 11:30**
นี่คือ critical path ของทั้งทีม: อีก 11 session เขียนโค้ดไม่ได้จนกว่าจะมีโพสต์นี้ ระหว่างนั้นทุก session อ่าน spec ของตัวเองและวางแผนแบบ read-only
**รายละเอียดการสร้างทั้งหมดอยู่ใน [docs/specs/F01-core.md](../docs/specs/F01-core.md)** (โครงไฟล์, library พร้อมเวอร์ชัน, ขั้น S1–S9, schema, พฤติกรรม core, scripts, CI, acceptance) · พรอมต์ในข้อ 1 สั้นโดยตั้งใจ: สั่งให้ทำตาม spec ทีละขั้น

ไฟล์ที่ prompt อ้างถึง (path นับจาก root ของ repo แข่ง หลัง copy ในข้อ 0.2):
[`contracts.ts`](../docs/competition-plan/templates/contracts.ts) · [`AGENTS.md`](../docs/competition-plan/templates/AGENTS.md) · [`.env.example`](../docs/competition-plan/templates/.env.example) · [`SPEC.md`](../docs/competition-plan/templates/SPEC.md) §5 · [`docs/specs/F01-core.md`](../docs/specs/F01-core.md) · [`docs/day/deployment.md`](../docs/day/deployment.md) (S9) · [`docs/openai-api.md`](../docs/openai-api.md) · [prompts/README.md](README.md) (core loop + gate 13:00) · ตัวช่วยฝั่งคน: [chatgpt-app-setup](../docs/day/chatgpt-app-setup.md), [pc-preparation](../docs/day/pc-preparation.md)

## 0. คนทำก่อนวาง (ไม่ใช่ Codex)

### 0.1 คืนก่อนวันงาน (ซ้อม ต้องเสร็จก่อนวันงาน)

- [ ] ทั้ง 3 เครื่อง: `node -v` = v24.x, `npm -v` ≥ 11, `git`, `git config --global core.longpaths true`, `gh auth status` ผ่าน (รายการเต็มของเครื่อง: [pc-preparation](../docs/day/pc-preparation.md))
- [ ] **ฐานข้อมูล dev = Neon project ของแต่ละคน** (Singapore): ใน `..\nless.secrets.env` ใส่ `PG_SERVER_URL=postgres://<user>:<pass>@<host direct ไม่มี -pooler>/neondb?sslmode=require` หรือรูปที่ Neon ให้ (ส่วน server เท่านั้น: `lane:init` ต่อชื่อ DB `nless_hack_<lane>` ให้) · ตรวจคืนนี้ว่า `CREATE DATABASE nless_probe` และ `CREATE EXTENSION vector` ผ่านบน endpoint นั้น แล้ว drop · user ต้อง `CREATE DATABASE` ได้ · **fallback:** Postgres 16 + pgvector ใน WSL (`PG_SERVER_URL=postgres://postgres:<pass>@127.0.0.1:5432`)
- [ ] ไฟล์ secrets ต่อเครื่อง **นอก repo**: `..\nless.secrets.env` (ข้าง worktree) ใส่ `PG_SERVER_URL`, `OPENAI_API_KEY` (**key ส่วนตัวของคนนั้นจาก OpenAI project `app-dev`, hard limit US$30** พิมพ์เองจาก dashboard), test key ของ LINE / Meta developer app / Google OAuth (ตามชื่อใน `.env.example`) และค่าบอร์ด `SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET`, `BOARD_SOURCE=sites` (ทดสอบ Sites ไม่ผ่าน = `github`), `BOARD_REPO=<owner>/<repo แข่ง>`, `BOARD_ISSUE=<เลข issue บอร์ดที่ปักหมุด>`, `BOARD_TEAM_LOGINS` · `SESSION_SECRET` และ `TOKEN_ENCRYPTION_KEY` ไม่ต้องใส่ (`lane:init` สุ่มให้) · ชื่อ key ตาม `.env.example` เท่านั้น
- [ ] key ของ production (project `app-prod`, hard limit US$60) **ไม่อยู่ในไฟล์ของใครเลย** ใส่ใน Render env วันงานโดยหัวหน้าหรือ C เท่านั้น
- [ ] C: บัญชี Render + บัตร + ซ้อม Blueprint ตาม [docs/day/deployment.md](../docs/day/deployment.md) · บัญชี Railway ยืนยันแล้ว (fallback)
- [ ] ซ้อม prompt ข้อ 1 ใน repo ทิ้งได้ (private, ว่าง) จับเวลา แก้ prompt/spec ที่ planning repo แล้ว **ลบ repo ซ้อมทิ้ง** โค้ดวันงานต้องเขียนใหม่ในวันงาน
- [ ] ระหว่างซ้อมให้ `npm install` ครบ list ใน spec S1 ทั้ง 3 เครื่อง เพื่อ warm npm cache + `npx playwright install chromium` หนึ่งครั้ง
- [ ] ระหว่างซ้อม รัน `npm run smoke:openai` ด้วย key `app-dev` ของตัวเองเทียบกับ smoke test ใน [docs/openai-api.md §14](../docs/openai-api.md#14-smoke-test-ก่อนวันงาน) (model ไหนได้ 403/404 แก้ `.env.example` ก่อนวันงาน)
- [ ] GitHub Actions เปิดใช้ได้ใน org/บัญชีที่จะสร้าง repo แข่ง
- [ ] แทน `Ikkyuuuu` และ `Tanagorn Fukuhara`/`tanagornf` ในไฟล์นี้และ prompts อื่น · `tools/team-board.ps1 check` ผ่านทั้ง 3 เครื่อง
- [ ] ส่งอีเมลถึงผู้จัดเรื่องการใช้โค้ดบริษัทเป็น reference (D1) แล้วจดคำตอบใน `SOURCE-BASELINE.md` (ค่าเริ่มต้น: ไม่ใช้ ไม่มีโค้ดอื่นนอกจากที่เขียนวันงานและเอกสารเตรียมงานที่ประกาศไว้)

### 0.2 10:00 copy จาก planning repo เข้า repo แข่ง (หัวหน้าหรือ C)

**ทางปกติ: ใช้สคริปต์หลัง C ให้สัญญาณเริ่ม** คน C เปิด planning repo ใน Codex แล้วพิมพ์ `You are C. Start the day: follow START.md section "Day".` ([START.md](../START.md)) · ตั้งชื่อ repo แข่ง public ใหม่และล้างพิกัดบอร์ดซ้อมตาม START.md Day ก่อน · สคริปต์ `docs\competition-plan\tools\start-day.ps1 -Person C -Mode Day` สร้าง repo และปักหมุด issue บอร์ด, copy ตามตารางนี้เฉพาะไฟล์ที่อยู่ใน git, แทน `REPLACE_*_LOGIN` / `_NAME` จาก `docs/competition-plan/team.json`, commit, push แล้วสร้าง worktree ข้อ 0.3 · หลัง C อนุมัติและเตรียม repo กับ board แล้ว หัวหน้าช่วย push baseline ได้ด้วย `start-day.ps1 -Person <ตัวเอง> -Mode Day -Baseline` · ใช้คำสั่งข้างล่างเมื่อสคริปต์ใช้ไม่ได้

| จาก planning repo | ไป repo แข่ง | ทำไม |
|---|---|---|
| `docs/competition-plan/templates/AGENTS.md` | `AGENTS.md` | Codex โหลดอัตโนมัติจาก root เท่านั้น |
| `docs/competition-plan/templates/contracts.ts` | `contracts.ts` | signature ทุก contract, fake, seed (C1 แตกไฟล์จากนี้) |
| `docs/competition-plan/templates/.env.example` | `.env.example` | ชื่อ env ทั้งหมด (`lane:init` อ่านไฟล์นี้) |
| `docs/competition-plan/templates/SPEC.md` | `SPEC.md` | §5 seed, §6 acceptance |
| `docs/competition-plan/templates/.gitignore` | `.gitignore` | มี `.lane`, `.env.*`, `var/`, `.auth/` แล้ว |
| `docs/` ทั้งโฟลเดอร์ (รวม `docs/specs/`, `docs/day/`, `docs/porting/`) | `docs/` | build spec ของทุกฟีเจอร์, know-how เดิม, `openai-api.md`, templates ที่ lane prompts อ้างด้วย path เดิม |
| `prompts/` ทั้งโฟลเดอร์ (รวม `prompts/orchestrators/`, `prompts/lanes/`, `prompts/people/`) | `prompts/` | prompt ของทุก session |
| `docs/competition-plan/tools/team-board.ps1` | `tools/team-board.ps1` | สคริปต์บอร์ด (โพสต์ลง GitHub issue ที่ปักหมุด และ Sites dashboard ถ้าตั้งไว้) |
| `docs/competition-plan/tools/alert.ps1` | `tools/alert.ps1` | เตือนคนในเครื่อง (เสียง + แจ้งเตือน Windows) สคริปต์บอร์ดเรียกเองทุกโพสต์ `BLOCKED` และ Stop hook เรียกเมื่อ chat จบด้วย 🛑 ต้องอยู่ข้าง `team-board.ps1` |
| `START.md`, `PLAN.md` | `START.md`, `PLAN.md` | บรรทัดเดียวต่อ chat และแผนที่เอกสารอื่นลิงก์ถึงด้วย `../PLAN.md` |
| `docs/competition-plan/templates/.gitattributes` | `.gitattributes` | line ending เดียวกันทุกเครื่อง |
| `docs/competition-plan/templates/codex/` (ยกเว้น `README.md` และโฟลเดอร์ `user/`) | `.codex/` | hooks ปลุก session จากบอร์ด + `config.toml` (`gpt-6.2-sol`) + agents · ในวางแผน repo ไม่มีจุดนำหน้าเพื่อไม่ให้ hooks ทำงานผิดที่ · ทุกคน trust hooks ในทุก worktree ([README](../docs/competition-plan/templates/codex/README.md)) |

**ไม่ copy:** `tools/openai-check` (โค้ดวิจัยก่อนงาน) และ **ไม่มีอะไรจาก Papi** (ไม่มี `../papi-ref`) · ห้าม copy `..\nless.secrets.env` เข้า repo · ไฟล์ที่ root กับ `docs/competition-plan/templates/` เป็นไฟล์เดียวกัน ห้ามแก้แค่ฝั่งเดียว (แก้ contract = โพสต์ `CHANGE`)

```powershell
$plan = 'REPLACE\path\to\planning-repo'      # clone ของ planning repo
$repo = 'REPLACE\path\to\nless'              # clone หลักของ repo แข่ง (ว่าง, branch main)
Set-Location $repo
Copy-Item "$plan\docs" -Destination . -Recurse
Copy-Item "$plan\prompts" -Destination . -Recurse
New-Item -ItemType Directory -Force tools | Out-Null
Copy-Item "$plan\docs\competition-plan\tools\team-board.ps1", "$plan\docs\competition-plan\tools\alert.ps1" tools\
Copy-Item "$plan\START.md", "$plan\PLAN.md" .
$t = "$plan\docs\competition-plan\templates"
Copy-Item "$t\AGENTS.md", "$t\contracts.ts", "$t\.env.example", "$t\SPEC.md", "$t\.gitignore", "$t\.gitattributes" .
New-Item -ItemType Directory -Force .codex | Out-Null
Copy-Item "$t\codex\*" .codex -Recurse -Exclude README.md, user   # hooks.json, hooks\*.ps1, config.toml, agents\* (โฟลเดอร์ user\ คือแม่แบบของ %USERPROFILE%\.codex ไม่เข้า repo)
git add -A
git status --short | Select-String 'secrets|\.env\.local|openai-check|papi'   # ต้องไม่มีผลลัพธ์
git commit -m "chore: baseline - prior planning work only, no application code" -m "Prior work declared: planning docs, prompts, contracts.ts (types and specs, no implementation), build specs under docs/specs, board script, Codex hooks and config. Not included: tools/openai-check, anything from the company codebase. All application code is written during the event."
git push -u origin main
git rev-parse HEAD    # = baseline SHA, จดใน docs/competition-plan/templates/SOURCE-BASELINE.md ภายหลัง
```

จดใน `SOURCE-BASELINE.md`: baseline SHA, คำตอบผู้จัดเรื่องโค้ดบริษัท, ตัวเลือก DB ของ production (Render Postgres หรือ Supabase session pooler), สถานะบอร์ด Sites, คนถือ key (`app-dev` ของแต่ละคน, `app-prod`)

### 0.3 worktree 4 อันต่อคน แล้วเปิดโปรเจกต์ใน Codex

**ทางปกติ:** บรรทัดเดียวใน [START.md](../START.md) ทำข้อนี้ให้ (ทุกคนพิมพ์ของตัวเอง) คำสั่งข้างล่างคือทางทำมือ

แต่ละคนรันของตัวเอง (`$p` = `a`, `b` หรือ `c`): orchestrator `..\nless-<p>0` ตาม `origin/main` + 3 worker (`..\nless-<p>1`…`3`) ทุกอันมี `.lane`

```powershell
$p = 'c'                                  # a | b | c
Set-Location $repo
git fetch origin
foreach ($n in 0..3) {
  $dir = "..\nless-$p$n"
  git worktree add --detach $dir origin/main
  Set-Content -LiteralPath "$dir\.lane" -Value ($p.ToUpper() + $n) -NoNewline
}
git worktree list
```

(`.lane` = `A0`…`A3` / `B0`…`B3` / `C0`…`C3`) จากนั้นใน ChatGPT app → Codex → **Add new project** ทีละโฟลเดอร์ → **New chat → Work in: This computer** (Local, Worktree off) · ตรวจ `pwd` และ `type .lane` ในแชต · orchestrator อัปเดตด้วย `git fetch origin && git checkout --detach origin/main` · ขั้นตอนตั้งค่าแอปและ hooks: [chatgpt-app-setup](../docs/day/chatgpt-app-setup.md)

เปิดโปรเจกต์ `..\nless-c1` (ไม่ใช่ clone หลัก) → ตั้ง model/effort/Fast ตามหัวไฟล์ → พิมพ์บรรทัดเดียวของ C1 จาก START.md (หรือวางบล็อกข้อ 1 ทั้งบล็อกเมื่อบรรทัดเดียวใช้ไม่ได้)

## 1. Prompt (วางทั้งบล็อก)

~~~text
คุณคือ Codex ของ lane C1 (แชต setup F01) ทีม Endless · คน: Tanagorn Fukuhara (@tanagornf) · orchestrator ของคุณ: C0 · หัวหน้าทีม: @Ikkyuuuu
งานเดียวของแชตนี้: สร้างโครงแอปทั้งหมดตาม docs/specs/F01-core.md ทีละขั้น S1→S9 แล้วโพสต์ SETUP READY <sha> · อีก 11 session (orchestrator 3 + worker 8) เขียนโค้ดไม่ได้จนกว่าคุณโพสต์ = critical path ของทั้งทีม
Model (D3): GPT-6.2 Sol เท่านั้น ห้าม Astra ห้าม effort ultra · แชตนี้ effort medium + Fast เปิดจนจบ S9 · ติดเรื่องเดียวเกิน 20 นาที: โพสต์ BLOCKED แล้วบอกคนให้ปรับแชตนี้เป็น xhigh
เวลา: เป้า SETUP READY ภายใน 45 นาทีหลังข้อความนี้ ช้าสุด 55 (= ผลรวม timebox ในตาราง) · S9 production deploy ก่อน 11:30 ร่วมกับ คน C (ถือบัญชี Render)

## วิธีทำ (spec คือแบบ ห้ามออกแบบใหม่)
- ก่อนเริ่ม: อ่าน docs/PRODUCT.md ทั้งไฟล์ (Endless คืออะไรและของที่เสร็จแล้วต้องเป็นอย่างไร) แล้วอ่าน docs/specs/F01-core.md §1 และ §14 ทั้งหมด จากนั้นก่อนแต่ละขั้นอ่านเฉพาะหัวข้อที่ตารางข้างล่างชี้ ทำตามตัวอักษร: ชื่อไฟล์ ชื่อ env เวอร์ชัน library (pin exact) พฤติกรรม ตาราง SQL
- ลำดับความจริง: ./contracts.ts > ./AGENTS.md > prompt นี้ > docs/specs/F01-core.md · spec ขัด contracts.ts: ยึด contracts.ts แล้วจดใน server/src/core/EVIDENCE.md · contracts.ts ไม่ตรง 31 ฟีเจอร์/29 โฟลเดอร์ใน spec §14: หยุด โพสต์ BLOCKED @Ikkyuuuu (ห้ามแก้ contracts.ts)
- ไม่มีโค้ดหรือ repo อื่นให้เปิดระหว่าง setup: หน้าตา web shell เขียนเองตามคำอธิบายใน spec §7 · ห้ามขัดเกลา UI ห้ามเขียนฟีเจอร์ของ lane อื่น งานคือโครง core (รวม model wrapper OpenAI) fake และ check
- ตรวจว่า pwd คือ worktree ..\nless-c1, type .lane ได้ C1 · branch: git switch -c lane/C1/core · commit ทีละขั้นได้ · PR เดียวเข้า main (S9 = PR lane/C1/deploy)
- ห้ามเริ่ม dev server เอง (sandbox Windows ปิด process พื้นหลัง): คนรัน npm run dev ใน terminal ของตัวเอง คุณรัน test/typecheck/curl · ขาดเครื่องมือที่ setup ต้องใช้ = ติดตั้งเองได้เลยไม่ต้องถาม (`npm install` ตาม list S1, `npx playwright install chromium`) · ห้าม `npm install -g` หรือ installer ระดับเครื่อง/admin (บอกคน) · npm ci หรือ playwright install ล้มด้วย EPERM → บอกคนให้รันใน terminal
- ติด (blocker) = แจ้งคนทันที ห้ามเงียบหรือวนลองเอง: ติด = ลองแก้แล้ว 2 รอบไม่ผ่าน, ติดเรื่องเดียวเกิน 20 นาที, ต้องใช้สิทธิ์/บัญชี/ค่าลับ/การตัดสินใจของคน, ต้องแก้นอก path ของคุณ หรือ provider/บริการล่ม
   (1) เขียนในแชตนี้ทันที ขึ้นต้น "🛑 ต้องการคน:" บอกสิ่งที่ติด, ลองอะไรไปแล้ว, ทางเลือก 1–3 ทางโดยทางที่แนะนำอยู่แรก และสิ่งที่คนต้องทำ (คำสั่งที่ต้องรัน/ปุ่มที่ต้องกด/คำตอบที่ต้องการ) แบบสั้น
   (2) โพสต์บอร์ด "BLOCKED @tanagornf <ID/ref> <สรุป 1 บรรทัด>" (mirror ไป GitHub แจ้งเตือนคนทันที) · ติดเพราะ lane อื่นใช้ BLOCKED TO:<lane> แทน
   (3) commit WIP แล้วจบ turn ทันที โดยให้บล็อก "🛑 ต้องการคน:" อยู่ท้ายข้อความสุดท้าย: แอป ChatGPT จะแจ้งเตือนคนบนเครื่องและมือถือที่จับคู่เมื่อ turn จบ และ Stop hook จะไม่รอบอร์ดเมื่อเห็น 🛑 (มีเครื่องมือถามคำถามผู้ใช้ของแอป ใช้ถามแทนได้) · ห้ามทำงานต่อเงียบ ๆ ใน turn นั้น: บอกในบล็อกว่าระหว่างรอทำอะไรได้ แล้วทำเมื่อคนตอบ · ติดเพราะ lane อื่น (BLOCKED TO:<lane>) ไม่ใช้ 🛑: ทำส่วนที่ไม่ติดต่อแล้วรอ Stop hook · ได้คำตอบแล้วโพสต์ STATUS ว่าหายติด
- ไม่มี secret ใน repo/log/commit/test/โพสต์ · ..\nless.secrets.env อ่านได้แต่ห้ามพิมพ์/copy ค่า · OPENAI_API_KEY = key ส่วนตัวของ C จาก project app-dev (hard limit US$30) · key ของ production (project app-prod) อยู่ใน Render env เท่านั้น
- AI ของแอป = OpenAI อย่างเดียว ผ่าน server/src/core/model.ts ที่เดียว (import 'openai' ได้เฉพาะไฟล์นี้) · test/CI ใช้ MODEL_MODE=fake · dev DB = Neon direct ของ C (PG_SERVER_URL) · CI ใช้ pgvector/pgvector:pg17

## ขั้นและขั้นต่ำ (เกิน timebox ของขั้นใด ทำ "ขั้นต่ำ" ของขั้นนั้นแล้วไปต่อ · ที่ตัดทุกอย่างลงโพสต์ known gaps)
| ขั้น | นาที | อ่านใน spec | ขั้นต่ำ | ตัดได้ |
|---|---|---|---|---|
| S1 root + deps | 6 | §14 S1 | npm install ครบทุก package | ห้ามตัด library |
| S2 shared/core | 3 | §14 S2, §3 | shared typecheck ผ่าน | — |
| S3 server core | 15 | §4 §6 §8 | auth + dev login (+token) + jobs + channels + features API + fake ครบทุกฟังก์ชัน model + openai mode ของ chat/embed + rateLimit + /healthz /readyz /build-info | realtime.publish เป็น log, storage.save throw SERVICE_NOT_READY, schedules ไม่รัน, openai mode ของ moderate/transcribe/realtime ไป PR lane/C1/core-model ก่อน 11:30 |
| S4 schema + seed | 5 | §2 §5.1 §9.1 | migrate DB ว่างผ่าน รันซ้ำ 0 pending seed 2 รอบ | db:seed -- --demo ไป PR lane/C1/core-demo ก่อน 12:30 |
| S5 scaffold 29 + fake | 5 | §14 S5, MENU §7 | ทุก slug มี routes/pages · fake ที่ยังไม่ทันเขียน throw SERVICE_NOT_READY ยกเว้น inbox team ai-agent catalog knowledge-search business-settings | — |
| S6 web core + UI kit | 10 | §7 | dev login, sidebar ครบ, feature flag ซ่อนเมนู, ทุก path เปิด placeholder · UI kit export ครบ 10 ชื่อ: DataTable FormDialog useApiQuery useToast ต้องเต็ม | ConfirmDialog EmptyState StatusChip SectionCard useApiMutation แบบบาง (เติมใน lane/C1/core-ui ก่อน 11:30), layout มือถือ, /ops, /account placeholder |
| S7 scripts + CI + tests | 6 | §5.2-5.5 §10 | check-paths (รวมกฎ fix/) + unit test, workflow CI, Playwright config + fixtures | smoke:openai เบา ๆ |
| S8 ตรวจ + merge + โพสต์ | 5 | §11.1, §14 S8 | ข้อ 1-5, 8, 10-13 ผ่าน | ข้อ 6-7, 9 ลง known gaps ได้ |
| S9 production deploy | ≤30 หลัง SETUP READY | §14 S9 + docs/day/deployment.md | /healthz /readyz /build-info บน Render | Render ติด >15 นาที: Railway fallback |
ห้ามตัดเสมอ: library ครบ list · dev login + getUser/getBusiness/requirePermission · migrate/seed · auto-load + 29 placeholders · feature flags (ตาราง + GET /api/v1/features + web ซ่อนเมนู) · UI kit ขั้นต่ำ · fake ครบทุก contract · core loop บน fake · check:paths + CI · assertSafeDbName · dev login ต้องมี DEV_LOGIN_TOKEN บน production

## บอร์ด (tools/team-board.ps1 ตัวเดียว · เขียนข้อความลง handoff/<postId>.txt แล้วรัน)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 post -MessageFile handoff/<postId>.txt -PostId <postId>
การ์ด: ... team-board.ps1 status C1 F01 <R|S|A|U> "<note ≤80 ตัว>" [-Sha <สั้น>] [-Blocked]
- เริ่ม: status C1 F01 U "setup เริ่ม lane/C1/core" · ครบ 50 นาทีหลังเริ่มแล้วยังไม่ผ่านข้อ 1-5,8,10-13: โพสต์ BLOCKED @Ikkyuuuu "SETUP ETA <HH:MM> ติดที่ S<n>: <สาเหตุ>" แล้วทำต่อ
- S8: gh pr create --base main --title "F01 setup: core, OpenAI model wrapper, 29 feature scaffolds, contract fakes, feature flags" → gh pr checks --watch → เขียวแล้ว gh pr merge --squash --delete-branch → SHA = git rev-parse origin/main → โพสต์ (postId F01-C1-setup-ready) แล้ว status C1 F01 R "setup merged" -Sha <sha สั้น>
- แบบโพสต์ (ห้ามมี key/token): SETUP READY <sha> / PR <url> · CI เขียว · smoke ผ่าน (31 ฟีเจอร์ loaded, tenant 404, core loop บน fake, takeover แล้วเงียบ) · e2e core ผ่านใน dev / smoke:openai: <PASS ... | SKIP ไม่มี key> / เริ่ม: git fetch origin && git switch -c lane/<LANE>/<slug> origin/main && npm ci && npm run lane:init && npm run db:migrate && npm run db:seed && npm run dev / พอร์ต-DB: docs/specs/F01-core.md §14 / dev login: /dev-login (owner.a staff.a owner.b staff.b admin @example.test) / fakes: ทุก contract อยู่ใน server/src/features/<slug>/service.ts / UI kit + core helper: DataTable FormDialog ConfirmDialog EmptyState StatusChip SectionCard useToast useApiQuery useApiMutation, rateLimit, encryptSecret / e2e: tests/e2e/fixtures.ts (ownerPage) npm run e2e -- <slug> / flags: GET /api/v1/features, HIDDEN_FEATURES / P0 เริ่มได้เลย (C2 C3 B1 B2 A1) · A2 A3 B3 รอ LEAD: OPEN P1 / known gaps: <รายการ หรือ none> / TO:A0 TO:B0 TO:C0 TO:C2 TO:C3 TO:B1 TO:B2 TO:B3 TO:A1 TO:A2 TO:A3
- S9 เสร็จ: โพสต์ DONE F01 deploy production <url> <sha> TO:A0 TO:B0 TO:C0 (ไม่มี token) · เมื่อ C3 merge F02: คน C ตั้ง DEV_LOGIN_ENABLED=false ใน Render แล้ว redeploy
- หลังโพสต์ SETUP READY ห้ามเริ่ม F35 เอง: รอ prompts/lanes/C1.md (วางใน chat ใหม่ของ ..\nless-c1 หลัง S9)
~~~

## 2. ตาราง session: worktree, port, DB (12 session)

ทุกเครื่องใช้ฐานข้อมูลของ **Neon project ของตัวเอง** (direct endpoint, ไม่ใช่ pooled) แต่คนละ database ต่อ session · `npm run lane:init` เขียนค่าพวกนี้ลง `.env.local` ให้เองจาก `.lane` (+ ค่า AI, DB server และบอร์ดจาก `..\nless.secrets.env`) · orchestrator ของแต่ละคนอยู่คนละเครื่อง จึงใช้พอร์ต 3000 / 5170 ซ้ำกันได้

| Session | worktree (ข้าง clone หลัก) | `.lane` | `API_PORT` | `WEB_PORT` | database | test database | branch แรก |
|---|---|---|---:|---:|---|---|---|
| A0 orchestrator | `..\nless-a0` (ตาม `origin/main`) | `A0` | 3000 | 5170 | `nless_hack_a0` | `nless_hack_a0_test` | — (ตรวจรวม, `fix/<owner>/<slug>`) |
| B0 orchestrator | `..\nless-b0` | `B0` | 3000 | 5170 | `nless_hack_b0` | `nless_hack_b0_test` | — |
| C0 orchestrator | `..\nless-c0` | `C0` | 3000 | 5170 | `nless_hack_c0` | `nless_hack_c0_test` | — (ตรวจ gate 13:00 บน production) |
| C1 | `..\nless-c1` | `C1` | 3001 | 5171 | `nless_hack_c1` | `nless_hack_c1_test` | `lane/C1/core` |
| C2 | `..\nless-c2` | `C2` | 3002 | 5172 | `nless_hack_c2` | `nless_hack_c2_test` | `lane/C2/line` |
| C3 | `..\nless-c3` | `C3` | 3003 | 5173 | `nless_hack_c3` | `nless_hack_c3_test` | `lane/C3/business-settings` |
| B1 | `..\nless-b1` | `B1` | 3004 | 5174 | `nless_hack_b1` | `nless_hack_b1_test` | `lane/B1/knowledge` |
| B2 | `..\nless-b2` | `B2` | 3005 | 5175 | `nless_hack_b2` | `nless_hack_b2_test` | `lane/B2/ai-agent` |
| B3 | `..\nless-b3` | `B3` | 3006 | 5176 | `nless_hack_b3` | `nless_hack_b3_test` | `lane/B3/knowledge-import` (หลัง `LEAD: OPEN P1`) |
| A1 | `..\nless-a1` | `A1` | 3007 | 5177 | `nless_hack_a1` | `nless_hack_a1_test` | `lane/A1/inbox` |
| A2 | `..\nless-a2` | `A2` | 3008 | 5178 | `nless_hack_a2` | `nless_hack_a2_test` | `lane/A2/orders` (หลัง `LEAD: OPEN P1`) |
| A3 | `..\nless-a3` | `A3` | 3009 | 5179 | `nless_hack_a3` | `nless_hack_a3_test` | `lane/A3/crm` (หลัง `LEAD: OPEN P1`) |

- **branch:** worker ใช้ `lane/<LANE>/<slug>` (`-` แทน `/`, เช่น `lane/C1/core-jobs`; PR ที่สองของฟีเจอร์เดิมเติม `-2`) · orchestrator แก้ข้าม lane ที่ `fix/<owner-lane>/<slug>` ตาม D5 (CI ใช้กฎของ lane เจ้าของ + ต้องมี test + แก้นอก test ไม่เกิน 40 บรรทัด + ห้ามแตะ migration/`contracts.ts`) · `lead/<ชื่อ>` = หัวหน้าแก้ฉุกเฉิน ผ่าน check พร้อมคำเตือนและต้องมีคนรีวิว
- **ชื่อ DB:** ต้องตรง `^nless_hack_[a-c][0-3](_test)?$` (`assertSafeDbName`) · CI ใช้ `nless_hack_a0` / `nless_hack_a0_test` ในคอนเทนเนอร์ที่ทิ้งได้ · production ใช้ชื่อที่ Render/Supabase ให้และไม่เคยรัน `db:create`/`db:reset`
- **Neon:** `PG_SERVER_URL` = connection string ของ endpoint **direct** (ไม่มี `-pooler` ในชื่อ host) ลงท้าย `?sslmode=require` · pool ≤ 5 ต่อ process (`DB_POOL_MAX=5`) · ตัวอย่างพร้อมกัน 4 API + test ต่อคนต้องไม่เกินลิมิต connection ของ free tier (UNCONFIRMED: ตรวจคืนก่อนวันงาน) · fallback = Postgres 16 + pgvector ใน WSL (ตัวแปรเดียวกัน, ตัด `?sslmode=require`)
- **node_modules:** แต่ละ worktree รัน `npm ci --prefer-offline --no-audit --no-fund` เอง (cache กลางของ npm ทำให้เร็ว) ห้าม junction/symlink `node_modules` ข้าม worktree: workspace link `@nless/shared` ชี้เข้า worktree ตัวเอง ถ้าแชร์จะไปอ่านโค้ดของ lane อื่น · ถ้า `npm ci` ล้มด้วย EPERM ใน sandbox ให้คนรันใน terminal
- **migrations ต่อ lane:** DB ของ lane รับ migration จาก branch ตัวเองได้อิสระ ถ้าไฟล์ migration ของตัวเองเปลี่ยนหลังรันแล้ว ใช้ `npm run db:reset` (DB ของ lane ตัวเองเท่านั้น)
- **OpenAI ต่อคน:** `OPENAI_API_KEY` ใน `..\nless.secrets.env` ของแต่ละเครื่อง = key ของคนนั้นเองจาก OpenAI project `app-dev` (hard limit US$30) ใช้กับทุก session ของคนนั้น · key ของ production อยู่ใน project `app-prod` (hard limit US$60) และอยู่ใน Render env เท่านั้น · tests/CI เป็น fake เสมอ · ทุก alias (chat/fast/strong) ใช้ `gpt-6.2-sol` ตามที่ทีมตัดสิน ห้ามเปลี่ยน model ใน `.env.local` เอง · เจอ `PROVIDER_BUDGET_EXHAUSTED` → โพสต์ `BLOCKED @Ikkyuuuu` ทันที
- **webhook tunnel:** หนึ่งเครื่องมักมี tunnel เดียว ชี้ไป `API_PORT` ของ lane ที่กำลังทำ webhook (C2 = 3002 สำหรับ LINE *NLess Dev* และ Meta) · LINE *NLess Demo* ชี้ production เท่านั้น · แก้ `PUBLIC_BASE_URL` ใน `.env.local` ของ worktree นั้น
- **หลัง pull main:** `npm ci` (ถ้า lockfile เปลี่ยน) → `npm run db:migrate` → restart `npm run dev` (ฟีเจอร์ใหม่โหลดตอน boot) · คนรัน dev server เอง agent ไม่รัน (D14)

## 3. Acceptance ก่อนโพสต์ SETUP READY (C0 รัน, คน C ยืนยัน, ≤ 5 นาที)

ตรวจจาก worktree ที่ยังไม่เคยรันอะไร (เช่น `..\nless-c2`: `git fetch origin && git checkout --detach origin/main`) ไม่ใช่ worktree ของ C1 · C0 (orchestrator) เป็นคนรันตารางนี้ให้ คน C เป็นคนยืนยัน

| # | ตรวจ | ผ่านเมื่อ |
|---|---|---|
| 1 | PR setup | CI `pr-check` เขียว, merge แล้ว, `origin/main` = SHA ที่จะโพสต์ |
| 2 | `npm ci` แล้ว `npm run typecheck` | ผ่าน และ lockfile ไม่เปลี่ยน · `npm ls react` เห็นเวอร์ชันเดียว · `npm ls zod` เห็นเวอร์ชันเดียว · `npm ls openai` = เวอร์ชันที่ pin (≥ 7.58.0) |
| 3 | `npm run lane:init` | `.env.local` มีพอร์ตและ DB ของ lane ตามตาราง session มีชื่อ AI env ครบตาม `.env.example` และ `SITES_URL`/`BOARD_SOURCE` ไม่พิมพ์ค่า secret ออกจอ · `git status` ไม่เห็น `.env.local` และ `.lane` · `DATABASE_URL` ชี้ Neon direct + `sslmode=require` |
| 4 | `npm run db:migrate` สองรอบ, `npm run db:seed` สองรอบ | รอบสอง migrate = 0 pending · seed ไม่ error ไม่มีแถวซ้ำ · `model_usage` มีคอลัมน์ `reasoning_tokens`, `cache_write_tokens`, `audio_input_tokens`, `audio_output_tokens` · มีตาราง `feature_flags` · `npm run db:seed -- --demo` ผ่านและรันซ้ำได้ |
| 5 | `npm run dev` → `/healthz`, `/readyz`, `/build-info` | 200 · build-info มี sha, env, schema, modelMode, models (id จาก env), providerModes และไม่มี key ใด ๆ |
| 6 | `/dev-login` เป็น owner.a | sidebar ครบทุกเมนูของร้าน (28 รายการ; dev mode เห็น placeholder) แต่ละอันเปิดหน้า placeholder ที่มีชิป "ยังไม่ทำ (U)" · สลับ th/en แล้วชื่อเมนูเปลี่ยน · ไม่มีเมนูนอกตาราง MENU |
| 7 | `/dev-login` เป็น staff.a และ admin | staff.a ไม่เห็นเมนูที่ต้องใช้ `product.write`, `account.*`, `business.bot_settings` · admin เห็นกลุ่ม admin (`/release`, `/ops`) |
| 8 | `npm run smoke` | ทุกแถว PASS: 31 ฟีเจอร์ loaded (`/api/v1/_meta/features`), tenant B = 404, inbound → AI ตอบ "1,490" สถานะ `sent`, takeover แล้ว bot เงียบ |
| 9 | `npm run smoke:openai` | เครื่องที่มี key: PASS ทุกแถว (chat/fast/strong, tool loop, embed 1536, moderation) · ไม่มี key: SKIP (ไม่ fail) · `model_usage` มีแถวพร้อมต้นทุน |
| 10 | ownership check | `npm test -- check-paths` ผ่าน (branch lane/B1 แก้โฟลเดอร์ inbox ต้อง fail, `fix/B1/x` ที่แก้ migration ต้อง fail, `fix/B1/x` ที่แก้ >40 บรรทัดต้อง fail) |
| 11 | `npm test` | ผ่านทั้ง server และ web รวม `model.test.ts` (ไม่มี network), `features.test.ts`, `ratelimit.test.ts` และ `web/src/core/ui/ui.test.tsx` |
| 12 | feature flags | `PUT /api/v1/ops/features/F13` `{hidden:true}` ด้วย admin → `GET /api/v1/features` ของ owner.a ได้ `visible:false` และเมนู Orders หายหลัง refresh · `HIDDEN_FEATURES=F14` ตอน boot DB ใหม่ → `hidden:true` · NODE_ENV=production → placeholder ทุกตัว `visible:false` |
| 13 | `npm run e2e -- core` (คนรัน `npm run dev` ไว้) | `tests/e2e/core.smoke.spec.ts` ผ่าน: `ownerPage` ล็อกอิน owner A แล้วเห็น sidebar |
| 14 | S9 production | `https://<render-url>/healthz` = 200, `/readyz` = 200, `/build-info` sha = `origin/main`, `/dev-login` ใส่ `DEV_LOGIN_TOKEN` แล้วเข้าได้, `E2E_BASE_URL=https://<render-url> npm run e2e -- core` ผ่าน · ทำเสร็จก่อน 11:30 (ไม่บล็อก `SETUP READY`) |

ข้อ 1–5, 8, 10–13 ต้องผ่านทั้งหมดก่อนโพสต์ `SETUP READY` ข้อ 6–7 ถ้า UI ยังไม่ครบแต่ API ครบ โพสต์ได้พร้อมระบุใน known gaps เพราะ lanes เริ่ม backend ได้แล้ว ข้อ 9 ถ้า fail เพราะ model ใช้ไม่ได้ (403/404) โพสต์ได้พร้อม known gap แล้วแก้ `.env.example` เป็นรุ่นที่ใช้ได้ใน PR ถัดไป แต่ถ้า wrapper พัง (tool loop, retry) ต้องแก้ก่อน 11:30 · ข้อ 14 ต้องผ่านก่อน 11:30

## 4. โพสต์บอร์ด

ใช้แบบท้ายบล็อก prompt (ข้อ 1) แทน `<sha>`, `<url>`, known gaps · ห้ามใส่ key/token (รวม `SITES_BYPASS_TOKEN`, `BOARD_SECRET`, `DEV_LOGIN_TOKEN`) · สคริปต์บอร์ดเขียนลง Sites dashboard และ mirror ไป GitHub issue ที่ปักหมุดเสมอ ถ้า Sites ล่ม โพสต์ยังอยู่บน GitHub และการอ่านจะ fallback ไป GitHub เอง (`BOARD_SOURCE=github` บังคับ) · หลัง S9 เสร็จ C วาง [lanes/C1.md](lanes/C1.md) ใน **chat ใหม่** ของโปรเจกต์ `..\nless-c1` (แชต setup ปิดได้)

## 5. ถ้าช้า (ตัดตามลำดับนี้ ห้ามตัดรายการ "ห้ามตัด")

ตารางเต็มอยู่ที่ [spec §13](../docs/specs/F01-core.md#13-edge-cases) · สรุป: (1) layout มือถือ, `/ops`, `/account` เป็น placeholder → (2) UI kit ส่วนไม่บังคับแบบบาง (`ConfirmDialog` `EmptyState` `StatusChip` `SectionCard` `useApiMutation`) เติมใน `lane/C1/core-ui` ก่อน 11:30 → (3) realtime `publish()` เป็น log, `useRealtime` no-op → (4) schedules ไม่รัน → (5) openai mode ของ `moderate`/`transcribe`/`createRealtimeSession`/`recordRealtimeUsage` ไป `lane/C1/core-model` ก่อน 11:30 → (6) `storage.save` throw `SERVICE_NOT_READY` → (7) slot rendering → (8) `db:seed -- --demo` แบบเต็มไป `lane/C1/core-demo` ก่อน 12:30 → (9) สวิตช์ flag บนหน้า `/ops` (API ห้ามตัด)

**ห้ามตัด:** ติดตั้ง library ครบ list · dev login + `getUser`/`getBusiness`/`requirePermission` · migrate/seed · auto-load routes/pages + 29 placeholders · feature flags · UI kit ขั้นต่ำ (`DataTable`, `FormDialog`, `useApiQuery`, `useToast` + `ToastProvider`, export ครบ 10 ชื่อ) · fake ครบทุก contract · fake ครบทุกฟังก์ชันของ `model` + openai mode ของ `model.chat` (Responses, tool loop, retry/error) และ `model.embed` · core loop บน fake · `check:paths` (รวมกฎ `fix/`) + CI · `rateLimit` · `assertSafeDbName` · `/healthz` `/readyz` `/build-info` · S9 ก่อน 11:30

## 6. หลัง SETUP READY

- ทำ S9 ต่อทันทีกับ คน C (ข้อ 1 ใน spec §14 S9) จน production ขึ้น แล้วโพสต์ `DONE F01 deploy production <url> <sha>` · ทุกคนใส่ `E2E_BASE_URL=<url>` ใน `..\nless.secrets.env`
- C1 ทำต่อตาม [lanes/C1.md](lanes/C1.md): F35 (ops page, retry/dead-letter UI, schedules) → F39 chatgpt-catalog → F36 (15:15 ตามนาฬิกา) ระหว่างนั้นดูแล main และตอบ `NEED TO:C1` (library, core API, `model.*`, feature flag) · **gate 13:00 C0 เป็นคนตรวจบน production** ไม่ใช่ C1
- คำขอ library เพิ่ม: C1 เพิ่มใน `package.json` ของ workspace ที่ถูก pin exact, PR `lane/C1/deps-<ชื่อ>`, merge แล้วโพสต์ `DONE NEED <library> <sha>` ทุก session รัน `npm ci` · ห้ามเพิ่ม AI SDK ของ provider อื่น
- คำขอแก้ core API: เพิ่มแบบ backward-compatible เท่านั้น (option ใหม่, ฟังก์ชันใหม่) ไม่เปลี่ยน signature เดิมใน `contracts.ts`
- เมื่อ C3 merge F02 (login จริง): คน C ปิด dev login บน production (`DEV_LOGIN_ENABLED=false` ใน Render แล้ว redeploy)
