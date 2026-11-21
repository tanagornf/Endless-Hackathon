# Deployment: Render (production), Railway (สำรอง), dry run คืนนี้

ใช้กับ setup step **S9** ของ [F01-core §14](../specs/F01-core.md) · ตัดสินใจจาก [D7, D15](../DECISIONS-2026-11-20.md) · ตัวแปรทั้งหมดใช้ชื่อตาม [.env.example](../competition-plan/templates/.env.example) ทุกตัว · ผู้ถือบัญชีและ production env = **คน C** · key `app-prod` = หัวหน้า (พิมพ์ลง Render เอง หรือให้ C พิมพ์ต่อหน้า)

ข้อเท็จจริงที่ใช้ตลอดไฟล์ (จาก [hackathon-brief §6](../research/hackathon-brief.md)):
- Render Singapore · Docker web service ตัวเดียว (Express + WebSocket + worker + scheduler ในโปรเซสเดียว) · Postgres 17 + `CREATE EXTENSION vector` · disk 1 GB สำหรับ uploads
- **มี disk = ไม่มี zero-downtime deploy** (ทุก deploy มีช่วงที่ service หยุดสั้น ๆ) จึงมี **deploy freeze 16:45**
- ราคาประมาณทั้งวัน ≈ US$0.45–1.10 (web `1c-2g` หรือ `0.5c-512mb` + PG `0.1c-256mb` คิดเป็นรายวินาที): **UNCONFIRMED** ตัวเลขนี้มาจาก brief ไม่ใช่หน้าราคาปัจจุบัน → คืนนี้ดูราคาจริงที่หน้า Create service ก่อนกดยืนยัน
- เลือก web plan `1c-2g` (sharp + embeddings + WebSocket + worker พร้อมกัน เผื่อ memory) · ถ้าราคาไม่ต่างมากแล้วค่อยลดเป็น `0.5c-512mb` ไม่ลดเพื่อประหยัดเงินระดับเซ็นต์

## 0. ไฟล์ที่ S9 สร้าง (copy จากข้างล่างทั้งก้อน)

| ไฟล์ | ที่ |
|---|---|
| `Dockerfile` | root |
| `.dockerignore` | root |
| `render.yaml` | root |
| `scripts/docker-entrypoint.sh` | `chmod +x` แล้ว commit (`git update-index --chmod=+x scripts/docker-entrypoint.sh` บน Windows) |

สมมติฐานเรื่อง repo (ถ้าไม่ตรง ปรับ `Dockerfile` ให้ตรง แล้วจดใน EVIDENCE.md):
1. มี `package-lock.json` ที่ root และ `npm ci` ติดตั้ง workspace ทั้งหมดในครั้งเดียว
2. `npm run build` สร้าง `web/dist` (หลัง `typecheck`) · `npm run start` = `tsx server/src/core/server.ts` (ต้องมี devDependencies ใน image เพราะ `tsx` เป็น dev dependency) · `npm run db:migrate` = `tsx scripts/db.ts migrate`
3. server อ่าน `process.env.PORT` และ bind `0.0.0.0` (F01 §4 server.ts)

### 0.1 `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

# OS packages (ทั้งหมดที่ runtime ต้องใช้):
#  - fontconfig + fonts-thai-tlwg + fonts-noto-core : เซิร์ฟเวอร์วาดข้อความไทยเป็น PNG ด้วย sharp (รูปสินค้าเดโม, สลิปสังเคราะห์ F14/F37)
#    ไม่มีฟอนต์ไทย = ตัวอักษรเป็นสี่เหลี่ยม  (fonts-noto-core มี Noto Sans Thai; fonts-thai-tlwg มี Garuda/Loma/Norasi ฯลฯ)
#  - ca-certificates : TLS ไป OpenAI/LINE/Meta/Google
#  - util-linux (setpriv) มีอยู่ใน image แล้ว ใช้ใน entrypoint เพื่อ drop สิทธิ์
# sharp ใช้ binary สำเร็จรูป (linux-x64 glibc, มี libvips ในตัว) ไม่ต้องลง libvips/build-essential
# pdfjs-dist เป็น JS ล้วน · Playwright browsers ไม่อยู่ใน image (smoke รันจากเครื่องคน)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-thai-tlwg fonts-noto-core \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# build-time ของ Vite (ค่า public เท่านั้น, ห้ามมี secret ใน VITE_*)
ARG VITE_API_BASE=/api/v1
ARG VITE_WS_PATH=/ws
ARG VITE_DEV_LOGIN=1
ARG VITE_VAPID_PUBLIC_KEY=
ENV VITE_API_BASE=$VITE_API_BASE VITE_WS_PATH=$VITE_WS_PATH VITE_DEV_LOGIN=$VITE_DEV_LOGIN VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NPM_CONFIG_UPDATE_NOTIFIER=false

# ติดตั้ง dependency (รวม dev: ต้องใช้ tsx + vite + typescript) ก่อน copy source เพื่อให้ layer cache ทำงาน
# COPY . . ก่อน npm ci: ถูกต้องกับทุกรูป workspace (cache layer เสียไป แต่ build รอบแรกแค่ไม่กี่นาที)
COPY . .
RUN npm ci --include=dev

# build web bundle (script นี้รัน typecheck ก่อน vite build: typecheck พัง = deploy ล้ม ซึ่งตั้งใจ)
RUN npm run build

ENV NODE_ENV=production
# Render ตั้ง PORT ให้เอง (default 10000) · local docker run ใช้ -e PORT=3000
EXPOSE 10000

# entrypoint เริ่มเป็น root เพื่อ chown ของ disk ที่ mount (disk มักเป็นของ root) แล้ว drop เป็นผู้ใช้ node
RUN chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]

# ไม่บังคับ: Render ใช้ healthCheckPath ใน render.yaml; ตัวนี้ไว้ให้ docker run ในเครื่องตรวจได้
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

หมายเหตุ:
- ใช้ `COPY . .` ก่อน `npm ci` (ง่ายและถูกต้องกับทุกรูป workspace) · `.dockerignore` กันไม่ให้ `node_modules`, `.env*`, `var/` เข้า image
- non-root: entrypoint ทำให้โปรเซสหลักรันเป็นผู้ใช้ `node` (ดู 0.4) · ตรวจคืนนี้ว่าเขียน `/var/data/uploads` ได้ (dry run ข้อ 3.5)
- `npm run build` ใช้ `VITE_DEV_LOGIN=1` ตอน build จนกว่า F02 merge: หลัง F02 ให้เปลี่ยน ARG default เป็น `0` หรือตั้ง build arg ใน Render (แต่ถ้าหน้า login จริงมาแทนปุ่ม dev login แล้ว ค่านี้ไม่มีผล) 
- Node official image มี ICU เต็ม ตรวจ (ควรได้ `["สวัสดี","ครับ"]` หรือแบ่งคำใกล้เคียง ไม่ใช่ตัวอักษรเดี่ยวทุกตัว):

```bash
docker run --rm node:24-bookworm-slim node -e "console.log(process.versions.icu, JSON.stringify([...new Intl.Segmenter('th',{granularity:'word'}).segment('สวัสดีครับพี่ขายของ')].filter(s=>s.isWordLike).map(s=>s.segment)))"
```

ตรวจว่าฟอนต์ไทยใช้งานได้ใน image (ต้องมีบรรทัดฟอนต์ ไม่ว่าง) และ sharp วาดไทยได้:

```bash
docker run --rm nless-test fc-list :lang=th family | sort -u | head
docker run --rm nless-test node -e "const s=require('sharp');s(Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"80\"><text x=\"10\" y=\"50\" font-size=\"36\" font-family=\"Noto Sans Thai, Garuda, sans-serif\">สวัสดี ราคา ฿590</text></svg>')).png().toFile('/tmp/t.png').then(()=>console.log('png ok'))"
```

(ฟอนต์ในโค้ดวาดรูปควรระบุ `font-family="Noto Sans Thai, Garuda, Loma, sans-serif"` — ชื่อ family ของ Debian: `Noto Sans Thai`, `Garuda`, `Loma`, `Norasi`, `Kinnari`; ยืนยันชื่อจริงด้วย `fc-list :lang=th family` คืนนี้)

### 0.2 `scripts/docker-entrypoint.sh`

```sh
#!/bin/sh
# เริ่มเป็น root → เตรียมโฟลเดอร์ upload บน disk → drop เป็นผู้ใช้ node แล้ว exec คำสั่งที่ได้รับ
# ใช้ได้ทั้ง start command และ preDeployCommand (preDeploy ไม่มี disk: mkdir ล้มได้ ไม่เป็นไร)
set -e
UPLOAD="${UPLOAD_DIR:-/var/data/uploads}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD" 2>/dev/null || true
  chown -R node:node "$UPLOAD" 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
```

