# ตั้ง GitHub บอร์ด และ Codex สำหรับทีมสามคน

> **อัปเดต 21 พ.ย. 2569:** คำสั่งสร้าง private repo และ branch `demo` ด้านล่างเป็นตัวอย่างเก่าสำหรับซ้อม · วันแข่งใช้ [START.md Day](../../START.md#day-instructions-for-codex) เพื่อสร้าง repo ใหม่แบบ public หลัง C ให้สัญญาณและใช้ `main` รวมงาน
>
> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** การแบ่งงานในเอกสารนี้ถูกแทนที่ด้วย [PLAN.md](../../PLAN.md) (แบ่งตามฟีเจอร์ 3 คน × 3 lanes, ใช้โค้ด Papi เดิมเป็น reference, บอร์ด agent ผ่าน Codex hooks) ถ้าเนื้อหาขัดกับ PLAN.md ให้ยึด PLAN.md

คู่มือนี้ใช้กับ repository แข่งขันที่สร้างใหม่ แยกจาก Papi บน Azure โดยสิ้นเชิง เป้าหมายคือให้ A ทำหน้าเว็บ B ทำความสามารถของระบบ และ C ทำโครงกลาง/ฐานข้อมูล/รวมงาน แล้วส่งงานกันได้ตลอดช่วงแข่งขัน 21 พฤศจิกายน 2569 เวลา 10:00–17:00 น. ประเทศไทย คำสั่งในเอกสารเป็นขั้นตอนสำหรับทีมไปทำ ไม่ได้หมายความว่ามีการสร้าง repository เชิญสมาชิก หรือเผยแพร่ระบบให้แล้ว

อ่านคู่กับ 02-architecture-contracts.md และ 05-prompts.md ก่อนเริ่มแข่งขัน แผนนี้ใช้โครง modular Node API กับ React ใน repository เดียว ไม่ต้องเผยแพร่ npm packages และไม่ต้องสร้าง Lambda ตามจำนวนคน

**สถานะตอนรีวิว:** repository ปัจจุบันใช้เก็บแผนก่อนแข่งขัน คำสั่งสร้าง repo/branch/issue ด้านล่างเป็นขั้นตอนสำหรับ repository implementation ในช่วงที่ผู้จัดอนุญาต ไม่ต้องสร้างซ้ำเพื่ออ่านหรือรีวิวเอกสารนี้ หากทีมตัดสินใจใช้ repo ปัจจุบันต่อ ต้องบันทึก planning baseline และเลือก branch ปลายทางร่วมกันก่อนเริ่มเขียนแอป

## 1. สิ่งที่แต่ละเครื่องต้องมี

| สิ่งที่เตรียม | A | B | C | ตรวจอย่างไร |
|---|---|---|---|---|
| Git และ GitHub CLI | ต้องมี | ต้องมี | ต้องมี | คำสั่งด้านล่าง |
| GitHub ของตัวเอง | ต้องมี | ต้องมี | ต้องมีสิทธิ์เจ้าของ repo | ชื่อจาก gh api user ต้องตรงคน |
| Codex ที่ใช้สิทธิ์ ChatGPT ของตนเอง | ต้องมี | ต้องมี | ต้องมี | เปิดงานในโฟลเดอร์ใหม่และดูชื่อบัญชี/usage |
| Node.js 24 รุ่นย่อยเดียวกัน | ต้องมี | ต้องมี | ต้องมี | node --version เทียบกัน |
| npm รุ่นเดียวกัน | ต้องมี | ต้องมี | ต้องมี | npm --version เทียบกัน |
| Docker Desktop/Compose | สำหรับทดสอบทั้งระบบ | สำหรับทดสอบกับ DB | จำเป็นสำหรับฐานข้อมูลหลัก | docker compose version |
| Browser | ต้องมี | ต้องมี | ต้องมี | เปิด localhost ได้ |
| OpenAI API key ส่วนตัว | ใส่เฉพาะถ้ารัน backend | เช่นเดียวกัน | ต้องมีสำหรับ demo | ทดสอบเล็กหนึ่งครั้งในวันงาน |
| อุปกรณ์/บัญชี LINE หรือ provider sandbox ที่ทีมมีอยู่ | ตามงาน | ตามงาน | ดูแลค่าเชื่อมต่อ | ต้องยืนยัน readiness ก่อนนับเป็น live |

ใน PowerShell:

~~~powershell
git --version
gh --version
node --version
npm --version
docker compose version
gh auth status
gh api user --jq .login
~~~

เครื่องที่ใช้จัดทำแผนตรวจพบ Node.js 24.18.0, npm 11.16, GitHub CLI 2.72.0 และ PowerShell 7.6.9 แต่ไม่พบคำสั่ง docker หรือ psql บน PATH ขณะตรวจ จึงยังไม่ถือว่า Postgres ผ่าน Docker พร้อมใช้งาน การไม่พบคำสั่งไม่ใช่หลักฐานว่าโปรแกรมไม่ได้ติดตั้ง ให้ C ตรวจ/แก้ความพร้อมก่อนวันงานตาม preflight ของชุดนี้ ถ้า A/B ยังไม่มี Docker สามารถเริ่ม component/domain tests กับ fixture ได้ แต่ C ต้องมีฐานข้อมูลจริงสำหรับ integrated demo

หากยังไม่ login ให้แต่ละคนทำบนเครื่องตนเอง:

~~~powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh api user --jq .login
~~~

ห้ามใช้ token หรือบัญชี GitHub ของคนเดียวร่วมกันสามเครื่อง การแยกบัญชีช่วยให้ตรวจผู้เขียนและการส่งต่องานได้ อย่าใช้ gh auth token เป็นวิธีตรวจเพราะจะแสดง credential บนหน้าจอ [วิธี login ของ GitHub CLI](https://cli.github.com/manual/gh_auth_login)

แพ็กเกจ ChatGPT มูลค่า US$100 ของแต่ละคนกับ API credit US$100 ของแต่ละคนเป็นคนละสิทธิ์ ตรวจชื่อแพ็กเกจและการเข้า Codex จริงก่อนวันงาน ไม่ใส่ ChatGPT session token ลงแอป Nless และไม่ฝัง API key ใน frontend

## 2. เตรียมก่อนงานกับสร้างในงาน

| ก่อนเริ่มแข่งขัน | หลังผู้จัดให้เริ่ม 10:00 น. |
|---|---|
| อ่านแผน แบ่งบทบาท ลงเครื่องมือ ฝึก Git บน repo ซ้อมที่ไม่ใช่งานส่ง | สร้าง implementation ใหม่ |
| เตรียม Markdown ของปัญหา สัญญาข้อมูล และ acceptance cases | สร้าง app scaffold, schema, migrations, routes และ UI |
| เตรียมข้อมูลสังเคราะห์และบัญชีทดสอบตามกติกาผู้จัด | ลง dependencies ของแอปและสร้าง lockfile |
| ตรวจ credentials และ sandbox ที่มีอยู่ | เชื่อม provider ที่พร้อมจริง |
| เตรียมบอร์ด/เครื่องมือประสานงานทั่วไป หากกติกาผู้จัดอนุญาต | เก็บ baseline, commits, tests และหลักฐานผลงาน |

ถ้าผู้จัดกำหนดเคร่งกว่านี้ ให้เก็บเอกสาร/เครื่องมือทั่วไปไว้ข้างนอก repository งานส่ง แล้วสร้าง baseline ตอนเริ่มแข่งขัน อย่าคัดลอก source, database dump, assets หรือ implementation ของ Papi มาใส่ repository ใหม่ อย่าให้ Codexเปิด repo Papi เป็นแหล่งคัดโค้ดระหว่างสร้างของใหม่

กติกาหน้าผู้จัดอนุญาตให้มีไอเดียและต่อยอด personal/open-source project แต่ตัดสินเฉพาะงานใหม่ระหว่างงาน ทีมนี้เลือกอ้างว่าเริ่มจากศูนย์ จึงต้องรักษาหลักฐานว่า implementation ของแอปเกิดหลังเริ่มงาน [FAQ ผู้จัด](https://luma.com/39zve8ph)

## 3. หัวหน้าทีม C สร้าง private repo ใหม่

ทำส่วนนี้บนเครื่อง C ครั้งเดียว ใช้โฟลเดอร์ใหม่ที่อยู่นอก checkout ผลิตภัณฑ์เดิม และแทน REPLACE_OWNER ด้วย GitHub login หรือองค์กรที่ทีมมีสิทธิ์สร้าง repository

~~~powershell
$hackWorkspace = Join-Path $env:USERPROFILE 'Desktop\NlessHackathon2026'
$hackRepo = 'REPLACE_OWNER/nless-hackathon-2026'
if ($hackRepo.StartsWith('REPLACE_')) { throw 'ใส่ owner/repo จริงก่อน' }
if (Test-Path -LiteralPath $hackWorkspace) { throw 'โฟลเดอร์นี้มีอยู่แล้ว ตรวจเนื้อหาและ remote ก่อน ห้ามทับ' }
New-Item -ItemType Directory -Path $hackWorkspace | Out-Null
Set-Location -LiteralPath $hackWorkspace
git init -b main
if ($LASTEXITCODE -ne 0) { throw 'git init ไม่สำเร็จ' }
~~~

สร้าง README.md และเอกสารเริ่มต้นจากชุดแผนที่ตกลงกันแล้วเท่านั้น ในวันเริ่มงาน C ต้องสร้าง .gitignore ก่อนเริ่มให้ AI เขียนไฟล์อื่น:

~~~gitignore
node_modules/
dist/
.env
.env.*
!.env.example
.board/
.team-board/
.local/
coverage/
playwright-report/
test-results/
*.log
data/
*.sql.dump
*.zip
~~~

ใช้ไฟล์ .env.example ที่มีเฉพาะชื่อค่าและค่าตัวอย่างสังเคราะห์ ไม่ใส่ credential จริง .gitignore ไม่ป้องกันไฟล์ที่เคย commit แล้ว จึงต้องตรวจ staged diff ทุกครั้ง

ใส่ .gitattributes แบบนี้เพื่อลด diff จาก Windows line endings:

~~~gitattributes
* text=auto
*.md text eol=lf
*.json text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.mjs text eol=lf
*.sh text eol=lf
*.ps1 text eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
~~~

ตั้ง Git identity ของผู้เขียนใน repo ใหม่นี้ให้เป็นของ C ใช้อีเมลจริงหรือ GitHub noreply ของตนเอง ไม่ใช้ชื่อเพื่อนแทนตน จากนั้นสร้าง baseline โดยเลือกเฉพาะไฟล์เอกสาร/กติกา:

~~~powershell
git config user.name 'REPLACE_YOUR_NAME'
git config user.email 'REPLACE_YOUR_EMAIL'
git add -- README.md AGENTS.md docs .gitignore .gitattributes
git diff --cached --stat
git diff --cached --check
git diff --cached
~~~

ตรวจว่าไม่มี implementation, credentials, customer data หรือไฟล์จาก Papi จึงทำ:

~~~powershell
git commit -m "docs: record competition plan before implementation"
if ($LASTEXITCODE -ne 0) { throw 'commit ไม่สำเร็จ ห้ามทำขั้นต่อไป' }
git tag baseline-before-coding
gh repo create $hackRepo --private --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'ตรวจผลสร้าง repo ก่อน retry ห้ามสร้าง repo ซ้ำ' }
git push origin baseline-before-coding
git remote -v
gh repo view $hackRepo --json nameWithOwner,isPrivate,url
git ls-files
git rev-parse HEAD
~~~

เก็บรายการไฟล์และ SHA ของ baseline ในหลักฐานวันงาน หาก repo ถูกสร้างก่อนเริ่มงาน ต้องรายงานเวลาจริง ไม่เปลี่ยน timestamp ให้ดูเหมือนสร้างในวันงาน คำสั่งสร้าง repo ใช้ --private ชัดเจน ไม่มีเหตุผลต้องอัปโหลด Papi ไปเป็น public เพื่อใช้บอร์ด [gh repo create](https://cli.github.com/manual/gh_repo_create)

เปิดหน้า repository:

~~~powershell
gh repo view $hackRepo --web
~~~

ใน Settings → Collaborators/Manage access เชิญ GitHub login ของ A และ B แล้วให้ทั้งสองคนรับเชิญ ทดสอบว่าทั้งคู่เปิด private repo ได้จริง ไม่ถือว่าการกดเชิญสำเร็จเท่ากับเพื่อนเข้าถึงได้แล้ว หากแพ็กเกจ GitHub รองรับ branch protection ให้ใช้กับ demo โดยคง review/check policies ตามที่ตั้งไว้ หากตั้งไม่ได้ ให้ใช้กติกาว่า C เป็นผู้รวมงานและไม่มีใคร push เข้า demo ตรง ห้ามใช้สิทธิ์ admin เพื่อข้าม check

สร้าง integration branch:

~~~powershell
git switch -c demo
git push -u origin demo
~~~

ตั้ง default branch เป็น demo ใน Settings ของ repository ใหม่ เพื่อให้หน้า repo แสดงเวอร์ชันที่รวมแล้ว main คงไว้เป็น baseline เริ่มต้น ไม่จำเป็นต้อง merge ไปกลับระหว่าง main กับ demo ระหว่างแข่ง

## 4. A และ B clone ของใหม่บนเครื่องตนเอง

แต่ละคนตั้งค่าตัวแปรใน PowerShell ของตัวเอง ตัวแปรใน terminal เครื่อง C จะไม่ตามมาที่เครื่องเพื่อน:

~~~powershell
$hackRepo = 'REPLACE_OWNER/nless-hackathon-2026'
$hackWorkspace = Join-Path $env:USERPROFILE 'Desktop\NlessHackathon2026'
if ($hackRepo.StartsWith('REPLACE_')) { throw 'ใส่ owner/repo จริงก่อน' }
if (Test-Path -LiteralPath $hackWorkspace) { throw 'ตรวจโฟลเดอร์เดิมก่อน ห้าม clone ทับ' }
gh repo clone $hackRepo $hackWorkspace
if ($LASTEXITCODE -ne 0) { throw 'clone ไม่สำเร็จ ตรวจการรับเชิญและบัญชี GitHub' }
Set-Location -LiteralPath $hackWorkspace
git fetch origin
git switch --track origin/demo
git remote -v
git status --short
~~~

ตรวจ remote ว่าตรง private competition repo ทุกเครื่อง ห้ามเป็น Azure/Papi จากนั้นเปิด Codex โดยเลือกโฟลเดอร์ใหม่นี้เป็น project ห้ามเปิดงานแข่งขันใน workspace Papi เดิม

ตอน C ส่ง bootstrap merge แล้ว ทุกคนใช้:

~~~powershell
git switch demo
git pull --ff-only origin demo
~~~

ถ้ามี uncommitted changes ให้ commit งานของตนก่อนเปลี่ยน branch ห้ามใช้ reset --hard, clean -fd หรือบังคับทับไฟล์เพื่อให้คำสั่งผ่าน

## 5. เจ้าของไฟล์และเส้นทางเชื่อมกัน

| เจ้าของ | แก้ได้ | ต้องส่งคำขอให้คนอื่น |
|---|---|---|
| A | web/src/**, tests ของ UI ที่อยู่ข้าง component, evidence/A/** | API, DTO, migrations, dependencies |
| B | server/src/domains/** รวม route registration ของแต่ละ domain, shared/features/**, unit tests ข้าง domain, evidence/B/** | platform auth/db/jobs/provider client/base schema |
| C | server/src/platform/**, server/src/index.ts, shared/base/**, migrations/**, tests/e2e/**, web/index.html, package*.json, tsconfig, Vite, Docker/Compose, scripts/ops, evidence/C/** | UI/domain logic ให้เจ้าของแก้หรือส่งมอบพื้นที่ก่อน |

B ลงทะเบียน domain ผ่านจุดเชื่อม registerDomains ที่ C กำหนดตั้งแต่ bootstrap จึงเพิ่มฟีเจอร์ใหม่ได้โดยไม่ให้ C เขียน route ทุกหน้า จุดนี้สำคัญต่อเป้าหมายทุกระบบ เพราะถ้าทั้งหมดรอ C เพิ่ม endpoint จะเกิดคอขวด

ระหว่าง bootstrap C สร้างเฉพาะ root toolchain/config, web/index.html, platform/base และ entry wiring ส่วน A สร้าง web/src/main.tsx กับ App.tsx และ B สร้าง server/src/domains/register.ts ที่ export registerDomains(app, services) ตามสัญญา C ห้ามรัน Vite/project generator ให้เขียนทับ web/src หรือ domains และห้ามสร้าง nested package/lockfile เพิ่ม A/B เริ่มไฟล์กับ fixtures จาก contract ที่ตรึงแล้วได้ระหว่างรอ platform services ของ C โดยยังไม่อ้างว่า integrated build ผ่าน

ใช้ URL กลางตาม architecture: domain APIs เริ่ม /api/v1, process liveness คือ /health/live, DB/schema readiness คือ /health/ready และข้อมูล source/artifact คือ /build-info ให้ทั้ง UI/tests/คู่มือเรียก path ชุดเดียวกัน

สัญญาที่ใช้ร่วมกันต้องระบุ version เจ้าของ และตัวอย่างข้อมูลชัดเจน shared/features ของ B เพิ่ม DTO ของฟีเจอร์ได้ แต่ห้ามเปลี่ยน envelope, auth context หรือ error model ใน shared/base เอง A อ่านและใช้ schema ได้แต่ไม่เปลี่ยนชื่อ field ฝั่งเดียว

ฐานข้อมูลจริงเป็นของ C ดูแล ผ่าน platform repository interface ที่ B เรียกใช้ ห้ามให้ B สร้าง connection pool หรือ migration ลับเพิ่มใน domain ห้ามให้ A ต่อ database จาก browser ทุก request ใช้ tenant ของ session ที่ server ตรวจแล้ว ไม่เชื่อ businessId ที่ browser ส่งมาเพียงอย่างเดียว

ตั้งชื่อ environment ให้ใช้ตรงกันทั้งชุด: DATABASE_URL เป็น URL ที่ host Node/npm ใช้ ส่วน DATABASE_URL_CONTAINER เป็น URL ที่ app container ใช้ Compose ต้อง override DATABASE_URL ของ app service ด้วยค่าจาก DATABASE_URL_CONTAINER อย่างชัดเจน ตัวอย่าง host URL ใช้ localhost กับ published port ส่วน container URL ใช้ service db กับ port ภายใน ไม่ใช้ localhost ใน app container เพื่อชี้กลับไปยัง DB container

C ต้องสร้าง config loader/schema ร่วมสำหรับ dev/start/migrate/seed/E2E/eval โดย process environment ที่ inject แล้วมีลำดับสูงกว่า .env.local การใช้ docker compose --env-file ไม่ได้ส่งค่าเข้า host npm commands ให้อัตโนมัติ คำสั่งของ host ต้องโหลดไฟล์นั้นผ่าน loader ของตนเอง ห้าม print URL/key เต็ม และห้ามมี fallback ไป Papi database

loader ตรวจเฉพาะค่าที่จำเป็นตาม scope: offline unit tests ใช้ test config โดยไม่ต้องมี API key และไม่เรียก network ส่วนคำสั่งแตะฐานข้อมูลต้องปฏิเสธ target นอก allowlist ของทีมและชื่อ DB ที่ไม่ขึ้นต้น nless_hack_ ก่อนเปลี่ยนข้อมูล localhost/127.0.0.1 และชื่อ service db ใช้ได้ในโหมดที่ตรงกัน; sandbox host อื่นต้องถูกระบุไว้ล่วงหน้าอย่างชัดเจน ห้ามลบ guard เพื่อให้คำสั่งผ่าน

ทั้งสามเครื่องรัน localhost port เดียวกันได้เพราะเป็นคนละเครื่อง แต่หากเปิดหลาย worktree บนเครื่องเดียว ต้องแยก port และ dev database/schema การแยก worktree ไม่ได้แยกฐานข้อมูลหรือ provider account ให้อัตโนมัติ [Git worktree](https://git-scm.com/docs/git-worktree)

## 6. ใช้บอร์ดกลางแบบเบาโดยไม่ผูกกับสคริปต์ภายนอก

แผนหลักใช้ GitHub issue เดียวกับ gh CLI ก่อน เครื่องมือประสานงานที่แนบในชุดนี้เป็นตัวช่วยอ่าน/โพสต์ ไม่ใช่ตัวรัน agent อัตโนมัติ ถ้าตัวช่วยใช้ไม่ได้ ใช้คำสั่ง gh ด้านล่างและทำงานต่อได้ทันที

C สร้าง docs/board-body.md ใน repo ใหม่ มีเนื้อหาต่อไปนี้:

~~~markdown
# Team Message Board

วันที่แข่งขัน 21 November 2026 เวลา 10:00–17:00 Asia/Bangkok

Team lead/integrator: @C_LOGIN
A web: @A_LOGIN
B domains: @B_LOGIN
C platform/integration: @C_LOGIN

สถานะงาน: READY → DOING → REVIEW → MERGED → VERIFIED
อุปสรรค: BLOCKED ระบุสิ่งที่ต้องการและเจ้าของที่แก้ได้

ทุกข้อความใช้ task ID, contract version, branch/commit และผู้รับ
ใช้ comment ใหม่เมื่อแก้ข้อมูลสำคัญ อย่าแก้ comment เก่าจนคนอ่านไม่เห็นการเปลี่ยน
โพสต์เมื่อรับงาน ส่งงาน มี blocker หรือ contract เปลี่ยน
ห้ามโพสต์ key, token, .env หรือข้อมูลลูกค้า
มีเพียง C ที่เปลี่ยนการมอบหมายข้ามเจ้าของและรวมเข้า demo
~~~

~~~powershell
$boardUrl = gh issue create --repo $hackRepo --title 'Team Message Board' --body-file docs/board-body.md
if ($LASTEXITCODE -ne 0) { throw 'ตรวจว่า issue ถูกสร้างหรือไม่ก่อน retry' }
$boardUrl
~~~

เปิด URL ที่ได้แล้วปักหมุด issue ผ่าน UI บันทึกหมายเลขจริงไว้ใน docs/TEAM.md ทุกคนใช้เลขเดียวกัน ห้ามสมมติว่าเป็น #1 [gh issue create](https://cli.github.com/manual/gh_issue_create)

บนทุกเครื่อง:

~~~powershell
$hackRepo = 'REPLACE_OWNER/nless-hackathon-2026'
$boardIssue = 1
gh issue view $boardIssue --repo $hackRepo --comments
~~~

แทนค่า 1 ด้วยหมายเลขที่เพิ่งตรวจจริง การอ่านแบบนี้ไม่ตั้ง unread cursor ทุกครั้งจะเห็นข้อความที่ GitHub CLI แสดง ให้ดู task ID/เวลาและใช้ตัวช่วยที่แนบเมื่ออยากอ่านเฉพาะข้อความใหม่

โพสต์ข้อความด้วยไฟล์เพื่อรักษา newline และไม่ให้ shell แปลข้อความ:

~~~powershell
$boardPostPath = Join-Path $env:TEMP 'nless-A-task-status.md'
@'
[A's Codex] TASK A-01 REVIEW
contract: chat.v1
branch: codex/a-chat
commit: REPLACE_SHA
changed: web/src/features/chat/**
tests: REPLACE_ACTUAL_COMMAND_AND_RESULT
@C_LOGIN ขอรวมหลังตรวจ diff
@B_LOGIN UI ใช้ reply/proposal ตาม contract v1
'@ | Set-Content -LiteralPath $boardPostPath -Encoding utf8
gh issue comment $boardIssue --repo $hackRepo --body-file $boardPostPath
~~~

ข้อความนี้ส่งจริงเมื่อรันคำสั่ง จึงต้องตรวจชื่อผู้รับและลบ placeholder ก่อน ส่งเฉพาะงานสำคัญ ไม่รายงานทุก tool call ถ้าคำสั่งส่ง timeout ให้เปิดบอร์ดดูผลก่อนส่งใหม่ เพื่อไม่ให้มีข้อความซ้ำ [gh issue comment](https://cli.github.com/manual/gh_issue_comment)

จังหวะที่ Codex ต้องอ่านบอร์ด: เริ่มงาน ก่อนแก้ contract ก่อน commit หลังรับ merge และเมื่อกำลังรอ dependency การอ่านบอร์ดต้องเป็นส่วนหนึ่งของ prompt ไม่ใช่คาดหวังว่าเปิด issue แล้ว Codex ทุกเครื่องจะเห็นเอง

## 7. ตัวช่วย PowerShell ที่แนบมากับชุดนี้

ไฟล์ tools/team-board.ps1 ในชุดแผนนี้เป็นตัวช่วยที่เขียนแยกสำหรับงานประสานงานทั่วไป ไม่มีโค้ดแอป Nless สามารถใช้งานจากตำแหน่งชุดแผนเดิมได้ หรือให้ C คัดลอกเฉพาะเครื่องมือนี้ไป tools ของ repo ใหม่เมื่อกติกาผู้จัดอนุญาต ห้ามคัดลอกทั้ง output ของ Papi ไปด้วย

ตัวอย่างต่อไปนี้สมมติว่าไฟล์อยู่ใน tools ของ repo ใหม่และ $hackRepo/$boardIssue เป็นค่าจริง:

~~~powershell
.\tools\team-board.ps1 -Mode Check -Repo $hackRepo -Issue $boardIssue -AgentId A
.\tools\team-board.ps1 -Mode Read -Repo $hackRepo -Issue $boardIssue -AgentId A
~~~

ตอนส่งงาน ใช้ไฟล์ข้อความที่ตรวจแล้วและ PostId ที่ไม่ซ้ำสำหรับการส่งมอบรอบนั้น:

~~~powershell
.\tools\team-board.ps1 -Mode Post -Repo $hackRepo -Issue $boardIssue -AgentId A -MessageFile $boardPostPath -PostId 'A-01-review-v1'
~~~

ถ้าผลส่งไม่ชัดเจน ให้ใช้ PostId เดิมตรวจ/ส่งซ้ำเพื่อให้ตัวช่วยหาข้อความเดิมก่อน หากเนื้อหาเปลี่ยน ต้องใช้ ID ใหม่ เช่น A-01-review-v2 ไม่แก้ comment เก่าหรือใช้ ID เก่ากับข้อมูลคนละชุด

เปิด watcher ใน terminal สำหรับมนุษย์อีกหน้าต่างได้:

~~~powershell
.\tools\team-board.ps1 -Mode Watch -Repo $hackRepo -Issue $boardIssue -AgentId A-watch -PollSeconds 30 -DurationSeconds 1800
~~~

watcher แสดงข้อความเท่านั้น ไม่เรียก Codex ไม่รันคำสั่งใน comment และไม่เข้าควบคุมเครื่องเพื่อน ใช้ AgentId ของ watcher แยกจาก A เพื่อให้การดูข้อความของมนุษย์ไม่กิน unread cursor ของ session A ตัว Codex อ่านด้วย -Mode Read ใน session งานเมื่อถึง checkpoint ไม่ต้องบล็อก tool call ของ Codex รอ watcher 30 นาที

ตัวช่วยเก็บ state แยกตาม checkout/repo/issue/GitHub login/AgentId ใน .team-board และใช้ lock กับการเขียน state แบบ atomic แต่ไม่ได้ล็อก source files หรือเป็นระบบ claim task ร่วมกัน บอร์ดกับ owner table ยังคงเป็นคนละชั้นกัน

การทดสอบตัวช่วยในชุดแผนเป็น offline ด้วย gh จำลอง การเข้าถึง private repo และการส่งข้อความจริงต้องซ้อมตามขั้นตอนข้อ 11 ด้วยบัญชีของทั้งสามคนก่อนงาน

## 8. Agent Board จาก Notion ทำอะไรได้จริง

ตรวจ source ของ azizu06/hackathon-agent-board ที่ commit 91a9f0120c05c0efaf7b0e52bc96c28de8b4486c วันที่ 17 พฤศจิกายน 2569 พบว่าเป็น Bash script ครอบ gh มีคำสั่ง post/read/unread/wait และใช้ GitHub issue เป็นข้อความกลาง:

- แต่ละคนต้องใช้ GitHub login ต่างกัน เพราะ unread กรองข้อความของผู้ใช้ตนเอง
- cursor อยู่ใน checkout และไม่แยก agent จึงไม่ใช้หลาย agent แชร์ state เดียวกัน
- wait ตื่นเมื่อพบข้อความใหม่ของคนอื่น ไม่ได้ตื่นเฉพาะเมื่อถูกแท็ก
- ไม่มี file lock หรือ task claim ที่บังคับ filesystem และไม่ปลุก Codex ที่จบ session แล้ว
- hooks ที่แถมมากับ repo นั้นเป็นของ coding agent ตัวอื่น ไม่ใช่การตั้ง Codex ให้อัตโนมัติ

การตรวจครั้งนี้ไม่พบ LICENSE ที่ root และ metadata license เป็น null จึงไม่ vendor source นั้นเข้าชุดนี้ แผนหลักใช้คำสั่ง GitHub CLI และตัวช่วยที่เขียนใหม่แยกต่างหาก หากทีมต้องการใช้ script ต้นฉบับ ให้ตรวจสิทธิ์ใช้งานกับเจ้าของและซ้อม Git Bash/WSL ก่อน [source ของบอร์ด](https://github.com/azizu06/hackathon-agent-board/blob/main/tools/board), [GitHub เรื่อง license](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)

หากตรวจสิทธิ์และจัดเตรียม script ต้นฉบับไว้แล้ว คำสั่งนี้รันใน Git Bash ไม่ใช่ PowerShell:

~~~bash
export BOARD_REPO='REPLACE_OWNER/nless-hackathon-2026'
export BOARD_ISSUE='REPLACE_REAL_ISSUE_NUMBER'
bash tools/board whoami
bash tools/board unread
bash tools/board read -n 20
bash tools/board wait --interval 30 --timeout 60
~~~

PowerShell ใช้รูปแบบตัวแปร $env:BOARD_REPO ส่วน Git Bash ใช้ export ตามตัวอย่าง อย่าผสมไวยากรณ์ข้าม shell คำสั่ง Git Bash ข้างต้นเป็นทางเลือก ไม่ใช่ prerequisite ของการทำงานร่วมกัน

## 9. หนึ่ง task หนึ่ง branch และ PR

เริ่ม task บน checkout ที่ไม่มีงานค้าง สร้าง branch ใหม่จาก demo ที่รับการเปลี่ยนแปลงล่าสุดแล้ว ตัวอย่าง A:

~~~powershell
git status --short
git fetch origin
git switch demo
git pull --ff-only origin demo
git switch -c codex/a-chat
~~~

B ใช้ชื่อ codex/b-knowledge และ C ใช้ codex/c-bootstrap หรือชื่อที่ตรง task จริง อย่าใช้ branch เดียวกันข้ามสามเครื่อง

ระหว่างทำงานให้ตรวจ scope:

~~~powershell
git diff --name-only
git diff --check
~~~

ถ้า A เห็นไฟล์ package-lock.json เปลี่ยนจากการลองติดตั้ง package ให้หยุดส่งไฟล์นั้นและแจ้ง C ไม่แก้ lockfile คนละชุด A ไม่ควรใช้ git add . เพราะอาจส่งไฟล์ที่ไม่ได้เป็นเจ้าของหรือไฟล์ลับ

เมื่อพร้อมส่ง A ใช้:

~~~powershell
git add -- web/src
git diff --cached --name-only
git diff --cached --check
git diff --cached
~~~

รัน validation ของ task ตาม script ที่ C สร้างและยืนยันแล้ว จากนั้น:

~~~powershell
git commit -m "feat: add chat interface for A-01"
if ($LASTEXITCODE -ne 0) { throw 'commit ไม่สำเร็จ' }
git push -u origin codex/a-chat
if ($LASTEXITCODE -ne 0) { throw 'push ไม่สำเร็จ ตรวจ remote และสิทธิ์ก่อนสร้าง PR' }
~~~

เขียน .local/pr-A-01.md ซึ่งถูก ignore ไว้:

~~~markdown
Task: A-01
Behavior: ผู้ใช้ส่งข้อความและเห็นข้อเสนอซื้อจาก API v1
Contract: chat.v1 ไม่มีการเปลี่ยน shared/base
Validation: ใส่คำสั่งและผลที่รันจริง
Modes: ระบุ mock / sandbox / live ตามที่ใช้จริง
Known limits: ระบุสิ่งที่ยังไม่ผ่าน
Evidence: commit SHA และไฟล์ภาพที่ไม่มีข้อมูลลับ
~~~

~~~powershell
gh pr create --repo $hackRepo --base demo --head codex/a-chat --title 'A-01 Add chat interface' --body-file .local/pr-A-01.md
~~~

ไม่ใส่ Closes #หมายเลขบอร์ด เพราะจะทำให้ปิดบอร์ดเมื่อ merge หากมี issue ของ task แยกต่างหาก ให้ลิงก์ issue ของ task นั้นแทน [gh pr create](https://cli.github.com/manual/gh_pr_create)

เมื่อ PR ยังไม่รวมแต่ต้องรับโค้ดล่าสุด ให้ commit งานของตนก่อน แล้ว merge เข้า feature branch:

~~~powershell
git fetch origin
git merge origin/demo
~~~

หากมี conflict อย่าเลือก ours/theirs ทั้งก้อน ให้ดูชื่อไฟล์ แจ้งเจ้าของและ C แล้วแก้เฉพาะความหมายที่ตกลงกัน การ rebase/force push ไม่ใช่ทางหลักของทีมนี้

## 10. C ตรวจและรวมงานอย่างไร

C รวมครั้งละหนึ่ง PR ทุกประมาณ 30–45 นาที และส่ง SHA ใหม่บนบอร์ด A/B ไม่ต้องหยุดเขียนโค้ดระหว่าง C ตรวจ

~~~powershell
$prNumber = 1
gh pr view $prNumber --repo $hackRepo --json number,title,baseRefName,headRefName,headRefOid,state,url
gh pr diff $prNumber --repo $hackRepo
gh pr checks $prNumber --repo $hackRepo
~~~

หมายเลข PR เป็นค่าตัวอย่าง ต้องแทนของจริง ตรวจ state ว่า OPEN และ base เป็น demo ก่อนทำ tentative merge ถ้า PR รวมแล้วให้รายงาน merge commit จริง ไม่เริ่ม merge ซ้ำ ถ้ายังไม่มี CI ให้บันทึกว่าไม่มี check ที่ตั้งไว้ แล้วใช้ผล local integrated validation แทน ไม่รายงานว่า CI ผ่าน

ก่อน merge C ตรวจว่า PR base เป็น demo อ่าน dependency/build scripts แล้วจึงทดสอบผลรวมใน checkout ที่ไม่มีงานค้าง โดยไม่แก้ branch ของผู้เขียน:

~~~powershell
$reviewDirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $reviewDirty.Count -gt 0) { throw 'Review checkout must be clean; preserve existing work first' }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
$reviewedHead = gh pr view $prNumber --repo $hackRepo --json headRefOid --jq .headRefOid
if ($LASTEXITCODE -ne 0 -or $reviewedHead -notmatch '^[a-f0-9]{40}$') { throw 'Cannot establish reviewed PR head' }
$reviewedBase = git rev-parse origin/demo
if ($LASTEXITCODE -ne 0) { throw 'Cannot establish demo base' }
git switch --detach origin/demo
if ($LASTEXITCODE -ne 0) { throw 'Cannot enter clean review checkout' }
git merge --no-ff --no-commit $reviewedHead
if ($LASTEXITCODE -ne 0) {
    git merge --abort
    throw 'Tentative integration conflicted; ask the owner to resolve before continuing'
}
~~~

หาก git status ก่อนเริ่มไม่ว่าง ให้เก็บงานของ C ก่อน ไม่เริ่ม review ทับงานค้าง หาก merge มี conflict ให้ C บันทึกไฟล์ที่ชน ใช้ git merge --abort แล้วให้เจ้าของแก้ก่อน ไม่ทดสอบทั้งที่มี conflict ค้าง เมื่อ merge สำเร็จ ยังไม่ commit การ merge ชั่วคราวนี้ ให้รัน validation ด้านล่างกับผลรวม

คำสั่งตรวจที่ C ต้องสร้างให้มีตั้งแต่ bootstrap:

~~~powershell
foreach ($gateScript in @('typecheck', 'test', 'build', 'test:e2e')) {
    if ($gateScript -eq 'test') { npm test } else { npm run $gateScript }
    if ($LASTEXITCODE -ne 0) { throw "Gate failed: $gateScript. Do not merge; investigate and preserve the failure evidence" }
}
~~~

คำสั่งเหล่านี้เป็นสัญญาของโครงใหม่ ไม่ใช่คำยืนยันว่ามีอยู่ใน Papi หรือชุดเอกสารนี้ C ต้องสร้าง dev, typecheck, test, test:unit, test:contract, check, build, start, worker, db:migrate, db:seed, test:e2e และ eval:live ให้ตรงตารางใน 06-day-of-runbook.md โดย npm test รวม offline unit+contract, check รวม typecheck+test และ eval:live เป็น opt-in paid test แยกจาก npm test ก่อน C สร้าง scripts อย่าใช้ผล command not found เป็นผลทดสอบ feature และอย่าสร้าง script ว่างที่ exit 0 เพื่อให้ดูว่าผ่าน

worker ใช้ platform jobs/outbox ตัวเดียวกัน ค่าเริ่มต้นให้ worker ทำงานใน app process ได้ ส่วน npm run worker เป็นทางเลือกแยก process ห้ามเปิดทั้งสองทางโดยไม่มี transaction/lease และ idempotency ที่พิสูจน์แล้ว เพราะจะทำให้ effect ซ้ำ

หลัง review/checks ผ่าน ยกเลิกเพียง tentative merge ที่เริ่มจาก checkout สะอาด แล้วกลับ demo:

~~~powershell
git merge --abort
git switch demo
git fetch origin
$currentBase = git rev-parse origin/demo
if ($currentBase -ne $reviewedBase) { throw 'demo เปลี่ยนระหว่าง review ต้องทดสอบผลรวมกับ base ใหม่' }
gh pr merge $prNumber --repo $hackRepo --merge --match-head-commit $reviewedHead
if ($LASTEXITCODE -ne 0) { throw 'PR ยังไม่ได้รวม อ่านเหตุผลและตรวจ head/checks ใหม่' }
gh pr view $prNumber --repo $hackRepo --json state,mergeCommit,mergedAt,url
~~~

ห้ามใช้ --admin หรือปลอม peer approval ถ้า C เป็นผู้เขียน ให้ A หรือ B อ่าน diff และตรวจงานก่อน C รวม คำสั่ง --match-head-commit ป้องกันการรวม head ที่เปลี่ยนไปหลังตรวจ แต่ไม่ได้แทนการตรวจคุณภาพหรือ branch policies [gh pr merge](https://cli.github.com/manual/gh_pr_merge)

C รับ demo ล่าสุดแล้วตรวจผลรวม:

~~~powershell
git switch demo
git pull --ff-only origin demo
git rev-parse HEAD
~~~

หลัง PR ของตนรวมแล้ว A/B เปิด task ใหม่จาก demo ใหม่ ไม่ใช้ task branch เก่าเป็น branch สะสมตลอดวัน โค้ดจึงมี checkpoint ที่ตรวจย้อนหลังง่าย

### Clean release worktree ของ C

ใช้เมื่อจะตรวจ artifact สุดท้าย โดย source commit ต้องรวมและ push อยู่บน demo แล้ว ขั้นตอนนี้สร้างพื้นที่ใหม่ ไม่ลบหรือทับ developer checkout:

~~~powershell
git status --short
git remote -v
git fetch origin
$candidateSha = git rev-parse origin/demo
if ($LASTEXITCODE -ne 0) { throw 'อ่าน candidate จาก origin/demo ไม่สำเร็จ' }
$releaseRoot = Join-Path $env:USERPROFILE ('Desktop\NlessHackRelease-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path -LiteralPath $releaseRoot) { throw 'release path มีอยู่แล้ว เลือก path ใหม่' }
git worktree add --detach $releaseRoot $candidateSha
if ($LASTEXITCODE -ne 0) { throw 'สร้าง release worktree ไม่สำเร็จ' }
Set-Location -LiteralPath $releaseRoot
git rev-parse HEAD
git status --short
npm ci
~~~

ก่อนรันต้องตรวจว่า current remote เป็น competition repo ไม่ใช่ Papi อ่าน SHA ที่ได้เทียบ candidate แล้วจึงไปต่อ ไฟล์ที่ Git ignore เช่น .env.local จะไม่ตามมาด้วย ให้ C เตรียมค่าทดสอบใน worktree ใหม่นี้ผ่าน editor ไม่คัดลอก secret อัตโนมัติและไม่พิมพ์ค่าลง log

เมื่อ app bootstrap สร้าง .env.example แล้ว จะสร้าง local file ครั้งแรกได้แบบไม่ทับของเดิม:

~~~powershell
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local' -ErrorAction Stop
}
~~~

ตรวจว่า DB target เป็น sandbox ที่อนุญาตและแยก test state ก่อน migrate/seed เรียก npm run typecheck, npm test และ npm run build แล้วเปิด built app ด้วย npm start เพื่อตรวจ E2E ของ candidate จริง หากเลือก Docker app แทน host npm start ให้หยุดทั้ง dev server และ built server ที่ยืนยันว่าเป็นของแอปแข่งก่อน เพราะทั้งคู่ใช้ port 3000 ได้ ห้ามเริ่มสองวิธีพร้อมกัน

ไม่ใช้ release worktree เป็นที่แก้ feature ถ้าพบ bug ให้เจ้าของแก้บน task branch → review/merge → สร้าง candidate ใหม่ แล้วตรวจส่วนที่กระทบจาก SHA ใหม่นั้น ไม่เปลี่ยนไฟล์ใน detached worktreeแล้วส่ง SHA เก่าที่ไม่มีการแก้

## 11. ซ้อมวงจรส่งงานให้ผ่านก่อนแข่ง

ใช้ repo ซ้อมแยกที่ไม่มี implementation งานส่ง และทำเพียงเอกสารสังเคราะห์:

1. C สร้าง repo/บอร์ดและเชิญเพื่อน
2. A โพสต์ข้อความรับงาน B และ C อ่านได้
3. B ตอบ A อ่านได้จากบัญชี A
4. A เพิ่มเอกสารหนึ่งไฟล์บน branch ของตนและเปิด PR
5. C อ่าน diff รวม PR แล้วส่ง SHA บนบอร์ด
6. B pull demo แล้วเห็นเอกสารที่ A เพิ่ม
7. ทุกคนอธิบายได้ว่า board, Git และ backend ทำหน้าที่ต่างกัน

ถ้าข้อใดไม่ผ่าน อย่าเพิ่ม MCP/agent framework ใหม่เพื่อซ่อนปัญหา แก้บัญชี สิทธิ์ remote หรือขั้นตอนให้ผ่านก่อน เป้าคือวงจรสั้นที่ทีมใช้จริงได้

## 12. Codex ต้องรันต่ออย่างไร

คนละเครื่องเปิด Codex หลักหนึ่ง session ใน clone ของตน ส่ง prompt บทบาทจาก 05-prompts.md พร้อมอนุญาตให้ทำ task ในพื้นที่ของตน โพสต์บอร์ด และ push feature branch ของตนตามขอบเขตนั้น

กำหนดใน prompt ว่าเมื่อเสร็จ task ให้ตรวจผล ส่งงาน อ่านบอร์ด และเลือกงาน READY ถัดไปของตนจนถึงจุดหยุดที่กำหนด ถ้า task ถูก BLOCKED ให้โพสต์แล้วไปทำงานอิสระที่ได้รับมอบหมายไว้ ไม่แก้พื้นที่เพื่อนเอง

Codex ของ A ไม่ได้ควบคุม Codex บนเครื่อง B เพียงเพราะแท็กบน GitHub หาก session จบแล้ว มนุษย์ต้องส่งข้อความเริ่มต่อใน session นั้น หรือใช้ workflow ที่ทีมทดสอบไว้ล่วงหน้า ตัวช่วย watch ที่เปิด terminal ไว้มีหน้าที่แจ้งข้อความเท่านั้น

ใช้ subagent สำหรับอ่าน ตรวจ tests หรือ review ที่แยกอิสระได้ก่อน หากจะให้เขียนโค้ด ต้องมี worktree/พื้นที่เจ้าของชัดเจน ไม่ spawn หลายตัวให้แก้ไฟล์เดียวกัน Subagents ใช้ tokens ของตนเพิ่มด้วย [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## 13. กรณีติดขัดระหว่างแข่ง

| เหตุการณ์ | ทำทันที |
|---|---|
| ไม่เห็นข้อความเพื่อน | ตรวจ repo/issue/login แล้วอ่านด้วย gh issue view ก่อน อย่ารีบติดตั้งตัวช่วยใหม่ |
| Codex หยุดหลังจบ task | ส่ง continuation prompt บทบาทเดิมพร้อม task/SHA ล่าสุด ไม่มีการปลุกอัตโนมัติที่รับประกันไว้ |
| GitHub เข้าไม่ได้ | เก็บ commits ในเครื่อง ให้มนุษย์คุยตรง บันทึก handoff แล้ว push เมื่อเชื่อมต่อได้ |
| Git push ถูกปฏิเสธ | ตรวจ remote/branch/fetch ไม่ force push |
| API contract ไม่ตรง | ยึด version ล่าสุดใน demo ส่ง request ให้เจ้าของแก้ ใช้ fixture ของ version นั้นชั่วคราว |
| Migration ชนกัน | C จัดลำดับและทดสอบบน DB ทดสอบ ห้ามใครลง DB demo เอง |
| DB ไม่พร้อม | ให้ A/B ทำ unit/component tests กับ fixture ต่อ C แก้ DB ห้ามประกาศว่าบันทึกจริงสำเร็จ |
| dependency จำเป็นเพิ่ม | โพสต์ชื่อ/เหตุผลให้ C เพิ่ม package กับ lockfile แล้วทุกคนรับ commit เดียวกัน |
| เผลอ commit secret | หยุด push หากยังไม่ส่ง ถ้าส่งไปแล้วให้เจ้าของ credential หมุนค่าและจัดการประวัติอย่างมีขั้นตอน ห้ามแค่ลบจากไฟล์แล้วถือว่าหาย |
| check ไม่ผ่านใกล้หมดเวลา | ส่งเวอร์ชันล่าสุดที่ผ่านพร้อมสถานะจริงของ feature ที่ยังไม่ผ่าน ห้ามทำ check ให้เป็นสีเขียวด้วยการปิด test |

## 14. รายการตรวจก่อนส่งงาน

- repo งานส่งถูกต้องและมีผู้จัดเข้าถึงได้ตามวิธีส่งจริง โดยไม่เปิด Papi เดิมเป็น public
- baseline-before-coding กับ final SHA มีอยู่ และอธิบายแหล่งที่มาของ dependencies/ข้อมูล/เครื่องมือได้
- ทุก PR ที่ใช้ในการ demo รวมจริงแล้ว ไม่อ้างงานที่ค้างบนเครื่องเพื่อน
- demo build มาจาก final SHA ที่ส่ง และหน้า About/evidence ระบุ SHA เดียวกัน
- secret อยู่ใน local environment หรือ sandbox ที่ถูกต้อง ไม่มีใน browser bundle/บอร์ด/ภาพหน้าจอ
- ระบุ feature เป็น live, sandbox, adapter-only หรือยังไม่เสร็จตามผลรันจริง
- เก็บผล typecheck/tests/build/E2E ที่ตรง final SHA ไม่มีคำว่า pass ที่เขียนแทนผลรัน
- มีวิธีเปิด local demo สำรองและบอกว่าใช้ข้อมูลสังเคราะห์

## แหล่งอ้างอิงที่ใช้ตรวจขั้นตอน

ตรวจวันที่ 17 พฤศจิกายน 2569: GitHub CLI ในเครื่องที่ใช้ตรวจคือ 2.72.0, Git 2.41.0.windows.1, Node.js 24.18.0 ส่วนเวอร์ชันเครื่องทีมต้องตรวจจริงอีกครั้ง คำสั่ง GitHub ที่มีผลภายนอกในเอกสารไม่ได้ถูกรันเพื่อทดสอบ

ตรวจ syntax ของ PowerShell blocks ทั้ง 28 ชุดด้วย parser แล้วไม่พบ parse error และทดลองวงจร Git baseline → branch → tentative integration → abort → กลับ demo บน repository สังเคราะห์ใน Temp สำเร็จ โดยไม่มี remote write ผลนี้พิสูจน์ขั้นตอน local Git เท่านั้น ไม่ใช่ผล build แอปใหม่หรือการเข้าถึง GitHub ของทีม

- [GitHub CLI สร้าง repo](https://cli.github.com/manual/gh_repo_create)
- [GitHub CLI สร้าง issue](https://cli.github.com/manual/gh_issue_create)
- [GitHub CLI comment](https://cli.github.com/manual/gh_issue_comment)
- [GitHub CLI สร้าง PR](https://cli.github.com/manual/gh_pr_create)
- [GitHub CLI merge PR](https://cli.github.com/manual/gh_pr_merge)
- [Git merge](https://git-scm.com/docs/git-merge)
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
