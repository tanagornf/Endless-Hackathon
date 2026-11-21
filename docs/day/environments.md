# Environments: ใครรันอะไรที่ไหน (dev, CI, production, สำรอง)

สรุปจาก [D15, D16](../DECISIONS-2026-11-20.md) · ค่าตัวแปรทั้งหมดตาม [.env.example](../competition-plan/templates/.env.example) · production และ Railway ดู [deployment.md](deployment.md) · ปัญหาที่อาจเกิดดู [failure-drills.md](failure-drills.md)

หลักการ: **ไม่มีเครื่องไหนเป็น production server** · เครื่องที่ใช้เตรียมแผนไม่ใช่เครื่องวันงาน · ทุกเครื่องวันงานต้องตั้งเองคืนนี้ (D16)

## 1. ตาราง environment (D15)

พอร์ต = `3000 + เลข lane` (API) และ `5170 + เลข lane` (web) · เลข lane: orchestrator 0 · C1 1 · C2 2 · C3 3 · B1 4 · B2 5 · B3 6 · A1 7 · A2 8 · A3 9 · DB = `nless_hack_<lane ตัวพิมพ์เล็ก>` + `_test` (allow-list `^nless_hack_[a-c][0-3](_test)?$`)

| Environment | รันที่ไหน | API / web | Database | ใครรันอะไร | OpenAI key | LINE channel |
|---|---|---|---|---|---|---|
| Worker C1 | เครื่อง C `..\nless-c1` | 3001 / 5171 | Neon ของ C: `nless_hack_c1` (+`_test`) | C รัน `npm run dev`; Codex รัน test/typecheck/curl | `app-dev` ของ C | ไม่ใช้ |
| Worker C2 | เครื่อง C `..\nless-c2` | 3002 / 5172 | Neon ของ C: `nless_hack_c2` | เหมือนกัน + tunnel สำหรับ webhook | `app-dev` ของ C | **NLess Dev** (webhook → tunnel ของ C2) |
| Worker C3 | เครื่อง C `..\nless-c3` | 3003 / 5173 | Neon ของ C: `nless_hack_c3` | เหมือนกัน | `app-dev` ของ C | ไม่ใช้ |
| Worker B1 | เครื่อง B `..\nless-b1` | 3004 / 5174 | Neon ของ B: `nless_hack_b1` | B | `app-dev` ของ B | ไม่ใช้ |
| Worker B2 | เครื่อง B | 3005 / 5175 | `nless_hack_b2` | B | `app-dev` ของ B | ไม่ใช้ |
| Worker B3 | เครื่อง B | 3006 / 5176 | `nless_hack_b3` | B | `app-dev` ของ B | ไม่ใช้ |
| Worker A1 | เครื่อง A `..\nless-a1` | 3007 / 5177 | Neon ของ A: `nless_hack_a1` | A | `app-dev` ของ A | ไม่ใช้ (Demo Chat ใช้ช่อง web) |
| Worker A2 | เครื่อง A | 3008 / 5178 | `nless_hack_a2` | A | `app-dev` ของ A | ไม่ใช้ |
| Worker A3 | เครื่อง A | 3009 / 5179 | `nless_hack_a3` | A | `app-dev` ของ A | ไม่ใช้ |
| Orchestrator A0 | เครื่อง A `..\nless-a0` ตาม `origin/main` | 3000 / 5170 | Neon ของ A: `nless_hack_a0` | A0 ตรวจ main หลัง merge, fix ข้าม lane | `app-dev` ของ A | ไม่ใช้ |
| Orchestrator B0 | เครื่อง B `..\nless-b0` | 3000 / 5170 | `nless_hack_b0` | B0 | `app-dev` ของ B | ไม่ใช้ |
| Orchestrator C0 | เครื่อง C `..\nless-c0` | 3000 / 5170 | `nless_hack_c0` | C0 + ตรวจ gate 13:00 บน production | `app-dev` ของ C | ไม่ใช้ |
| CI | GitHub Actions | — | service container `pgvector/pgvector:pg17` (ชั่วคราว) | อัตโนมัติทุก PR: typecheck, tests, check:paths | ไม่มี (`MODEL_MODE=fake`) | ไม่ใช้ |
| **Production** | Render Singapore, web instance เดียว, auto-deploy จาก `main` | `$PORT` / เสิร์ฟ `web/dist` | Render Postgres 17 + pgvector | C ถือบัญชีและ env · C0 ตรวจ gate · ทุก lane รัน smoke | `app-prod` (hard limit US$60) | **NLess Demo** (webhook → Render ตั้งแต่ ~12:00) |
| Production สำรอง | Railway Singapore (Hobby) | `$PORT` | Railway pgvector | เตรียมไว้ · สลับเมื่อ Render ล่ม (≤ 15 นาที) | `app-prod` | NLess Demo (ชี้ใหม่) |
| ทางสุดท้าย | เครื่อง C + Cloudflare tunnel | 3000 | restore dump ลง Neon/WSL | เฉพาะเมื่อ Render และ Railway ใช้ไม่ได้ | `app-prod` | NLess Demo (ชี้ใหม่) |