### 0.3 `.dockerignore`

```
.git
.github
.codex
node_modules
**/node_modules
dist
web/dist
var
.env
.env.*
!.env.example
.lane
handoff
*.log
playwright-report
test-results
coverage
.DS_Store
```

### 0.4 `render.yaml`

```yaml
# Blueprint: 1 web service (Docker, Singapore) + 1 Postgres 17 (Singapore)
# ตรวจชื่อ field กับ https://render.com/docs/blueprint-spec แล้ว (20 พ.ย. 2569): runtime, plan, region, healthCheckPath,
# preDeployCommand, autoDeployTrigger, disk{name,mountPath,sizeGB}, envVars{key,value|sync|fromDatabase|generateValue},
# databases{name,plan,region,postgresMajorVersion,diskSizeGB,ipAllowList}
# sync:false = Render ถามค่าตอน "สร้าง Blueprint ครั้งแรก" เท่านั้น แล้วไม่แตะอีก (เพิ่ม/แก้ภายหลังในหน้า Environment ของ service)
services:
  - type: web
    name: nless-hack          # URL ที่คาด: https://nless-hack.onrender.com  (UNCONFIRMED: ถ้าชื่อซ้ำ Render เติม suffix → ใช้ URL จริงเป็น APP_BASE_URL)
    runtime: docker
    plan: 1c-2g               # ID plan ตามเอกสาร blueprint-spec; ราคาจริง UNCONFIRMED (ดู §3)
    region: singapore
    branch: main
    autoDeployTrigger: commit # merge เข้า main = deploy (autoDeploy เดิมเลิกใช้แล้ว)
    dockerfilePath: ./Dockerfile
    dockerContext: .
    healthCheckPath: /healthz
    preDeployCommand: npm run db:migrate   # รันก่อนขึ้น release ใหม่ ล้ม = deploy ไม่ขึ้น (ใช้ได้เฉพาะ service แบบจ่ายเงิน)
    disk:
      name: uploads
      mountPath: /var/data
      sizeGB: 1
    envVars:
      # ---- runtime ----
      - { key: NODE_ENV,            value: production }
      - { key: LOG_LEVEL,           value: info }
      - { key: RUN_WORKER,          value: "1" }
      - { key: RUN_SCHEDULER,       value: "1" }
      - { key: UPLOAD_DIR,          value: /var/data/uploads }
      - { key: UPLOAD_MAX_MB,       value: "20" }
      - { key: DB_POOL_MAX,         value: "12" }
      - { key: DATABASE_URL,        fromDatabase: { name: nless-db, property: connectionString } }
      - { key: APP_BASE_URL,        sync: false }    # https://<render-url> ไม่มี / ท้าย
      - { key: WEB_ORIGIN,          sync: false }    # เท่ากับ APP_BASE_URL
      - { key: PUBLIC_BASE_URL,     sync: false }    # เท่ากับ APP_BASE_URL (webhook + OAuth redirect)
      - { key: COOKIE_SECURE,       value: "1" }
      # ---- secrets ที่ C สร้างเอง (เก็บค่าไว้ใน ..\nless.secrets.env ของ C เพื่อใช้ซ้ำที่ Railway) ----
      - { key: SESSION_SECRET,      sync: false }
      - { key: TOKEN_ENCRYPTION_KEY, sync: false }
      - { key: DEV_LOGIN_TOKEN,     sync: false }
      - { key: SEED_USER_PASSWORD,  sync: false }
      # ---- dev login (ชั่วโมงแรก) ----
      - { key: DEV_LOGIN,           value: "1" }
      - { key: DEV_LOGIN_ENABLED,   value: "true" }   # → "false" เมื่อ F02 merge (docs/specs/F02-auth.md §5.9)
      # ---- AI ----
      - { key: MODEL_MODE,          value: openai }
      - { key: OPENAI_API_KEY,      sync: false }      # key ของ project app-prod (hard limit US$60)
      - { key: OPENAI_CHAT_MODEL,        value: gpt-6.2-sol }
      - { key: OPENAI_CHAT_MODEL_FAST,   value: gpt-6.2-sol }
      - { key: OPENAI_CHAT_MODEL_STRONG, value: gpt-6.2-sol }
      - { key: OPENAI_EMBED_MODEL,       value: text-embedding-3-large }
      - { key: EMBED_DIM,                value: "1536" }
      - { key: OPENAI_MODERATION_MODEL,  value: omni-moderation-latest }
      - { key: OPENAI_REALTIME_MODEL,    value: gpt-realtime-2.1 }
      - { key: OPENAI_REALTIME_VOICE,    value: marin }
      - { key: OPENAI_REALTIME_TRANSCRIBE_MODEL, value: gpt-live-transcribe }
      - { key: OPENAI_TRANSCRIBE_MODEL,  value: gpt-transcribe }
      # MODEL_PRICE_TABLE: ไม่ใส่ที่นี่ (ยาวและมี default ใน config.ts ตาม .env.example) · ถ้า core ไม่มี default ให้ใส่ค่าจาก .env.example ทั้งบรรทัดใน dashboard
      # ---- demo / ต้นทุน ----
      - { key: DEMO_RESET_ENABLED,        value: "1" }
      - { key: DEMO_CHAT_DAILY_TURN_CAP,  value: "300" }
      - { key: VOICE_MAX_SECONDS,         value: "120" }
      - { key: VOICE_DAILY_SECONDS,       value: "900" }
      - { key: EVAL_MAX_COST_USD,         value: "1.5" }
      - { key: MCP_ENABLED,               value: "1" }
      - { key: HIDDEN_FEATURES,           value: "" }   # ปรับที่หน้า /ops (PUT /api/v1/ops/features/:id) ไม่ต้อง redeploy
      - { key: EMAIL_MODE,                value: sandbox }
      - { key: SESSION_TTL_HOURS,         value: "12" }
      # ---- ช่องทาง (เพิ่มค่าจริงตามชั่วโมง; ก่อนถึงเวลาปล่อยโหมดเป็น sandbox) ----
      - { key: LINE_MODE,                 value: sandbox }   # → real ตอน 12:00
      - { key: LINE_CHANNEL_ID,           sync: false }
      - { key: LINE_CHANNEL_SECRET,       sync: false }
      - { key: LINE_CHANNEL_ACCESS_TOKEN, sync: false }
      - { key: META_MODE,                 value: sandbox }   # → real เมื่อ F18 deploy
      - { key: META_APP_ID,               sync: false }
      - { key: META_APP_SECRET,           sync: false }
      - { key: META_VERIFY_TOKEN,         sync: false }
      - { key: META_GRAPH_VERSION,        value: v25.0 }
      - { key: META_TEST_PAGE_ID,         sync: false }
      - { key: META_TEST_IG_ACCOUNT_ID,   sync: false }
      - { key: GOOGLE_MODE,               value: sandbox }   # → real เมื่อ F16 deploy
      - { key: GOOGLE_CLIENT_ID,          sync: false }
      - { key: GOOGLE_CLIENT_SECRET,      sync: false }
      - { key: GOOGLE_TEST_CALENDAR_ID,   sync: false }
      - { key: PAYMENT_MODE,              value: sandbox }   # ตลอดงาน (ไม่รับเงินจริง · ไม่มี Omise)
      - { key: SLIP_VERIFY_MODE,          value: vision }
      - { key: PROMPTPAY_TEST_ID,         sync: false }
      - { key: VAPID_PUBLIC_KEY,          sync: false }
      - { key: VAPID_PRIVATE_KEY,         sync: false }
      - { key: VAPID_SUBJECT,             value: "mailto:team@example.test" }   # แก้เป็นอีเมลทีมจริงของ C

databases:
  - name: nless-db
    plan: 0.1c-256mb
    region: singapore
    postgresMajorVersion: "17"
    diskSizeGB: 1
    # ไม่ตั้ง ipAllowList = ทุก IP เชื่อมจากภายนอกได้ (ต้องใช้รหัสผ่าน) เพื่อให้ pg_dump จาก WSL ตอน 16:45 ได้ · ตั้งเป็นปิดหลัง dump ถ้าต้องการ
```

