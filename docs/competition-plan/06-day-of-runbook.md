# คู่มือวันแข่งตั้งแต่เปิดเครื่องจนส่งผลงาน

> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** การแบ่งงานในเอกสารนี้ถูกแทนที่ด้วย [PLAN.md](../../PLAN.md) (แบ่งตามฟีเจอร์ 3 คน × 3 lanes, ใช้โค้ด Papi เดิมเป็น reference, บอร์ด agent ผ่าน Codex hooks) ถ้าเนื้อหาขัดกับ PLAN.md ให้ยึด PLAN.md

อ่าน [เริ่มที่นี่](README.md) ก่อนหนึ่งครั้ง คู่มือนี้ใช้กับ repository แข่งขันใหม่เท่านั้น ไม่ใช่คำสั่งให้เปลี่ยน checkout เดิมหรือบริการ production ปัจจุบัน ช่วงพัฒนาตามผู้จัดคือ 21 พฤศจิกายน 2569 เวลา 10:00–17:00 น. Asia/Bangkok

## 1. สิ่งที่ต้องหยิบเข้าห้อง

สามเครื่องพร้อมที่ชาร์จและ mouse, อินเทอร์เน็ตสำรอง, GitHub คนละบัญชีที่รับ collaborator invitation แล้ว, Codex ที่เข้าถึงได้ตามสิทธิ์ผู้จัด, API key ของบัญชีทดสอบที่ตรวจ balance/model access แล้ว, CSV/FAQ/สินค้า/นัดหมายสังเคราะห์, คู่มือนี้ offline และข้อมูลติดต่อผู้จัดจากอีเมลทีม

อย่าเพิ่งลงมือเขียนแอปก่อนผู้จัดอนุญาต การตั้งเครื่อง/เตรียม spec และเครื่องมือประสานงานมีได้ก่อน แต่ต้องเปิดเผยสิ่งที่มีมาก่อนและทำตามกติกา ไม่มี implementation Papi เก่าใน baseline ไม่มี fallback ไป backend Papi ระหว่างเคลมว่าเขียนใหม่

## 2. ตรวจเครื่องก่อนวันงาน

เปิด PowerShell จาก clone ของ repository แผนนี้ แล้วเรียกไฟล์จาก kit:

```powershell
$ReviewRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run from the planning repository clone.' }
$KitRoot = Join-Path $ReviewRoot 'docs\competition-plan'
& "$KitRoot\tools\preflight.ps1"
```

ตัวช่วยตรวจเฉพาะเวอร์ชันโปรแกรมบน PATH ไม่ login ไม่อ่าน environment ไม่ติดตั้ง ไม่เปิด server ผลตรวจของเครื่องผู้ใช้ระหว่างทำ kit พบ Git, Node 24, npm, gh และ pwsh; ไม่พบ `docker` และ `psql` บน PATH จึงต้องปิดเรื่องฐานข้อมูลก่อนวันแข่ง การไม่พบ command ไม่ใช่หลักฐานว่าไม่มีโปรแกรมติดตั้งในเครื่อง

เลือกอย่างใดอย่างหนึ่งก่อนงาน:

| โหมด | ต้องพร้อมก่อนเริ่ม | ในวันงาน |
|---|---|---|
| Docker Compose | Docker Desktop/engine รันได้, `docker compose version` ผ่าน, ดึง PostgreSQL image ที่เลือกแล้ว | C สร้าง compose.yaml ในงาน; เปิด DB ด้วย service `db` |
| Native PostgreSQL | PostgreSQL และ credentials สำหรับ database ทดสอบแยกของแต่ละคน/เครื่อง C, ต่อ query ได้ | ตั้ง DATABASE_URL ให้ DB ใหม่ `nless_hack_*`; C สร้าง schemaในงาน |
| Sandbox host ที่เตรียมอยู่แล้ว | SSH/TLS/DB/สิทธิ์เข้าถึงตรวจแล้ว; ไม่มีข้อมูลลูกค้า; ไม่มีการซื้อหรือสร้าง resource โดยอาศัยคู่มือนี้เป็นคำสั่งอัตโนมัติ | C ส่ง artifact ที่ทดสอบแล้วไป deploy ถ้าต้องการ public callback/demo |

