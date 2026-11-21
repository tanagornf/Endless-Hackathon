# เตรียมเครื่องวันงาน: เช็กลิสต์คืนนี้ (ทำคนละชุด A · B · C)

อัปเดต 20 พ.ย. 2569 · ตาม [D16](../DECISIONS-2026-11-20.md#d16-preparing-each-hackathon-pc-tonight-by-its-owner) · เครื่องที่ใช้เขียนแผนไม่ใช่เครื่องวันงาน ไม่มีอะไรพึ่งไฟล์ที่อยู่เฉพาะเครื่องนั้น · ทำตามลำดับ ติ๊กทุกข้อ แล้วรัน [preflight](#9-รัน-readiness-check) และ**โพสต์ผลให้ทีมก่อนนอน** · คู่มือแอป Codex: [chatgpt-app-setup.md](chatgpt-app-setup.md) · ตัวแปร: [environments.md](environments.md)

**รายการต่อคนฉบับสั้นที่ทำตามได้ทีละข้อ:** [PREP-A](../../prompts/people/PREP-A.md) · [PREP-B](../../prompts/people/PREP-B.md) · [PREP-C](../../prompts/people/PREP-C.md) (หน้านี้คือรายละเอียดเบื้องหลัง)

**ทางลัด:** เปิดโฟลเดอร์ repo นี้ในแอป ChatGPT (Codex) แล้วพิมพ์ `You are <A|B|C>. Prepare this PC: follow START.md section "Prep".` Codex จะรัน `start-day.ps1 -Mode Prep` (วางไฟล์ `.codex` ของผู้ใช้, สร้างโครง `..\nless.secrets.env`, รัน preflight, ทดสอบเสียงเตือน, บอกวิธีตั้งแจ้งเตือนของแอป) แล้วไล่ข้อที่คุณต้องทำเองให้ทีละข้อ ([START.md](../../START.md)) · เช็กลิสต์ข้างล่างคือรายการเต็ม

## 1. ติดตั้ง

- [ ] **Git for Windows** แล้วรัน `git config --global core.longpaths true` และตั้ง `git config --global user.name "<ชื่อ>"` · `user.email` (commit ต้องใช้)
- [ ] **Node.js 24 LTS** (`node -v` ได้ `v24.x`) · `npm -v` ทำงาน (ถ้า PowerShell บล็อก: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`)
- [ ] **GitHub CLI** แล้ว `gh auth login` (เลือก GitHub.com, HTTPS, login ผ่านเบราว์เซอร์) ตรวจ `gh auth status` · บัญชีต้องมีสิทธิ์ push repo แข่งและโพสต์ issue บอร์ด
- [ ] **แอป ChatGPT** ล็อกอิน Pro + Codex → ทำตาม [chatgpt-app-setup.md](chatgpt-app-setup.md) (ข้อ 1–9 ทั้งหมด รวม MCP ข้อ 9)
- [ ] **Windows PowerShell 5.1** (มากับ Windows; `$PSVersionTable.PSVersion`)
- [ ] เบราว์เซอร์ Playwright: `npx playwright install chromium` (รันที่ไหนก็ได้ครั้งเดียว ใช้พื้นที่ ~300 MB) · วันงานหลัง `npm ci` ใช้ได้เลย
- [ ] **ไม่ต้องมี** Docker (ไม่ใช้) · ไม่ต้องติด Postgres ในเครื่อง (ใช้ Neon; WSL เป็นแผนสำรองข้อ 8)

## 2. Neon (ฐานข้อมูล dev ของคนนั้น)

1. **C:** สร้าง Neon organization `Endless` + 3 project (`nless-hack-a/b/c`, ภูมิภาค **Singapore (`aws-ap-southeast-1`)**, Postgres 17 ถ้าให้เลือก) แล้วเชิญ A และ B ที่หน้า **People** ([environments.md §2.1](environments.md)) · **A, B:** สมัคร Neon ด้วยอีเมลที่ถูกเชิญแล้วรับคำเชิญ · ทุกคนเปิด**เฉพาะ project ของตัวเอง** ไม่ใช้บัญชีหรือรหัสผ่านของคนอื่น
2. Connection details: เลือก **Direct connection** (ไม่ใช่ Pooled: ต้องใช้ advisory lock และ prepared statement) → คัดลอก connection string · เก็บเฉพาะส่วน server ใน `PG_SERVER_URL` เช่น `postgresql://<user>:<password>@<host>/<db>?sslmode=require` (ชื่อ database ท้าย URL ใช้อะไรก็ได้ ตัว setup สร้าง `nless_hack_<lane>` ให้เอง)
3. **พิสูจน์สมมติฐาน 2 ข้อ** (Neon รองรับหลาย database และ connection ของ free tier พอ): preflight (ข้อ 9) ทำให้เอง = `CREATE DATABASE nless_probe_<random>` → เชื่อมต่อ → `CREATE EXTENSION vector` → `SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector` (ต้องได้ ≈ 0.0085) → drop · ผ่านทุกขั้น = พร้อม · ล้มที่ `create-database` หรือ `create-extension-vector` = จดข้อความ error แล้วโพสต์ให้ทีม ใช้สำรองข้อ 8
4. เวลา connect ครั้งแรกอาจช้า ~0.5–3 วินาที (Neon ปลุกตัวเอง) ไม่ใช่ปัญหา · preflight เตือนถ้านานเกิน 4 วินาที

## 3. Repo เรียงข้างกัน

- [ ] โฟลเดอร์ทำงานเดียว เช่น `C:\hack` (path สั้น ไม่มีช่องว่าง ไม่มีภาษาไทย) ข้างในมี: `sea\` (repo เตรียมงานนี้ clone ด้วย `gh repo clone`/`git clone`) และ `nless\` (clone ว่างของ repo แข่ง ทำวันงาน 10:00 หลังหัวหน้า push baseline) แล้ว worktree `nless-a0 … nless-c3` (ข้อ 2 ของ chatgpt-app-setup) จะอยู่ข้างกัน
- [ ] ไฟล์ secrets อยู่ที่ `C:\hack\nless.secrets.env` (**นอก** repo ทุกตัว, ข้างโฟลเดอร์ repo) ตามข้อ 4 · `.gitignore` ของ repo กันไว้อยู่แล้ว แต่ห้าม copy ไฟล์นี้เข้า repo
- [ ] ถ้าเตรียมคืนนี้ก่อนมี repo แข่ง: ใช้ repo ซ้อมใด ๆ ที่ `git fetch origin` ได้เพื่อทดสอบ worktree

## 4. `..\nless.secrets.env` (เขียนชื่อ key ตามนี้ ค่าพิมพ์เอง)

ไฟล์ข้อความธรรมดา บรรทัดละ `NAME=value` (ไม่ต้องใส่เครื่องหมายคำพูด) · **พิมพ์ key จาก dashboard ด้วยมือ** ห้ามส่งผ่านแชต/อีเมล/screenshot · ค่าลับห้ามขึ้นจอ ห้ามโพสต์ ห้ามอยู่ใน git

| ชื่อ | ค่า / ได้จากไหน | จำเป็น |
|---|---|---|
| `OPENAI_API_KEY` | key ของ OpenAI project **`app-dev` ของคนนั้น** (hard limit US$30) | ทุกคน |
| `PG_SERVER_URL` | connection string **direct** ของ Neon (ข้อ 2) | ทุกคน |
| `SITES_URL` | origin ของ dashboard Sites เช่น `https://<name>.openai.chatgpt.site` | ไม่บังคับ (ไม่มี = บอร์ดเป็น GitHub issue อย่างเดียว ซึ่งใช้งานได้ครบ) |
| `SITES_BYPASS_TOKEN` | bypass token ของ Sites ([sites-dashboard.md ข้อ 3](../board/sites-dashboard.md#3-ออก-bypass-token-แชร์-site-และ-board_secret)) | เฉพาะเมื่อใช้ Sites |
| `BOARD_SECRET` | hex 64 ตัวที่หัวหน้า/คนสร้าง site ส่งให้ทางส่วนตัว | เฉพาะเมื่อใช้ Sites |
| `BOARD_SOURCE` | `github` เมื่อใช้ issue อย่างเดียว (สคริปต์เริ่มงานใส่ให้) · `sites` เมื่อตั้ง `SITES_*` ครบ | ไม่บังคับ |
| `BOARD_REPO` | `owner/repo` ของ GitHub issue บอร์ด | ทุกคน |
| `BOARD_ISSUE` | เลข issue ที่ปักหมุด | ทุกคน |
| `BOARD_TEAM_LOGINS` | `loginA,loginB,loginC` | ทุกคน |
| `E2E_BASE_URL` | URL ของ production บน Render | **เพิ่มหลัง deploy ครั้งแรก (~11:30)** ไม่ต้องมีคืนนี้ |
| key ทดสอบของ provider | LINE Dev / Meta (C), Google (A) ตามที่ spec ของ lane ใช้ | **เฉพาะคนที่ใช้** ใส่ตอนที่หัวหน้าบอกชื่อ key |

- [ ] ไม่ต้องใส่ key ของ production (`app-prod` อยู่ใน Render เท่านั้น ถือโดยหัวหน้า)
- [ ] ตรวจชื่อ key โดยไม่เห็นค่า: preflight ข้อ 9 พิมพ์เฉพาะชื่อ

## 5. Codex ในแอป (ลิงก์)

- [ ] ไม่มี `%USERPROFILE%\.codex\AGENTS.md` (ไฟล์ส่วนกลาง) · มี `config.toml` และ `rules\default.rules` จาก `docs/competition-plan/templates/codex/user/` · ตรวจ commit ใน worktree ได้ · MANGO/PONG ผ่าน · MCP ของ Neon (ทุกคน) และ Render (เฉพาะ C) ล็อกอินด้วยบัญชีตัวเองและทดสอบแล้ว · ทั้งหมดอยู่ใน [chatgpt-app-setup.md](chatgpt-app-setup.md)

## 6. Playwright

- [ ] `npx playwright install chromium` ทำแล้ว (preflight ตรวจโฟลเดอร์ `%LOCALAPPDATA%\ms-playwright\chromium-*`)

## 7. ทดสอบบอร์ด

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\team-board.ps1 check -AgentId LEAD` (ไม่เขียนอะไร) ต้องเห็น `Board: … state=open` (บอร์ดบน GitHub issue พร้อม ซึ่งพอสำหรับวันงาน) · ถ้าทีมใช้ Sites ด้วย ต้องเห็น `Sites: OK` และ `Sites people cards: OK` · ถ้า Sites ไม่ผ่านบางเครื่อง ดูตาราง "ถ้าไม่ผ่าน" ใน [sites-dashboard.md](../board/sites-dashboard.md#4-ทดสอบก่อนวันงาน-เฉพาะทีมที่ใช้-sites-ทั้ง-3-เครื่อง) แล้วตั้ง `BOARD_SOURCE=github` ทุกเครื่องพร้อมกัน

### 7.1 Repo แข่งและการแจ้งเตือน (คืนนี้)

- [ ] **C:** ใช้ repo และ issue ซ้อมตรวจสิทธิ์ก่อนงาน · เมื่อเริ่มงานให้สร้าง repo แข่งใหม่และ issue บอร์ดตาม [START.md Day](../../START.md#day-instructions-for-codex)
- [ ] **A, B:** ตรวจสิทธิ์บน repo ซ้อมก่อนงาน · เมื่อ C แจ้ง repo แข่งใหม่ ให้กดรับคำเชิญและตั้งค่าบอร์ดใหม่ตาม START.md Day
- [ ] **ทุกคน: แจ้งเตือนของแอป ChatGPT** ([START.md ข้อ 3](../../START.md)): Settings → Notifications ตั้ง turn completion = **Always**, permission **on**, question **on** · จับคู่มือถือ: Settings → Connections → Control this Mac or PC → Set up แล้วสแกน QR ด้วยแอป ChatGPT ในมือถือ (บัญชีเดียวกัน) และอนุญาตแจ้งเตือน · ทดสอบ: พิมพ์ `Reply with one word, then stop.` แล้วสลับไปหน้าต่างอื่น ต้องมีแจ้งเตือนทั้งบนเครื่องและมือถือ · Windows: เปิด Notifications ปิด Do not disturb / Focus ทั้งวันงาน
- [ ] ทุกคน (สำรองในเครื่อง): `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\alert.ps1 -Test` ต้องได้ยินเสียงและเห็นแจ้งเตือน Windows

## 8. สำรอง (ทำเมื่อข้อนั้นล้ม ไม่ต้องทำล่วงหน้าทุกอย่าง)

| ปัญหา | สำรอง |
|---|---|
| Neon ล้ม / ช้า / ไม่รองรับ `CREATE DATABASE` หรือ `vector` | WSL2 + Ubuntu 24.04: `wsl --install -d Ubuntu-24.04` → `sudo apt install postgresql-16 postgresql-16-pgvector` → `sudo service postgresql start` → สร้าง role และตั้ง `PG_SERVER_URL=postgresql://<user>:<password>@localhost:5432/postgres` แล้วรัน preflight ซ้ำ (Docker ไม่ต้อง) · Supabase เป็นสำรองอันดับสอง (ต้องใช้ session pooler) |
| RAM < 16 GB | เปิด dev server พร้อมกันไม่เกิน 2 ตัว ทดสอบที่เหลือบน production · ปิด Chrome/แอปอื่น · preflight จะเตือน |
| แอป Codex มีปัญหา | ติดตั้ง CLI สำรอง `npm install -g @openai/codex@latest` (ต้อง ≥ 0.171) ตาม chatgpt-app-setup ข้อ 8 |
| `npm ci` ล้ม EPERM ใน chat | รันใน terminal ของตัวเอง |
| `gh auth` หมดอายุกลางวัน | `gh auth login` ใหม่ใน terminal (agent ทำแทนไม่ได้) |

## 9. รัน readiness check

```powershell
cd C:\hack\sea
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1
# ทดสอบ OpenAI จริง (ใช้ key ของตัวเอง ≈ US$0.08) ทำครั้งเดียวคืนนี้:
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1 -OpenAI
```

ตารางผลเป็น PASS / WARN / FAIL (+ INFO) ไม่พิมพ์ค่า secret ใด ๆ · exit code 1 เมื่อมี FAIL · ตรวจ: PowerShell, Node 24, npm, git + `core.longpaths`, `gh auth status`, RAM/ดิสก์ว่าง, แผนไฟไม่หลับ, `.codex` ของผู้ใช้ (config, rules, ไม่มี AGENTS.md), แอป ChatGPT, Playwright, ชื่อ key ในไฟล์ secrets, `team-board.ps1 check`, database probe (สร้างและลบ `nless_probe_*`; ถ้าไม่มี `PG_SERVER_URL` จะเป็น WARN ข้ามไป) และ OpenAI smoke เมื่อใส่ `-OpenAI` · เรียกซ้ำจน **FAIL = 0**

**ก่อนนอน: โพสต์ผลให้ทีม** (ก๊อปตารางจากหน้าจอได้ ไม่มี secret) ในแชตกลุ่มของทีม หรือ `post` ผ่านบอร์ดด้วย `-AgentId LEAD` ถ้าหัวหน้าอนุญาต: บอกจำนวน PASS/WARN/FAIL, WARN ที่ยอมรับได้ และข้อที่แก้ไม่ได้ (เช่น Neon probe ล้ม → เราจะสลับ WSL ก่อน 10:00) · ถ้ายังมี FAIL ที่แก้ไม่ได้ บอกหัวหน้าทันที ไม่รอเช้า