**UNCONFIRMED ใน render.yaml (ตรวจใน dry run §3):**
1. ID plan ของ database `0.1c-256mb` และ `diskSizeGB: 1` ใช้ร่วมกันได้ไหม (เอกสารบอก "1 หรือผลคูณของ 5") · ถ้า Render ปฏิเสธ ให้ตัด `diskSizeGB` ออกแล้วใช้ค่า default ของ plan
2. `sync: false` ปล่อยว่างได้ไหมสำหรับค่าที่ยังไม่มีเวลาสร้าง (LINE/Meta/Google/VAPID) · ถ้าไม่ได้ ใส่ `REPLACE_LATER` แล้วแก้ใน dashboard
3. ชื่อ service ว่างไหม และ URL สุดท้ายคืออะไร (ตั้ง `APP_BASE_URL` ให้ตรงตอนสร้าง) · ทางแก้ถ้าไม่ตรง: แก้ env แล้ว redeploy (≈5 นาที)
4. disk ที่ mount: ผู้ใช้ `node` เขียนได้หลัง entrypoint chown ไหม · `preDeployCommand` ผ่าน `ENTRYPOINT` ของเราได้ไหม (ถ้าไม่ผ่าน entrypoint ก็ยังทำงานได้เพราะ migrate ไม่ต้องใช้ disk)
5. URL ภายใน (internal) ของ Postgres ไม่มี `sslmode`: ตรวจว่า `config.ts` ไม่บังคับ SSL เมื่อ URL ไม่มี `sslmode` (ถ้าบังคับ → `/readyz` ไม่ผ่าน: แก้ที่ core ด้วย `NEED TO:C1` หรือต่อด้วย external URL + `?sslmode=require` ชั่วคราว)

เมื่อเปลี่ยน env ใน dashboard Render จะ redeploy เอง (มีช่วงหยุดสั้น ๆ เพราะมี disk) → **รวมการแก้ env หลายตัวเป็นครั้งเดียว** และห้ามทำ 12:30–13:00 และหลัง 16:45

## 1. ตารางตัวแปร production

คอลัมน์ "ตั้งตอน" = ชั่วโมงที่ค่านั้นต้องอยู่ใน Render · "ใคร" = คนที่ถือค่า · **ห้ามมี secret ใน `VITE_*`** (ค่า `VITE_*` อยู่ใน bundle: ใส่ได้เฉพาะ `VITE_VAPID_PUBLIC_KEY` ซึ่งเป็นกุญแจสาธารณะ)

| ตัวแปร | ค่า / มาจากไหน | ใคร | secret | ตั้งตอน |
|---|---|---|---|---|
| `NODE_ENV` | `production` | C | ไม่ | S9 |
| `PORT` | Render ตั้งเอง ห้ามตั้ง | Render | ไม่ | S9 |
| `APP_BASE_URL` | `https://<ชื่อ>.onrender.com` ไม่มี `/` ท้าย (REQUIRED ไม่งั้น boot ล้ม) | C | ไม่ | S9 |
| `WEB_ORIGIN` | เท่ากับ `APP_BASE_URL` (origin ของ CSRF / redirect OAuth) | C | ไม่ | S9 |
| `PUBLIC_BASE_URL` | เท่ากับ `APP_BASE_URL` (webhook LINE/Meta และ OAuth redirect ใช้ค่านี้) | C | ไม่ | S9 |
| `DATABASE_URL` | `fromDatabase` ใน blueprint (internal connection string) · ห้ามรัน `db:create`/`db:reset` บน production | Render | ใช่ | S9 |
| `DB_POOL_MAX` | `12` (F35: worker ถือ connection หนึ่งตัวต่อ job ที่มี lockKey + scheduler อีกหนึ่ง) · ตรวจ `SHOW max_connections;` ใน dry run ถ้า < 25 ลดเป็น `8` แล้วตั้ง `JOBS` concurrency ตาม spec F35 | C | ไม่ | S9 |
| `UPLOAD_DIR` | `/var/data/uploads` (disk 1 GB) | C | ไม่ | S9 |
| `UPLOAD_MAX_MB` | `20` | C | ไม่ | S9 |
| `RUN_WORKER` | `1` | C | ไม่ | S9 |
| `RUN_SCHEDULER` | `1` (instance เดียวเท่านั้น; ห้ามเพิ่ม instance) | C | ไม่ | S9 |
| `COOKIE_SECURE` | `1` (core บังคับอยู่แล้วเมื่อ production) | C | ไม่ | S9 |
| `SESSION_SECRET` | สุ่ม ≥ 32 ตัวอักษร: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` | C | ใช่ | S9 |
| `TOKEN_ENCRYPTION_KEY` | 32 byte base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` · **ห้ามเปลี่ยนหลังมีข้อมูล** (token LINE/Meta/Google ใน DB เข้ารหัสด้วยค่านี้ และ dump ที่ restore ที่อื่นต้องใช้ค่าเดียวกัน) · เก็บสำเนาใน `..\nless.secrets.env` ของ C | C | ใช่ | S9 |
| `DEV_LOGIN` | `1` | C | ไม่ | S9 |
| `DEV_LOGIN_ENABLED` | `true` → **`false` เมื่อ F02 merge** ตามขั้นตอนของ [F02-auth §5.9](../specs/F02-auth.md) (ตั้ง `SEED_USER_PASSWORD` → redeploy → ทดสอบ `/login` → ปิด → redeploy → `GET /api/dev/status` ต้องได้ 404) · **ห้ามปิดระหว่าง 12:30–13:00** (กำลังตรวจ gate) · login ล้มหลังปิด → ตั้งกลับ `true` | C | ไม่ | S9 |
| `DEV_LOGIN_TOKEN` | สุ่ม ≥ 24 ตัว: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` · ใส่เป็น `E2E_DEV_LOGIN_TOKEN` ใน `..\nless.secrets.env` ของคนที่รัน smoke (พิมพ์เอง) | C | ใช่ | S9 |
| `SEED_USER_PASSWORD` | สุ่ม ≥ 16 ตัว · ตั้งตอน cutover F02 (ใส่เป็น `E2E_PASSWORD` ด้วย) | C | ใช่ | ก่อนปิด dev login |
| `MODEL_MODE` | `openai` | C | ไม่ | S9 |
| `OPENAI_API_KEY` | key ของ project **`app-prod`** (hard limit US$60) เท่านั้น ไม่ใช่ key ของใคร | หัวหน้า / C พิมพ์เอง | ใช่ | S9 |
| `OPENAI_*_MODEL`, `EMBED_DIM`, `OPENAI_REALTIME_VOICE` ฯลฯ | ค่าเหมือน `.env.example` (อยู่ใน render.yaml) | C | ไม่ | S9 |
| `DEMO_RESET_ENABLED` | `1` (ให้ `POST /api/v1/ops/demo/reset` และ `npm run demo:reset` ทำงานบน production) | C | ไม่ | S9 |
| `DEMO_CHAT_DAILY_TURN_CAP` | `300` (เพดาน AI turn ต่อวันของ Demo Chat สาธารณะ; ดูต้นทุนจริงต่อ turn จาก `model_usage` ตอน 12:00 แล้วหัวหน้าปรับให้ 300 turn ไม่เกินงบ US$60 ของ `app-prod`) | C | ไม่ | S9 |
| `VOICE_MAX_SECONDS` / `VOICE_DAILY_SECONDS` | `120` / `900` | C | ไม่ | S9 |
| `EVAL_MAX_COST_USD` | `1.5` | C | ไม่ | S9 |
| `MCP_ENABLED` | `1` (`0` = ปิด MCP endpoint ถ้ามีปัญหา) | C | ไม่ | S9 |
| `HIDDEN_FEATURES` | ว่าง (ค่าเริ่มต้นเท่านั้น; ตัวจริงอยู่ในตาราง `feature_flags` ผ่านหน้า `/ops`) | C | ไม่ | S9 |
| `EMAIL_MODE` | `sandbox` | C | ไม่ | S9 |
| `LINE_MODE` | `sandbox` → `real` ตอน 12:00 | C | ไม่ | 12:00 |
| `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | channel **NLess Demo** (ห้ามใช้ของ NLess Dev) จาก LINE Developers console · C พิมพ์เอง | C | secret/access token ใช่ · id ไม่ | 12:00 |
| `META_MODE` | `sandbox` → `real` เมื่อ F18 deploy | C | ไม่ | F18 |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Meta developer app เดียว · `META_VERIFY_TOKEN` = สตริงสุ่มที่ C คิดเองและพิมพ์ในหน้า webhook ของ Meta | C | secret/verify ใช่ · app id ไม่ | F18 |
| `META_GRAPH_VERSION`, `META_TEST_PAGE_ID`, `META_TEST_IG_ACCOUNT_ID` | `v25.0` · id ของ Page/IG ทดสอบ | C | ไม่ | F18 |
| `GOOGLE_MODE` | `sandbox` → `real` เมื่อ F16 deploy | C | ไม่ | F16 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TEST_CALENDAR_ID` | OAuth client (สถานะ Testing + test users) | C | secret ใช่ | F16 |
| `PAYMENT_MODE` | `sandbox` → `test` เมื่อ F14 deploy | C | ไม่ | F14 |
| `SLIP_VERIFY_MODE` | `vision` | C | ไม่ | F14 |
| `PROMPTPAY_TEST_ID` | ค่าทดสอบ ไม่ใช่เบอร์/เลขจริงของใคร | C | ไม่ | F14 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | สร้างคืนนี้: `npx web-push generate-vapid-keys` · `VAPID_SUBJECT=mailto:<อีเมลทีม>` | C | private key ใช่ | S9 (ใส่ตั้งแต่ต้นกัน rebuild) |
| `VITE_VAPID_PUBLIC_KEY` | ค่าเดียวกับ `VAPID_PUBLIC_KEY` · ส่งเป็น **build arg** ของ Docker (compile เข้า bundle: เปลี่ยนค่า = rebuild) | C | ไม่ (public) | S9 |
| `VITE_DEV_LOGIN` | build arg `1` จนกว่า F02 merge | C | ไม่ | S9 |
| `BUILD_SHA` | ไม่ต้องตั้ง: core อ่าน `RENDER_GIT_COMMIT` | Render | ไม่ | — |
| `E2E_BASE_URL`, `E2E_DEV_LOGIN_TOKEN`, `E2E_EMAIL`, `E2E_PASSWORD` | **ไม่ใช่ตัวแปรของ Render** อยู่ใน `..\nless.secrets.env` ของคนที่รัน smoke | ทุกคน | token/password ใช่ | หลัง S9 |
| `SITES_*`, `BOARD_*` | ไม่ใส่ใน Render (เครื่องมือบอร์ด) | — | — | — |

Docker build args: Render ส่ง env var เข้า build ให้เมื่อ `Dockerfile` ประกาศ `ARG` ชื่อเดียวกัน (**UNCONFIRMED**: ตรวจใน dry run ว่า `VITE_DEV_LOGIN` และ `VITE_VAPID_PUBLIC_KEY` ที่ตั้งใน dashboard ไปถึง `vite build` จริง: เปิดหน้าเว็บแล้วดูว่าปุ่ม dev login ขึ้น / `curl -s https://<url>/assets/*.js | grep -c <ส่วนต้นของ public key>`) ถ้าไม่ถึง: ใส่ค่าตรงใน `ARG … =` ของ Dockerfile (ค่า public ไม่ใช่ secret)

