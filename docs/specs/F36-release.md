# F36 release — ตรวจรวมบน production, หลักฐาน, README และชุดส่งงาน

| | |
|---|---|
| Lane / คน | **C1** / **C** · ลำดับสุดท้ายใน lane (F01 → F35 → F39 → **F36 เริ่ม 15:15 ตามนาฬิกา** F39 พักไว้) |
| Tier / เป้า | **P1** (ข้อยกเว้นตาม AGENTS ข้อ 1: เริ่มเอง ไม่ต้องรอ `LEAD: OPEN`) · เป้า **R** (ทุกอย่างรันได้จริงบน production และรายงานตามจริง) |
| Timebox | 60–120 นาที (15:15–16:45; ผลสุดท้ายต้องเสร็จก่อน deploy freeze) |
| พึ่ง | F01 (`/build-info`, `/readyz`, fixture Playwright, `npm run e2e`), F35 (`/ops`, สรุป job/dead), `EVIDENCE.md` ของทุกฟีเจอร์ (F01/F35 อยู่ที่ `server/src/core/EVIDENCE.md`), F09 + F11 (test id), F10 (AI ตอบจริง) · ใช้ทุกฟีเจอร์ผ่าน HTTP/หน้าเว็บเท่านั้น ไม่ import ไฟล์ข้างใน |
| ให้ | `tests/e2e/golden-path.spec.ts` (12 checks) · `scripts/release/*` (รวม EVIDENCE → `docs/FEATURE_STATUS.csv`, timeline, README, ชุดส่งงาน, ตรวจ claim) · `.github/workflows/release-check.yml` · หน้า `/release` + `GET /api/v1/release/status` · `docs/evidence/*` · `README.md` ของ repo แข่ง · `docs/submission/SUBMISSION.md` |
| ใช้ | `GET /healthz`, `/readyz`, `/build-info`, `GET /api/v1/features` (F01), `/ops` ข้อมูลของ F35 ผ่านบัญชีผู้ดูแล, Git + `gh` CLI (ผ่านสคริปต์) |
| โฟลเดอร์ | `server/src/features/release/` · `web/src/features/release/` · `shared/features/release/types.ts` · `scripts/release/` · `tests/e2e/golden-path.spec.ts` · `docs/evidence/**` · `docs/FEATURE_STATUS.csv` · `docs/submission/**` · `README.md` · `.github/workflows/release-check.yml` (ทั้งหมดอยู่ใน path ของ lane C1 ตาม AGENTS ข้อ 2) |
| Web path | `/release` (เมนูกลุ่ม `admin` · route auth `platform_admin` ตามตาราง MENU ของ F01 · label "Release") |

อ่าน: [PLAN.md](../../PLAN.md) (ตาราง gate/เวลา) · [prompts/README.md](../../prompts/README.md) (ข้อ 5 หลัง FREEZE) · [SPEC §4–§7](../competition-plan/templates/SPEC.md) (สถานะ R/S/A/U) · [EVIDENCE.md template](../competition-plan/templates/EVIDENCE.md) · [FEATURE_STATUS.csv template](../competition-plan/templates/FEATURE_STATUS.csv) · [PITCH.md §7](../pitch/PITCH.md) (prior-work แบบ A/B) · [F01](F01-core.md) §10.2 (Playwright), §11.1 · [COOKBOOK](../COOKBOOK.md) §11 (รูปแบบ EVIDENCE.md)

## 1. เป้าหมายและ user stories

ทำไมมี: ผลงานถูกตัดสินจากสิ่งที่กรรมการเห็นบน URL จริงและหลักฐานที่ตรวจสอบได้ ไม่ใช่จากคำบอกเล่า (D6: ห้ามมี green placeholder). F36 ทำสามอย่าง: (1) พิสูจน์ว่า golden path ทำงานบน production ของ SHA ที่ส่ง (2) รวมสถานะของทั้ง 31 ฟีเจอร์จากหลักฐานที่แต่ละ lane เขียนไว้เป็นไฟล์เดียวที่ตรงความจริง (3) สร้าง README, หน้า `/release` และชุดส่งงานจากข้อมูลจริง (ตัวเลข Codex, SHA, จำนวน test) ไม่เขียนมือ

ผู้ใช้: **คน C และ C0** (รัน verify/roll-up) · **หัวหน้าทีม** (ตัดสินใจ rollback, ส่งงาน) · **กรรมการ** (อ่าน README, เปิด URL, ดูสถานะ)

User stories:
1. หลัง merge ทุกครั้งที่เป็น candidate คน C รันคำสั่งเดียว (`npm run release:verify`) แล้วรู้ใน ~3 นาทีว่า production ที่ SHA นั้นผ่าน 12 checks หรือล้มข้อไหน
2. ตอน 15:30 ถึง 16:30 รันสคริปต์รวม `EVIDENCE.md` เป็น `docs/FEATURE_STATUS.csv` ครบ 31 แถว สถานะไม่ขัดกับธง hidden ของ production และ R ทุกแถวมี SHA + test + เวลา ถ้าไม่ครบ สคริปต์ลดเป็น A พร้อมเหตุผล (ไม่ปล่อยให้เป็น R เงียบ ๆ)
3. README ถูกสร้างจาก template ด้วยข้อมูลจริง: ปัญหา, URL, QR LINE, สถาปัตยกรรม, วิธีใช้ Codex พร้อมตัวเลขจาก git/GitHub, prior-work, ตารางสถานะ, ข้อจำกัดตามจริง
4. หน้า `/release` แสดงตารางสถานะ + ลิงก์หลักฐาน + SHA ของ build ที่รันอยู่ และเตือนเมื่อข้อมูลสถานะเก่ากว่า build หรือขัดกับธง hidden
5. เมื่อ production พังหลัง merge ล่าสุด: มีขั้น rollback ที่ทำได้ภายใน 2 นาทีและรู้ว่า SHA เขียวล่าสุดคืออะไร
6. ชุดส่งงาน (repo, URL, QR, วิดีโอ, สไลด์) ครบหรือรู้ว่าขาดอะไร (`MISSING`) ก่อน 16:45
7. ไม่มีใครเผลอพูด/เขียนสิ่งที่ยังไม่จริง: สคริปต์ตรวจ claim ต้องห้ามใน README/สไลด์/ชุดส่งงาน

นอกขอบเขต: ปรับสถานะแทนเจ้าของฟีเจอร์ (F36 ลดเกรดตามกฎได้ แต่ไม่ยกเกรด) · เขียนสไลด์/วิดีโอ (เป็นงานคน; F36 แค่ตรวจว่ามีไฟล์/ลิงก์) · load test · ตั้งค่า Render แทนคน (ทำตามรายการตรวจ) · dashboard สาธารณะ

## 2. Data model

ไม่มีตารางของตัวเอง (ไม่มี migration) · ข้อมูลของหน้า `/release` มาจากไฟล์ที่สคริปต์สร้างและ commit เข้า repo เพื่อให้ server อ่านได้โดยไม่พึ่งการอ่าน `docs/` ตอนรันบน Render:

`server/src/features/release/data/release-status.json` (สร้างโดย `npm run release:status`; schema ใน `shared/features/release/types.ts`):

```ts
export type Mode = 'R' | 'S' | 'A' | 'U';
export interface ReleaseFeatureRow {
  featureId: string;            // 'F01'…'F39' (31 แถว ไม่มีรหัสที่ถูกตัด)
  slug: string; name: string; lane: string; tier: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'DONE' | 'DOING' | 'BLOCKED' | 'UNIMPLEMENTED';   // จาก EVIDENCE.md; ไม่มีไฟล์ = UNIMPLEMENTED
  targetMode: Mode; actualMode: Mode;                         // actualMode หลังใช้กฎลดเกรด §5.2
  providerGate: string;
  commitSha: string; testsEvidence: string; checkedAtBangkok: string; blocker: string;
  evidenceFile: string;         // path ใน repo เช่น server/src/features/catalog/EVIDENCE.md
  downgradedFrom: Mode | null;  // ถ้าสคริปต์ลดเกรด
  downgradeReason: string | null;
  links: { evidence: string; commit: string | null };         // URL GitHub ของไฟล์และ commit
}
export interface ReleaseStatusFile {
  generatedAt: string;          // ISO UTC
  generatedFromSha: string;     // git rev-parse HEAD ตอนสร้าง
  baselineSha: string; repoUrl: string;
  totals: { R: number; S: number; A: number; U: number };
  rows: ReleaseFeatureRow[];
}
```

ไฟล์ที่สร้างอื่น (ไม่ใช่ข้อมูล runtime): `docs/FEATURE_STATUS.csv` · `docs/evidence/release.md` · `docs/evidence/gate-1300.md` (C0 เขียน; F36 ตรวจว่ามี) · `docs/evidence/codex-timeline.md` · `docs/evidence/vitest.json`, `docs/evidence/e2e.json` (ผลดิบ) · `docs/evidence/last-green.json` (`{ sha, verifiedAt, e2ePassed, e2eSkipped }`) · `docs/submission/SUBMISSION.md` · `README.md`

## 3. API endpoints

| Method | Path | auth | permission | Request | Response | Errors |
|---|---|---|---|---|---|---|
| GET | `/release/status` | platform_admin | — | — | `ReleaseStatusView` | — |

```ts
// shared/features/release/types.ts (ต่อจาก §2)
export interface ReleaseStatusView extends ReleaseStatusFile {
  build: { sha: string; shortSha: string; env: string; schema: string; modelMode: 'openai' | 'fake'; providerModes: Record<string, string>; startedAt: string };
  flags: { featureId: string; hidden: boolean; placeholder: boolean }[];     // จาก feature_flags + registry
  conflicts: { featureId: string; kind: 'claims_R_but_hidden' | 'hidden_not_listed' | 'R_but_placeholder'; message: string }[];
  stale: boolean;               // generatedFromSha ≠ build.sha และ commit ของ build ไม่ใช่ลูกของ generatedFromSha
  lastGreen: { sha: string; verifiedAt: string } | null;
}
```