หมายเหตุ:
- orchestrator ต่างคนอยู่ต่างเครื่อง พอร์ต 3000/5170 ซ้ำกันได้
- `lane:init` เขียน `.env.local` ของแต่ละ worktree จาก `.lane` + `..\nless.secrets.env` (ห้าม commit)
- ตัวแปร mode (`LINE_MODE`, `META_MODE`, `GOOGLE_MODE`, `PAYMENT_MODE`) ใน dev ปล่อย `sandbox` เป็นค่าเริ่มต้น เปิด `real`/`test` เฉพาะ lane ที่ทดสอบ provider นั้นจริง ๆ

## 2. Neon (dev database) ต่อคน

Neon free tier **organization ของทีมหนึ่งอัน (`Endless`)** ข้างในมี **หนึ่ง project ต่อคน** (`nless-hack-a` / `-b` / `-c`) · แผนฟรีมีสมาชิก org ได้ไม่จำกัด ทุกคนล็อกอินด้วยบัญชี Neon ของตัวเอง **ไม่แชร์รหัสผ่าน** · แยก project ต่อคนเพราะโควตา (1 GB, 100 compute-hours ต่อเดือน) นับต่อ project และความผิดพลาดใน lane ของคนหนึ่งไม่ถึง DB ของอีกสองคน · สมาชิกมองเห็นทุก project ใน org: ใช้เฉพาะ project ของตัวเอง · เหตุผลที่ไม่ใช้ Supabase สำหรับ dev: หนึ่ง database ต่อ project และ direct connection เป็น IPv6 ล้วน จะบังคับให้ใช้ schema ต่อ lane + pooler (D15) · Supabase เป็นตัวสำรองเท่านั้น