## 2. ขั้นตอน S9 (วันงาน, ก่อน 11:30)

คน C ถือบัญชี Render · C1 เป็นผู้ merge PR `lane/C1/deploy` · C0 ช่วยตรวจ

1. (ก่อน PR merge) C เข้า dashboard.render.com → **New → Blueprint** → เลือก repo แข่ง (ต่อ GitHub แล้วเมื่อคืน) → branch `main` → Render อ่าน `render.yaml` → กรอกค่า `sync: false` ทีละตัว (ค่าที่ยังไม่มี ใส่ตามผล dry run ข้อ 2 ของ UNCONFIRMED ด้านบน) → ตรวจราคาที่หน้าสรุป → **Apply**
2. ดู Events/Logs ของ service: build ≈ 3–6 นาที (ตัวเลขจริง: จับเวลาใน dry run) · `preDeployCommand` รัน `db:migrate` ครั้งแรก (สร้าง extension `vector` + ตาราง)
3. `curl -s https://<url>/healthz` → `{"status":"ok","db":"ok"}` · `/readyz` 200 · `/build-info` → `sha` ตรงกับ `git rev-parse origin/main`
4. **seed ครั้งเดียว** (ร้านสังเคราะห์ A/B + 5 ผู้ใช้): Render dashboard → service `nless-hack` → แท็บ **Shell** → รัน
   ```sh
   npm run db:seed
   ```
   (idempotent: รันซ้ำได้) · เมื่อ PR `lane/C1/core-demo` merge แล้ว (ก่อน 12:30 ตาม F01 §13) รันเพิ่ม:
   ```sh
   npm run db:seed -- --demo
   ```
   ถ้าแท็บ Shell ใช้ไม่ได้: ทางสำรองคือ Render **Jobs** (one-off job ในหน้า service หรือ `render jobs create` ของ Render CLI: **UNCONFIRMED** ชื่อคำสั่ง ตรวจใน dry run) หรือรัน seed จากเครื่อง C ผ่าน external connection string: `DATABASE_URL="$RENDER_DB_EXTERNAL_URL" npm run db:seed` (**UNCONFIRMED**: `assertSafeDbName` อาจปฏิเสธ DB นอก allow-list `^nless_hack_[a-c][0-3](_test)?$` ใน `db:seed`; ถ้าปฏิเสธ → `NEED TO:C1` ให้ production เป็นข้อยกเว้นเมื่อ `NODE_ENV=production` และ `DATABASE_URL` ลงท้าย `.render.com`)
5. ตรวจ: เปิด `https://<url>/dev-login` ใส่ `DEV_LOGIN_TOKEN` → เข้าได้ → `E2E_BASE_URL=https://<url> E2E_DEV_LOGIN_TOKEN=… npm run e2e -- core` ผ่าน
6. โพสต์ `DONE F01 deploy production <url> <sha> TO:A0 TO:B0 TO:C0` (ไม่ใส่ token) แล้วทุกคนใส่ `E2E_BASE_URL=<url>` ใน `..\nless.secrets.env` ของตัวเอง
7. ติดเกิน 15 นาที → Railway (§5) · 11:30 ยังไม่ขึ้น → `BLOCKED @<หัวหน้า> "production deploy ติดที่ <ขั้น>"` (lane อื่นทำงานบน dev ต่อได้)

## 3. Dry run คืนนี้ (คน C, ≈ 40 นาที)

เป้า: รู้ล่วงหน้าว่า Render ทำอะไรได้จริงก่อนวันงาน และลบทิ้งหลังเสร็จ (เสียเงินเป็นเซ็นต์) ทำจาก repo ว่างชื่อ `nless-render-dryrun` (private)

### 3.1 เตรียมบัญชี
1. สมัคร Render (render.com) → Billing → ใส่บัตร → ตรวจว่า plan จ่ายเงินสร้าง web service + Postgres ได้ (ไม่ต้องเป็น free) · จด **ราคาต่อชั่วโมง/เดือนที่หน้า Create** ของ `1c-2g`, `0.5c-512mb`, Postgres `0.1c-256mb`, disk 1 GB ลง SOURCE-BASELINE (แทนตัวเลข UNCONFIRMED ด้านบน)
2. Account Settings → GitHub → authorize ให้เห็น repo dry run (วันงานจะ authorize repo แข่งแล้วเมื่อสร้าง)

### 3.2 แอป hello (copy ทั้ง 4 ไฟล์ใน repo dry run)

`package.json`
```json
{ "name": "nless-render-dryrun", "private": true, "type": "module",
  "scripts": { "start": "node server.mjs", "migrate": "node -e \"console.log('predeploy ok, uid', process.getuid())\"" },
  "dependencies": { "pg": "8.16.0", "sharp": "0.35.5", "ws": "8.22.1" } }
```
(`pg` ตรวจเวอร์ชันล่าสุดด้วย `npm view pg version` แล้วใช้ตัวนั้น · `sharp`/`ws` เวอร์ชันเดียวกับ F01 §S1)

`server.mjs`
```js
import http from 'node:http';
import fs from 'node:fs';
import pg from 'pg';
import sharp from 'sharp';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  try {
    if (url.pathname === '/healthz') return send(200, { status: 'ok' });
    if (url.pathname === '/slow') { const s = Math.min(Number(url.searchParams.get('s') || 20), 120); const t0 = Date.now(); await sleep(s * 1000); return send(200, { waitedMs: Date.now() - t0 }); }
    if (url.pathname === '/pg') {
      const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
      await c.query('CREATE EXTENSION IF NOT EXISTS vector');
      const v = (await c.query("select extversion from pg_extension where extname='vector'")).rows[0];
      const m = (await c.query('show max_connections')).rows[0]; const ver = (await c.query('show server_version')).rows[0];
      const adv = (await c.query('select pg_try_advisory_lock(42) as got')).rows[0]; await c.end();
      return send(200, { vector: v, max_connections: m, server_version: ver, advisory_lock: adv });
    }
    if (url.pathname === '/disk') {
      const f = '/var/data/counter.txt'; let n = 0; try { n = Number(fs.readFileSync(f, 'utf8')) } catch {}
      fs.writeFileSync(f, String(n + 1)); fs.mkdirSync('/var/data/uploads', { recursive: true }); fs.writeFileSync('/var/data/uploads/t.txt', 'x');
      return send(200, { counter: n + 1, uid: process.getuid() });
    }
    if (url.pathname === '/icu') return send(200, { icu: process.versions.icu, words: [...new Intl.Segmenter('th', { granularity: 'word' }).segment('สวัสดีครับพี่ขายของ')].filter((s) => s.isWordLike).map((s) => s.segment) });
    if (url.pathname === '/thai.png') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="90"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="58" font-size="40" font-family="Noto Sans Thai, Garuda, Loma, sans-serif">สวัสดี ราคา ฿590</text></svg>';
      return send(200, await sharp(Buffer.from(svg)).png().toBuffer(), 'image/png');
    }
    send(404, { error: 'not found' });
  } catch (e) { send(500, { error: String(e.message || e) }); }
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => { ws.on('message', (m) => ws.send('echo:' + m)); });
server.listen(PORT, '0.0.0.0', () => console.log('listening', PORT));
```