หมายเหตุ: handler อ่าน JSON ด้วย `fs.readFileSync` ครั้งแรกแล้ว cache ในหน่วยความจำ (ไฟล์ถูก bundle ตอน build; ไม่มีไฟล์ = คืน `rows: []` และ `generatedAt: null` ให้หน้าแสดง "ยังไม่ได้สร้างข้อมูลสถานะ" ไม่ใช่ตารางว่างเขียว) · `conflicts` คำนวณตอนเรียก (ไม่เก็บ) · ไม่มี endpoint เขียน · route ลงทะเบียนด้วย `defineFeatureRoutes({ featureId:'F36', slug:'release' })` และต้องลบ route placeholder ของ scaffold ใน PR แรก

## 4. Service functions และ contracts

ไม่มี contract ข้าม lane (ไม่มีใครเรียก F36) · `server/src/features/release/service.ts`: `getReleaseStatus(user): Promise<ReleaseStatusView>` (ใช้โดย route; เรียก `isFeatureHidden`/registry ของ core ผ่าน `server/src/core` index เท่านั้น)

ไฟล์ภายใน: `routes.ts` · `service.ts` · `conflicts.ts` (`computeConflicts(rows, flags)`) · `*.test.ts` · สคริปต์ (นอก server): `scripts/release/{verify.ts, status.ts, evidence-parse.ts, timeline.ts, readme.ts, pack.ts, claims.ts, lib/git.ts, lib/gh.ts, lib/csv.ts}` + template `scripts/release/README.template.md`

npm scripts ที่ C1 เพิ่มใน root `package.json` (ใน PR ของ F36): `release:verify`, `release:status`, `release:status:check`, `release:timeline`, `release:readme`, `release:readme:check`, `release:pack`, `release:claims` (ทุกตัว `tsx scripts/release/<name>.ts`) · ไม่มี dependency เพิ่ม (ใช้ `node:child_process` เรียก `git`, `gh`, `npm`; CSV เขียนเอง)

Contract ที่ใช้ (อ่านอย่างเดียว): `GET /build-info`, `/readyz`, `/healthz`, `/api/v1/features`, `/api/v1/me` · การเข้าถึง `/api/v1/ops/summary` ใช้บัญชี admin (ถ้ามี `E2E_ADMIN_EMAIL`)

## 5. Algorithms

ค่าคงที่ (`scripts/release/config.ts`):

| ค่า | ค่า |
|---|---|
| `BASELINE_CUTOFF` | `2026-11-21T10:00:00+07:00` (baseline = commit ล่าสุดบน `origin/main` ก่อนเวลานี้) |
| `SUBMIT_DEADLINE` | 17:00 Asia/Bangkok (UNCONFIRMED: ตรวจเวลาส่งจริงตอน registration) |
| `DEPLOY_FREEZE` | 16:45 |
| `GOLDEN_AI_TIMEOUT_MS` | 45000 (รอ AI ตอบ) |
| `GOLDEN_TOTAL_TIMEOUT_MS` | 240000 (ทั้งชุด) |
| `STALE_EVIDENCE_MINUTES` | 90 (R ที่ `checked_at` เก่ากว่านี้ตอน roll-up สุดท้าย = เตือน ไม่ลดเกรด) |
| `FORBIDDEN_CLAIMS` | ตาราง §5.8 |

### 5.1 Golden path: 12 checks บน production (`tests/e2e/golden-path.spec.ts`)

รันเป็นชุด `test.describe.configure({ mode:'serial' })` ใต้ `E2E_BASE_URL` · ใช้ fixture ของ F01 (`ownerPage`, `api`, `e2eMarker()`) และ test id จาก F09/F11: `demo-chat-input`, `demo-chat-send`, `demo-chat-message` (`data-author` = customer|ai|staff|system), `inbox-message` (`data-author`, `data-direction`, `data-origin`, `data-message-id`), `team-takeover`, `team-release` · ข้อมูลทดสอบ: ลูกค้าเดโมใหม่ (visitor ใหม่ทุกรอบ) ร้าน A (`demo-boardgame`) ข้อความต่อท้ายด้วย `(<marker>)` · ใช้ AI จริงของ production ไม่เกิน ~6 turn ต่อรอบ (เพดาน visitor ของ F09 ≤ 6/นาที: ห้ามส่งถี่กว่า 1 turn / 12 วินาที) · **ข้อที่ต้องใช้ฟีเจอร์ที่ยังไม่ R ให้ `test.skip(reason)` และตัวนับ skip ถูกรายงาน ห้ามนับเป็น pass** · ผลดิบเขียนด้วย reporter `json` ไปที่ `docs/evidence/e2e.json`

| # | ชื่อ test | ขั้น | ผ่านเมื่อ | skip เมื่อ |
|---|---|---|---|---|
| 1 | `01 build identity and health` | `GET /healthz`, `/readyz`, `/build-info` | `healthz.status='ok'` · `readyz` 200 และ `worker.running=true` · `build-info.sha` ≠ `unknown` และ (ถ้า `E2E_EXPECT_SHA` ตั้ง) ขึ้นต้นด้วยค่านั้น · ไม่มีสตริง `OPENAI`/`SESSION_SECRET`/`sk-` ใน body · `modelMode='openai'` | — (ไม่เคย skip) |
| 2 | `02 owner login and tenant scope` | `ownerPage` เปิด `/` แล้ว `GET /api/v1/me` | เห็น sidebar · `businesses` มี `Demo Boardgame Shop` และไม่มี `Demo Repair Studio` | — |
| 3 | `03 tenant isolation` | ใช้ `api` (owner A) `GET /api/v1/businesses/00000000-0000-4000-8000-0000000b2000` | HTTP 404 `NOT_FOUND` (ไม่ใช่ 403/200) | — |
| 4 | `04 public demo chat opens on a phone` | context ใหม่ไม่มี cookie, viewport 390×844, เปิด `/demo-chat/s/demo-boardgame` | เห็นชื่อร้าน · `demo-chat-input` visible · `scrollWidth ≤ clientWidth` (ไม่มี scroll แนวนอน) | — |
| 5 | `05 ai answers a price from the catalog` | พิมพ์ `A-GAME-01 ราคาเท่าไหร่ (<marker>)` → `demo-chat-send` | ภายใน 45 วินาทีมี `demo-chat-message[data-author=ai]` ที่มี `1,490` และไม่มีข้อความ error/`fake` | — |
| 6 | `06 sold out is stated, not invented` | ส่ง `A-SOLD-01 ยังมีไหม (<marker>)` | AI ตอบมี "หมด" หรือ "sold out" และไม่มีตัวเลขสต็อกบวก | — |
| 7 | `07 other shop data does not leak` | ส่ง `TENANT_B_ONLY_OWL_482 คืออะไร (<marker>)` | คำตอบ AI ไม่มีสตริง `TENANT_B_ONLY_OWL_482` และไม่มี `Demo Repair Studio` | — |
| 8 | `08 staff sees the chat in inbox` | `ownerPage` เปิด `/chat` หาแถวของลูกค้าจาก displayName `ผู้ทดลอง <4 ตัวท้ายของ visitorId>` (อ่านจาก cookie `nless_demo_visitor`) คลิกเปิดเธรด | ภายใน 15 วินาทีเห็น `inbox-message` ที่มี marker ของข้อความ 5 ทั้ง `data-author=customer` และ `data-author=ai` | — |
| 9 | `09 takeover silences the bot` | ในเธรดเดิมกด `team-takeover` ·ฝั่งลูกค้าส่ง `ขอบคุณค่ะ (<marker>)` · รอ 15 วินาที | ไม่มี `data-author=ai` ใหม่หลังข้อความนั้น · สถานะเธรดแสดงว่าพนักงานรับช่วง | F11 ไม่ R (flag: `F11` hidden/placeholder) |
| 10 | `10 staff reply reaches the customer, release returns the bot` | พนักงานพิมพ์ตอบในเธรด (ช่อง composer ของ F09) · ฝั่งลูกค้าเห็น `data-author=staff` ภายใน 20 วินาที · กด `team-release` · ลูกค้าถามราคา A-GAME-01 อีกครั้ง | ลูกค้าเห็นข้อความพนักงาน · หลัง release AI ตอบอีกครั้งภายใน 45 วินาที | F11 ไม่ R |
| 11 | `11 order proposal needs the customer to confirm` | ลูกค้าส่ง `ขอซื้อ A-GAME-01 2 ชิ้น รับที่ร้าน (<marker>)` | การ์ดสรุป (`order_review`) ปรากฏพร้อมปุ่มยืนยัน/ยกเลิก และ **ยังไม่มีออเดอร์ใหม่** (`GET` รายการออเดอร์ของ A ไม่เพิ่มจำนวน) · จากนั้นกดยกเลิกบนการ์ด (ไม่สร้างออเดอร์บน production) | F13 ไม่ R หรือ F10 ไม่เปิดเครื่องมือ propose |
| 12 | `12 ops sees no dead jobs from this run` | (ถ้ามี `E2E_ADMIN_EMAIL`+`E2E_ADMIN_PASSWORD`) ล็อกอิน admin `GET /api/v1/ops/summary` และ `GET /api/v1/ops/jobs?state=dead&limit=20` | ไม่มี dead job ที่ `createdAt` หลังเริ่มชุด · `oldestQueuedAgeSeconds` < 30 | ไม่มีบัญชี admin (skip พร้อมเหตุผล) |

กติกาของชุด: test 5–11 ใช้ visitor คนเดียวกัน (สร้างใน `beforeAll`) · ถ้า test 5 ล้ม test 6–11 ถูกตั้ง `test.skip` อัตโนมัติด้วยเหตุผล `depends on 05` (ไม่นับ pass) · ทุก test จด `annotations` (`marker`, `conversationUrl`) ลงรายงาน · สรุปท้ายชุดพิมพ์ `passed/failed/skipped` และเขียน `docs/evidence/e2e.json` · ถ้า `failed = 0` และ `passed ≥ 9` ถือว่าชุด "เขียว" (ตัวเลข 9 = เลขขั้นต่ำที่ข้อ 1–8 + ข้อใดข้อหนึ่งของ 9–12 ต้องผ่าน; ค่านี้ปรับไม่ได้โดยไม่ผ่านหัวหน้า) · `passed < 9` = "ไม่ครบ" ห้ามเรียกว่า golden path ผ่าน