### 2.1 ตั้งค่า (คืนนี้)
0. **C ทำครั้งเดียว:** neon.tech → สมัคร → สร้าง organization `Endless` → สร้าง 3 project (ขั้นตอนข้อ 1 ด้านล่าง) ชื่อ `nless-hack-a`, `nless-hack-b`, `nless-hack-c` → หน้า **People** → **Invite member** ด้วยอีเมลของ A และ B (C เป็น Admin คนเดียว) · A และ B สมัคร Neon ด้วยอีเมลนั้นแล้วกดรับคำเชิญ · ข้อ 2–5 ด้านล่าง**เจ้าของเครื่องทำเอง**กับ project ของตัวเอง
1. Create project → Region **AWS Asia Pacific 1 (Singapore) `aws-ap-southeast-1`** → Postgres version 17 (หรือใกล้เคียงที่ให้เลือก; Neon มี pgvector ในตัว) → ชื่อ `nless-hack-<a|b|c>`
2. Dashboard → **Connect** → **ปิด** ช่อง "Connection pooling" (ต้องการ **direct endpoint**: host ต้องไม่มี `-pooler`) → คัดลอก connection string
3. เก็บเฉพาะส่วน server ลง `..\nless.secrets.env` (พิมพ์เอง) ในรูปนี้ (ไม่มีชื่อ database; `lane:init` ต่อชื่อ DB ให้):
   ```
   PG_SERVER_URL=postgres://<user>:<password>@<ep-xxxx>.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   (รูปแบบตาม `.env.example`: `lane:init` สร้าง `DATABASE_URL=${PG_SERVER_URL}/nless_hack_<lane>` และ `TEST_DATABASE_URL` ลงท้าย `_test` แล้ว append `?sslmode=require` ให้เอง)
4. สร้าง DB ต่อ lane ด้วย `npm run lane:init` แล้ว `npm run db:create` (สร้าง `nless_hack_<lane>` และ `_test`) · pool ต่อ process `DB_POOL_MAX=5`
5. auto-suspend: compute หยุดหลังไม่ใช้งาน (D15 ระบุ ~5 นาที) → query แรกหลังหยุดช้าเพิ่ม ≈ 0.5 วินาที (ตัวเลขจาก D15; **UNCONFIRMED** กับแผนฟรีปัจจุบัน) · test รอบแรกของชั่วโมงอาจช้า ไม่ใช่บั๊ก · latency กรุงเทพ → สิงคโปร์ทำให้ test ช้ากว่า local เล็กน้อย

### 2.2 ตรวจคืนนี้ (ข้อสมมติสองข้อของ D16)

รันจาก PowerShell (ต้องมี `psql`) หรือจาก WSL (`sudo apt install postgresql-client`) โดยไม่พิมพ์ค่าจริงลงบรรทัดคำสั่ง ใช้ตัวแปรสภาพแวดล้อมจากไฟล์:

```powershell
# PowerShell: โหลด PG_SERVER_URL จากไฟล์ secrets เข้าตัวแปรของ session นี้ (ไม่แสดงค่า)
Get-Content ..\nless.secrets.env | Where-Object { $_ -match '^PG_SERVER_URL=' } | ForEach-Object { $env:PG_SERVER_URL = $_.Substring(14) }
$base = $env:PG_SERVER_URL -replace '\?.*$',''      # ตัด query
$q    = ($env:PG_SERVER_URL -split '\?',2)[1]
psql "$base" -c "select 1" ; psql "$($base -replace '/[^/]+$','/neondb')?$q" -c "CREATE DATABASE nless_probe;"
psql "$($base -replace '/[^/]+$','/nless_probe')?$q" -c "CREATE EXTENSION vector; select extversion from pg_extension where extname='vector'; select pg_try_advisory_lock(7);"
psql "$($base -replace '/[^/]+$','/neondb')?$q" -c "DROP DATABASE nless_probe;"
```
ผ่านเมื่อ: `CREATE DATABASE` สำเร็จ · `CREATE EXTENSION vector` สำเร็จและเห็น `extversion` · `pg_try_advisory_lock` = `t` (พิสูจน์ว่าเป็น direct/session) · `host` ของ string ไม่มี `-pooler`

จดผลใน SOURCE-BASELINE และตรวจรายการ **UNCONFIRMED** ต่อไปนี้ (หน้าราคา/limits ของ Neon เปลี่ยนได้ ห้ามเดา):

| UNCONFIRMED | ตรวจอย่างไร | ถ้าไม่ผ่าน |
|---|---|---|
| Neon free รองรับหลาย database ใน project เดียว (ต่อคนต้องมี 4 session × 2 = 8 DB) | `CREATE DATABASE` 8 ครั้ง (หรือรัน `npm run db:create` ครบ 4 lane) | ใช้ project/branch เพิ่ม หรือ WSL fallback (§3) |
| เพดานจำนวน connection พร้อมกัน (4 server × pool 5 + test + Vite) | `show max_connections;` และเปิด 20 connection พร้อมกันด้วยสคริปต์ node สั้น ๆ | ลด `DB_POOL_MAX=3` ใน `.env.local` · ปิด dev server ที่ไม่ใช้ |
| โควตา compute-hours และพื้นที่เก็บข้อมูลต่อ project (embedding `vector(1536)` + seed demo) | ดูหน้า Billing/Usage ของ project | ลดข้อมูลเดโม หรือสลับ lane ที่ใช้น้อยไป WSL |
| จำนวน project ที่สร้างได้ต่อบัญชี | สร้างได้ 1 พอ | — |
| ความเร็ว test จริง (กรุงเทพ→สิงคโปร์) | `npm test` ชุดใหญ่ใน dry run (เมื่อมี repo) | WSL fallback เฉพาะ lane นั้น |

## 3. สำรอง: PostgreSQL 16 + pgvector ใน WSL2 (Ubuntu 24.04)

ใช้เมื่อ Neon ล่ม/ช้า/ติดโควตา · ไม่ต้องใช้ Docker · pgvector 0.6 รองรับ `vector`, cosine `<=>` และ HNSW (D15)

```bash
# ครั้งเดียว (PowerShell admin: wsl --install -d Ubuntu-24.04 แล้ว restart)
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-16-pgvector postgresql-client-16
sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '<ตั้งรหัสเอง>';"      # พิมพ์ในเทอร์มินัลเอง ไม่แปะในแชต
sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS vector;" -d template1   # ให้ทุก DB ใหม่มี vector
```
listen address: ค่าเริ่มต้น `localhost` พอ (WSL2 ส่งต่อ `127.0.0.1:5432` ให้ Windows เอง) ตรวจ: `sudo -u postgres psql -c "show listen_addresses"` → `localhost` · ถ้า Windows เชื่อมไม่ได้: ตรวจว่าไม่มี Postgres ฝั่ง Windows ใช้พอร์ต 5432 อยู่, ตั้ง `sudo nano /etc/postgresql/16/main/postgresql.conf` → `listen_addresses = '*'` และเพิ่มใน `pg_hba.conf` บรรทัด `host all all 127.0.0.1/32 scram-sha-256` แล้ว `sudo service postgresql restart`

แล้วเปลี่ยนใน `..\nless.secrets.env` (ชื่อตัวแปรเดิม ไม่มี `sslmode`):
```
PG_SERVER_URL=postgres://postgres:<รหัส>@127.0.0.1:5432
```
รัน `npm run lane:init && npm run db:create && npm run db:migrate && npm run db:seed` ใหม่ · หลัง reboot Windows ต้อง `sudo service postgresql start` ใหม่ (WSL ไม่เปิด systemd ค่าเริ่มต้น) · ตรวจ: `psql "postgres://postgres:<รหัส>@127.0.0.1:5432/postgres" -c "select version()"`

## 4. ตาราง "อะไรแทน AWS ส่วนไหน" (D15)

| Papi (AWS) | Runtime ของเรา (โค้ดเดียวกันใน dev และ production) |
|---|---|
| API Gateway + HTTP Lambdas | Express routes ใน `features/<slug>/routes.ts` |
| SQS consumers / workers | job worker ใน process บนตาราง `jobs` (F35) |
| EventBridge schedules | scheduler ใน process (F35) รันที่ instance เดียวด้วย Postgres advisory lock |
| API Gateway WebSocket | WebSocket บน server เดียวกัน (`/ws`) |
| S3 uploads | ดิสก์: `var/uploads` ต่อ worktree (dev) · Render disk `/var/data/uploads` (production) |
| Cognito | email + password session ของเราเอง (F02) |
| VoiceGateway บน EC2 | browser ↔ OpenAI Realtime ผ่าน WebRTC · tool รันบน server เรา |
| Secrets Manager / SSM | dev: `..\nless.secrets.env` ต่อเครื่อง · production: Render environment variables |

## 5. Webhook และ channel ของ provider ต่อ environment

| Provider | dev (เครื่องคน) | production |
|---|---|---|
| LINE | channel **NLess Dev** → webhook ชี้ tunnel ของ **C2** (`${PUBLIC_BASE_URL}/webhooks/line/<channel id>`) · แต่ละ channel มี webhook ได้ URL เดียว | channel **NLess Demo** → Render ตั้งแต่ ~12:00 · QR ของ OA นี้คือที่กรรมการสแกน · **ห้ามชี้ NLess Demo เข้าเครื่องใคร** |
| Meta (Messenger/IG) | app เดียว webhook เดียว: C2 ชี้ tunnel ตอนสร้าง F18 | สลับไป Render เมื่อ F18 deploy (C2 โพสต์ `DONE` พร้อมการสลับ) · dev mode = เฉพาะ app roles / test users |
| Google OAuth (F16, F06 stretch) | OAuth client เดียว ลงทะเบียน redirect ครบทุกพอร์ต (ด้านล่าง) · สถานะ Testing + test users | `https://<render-url>/oauth/callback` |
| OpenAI | key `app-dev` ของแต่ละคน (US$30) | key `app-prod` (US$60) |
| Web Push (F31) | VAPID คีย์ที่สร้างคืนนี้ | ค่าเดียวกันใน Render |

