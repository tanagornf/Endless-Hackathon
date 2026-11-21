# SPEC สำหรับสร้าง Endless ใหม่ครบทุกระบบ

> **อัปเดต 20 พ.ย. 2569 (ค่ำ):** ใช้คู่กับ `PLAN.md` ฉบับค่ำ 20 พ.ย. และ `docs/DECISIONS-2026-11-20.md` D1–D17 (scope **31 ฟีเจอร์**, 12 Codex sessions = orchestrator 3 + worker 9, tier P0–P3) layout แบ่งตามฟีเจอร์ (`server/src/core`, `server/src/features/<slug>`, `web/src/features/<slug>`, `shared/features/<slug>`) · **สร้างจาก build spec ของเราเองใน `docs/specs/` ไม่เปิดโค้ดของระบบเดิม** (`../papi-ref` ปิด เว้นแต่หัวหน้าโพสต์ `LEAD: PAPI-REF OPEN`) · ช่องทางมีแค่ LINE, Facebook Messenger, Instagram และ Demo Chat บนเว็บ · AI ทุกอย่างใช้ OpenAI API ผ่าน `model.*` ของ core ตาม `docs/openai-api.md` · ไม่มีแพ็กเกจและโควตา · ฟีเจอร์เป็น R เมื่อผ่าน production bar (ข้อ 10) บน production URL จริง

C1 setup (`prompts/C1-setup.md` ข้อ 0.2) copy แม่แบบนี้เป็น `SPEC.md` ที่ root ของ repository แข่งใหม่ (สำเนาเดิมยังอยู่ที่ `docs/competition-plan/templates/SPEC.md` สองไฟล์ต้องเหมือนกัน) ใช้ร่วมกับ `AGENTS.md`, `contracts.ts`, `prompts/` และ `docs/FEATURE_STATUS.csv` เอกสารนี้เป็น requirement สำหรับลงมือสร้างในวันแข่งขัน ไม่ใช่ implementation ที่ทำไว้ล่วงหน้า

## 1. เป้าหมายและขอบเขต

คำอธิบายผลิตภัณฑ์ฉบับเต็ม (Endless คืออะไร ใครใช้ แต่ละหน้าจอ พฤติกรรมของ AI และเกณฑ์ "ดี") อยู่ใน `docs/PRODUCT.md` ทุก session อ่านก่อนเริ่มงาน

สร้างแพลตฟอร์ม AI front desk สำหรับธุรกิจขึ้นใหม่จาก repository ที่ไม่มี implementation เดิม ครอบคลุมตัวตน ธุรกิจหลายแห่ง ความรู้ แชต ทีม การขาย การจอง ช่องทาง LINE/Messenger/Instagram, CRM การตลาด รายงานและต้นทุน เสียง และความน่าเชื่อถือ ทั้ง **31 ฟีเจอร์** ในตารางข้อ 6 อยู่ในขอบเขตเดียวกัน ไม่มีการเปลี่ยนเป้าหมายให้เหลือเพียง chatbot หรือ checkout

ID ที่ตัดออกจาก scope แล้ว (F19 F20 F25 F28 F29 F32 F33 F34) เลิกใช้ ไม่เลื่อนเลข ไม่มีโฟลเดอร์ ไม่มีแถว และไม่ต้องรายงาน: ไม่มีแพ็กเกจ/โควตา/billing ของร้าน, หน้า terms/privacy/consent/data export-delete, ฟอร์มลูกค้า, help/support/feedback, หน้า platform admin, การนำเข้าประวัติแชตเดิม และช่องทางอื่นนอกจาก LINE, Messenger และ Instagram

ผู้ใช้หลักคือเจ้าของร้านและพนักงานที่ต้องตอบลูกค้า รับออเดอร์ จองบริการ และติดตามผลในระบบเดียวกัน โดย AI ใช้ข้อมูลที่ร้านอนุมัติและส่งต่องานให้คนได้ ผลงานต้องแสดงว่าข้อมูลและการทำงานของทุกโมดูลเชื่อมกันจริง

ช่วงสร้างผลงานสำหรับงานประเทศไทยคือ **21 พฤศจิกายน 2569 เวลา 10:00–17:00 น. Asia/Bangkok** การเตรียมเครื่อง เอกสาร และข้อมูลตัวอย่างแยกจากการเขียน implementation ในวันงาน ต้องบันทึก baseline และรายการสิ่งที่นำเข้ามาก่อนแข่งขันตามกติกาที่ผู้จัดยืนยัน

คำว่า “ครบทุกระบบ” ต้องรายงานด้วยผลตรวจของทุก ID ด้านล่าง การมีเมนูครบไม่ทำให้ระบบที่ไม่มี backend/การบันทึก/ผลตรวจกลายเป็นเสร็จ และการสร้าง source ใหม่ได้ไม่รับรอง production reliability หรือการอนุมัติจาก provider ทุกแห่งภายใน 7 ชั่วโมง

## 2. ข้อกำหนด baseline และที่มาของโค้ด