### 5.2 `release:status`: รวม EVIDENCE → CSV (31 แถว)

1. **แหล่งแถว:** อ่าน `docs/FEATURE_STATUS.csv` ปัจจุบัน (แม่แบบ 31 แถว; คอลัมน์ตาม template: `feature_id, feature_name, lane, slug, owner, status, target_mode, actual_mode, provider_gate, commit_sha, tests_evidence, trace_evidence, provider_evidence, checked_at_bangkok, blocker`) · ไม่เพิ่ม/ลบแถว (ถ้าจำนวน ≠ 31 หรือมีรหัสที่ตัดออกอย่าง F19 F20 F25 F28 F29 F32 F33 F34 → fail ด้วยข้อความ)
2. **แหล่ง EVIDENCE:** ต่อแถว `slug` → ไฟล์ `server/src/features/<slug>/EVIDENCE.md`; F01 และ F35 → `server/src/core/EVIDENCE.md` (หนึ่งไฟล์สองแถว) · `slug` ของ F35 ใน CSV คือ `core/jobs`
3. **parser** (`evidence-parse.ts`): หา heading `## Status` แล้วอ่านตาราง markdown ที่มีหัวคอลัมน์ `feature_id | slug | lane | status | target_mode | actual_mode | provider_gate | commit_sha | tests_evidence | checked_at_bangkok | blocker` (ลำดับคอลัมน์ตามหัวตาราง ไม่ตามตำแหน่ง; เซลล์ `\|` = `|`) · เลือกแถวที่ `feature_id` ตรง; หลายแถว (เช่น F14 มี subrow `payments slip-vision`) → แถวหลัก = แถวที่ `slug` ตรงชื่อโฟลเดอร์ ส่วนแถวอื่นต่อท้าย `tests_evidence` เป็น `; sub: …` และ **actual_mode ของฟีเจอร์ = ค่าต่ำสุดของทุกแถว** (R > S > A > U) · section ทางเลือก `## Evidence links` บรรทัด `trace: <url|path>` และ `provider: <ข้อความ>` → ใส่คอลัมน์ `trace_evidence`/`provider_evidence` · ไม่พบไฟล์/หัวตาราง/แถว → `status=UNIMPLEMENTED`, `actual_mode=U`, `blocker='no EVIDENCE.md row'`
4. **ตรวจความจริงของแต่ละแถวที่ประกาศ R หรือ S** (ถ้าไม่ผ่านให้ลดเกรดและเขียนเหตุผลต่อท้าย `blocker` เป็น `downgraded: <reason>`; ไม่เคยยกเกรด):
   - `commit_sha` เป็น hex 7–40 ตัวและ `git cat-file -e <sha>^{commit}` ผ่าน และเป็นบรรพบุรุษของ `origin/main` (`git merge-base --is-ancestor`) ไม่งั้น → ลด R→A, S→A (เหตุผล `commit not on main`)
   - `tests_evidence` ไม่ว่าง และมีตัวเลขหรือคำว่า passed/ผ่าน อย่างน้อยหนึ่งที่ (regex `\d+\s*(passed|ผ่าน|tests?)`) ไม่งั้น → ลดเป็น A (`no test evidence`)
   - `checked_at_bangkok` ตรง `YYYY-MM-DD HH:mm` และอยู่ในวันงาน 2026-11-21 10:00–17:00 ไม่งั้น → ลดเป็น A (`bad or out-of-window checked_at`)
   - สำหรับ R: `GET /api/v1/features` ของ production (ด้วย cookie `ownerPage` หรือ admin) ไม่มีฟีเจอร์นี้ที่ `hidden=true` หรือ `placeholder=true`; ถ้า hidden หรือ placeholder → **fail ทั้งสคริปต์** (`conflict`): เจ้าของต้องแก้ EVIDENCE หรือหัวหน้าเปิดธง (สคริปต์ไม่แก้ธงเอง)
   - ฟีเจอร์ที่ `actual_mode ∈ {A, U}` ต้อง hidden บน production ถ้าเป็นฟีเจอร์ที่ `folder:true` และมีเมนู (D6): ถ้าไม่ hidden → รายงานเป็น `warning: visible but not R` และใส่ในรายการงาน §5.9 (ไม่ fail)
   - เพดานพิเศษ: F14 `actual_mode` สูงสุด S และ F18 ต้องมี `provider_evidence` ถึงจะเป็น R ตาม AGENTS ข้อ 10
5. **การเขียนผล:** `status` = ค่าใน EVIDENCE (หลังลดเกรดและ `actual_mode` ต่ำลงแต่ status ยัง DONE ให้เปลี่ยนเป็น `DOING`) · เขียน `docs/FEATURE_STATUS.csv` (UTF-8, LF, ทุกฟิลด์ quote ด้วย `"` และ escape `"` เป็น `""` เหมือนแม่แบบ) · เขียน `server/src/features/release/data/release-status.json` (ตาม §2) · เขียนตารางสรุป markdown ที่ `docs/evidence/feature-status.md` · พิมพ์จำนวน `R/S/A/U` และรายการ warning/downgrade ทุกตัวทางหน้าจอ · `--check` = ไม่เขียนไฟล์ ออกด้วย exit 1 เมื่อมี conflict หรือไฟล์ CSV ปัจจุบันไม่ตรงผลที่คำนวณ (ใช้ใน CI ของ PR สุดท้าย)
6. **ห้าม:** ห้ามแก้ตัวเลขด้วยมือ ห้ามเขียน `R` ที่ไม่มีหลักฐาน ห้ามลบแถว · รันซ้ำให้ผลเดิม (deterministic ยกเว้น `generatedAt`)

### 5.3 Timeline และตัวเลข Codex (`release:timeline`)

เป้า: ตัวเลขใน README ต้องมาจากข้อมูลที่ตรวจได้ ไม่มี "ประมาณ"