**Google redirect URIs ที่ต้องลงทะเบียน** (Authorized redirect URIs ของ OAuth client; เส้นทาง `/oauth/callback` ตาม `.env.example`):
```
http://localhost:5170/oauth/callback
http://localhost:5171/oauth/callback
http://localhost:5172/oauth/callback
http://localhost:5173/oauth/callback
http://localhost:5174/oauth/callback
http://localhost:5175/oauth/callback
http://localhost:5176/oauth/callback
http://localhost:5177/oauth/callback
http://localhost:5178/oauth/callback
http://localhost:5179/oauth/callback
https://<render-url>/oauth/callback
```
(ใส่ 5170–5179 ทั้งหมดไว้ก่อน ไม่ต้องกลับมาแก้ · ใส่ URL ของ Railway เมื่อสลับ) · ใช้ `http://localhost` ได้กับ OAuth client ประเภท Web ในสถานะ Testing (**UNCONFIRMED** ตรวจตอนสร้าง client)

## 6. ใครถืออะไร

| บัญชี / ความลับ | ผู้ถือ | หมายเหตุ |
|---|---|---|
| Render, Railway, ตัวแปร production | **C** | ค่าลับสร้างด้วย node ตาม deployment.md §1 |
| OpenAI `app-prod` key | **หัวหน้า** | พิมพ์ลง Render เอง หรือ C พิมพ์ต่อหน้า |
| OpenAI `app-dev` key | แต่ละคน | พิมพ์เองจาก dashboard ลง `..\nless.secrets.env` |
| Neon organization `Endless` | **C** (Admin) · A, B เป็นสมาชิกด้วยบัญชีของตัวเอง | หนึ่ง project ต่อคน · แต่ละคนคัดลอก `PG_SERVER_URL` ของ project ตัวเองเอง ลงเครื่องตัวเอง (§2.1) |
| LINE *NLess Demo* + *NLess Dev* | **C** | C2 ใช้ค่าของ Dev ในเครื่อง C เดียวกัน |
| Meta developer app + test users | **C** | |
| Google OAuth client + test users | **C** | A3 (F16) และ B3 (F06) ต้องใช้ client id/secret ตอนทดสอบจริง: ส่งค่าให้ด้วยตัวต่อตัว (password manager share หรือพิมพ์ให้) ไม่ผ่านแชตหรือ git |
| VAPID keys | C (สร้างครั้งเดียว) | C3 ใช้ในเครื่องได้ (ค่าเดียวกันกับ production หรือสร้างแยก) |
| Tunnel (cloudflared) | C (C2 ใช้) | |
| บอร์ด (`SITES_*`, `BOARD_*`) | ทุกคน | เฉพาะ `..\nless.secrets.env` |
| MCP ของ Codex | Neon: แต่ละคน · Render: **C** | ล็อกอิน OAuth ด้วยบัญชีตัวเอง ไม่มีค่าลับในไฟล์ ([chatgpt-app-setup.md §9](chatgpt-app-setup.md)) · ไม่แชร์บัญชี ไม่โพสต์ credential บนบอร์ด |

