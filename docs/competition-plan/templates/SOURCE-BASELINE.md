# บันทึก baseline และที่มาของโค้ด

> **อัปเดต 20 พ.ย. 2569 (ค่ำ, [D1](../../DECISIONS-2026-11-20.md)):** repo แข่งเริ่มจากว่างและสร้างจาก **build spec ของทีมเอง** (`docs/specs/`) ไม่มีโค้ด Papi และไม่มี `../papi-ref` (ปิด เว้นแต่หัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` หลังผู้จัดยืนยันเป็นลายลักษณ์อักษร) ไฟล์นี้บันทึกสิ่งที่ถูกนำเข้า repo ตอน 10:00, คำตอบผู้จัด, ตัวเลือกสำหรับ production และสิ่งที่เตรียมก่อนวันงาน ห้ามใส่ key, token, URL ส่วนตัว หรือรหัสผ่านในไฟล์นี้

Repositoryใหม่: REPLACE
วันและเวลาไทยที่บันทึก: REPLACE
GitHubloginsของA/B/C: REPLACE
BaselinecommitSHA: REPLACE
ข้อความ commit baseline (ต้องมีบันทึกงานก่อนหน้า): `chore: baseline - prior planning work only, no application code` + ย่อหน้า prior work ตาม [prompts/C1-setup.md](../../../prompts/C1-setup.md) ข้อ 0.2 · REPLACE (ยืนยันว่าตรงกับที่ commit จริง)
คำตอบผู้จัดเรื่องใช้โค้ดบริษัทเป็น reference (วันที่ส่งอีเมล + วันที่ตอบ + ข้อความ): REPLACE หรือ "ยังไม่ได้คำตอบ: ไม่ใช้ ไม่เปิดโค้ดบริษัท (D1)"

## ที่ถูกนำเข้า repo แข่งตอน 10:00 (ประกาศเป็นงานก่อนหน้า)

เอกสารและเครื่องมือเตรียมงานที่ทีมเขียนเองก่อนวันงาน: `docs/` (แผน, build specs ใน `docs/specs/`, porting briefs = know-how ที่ทีมสรุปเป็นคำของตัวเอง, `docs/openai-api.md`, `docs/day/`), `prompts/` (รวม `prompts/orchestrators/`, `prompts/lanes/`, `prompts/people/`), `AGENTS.md`, `contracts.ts` (types, ข้อกำหนดและ fake ในรูป declaration ไม่มี implementation), `.env.example`, `SPEC.md`, สคริปต์บอร์ด `tools/team-board.ps1` และ Codex hooks/config/agents ใน `.codex/` · บอร์ดและ helper เป็นเครื่องมือพัฒนา ไม่อ้างเป็นความสามารถของแอป

**ไม่ถูกนำเข้า:** `tools/openai-check` (โค้ดวิจัยก่อนงาน) · ทุกอย่างจาก Papi (source, migrations, assets, `.env*`, credentials) · ข้อมูลลูกค้า · `..\nless.secrets.env`

## เตรียมก่อนวันงาน

Credits เปิดใช้แล้ว (คนละ Codex Credits US$100 + OpenAI API Credits US$100; วันที่เปิดใช้ + วันหมดอายุ + model ที่ใช้ได้): A REPLACE · B REPLACE · C REPLACE
OpenAI projects: `app-dev` ของแต่ละคน (key ใน `..\nless.secrets.env` ของเครื่องคนนั้น, hard limit US$30) A REPLACE · B REPLACE · C REPLACE · `app-prod` (key ของ production ใน Render env เท่านั้น, hard limit US$60, คนถือ key: REPLACE; คนใส่ใน Render: REPLACE)
OpenAI smoke test (`docs/openai-api.md` §14, key ของ project `app-dev` ของตัวเอง, ไม่พิมพ์ key): วันที่/เวลา REPLACE · gpt-6.2-sol (chat/fast/strong) REPLACE · text-embedding-3-large dim REPLACE (ต้อง 1536) · omni-moderation-latest REPLACE · realtime/transcribe ถ้าลอง: REPLACE · tier และ rate limit ใน Settings → Limits: REPLACE · ต้อง verify organization ไหม: REPLACE · model ที่ได้ 403/404 และรุ่นที่ใช้แทนใน `.env.example`: REPLACE หรือ "ไม่มี"
ฐานข้อมูล dev: Neon project ของแต่ละคน (Singapore, direct endpoint) · ผลทดสอบคืนก่อนวัน (`CREATE DATABASE nless_probe` + `CREATE EXTENSION vector` + ลิมิต connection): A REPLACE · B REPLACE · C REPLACE · fallback WSL Postgres 16 + pgvector พร้อมใช้: A REPLACE · B REPLACE · C REPLACE
**ฐานข้อมูล production (เลือกก่อน 10:00):** Render Postgres 17 + pgvector (ค่าเริ่มต้น) หรือ Supabase free ผ่าน session pooler (IPv4, port 5432) · เลือก: REPLACE · เหตุผล/ผลทดสอบ `CREATE EXTENSION vector`: REPLACE
Production host: Render (Singapore) สร้างโดย REPLACE วันที่ REPLACE · Blueprint ซ้อมแล้ว: REPLACE · Railway fallback ยืนยันแล้ว: REPLACE (ตาม `docs/day/deployment.md`)
ChatGPT Sites dashboard (เครื่องมือของทีม ไม่ใช่โค้ดแอป): สถานะ REPLACE (พร้อมใช้ | ใช้ GitHub issue อย่างเดียว) · สร้างโดย REPLACE วันที่ REPLACE ตาม `docs/board/sites-dashboard.md` · แชร์ให้ 3 บัญชีของทีมเท่านั้น · bypass token ออกแล้วและเก็บใน `..\nless.secrets.env` ของทุกเครื่อง: REPLACE (ไม่บันทึก URL หรือ token ที่นี่)
ผลทดสอบ dashboard ก่อนวันงานจาก 3 เครื่อง (POST โพสต์ / GET กลับ / PUT การ์ด lane ผ่าน `tools/team-board.ps1` + mirror ไป GitHub issue): A REPLACE · B REPLACE · C REPLACE → `BOARD_SOURCE` วันงาน: `sites` หรือ `github` (ถ้าไม่ผ่าน)
คนถือบัญชีและ key วันงาน: Render + Railway + env ของ production + LINE *NLess Demo* + Meta app + tunnel = C · key `app-prod` = REPLACE (หัวหน้า) · Neon org `Endless` (Admin) = C · `app-dev` + project Neon ของตัวเอง + ตัวแปรบอร์ดของแต่ละเครื่อง = เจ้าของเครื่องนั้น พิมพ์เอง ไม่ส่งผ่านแชทหรือ git

## สิ่งที่มีอยู่ก่อน

บันทึก spec/workflow/tool/dependency/reference/open source/assets ที่อนุญาต พร้อมแหล่งที่มา/version/license เมื่อเกี่ยวข้อง: ชุดเอกสารเตรียมงานข้างบน, สคริปต์บอร์ด + Codex hooks, ChatGPT Sites dashboard ที่สร้างก่อนวันงาน (เครื่องมือสื่อสารของทีม ไม่ใช่ส่วนหนึ่งของแอป Endless) และ library โอเพนซอร์สที่ pin เวอร์ชันไว้ใน `package-lock.json` ซึ่งติดตั้งในวันงาน (ดู [docs/specs/F01-core.md](../../specs/F01-core.md) S1)

## สิ่งที่ไม่มีใน baseline

ไม่มีไฟล์จาก Papi ใน repo แข่ง (source, migrations, assets ที่ copy มาทั้งไฟล์), ไม่มีการเรียก backend/DB เดิม, ไม่มี customer database, credentials หรือ private assets ที่ไม่ได้อนุญาต โค้ดแอปทั้งหมดเขียนในวันงานหลัง baseline หากมี boilerplate หรือ pre-existing code ต้องแสดงในรายการข้างบน ไม่บอกว่าไม่มีทั้งที่มี

## คำสั่งบันทึกหลังตรวจว่าอยู่ repo ใหม่

```powershell
Get-Location
git remote -v
git rev-parse HEAD
git ls-tree -r --name-only HEAD
git status --short
```

บันทึกผลเฉพาะที่ไม่มี secret ลง evidence · baseline SHA และเวลาทั้งหมดต้องเป็นค่าจริง · หากผู้จัดไม่อนุญาต setup ก่อนงานให้เก็บเอกสารภายนอกและเริ่ม baseline ตามที่ผู้จัดกำหนด