ถ้าติดตั้ง Docker ต้องเตรียม virtualization/WSL และ reboot ให้เสร็จก่อนงาน ดู [Docker Desktop Windows](https://docs.docker.com/desktop/setup/install/windows-install/) อย่ารอเริ่มติดตั้งตอน 10:00 น. ถ้าเครื่อง A/B ไม่พร้อม DB ให้ทำ UI/domain unit tests จาก fixturesก่อน และใช้ DBเฉพาะ C เพื่อ integrated tests โดยไม่แก้ tenant/security guarantees

## 3. ตั้ง repo และบทบาท

ทำตาม [04 GitHub และบอร์ด](04-github-board-codex.md) ซึ่งมีคำสั่งสร้าง private repo, invite, baseline, demo branch และ PR ครบแล้ว หลัง setup ให้ทุกคนบันทึกข้อมูลจริงใน `docs/TEAM.md`:

```text
Competition repo: owner/nless-codex-hack-2026
Board issue: <เลขจริง>
A: <ชื่อ> / @<login> / web
B: <ชื่อ> / @<login> / domains + shared/features
C: <ชื่อ> / @<login> / platform + integration
Integration branch: demo
Baseline SHA: <commit ก่อนเริ่ม development>
App origin: http://localhost:3000 (release) / http://localhost:5173 (dev web)
API origin: http://localhost:3000
DB mode: <Docker/native/sandbox> / database nless_hack_<ชื่อ>
```

Repository URL ในเอกสารเป็นตัวอย่าง ต้องแทนด้วยของจริงก่อนใช้ `gh` ห้ามนำ `gh repo create --source .` ไปเรียกขณะอยู่ใน Papi เดิม ไม่ต้องทำ public source เพื่อใช้บอร์ด เปิดให้กรรมการตามข้อกำหนดการส่งงานและสิทธิ์ที่บริษัทอนุญาตเท่านั้น

## 4. ก่อน 10:00 น.

1. เช็กข้อกำหนดส่งงานจากอีเมลทีม: URL form/repo visibility/video/slides/pitch time ผู้จัดหน้า public ยังไม่ได้ระบุทุกรายละเอียด ถ้าอีเมลมีเงื่อนไขใหม่ให้ใช้ข้อมูลนั้นและบันทึก
2. เปิด project แข่งขันใหม่ใน Codex คนละเครื่อง อย่าเปิด parent folder ที่รวม Papi production
3. เปิด terminal ของแต่ละคนใน root ที่ถูกต้อง ตรวจ `Get-Location`, `git remote -v`, `git status -sb` และ `git branch --show-current`
4. มีเฉพาะ spec/templates/tooling ที่ประกาศไว้ ไม่มี server/frontend implementationเดิม บันทึก baselineด้วย [SOURCE-BASELINE](templates/SOURCE-BASELINE.md)
5. ทุกคนรัน board Check ของตนและส่งข้อความ setupทดสอบที่ไม่มี secrets ด้วย PostIdต่างกัน อ่านข้ามบัญชีให้เห็นจริง ไม่ใช้บัญชี/รหัสผ่านร่วมกัน
6. เปิด [prompt pack](05-prompts.md) ที่ส่วน A/B/C ของตน รอเริ่มแล้วค่อยส่ง prompt ที่เริ่ม implementation

## 5. 10:00 น. ส่งอะไรให้ใคร

เริ่มจากเอกสารสี่อย่างที่ทุกคนเห็นเหมือนกัน: `AGENTS.md`, `docs/SPEC.md`, `docs/CONTRACT.md`, `docs/TASKS.md` ไม่ต้องแนบ source Papi เดิมเข้า prompt

**C ได้ Master + Bootstrap C:** สร้าง root scripts/config, Node API, Vite web build wiring, database/session/tenant/transaction/model/jobs contracts, empty domain-registration hook, migrations runner, tests/CI และไฟล์ `.env.example` ที่ไม่มี secret ภายใน 30–45 นาที ส่ง PLATFORM_READYบนบอร์ดพร้อม SHA และวิธีรัน

**B ได้ Bootstrap B + Wave 1 domains:** สร้าง DTO feature files และ `registerDomains(router, services)` ใน allowed paths ตาม contract; ลงมือ knowledge/catalog/chatทีละtask ใช้ servicesจำลองจน Cพร้อม แล้วเปลี่ยนเป็น platform servicesจริง ไม่สร้าง auth/pool/model clientอีกชุด

**A ได้ Bootstrap A + Wave 1 UI:** สร้าง shell/routes/forms/tables/fixtures/API client ของทุกหมวดตาม inventory; ทำหน้าหลักจาก contractก่อน เมื่อ Cพร้อมให้เปลี่ยน API mockเป็นจริงเฉพาะเส้นที่ผ่าน integrated tests Mockยังคงอยู่เฉพาะ testsและstory demoที่ติดป้าย ห้ามแสดง mocksuccessใน live mode

หลัง taskหนึ่งจบ ให้ส่ง prompt Task Handoff แล้วเริ่ม taskถัดไปตาม dependency ดู [03 ลำดับสร้าง](03-build-order-and-ownership.md) และ CSV ไม่เปิดสามแชตที่ต่างสั่งว่า “ทำทั้งระบบทั้งหมด” ซ้ำกัน

## 6. คำสั่งแอปที่ C ต้องสร้างในงาน

คำสั่ง npm ด้านล่าง **ยังไม่มีอยู่ใน repo ใหม่วันนี้** เป็น acceptance contractของ task F01 Cต้องสร้างและรันให้ผ่านก่อนประกาศ PLATFORM_READY ห้ามถือว่าการคัดลอกคู่มือนี้ทำให้คำสั่งมีอยู่แล้ว

| คำสั่ง | สิ่งที่ต้องทำ |
|---|---|
| `npm run dev` | เปิด Node API3000 + Vite5173, load envเฉพาะlocal, proxy `/api`, terminate childprocessเมื่อหยุด |
| `npm run typecheck` | ตรวจ TypeScript web/server/sharedโดยไม่ emit |
| `npm test` | unit/contract tests แบบไม่เรียก API/providerจริง |
| `npm run build` | typecheck + build web ไป `dist/web` และ serverไป `dist/server`, ไม่มีsecretในbundle |
| `npm start` | เปิด built Node API3000และเสิร์ฟwebbuild; `/api` ไม่ถูก SPAfallbackกลืน |
| `npm run db:migrate` | incremental migrationsพร้อมschema ledger/transactionใน DB `nless_hack_*` ที่อนุญาต |
| `npm run db:seed` | เติมข้อมูลสังเคราะห์สองร้านแบบidempotent เฉพาะdemoDB |
| `npm run test:e2e` | browser/API E2Eบนfresh app/databaseที่กำหนด ห้ามเรียกPapi |
| `npm run eval:live` | opt-in paid model scenarios; write result/usage/mode; ห้ามอยู่ในdefault CI |

Aliasesที่architectureระบุให้มีด้วยคือ`test:unit`, `test:contract`, `check`และ`worker`: `npm test`รวมofflineunit/contract, `check`รวมtypecheckกับofflinechecks ส่วนworkerใช้jobimplementationเดียวกับAPI; defaultเริ่มหนึ่งworkerภายในแอป ห้ามเปิดstandaloneworkerเพิ่มโดยไม่มีlease/concurrencytests

ทุกentrypointที่ต้องใช้environment (`dev`, `start`, `worker`, `db:migrate`, `db:seed`, `test:e2e`, `eval:live`) ต้องเรียกconfiguration loaderร่วมที่Cสร้าง หรือรับenvironmentจากprocessอย่างชัดเจน Loaderอ่าน`.env.local`เฉพาะlocalและไม่ทับค่าที่injectจากcontainer/CI การใส่`--env-file`ให้DockerCompose **ไม่ได้exportค่ากลับให้npmที่รันบนhost** Migration/seedต้องตรวจชื่อDB`nless_hack_*`และenvironmentก่อนเขียน

หลัง Cสร้างไฟล์และcommitพร้อมแล้ว คนอื่นใช้ `npm ci` จาก lockfileเดียวกัน ห้ามแต่ละคน `npm install` เพิ่ม dependenciesเอง ถ้าจำเป็นโพสต์DEPENDENCY_REQUESTให้ Cเพิ่มและส่ง SHAใหม่

## 7. เปิดแอปบนเครื่อง C

ตัวอย่างเส้นทางเครื่อง C ต้องแทนให้ตรงที่ cloneจริง และต้องอยู่นอก Papi checkout:

```powershell
$CompetitionRoot = Join-Path $env:USERPROFILE 'Desktop\NlessHackathon2026'
Set-Location -LiteralPath $CompetitionRoot
git status -sb
git branch --show-current
node --version
npm ci
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
```

ถ้า `.env.local` มีอยู่แล้วให้แก้ผ่านeditor ใส่ `DATABASE_URL`, `OPENAI_API_KEY`, session secret และ provider testcredentialsในไฟล์localตามschemaที่ Cสร้าง ห้ามprintไฟล์ลง log/บอร์ด ห้ามใช้ `VITE_` สำหรับ API key เพราะค่าfrontendbundleมองเห็นได้

ในDockerDBmode ค่าhost`DATABASE_URL`ที่npmใช้ต้องชี้`127.0.0.1:<published-port>` ส่วนcontainerของappต้องได้URLที่ชี้ชื่อservice`db:5432` ให้Cประกาศ`DATABASE_URL_CONTAINER`ใน`.env.example`และตั้งCompose`app.environment.DATABASE_URL`จากค่านี้ ทั้งสองชี้ฐาน`nless_hack_*`เดียวกัน เปิดDBportเฉพาะloopbackของเครื่องพัฒนา ไม่ใช้URL`localhost`ภายในappcontainerเพื่อหวังจะเจอDBcontainerอื่น

**Docker DB mode** หลัง Cสร้าง `compose.yaml` ให้มี services `db` และ `app`:

```powershell
docker compose -p nless-hack-demo --env-file .env.local config --quiet
docker compose -p nless-hack-demo --env-file .env.local up -d db
docker compose -p nless-hack-demo --env-file .env.local ps
npm run db:migrate
npm run db:seed
npm run dev
```

`config --quiet` ตรวจconfigโดยไม่ dumpค่าsecret การเริ่ม containerไม่พิสูจน์ว่าDBพร้อม ต้องให้migrationต่อได้และhealthcheckตรวจ readiness คำสั่ง `npm run dev` ค้าง terminalเพื่อรันแอป เปิดอีก terminalตรวจ:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/health/ready'
```

**Native DB mode** ใช้ DATABASE_URLที่เตรียมสำหรับการแข่งขันแล้ว ข้ามคำสั่งdocker เรียกmigrate/seed/devเหมือนกัน ถ้าdb:migrateปฏิเสธชื่อDBหรือhost ให้แก้targetที่กำหนดผิด ไม่ลบguardหรือเปลี่ยนไปใช้ PapiDB

เครื่อง A/Bใช้ports3000/5173เหมือนกันได้เพราะคนละเครื่อง แต่ถ้าเปิดหลายworktreeบนเครื่องเดียวให้ CกำหนดportและDBชื่อแยก ห้ามพึ่ง `.env.local` ของเพื่อนที่อยู่ในอีกเครื่องโดยอัตโนมัติ

## 8. การใช้บอร์ดในแต่ละรอบ

```powershell
$BoardRepo = 'owner/nless-codex-hack-2026'
$BoardIssue = 1
& .\tools\team-board.ps1 -Mode Check -Repo $BoardRepo -Issue $BoardIssue -AgentId A
& .\tools\team-board.ps1 -Mode Read -Repo $BoardRepo -Issue $BoardIssue -AgentId A
```

แทนAgentIdตามผู้ใช้ เมื่อต้องส่งข้อความให้เขียน UTF-8ที่ `handoff/F13-ready.txt` ไม่ใส่credential แล้วส่ง:

```powershell
& .\tools\team-board.ps1 -Mode Post -Repo $BoardRepo -Issue $BoardIssue -AgentId B -MessageFile .\handoff\F13-ready.txt -PostId F13-B-ready-01
```

เปิดwatcherอีกterminalได้:

```powershell
& .\tools\team-board.ps1 -Mode Watch -Repo $BoardRepo -Issue $BoardIssue -AgentId A -PollSeconds 30 -DurationSeconds 1800
```

ตัวช่วยเขียนขึ้นใหม่ในkitนี้ Watchพิมพ์ข้อความอย่างเดียวและใช้cursorแยกจาก Read เพื่อไม่กินinboxของCodex ไม่มีคำสั่งในcommentใดถูกรันเอง ไม่มีidle-Codex wakeup ไม่มีfilelockของsource ผู้ใช้หรือCodexsessionที่ยังทำงานต้องอ่านแล้วเลือกดำเนินการตามtaskที่ได้รับอนุญาต

ถ้าส่งแล้วเน็ตหลุด ให้เปิดissueตรวจPostIdหรือเรียกPostด้วยPostIdเดิมเพื่อreconcile ห้ามรีโพสต์ด้วยIDใหม่ทันที การdedupเป็นbest-effortของcommentที่อ่านได้ ไม่ใช่ธุรกรรมexactly-onceข้ามเครื่อง ถ้าจะแก้ข้อมูลให้โพสต์commentใหม่ เพราะReadใช้commentIDจึงไม่แจ้งeditของcommentเก่า

ถ้าhelperใช้ไม่ได้ให้ใช้ `gh issue view ... --comments` และ `gh issue comment ... --body-file ...` ตาม04 แล้วเดินงานต่อ บอร์ดล่มไม่ใช่เหตุให้ทั้งสามคนหยุดเขียนโค้ด: อัปเดตTASKSผ่านCและประสานพูดกันแทน

## 9. ทุกครั้งก่อนรวมโค้ด

เจ้าของงานต้องอ่านบอร์ด, ตรวจก่อนcommitว่าไม่มีไฟล์ของเพื่อน/secret, รันทดสอบที่เกี่ยวข้อง, commitเฉพาะpathตัวเอง และส่งPRตาม04 Cตรวจว่าtestของPRใช้headเดียวกับที่กำลังmerge หากPRเปลี่ยนระหว่างreviewให้ตรวจใหม่

หลังmerge Cประกาศ SHAและcontractversion ให้A/Bfetchและเริ่มbranchถัดไปจากdemoใหม่ ไม่forcepushsharedbranch ไม่แก้lockfileข้ามคน ไม่ลบงานเพื่อนเพื่อให้testเขียว ถ้าเกิดconflictให้เจ้าของสองส่วนอธิบายพฤติกรรมที่ต้องคงไว้ แล้วรวมด้วยtest ไม่กดเลือกours/theirsทั้งไฟล์โดยไม่อ่าน

## 10. 15:15 น. ตรวจ artifact ที่จะสาธิต

1. CบันทึกcandidateSHAและstatus ต้องไม่มีuncommittedapplicationchangeที่จะอ้างว่าส่งแล้ว
2. ทำclean worktreeใหม่จากcandidateตามตัวอย่างด้านล่าง ไม่ต้องลบdevelopercheckout
3. `npm ci`, `npm run typecheck`, `npm test`, `npm run build` บนcandidate
4. ทดสอบmigrationบนfreshdemoDBและrestartโดยข้อมูลยังอยู่
5. เรียก `npm start` และทำE2Eกับbuiltappจริง ไม่ใช้Vitedevผลแทนproductionbuild
6. ถ้าใช้Dockerrelease หยุดเฉพาะprocessของแอปแข่งทั้ง`npm run dev`และ`npm start`ที่อาจใช้port3000ก่อน แล้ว `docker compose -p nless-hack-demo --env-file .env.local up -d --build app` ต้องใช้DBvolumeเดิมและmigrationที่ตรวจแล้ว
7. ถ้าส่งขึ้นsandboxhostที่เตรียมแล้ว ให้deploycandidateเดียวกันและตรวจ health+E2Eที่URLนั้น; ไม่เอาคำสั่งdeploy Papiไปใช้กับแอปแข่ง
8. บันทึกsourceSHA/buildSHA/schema/mode และrollbacktargetในevidence ห้ามเคลมpublicdeploymentถ้าทดสอบแค่localhost

หลัง 15:30 น.หยุดเพิ่มfeature แก้เฉพาะblockerของงานที่มีอยู่ หากแก้codeต้องbuildและทดสอบจุดที่กระทบใหม่

ตัวอย่างสร้างreleaseworktree โดยยังอยู่rootของcompetitionrepo:

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed; do not release a stale candidate' }
$CandidateSha = (git rev-parse origin/demo).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve candidate commit' }
$ReleaseRoot = Join-Path (Split-Path -Parent (Get-Location).Path) ('NlessHackRelease-' + $CandidateSha.Substring(0, 8))
if (Test-Path -LiteralPath $ReleaseRoot) { throw 'Choose a new release directory; do not overwrite an existing checkout' }
git worktree add --detach $ReleaseRoot $CandidateSha
if ($LASTEXITCODE -ne 0) { throw 'Release worktree creation failed' }
Set-Location -LiteralPath $ReleaseRoot
git status --porcelain
git rev-parse HEAD
```

ให้Cตั้งenvสำหรับreleaseด้วยมือ `.env.local`ไม่เดินตามGitหรือworktreeอัตโนมัติ ใช้Composeprojectชื่อ`nless-hack-demo`เดิมตั้งแต่เปิดDBครั้งแรกและตลอดreleaseเพื่อไม่สร้างvolumeใหม่เพียงเพราะชื่อโฟลเดอร์เปลี่ยน ถ้าแชร์localDBระหว่างdevกับreleaseต้องหยุดwriterของdevก่อน ส่วนcleanmigrationtestใช้DBแยก domainAPIทั้งหมดใช้base`/api/v1`ตาม02; `/health/live`, `/health/ready`และ`/build-info`อยู่นอกbaseนี้

## 11. Rollback และปัญหาเฉพาะหน้า

| อาการ | ตรวจ | การแก้ที่ทำได้โดยไม่ทำลายงาน |
|---|---|---|
| npmciไม่ผ่าน | lockfile/head/Nodeรุ่นตรงกันไหม | รับlockfileของC; ไม่ลบlockfileแล้วinstallสดทุกเครื่อง |
| portใช้อยู่ | terminaldevเก่า/worktreeอื่น | หยุดเฉพาะprocessที่ยืนยันว่าเป็นของแอปแข่ง หรือเปลี่ยนportพร้อมAPIbaseให้ตรง |
| DBต่อไม่ได้ | Dockerengine/dbhealth/URLชื่อDB | แก้configurationของsandbox; ไม่ใช้connectionPapiเดิม |
| schemaไม่ตรง | migrationledgerและhead | Cรันmigrationที่ทดสอบแล้ว; ไม่ให้Bแก้schemaผ่านad-hocSQL |
| API401/403 | session/role/tenantจริง | ล็อกอินใหม่หรือแก้membershipfixture; ไม่ปิดauth |
| AI429/timeout | modelaccess/rate/token/deadline | ลดparallelcalls/ใช้modelที่อนุญาต; boundedretryพร้อมbudget; แสดงfailureไม่แต่งคำตอบ |
| providerpending | callback/auth/scope/approval | ติดป้ายadapter/testให้ตรง; ไม่แสดงconnectedจากcredentialเพียงอย่างเดียว |
| พบข้อมูลข้ามร้าน | servertenantfilter/objectownership | ถือเป็นblocker หยุดpathนั้น; เพิ่มisolationtestก่อนปล่อย |
| deployใหม่เสีย | sourceSHA/log/migrationcompatibility | เปิดlast-goodartifactใหม่จากsavedcommit; คงข้อมูล/ledger ไม่resetDB |
| Wi-Fiเสีย | localapp/fixtures/cacheddeps | สาธิตlocalที่ผ่านและชี้ว่าส่วนproviderขาดnetwork; backupvideoเป็นrecorded |
| Codexlimitถึง | usageแต่ละบัญชี/authmode | ใช้session/บัญชีของแต่ละคนตามสิทธิ์; API-keyCLIเฉพาะที่รองรับและได้รับอนุญาต; ไม่แชร์บัญชีหรืออ้างว่ามีunlimited |

ไม่ใช้ `docker compose down -v`, `git reset --hard`, `git clean -fdx`, forced sharedpush หรือdropdatabaseเป็นวิธีแก้ด่วน ไม่มีขั้นตอนใดต้องลบsource/ต้นฉบับของPapi

## 12. 16:00–17:00 น. สาธิตและส่ง

อ่าน [07 validation/demo](07-validation-and-demo.md) ใช้เรื่องเดียวเดินผ่านทั้งแพลตฟอร์ม: สร้างสองร้านและสิทธิ์ -> ลงknowledge/catalog -> รับข้อความ -> AIตอบพร้อมที่มา -> ลูกค้ายืนยันออเดอร์หรือจอง -> staffเห็น/รับช่วง -> CRM/insight/usageเปลี่ยน -> แสดงtenant/permission rejection -> เปิดledgerของช่องทาง/voice/billingตามโหมดจริง

รอบแรกเตรียมscriptสั้นประมาณ3นาทีและscriptยาวประมาณ5นาทีไว้ก่อน แต่เวลานี้เป็นแผนซ้อมของทีม ไม่ใช่เวลาpitchที่ผู้จัดประกาศ ต้องใช้เวลาจริงจากbriefวันงาน รอบแรกไทยหรืออังกฤษได้ รอบfinalผู้จัดpreferอังกฤษแต่ภาษาไม่กระทบคะแนนตามFAQ

เป้าหมายส่ง 16:45 น. เพื่อเหลือ15นาทีเช็กform receipt/linkสิทธิ์repo ตรวจจากbrowserอีกบัญชีที่มีสิทธิ์จริงด้วย หากผู้จัดกำหนดrepo publicให้ตรวจสิทธิ์และsanitizationก่อนเปลี่ยนvisibility อย่าส่งprivatePapiหรือcustomerdataไปโดยไม่มีauthorization

ก่อนออกจากโต๊ะทุกคนต้องตอบได้: submission URLคืออะไร, finalSHAคืออะไร, demoรันที่ไหน, featureไหนเป็นreal/test/sandbox/adapter/notbuilt, testใดผ่านจริง, Codexช่วยอะไรที่ตรวจได้ และมีอะไรที่ไม่ได้พิสูจน์ใน7ชั่วโมง

## แหล่งยืนยันขั้นตอน

[กำหนดการและFAQผู้จัด](https://luma.com/39zve8ph), [GitHub CLI](https://cli.github.com/manual/), [GitHub PR merge](https://cli.github.com/manual/gh_pr_merge), [Docker Compose](https://docs.docker.com/compose/gettingstarted/), [Node release support](https://nodejs.org/en/about/previous-releases), [Codex pricing/auth mode](https://learn.chatgpt.com/docs/pricing)