### 6.1 `..\nless.secrets.env` ต่อเครื่อง (ชื่อคีย์เท่านั้น)

ทุกเครื่อง: `OPENAI_API_KEY` · `PG_SERVER_URL` · `SITES_URL` · `SITES_BYPASS_TOKEN` · `BOARD_SECRET` · `BOARD_REPO` · `BOARD_ISSUE` · `BOARD_TEAM_LOGINS` · `BOARD_SOURCE` (ถ้าบังคับ github) · `E2E_BASE_URL` · `E2E_DEV_LOGIN_TOKEN` (ก่อน F02) · `E2E_EMAIL` · `E2E_PASSWORD` (หลัง F02)

เครื่อง C เพิ่ม: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (ของ **NLess Dev**) · `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_TEST_PAGE_ID`, `META_TEST_IG_ACCOUNT_ID` · `PUBLIC_BASE_URL` (URL ของ tunnel ตอนใช้) · `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` · และสำเนาค่า production ที่สร้างเอง: `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DEV_LOGIN_TOKEN`, `SEED_USER_PASSWORD`

เครื่อง A (A2/A3) เพิ่มตามที่ใช้: `PROMPTPAY_TEST_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TEST_CALENDAR_ID` · เครื่อง B (B3 F06 stretch): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

ห้ามใส่ค่าเหล่านี้ใน repo, `.env.local` ที่ commit, โพสต์บอร์ด, log, fixture · ห้ามมี secret ใน `VITE_*`