1. repository แข่งไม่ commit source, migrations, assets, DB dumps หรือ credentials ของระบบเดิม และ **ไม่มี session ไหนเปิดโค้ดของระบบเดิม**: ทุกฟีเจอร์สร้างจาก build spec ใน `docs/specs/` ที่ทีมเขียนด้วยคำของตัวเอง (`../papi-ref` เปิดได้เฉพาะเมื่อผู้จัดยืนยันเป็นลายลักษณ์อักษรและหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` ถึงตอนนั้นก็อ่านอย่างเดียว) ไม่มีการเรียก backend หรือ DB เดิมเบื้องหลังเพื่อสาธิตว่าเป็นระบบใหม่
2. ของที่นำเข้า repo แข่งตอน 10:00 และประกาศเป็น prior work ใน README: เอกสารวางแผน, build spec, prompt, `contracts.ts` (types และ spec ไม่มี implementation), สคริปต์บอร์ด และ Codex hooks/config · ไม่นำเข้าโค้ดทดลองก่อนงาน (`tools/openai-check`) · third-party dependencies, เครื่องมือ และ templates ต้องระบุที่มา/รุ่น/สิทธิ์ใช้งานตามที่ทีมตรวจไว้
3. implementation ของ web/API/features/schema/tests เริ่มในช่วงแข่งขัน มี commit/log/diff ที่ตรวจตามได้ ไม่สร้างแกนแอปก่อนงานแล้วนำมาอ้างว่าเพิ่งสร้าง
4. ใช้ข้อมูลสังเคราะห์ทั้งหมดและ test assets ที่ทีมตั้งใจเตรียม ไม่มีข้อความลูกค้า เบอร์โทร รูปสลิป เอกสารลับ หรือข้อมูล production
5. ไม่ publish repository เป็น public โดยอัตโนมัติ ทีมต้องเลือก visibility ตามสิทธิ์ที่มีและข้อกำหนดส่งงาน ข้อมูลในแม่แบบนี้ตั้งใจให้เป็น generic ไม่มี private source references
6. ก่อน 17:00 ต้องส่ง source/build ที่ทดสอบแล้ว พร้อมสถานะครบทั้ง 31 ฟีเจอร์ แม้บางส่วนยังไม่ผ่าน ห้ามลบแถวที่ทำไม่ทัน

## 3. รูปแบบระบบและเจ้าของ

ใช้หนึ่ง root npm project, TypeScript, React/Vite, Node API ตัวเดียว และ PostgreSQL ถาวร โดย Node เสิร์ฟ production web build กับ `/api/v1` origin เดียวกัน มี durable jobs/outbox ในฐานข้อมูลและ worker ที่อยู่ใน topology เดียวกับที่ทดสอบ

| เจ้าของ | พื้นที่ | ผลที่ต้องส่ง |
|---|---|---|
| C1 | `server/src/core/**`, `web/src/core/**`, `shared/core/**`, root configs/scripts/CI, `.codex/**`, `.github/**`, `tests/e2e/**`, `docs/evidence/**`, `docs/FEATURE_STATUS.csv` และโฟลเดอร์ F36 `release` | DB, config, base schema, auth guard, jobs/outbox (F35), model wrapper ของ OpenAI, channel registry, loaders, integration, build และ demo release (F36) |
| ทุก lane (A1–C3) | `server/src/features/<slug>/**`, `web/src/features/<slug>/**`, `shared/features/<slug>/**` ของฟีเจอร์ใน lane ตัวเอง (คอลัมน์ `lane`/`slug` ใน backlog และ `FEATURES` ใน `contracts.ts`) | หน้าเว็บ, API, migrations, seed, tests และ `service.ts` ของฟีเจอร์นั้น ครบ loading/error/permission/status ตามจริง |
| Orchestrator (A0, B0, C0) | ไม่มีโฟลเดอร์ของตัวเอง · แก้ข้าม lane ได้เฉพาะบน branch `fix/<lane เจ้าของ>/<slug>` ตามกติกา D5 ใน `AGENTS.md` ข้อ 8 | มอบงาน (`TASK`), ตรวจงานที่ merge แล้วเทียบกับ spec, integration + production smoke, `STAGE` ทุก 30 นาที · C0 ตรวจ CORE-LOOP GATE 13:00 บน production |

เจ้าของตาม lane (PLAN.md ฉบับค่ำ 20 พ.ย.): C1 = F01, F35, F39, F36 · C2 = F17, F18, F21 · C3 = F04, F03, F02, F31 · B1 = F05, F07, F08, F37 · B2 = F10, F38, F30 · B3 = F06, F26, F27 · A1 = F09 (+ Demo Chat), F11, F12, F23 · A2 = F13, F14, F22 · A3 = F24, F15, F16 ไม่มีฟีเจอร์ไหนมีเจ้าของสองคน · แบบสร้างของแต่ละฟีเจอร์: `docs/specs/<ID>-<slug>.md`

Routes และหน้าเว็บโหลดอัตโนมัติจาก `features/*/routes.ts` และ `features/*/pages.tsx`; เรียกข้ามฟีเจอร์ผ่าน `service.ts` เท่านั้น และใช้บริการของ core (`getUser`, `db`, `jobs`, `model`, `sendToCustomer`) browser ไม่ import server implementation หรือ model secrets (หน้า F30 ได้แค่ client secret ชั่วคราวที่ core ออกให้) การแบ่งโมดูลไม่บังคับแยก Lambda หรือ publish npm package หากฟีเจอร์ของ lane อื่นยังไม่พร้อมให้ใช้ fake ใน `service.ts` ตาม contract เดิมและรายงานสถานะไว้

หนึ่ง task มี owner, allowed paths, dependencies, contract, acceptance, mode และผลส่งมอบ เมื่อจะเปลี่ยนพื้นที่คนอื่นหรือ shared contract ต้อง handoff ให้เจ้าของเดิมก่อน ไม่แก้พร้อมกันเพียงเพราะเห็นบอร์ดว่าว่าง

## 4. สถานะที่ทุกคนใช้ร่วมกัน

| Mode | เกณฑ์ |
|---|---|
| **R — Real** | แอปใหม่รันพฤติกรรมจริงและบันทึก state จริงครบ acceptance; ส่วนที่ต้องใช้ external provider มีหลักฐานจากปลายทางของ environment ที่ระบุ; ไม่ใช่คำรับรอง production SLA |
| **S — Sandbox** | UI/API/DB และ flow ภายในรันจริงครบ แต่ external effects ใช้ simulator ที่ติดป้ายชัด และมีผลรันให้ตรวจ; provider test APIที่เรียกจริงมีหลักฐานครบเป็นRกับenvironment=test |
| **A — Adapter** | มี interface/config/stub/fixture/replay อย่างเดียว หรือยังไม่มีหลักฐาน flow ครบ; ไม่นับว่าระบบนั้นเสร็จ |
| **U — Unimplemented** | ยังไม่สร้าง มีเพียง placeholder หรือยังไม่มีผลตรวจ; ไม่นับว่าเสร็จ |

Standalone event replay, prerecorded voice หรือหน้าแสดง canned results เป็น A/showcase จนกว่าจะต่อและรัน acceptance ของระบบครบ การมี simulator ที่ตอบ success โดยไม่ผ่านกฎ/การบันทึกไม่ใช่ S ที่ผ่าน

`docs/FEATURE_STATUS.csv` เริ่ม **status=UNIMPLEMENTED และ actual_mode=U ทุกแถว** ค่า target เป็นแผนเท่านั้น เปลี่ยนผลจริงหลังมี commit+tests+trace; ห้ามเติม PASS, วันที่ตรวจ หรือ provider reference ที่ยังไม่มี ค่า A/U ต้องมีเหตุผลหรือ next action โดยไม่ซ่อนแถว

Feature ที่มีหลายส่วนให้บันทึกย่อย เช่น “auth=R, email=S”, “product codes=R, external live=A” ไม่สรุปให้ทั้งหมดเป็น R เพราะส่วนเดียวผ่าน ถ้าใช้ test endpoint ของ provider แม้ request ถึง provider จริงให้ระบุว่า provider test mode เพื่อไม่ปนกับ production payment/delivery

## 5. ข้อมูลสังเคราะห์สอง tenant ที่ทุกคนใช้ร่วมกัน

C1 สร้าง seed ของตารางกลาง (tenants, users, memberships) ตอน setup และเจ้าของฟีเจอร์เพิ่ม seed ของตารางตัวเองในโฟลเดอร์ฟีเจอร์ตามสเปกนี้ ค่า alias เป็นชื่อสำหรับมนุษย์และ fixtures; primary key จริงให้ generator ของระบบใหม่สร้าง แล้วคืน alias→ID map ห้ามใช้ชื่อ alias เป็นหลักฐานสิทธิ์ผู้เรียก

### Tenant A และ Tenant B

| ข้อมูล | Tenant A | Tenant B |
|---|---|---|
| account/business alias | `account_demo_a` / `biz_demo_a` | `account_demo_b` / `biz_demo_b` |
| ชื่อ | Demo Boardgame Shop | Demo Repair Studio |
| timezone | Asia/Bangkok | Asia/Bangkok |
| owner | `owner.a@example.test` | `owner.b@example.test` |
| staff | `staff.a@example.test` | `staff.b@example.test` |
| ลูกค้าสังเคราะห์ | A Customer One (LINE), A Customer Two (Messenger) | B Customer One (LINE), B Customer Two (Instagram) |
| source marker สำหรับทดสอบ scope | `TENANT_A_ONLY_FOX_731` | `TENANT_B_ONLY_OWL_482` |
| policy fixture | รับคืนสินค้าที่ยังไม่แกะภายใน 7 วัน | รับคืน kit ที่ยังไม่แกะภายใน 14 วัน |
| แหล่งข้อมูล | products.csv, faq.txt, policy.txt ของ A | products.csv, faq.txt, policy.txt ของ B |

Policy เป็นข้อมูลร้านสมมติสำหรับทดสอบ ไม่ใช่คำแนะนำทางกฎหมาย ชื่อ email ใช้โดเมนทดสอบและไม่มีผู้รับจริง ไม่ใส่เบอร์โทรหรือบัญชีธนาคารจริงใน seed รหัสผ่าน/session/keys ตั้งระหว่างงานใน environment ทดสอบ ไม่ commit credentials

ให้มี platform admin ทดสอบอีกหนึ่ง identity แยกจาก owner ทั้งสองร้าน ใช้เปิดเครื่องมือ ops ของ F35 (`/ops`) เท่านั้น ไม่มีหน้าแอดมิน Staff A เริ่มด้วยสิทธิ์อ่านแชต/สินค้า/ออเดอร์และตอบแชตได้ แต่แก้ราคา/สมาชิก/ตั้งค่าร้านไม่ได้ แล้วมีกรณี owner เพิกถอนสิทธิ์ระหว่าง session

### Catalog และราคาเริ่มต้น

ทุกจำนวนเงินเป็น THB integer หน่วยสตางค์ ไม่ใช้ floating point เป็น authoritative total

| Business | SKU/alias | ชนิด | ราคา minor | พร้อมขาย | หมายเหตุ |
|---|---|---|---:|---:|---|
| A | `A-GAME-01` | product | 149000 | 5 | เกมตัวอย่าง มี variant Standard |
| A | `A-CARD-01` | product | 9900 | 8 | ชุดการ์ดตัวอย่าง |
| A | `A-SOLD-01` | product | 50000 | 0 | ต้องถูกปฏิเสธว่า sold out |
| A | `A-SERVICE-01` | service | 50000 | ตาม slot | สอนเล่นเกม 30 นาที resource A1 capacity 1 |
| B | `B-KIT-01` | product | 39000 | 2 | repair kit ตัวอย่าง |
| B | `B-SERVICE-01` | service | 60000 | ตาม slot | บริการตั้งค่าอุปกรณ์ 30 นาที resource B1 capacity 1 |

กติกาค่าส่ง A: subtotal ต่ำกว่า 200000 เก็บ 10000, ตั้งแต่ 200000 ขึ้นไปส่งฟรี กติกาค่าส่ง B: flat 5000 เฉพาะสินค้าที่จัดส่ง

ตัวเลขสำหรับตรวจร่วม:
- A-GAME-01 จำนวน 2: subtotal 298000 + shipping 0 = **298000 minor หรือ 2,980 บาท**
- A-CARD-01 จำนวน 2: subtotal 19800 + shipping 10000 = **29800 minor หรือ 298 บาท**
- B-KIT-01 จำนวน 1: subtotal 39000 + shipping 5000 = **44000 minor หรือ 440 บาท**
- หลังสร้าง quote ให้แก้ A-GAME-01 เป็น 159000/version ใหม่ แล้วลองยืนยัน quote เก่า ต้อง conflict/requote ไม่คิดราคาหรือ stock เก่าเงียบ ๆ

### Knowledge, conversations และเวลา

1. แต่ละร้านมีอย่างน้อยหนึ่ง active/index-ready FAQ, หนึ่ง draft ที่ยังห้ามค้น, หนึ่ง inactive/deleted record, สอง folders และ marker ของร้านตัวเอง
2. แต่ละร้านมีหนึ่ง conversation ที่ AI ดูแล และอีกหนึ่งที่ staff รับช่วง มี messages ที่อ้าง order/booking ได้หลัง flow สร้างจริง ไม่ seed order สำเร็จแล้วเอามานับว่า AI สร้าง
3. ชุดข้อมูลมีข้อความไทย อังกฤษ และ SKU ผสมไทย เพื่อทดสอบ retrieval/language: **seed เป็นสองภาษาในตัว** (knowledge ของสองร้านมีประโยคไทยตามด้วยประโยคอังกฤษในเนื้อหาเดียวกัน และสินค้าทุกตัวมี `nameEn`) กรรมการถามภาษาไหนก็ได้คำตอบถูก · ข้อมูลที่ร้านเพิ่มเองภาษาเดียวตอบข้ามภาษาได้ด้วยการค้นข้ามภาษาของ F07 (§5.4a); ถาม marker ของ B จาก A ต้องไม่คืนข้อความของ B
4. ใช้ clock fixture `2026-11-21T03:00:00Z` (10:00 Bangkok) สำหรับ unit/integration deterministic tests ส่วนแอป interactive ใช้ server clock จริง
5. Slot ทดสอบของร้าน A วันที่ 22 พฤศจิกายน 2569 เวลา 10:00–10:30 Bangkok มี capacity 1 (ร้าน B ปิดวันอาทิตย์ จึงใช้วันจันทร์ 23 พฤศจิกายน 10:00–10:30 ตาม `SEED.slots`); สอง confirmation แข่ง slot เดียวต้องได้ผลไม่เกิน capacity
6. Marketing consent fixture (opt-in/opt-out ของ broadcast ที่ F24 เก็บ ไม่ใช่ legal consent) มีลูกค้าหนึ่งราย granted และอีกราย revoked; revoked ต้องถูกข้ามแม้เคยอยู่ใน broadcast preview
7. Provider event fixtures แยก business/channel/provider refs และ generation อย่างชัดเจน ไม่มี event จาก provider จริงใน seed

## 6. Functional requirements ครบ 31 ฟีเจอร์

ตารางนี้คือ acceptance ขั้นต่ำของทุกระบบ การลดความลึกเป็น sandbox/adapter ต้องคงแถวและรายงาน mode; ไม่เปลี่ยนชื่อระบบเพื่อซ่อนงานที่ยังไม่ทำ คอลัมน์ lane/tier ตาม PLAN.md ฉบับ 20 พ.ย. (P0 ต้องเป็น R ทัน gate 13:00, P1–P3 เปิดตาม `LEAD: OPEN`)

| ID | lane · tier | ระบบ | สิ่งที่ต้องสร้าง | การตรวจรับขั้นต่ำ |
|---|---|---|---|---|
| F01 | C1 · P0 | **ฐานโปรเจกต์และการรัน** | โปรเจกต์ใหม่ root scripts, React web, Node API, PostgreSQL, migrations/seed, health/build info และ model wrapper ของ OpenAI (`model.*` มี fake mode) | fresh clone ติดตั้ง/build ได้; DB ว่าง migrate+seed ได้; readiness ตรวจ DB/schema จริง; restart ข้อมูลยังอยู่; ทุก model call เขียน `model_usage` |
| F02 | C3 · P1 | **ตัวตนและ session** | สมัคร เข้าสู่ระบบ ออกจากระบบ session expiry และ reset password โดย server เป็นผู้ยืนยันตัวตน (แทน dev login โดยไม่เปลี่ยน `getUser()`) | ผู้ใช้ใหม่เข้าได้; logout/expiry ใช้ token ต่อไม่ได้; reset token หมดอายุ/ใช้ซ้ำไม่ได้; email อยู่ sandbox จนมี delivery receipt |
| F03 | C3 · P0 | **บัญชี ธุรกิจ สมาชิก และสิทธิ์** | แยก account/business/membership; เชิญ/รับ/ปฏิเสธ; owner/staff; สิทธิ์ server-side (platform admin เป็นแค่ flag ของ user สำหรับ ops ของ F35) | ผู้ใช้ร้าน A อ่าน/เขียนทรัพยากร B ไม่ได้; staff read-only เขียนถูกปฏิเสธ; revoke มีผล request ถัดไป |
| F04 | C3 · P0 | **การตั้งค่าธุรกิจ** | ข้อมูลร้าน เวลาทำการ timezone ภาษา tone นโยบาย ความสามารถที่อนุญาต และ AI on/off | save→reload คงค่า; บทสนทนาใหม่ใช้ค่าที่บันทึก; ปิด AI แล้ว inbound ยังบันทึกแต่ไม่ให้ AI ตอบเอง |
| F05 | B1 · P0 | **คลังความรู้และวงจรข้อมูล** | CRUD/folders, draft/review/active/inactive/delete, revision, index readiness (embeddings ผ่าน `model.embed`) และตรวจเนื้อหาที่ร้านอัปโหลดด้วย `model.moderate` | draft/deleted/indexไม่พร้อมไม่ถูกใช้ตอบ; activate มีผลใน query ใหม่; ทุก read/write จำกัด tenant |
| F06 | B3 · P1 | **นำเข้าและสกัดข้อมูล** | ข้อความ + CSV ก่อน (R) แล้ว parse CSV/XLSX/PDF ดิจิทัลเองในเครื่อง แล้วสกัดด้วย `model:'fast'` ผ่าน import jobs; URL import ด้วย fetch ของเราเอง + SSRF guard เมื่อ test SSRF ผ่าน; PDF สแกน/Office/Google Docs เป็น stretch | ข้อความ+CSV ทำงานจริง; progress/error/source revision; ไฟล์เสีย/URLไม่อนุญาตหรือชี้ internal ไม่สร้างข้อมูล active; ส่วนที่ไม่พร้อมคง A หรือ S ตามผลจริง |
| F07 | B1 · P0 | **ค้นคืน RAG และประเมิน revision** | lexical/semantic strategy ที่ระบุชัด (embeddings `text-embedding-3-large` 1536 มิติชุดเดียวทั้ง document และ query, pgvector cosine; rerank ถ้าทำใช้ `model:'fast'`), chunk/source citations, before/after, publish/rollback และ quality cases | คำถามไทย/อังกฤษ/SKU คืน source ถูก scope (คำถามอังกฤษเจอ knowledge ที่เขียนไทย); inactive ของ A และ source B ไม่หลุด; revisionที่ใช้ตอบตรวจกลับได้; threshold จูนใหม่กับ fixture ของข้อ 5; retrieval score ไม่อ้างเป็นคำตอบถูกทั้งหมด |
| F08 | B1 · P0 | **Catalog สินค้า/บริการ/variants** | ชื่อ/SKU ตัวเลือก หน่วย จำนวนพร้อมขาย canonical price/currency/version และ sold-out | ราคาเป็น integer หน่วยย่อยจาก DB; quantityต้องเป็นบวก; variantผิด/หมดขายปฏิเสธ; แก้ราคาทำให้ version เปลี่ยน |
| F09 | A1 · P0 | **Inbox และประวัติ** | customer/channel normalization (`web`, `line`, `facebook`, `instagram`), conversations/messages, cursor, attachments references, live refresh และ Demo Chat บนเว็บ | send→persist→refreshยังอยู่; history paginationไม่ซ้ำ/ข้าม; ข้อความสองร้านแยก; provider eventซ้ำไม่สร้าง messageใหม่ |
| F10 | B2 · P0 | **AI turn และเครื่องมือ** | OpenAI ผ่าน `model.*` ของ core (`model:'chat'`, classifier/extraction `model:'fast'` + strict schema, retry ด้วย `'strong'` ได้ 1 ครั้ง), grounded context, **ตอบภาษาเดียวกับลูกค้า (ไทย/อังกฤษ) ตัดสินทุกข้อความ**, bounded tools (≤4 call)/time/output, proposals/guards, ตอบก่อนแล้วเสนอพนักงาน (handoff-offer), ปิดเลขบัตรก่อนส่งให้ model/trace และ model usage | คำถามใหม่ได้ผลจาก source ทั้งเมื่อถามไทยและถามอังกฤษ; ใช้ข้อความลูกค้าลดราคา/ข้ามสิทธิ์ไม่ได้; timeoutไม่สร้าง side effect; duplicate turnไม่เรียกซ้ำโดยไม่มีเหตุผล; เลขบัตรไม่อยู่ใน input ของ model หรือ trace; FetchMatchXG อยู่ adapter annex ไม่กลายเป็นข้อมูลค้าขาย |
| F11 | A1 · P0 | **ทีมและ human handoff** | รับช่วง/คืน AI (ส่วน takeover ต้องทัน gate), assignment, availability, weekly schedule, notes/mentions และ idle policy | takeoverแล้ว AI หยุด; staff ส่งตามสิทธิ์; noteไม่ถูกส่งให้ลูกค้า; stale assignmentเกิด conflict; scheduleใช้ Asia/Bangkok |
| F12 | A1 · P2 | **Rich messages และ templates** | text/image/file/cards/action blocks, saved/reordered templates, translate (`model:'fast'`), suggested reply และ upload ownership + `model.moderate` | template save/reloadได้; suggestionไม่ส่งเอง; translationไม่แก้ต้นฉบับ; foreign upload/HTMLไม่ปลอดภัยถูกปฏิเสธ; deliveryสถานะไม่ปลอม |
| F13 | A2 · P1 | **Commerce และ orders** | cart, immutable quote/proposal, explicit consent, order items/totals, staff edits/cancel/shipping/delivery | quoteจากcanonicalprice; confirmซ้ำได้orderเดียว; ราคา/stockเปลี่ยนต้องขอยืนยันใหม่; stale staff editไม่ทับ; reloadแล้วorderอยู่ |
| F14 | A2 · P1 | **QR การชำระและตรวจสลิป** | payment request, PromptPay QR ที่สร้าง payload เอง (ไม่มี Omise), อ่านสลิปด้วย OpenAI vision (`model:'chat'` + รูป `detail:'high'` → strict schema) แล้วตรวจในโค้ด: ยอดตรงออเดอร์, ผู้รับตรงร้าน, `bankRef` ไม่ซ้ำ; ไม่มั่นใจหรือไม่ตรง → staff กดยืนยัน (`SLIP_VERIFY_MODE=vision`) | QRสร้างได้ไม่แปลว่าจ่ายแล้ว; สลิปปลอม/ยอดผิด/receiverผิดไม่เป็นpaid; `bankRef` ซ้ำไม่จ่ายสอง order; สลิปที่ไม่ชัดไป staff; ตรวจสลิปได้สูงสุด **S** (ไม่ได้ยืนยันกับธนาคาร) ห้ามอ้างว่าตรวจกับธนาคารแล้ว |
| F15 | A3 · P2 | **Booking และ reminders** | service/resource/duration/capacity/closures, availability, proposal/confirm, reschedule/cancel/status/waitlist/reminder | สองคำขอแย่งslotสุดท้ายสำเร็จเพียงcapacityที่อนุญาต; ไม่bookก่อนconsent; cancel/rescheduleไม่ส่ง reminderรุ่นเก่า; จัดเก็บ UTCแสดง Bangkok |
| F16 | A3 · P2 | **Google Calendar** | connection/grant/busy lookup และ create/update/cancel event โดย sync state แยกจาก local appointment | local bookingไม่หายเมื่อproviderล่ม; pending/errorเห็นชัด; retryไม่สร้างeventซ้ำ; Rต้องเปิดตรวจeventของtestcalendarได้ |
| F17 | C2 · P0 | **LINE** | connect/status/revoke, signature webhook, normalized inbound, reply/push/cards, quota ข้อความของ LINE OA และ delivery receipt | signatureผิดปฏิเสธ; eventซ้ำตอบครั้งเดียว; Rต้องมี test OA รับข้อความจริง (ภายใน checkpoint 14:30); capture viewer/replayอย่างเดียวไม่เรียก R |
| F18 | C2 · P1 | **Facebook และ Instagram** | Meta developer app ของทีมแบบ development mode + app roles/test users (ไม่ต้อง app review หรือ business verification), Page/Professional account selection, signed webhook, media/outgoing, disconnect และ provider-specific restrictions (หน้าต่าง 24 ชม.) | ตรวจ signature/dedup/scope; connectionที่ถูกเพิกถอนส่งไม่ได้; **R** = ส่ง/รับจริงกับบัญชีทดสอบทั้ง Messenger และ Instagram; simulator ครบ flow = S; replay อย่างเดียว = A |
| F21 | C2 · P2 | **Comment-to-DM** | post/live keyword rules, negative phrases, private/public reply, jobs, uncertain send reconciliation และ composer restrictions | commentเดียวสร้างprivate-replyครั้งเดียว; ไม่สนใจไม่match; customerยังไม่ตอบไม่ปลดข้อจำกัดเอง; timeoutแสดงunknownจนตรวจได้ |
| F22 | A2 · P2 | **Live commerce และ product codes** | code→item/variant, quantities, notes, sold-out, live carts, code generator และ fullscreen presentation | A12x2แมปสินค้าถูกพร้อมcanonicalprice; assignmentเปลี่ยนแล้วnoteเก่าเขียนทับไม่ได้; presentationอ่านcodefactsชุดเดียวกับchat; external liveยังแยกmode |
| F23 | A1 · P2 | **Broadcast และ audiences** | tags/segments, audience preview/snapshot, explicit send confirmation, scheduling/batches และ per-recipient results | previewแสดงผู้รับจริงในscope; confirmก่อนenqueue; recipient dedup; revoked/นอกwindowต้องskip; pendingไม่เท่ากับsent; มี Sถ้าไม่ได้ส่งprovider |
| F24 | A3 · P1 | **CRM และ tags automation** | profile/contact/source/history, manual tags, automation rules, inactivity, segment membership และ marketing consent (opt-out ของ broadcast) | profilepersist; automationไม่ลบmanualtag; refreshเห็นผล; scopeถูกต้อง; tagที่โมเดลเดาแสดงเป็นinferred |
| F26 | B3 · P2 | **Insights และ summaries** | rolling summary (`model:'fast'`)/intent/sentiment/keywords/segments และ insights (`model:'chat'`) ด้วย strict schema, message-range evidence และ structured output jobs | ตัวเลข/summaryอ้าง message range; malformed/failed modelไม่เขียนข้อมูลมั่ว; ไม่ถือ summaryเป็นสิทธิ์หรือfactsที่ยืนยันแล้ว |
| F27 | B3 · P2 | **Dashboard usage/cost และ traces** | merchant KPIs/charts, account drilldown, usage/model latency/cost estimates จาก `model_usage` (รวม realtime voice) ไม่มีโควตา, authorized trace/export | countsตรงrecords; unknownusage/costเป็นnull; แยก cost estimate ออกจากยอดจริงบน OpenAI; merchantไม่อ่านtraceอีกtenant; exportไม่เผยsecret |
| F30 | B2 · P3 | **Browser voice** | `gpt-realtime-2.1` ผ่าน WebRTC ด้วย client secret ที่ core ออก (`model.createRealtimeSession`), instructions ภาษาไทย, `server_vad`, tools รันบน server ของเราผูกกับ `voiceSessionId` (business/customer/เวลาหมดอายุ), interruption, `VOICE_MAX_SECONDS`, usage ส่งกลับเข้า `model_usage` และ text continuity | คำพูดใหม่ทำให้ผลเปลี่ยนและตรวจtranscriptได้; interruptionหยุดaudio; sessiontenantbound; API key หลักไม่ถึง browser; secondsไม่คิดซ้ำ; prerecorded-onlyไม่ผ่านlivevoice |
| F31 | C3 · P1 | **Notifications และ push** | recipient-scoped bell/read/unread/preferences, invitation/report/order events และ optional web push | recipientเท่านั้นอ่านได้; markreadpersist; browserปฏิเสธpushไม่ทำให้bellพัง; Rของpushต้องมีbrowsernotificationที่อนุญาตและรับจริง |
| F35 | C1 · P0 | **Reliability และเครื่องมือปฏิบัติการ** | durable jobs/outbox/leases/retries/dead-letter, health, upload/token guards, redacted logs, ops tools (`/ops`, `requirePlatformAdmin`) และ protocol catalog แทน SheetBot (adapter annex) | commitแล้วprocessตายกลับมาทำต่อได้; unique dedup; retrybounded; unknownexternalresultไม่ส่งซ้ำมั่ว; merchant เปิด ops ไม่ได้; toolsรายงานจากroute/spec metadataทดสอบและไม่แก้bodyเอกสารโดยไม่ตั้งใจ |
| F36 | C1 · P1 (15:15) | **ตรวจรวม เผยแพร่ และหลักฐาน** | fresh clone/fresh DB, contract/unit/E2E, tested artifact/build SHA/schema/modes, rollback, feature statusและpitch evidence | ผลทดสอบกับcommitที่demoตรงกัน; core E2Eและfeaturecasesมีผลจริง; ทั้ง 31 ฟีเจอร์มีสถานะ; healthผ่านอย่างเดียวไม่นับครบ; protocol catalog ถ้าคงAต้องประกาศ |
| F37 | B1 · P2 | **AI evals และหน้า AI quality** | ชุด eval สองภาษา 107 เคสแชต (ไทย 55 · อังกฤษ 48 · ผสม 4: ราคา, ของนอก catalog, ต่อราคา, jailbreak, ขอคนจริง, สกัดออเดอร์, สลับภาษา, แจ้งโอนเงิน) + ≥ 10 สลิปสังเคราะห์ (ปลอม/ซ้ำ/แก้ยอด), runner สองโหมด (fake ใน CI, model จริงเมื่อสั่ง พร้อมเพดานต้นทุน), ตารางผลต่อ run และหน้า `/ai-quality` | pass rate ต่อหมวด **และต่อภาษา (ไทย / อังกฤษ)** ตรงกับผลรายเคส; ป้าย fake/real ชัด; ต้นทุนต่อ run มาจาก `model_usage`; run จริงเกินเพดานถูกหยุด; เคสที่ล้มเปิดดูคำตอบและ check ที่ไม่ผ่านได้ |
| F38 | B2 · P2 | **Follow-up nudges** | ส่งข้อความติดตามสุภาพหนึ่งครั้งหลัง N ชั่วโมง เมื่อลูกค้าถามราคา/สินค้าแล้วไม่ได้สั่งและไม่มี staff ตอบ; เคารพ takeover, สวิตช์ AI, opt-out, quiet hours และกติกาของแต่ละช่องทาง; หน้า `/follow-ups` (ตั้งค่า + log) | ส่งครั้งเดียวต่อเงื่อนไข; takeover/AI ปิด/opt-out ไม่ส่ง; ตรวจเงื่อนไขซ้ำตอนส่ง; "recovered" นับถูกด้วย clock fixture; ข้อความอ้างเฉพาะสินค้าที่ลูกค้าถาม |
| F39 | C1 · P2 | **ChatGPT-ready catalog** | product feed รูปแบบ ACP จาก catalog จริง + MCP server เล็ก (`search_catalog`, `get_price`, `propose_order`) ที่ `/mcp/:businessSlug` พร้อม token ต่อร้าน และหน้า `/chatgpt-catalog` | feed ตรงกับ catalog และราคาใน DB; MCP `initialize` + `tools/list` + `tools/call` ผ่าน; `propose_order` ไม่สร้าง order จนลูกค้ายืนยัน; ไม่มี token = 401; tenant อื่นมองไม่เห็น |

ส่วนเสริมที่เพิ่มเข้าในฟีเจอร์เดิม (D8): **F14** มี PromptPay QR ต่อออเดอร์ (payload EMVCo ที่มียอดและเลขอ้างอิงออเดอร์) และตรวจสลิปด้วยการถอด QR บนสลิป + เลขอ้างอิงซ้ำ + ยอด/ผู้รับ + อ่านด้วย vision · **F27** มีตัวเลขผลลัพธ์ของร้าน (auto-resolved %, median first-response time, handoff rate, orders from chat, recovered follow-ups) รายละเอียดอยู่ใน spec ของแต่ละฟีเจอร์

## 7. ข้อกำหนดร่วมที่ทุก domain ต้องผ่าน

### Identity, permission และข้อมูล

- AuthScope มาจาก session+membership ที่ server ตรวจ ไม่เชื่อ role/account/business ใน request body ทุก read/write มี tenant scope รวมถึง exports, traces, jobs, media และ callback ของ provider
- Frontend ซ่อนปุ่มเพื่อช่วยผู้ใช้ แต่ API เป็นผู้ปฏิเสธสิทธิ์จริง ทดสอบ request โดยตรงที่ไม่มี UI และทดสอบ revocation หลังหน้าเปิดอยู่แล้ว
- ทุก shared DTO มี runtime validation และ schema version ตาม `contracts.ts`; error envelope สอดคล้องกัน ไม่คืน success เมื่อ domain ไม่พร้อม
- External content ทั้งข้อความลูกค้า เว็บ เอกสาร และ model output เป็นข้อมูล ไม่ใช่สิทธิ์เรียก action หรือแก้ policy
- Uploads อยู่ใน scope และมีชนิด/ขนาดที่ server ตรวจ ไม่เปิด HTML/file จากคนอื่นผ่าน URL ที่ browser อ้างเอง

### ราคา ข้อเสนอ และผลกระทบ

- ราคา/จำนวน/availability มาจาก canonical DB ปัจจุบัน โมเดลช่วยเลือก intent/สินค้าได้แต่ไม่เป็นผู้คำนวณยอดหรืออนุมัติให้จ่าย
- Proposal snapshot คงเดิม มี ID/version/hash/expiry; confirmation ต้องอ้าง proposal ที่ผู้ใช้เห็นและตรวจราคา/stock/permission ใหม่
- Idempotency key มี business scope; payload เดิมคืนผลเดิมและเปลี่ยน payload ด้วย key เดิมต้อง conflict
- ใช้ transaction/locking สำหรับ stock/slot ที่แข่งกัน; ไม่เรียกโมเดลหรือ provider ค้างใน transaction
- Persist-before-send ผ่าน outbox; state pending/unknown/failed/sent/verified ต้องแยก ไม่ใช้ HTTP 200 ของ app เป็นหลักฐานว่าปลายทางได้รับ
- Provider timeout ที่ไม่รู้ผลต้อง reconcile; ไม่ blind retry การซื้อ/จอง/ส่งข้อความที่อาจสำเร็จแล้ว

### Model, usage และเวลา

- AI provider มีแค่ **OpenAI API** (เครื่อง dev ใช้ key ของเจ้าของเครื่องใน project `app-dev`; production ใช้ key เดียวใน project `app-prod`) ทุก model call ผ่าน `model.*` ของ core ตัวเดียว (Responses API, `store:false`, model ID จาก env ตาม `docs/openai-api.md`) มี attempts/tool calls/time/output limits ตาม `contracts.ts` และเก็บ actual usage เท่าที่ OpenAI ให้ลง `model_usage` ทุก call
- ไม่มีแพ็กเกจ โควตา หรือ allowance ของร้าน: ใช้ได้ไม่จำกัด แต่ต้องเห็นต้นทุนทุก call (F27) ถ้า usage/cost ไม่ทราบให้ null+reason ไม่ใส่ศูนย์เพื่อให้ dashboard ดูถูก
- เงินหรือ hard limit ของ project (`app-dev` US$30 / `app-prod` US$60) หมด (`PROVIDER_BUDGET_EXHAUSTED`) ห้าม retry และ bot ส่งต่อ staff แทนการเงียบ
- คำนวณด้วย rate version/model/speed ที่บันทึกไว้ ตัวเลข estimate แสดงเป็น estimate; ไม่อ้างว่าทดสอบแล้วหากยังไม่เรียกจริง
- เก็บเวลาเป็น UTC; แสดงวันนัด/รายงานใน Asia/Bangkok; tests inject clock ได้ ไม่อิง timezone ของเครื่องเพื่อน
- UI ทุก action มี loading/success/error/permission/not-configured states และป้องกันกดซ้ำ ไม่ render HTML อิสระจากโมเดล

## 8. External provider gate

ทุก provider แยก `configured`, `reachable`, `verified` และ mode ไม่ใช้คำว่า connected แทนทุกสถานะ

| กลุ่ม | สิ่งที่ต้องมีจึงตรวจ external ได้ | ถ้าไม่พร้อม |
|---|---|---|
| AI (OpenAI เท่านั้น) | `OPENAI_API_KEY` ของ project `app-dev` ต่อคน (hard limit US$30) และ `app-prod` บน production (hard limit US$60), model ทุกตัวใน `docs/openai-api.md` (แชต `chat`/`fast`/`strong`, embeddings, moderation, vision, transcribe, realtime) ผ่าน smoke test §14 และ tier/rate limit ที่เห็นใน Settings → Limits | AI จริงยัง U/A; fake mode หรือ canned reply ไม่ผ่าน F10; ไม่มี provider สำรองอื่น |
| LINE | สอง channel (*NLess Demo* → production, *NLess Dev* → tunnel), secret/token, recipient และ HTTPS callback | domain flow ผ่าน simulatorได้เป็น S; standalone replayเป็น A |
| Messenger/Instagram | Meta developer app ของทีมแบบ development mode, app roles/test users, test Page + IG professional account และ HTTPS callback (ไม่ต้อง app review) | simulator ครบ flow เป็น S; replay อย่างเดียวเป็น A; ส่งถึง test user จริงแล้วเป็น R |
| Google Calendar (+ Docs/Sheets ของ F06 ซึ่งเป็น stretch) | project/grants/test users/redirect และเอกสาร/ปฏิทินทดสอบ | อ่าน fixture/local event captureเป็น Sเฉพาะ flowครบ; OAuth stubเป็น A |
| Payment/slip (F14) | PromptPay QR builder + receiver fixture (ไม่มี Omise) · สลิปอ่านด้วย OpenAI vision + ตรวจในโค้ด | ใช้ simulatorที่แสดง S; สลิปสูงสุด S (ไม่ได้ยืนยันกับธนาคาร); ไม่รับเงินจริง |
| Email และ push | test mailbox/sender หรือ browser permission/VAPID | local email/push outboxมี S ตามขอบเขต; ไม่มี receiptห้ามบอก delivered |
| Voice (F30) | OpenAI Realtime model access, mic/audio device, browser permission บน HTTPS หรือ localhost | text fallbackยังใช้แชตได้ แต่ไม่ทำให้ live voice ผ่าน |
| Ops tools (F35) | metadata ของแอปใหม่ (route registry) และ test sheet ถ้าส่งออก protocol catalog | interface/fixtureเป็น A; ไม่ใช้เอกสารหรือAWSเดิมโดยปริยาย |

ช่องทางมีแค่ LINE, Messenger และ Instagram (+ Demo Chat บนเว็บ) ห้ามมีการ์ด ปุ่ม หรือ config ของช่องทางอื่นที่ทำให้ดูเหมือนเชื่อมได้

Provider test mode ไม่เหมือน production delivery แต่เป็นหลักฐานว่า code path ทำงานกับ provider test environment ได้ บันทึก environment ใน evidence เสมอ ไม่เปิด live จริงเพียงเปลี่ยน label

## 9. การตรวจรับทั้งระบบ

Orchestrator ทั้งสาม (A0, B0, C0) ตรวจงานของคนตัวเองบน `main` และบน production หลังทุก merge · C0 ตรวจ CORE-LOOP GATE 13:00 บน production · C1 (F36) รวมชุด Playwright กลางและหลักฐานจาก commit ที่จะสาธิต ทุก lane ส่ง Playwright smoke ของฟีเจอร์ตัวเอง (`web/src/features/<slug>/e2e/`) ที่รันกับ production ได้ ตัวอย่างชุดกลางต้องครอบคลุมอย่างน้อย:

1. สมัคร/เข้าสู่ระบบ/สร้างธุรกิจใหม่/เชิญสมาชิก และปฏิเสธ cross-tenant read/write
2. นำเข้าข้อมูลใหม่→review→activate/index-ready→ถามคำถามใหม่→คืน source/version ถูกต้อง
3. สั่งสินค้าจริงใน seed→canonical quote→explicit confirm→order persist→receipt sandboxแสดงmode
4. ยืนยันซ้ำ/ราคาเปลี่ยน/stockหมด/ข้อเสนอหมดอายุ→ไม่สร้าง orderผิดหรือซ้ำ
5. สองคนแย่ง booking capacity1→สำเร็จไม่เกิน1 และ sync failureไม่ลบ local appointment
6. Human takeover→AIหยุด→staffตอบ→คืน AI; notesไม่กลายเป็นข้อความลูกค้า
7. Comment/live code→private reply/cart→orderโดยต้องconfirm; replay eventไม่ส่งซ้ำ
8. Broadcast preview→opt-outก่อนsend→recipientถูกskip; per-recipient pending/failed/sentตรงจริง
9. OpenAI 429 rate limit→retry ครั้งเดียวภายใน deadline; เงิน/hard limit หมด (`PROVIDER_BUDGET_EXHAUSTED`)→ไม่ retry, bot ส่งต่อ staff, `model_usage` ยังบันทึก call ที่ล้ม
10. Workerตายหลังcommit→restart→ทำต่อโดยไม่duplicate external effect; unknownstateยังมองเห็น
11. Userไม่มีสิทธิ์อ่าน ops/traces/export ของร้านอื่น; logout/revokeมีผลต่อ API
12. Voiceสดและ interruptionเมื่อ OpenAI Realtime พร้อม; tool ของ voice ผูก `voiceSessionId` ฝั่ง server; ถ้าไม่พร้อมบันทึกF30 A/Uอย่างตรงไปตรงมา
13. สลิปปลอม/ยอดผิด/`bankRef` ซ้ำ→ไม่เป็น paid; สลิปไม่ชัด→staff ยืนยัน; สถานะสลิปเป็น S
14. Fresh clone+fresh DB→build+seed→app; build-info/schema/provider modesตรงevidence
15. ทั้ง 31 ฟีเจอร์มีผล feature check เพิ่มจากชุดกลาง แม้ไม่อยู่ใน demoสั้น
16. QR ของออเดอร์มียอดและเลขอ้างอิงถูกต้อง (CRC ผ่าน); สลิปแก้ยอดที่ QR บนสลิปยังถูก → ไม่ paid และติดป้ายสงสัยปลอม; สลิปเดิมกับออเดอร์ที่สอง → duplicate
17. Eval หนึ่งรอบบน model จริง: ผลรายเคสและ pass rate ต่อหมวดแสดงบนหน้า AI quality พร้อมต้นทุนของรอบนั้น
18. Playwright smoke ชุดกลางและของทุกฟีเจอร์ที่รายงาน R ผ่านบน production URL (ไม่ใช่เฉพาะ localhost) และเมนู production ไม่มีหน้า placeholder

การผ่าน test ของ fixture ไม่เท่ากับผ่าน E2Eจริงทุก provider และ startup/health ผ่านเป็นหลักฐานเฉพาะที่ endpointตรวจ ห้ามยืมผลจาก commit/schemaคนละชุดมาปิดงาน

## 10. Definition of done และหลักฐานส่งกรรมการ

**Production bar (D6):** ฟีเจอร์เป็น R เมื่อ UI จริงต่อ API และ DB จริง, เรียก provider จริงถ้ามี, deploy แล้วบน production URL, มี unit + route test และ Playwright smoke ที่ผ่านบน production, มี loading/empty/error state, **ใช้ได้ครบทั้งภาษาไทยและภาษาอังกฤษ** (UI ทุกหน้ามี th + en และสลับได้, AI ตอบตามภาษาที่ลูกค้าพิมพ์, ข้อความที่โค้ดส่งถึงลูกค้ามีสองภาษา, smoke มี case อังกฤษ: รายละเอียดใน `docs/specs/README.md` ข้อ "สองภาษา"), ตรวจ permission และ tenant, audit เมื่อเงินหรือข้อมูลลูกค้าเปลี่ยน · ฟีเจอร์ที่ไม่ถึง R ตอน 15:30 ถูกซ่อนจากเมนูด้วย feature flag และรายงานตามจริง

Feature จะเปลี่ยนจาก UNIMPLEMENTED ได้เมื่อมี source ใน repo ใหม่, commitอ้างอิง, acceptance result, ขอบเขต environment/mode และข้อจำกัดที่ตรวจตามได้ ฟีเจอร์ที่ระบุ R/S ต้องมี UI/API/DBตามพฤติกรรมของมัน ไม่ใช่เพียง unit test ของฟังก์ชันที่ยังไม่ต่อระบบ

หลักฐานทั้งทีมประกอบด้วย baseline declaration, task+owner, Codex promptสำคัญ, diffที่ตรวจแล้ว, ตัวอย่างข้อผิดพลาดที่พบและแก้, test output, trace/provider referenceที่ลบข้อมูลลับแล้ว, build SHA/schema/modes และ FEATURE_STATUS.csvครบ 31 แถว

เก็บหลักฐานการใช้ Codexจาก **requirement→task→implementation→human review→tests→working outcome** จำนวนagent/prompts/บอร์ดโพสต์ไม่ได้เป็นเกณฑ์สำเร็จในตัวเอง ตัวเลขเวลา/ต้นทุน/ผลผ่านต้องมาจากการรันจริง ไม่เติม headlineที่ยังไม่ได้วัด

ผลส่งงานให้บอกแยก “ระบบภายในทำงานจริงกี่กลุ่ม”, “sandboxกี่กลุ่ม”, “adapter/ยังไม่ทำกี่กลุ่ม” และ “providerใดตรวจปลายทางแล้ว” ไม่ใช้คำว่า production-complete จากการมีหน้าจอครบ

## 11. การเปลี่ยนแผนระหว่างวัน

เป้าหมายคงทุกระบบพร้อมสถานะจริง ลำดับงานคือลำดับใน lane ตาม PLAN.md และเปิดตาม tier (P0 → P1 → P2 → P3 ด้วยโพสต์ `LEAD: OPEN`) การเปลี่ยน contract ทำผ่านโพสต์ `CHANGE` ถึง lane เจ้าของ ตรวจ critical paths ที่ checkpoint 11:30, 13:00 (CORE-LOOP GATE) และ 14:30 ถ้า providerถูกบล็อกให้ทำ flowต่อผ่าน fake/sender เดิมและเก็บแถวนั้นเป็น A/S ไม่ทิ้งส่วนอื่นรอการอนุมัติ

เมื่อใกล้ code freeze ให้หยุดเพิ่มfeatureก่อนเวลาที่ทีมตกลง ตรวจ artifact+feature statusและเตรียมdemoจากผลที่รันได้จริง งานค้างยังอยู่ในscopeและhandoff พร้อมเหตุผล ไม่แอบเปลี่ยน requirementเพื่อให้ครบเปอร์เซ็นต์