`Dockerfile` (ใช้บรรทัด `RUN apt-get …` ชุดเดียวกับ §0.1 + entrypoint §0.2 เพื่อทดสอบของจริง)
```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-thai-tlwg fonts-noto-core && fc-cache -f && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
```
(ใส่ `scripts/docker-entrypoint.sh` จาก §0.2 ด้วย)

`render.yaml` = ของ §0.4 แต่ตัด envVars ให้เหลือ: `UPLOAD_DIR=/var/data/uploads`, `DATABASE_URL` (fromDatabase), ตั้ง `name: nless-dryrun`, database `nless-dryrun-db`, `preDeployCommand: npm run migrate`

### 3.3 สิ่งที่ต้องตรวจ (ติ๊กทีละข้อ แล้วจดผลลง SOURCE-BASELINE)

| # | ตรวจ | วิธี | ผ่านเมื่อ |
|---|---|---|---|
| 1 | Blueprint apply ได้ | New → Blueprint → เลือก repo | ไม่มี error ชื่อ field/plan · จดข้อความ error ถ้ามี (แก้ `render.yaml` ของจริงตาม) |
| 2 | Region | หน้า service และ DB | ทั้งคู่ **Singapore** |
| 3 | `sync:false` ว่างได้ไหม | ปล่อยค่าหนึ่งตัวว่างตอน Apply | จดว่าได้/ไม่ได้ |
| 4 | URL ที่ได้ | หน้า service | จดรูป `https://<name>.onrender.com` และว่าชื่อถูกเติม suffix ไหม |
| 5 | pre-deploy ผ่าน ENTRYPOINT | ดู log ของ Deploy | เห็น `predeploy ok, uid …` |
| 6 | Postgres 17 + pgvector | `curl https://<url>/pg` | `server_version` 17.x · `vector` มี `extversion` · `max_connections` จดไว้ · `advisory_lock.got = true` |
| 7 | Disk | `curl /disk` สองครั้ง แล้วกด **Manual Deploy** แล้ว `curl /disk` อีกครั้ง | `counter` เพิ่มต่อเนื่องข้าม deploy · `uid` = ผู้ใช้ `node` (ไม่ใช่ 0) เขียน `/var/data/uploads` ได้ |
| 8 | ICU + ฟอนต์ไทย | `curl /icu` · เปิด `/thai.png` | `words` แบ่งคำได้ (ไม่ใช่ตัวอักษรเดี่ยว) · รูปเห็นภาษาไทยอ่านออก ไม่ใช่สี่เหลี่ยม |
| 9 | WebSocket upgrade | `npx wscat -c wss://<name>.onrender.com/ws` แล้วพิมพ์ `hi` | ได้ `echo:hi` · ปล่อยว่าง 60 วินาทีแล้วพิมพ์อีกครั้ง: ถ้าหลุดเอง = ต้องมี ping 25 วินาที (core มีแล้ว) |
| 10 | long-poll 20 วินาที (Demo Chat สาธารณะใช้ `waitMs=20000`) | `curl -s -w "%{http_code} %{time_total}\n" "https://<url>/slow?s=20"` และ `?s=40` | ได้ 200 ที่ ≈ 20 และ ≈ 40 วินาที ไม่ถูกตัดโดย proxy · ถ้าตัดที่เวลาหนึ่ง จดเวลานั้น แล้วบอก A1 ลด `waitMs` ให้ต่ำกว่า (spec F09 สูงสุด 20000) |
| 11 | จับเวลา 1 deploy | กด Manual Deploy · จับเวลาจนสถานะ Live | จดนาที (ตัวเลขนี้คือ "หลัง merge รอเท่าไร" ของทุก lane; PLAN บอก 3–6 นาที) · จดช่วงที่ `/healthz` ไม่ตอบระหว่าง deploy (disk) |
| 12 | Rollback | Events → deploy ก่อนหน้า → **Rollback** | ทำได้ ใช้เวลา < 2 นาที (ดู §4 ข้อ 10) |
| 13 | Shell / one-off | แท็บ **Shell** ของ service | รัน `node -e "console.log(1)"` ได้ · ถ้าไม่ได้ ลอง Jobs / `render jobs create` (จดว่าอะไรใช้ได้) |
| 14 | Env เปลี่ยนแล้ว redeploy เอง | แก้ env ตัวหนึ่ง | จดว่าหยุดกี่วินาที |
| 15 | Build args | ตั้ง `VITE_X=1` ใน env + `ARG VITE_X` ใน Dockerfile แล้วพิมพ์ใน build log | จดว่า env ถึง build หรือไม่ (ข้อ UNCONFIRMED §1) |
| 16 | pg_dump จากภายนอก | ที่ WSL (ดู §4 ข้อ 8) กับ external URL ของ DB dry run | ได้ไฟล์ `.dump` · `pg_restore --list` อ่านได้ |
| 17 | ราคา | Billing / หน้าสร้าง | จดราคาจริงทุกชิ้น |

### 3.4 ตัดสินใจ production DB (บันทึกใน SOURCE-BASELINE ก่อนนอน)

**ค่าเริ่มต้น = Render Postgres 17** (เหตุผล: region เดียวกับ web, ผ่าน internal network, ไม่มี pooler ให้ตั้ง, advisory lock ใช้ได้, ไม่มีบัญชีเพิ่ม, ราคาเป็นเซ็นต์) ใช้ Supabase เฉพาะเมื่อ Render DB สร้างไม่ได้หรือ `max_connections` ต่ำจน pool 5 ยังไม่พอ

ทางเลือกเงิน 0 บาท: **Supabase free (Singapore) ผ่าน session pooler**

| รายการ | ค่า |
|---|---|
| host | `aws-<n>-ap-southeast-1.pooler.supabase.com` (ดูจริงที่ Project → Connect → Session pooler) |
| port | `5432` (session mode: advisory lock + prepared statement ใช้ได้) · **ห้ามใช้ transaction pooler port 6543** |
| user | `postgres.<project-ref>` (ไม่ใช่ `postgres` เฉย ๆ) |
| SSL | `?sslmode=require` |
| `DATABASE_URL` | `postgres://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require` |
| `DB_POOL_MAX` | `5` |
| extension | `CREATE EXTENSION vector` (ใน migration แรก; Supabase มี pgvector) |
| จำกัด **UNCONFIRMED** | จำนวน client ที่ pooler รับในแผนฟรี · ขนาด DB สูงสุดของแผนฟรี · นโยบาย pause เมื่อไม่ใช้งาน · latency Render→Supabase (ข้ามผู้ให้บริการ) · ตรวจคืนนี้: สร้าง project, ต่อด้วย `psql`, รัน `CREATE EXTENSION vector`, `select pg_try_advisory_lock(1)`, เปิด 10 connection พร้อมกันด้วย `pgbench` หรือสคริปต์ |

ถ้าเลือก Supabase: ลบ block `databases:` และบรรทัด `fromDatabase` ออกจาก `render.yaml` แล้วใช้ `sync: false` สำหรับ `DATABASE_URL`

### 3.5 เก็บกวาด
ลบ service และ database dry run ใน dashboard (Settings → Delete) · ลบ repo ถ้าไม่ใช้ · ตรวจว่า Billing ไม่มีรายการค้าง

## 4. ไทม์ไลน์ production ของวันงาน