### 6.2 แชร์ทรัพยากร ไม่แชร์ login

- **แต่ละบัญชีมีเจ้าของคนเดียว** และทุกคนล็อกอินด้วยบัญชีของตัวเอง: GitHub (A, B เป็น collaborator ของ repo ของ C) · OpenAI (`app-dev` ของแต่ละคน) · Neon (สมาชิก org `Endless`) · Codex MCP (OAuth ของตัวเอง)
- **Render อยู่ใน workspace Hobby ของ C** (แผนฟรีมีสมาชิกได้คนเดียว) A และ B ไม่ต้องใช้: deploy เองทุก merge · งานที่ล้มดูได้ที่หน้า `/ops` ของแอป · log ของ production ขอ C0 ด้วย `NEED TO:C0` (C0 อ่านผ่าน Render MCP) · ห้ามแชร์รหัสผ่านหรือ API key ของ Render (key เข้าถึงได้ทั้ง workspace ไม่มีแบบอ่านอย่างเดียว) · ถ้าทีมอยากให้ทุกคนเข้า dashboard ได้จริง ต้องอัปเกรดเป็น Pro ($25/เดือน คิดเต็มหรือตามวันไม่ยืนยัน)
- **ค่าลับของ production** (`SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, key `app-prod`, LINE Demo, Meta) พิมพ์ลง env ของ Render โดยตรง ไม่มีสำเนาที่อื่นนอกจากเครื่อง C ตาม §6.1
- **ค่าลับที่ต้องส่งต่อจริง** (Google OAuth client): ส่งตัวต่อตัวด้วย password manager share ที่หมดอายุเอง (เช่น Bitwarden Send) หรือพิมพ์ให้ต่อหน้า · **ห้ามโพสต์บนบอร์ด** แม้บอร์ดเป็น private: ทุกโพสต์ถูก hook ป้อนเข้า Codex ทั้ง 12 session (ไปถึง OpenAI และค้างใน transcript, `.team-board/hook-*.txt`) และ mirror ไป GitHub issue · สคริปต์บอร์ดจะ redact เป็น `REDACTED` อยู่ดี
- **ของที่ไม่ลับ โพสต์บนบอร์ดได้:** URL ของ production, QR ของ OA, ชื่อ project ของ Neon, lane ไหนใช้ DB ไหน

### 6.3 หลังงาน: ลบและเพิกถอน (C ทำหลังประกาศผล คนอื่นทำของตัวเอง)

1. `pg_dump` production (ถ้ายังไม่ได้ทำตอน 16:45)
2. Render: ลบ web service, Postgres และ disk (suspend ไม่พอ: disk กับ DB ยังคิดเงิน) · Railway: ลบ project
3. Neon: ลบ 3 project หรือลบ org `Endless` ทั้งอัน
4. OpenAI: revoke key `app-dev` ของทุกคน และ `app-prod` (หัวหน้า)
5. LINE: ออก channel access token ใหม่ของทั้งสอง channel และปิด webhook ของ *NLess Demo* · Meta: reset app secret · Google: ลบ OAuth client
6. บอร์ด: เปลี่ยน `BOARD_SECRET` และออก Sites bypass token ใหม่ (หรือลบ site)
7. ทุกเครื่อง: `codex mcp logout neon` (และ `render` บนเครื่อง C) แล้วลบ `..\nless.secrets.env`

## 7. Tunnel สำหรับ debug webhook ในเครื่อง

ใช้เฉพาะ C2 (LINE *NLess Dev*, Meta ก่อน F18 deploy) และ lane ที่ต้องรับ webhook · production ไม่พึ่ง tunnel

ติดตั้ง: `winget install --id Cloudflare.cloudflared`

**Quick tunnel** (ไม่ต้องมีบัญชี/โดเมน; URL สุ่มใหม่ทุกครั้งที่รัน):
```powershell
cloudflared tunnel --url http://localhost:3002
```
คัดลอก URL `https://<คำสุ่ม>.trycloudflare.com` ที่พิมพ์ออกมา → ใส่เป็น `PUBLIC_BASE_URL` ใน `.env.local` ของ worktree C2 → restart `npm run dev` → ใน LINE console (channel **NLess Dev**) ตั้ง Webhook URL = `<URL>/webhooks/line/<channel id>` → Verify · ทุกครั้งที่ tunnel restart ต้องแก้ URL ใหม่ทั้งสองที่

**Named tunnel** (URL คงที่; ต้องมีโดเมนใน Cloudflare — **UNCONFIRMED** ว่าทีมมีโดเมนไหม ตรวจคืนนี้):
```powershell
cloudflared tunnel login
cloudflared tunnel create nless-dev-c2
cloudflared tunnel route dns nless-dev-c2 c2-dev.example.com
cloudflared tunnel --config $env:USERPROFILE\.cloudflared\dev-c2.yml run nless-dev-c2
```
`dev-c2.yml`:
```yaml
tunnel: nless-dev-c2
credentials-file: C:\Users\<user>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: c2-dev.example.com
    service: http://localhost:3002
  - service: http_status:404
```
แล้ว `PUBLIC_BASE_URL=https://c2-dev.example.com` (คงที่ ไม่ต้องแก้ LINE console ซ้ำ)

ngrok เป็นทางเลือกที่ `.env.example` กล่าวถึง (`ngrok http 3002`) ถ้า cloudflared มีปัญหา · ทดสอบ tunnel: `curl https://<URL>/healthz` ต้องได้ 200 ก่อนไปตั้ง webhook

กฎ: tunnel ชี้เฉพาะพอร์ตของ worktree ที่ต้อง debug · ปิดเมื่อเสร็จ · ห้ามชี้ LINE *NLess Demo* เข้า tunnel