1. `BASELINE_SHA` = `git log origin/main --before="2026-11-21T10:00:00+07:00" -1 --format=%H` (ถ้าว่าง → fail ให้คนระบุด้วย `--baseline <sha>`) · `FINAL_SHA` = `git rev-parse origin/main` (หรือ `--final`)
2. Git: `commits = git rev-list --count BASELINE..FINAL` · `files/insertions/deletions` จาก `git diff --shortstat BASELINE FINAL` · ผู้เขียน = `git shortlog -sn BASELINE..FINAL`
3. GitHub (`gh`): `gh pr list --state merged --base main --limit 500 --json number,title,headRefName,author,mergedAt,additions,deletions,mergeCommit,createdAt` แล้วกรอง `mergedAt ≥ BASELINE_CUTOFF` ตัวเลข: **PR ที่ merge ทั้งหมด** · แยกตาม lane จาก `headRefName` `lane/<L>/…` · **PR แก้ข้าม lane ของ orchestrator** = `headRefName` ขึ้นต้น `fix/` (จำนวน และแยกตาม `fix/<owner-lane>/`) · PR revert (`revert`/`Revert` ในชื่อหรือ branch) · เวลา merge รายชั่วโมง (Bangkok) เป็นแถว `HH:00 → count` · PR แรก/สุดท้าย (เวลา) · ถ้า `gh` ไม่พร้อม (ไม่ล็อกอิน) → fail และบอกคนรัน `gh auth status`; **ห้ามประมาณ**
4. Tests: `npm test -- --reporter=json --outputFile=docs/evidence/vitest.json` (รันโดยคน/CI ก่อนสร้าง timeline; สคริปต์อ่านไฟล์และเก็บ `numTotalTests`, `numPassedTests`, `numFailedTests`, `numTotalTestSuites`) · Playwright: อ่าน `docs/evidence/e2e.json` (นับ expected/skipped/unexpected) และนับจำนวนไฟล์ smoke ใต้ `web/src/features/*/e2e/*.smoke.spec.ts` + `tests/e2e/*.spec.ts` · ถ้าไฟล์ผลหายหรือเก่ากว่า `FINAL_SHA` (เปรียบ mtime กับเวลา commit) → เตือน "stale" และไม่ใส่ตัวเลขลง README (ใส่ `—` พร้อมหมายเหตุ ไม่เดา)
5. บอร์ด: `gh api repos/<repo>/issues/<BOARD_ISSUE>/comments --paginate` นับโพสต์ตามชนิด (`DONE`, `FIX`, `STAGE`, `NEED`, `BLOCKED`, `LEAD:`) ด้วย regex ที่ต้นข้อความ + เวลา · `BOARD_ISSUE`/`BOARD_REPO` อ่านจาก `.env.local` (ชื่อมีอยู่ใน F01 §4: ค่าบอร์ดเป็นของสคริปต์บอร์ด) ห้ามพิมพ์ค่า token · ไม่มีค่า → ข้ามหัวข้อนี้ (ใส่หมายเหตุ ไม่ fail) · รูปแบบข้อความในบอร์ดที่ mirror มาเป็น UNCONFIRMED (§15)
6. เขียน `docs/evidence/codex-timeline.md`: ตารางเวลา merge ทุก PR (เวลา Bangkok, #PR, ชื่อ, lane/branch, ผู้เขียน, +/−, sha สั้น) เรียงเวลา · สรุปตัวเลขด้านบน · ส่วน "Orchestrator fixes" ตาราง `fix/…` ทั้งหมด (ใคร แก้อะไร ไฟล์) · ส่วน "Human corrections": รายการ PR/commit ที่ชื่อมี `fix`, `revert`, `hotfix` (ให้ C ตรวจแล้วเติมคำอธิบายมือใต้ส่วนนี้ — ตัวเลขยังมาจากสคริปต์) · ไม่มีข้อมูลส่วนตัวเกินชื่อ GitHub login
7. ไฟล์ผลรวมสำหรับ README: `docs/evidence/numbers.json` (key เป็นชื่อ placeholder เช่น `PR_COUNT`, `FIX_PR_COUNT`, `COMMITS`, `LINES_ADDED`, `TESTS_TOTAL`, `TESTS_PASSED`, `E2E_PASSED`, `E2E_SKIPPED`, `FIRST_MERGE_AT`, `LAST_MERGE_AT`, `BASELINE_SHA`, `FINAL_SHA`)

### 5.4 README generator (`release:readme`)

Template มีอยู่แล้วใน baseline: [`docs/pitch/README-TEMPLATE.md`](../pitch/README-TEMPLATE.md) (ภาษาอังกฤษ: problem, live URL, LINE QR, try-it steps, status table, architecture, safety, Codex usage, prior-work declaration) → F36 ใช้ไฟล์นั้นเป็นต้นฉบับ: slice S3 copy เป็น `scripts/release/README.template.md` แล้วแทน placeholder ด้วยค่าจาก `docs/evidence/numbers.json`, `docs/FEATURE_STATUS.csv` และ SOURCE-BASELINE (ไม่เขียนโครง README ใหม่เอง · หัวข้อในตารางข้างล่างต้องตรงกับ template ถ้าต่างให้ยึด template)

| หัวข้อ README | เนื้อหา / แหล่งข้อมูล |
|---|---|
| ชื่อ + ประโยคเดียว | Endless: ผู้ช่วยตอบแชตร้านค้าในไทย (LINE, Messenger, Instagram + หน้าเว็บทดลอง) ที่ตอบจากข้อมูลร้านจริง ยืนยันก่อนสร้างออเดอร์ และให้คนรับช่วงได้ |
| ปัญหา | ร้านเล็กตอบแชตไม่ทัน เสียยอด · แรงจูงใจจาก LINE Thailand (อ้างแหล่ง) เป็นเพียงบริบท ไม่ใช่ผลของเรา (PITCH ข้อ 7 ในไฟล์ F38 §15) |
| ลองใช้ตอนนี้ | `{{LIVE_URL}}` · ลิงก์ Demo Chat `{{LIVE_URL}}/demo-chat/s/demo-boardgame` · **QR LINE OA** รูป `docs/assets/line-qr.png` (คนใส่ไฟล์; ไม่มี = สคริปต์ fail) · บัญชีทดลองสำหรับกรรมการ: ไม่ใส่รหัสผ่านใน README (ส่งในแบบฟอร์มส่งงาน) |
| สถาปัตยกรรม | แผนภาพ mermaid (Render single Node: Express + WS + job worker + scheduler → Postgres 17 + pgvector, disk uploads, OpenAI Responses/Realtime, LINE/Meta/Google) + ย่อหน้า "งานเบื้องหลังอยู่ในตาราง `jobs`" |
| สิ่งที่ทำงานจริง | ตารางสถานะ 31 แถวจาก `release-status.json` (คอลัมน์: ฟีเจอร์, สถานะ R/S/A/U, หลักฐาน (ลิงก์ EVIDENCE), หมายเหตุ) + จำนวน `R/S/A/U` + คำอธิบายความหมาย R/S/A/U ตาม SPEC |
| ข้อจำกัดตามจริง | สร้างอัตโนมัติจากแถวที่ไม่ใช่ R (ชื่อ + เหตุผลใน `blocker`) + ข้อความคงที่: สลิปตรวจด้วย QR + กฎ + vision ไม่ได้ยืนยันกับธนาคาร · Google/Meta ใช้โหมดทดสอบ · ไม่มี multi-instance |
| ใช้ Codex อย่างไร | อธิบาย 3 คน × (1 orchestrator + 3 worker) ใน ChatGPT desktop · model GPT-6.2 Sol · spec-first · board · self-merge ผ่าน CI · **ตัวเลขจาก `numbers.json`**: PR ที่ merge `{{PR_COUNT}}` (lane `{{LANE_PR_TABLE}}`), PR แก้ข้าม lane โดย orchestrator `{{FIX_PR_COUNT}}`, commits `{{COMMITS}}`, บรรทัดเพิ่ม `{{LINES_ADDED}}`, tests `{{TESTS_PASSED}}/{{TESTS_TOTAL}}`, Playwright smoke `{{E2E_PASSED}}` ผ่าน `{{E2E_SKIPPED}}` ข้าม, PR แรก `{{FIRST_MERGE_AT}}` ล่าสุด `{{LAST_MERGE_AT}}`, ลิงก์ `docs/evidence/codex-timeline.md` · สิ่งที่คนแก้ (จาก timeline ส่วน Human corrections) |
| AI ที่ใช้ | OpenAI เท่านั้น: alias `chat/fast/strong` (ชื่อ model จาก `/build-info.models` ตอนสร้าง), embeddings, moderation, transcribe, Realtime (F30 ถ้า R); ผ่าน `model.*` ของ core เท่านั้น · ต้นทุนวันงานจาก `model_usage` ถ้า admin เรียกได้ (ไม่เดา) |
| Prior work | ย่อหน้า **แบบ A หรือ B** จาก [PITCH §7](../pitch/PITCH.md) คัดลอกคำต่อคำ (EN+TH) เลือกด้วย `--prior-work A|B` (ไม่ส่ง = fail) แทน `[BASELINE_SHA]`/`[FINAL_SHA]` จาก numbers · แบบ A ต้องมีค่า `--organizer-answer "<ข้อความ/ลิงก์>"` ไม่งั้น fail |
| รันเอง | `npm ci` · `.env.local` จาก `.env.example` · `npm run db:migrate && npm run db:seed` · `npm run dev` · `npm test` · `npm run e2e` (คำสั่งจริงจาก `package.json` ที่ตรวจด้วยสคริปต์ว่ามีอยู่) |
| ทีม | ชื่อ/login จาก `--team "<ชื่อ>:<login>,…"` (ไม่ส่ง = ละหัวข้อ) |
| License / ข้อมูล | ข้อมูลทั้งหมดสังเคราะห์; ไม่มีข้อมูลลูกค้าจริง |

กฎ: ค่าจาก placeholder ที่ไม่มีข้อมูล (`numbers.json` ขาด key) → fail ไม่เติม "N/A สีเขียว" · ตัวเลขใน README ต้องตรง `numbers.json` ทุกตัว (test เทียบ) · `release:readme:check` fail เมื่อพบ `{{`, `[VERIFY`, `REPLACE_`, `TODO`, `TBD`, `lorem` ใน README.md · วันที่/เวลาทั้งหมดเป็น Asia/Bangkok

### 5.5 `release:verify` (ตรวจ candidate บน production)

อินพุต: `--sha <candidate>` (default = `git rev-parse origin/main`) · `--url` (default `E2E_BASE_URL`) · ลำดับ:
1. รอ deploy: poll `GET /build-info` ทุก 15 วินาที สูงสุด 8 นาที จน `sha` ขึ้นต้นด้วย candidate (ไม่ถึง → fail `deploy not live`; ไม่เปรียบเทียบด้วยเวลา)
2. `GET /readyz` ต้อง 200 ติดกัน 3 ครั้ง (ห่าง 2 วินาที)
3. รัน `npm run e2e -- golden-path` (ตั้ง `E2E_EXPECT_SHA=<sha>`) จับ exit code + `docs/evidence/e2e.json`
4. ตรวจ `GET /api/v1/features` ไม่มี conflict เบื้องต้น (ฟีเจอร์ที่ placeholder และ `visible=true` บน production = ผิด ควรเป็น false ตาม F01)
5. ถ้าชุดเขียว (§5.1: failed 0 และ passed ≥ 9) → เขียน `docs/evidence/last-green.json` (`sha`, เวลา, passed/skipped) และเพิ่มบรรทัดใน `docs/evidence/release.md` ส่วน "Verifications" · ไม่เขียวก็เพิ่มบรรทัดพร้อมข้อ (ลำดับ test) ที่ล้ม · พิมพ์สรุปและ exit code 0/1
6. `docs/evidence/release.md` (เขียนโดยสคริปต์ทุกครั้ง): candidate SHA, เวลา Bangkok, schema (`/build-info.schema`), `modelMode`, `providerModes`, ผล e2e (ตัวเลข), rollback target (ค่า `last-green.json` ก่อนหน้า candidate นี้), ลิงก์ workflow run (ถ้ามี), ข้อสังเกตที่คนเติมมือในส่วน "Notes" (สคริปต์ไม่เขียนทับส่วนนี้)

### 5.6 Integration check บน CI (`.github/workflows/release-check.yml`)

Trigger: `workflow_dispatch` (กดจาก Actions) + `push` ของ tag `release-*` · จุดประสงค์: พิสูจน์ว่า clone สะอาด + DB ว่าง build และรันได้ (บทเรียน "live ≠ git": build ที่ demo ต้องมาจาก commit ที่ push แล้ว)

```yaml
name: release-check
on: { workflow_dispatch: {}, push: { tags: ['release-*'] } }
jobs:
  clean-boot:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env: { POSTGRES_PASSWORD: ci, POSTGRES_DB: nless_ci }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      NODE_ENV: production
      DATABASE_URL: postgres://postgres:ci@localhost:5432/nless_ci
      SESSION_SECRET: ci-session-secret-ci-session-secret-0001
      TOKEN_ENCRYPTION_KEY: Y2ktdG9rZW4tZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=
      APP_BASE_URL: http://localhost:3000
      MODEL_MODE: fake
      UPLOAD_DIR: ./var/uploads
      PORT: '3000'
      BUILD_SHA: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run db:migrate
      - run: npm run db:seed
      - name: boot and probe
        run: |
          npm run start &
          for i in $(seq 1 30); do curl -fsS localhost:3000/healthz && break || sleep 2; done
          curl -fsS localhost:3000/readyz
          curl -fsS localhost:3000/build-info | tee build-info.json
          grep -q "$GITHUB_SHA" build-info.json
          curl -fsS localhost:3000/api/v1/features -o /dev/null -w "%{http_code}\n" | grep -q 401
```

หมายเหตุ: ชื่อสคริปต์ `build`, `start`, `typecheck`, `db:migrate`, `db:seed` ต้องตรงกับ `package.json` ที่ F01 สร้าง (ตรวจตอน S4: ถ้าชื่อต่างให้แก้ workflow ไม่ใช่ F01) · ค่า `TOKEN_ENCRYPTION_KEY` ด้านบนคือค่าทดสอบสังเคราะห์สำหรับ CI เท่านั้น (ไม่ใช่ secret จริง; base64 ของ 32 ไบต์: ตรวจความยาวตอนรัน) · `MODEL_MODE=fake` ตั้งให้ชัดเพราะไม่มีคีย์ · `/api/v1/features` ไม่ล็อกอิน → 401 เป็นผลที่คาดหวัง (พิสูจน์ว่า auth ทำงานใน production build)

### 5.7 หน้า `/release` และ `conflicts`

`computeConflicts(rows, flags)`:
- `claims_R_but_hidden`: `actualMode='R'` และ flag `hidden=true`
- `R_but_placeholder`: `actualMode='R'` และ `placeholder=true` (route เดียวคือ placeholder ตาม registry)
- `hidden_not_listed`: ฟีเจอร์ `hidden=true` ในธง แต่ไม่มีแถวในไฟล์ (ไฟล์เก่า)
- `stale` = `generatedFromSha !== build.sha` (production ไม่มี git จึงเทียบสตริงเท่านั้น) · หน้า UI แสดงสองค่าเป็นข้อมูลสีน้ำเงิน (info) "สถานะสร้างจาก commit อื่น" ไม่ใช่ error เพราะ PR roll-up มักตามหลัง commit อื่นเล็กน้อย · การตัดสินว่าข้อมูลเก่าเกินไปทำโดย `release:status:check` ใน CI และตอน `release:verify` (เทียบ `generatedFromSha` กับ `FINAL_SHA`)

### 5.8 ตรวจ claim ต้องห้าม (`release:claims`)

สแกน `README.md`, `docs/submission/**`, `docs/pitch/**` (ไม่รวมส่วนอ้างอิง "ห้ามพูด" ที่อยู่ในบล็อกที่ขึ้นต้น `<!-- claims:ignore -->` ถึง `<!-- /claims:ignore -->`) และสตริงใน `web/src/**/i18n/*.json` ที่ตรง pattern · ผิด = exit 1 พร้อมไฟล์:บรรทัด

| ห้ามอ้าง | pattern (ไม่สนตัวพิมพ์) | เหตุผล |
|---|---|---|
| ยืนยันสลิปกับธนาคาร | `ยืนยัน(กับ)?ธนาคาร`, `bank[- ]verified`, `verified (by|with) (the )?bank` | F14 ตรวจ QR + กฎ + vision ไม่ได้ต่อธนาคาร (AGENTS ข้อ 10) |
| exactly-once | `exactly[- ]once` | outbox ของเราเป็น at-least-once + `unknown` ตามจริง |
| production scale/SLA | `99\.\d+%`, `enterprise[- ]grade`, `ล้านข้อความ`, `scales? to` | ไม่มีหลักฐาน |
| ช่องทางนอก scope | `whatsapp`, `line history`, `ประวัติ line` | ถูกตัดออก |
| กฎหมาย/ความปลอดภัยที่ไม่ได้ตรวจ | `pdpa[- ]compliant`, `gdpr`, `soc ?2`, `iso ?27001`, `ผ่านการรับรอง` | ไม่ได้ทำ |
| ขายใน ChatGPT / OpenAI | `(ขาย|listed|live) (ใน|on|in) chatgpt`, `openai (อนุมัติ|approved|partner)`, `ชำระเงิน(ใน|ผ่าน) chatgpt`, `agentic checkout` | F39 ส่งออกไฟล์รูปแบบ ACP และ MCP เท่านั้น ไม่ผ่านการอนุมัติ ไม่มี checkout |
| AI อื่น | `gemini`, `bedrock`, `llama`, package AI อื่นที่ไม่ใช่ `openai` ใน `package.json` (ยกเว้นคำว่า "Codex") | ใช้ OpenAI เท่านั้น |
| ผลลัพธ์ธุรกิจที่ไม่ได้วัด | `เพิ่มยอดขาย \d+%`, `ลด(เวลา|ต้นทุน) \d+%`, `\d+x faster` | ไม่มีข้อมูลจริง (ตัวเลขผลกระทบมาจาก F27 เท่านั้น และต้องอ้างว่าเป็นข้อมูลเดโมสังเคราะห์) |
| ทุกอย่างเสร็จ | `100% (complete|เสร็จ)`, `ครบทุกฟีเจอร์`, `fully (complete|production)` | ตารางสถานะต้องตรงความจริง |
| สถานะที่ไม่ตรง CSV | ตาราง R/S/A/U ใน README ไม่ตรง `release-status.json` | ตรวจเทียบอัตโนมัติ |

### 5.9 Release checklist (ไทม์ไลน์ 15:15–17:00, ผู้รับผิดชอบ = C + C0)

| เวลา | ทำ | ผ่านเมื่อ |
|---|---|---|
| 15:15 | F36 เริ่ม: commit WIP ของ F39 พัก · แตก branch `lane/C1/release` · S1 | — |
| 15:30 | `LEAD: FREEZE` · โพสต์ `STATUS C1 F36 A "golden-path พร้อม รอ roll-up"` | golden-path.spec merge แล้ว และ `release:verify` รันได้ |
| 15:35 | `release:verify` รอบแรกบน main ปัจจุบัน | บันทึกผลลง `release.md` (ล้ม = โพสต์ `FIX TO:<lane>` ตามข้อที่ล้ม) |
| 15:50 | merge slice สุดท้ายของ worker (ตาม AGENTS ข้อ 11) · ฟีเจอร์ที่ไม่ถึง R ต้องถูกซ่อนด้วย `/ops` (แท็บ features: ปุ่ม "ซ่อนทั้งหมดที่ยังไม่ได้สร้าง" + เลือกที่เหลือ) | `GET /api/v1/features` ไม่มี A/U ที่ visible |
| 15:55 | `release:status` รอบแรก → PR `docs: roll-up feature status` | 31 แถว, conflict = 0 |
| 16:00 | `release:verify` หลังซ่อนฟีเจอร์ + ตรวจมือ 5 นาทีบนมือถือ (Demo Chat, inbox, LINE OA ส่งข้อความ 1 ข้อ) | เขียว + มือผ่าน |
| 16:15 | `release:timeline` → `release:readme` (ต้องมี QR, prior-work A/B, ทีม) → `release:claims` | README ผ่าน `--check` และ claims = 0 |
| 16:30 | `release:status` รอบสุดท้าย (หลัง EVIDENCE รอบสุดท้ายของทุก lane 16:15) + `release:pack` | `SUBMISSION.md` ไม่มี `MISSING` หรือรู้ว่าอะไรขาด |
| 16:40 | candidate สุดท้าย: merge PR roll-up/README → `release:verify --sha <final>` → จด `last-green.json` → dispatch `release-check.yml` | ทั้งสองเขียว |
| 16:45 | **deploy freeze**: คนปิด Auto-Deploy ใน Render (UNCONFIRMED ชื่อเมนู §15) · ประกาศ `LEAD: FREEZE` ซ้ำถ้าจำเป็น · ห้าม merge เข้า main (ยกเว้นหัวหน้าสั่งแก้ production ล่ม) | `/build-info.sha` = final |
| 16:45–17:00 | ส่งงาน (ลิงก์ repo, URL, QR, วิดีโอ, สไลด์) ตาม `SUBMISSION.md` · จดเวลาส่งและเลขใบรับ (ถ้ามี) ใน `release.md` | ส่งแล้ว |

### 5.10 Rollback

เงื่อนไขตัดสิน (หัวหน้าหรือ C0/C ตัดสินเอง): หลัง merge production **พัง** (test 1–5 ของ golden path ล้ม, `/readyz` ไม่ 200 เกิน 3 นาที, หรือ migration ทำให้ข้อมูลหาย) และแก้ไปข้างหน้าไม่ได้ใน 10 นาที
1. **กู้เร็ว (ไม่แตะ git):** Render dashboard → service → **Events / Deploys** → เลือก deploy ล่าสุดที่เป็น `last-green.json.sha` → ปุ่ม **Rollback** (ชื่อปุ่ม/ตำแหน่ง UNCONFIRMED: ยืนยันตอนทำ deploy ครั้งแรก S9 ของ F01 และจดภาพหน้าจอ/ชื่อเมนูใน EVIDENCE.md) · ตรวจ `/build-info.sha` = SHA เขียวล่าสุดและ `/readyz` 200
2. **กันไม่ให้ deploy กลับมาพัง:** ทันทีหลัง rollback ปิด Auto-Deploy (ไม่งั้น merge ถัดไปหรือ commit เดิมถูก deploy ทับ) · แล้วทำ `gh pr revert <PR ต้นเหตุ>` (หรือ `git revert` บน branch `fix/<lane>/revert-…`) merge เข้า main หลังผ่าน CI · เปิด Auto-Deploy กลับเมื่อ main = เขียว · โพสต์บอร์ด `FIX TO:<lane> <ไฟล์> <วิธี reproduce>` และ `BLOCKED` ถ้าต้องหยุดทีม
3. **ฐานข้อมูล:** rollback โค้ดไม่ย้อน migration → กติกา: migration หลัง 14:00 ต้อง **additive** (เพิ่มตาราง/คอลัมน์ nullable/ดัชนี ห้าม drop/rename/ใส่ NOT NULL ที่ไม่มี default) เพื่อให้โค้ดเก่าทำงานกับ schema ใหม่ได้ · ถ้า migration เสียข้อมูลจริง: ไม่มี point-in-time restore ที่เราตรวจแล้ว (Render Postgres PITR: UNCONFIRMED ขึ้นกับแผน) → ใช้ `demo:reset` ให้ข้อมูลเดโมกลับ (ข้อมูลธุรกิจเดโมเป็นสังเคราะห์ทั้งหมด)
4. หลัง rollback `release:verify --sha <green>` ต้องเขียวอีกครั้งก่อนประกาศว่ากู้แล้ว · บันทึกเหตุการณ์ (เวลา, SHA ที่พัง, SHA ที่กู้, สาเหตุ) ใน `release.md` ส่วน "Incidents" ตามจริง

### 5.11 ชุดส่งงาน (`release:pack` → `docs/submission/SUBMISSION.md`)

สร้างเอกสารเช็กลิสต์พร้อมค่า (ไม่มี secret):

| รายการ | แหล่ง | MISSING เมื่อ |
|---|---|---|
| ลิงก์ repo (สาธารณะหรือเชิญกรรมการ) | `git remote get-url origin` (+ `--repo-public yes|no`) | ไม่ระบุ visibility |
| URL production + SHA ที่รัน | `/build-info` | `sha` ไม่ตรง `release.md` final |
| QR LINE OA | `docs/assets/line-qr.png` มีอยู่ และชื่อ OA จาก `--line-oa-name` | ไม่มีไฟล์ |
| ดู demo (บัญชีกรรมการ) | `--judge-login "<อีเมลบัญชีสังเคราะห์>"` (รหัสผ่านไม่ลงไฟล์; ส่งทางแบบฟอร์ม) | ไม่ระบุ |
| วิดีโอ demo 2–3 นาที | `docs/submission/demo.mp4` หรือ `--video-url` | ไม่มี (รูปแบบการส่งเป็น UNCONFIRMED) |
| สไลด์ ~6 หน้า | `docs/submission/deck.pdf` หรือ `--deck-url` | ไม่มี |
| README + ตารางสถานะ | `README.md` ผ่าน `--check` | ไม่ผ่าน |
| Prior-work declaration | แบบที่เลือก + `[BASELINE_SHA]`/`[FINAL_SHA]` | ไม่ระบุ |
| FEATURE_STATUS.csv | 31 แถว ตรง `release-status.json` | ไม่ตรง |
| `release.md` มี verification เขียวของ final SHA | `last-green.json.sha = FINAL_SHA` | ต่างกัน |

สคริปต์พิมพ์รายการ `MISSING` และ exit 1 ถ้ามี (ไม่เติมค่าปลอม)

## 6. AI calls

ไม่มี AI call ใน F36 เอง · golden-path ข้อ 5–11 ใช้ AI จริงของ production ผ่านผลิตภัณฑ์ (ไม่เรียก OpenAI จากสคริปต์) ค่าใช้จ่ายต่อรอบ ≈ 6 turn ของ `ai.reply` (ดู `model_usage` ที่ `/ops`/F27: จดต้นทุนจริงต่อรอบใน `release.md` ถ้า admin ดึงได้; ไม่เดา) · คาดว่า ≤ US$0.05 ต่อรอบ (UNCONFIRMED จนวัดจริง) · เพดานรันชุดเต็ม: ≤ 10 รอบตลอดวัน

## 7. UI

Route `/release` · `web/src/features/release/pages.tsx` · route `auth: 'platform_admin'` · เมนู `{ path:'/release', labelKey:'release:menu.title', group:'admin', icon:'RocketLaunchOutlined', order:90, platformAdminOnly:true, searchTerms:['release','status','evidence','สถานะ','หลักฐาน'] }` · หน้า `ReleasePage.tsx` เดียว:

1. `PageHeader` "สถานะการปล่อยงาน" + บรรทัดข้อมูล build (SHA ย่อ, env, schema, โหมด model) + ปุ่ม "คัดลอก SHA"
2. `Alert` ตามเงื่อนไข: ไม่มีข้อมูลสถานะ → warning "ยังไม่ได้สร้างข้อมูลสถานะ (npm run release:status)" · `conflicts.length > 0` → error แสดงรายการ · `generatedFromSha ≠ build.sha` → info "สถานะสร้างจาก commit {{a}} ส่วน build ที่รันอยู่คือ {{b}}"
3. `SectionCard` สรุป: นับ R / S / A / U (4 ชิป สีตาม `StatusChip`) · เวลาที่สร้าง (Asia/Bangkok) · last green SHA + เวลา
4. `SectionCard` ตาราง `DataTable` 31 แถว: ฟีเจอร์ (รหัส + ชื่อ), lane, tier, สถานะ (`StatusChip` R/S/A/U + ข้อความ), เป้า, ธง (เมนู: แสดง/ซ่อน/ยังไม่ได้สร้าง), หลักฐาน (ลิงก์ `EVIDENCE.md` และ commit เปิดแท็บใหม่), หมายเหตุ/blocker/เหตุผลที่ถูกลดเกรด · ตัวกรอง สถานะ/lane · เรียงด้วยรหัส
5. `SectionCard` "ผล golden path ล่าสุด": จาก `lastGreen` (SHA, เวลา, จำนวน passed/skipped) — ถ้าไม่มี แสดง `EmptyState` "ยังไม่เคยรัน release:verify" (ไม่แสดงเขียวเปล่า)
6. ลิงก์ไปยัง `/ops` และไฟล์ `docs/evidence/codex-timeline.md` (GitHub)
7. states: loading (skeleton ของตาราง), error = `EmptyState` + ลองใหม่, ไม่มี mutation ใดในหน้านี้ (อ่านอย่างเดียว) จึงไม่มีปุ่มที่ไม่ทำงาน

i18n (namespace `release`):

| key | th | en |
|---|---|---|
| `menu.title` | Release | Release |
| `page.title` | สถานะการปล่อยงาน | Release status |
| `page.subtitle` | สถานะจริงของทุกฟีเจอร์จากหลักฐานในแต่ละโฟลเดอร์ | Real status of every feature, from the evidence in each folder |
| `build.sha` | commit ที่รันอยู่ | Running commit |
| `build.copy` | คัดลอก SHA | Copy SHA |
| `build.schema` | schema | Schema |
| `build.mode` | โหมด AI | AI mode |
| `alert.none` | ยังไม่ได้สร้างข้อมูลสถานะ (รัน npm run release:status) | No status data yet (run npm run release:status) |
| `alert.conflicts` | พบข้อมูลที่ขัดกัน | Conflicting data found |
| `alert.other_sha` | สถานะสร้างจาก commit {{generated}} ส่วน build ที่รันอยู่คือ {{running}} | Status was generated from commit {{generated}}; the running build is {{running}} |
| `conflict.claims_R_but_hidden` | {{id}} บอกว่า R แต่ถูกซ่อนจากเมนู | {{id}} says R but is hidden from the menu |
| `conflict.R_but_placeholder` | {{id}} บอกว่า R แต่ยังเป็นหน้า placeholder | {{id}} says R but is still a placeholder |
| `conflict.hidden_not_listed` | {{id}} ถูกซ่อนแต่ไม่มีแถวสถานะ | {{id}} is hidden but has no status row |
| `summary.title` | สรุป | Summary |
| `summary.generatedAt` | สร้างเมื่อ | Generated at |
| `summary.lastGreen` | ตรวจผ่านล่าสุด | Last verified green |
| `mode.R` | ทำงานจริง | Real |
| `mode.S` | Sandbox | Sandbox |
| `mode.A` | Adapter | Adapter |
| `mode.U` | ยังไม่ทำ | Not built |
| `table.title` | ฟีเจอร์ทั้งหมด | All features |
| `table.feature` | ฟีเจอร์ | Feature |
| `table.lane` | Lane | Lane |
| `table.tier` | Tier | Tier |
| `table.status` | สถานะ | Status |
| `table.target` | เป้า | Target |
| `table.menu` | เมนู | Menu |
| `table.evidence` | หลักฐาน | Evidence |
| `table.note` | หมายเหตุ | Note |
| `menu.visible` | แสดง | Visible |
| `menu.hidden` | ซ่อน | Hidden |
| `menu.notBuilt` | ยังไม่ได้สร้าง | Not built |
| `downgraded` | ลดจาก {{from}}: {{reason}} | Downgraded from {{from}}: {{reason}} |
| `golden.title` | ผล golden path ล่าสุด | Latest golden path |
| `golden.passed` | ผ่าน {{passed}} · ข้าม {{skipped}} | Passed {{passed}} · skipped {{skipped}} |
| `golden.empty` | ยังไม่เคยรัน release:verify | release:verify has not run yet |
| `links.ops` | เปิดหน้า /ops | Open /ops |
| `links.timeline` | Timeline ของ Codex | Codex timeline |
| `error.retry` | ลองใหม่ | Retry |

## 8. Jobs, schedules, events

ไม่มี job, schedule, realtime event หรือ notify · audit: ไม่มี (หน้าอ่านอย่างเดียว) · สคริปต์ทำงานนอก server

## 9. Seed และ fixtures

- ไม่มี seed · golden-path ใช้ SEED ของ SPEC §5 (ร้าน A `demo-boardgame`, ร้าน B, สินค้า `A-GAME-01` ราคา 1,490 บาท, `A-SOLD-01` หมดสต็อก, marker `TENANT_B_ONLY_OWL_482`) · ข้อมูลที่เทสต์สร้างบน production = ลูกค้าเดโมที่ displayName `ผู้ทดลอง xxxx` (หายหลัง `demo:reset`) ไม่แตะร้าน B ยกเว้น check 3 (อ่านอย่างเดียว) และ 7 (ถามจากฝั่ง A)
- fixtures ของ test สคริปต์ (สร้างด้วยโค้ดใน test): ไฟล์ `EVIDENCE.md` สังเคราะห์ 10 แบบ (ถูกต้อง, ไม่มีตาราง, sha ไม่ใช่ hex, sha ไม่อยู่ใน main (ใช้ repo git ชั่วคราวใน `os.tmpdir()` ที่ `git init` ใน test), ไม่มี tests_evidence, หลายแถว subrow, `\|` ในเซลล์, วันที่นอกหน้าต่าง) · ผล `gh` และ `git` จำลองด้วย `execFile` stub (ไม่เรียกเครือข่าย) · `numbers.json` ตัวอย่าง

## 10. Tests

Unit (`scripts/release/*.test.ts` อยู่ใน include ของ vitest root ตาม F01 §10.1 และ `server/src/features/release/*.test.ts`):

| ไฟล์ | case |
|---|---|
| `evidence-parse.test.ts` | อ่านแถวที่ถูกต้องตามหัวตาราง (สลับคอลัมน์ได้) · เซลล์มี `\|` · ไม่มีไฟล์/ตาราง/แถว → `UNIMPLEMENTED`/`U` + blocker · หลายแถว (F14) ใช้ต่ำสุดของโหมด · `## Evidence links` ถูกอ่านเป็น trace/provider · F01 และ F35 ใช้ไฟล์ `core/EVIDENCE.md` เดียวกันและได้คนละแถว |
| `status.test.ts` | R + sha ถูก + tests + เวลาในหน้าต่าง → R คงเดิม · sha ไม่ใช่บรรพบุรุษของ main → A + `downgraded` · ไม่มี tests_evidence → A · เวลานอกหน้าต่าง → A · S ที่ sha ผิด → A · ไม่เคยยกเกรด (A ที่ตั้ง `actual_mode=R` ไม่ถูกแตะ ถ้าหลักฐานครบจึงผ่านตามที่เขียน) · R ที่ hidden บน production → fail (exit 1) · A/U ที่ visible → warning ไม่ fail · F14 ที่เขียน R → จำกัดที่ S · F18 R ไม่มี provider evidence → ลด · CSV ที่เขียน: 31 แถว, คอลัมน์/ลำดับตาม template, quote ถูก, LF, ไม่มี BOM · จำนวนแถว ≠ 31 หรือมีรหัสที่ตัด → fail · รันซ้ำให้ผลเท่าเดิม · `--check` ไม่เขียนไฟล์และ exit 1 เมื่อ CSV ปัจจุบันไม่ตรง |
| `timeline.test.ts` | คำนวณตัวเลขจาก JSON ของ `gh` (stub): จำนวน PR, แยก lane, นับ `fix/` และแยก owner-lane, revert, เวลา merge รายชั่วโมงตาม Asia/Bangkok (ขอบเขต 09:59/10:00) · PR ก่อน baseline ถูกตัด · ไม่มี `gh` → fail ไม่เดา · vitest.json เก่ากว่า FINAL → `—` + เตือน · `numbers.json` มีทุก key |
| `readme.test.ts` | เติมครบ ไม่มี `{{` · key ขาด → fail · `--prior-work` ไม่ส่ง → fail · แบบ A ไม่มี organizer answer → fail · ไม่มี `line-qr.png` → fail · ตารางสถานะใน README = `release-status.json` ทุกแถว · ตัวเลข Codex ตรง `numbers.json` · `--check` จับ `[VERIFY`, `REPLACE_`, `TODO` |
| `claims.test.ts` | ทุก pattern ในตาราง §5.8 จับได้ (ตัวอย่างบวก) · ข้อความปลอดภัยไม่ถูกจับ ("ไม่ได้ยืนยันกับธนาคาร" อยู่ในบล็อก ignore ถึงไม่ถูกจับ; นอกบล็อกต้องไม่ใช้คำว่า ยืนยัน(กับ)ธนาคาร) · บล็อก `claims:ignore` ทำงาน |
| `conflicts.test.ts` | R+hidden, R+placeholder, hidden ที่ไม่มีแถว, ไม่มี conflict |
| `routes.test.ts` (supertest) | `GET /release/status` โดย owner A → 403 · ไม่ล็อกอิน → 401 · admin → 200 ตาม schema · ไม่มีไฟล์ JSON → `rows: []` + `generatedAt: null` · ผลมี `build.sha` ตรง `/build-info` · ไม่มี key ที่ชื่อมี secret/token |
| `pack.test.ts` | ขาดไฟล์ QR/วิดีโอ → รายการ MISSING + exit 1 · ครบ → exit 0 · ไม่มีรหัสผ่านในไฟล์ที่เขียน |
| `verify.test.ts` | poll `/build-info` จนตรง SHA (นาฬิกาปลอม + fetch stub) · timeout 8 นาที → fail · `readyz` ไม่ครบ 3 ครั้งติด → fail · ชุด e2e failed 0 และ passed 8 → "ไม่ครบ" exit 1 · passed 9 → เขียน `last-green.json` · ล้ม → ไม่เขียน `last-green.json` |

Web: `web/src/features/release/release.test.tsx` — ไม่มีข้อมูล → alert none · conflict แสดงเป็น error · แถว R แสดงชิปและลิงก์ evidence · ไม่มีปุ่มที่ไม่ทำงาน

Playwright:
- `tests/e2e/golden-path.spec.ts` = 12 checks ใน §5.1 (production-safe: visitor ใหม่ทุกรอบ ไม่สร้างออเดอร์ ไม่แตะร้าน B ยกเว้นอ่านข้อ 3)
- `web/src/features/release/e2e/release.smoke.spec.ts` (ตาม convention ของแต่ละฟีเจอร์): ถ้ามี `E2E_ADMIN_EMAIL`+`E2E_ADMIN_PASSWORD` → ล็อกอิน admin เปิด `/release` เห็นตาราง 31 แถว และ SHA เท่ากับ `/build-info` · owner A เรียก `GET /api/v1/release/status` → 403 · ไม่มีบัญชี admin → ส่วนหน้า skip พร้อมเหตุผล (ส่วน 403 ยังรัน)

## 11. Acceptance: R ตาม D6

- [ ] `golden-path.spec.ts` merge แล้ว และรันกับ production ได้ผล `failed 0, passed ≥ 9` บน SHA ที่ส่ง (ตัวเลข passed/skipped จดตามจริง; skip ไม่นับ pass)
- [ ] `release:status` สร้าง `docs/FEATURE_STATUS.csv` 31 แถวจาก EVIDENCE ของจริง: ทุกแถว R/S มี SHA บน main + test + เวลา; conflict = 0; แถวที่ลดเกรดมีเหตุผล; ไม่มีแถวของฟีเจอร์ที่ตัดออก
- [ ] ฟีเจอร์ที่ไม่ใช่ R ถูกซ่อนบน production (ตรวจจาก `GET /api/v1/features`) หรือรายงานเป็น warning ที่หัวหน้ารับรู้
- [ ] README สร้างจาก template ผ่าน `--check`: URL จริง, QR จริง, prior-work, ตารางสถานะตรง CSV, ตัวเลข Codex ตรง `numbers.json`, ข้อจำกัดตามจริง · `release:claims` = 0
- [ ] `codex-timeline.md` + `release.md` มี SHA, schema, modes, rollback target, เวลา Bangkok จริง
- [ ] `/release` ทำงานบน production (admin เท่านั้น), แสดงสถานะตรง CSV, ไม่มีปุ่มเปล่า · Playwright smoke ผ่าน (หรือ skip พร้อมเหตุผลเมื่อไม่มีบัญชี admin และบันทึกข้อนี้ใน EVIDENCE.md)
- [ ] `release-check.yml` รันเขียว 1 ครั้งบน final SHA (clone สะอาด + DB ว่าง)
- [ ] ซ้อม rollback บน Render อย่างน้อยอ่านเมนูจริง + จด SHA เขียวล่าสุดไว้ (ไม่จำเป็นต้องกดจริง ถ้าไม่จำเป็น) · deploy freeze 16:45 ปฏิบัติจริง
- [ ] loading/empty/error, i18n th/en, ตรวจ permission (`platform_admin`), unit + route tests ผ่าน
- **S**: สคริปต์ทำงานแต่ golden-path < 9 passed หรือ README ยังมี placeholder · **A**: มีเฉพาะ CSV จาก EVIDENCE โดยไม่มี verify บน production · ห้ามประกาศ R ถ้า `release:verify` ไม่เขียวบน final SHA

## 12. Security และ privacy

- `/release` และ `GET /release/status` เฉพาะ `platform_admin` (ข้อมูลไม่มี secret แต่มี URL ภายในของ repo และ SHA) · ไม่มีเส้นทางเขียน · ไม่มี upload
- สคริปต์ใช้ `E2E_*` และ `gh` ของเครื่องคน: ห้ามพิมพ์ค่า token/รหัสผ่านใน log, `docs/evidence/*`, README, `SUBMISSION.md` (สคริปต์ redact ด้วย `redactText` ของ F35 ที่ import ผ่านสำเนาตรรกะ ไม่ import server code ข้าม workspace: ใช้ regex ชุดเดียวกันใน `scripts/release/lib/redact.ts`)
- `docs/submission/SUBMISSION.md` ห้ามมีรหัสผ่านบัญชีกรรมการ (ส่งทางแบบฟอร์มของผู้จัด) ห้ามมีค่าใน `..\nless.secrets.env` หรือ `.env*`
- golden-path บน production สร้างข้อมูลสังเคราะห์เท่านั้น (visitor ใหม่ + marker) ไม่ใช้ข้อมูลลูกค้าจริง ไม่ยืนยันออเดอร์ ไม่ส่งข้อความหาลูกค้า LINE จริงของผู้อื่น (check 8–10 ใช้ช่อง web เท่านั้น; การทดสอบ LINE OA ด้วยมือของคนใช้บัญชีของทีม)
- rate limit: ชุด golden-path ส่ง ≤ 1 turn/12 วินาที ต่ำกว่าเพดาน visitor ของ F09 (6/นาที) และไม่กินเพดานร้านต่อวัน (`DEMO_CHAT_DAILY_TURN_CAP`): ตรวจตัวเลขก่อนรันหลายรอบติด
- `release-check.yml`: ค่า env ใน workflow เป็นค่าทดสอบสังเคราะห์ ห้ามใส่ secret จริง (OpenAI key ไม่ถูกใช้: `MODEL_MODE=fake`)
- ไฟล์ `release-status.json` บน server ไม่มีอีเมล/เบอร์/ชื่อบุคคลนอกเหนือ lane และ login GitHub ที่เปิดเผยอยู่แล้ว

## 13. Edge cases

| กรณี | ผลที่ต้องได้ |
|---|---|
| ไม่มี `EVIDENCE.md` ของฟีเจอร์ | แถว `UNIMPLEMENTED`/`U` พร้อม blocker `no EVIDENCE.md row` ไม่ลบแถว ไม่ fail |
| เจ้าของเขียน R แต่ฟีเจอร์ยังเป็น placeholder บน production | `release:status` fail (conflict) · หัวหน้า/เจ้าของแก้ก่อน roll-up |
| ฟีเจอร์ R แต่ถูกซ่อนด้วยมือ | conflict เหมือนกัน (ต้องเปิดหรือแก้เป็น A) |
| `gh` ไม่ได้ล็อกอิน หรือเน็ตหลุดระหว่าง timeline | fail พร้อมข้อความ ไม่ใส่ตัวเลขเดา · รันซ้ำได้ |
| ผลทดสอบ vitest เก่า | ตัวเลข `—` พร้อมเตือน ไม่ผ่าน `readme --check` จนกว่าจะรันใหม่ |
| Render deploy ช้ากว่า 8 นาที | `verify` fail `deploy not live` · ดู log Render · ไม่ประกาศผ่าน |
| AI ตอบช้า > 45 วินาทีใน check 5 | ล้ม check 5 (ไม่ retry เงียบ ๆ); รันซ้ำได้หนึ่งครั้งด้วยมือถ้าสงสัย provider · บันทึกทั้งสองครั้งใน `release.md` (ไม่ซ่อนครั้งที่ล้ม) |
| Demo Chat เพดานรายวันเต็ม | check 5 ล้มด้วยข้อความ `daily_cap`: ตั้ง `DEMO_CHAT_DAILY_TURN_CAP` เพิ่มชั่วคราวใน Render หรือรัน `demo:reset` · ห้ามปรับโค้ดให้ข้ามเพดาน |
| ฟีเจอร์ F11/F13 ยังไม่ R | check 9–11 skip พร้อมเหตุผล ตัวนับ `skipped` เพิ่ม · ถ้า passed < 9 ชุด "ไม่ครบ" |
| มี PR merge หลัง roll-up | `release:status:check` ใน CI ของ PR นั้นล้ม (CSV ไม่ตรง) หรือหน้า `/release` แสดงสอง SHA ต่างกัน: รัน roll-up ใหม่ (merge ได้เฉพาะ PR ที่แก้ไฟล์สถานะ หลัง 16:15) |
| deploy freeze แล้วพบบั๊ก | หัวหน้าตัดสิน: แก้เฉพาะ production ล่ม · ไม่งั้นบันทึกใน README ข้อจำกัด และโพสต์ `BLOCKED` |
| `FINAL_SHA` ต่างจากที่ production รัน | `verify` fail; `pack` MISSING · อย่าส่งจนกว่าตรงกัน |
| prior-work แบบ A แต่ผู้จัดยังไม่ตอบ | ใช้แบบ B (ตาม PITCH ข้อ 7) · สคริปต์ไม่รับ A โดยไม่มีคำตอบเป็นข้อความ |
| ทีมอยากใส่ตัวเลขผลกระทบทางธุรกิจ | `claims` จับ · ใช้ตัวเลขจาก F27 เท่านั้น พร้อมข้อความ "ข้อมูลเดโมสังเคราะห์" |

## 14. Build order (slices ≤ 45 นาที)

| Slice | เวลา | ส่งมอบ |
|---|---|---|
| **S1 golden-path + verify** (15:15–15:30 ต้อง merge) | 25 | `tests/e2e/golden-path.spec.ts` (12 checks, skip rules, json reporter) · `scripts/release/{verify.ts, config.ts, lib/*}` + test `verify.test.ts` · npm scripts · รันครั้งแรกกับ production จด `release.md` (**สิ่งที่ C0/หัวหน้ารอ**) · แท็ก test id ที่ขาดให้ `FIX TO:A1` ทันที |
| **S2 roll-up สถานะ** | 35 | `evidence-parse.ts`, `status.ts`, `lib/csv.ts`, สร้าง `release-status.json` + CSV + `docs/evidence/feature-status.md` · tests parse/status/conflicts · เรียกใช้จริงรอบแรกที่ 15:55 และส่ง PR roll-up · คำสั่ง `--check` ต่อ CI (เพิ่ม step ใน `pr-check.yml` ของ F01 ผ่าน PR ของ C1 ได้เพราะ `.github/**` เป็นของ C1) |
| **S3 หน้า /release + README + timeline** | 45 | `server/src/features/release/*` (route, service, conflicts, ลบ placeholder route) · `ReleasePage` + i18n + web test · `timeline.ts` + `numbers.json` · `README.template.md` + `readme.ts` · tests timeline/readme/routes · Playwright smoke |
| **S4 claims + pack + CI + ซ้อมจริง** | 35 | `claims.ts`, `pack.ts`, `.github/workflows/release-check.yml` · tests claims/pack · รัน checklist §5.9 ตั้งแต่ 16:15: roll-up สุดท้าย, README, claims, pack, verify final, `release-check` · อัปเดต `server/src/features/release/EVIDENCE.md` และ `server/src/core/EVIDENCE.md` สถานะ F36 ตามจริง |

ลำดับ: S1 ก่อน 15:30 เสมอ (ไม่ว่า F35/F39 ถึงไหน: ถ้า F39 ยังไม่จบให้ commit WIP แล้วพัก) · ถ้าเวลาไม่พอให้ตัด S4 ส่วน `pack.ts` เหลือ checklist มือ แต่ห้ามตัด `claims.ts` และห้ามตัด `--check` ของ `status`

## 15. UNCONFIRMED และสิ่งที่ต้องตรวจในวันงาน

1. ปุ่ม/เมนู **Rollback** ของ Render (ชื่อ, ตำแหน่ง, ย้อนได้ไกลแค่ไหน) และเมนู **Auto-Deploy** (ปิดได้ที่ไหน) ยังไม่ยืนยัน: ตรวจใน Render dashboard ตอน S9 ของ F01 (ทำร่วมกับคน C ที่ถือบัญชี Render) แล้วแก้ข้อความ §5.9–5.10 ให้ตรง
2. แผน Postgres บน Render มี point-in-time recovery หรือไม่: ตรวจ dashboard (ไม่ถือว่ามี)
3. test id และขั้นตอนใน UI ของ F09/F11 (ปุ่มยืนยันบนการ์ด, composer ของพนักงาน, การเปิดเธรดจากรายการ): ตรวจโค้ดจริงของ A1 ตอนเขียน S1 และปรับ selector; ถ้าขาด test id ใด โพสต์ `FIX TO:A1` ทันที (ข้อ 8–11)
4. สูตรชื่อลูกค้า `ผู้ทดลอง <4 ตัวท้ายของ visitorId>` ใน F09 ใช้ได้กับ check 8: ตรวจรูปแบบ cookie `nless_demo_visitor` (`base64url(visitorId).iat.sig`) ใน F09 §5.7
5. ตัวเลขใน `numbers.json` ที่ขึ้นกับรูปแบบบอร์ด (ข้อความที่ mirror เป็น GitHub issue comment ขึ้นต้นด้วย `[<LANE>/Codex]` ตาม prompt): ตรวจรูปแบบจริงตอนรัน timeline ถ้า regex ไม่ตรงให้ข้ามหัวข้อบอร์ดแล้วบอกใน `release.md`
6. รูปแบบการส่งงานของผู้จัด (ฟอร์ม/อีเมล, ต้องมีวิดีโอหรือไม่, กำหนด 17:00 จริงหรือไม่): UNCONFIRMED ตามเอกสารวิจัย: ตรวจตอน registration 08:30 แล้วปรับ `SUBMIT_DEADLINE` และรายการ §5.11
7. (ปิดแล้ว) `docs/pitch/README-TEMPLATE.md` มีอยู่ใน baseline: F36 ใช้เป็นต้นฉบับของ README ตาม §5.4
8. จำนวน test ใน vitest ต่อ lane ที่นับเป็น "unit + route" กับ Playwright ที่นับเป็น smoke ตามที่ README อ้าง: ใช้ผลดิบ ไม่แยกชนิดเองนอกจากแยกตามไฟล์ `.smoke.spec.ts`
9. เส้นทาง `/release` สำหรับกรรมการ: ตาม F01 เป็น `platform_admin` เท่านั้น (กรรมการเปิดไม่ได้) · ข้อมูลไม่มีความลับ จึงเสนอให้หัวหน้าพิจารณาเปิดเป็น `auth: 'none'` แบบอ่านอย่างเดียวถ้าต้องการให้กรรมการเห็นสถานะในเว็บ (ทางเลือกที่ไม่ต้องเปลี่ยนโค้ด: ตารางสถานะอยู่ใน README อยู่แล้ว)
10. `npm run start` / `build` / `typecheck` / `db:migrate` / `db:seed` ในไฟล์ workflow ต้องตรงกับ `package.json` ของ F01: ตรวจตอน S4; `TOKEN_ENCRYPTION_KEY` ตัวอย่างต้อง decode เป็น 32 ไบต์ (ตรวจด้วย `node -e` ก่อน commit)
11. Playwright ล็อกอิน admin ต้องการ `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (ตัวแปรใหม่ ยังไม่อยู่ใน `.env.example`): C1 เพิ่มใน `.env.example` ตอน S1 · ถ้ายังไม่มีรหัสผ่าน admin บน production (F02 ยังไม่ merge หรือไม่ได้ตั้ง) ให้ check 12 และส่วน admin ของ smoke skip พร้อมเหตุผล