| เวลา | ใคร | ทำอะไร |
|---|---|---|
| ก่อน 10:00 | C | ตั้ง `..\nless.secrets.env` ของ C ให้มีค่า production ที่สร้างไว้ (SESSION_SECRET, TOKEN_ENCRYPTION_KEY, DEV_LOGIN_TOKEN, VAPID) · ชื่อ Render service ที่จะใช้ |
| ~10:50–11:30 | C + C1 | **S9** (§2): Blueprint → deploy → seed → ตรวจ → โพสต์ `DONE F01 deploy` |
| 11:30 | C0 | Checkpoint: `curl /healthz`, `/build-info` sha ตรง `origin/main` |
| ก่อน 12:00 | C | เตรียมค่า LINE *NLess Demo*: Channel ID / Channel secret / Channel access token (long-lived) แล้วใส่ใน Render env พร้อมกับ `LINE_MODE=real` ใน **การแก้ครั้งเดียว** (ห้ามทำ 12:30–13:00) |
| ~12:00 | C (+ C2 ตรวจ) | **สลับ LINE webhook ไป production** ด้านล่าง |
| ~12:00 | C0 | `npm run db:seed -- --demo` บน production ถ้ายังไม่ทำ (Shell ของ Render; ดู §2 ข้อ 4) |
| 13:00 | C0 | CORE-LOOP GATE บน production (ไม่ใช่ dev) |
| เมื่อ F18 deploy | C2 + C | สลับ Meta webhook (ด้านล่าง) · ตั้ง `META_MODE=real` + ค่า Meta ใน Render |
| เมื่อ F16 deploy | C + A3 | Google OAuth redirect (ด้านล่าง) · `GOOGLE_MODE=real` |
| เมื่อ F02 merge | C + C3 | cutover ตาม [F02-auth §5.9](../specs/F02-auth.md) → `DEV_LOGIN_ENABLED=false` · **ไม่ทำ 12:30–13:00** · ตรวจ `GET /api/dev/status` = 404 |
| 15:30 | C + C0 | ซ่อนฟีเจอร์ที่ไม่ถึง R: เปิด `https://<url>/ops` (ล็อกอินเป็น platform admin) → สวิตช์ feature flag ต่อ feature id (เรียก `PUT /api/v1/ops/features/:featureId`) · ตรวจเมนูบนมือถือว่าไม่มี placeholder |
| 16:30 | C | เปิด uptime monitor ที่ `/healthz` (ด้านล่าง) |
| 16:45 | C | **deploy freeze** · `pg_dump` (ด้านล่าง) · ไม่มี merge เข้า `main` |
| 17:00 | C0 + C | warm-up: เปิด voice 1 session, ส่ง LINE 1 ข้อความไปที่ NLess Demo, upload 1 ไฟล์, ถาม Demo Chat 1 คำถาม · แล้ว **demo reset** (หน้า `/ops` หรือ `npm run demo:reset` ใน Shell) · ซ้อม demo loop 1 รอบ |
| ระหว่างตัดสิน | C0 | อ่านอย่างเดียว · `failure-drills.md` เมื่อมีปัญหา |

### 4.1 LINE *NLess Demo* webhook → production (~12:00)

ต้องมี `LINE_*` ของ NLess Demo ใน Render env และ deploy เสร็จแล้วก่อน
1. เปิด developers.line.biz/console → เลือก Provider ของทีม → Channel **NLess Demo** (Messaging API)
2. แท็บ **Messaging API** → ส่วน **Webhook settings** → **Webhook URL** → Edit → ใส่ `https://<url>/webhooks/line/<channel id ใน DB ของเรา>` (path ตาม `.env.example`/F17: ค่า `<channel id ใน DB>` ได้จากหน้าตั้งค่าช่องทาง LINE ในแอป production หลัง C2 เชื่อม channel; ถ้า F17 spec กำหนด path ต่างจากนี้ ให้ใช้ของ F17) → Update
3. กด **Verify** → ต้องขึ้น Success (ถ้า fail: ตรวจ `LINE_CHANNEL_SECRET` ใน Render ตรงกับ channel, `/healthz` ตอบ, URL ไม่มี `/` เกิน, ดู Render logs หา `signature`)
4. เปิด **Use webhook** เป็น ON
5. ส่วน **LINE Official Account features**: ตั้ง **Auto-reply messages** = Disabled และ **Greeting messages** = Disabled (ให้ AI ของเราเป็นตัวตอบ) ผ่านลิงก์ "Edit" ที่ LINE Official Account Manager (**UNCONFIRMED**: ตำแหน่งปุ่มอาจต่างจากนี้ ตรวจคืนนี้กับ channel จริง)
6. ทดสอบ: เพิ่มเพื่อนด้วย QR ของ NLess Demo ส่ง "สวัสดี" → เห็นข้อความใน inbox ของ production → AI ตอบกลับ → โพสต์ `DONE LINE webhook production` (ไม่มี token)
7. channel *NLess Dev* ยังชี้ tunnel ของ C2 ([environments.md](environments.md)) · ห้ามชี้ NLess Demo เข้าเครื่องใคร

### 4.2 Meta webhook switch (เมื่อ F18 deploy)
Meta developer app เดียว webhook เดียว: C2 เดิมชี้ tunnel → สลับไป Render
1. ใส่ `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_TEST_PAGE_ID` (+ IG) ใน Render และ `META_MODE=real` (รวมครั้งเดียว) · รอ deploy เสร็จ
2. developers.facebook.com → app → **Webhooks** (หรือ Messenger → Settings → Webhooks) → Callback URL = `${PUBLIC_BASE_URL}/webhooks/meta` (**UNCONFIRMED**: path ที่แน่นอนต้องดูจาก spec F18 เมื่อมี · ถ้าต่างให้ใช้ของ F18) · Verify token = ค่า `META_VERIFY_TOKEN` · **Verify and save** → Success
3. Subscribe fields ของ Page (messages, messaging_postbacks) และ Instagram (messages) ตามที่ F18 กำหนด
4. ส่งข้อความจาก test user → เห็นใน inbox production · C2 โพสต์ `DONE` พร้อมบอกว่า tunnel ไม่รับ Meta แล้ว
5. หลังสลับ การดีบัก Meta ในเครื่องจะไม่ได้รับ event (webhook เดียว) → ถ้าต้อง debug ให้ชี้กลับ tunnel ชั่วคราวโดยโพสต์ก่อน

### 4.3 Google OAuth redirect URIs
Google Cloud Console → APIs & Services → Credentials → OAuth client → **Authorized redirect URIs** เพิ่ม:
`https://<url>/oauth/callback` และ `http://localhost:<web port>/oauth/callback` ของทุกพอร์ตที่ใช้ (5170–5179, ดู environments.md) · OAuth consent screen สถานะ **Testing** + เพิ่ม test users · บันทึกแล้วรอ 1–5 นาที (**UNCONFIRMED**: ระยะเวลาที่ Google เผยแพร่ค่าใหม่) · `GOOGLE_MODE=real` + `GOOGLE_CLIENT_ID/SECRET` ใน Render

### 4.4 Omise: ไม่มี
ทีมตัด Omise ออก (20 พ.ย.) · F14 ใช้ PromptPay QR + ตรวจสลิป · `PAYMENT_MODE=sandbox` ตลอดงาน

### 4.5 Uptime monitor ที่ `/healthz` (ตั้งตอน 16:30)

ตัวเลือก A: **UptimeRobot** (ฟรี) — Add New Monitor → Type **HTTP(s)** → Friendly name `nless prod` → URL `https://<url>/healthz` → Monitoring interval = ค่าต่ำสุดที่แผนฟรีให้ (คาด 5 นาที: **UNCONFIRMED** ตรวจหน้าจริง) → Request timeout 30 วินาที → Alert contacts: อีเมลของ C และหัวหน้า (ให้ตั้งใน My Settings ก่อน) → Create · (ถ้ามีตัวเลือก keyword: ค้นหาคำ `ok` ใน response)

ตัวเลือก B: **cron-job.org** (ฟรี) — Create cronjob → Title `nless healthz` → URL `https://<url>/healthz` → Schedule: ทุก 1 นาที (**UNCONFIRMED** ว่าแผนฟรีให้ 1 นาทีไหม) → Advanced: Request method GET, Timeout 30 → Notifications: **Notify on failure** (หลังล้ม 2 ครั้งติด) ทางอีเมล

สำรอง: PowerShell loop บนเครื่อง C (เปิดทิ้งไว้ใน terminal ของตัวเอง; Windows beep เมื่อล้ม)
```powershell
$u = "$env:E2E_BASE_URL/healthz"
while ($true) {
  $ok = $false
  try { $ok = ((Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200) } catch { }
  $t = Get-Date -Format "HH:mm:ss"
  if ($ok) { Write-Host "$t ok" -ForegroundColor Green } else { Write-Host "$t FAIL" -ForegroundColor Red; [console]::Beep(1000,600) }
  Start-Sleep -Seconds 30
}
```
(ตั้ง `$env:E2E_BASE_URL` ในหน้าต่างนั้นก่อน: `$env:E2E_BASE_URL='https://<url>'`) · ถ้าล้ม 2 รอบติด → `failure-drills.md` แถว "Render ล่ม"

### 4.6 สำรอง `pg_dump` ตอน 16:45 (จาก WSL)

ครั้งเดียวคืนนี้ (WSL Ubuntu 24.04): ต้องใช้ client **17** (client เก่ากว่า server จะปฏิเสธ) ซึ่งไม่มีใน repo เริ่มต้นของ Ubuntu:
```bash
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-client-17
pg_dump --version      # ต้องเป็น 17.x
```
เก็บ external connection string (Render → database → **Connections → External Database URL**) ไว้ในไฟล์ที่เฉพาะเครื่อง **ไม่แปะใน terminal/แชต/บอร์ด**:
```bash
umask 077
nano ~/.nless-prod.env          # เขียนบรรทัดเดียว: RENDER_DB_EXTERNAL_URL=postgres://...   (บันทึก ปิด)
```
วันงาน 16:45:
```bash
set -a; . ~/.nless-prod.env; set +a
mkdir -p ~/nless-backups
pg_dump --format=custom --no-owner --no-acl --file ~/nless-backups/nless-prod-$(date +%Y%m%d-%H%M).dump "$RENDER_DB_EXTERNAL_URL"
ls -lh ~/nless-backups && pg_restore --list ~/nless-backups/nless-prod-*.dump | head
```
dump ไม่มี `uploads/` (ไฟล์บน disk) → Demo ที่ต้องใช้ไฟล์ (รูปสินค้า) สร้างใหม่ได้จาก `db:seed -- --demo` (รูปสร้างด้วย sharp ในโค้ด) · ถ้าต้อง restore ที่ปลายทางใหม่:
```bash
psql "$TARGET_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector'
pg_restore --clean --if-exists --no-owner --no-acl -d "$TARGET_URL" ~/nless-backups/<ไฟล์>.dump
```
(`TARGET_URL` อ่านจากไฟล์ env เช่นเดียวกัน)

### 4.7 Playwright smoke กับ production

| ใคร | เมื่อไร | คำสั่ง |
|---|---|---|
| worker (ทุก lane) | **หลัง merge ของตัวเอง** รอ deploy 3–6 นาที: ตรวจ `curl -s $E2E_BASE_URL/build-info` ว่า `sha` = sha ที่ merge ก่อน | `npm run e2e -- <slug>` ผ่านจึงโพสต์ `STATUS … R` |
| C0 | **14:30 และ 16:30** รัน 12 core checks ของ F36 (`tests/e2e`) แล้วแนบผลใน `STAGE` | `npm run e2e -- core` (หรือชุด release ตามที่ F36 กำหนด) |
| C0 | 13:00 gate | เดินด้วยมือ + `npm run e2e -- core` บน production |

ตัวแปร (อยู่ใน `..\nless.secrets.env` หรือ `.env.local` ของคนรัน ไม่ commit):
- `E2E_BASE_URL=https://<url>`
- **ก่อน F02:** `E2E_DEV_LOGIN_TOKEN=<DEV_LOGIN_TOKEN ของ production>` (fixture ยิง `/api/dev/login` พร้อม header)
- **หลัง F02:** `E2E_EMAIL=owner.a@example.test` และ `E2E_PASSWORD=<SEED_USER_PASSWORD>` (fixture ล็อกอินผ่านหน้า `/login`)
- กฎข้อมูล: smoke สร้างแถวด้วย marker `e2e-<timestamp>` **เฉพาะ demo tenant A** · ห้ามแก้แถว SEED · tenant B ใช้เฉพาะพิสูจน์การแยกข้อมูล (ต้องได้ 404) · รันซ้ำได้ · ก่อนกรรมการเข้า `demo:reset` ล้างข้อมูลธุรกรรมของ demo ให้
- ไม่รัน smoke ที่ยิงโมเดลจริงจำนวนมากบน production (งบ `app-prod` US$60) · ถ้า smoke ใช้ AI จริง ให้ใช้ Demo Chat ตัวเดียวและนับเป็น turn ใน `DEMO_CHAT_DAILY_TURN_CAP`

### 4.8 Rollback (< 2 นาที)
Render dashboard → service `nless-hack` → **Events** (หรือ Deploys) → เลือก deploy ที่ Live ก่อนหน้า → **Rollback** → ยืนยัน → รอสถานะ Live → `curl /build-info` ตรวจ sha เก่า · ตัวเลขเวลาจริงจากการซ้อมคืนนี้ (§3.3 ข้อ 12) · **สำคัญ:** rollback ไม่ย้อน migration → ถ้า migration ใหม่เปลี่ยน schema แล้ว ให้ revert PR ต้นเหตุด้วย `gh pr revert` และ **fix forward ด้วย migration ใหม่** (ห้ามแก้ migration ที่ merge แล้ว) · และต้องปิด auto-deploy ชั่วคราวระหว่างแก้ (Settings → Build & Deploy → Auto-Deploy = Off) แล้วเปิดกลับ · โพสต์ `FIX` ตามปกติ

### 4.9 อ่าน log
- Render dashboard → service → **Logs** (ค้นหาด้วยช่องบนสุด เช่น `error`, `jobId`, `LINE`) · เปลี่ยนเป็นดู log ของ deploy ที่ล้มได้ที่ **Events** → deploy ที่ failed
- log ของ preDeploy (migration) อยู่ใน log ของ deploy นั้น
- Render CLI (ถ้าติดตั้ง): `render logs` — **UNCONFIRMED** ชื่อ/flag ตรวจคืนนี้
- core ใช้ pino (JSON บรรทัดเดียว) ตั้ง `LOG_LEVEL=debug` ชั่วคราวได้ แต่ต้อง redeploy

## 5. Railway สำรอง (Singapore, Hobby)

เตรียมและตรวจ **ให้ผ่านก่อนวันงาน** (คืนนี้ถ้าทัน มิฉะนั้นเช้าก่อน 10:00) · บัญชีที่ยังไม่ verify อาจถูกจำกัด outbound network (brief §6) → ใช้บัญชี Hobby ที่จ่ายเงินและยืนยันแล้ว ทดสอบ outbound ด้วย `/pg` และเรียก OpenAI ได้จริง

### 5.1 เตรียม (ทำคืนนี้ด้วย hello app ก่อน แล้วค่อยใช้กับ repo จริงเมื่อวันงาน)
1. railway.com → สมัคร/ล็อกอิน → Plan **Hobby** (ใส่บัตร) · ตรวจว่าบัญชี verified (UNCONFIRMED ขั้นตอนการยืนยัน ดูในหน้า Account)
2. **New Project → Deploy from GitHub repo** → เลือก repo → Railway ตรวจเจอ `Dockerfile` ที่ root และ build ด้วยมัน (ถ้าไม่ ตั้ง Settings → Build → Builder = Dockerfile)
3. **Region:** service → Settings → Region/Deploy → เลือก **Southeast Asia (Singapore)** (ชื่อที่หน้าจอ UNCONFIRMED)
4. **Postgres + pgvector:** New → Database/Template → ค้นหา "pgvector" (template ที่ใช้ image Postgres + pgvector; **UNCONFIRMED** ชื่อ template และเวอร์ชัน Postgres ที่ให้ ตรวจว่าเป็น 17 หรืออย่างน้อย 16) → Deploy ใน project เดียวกัน/region เดียวกัน → ตรวจ `CREATE EXTENSION vector` ด้วย `psql` จาก Railway "Connect"
5. **Volume:** กดขวาบน canvas ที่ service → **Add Volume** → mount path `/var/data` (ขนาด 1 GB หรือขั้นต่ำที่ให้) · entrypoint ของเรา chown ให้ผู้ใช้ `node` อยู่แล้ว
6. **Variables:** service → Variables → ใส่ตามตาราง §1 ทั้งหมด ยกเว้น `PORT` (Railway ตั้งให้) และ
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference variable; ชื่อ service Postgres อาจต่าง ตรวจ) · ใช้ internal URL; ตรวจว่า config.ts ไม่บังคับ SSL เมื่อไม่มี `sslmode` (เหมือน Render)
   - `APP_BASE_URL`, `WEB_ORIGIN`, `PUBLIC_BASE_URL` = โดเมน Railway หลังสร้าง
   - `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DEV_LOGIN_TOKEN` = **ค่าเดียวกับ Render** (จาก `..\nless.secrets.env` ของ C) เพื่อให้ dump จาก Render อ่าน token ที่เข้ารหัสได้และ session/token ของ smoke ใช้ต่อได้
   - `OPENAI_API_KEY` = `app-prod` เหมือนเดิม
   - ใช้ **Raw Editor** วางทั้งบล็อกได้ (UNCONFIRMED ชื่อปุ่ม)
7. **Deploy settings:** Healthcheck path `/healthz` (timeout ตามที่ให้เลือก ≥ 60 วินาทีตอน boot) · **Pre-deploy command** = `npm run db:migrate` (UNCONFIRMED ว่ามีช่องนี้ในแผน Hobby; ถ้าไม่มี ใช้ start command `npm run db:migrate && npm run start` แทนชั่วคราว) · Restart policy on failure
8. **Domain:** Settings → Networking → **Generate Domain** (target port ตาม `PORT` ที่ Railway ตั้ง · ถ้าถาม port ใส่ค่าที่เห็นใน Variables/log `listening`) → ได้ `https://<name>.up.railway.app` (ตรวจ HTTPS ผ่านและ WebSocket/long-poll ใช้ได้เหมือน §3.3 ข้อ 9–10 ด้วย hello app)
9. จดเวลา deploy ครั้งแรกบน Railway และจดในตาราง SOURCE-BASELINE

### 5.2 ต่างจาก Render
| เรื่อง | Render | Railway |
|---|---|---|
| ไฟล์ตั้งค่า | `render.yaml` Blueprint | ตั้งใน UI (หรือ `railway.json`/`railway.toml` ถ้าจะเขียน config as code: ไม่ทำ) |
| DB | `fromDatabase` ใน YAML | reference variable `${{Postgres.…}}` |
| pre-deploy | `preDeployCommand` | Pre-deploy command ในหน้า Settings (UNCONFIRMED) |
| disk | `disk:` ใน YAML | Volume สร้างเอง |
| auto-deploy | `autoDeployTrigger: commit` | เชื่อม branch `main` ใน Settings → Source |
| Shell/seed | แท็บ Shell | `railway shell`/`railway run` จากเครื่อง (ต้องลง Railway CLI + `railway link`) หรือ Deploy command ครั้งเดียว (UNCONFIRMED) |
| ราคา | ต่อวินาที/plan | Hobby ตามการใช้งาน; ดูหน้า Usage |

### 5.3 ขั้นตอนสลับระหว่างวัน (≤ 15 นาที; หัวหน้าหรือ C เป็นผู้ตัดสิน; ทริกเกอร์: Render ล่ม > 10 นาทีหรือ deploy ไม่ขึ้นหลังลองครั้งที่ 2)
1. **0–1 นาที:** C โพสต์ `BLOCKED production Render <อาการ> · เริ่มสลับไป Railway` (ทุกคนหยุด merge)
2. **1–5:** Railway: ต้อง build จาก `main` ล่าสุดแล้ว (ถ้า auto-deploy เปิดไว้ตั้งแต่เตรียม) · ตรวจ env ตรงกับ §1 (โดยเฉพาะ 3 secrets ที่ใช้ร่วม) · ถ้ายังไม่ build: กด **Deploy**
3. **5–8: ข้อมูล**
   - เลือก A (เร็วสุด ไม่ต้องมี dump): `npm run db:seed` + `npm run db:seed -- --demo` ผ่าน Railway shell/CLI (ได้ข้อมูลเดโมสด แต่หายข้อมูลที่ทีมสร้างระหว่างวัน)
   - เลือก B: restore dump ล่าสุด (ต้องมี dump จาก Render ก่อนล่ม: ถ้า Render ยังเข้า DB ได้ให้ dump ทันทีด้วย §4.6) → `pg_restore` ตาม §4.6 (ต้อง `CREATE EXTENSION vector` ก่อน) โดย `TARGET_URL` = external URL ของ Railway Postgres
4. **8–11: จุดชี้ webhook**
   - LINE *NLess Demo*: console → Webhook URL = `https://<railway-domain>/webhooks/line/<channel id>` → Verify → Use webhook ON
   - Meta: Webhooks callback ใหม่ + Verify and save
   - Google: เพิ่ม redirect URI ของโดเมนใหม่
   - ตั้ง `APP_BASE_URL`/`PUBLIC_BASE_URL`/`WEB_ORIGIN` ให้ตรงโดเมนจริง (ถ้าสร้างโดเมนหลังตั้ง) แล้ว redeploy
5. **11–13:** `curl /healthz`, `/readyz`, `/build-info` · `E2E_BASE_URL=https://<railway-domain> npm run e2e -- core`
6. **13–15:** โพสต์ `DONE production moved to https://<railway-domain> sha <sha>` ให้ทุกคนแก้ `E2E_BASE_URL` · อัปเดต QR/ลิงก์ Demo Chat ที่พิมพ์/สไลด์ (ลิงก์สั้นที่ชี้ปลายทางได้ จะเปลี่ยนที่เดียว ดู failure-drills แถว "มือถือกรรมการเปิดไม่ได้") · แจ้ง C0 ให้รัน smoke ชุดเต็ม
7. Render ที่เหลือ: ปิด Auto-Deploy กันสองที่ชนกันเรื่อง scheduler (สอง instance จะแย่ง advisory lock คนละ DB จึงไม่ชนกัน แต่จะมีสอง worker ตอบ LINE ซ้ำถ้า webhook ยังชี้ทั้งคู่ → ต้อง **suspend service ของ Render** ถ้ากู้กลับมาได้)

### 5.4 ทางสุดท้าย: เครื่อง C + Cloudflare tunnel
ใช้เมื่อทั้ง Render และ Railway ใช้ไม่ได้ ช้าแต่ทำได้ (ต้องเตรียมคืนนี้: ตรวจว่า `cloudflared` ติดตั้งแล้ว และ **หัวหน้ามีโดเมนใน Cloudflare ไหม** (named tunnel ต้องมี) — UNCONFIRMED ถ้าไม่มีโดเมน ใช้ quick tunnel ซึ่งได้ URL สุ่มใหม่ทุกครั้งที่รัน ต้องแก้ webhook LINE/Meta ทุกครั้งที่ restart)

เตรียมครั้งเดียว (มีโดเมน `example.com` ใน Cloudflare):
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create nless-prod
cloudflared tunnel route dns nless-prod nless.example.com
```
`%USERPROFILE%\.cloudflared\config.yml`
```yaml
tunnel: nless-prod
credentials-file: C:\Users\<user>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: nless.example.com
    service: http://localhost:3000
  - service: http_status:404
```
รัน production บนเครื่อง C (ใน terminal ของคน ไม่ใช่ agent):
```powershell
cd ..\nless-c0   # worktree ที่ checkout main ล่าสุด
git fetch origin; git checkout --detach origin/main
npm ci; npm run build
$env:NODE_ENV='production'; $env:PORT='3000'; $env:APP_BASE_URL='https://nless.example.com'; $env:PUBLIC_BASE_URL=$env:APP_BASE_URL; $env:WEB_ORIGIN=$env:APP_BASE_URL
$env:UPLOAD_DIR="$PWD\var\uploads"
# DATABASE_URL: Neon/WSL database ที่ restore dump ไว้ (ตัวแปรอื่นตาม §1 จาก ..\nless.secrets.env)
npm run db:migrate; npm run start
```
อีก terminal: `cloudflared tunnel run nless-prod`
Quick tunnel (ไม่มีโดเมน): `cloudflared tunnel --url http://localhost:3000` → ใช้ URL `https://<สุ่ม>.trycloudflare.com` เป็น `APP_BASE_URL` แล้วรีสตาร์ท server
- ข้อมูล: restore dump ล่าสุดลง DB ในเครื่อง/Neon (`pg_restore` §4.6) · **UNCONFIRMED:** `db:seed` ปฏิเสธชื่อ DB นอก allow-list `nless_hack_*` ไหม → ใช้ restore แทน หรือตั้งชื่อ DB เป็น `nless_hack_c0` ของ worktree C0
- ต้อง: เครื่องต่อไฟ, ปิด sleep (`powercfg /change standby-timeout-ac 0`), hotspot สำรอง, ห้ามปิดฝา

## 6. Checklist ก่อนนอนของ C (ติ๊กแล้วโพสต์ผล)

- [ ] Render: บัญชี + บัตร + dry run §3.3 ครบ 17 ข้อ และลบของ dry run แล้ว
- [ ] ราคาจริง, เวลา deploy, `max_connections`, ผล long-poll 40 วินาที จดใน SOURCE-BASELINE
- [ ] ตัดสินใจ production DB (Render PG ตามค่าเริ่มต้น) และจด
- [ ] Railway: บัญชี verified + deploy hello/ตัวจริง + domain + pgvector ผ่าน
- [ ] `cloudflared` ติดตั้ง + รู้ว่ามีโดเมนไหม
- [ ] สร้างและเก็บ `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DEV_LOGIN_TOKEN`, VAPID, `META_VERIFY_TOKEN`, รหัส seed ใน `..\nless.secrets.env` ของ C (ชื่อคีย์เท่านั้นที่โพสต์ได้)
- [ ] LINE: สร้าง channel *NLess Demo* และ *NLess Dev* แล้ว · QR พิมพ์แล้ว · ปิด auto-reply/greeting ของ NLess Demo
- [ ] WSL: `postgresql-client-17` ติดตั้ง และ `~/.nless-prod.env` ตั้งโครงไว้ (ค่าจริงใส่วันงานหลังมี DB)
- [ ] UptimeRobot/cron-job.org สมัครไว้ พร้อมอีเมลแจ้งเตือน
