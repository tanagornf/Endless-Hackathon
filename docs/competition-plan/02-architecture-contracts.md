# สถาปัตยกรรมและสัญญาการเชื่อมระบบสำหรับสร้าง Nless ใหม่จากศูนย์

> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** การแบ่งงานในเอกสารนี้ถูกแทนที่ด้วย [PLAN.md](../../PLAN.md) (แบ่งตามฟีเจอร์ 3 คน × 3 lanes, ใช้โค้ด Papi เดิมเป็น reference, บอร์ด agent ผ่าน Codex hooks) ถ้าเนื้อหาขัดกับ PLAN.md ให้ยึด PLAN.md

เอกสารนี้กำหนดสิ่งที่ทีมสามคนต้องตกลงก่อนให้ Codex เขียนระบบใหม่ในวันแข่งขัน ครอบคลุมทุกกลุ่มระบบของ Papi/Nless โดยใช้โปรเจกต์เดิมเป็นแหล่งทำความเข้าใจความสามารถ ไม่คัดลอก implementation เดิมไปอ้างว่าสร้างขึ้นในวันงาน เป้าหมายคือสร้างโค้ดใหม่พร้อมหลักฐานการทำงานจริง ขอบเขตที่ต่อกับผู้ให้บริการภายนอกต้องแสดงสถานะตามข้อเท็จจริง

## 1. ขอบเขตและความหมายของการทำครบ

คำว่า “ครบทุกระบบ” ต้องรายงานสองมิติ: (1) มีการทำงานของระบบย่อยใดแล้วบ้าง (2) เชื่อม provider จริงในสภาพแวดล้อมใดแล้วบ้าง การมีหน้า LINE, payment หรือ voice เพียงอย่างเดียวไม่พิสูจน์การเชื่อมต่อจริง ให้ทุก feature มีผลประเมินต่อไปนี้:

| สถานะในโปรเจกต์ใหม่ | เงื่อนไขที่ใช้รายงาน |
| --- | --- |
| real (R) | workflow ของแอปทำงานครบและมีหลักฐาน API/DB/ผลปลายทาง; ถ้ามี provider ต้องเรียก provider จริงใน environment ที่ระบุเป็น test หรือ live |
| sandbox (S) | workflow ของแอปทำงานครบและ persist จริง แต่ผลภายนอกใช้ simulator ที่ติดป้าย; event replay หรือไฟล์เสียงที่เปิดให้ดูอย่างเดียวไม่พอ |
| adapter (A) | มี interface/configuration, replay, screenshot หรือ prerecorded showcase แต่ยังไม่มีหลักฐานว่าการทำงานครบผ่านแอปสำเร็จ; ไม่นับว่าฟีเจอร์เสร็จ |
| unimplemented (U) | ยังไม่มี implementation หรือมีเพียงหน้า placeholder; ไม่นับว่าฟีเจอร์เสร็จ |

ระบบที่รับเงิน, ส่งข้อความจริง, OAuth, import ข้อมูลย้อนหลัง, browser microphone และ webhook จาก internet มีข้อกำหนดภายนอกที่จำนวน Codex หรือเครดิตไม่สามารถข้ามแทนได้ หาก provider ไม่พร้อม ให้ทำ simulator ที่เดิน workflow ครบตาม backlog ต่อ และเก็บ provider จริงเป็นงานที่ยังไม่เสร็จอย่างเปิดเผย ค่า R/S/A/U ต้องบันทึกแยกจาก providerEnvironment ซึ่งมี none, simulated, test หรือ live; การเรียก payment test API จริงแล้วตรวจผลได้เป็น R/environment=test ไม่ใช่ S ขณะที่คำว่า sandbox ในตัวอย่าง JSON ของเอกสารนี้หมายถึง local simulator เท่านั้น

## 2. โครงสร้างเดียวที่ทีมใช้ร่วมกัน

เลือก monorepo ที่มี npm root เดียว, Node.js 24, TypeScript, React/Vite, PostgreSQL และ API server ตัวเดียว ไม่ต้อง publish npm packages, ไม่ต้องสร้าง Lambda หนึ่งตัวต่อคน และไม่ต้องติดตั้ง orchestration framework ใหม่ระหว่างการแข่งขัน

~~~text
nless-hack/
  package.json                  C: scripts และ dependency owner
  package-lock.json             C เท่านั้น
  tsconfig.json                 C
  vite.config.ts                C: proxy /api และ production build
  Dockerfile                    C: build web + API ใน image เดียว
  compose.yaml                  C: app + PostgreSQL
  .env.example                  C: ชื่อ config และค่าตัวอย่าง ไม่มี secret จริง
  .gitignore                    C
  AGENTS.md                     C ประสาน; ทุกคนอ่าน
  web/src/                      A
    app/                        shell, routes, navigation, session context
    features/                   pages/components ของทุก feature
    api/                        typed HTTP client และ development fixtures
    ui/                         primitives และสถานะ loading/error
  server/src/
    index.ts                    C: เริ่ม HTTP app และ registerDomains
    platform/                   C
      auth/                     identity, sessions, permission enforcement
      db/                       PostgreSQL pool, repositories, transactions
      jobs/                     durable job runner, leases, retries
      outbox/                   persist-before-send และ delivery receipts
      models/                   OpenAI client, budgets, usage accounting
      providers/                LINE/Meta/Google/payment/voice transports
      http/                     request validation, errors, static web
      observability/            structured logs, traces, health
    domains/                    B
      register.ts               domain HTTP registration ผ่าน stable platform API
      business/ knowledge/ catalog/ chat/ team/ commerce/ booking/
      channels/ comments/ live/ broadcast/ crm/ forms/ insights/
      billing/ voice/ notifications/ support/ admin/ legal/
      */*.test.ts               unit tests ของเจ้าของ domain
  shared/
    base/                       C: errors, IDs, AuthScope, envelopes, service ports
    features/                   B: runtime DTO schemas และ domain states
  migrations/                   C: ordered migration files ใหม่
  tests/e2e/                    C: UI/API/database integration
  docs/                         spec, tasks, evidence, decisions
~~~

เลือกหนึ่ง HTTP framework ที่ทีมคุ้นเคยและติดตั้งเป็น dependency ผ่าน C เพียงคนเดียว ตัวอย่างในเอกสารเป็นสัญญาเชิงแนวคิด ไม่ได้ผูกกับ Express/Fastify หรือเป็น implementation ที่พร้อมใช้ ไม่ต้องเปลี่ยน framework ระหว่างวันเพื่อให้ตรงกับตัวอย่าง

Node API เสิร์ฟ web build และ /api จาก origin เดียวกันในสภาพแวดล้อมส่งงาน สำหรับ development ให้ Vite proxy /api ไป Node เพื่อลดปัญหา cookies/CORS แต่ยังต้องตรวจ origin และ CSRF ของ state-changing requests ตามวิธี auth ที่เลือก PostgreSQL เป็นฐานข้อมูลถาวร; ไฟล์บน Lambda หรือ container ที่หายหลัง restart ไม่ใช้เป็นฐานข้อมูลหลัก

~~~mermaid
flowchart LR
  UI[React web ของ A] -->|HTTP JSON| API[Node API]
  API --> DOM[Domain modules ของ B]
  API --> PLATFORM[Platform services ของ C]
  DOM -->|เรียก interface ที่ C ให้| PLATFORM
  PLATFORM --> DB[(PostgreSQL)]
  PLATFORM --> MODEL[OpenAI]
  PLATFORM --> PROVIDER[Provider adapters]
  DB --> JOB[Durable job runner]
  JOB --> PROVIDER
~~~

Codex ที่ช่วย A/B/C เขียนโค้ดเป็นเครื่องมือพัฒนา ส่วน agent ที่ตอบลูกค้าอยู่ภายใน chat domain ของแอป ทั้งสองอย่างเป็นคนละบทบาท ไม่ต้องนำ coding agent ไป deploy ให้เป็น backend ของลูกค้า

## 3. การแบ่งเจ้าของที่ลดการชนและไม่กองงานทั้งหมดไว้ที่ C

| พื้นที่ | ผู้แก้หลัก | คนอื่นทำอย่างไรเมื่อจำเป็นต้องเปลี่ยน |
| --- | --- | --- |
| web/src/** และ UI unit tests | A | โพสต์ contract/คำขอให้ A; ห้ามแทรก shared component เอง |
| server/src/domains/** และ domain unit tests | B | ส่ง feature ID, desired behavior และ acceptance ให้ B |
| shared/features/** | B | เสนอ field ใหม่บนบอร์ด; B เปลี่ยน schema+fixture แล้วแจ้ง version |
| server/src/platform/**, server/src/index.ts | C | B ใช้ service interface; ขอเพิ่ม port เมื่อจำเป็น |
| shared/base/**, migrations/**, root config/dependencies | C | ทุกคนส่งคำขอ; C รวมการเปลี่ยนครั้งละชุด |
| tests/e2e/** และการรวม/เผยแพร่ demo | C | A/B เขียน scenario หรือช่วยตรวจผลได้ แต่ไม่แก้ checkout ที่ C ใช้เผยแพร่ |

B เขียน domain route ได้ภายในพื้นที่ของตนและลงทะเบียนผ่าน registerDomains(app, services) ซึ่ง C ต่อเข้าจุดเริ่ม server เพียงครั้งเดียว วิธีนี้ทำให้ C ไม่ต้องเขียนทุก route ของทุก feature ส่วน migrations, transaction helper, auth guard และ provider transports เป็นของ C เพื่อรักษากติกากลาง

ตัวอย่างการเชื่อมเป็น import ปกติภายในโปรเจกต์เดียว:

~~~ts
// รูปแบบสัญญา ตัวอย่างนี้ไม่ใช่โค้ดแอปที่สร้างก่อนวันแข่ง
registerDomains(httpApp, platformServices);
// ภายใน chat domain: รับ scope ที่ platform ตรวจแล้ว
const outcome = await chat.handleTurn(scope, request, services);
~~~

เครื่องของแต่ละคนมี clone และ branch แยกกัน import จะอ่านไฟล์ใน checkout ของตัวเอง หลังรวม commit ของ B เข้ามาจึงเห็น implementation ใหม่ของ B ไม่มีการ import ข้ามเครื่องผ่านชื่อ GitHub

## 4. สิ่งที่ต้อง freeze ใน 30 นาทีแรก

1. npm scripts ที่ทุกคนจะใช้: dev, typecheck, test, test:unit, test:contract, test:e2e, eval:live, db:migrate, db:seed, check, build, start, worker; `test`รวมofflineunit/contract, `check`รวมtypecheckกับofflinechecks คำสั่งเหล่านี้เป็นข้อกำหนดที่ C ต้อง implement ในวันงาน ไม่ใช่คำสั่งที่มีอยู่แล้วใน planning kit
2. health endpoints: GET /health/live บอก process ยังตอบ; GET /health/ready ตรวจ schema version และ DB โดยไม่คืน secret หรือ connection string
3. AuthScope, feature envelope, errors, pagination, server time format, idempotency และ permission middleware
4. feature schemas รุ่น v1: business, knowledge, conversation, turn, proposal, order, appointment, provider capability และ fixture ชุดเดียวกัน
5. platform service ports ตามตารางด้านล่าง; ถ้ายังไม่พร้อมให้ C คืน implementation จำลองผ่าน port เดิม
6. Node API bind สำหรับ development, dev ports และ PostgreSQL database/schema ที่ไม่ชน; ห้ามต่อ production Papi

| Platform port ของ C | สิ่งที่ B ใช้ได้ | กติกา |
| --- | --- | --- |
| auth.requireUser / requireBusiness | คืน principal และ scope ที่ตรวจแล้ว | ห้ามเชื่อ accountId จาก body ว่าเป็นสิทธิ์ผู้เรียก |
| db.read / transaction | อ่านข้อมูลและ atomic write ใน tenant | statement timeout; ไม่เรียก model/provider ขณะถือ transaction lock |
| repositories | save/read ผ่าน interface ที่ domain ต้องการ | ทุก method รับ scope; query parameterized |
| models.generate | structured output + usage + request trace | bounded attempts/time/output; secret อยู่ server |
| knowledge.search | source IDs, version, snippets ของ business | เฉพาะ active+indexed revision; model text ไม่ใช่ authority |
| outbox.enqueue | สร้าง job หลัง domain commit | deterministic dedup key; pending ไม่เท่ากับ sent |
| providers.* | นำเข้า/ส่งออกบริการภายนอก | ทุกผลระบุ mode real/sandbox และ external reference เมื่อมี |
| clock / ids | เวลาฝั่ง server และ ID | test inject ได้; เก็บ UTC แสดง Asia/Bangkok |
| audit / usage | metadata ที่ตรวจสอบกลับได้ | ไม่เก็บ raw secret; unknown cost เป็น null |

## 5. สัญญากลางของ HTTP และ tenant

URL หลักเป็น /api/v1; business resources ใช้ /businesses/{businessId}/... ส่วน account resources ใช้ /accounts/{accountId}/... ใช้รูปแบบเดียวทั้ง UI และ API ไม่ผสม business_id ใน query บาง route กับ body บาง routeโดยไม่มีเหตุผล

~~~ts
type AuthScope = {
  userId: string;
  accountId: string;
  businessId?: string;
  permissions: string[];
}; // สร้างฝั่ง server หลังยืนยัน session และ membership เท่านั้น

type ApiResult<T> = {
  data: T;
  meta: { requestId: string; schemaVersion: 1; serverTime: string };
};

type ApiFailure = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: { requestId: string; schemaVersion: 1; serverTime: string };
};
~~~

| HTTP | code ตัวอย่าง | ผลที่ UI ต้องทำ |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | แสดง field ที่ผิด ไม่ยิงซ้ำอัตโนมัติ |
| 401 | AUTH_REQUIRED | กลับ sign-in โดยไม่ลบ draft ของผู้ใช้ |
| 403 | PERMISSION_DENIED / BUSINESS_INACTIVE | ปิด action และแสดงเหตุผล; ห้ามซ่อนแค่ปุ่มแล้วให้ API เขียนได้ |
| 404 | NOT_FOUND | รวมกรณี ID ต่าง tenant เพื่อไม่เปิดเผยว่าข้อมูลนั้นมีอยู่ |
| 409 | VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / SLOT_FULL | โหลดข้อมูลล่าสุดและขอยืนยันใหม่ |
| 422 | POLICY_BLOCKED / KNOWLEDGE_NOT_READY | แสดงข้อมูลที่ขาด; ไม่ให้ model เดาค่ามาเติม |
| 429 | QUOTA_EXCEEDED / RATE_LIMITED | แสดง reset/retry time เมื่อทราบ; ห้าม retry loop ไม่จำกัด |
| 502/503 | PROVIDER_UNAVAILABLE / SERVICE_NOT_READY | แสดง pending/failure ตามจริง และส่งต่อ staff เมื่อเหมาะสม |

Timestamp ใช้ ISO-8601 UTC, UI แสดง Asia/Bangkok; รายการใช้ cursor ไม่ใช้ offset ข้ามข้อมูลที่มีการเขียนต่อเนื่อง Money ใช้ integer หน่วยย่อย เช่น THB totalMinor=150000 เท่ากับ 1,500 บาท ห้ามให้ model เป็นผู้คำนวณยอดหรือรับ string ราคาจาก browser มาเป็นราคา authoritative

ทุก resource read/write ตรวจ membership และ business อีกครั้ง request body ไม่มีสิทธิ์ขยาย permissions; platform-admin surface แยกจาก merchant/customer messaging และมี audit การเลือก business หาก admin ทำ support action ต้องเป็น explicit permission ไม่อาศัย admin flag แทนทุกข้อกำหนด

## 6. API surface ที่ต้องมีเพื่อให้ครบทุกกลุ่มระบบ

ตารางนี้เป็น API ใหม่ที่ทีมจะสร้าง ไม่ใช่การอ้างว่า route เหล่านี้มีอยู่ใน Papi เดิมทุกอัน A ใช้ shared/features ของ B เป็น source ของ DTO ตัวจริง หลัง freeze แล้วถ้าต้องเปลี่ยนชื่อ field ให้ประกาศ contract revision บนบอร์ดก่อน

| ID | Routes ใหม่ | Domain และผลขั้นต่ำที่ต้องทำงาน |
| --- | --- | --- |
| F02 | POST /auth/register, /auth/verify-email, /auth/login, /auth/logout, /auth/password-reset/request, /auth/password-reset/complete; GET /auth/me | sign-in จริงกับ session ที่ตรวจได้; verify/reset tokenมีexpiry+single-use; reset ใช้ sandbox email outbox หากยังไม่มี mail provider |
| F03 | GET/POST /accounts; GET/POST /accounts/{a}/businesses; GET/POST/PATCH /businesses/{b}/members; POST /businesses/{b}/invitations; GET /invitations/{token}; POST /invitations/{token}/accept, /decline | account→business→membership; owner/admin/staff; invitation token bound to intended identity, expiry, role and one-use accept |
| F04 | GET/PATCH /businesses/{b}/settings; GET/PATCH /businesses/{b}/hours | profile, AI enable, language, policy, opening hours และ validation |
| F05 | GET/POST /businesses/{b}/knowledge; GET/PATCH /knowledge/{k}; POST /knowledge/{k}/submit, /activate, /deactivate; folders | draft→reviewed→active, soft-delete และ folder membership |
| F06 | POST /businesses/{b}/imports; GET /imports/{j}; POST /integrations/google-docs/link, /sync | text/CSV/file/link/Docs ingestion เป็น job; mode และ failures ชัด; SheetBot/SrsBot เป็น ops automation แยกใน F35 |
| F07 | POST /businesses/{b}/knowledge/search, /evaluate; POST /knowledge/{k}/revisions/{r}/publish, /rollback | citations/version, indexing readiness, before/after evaluation; rollbackใช้expectedCurrentVersionและสร้างaudit/newactivationไม่แก้immutablehistory |
| F08 | GET/POST/PATCH /businesses/{b}/catalog/items | product/service/variant, canonical price, availability; price มากับ DB revision |
| F09 | GET/POST /businesses/{b}/conversations; GET /conversations/{c}/messages | inbox, history, cursor, channel/status/customer |
| F10 | POST /conversations/{c}/turns; GET /turns/{t} | persisted user turn→bounded model/tools→persisted reply/trace |
| F11 | PATCH /conversations/{c}/state, /assignment; GET/PATCH /businesses/{b}/team; POST /conversations/{c}/notes | handoff ทำให้ bot ไม่ตอบต่อ, owner, availability, schedule, notes |
| F12 | POST /conversations/{c}/messages; CRUD /businesses/{b}/templates; POST /messages/{m}/translate, /suggest-reply; POST /uploads | staff send, rich blocks, attachments ที่ตรวจ ownership, translation ไม่แก้ต้นฉบับ |
| F13 | POST /conversations/{c}/cart; POST /conversations/{c}/proposals; POST /proposals/{p}/confirm; GET/PATCH /businesses/{b}/orders | cart→immutable quote→consent→order; staff shipping status |
| F14 | POST /orders/{o}/payment-request, /verify-payment; GET /orders/{o}/receipt | QR/slip/receipt มี provider mode; unpaid ไม่กลายเป็น paid จากคำตอบ AI |
| F15 | GET /businesses/{b}/availability; POST /appointments/proposals; POST /proposals/{p}/confirm; GET/PATCH /businesses/{b}/appointments | capacity, Bangkok time, reschedule/cancel, reminder และ audit |
| F16 | GET/POST/DELETE /businesses/{b}/integrations/calendar; POST /appointments/{a}/sync | grant, event sync, pending/failed repair; no duplicate event |
| F17–19 | GET/POST/DELETE /businesses/{b}/channels/{provider}; POST/GET /webhooks/{provider} | connect/revoke/status, signed inbound, normalize, dedup, delivery; LINE/Meta/WhatsApp |
| F19 | CRUD /businesses/{b}/whatsapp/templates; PUT /customers/{c}/messaging-consent | template approval/sync and consent; no free-form beyond allowed window |
| F20 | POST /businesses/{b}/channels/{p}/history-import; GET /imports/{j}; POST /channels/{p}/sync-contacts | job progress, origin metadata, historical content ไม่ตอบกลับอัตโนมัติ |
| F21 | GET/PUT /businesses/{b}/comment-rules; POST /webhooks/meta/comments | keyword rule, private/public reply, per-comment dedup and pending status |
| F22 | GET/PUT /businesses/{b}/product-codes; POST /live/cart-events | code→variant mapping, sold-out, note, presentation view และ live cart |
| F23 | GET/POST /businesses/{b}/broadcasts; POST /broadcasts/{x}/preview, /confirm; GET /broadcasts/{x}/recipients | audience preview→explicit send consent→job→per-recipient outcomes |
| F24 | GET/PATCH /businesses/{b}/customers; CRUD /tags; PUT /customers/{c}/tags; CRUD /tag-rules | profile, contact, source; manual/automation tag ownership แยก |
| F25 | CRUD /businesses/{b}/forms; POST /conversations/{c}/form-links; GET/POST /public/forms/{token} | short-lived scoped token, single-use submit, consent and answers |
| F26 | GET /businesses/{b}/insights; POST /conversations/{c}/summarize | summary/tags/sentiment/intent มี job และ source message range |
| F27 | GET /businesses/{b}/dashboard, /usage, /traces; GET /traces/{t} | counts จาก persisted records, known model usage/cost, privacy and staff gates |
| F28 | GET /plans, /accounts/{a}/subscription, /allowances; POST /subscriptions/change | versioned plan/feature gates, quota ledger, credits and cycle |
| F29 | POST /billing/checkout; POST /webhooks/payment; GET /billing/invoices; POST /billing/retry; referrals/addons | sandbox checkout→verified webhook→invoice; event dedup and entitlement update |
| F30 | POST /businesses/{b}/voice/sessions; GET /voice/sessions/{s}; WebSocket /voice/{s} | microphone→STT→same turn engine→TTS; interruption, timeout, metering |
| F31 | GET/PATCH /notifications; PUT/DELETE /push-subscriptions | notification list/read and optional browser push; no cross-user leak |
| F32 | POST /help/ask; GET/POST /support/conversations; POST /feedback; POST /answer-reports; PATCH /admin/answer-reports/{r} | help/copilot assistant ที่ตอบจริง, help history, feedback, wrong-answer report and staff reply |
| F33 | GET/PATCH /admin/accounts, /admin/users, /admin/plans; GET/PUT /admin/plan-replacements; GET /admin/usage | admin-only listing, disable/suspend, plan edits, replacement mapping and audit |
| F34 | GET /legal/documents; POST /legal/acceptance; POST /privacy/export, /privacy/delete-request | document version, recorded consent, retention and confirmed deletion workflow |
| F35 | GET /admin/jobs; POST /admin/jobs/{j}/retry; GET /admin/health, /admin/protocol-catalog; POST /admin/documentation/reviews | durable jobs, bounded retries, dead-letter inspection, protocol inventory, SRS drift findings และ audit |
| F36 | GET /build-info; POST /admin/demo/reset | release SHA/build ID/schema; reset เฉพาะ test tenant และ environment guard |

ไม่สร้าง route ที่ “ตอบ success เสมอ” เพื่อให้ดูครบ ถ้ายังไม่มี implementation ให้คืน SERVICE_NOT_READY และแสดง adapter/unimplemented ใน coverage matrix ขณะที่ฟีเจอร์อื่นทำต่อได้

## 7. แบบข้อมูลหลักและกติกาฐานข้อมูล

นี่เป็น logical schema ใหม่ที่ C แปลงเป็น migration ตามลำดับ ไม่ใช่ SQL ของ Papi ที่ต้องยกมาทั้งชุด UUID ใช้ชนิด uuid แต่ใช้ UUID generator ที่ runtime/DB รุ่นติดตั้งจริงรองรับ ไม่สมมติ uuidv7 มีในทุกเครื่อง

| ชุดตาราง | คีย์และข้อมูลจำเป็น | Constraint และเหตุผล |
| --- | --- | --- |
| users, sessions | users: id/email/credential-provider/status; sessions: token_hash/user/expires/revoked | unique normalized email; token เก็บ hash; session cookie HttpOnly ตาม environment, expiry และ logout revoke |
| accounts, account_members | account owner; member role/status | unique(account,user); สถานะ inactive มีผลทุก API |
| businesses, business_members, business_settings | account FK, owner/grant, business profile/hours/capabilities | accountId derive จาก business; unique(business,user); permission ตรวจ server |
| invitations, legal_acceptances | invited email/token_hash/expiry; user/document/version/accepted_at | one-use invite; consent version ไม่เปลี่ยนเพราะ UI label ใหม่ |
| knowledge_items, knowledge_revisions, knowledge_chunks, knowledge_folders | business, draft/review/active, source version, chunks and embeddings | active revision ชัด; index_state แยก; query จำกัด business+active indexed revision |
| import_jobs, integration_links | source kind/url/file reference, revision, progress, provider refs | raw file private; source ownership and public URL checks; external fetch ไม่เปิด arbitrary internal URL |
| catalog_items, catalog_variants | business, SKU/name/type, price_minor/currency, active, version | integer price ≥0; unique business SKU; quantity unit explicit |
| customers, customer_channels | business, customer, provider identity/contact | unique(business,provider,external_customer_id); history จากคนอื่นไม่รวมข้ามร้าน |
| channels, inbound_receipts | business/provider/external ID/status/generation/credential_ref; receipt external event | unique(channel_id,channel_generation,external_message_id); channelผูกprovider+business; eventIDเหมือนกันคนละchannelไม่ถูกกลืน; token ไม่อยู่ JSON ที่ส่ง browser |
| conversations, messages | business/customer/channel, state/owner/version; message externalId/seq/author/parts | monotonic seq ต่อ conversation; unique source ID; quoted message scope check |
| turn_runs, turn_traces, model_usage | input message, generation, request ID, stages/provider tokens/cost | หนึ่ง turn result ต่อ input/generation; unknown usage/cost เป็น null; trace access gated |
| notes, staff_schedules, assignment_events | business/conversation/user, availability/working hours/timezone | notes ไม่กลายเป็นคำสั่งของลูกค้า; stale assignment update conflict |
| proposals, proposal_presentations, action_receipts | kind, immutable payload snapshot/hash/version/expiry, presentation and consent | exact proposal ID+version+hash; unique receipt ต่อ confirmation request; no write before consent |
| carts, cart_items, orders, order_items | owner/business/conversation, qty/canonical price snapshots, totals/status/version | transaction locks; integer arithmetic; positive qty; order once from proposal |
| payment_requests, payment_attempts, payment_events | order/version/provider/mode/reference/amount/status | unique verified provider transaction ref; unknown result ไม่ถูกตีว่า paid; webhook signature |
| services, resources, appointments, appointment_events, closures | business/resource/service/start/end/capacity/status/version/timezone | start<end; scoped slot locking; capacity ตรวจใน transaction; idempotency per business |
| message_templates, uploads | rich blocks and approved attachment refs | allowed block types/count/size; upload ownership and type validated server |
| comment_rules, comment_deliveries, product_codes, live_carts | business/channel/comment ID/rule/code→variant/note | unique comment action; stable code assignment version; duplicate comment ไม่ส่งซ้ำ |
| broadcasts, broadcast_recipients, messaging_consents | immutable audience/body snapshot and recipient outcomes | preview version+consent; unique recipient job; revoked consent recheck ก่อนส่ง |
| tags, customer_tags, tag_rules, insight_runs | owner/source/model/manual, insight message range | automation ไม่ลบ manual tags; malformed model output ไม่เขียน profile |
| forms, form_tokens, form_submissions | schema/version, token_hash/business/customer/expiry/usedAt | validate schema; one-use token; consent timestamp; answers private |
| plans, plan_replacements, subscriptions, allowances, usage_ledger | versioned plans, replacement mapping, cycle, grant/reservation/commit/release | unique usage event; account-wide concurrency guard; replacement ต้องยืนยัน plan version ปลายทาง; negative remaining ป้องกัน transaction |
| invoices, invoice_items, billing_events, referrals | sandbox/real provider refs, amounts/currency/status | webhook event unique; invoice ไม่เกิดจาก estimated token cost |
| voice_sessions, voice_usage | business/customer/session/auth, start/end/seconds/provider/mode | bound max duration; interrupted state; replay no double debit |
| notifications, push_subscriptions, feedback, support_threads, support_messages, answer_reports | per-user/business scope, status, related turn | owner-only support read; push endpoint private; report link ต้องผ่านสิทธิ์ |
| jobs, outbox, delivery_attempts, audit_events | type/payload_ref/lease/attempt/nextRun/dedup/providerRef | unique dedup, leased reclaim, max attempts, dead state, no raw secrets |

C สร้าง migration ตาม dependency: identity→business/access→knowledge/catalog→chat/jobs→commerce/booking→extended domains→indexes/constraints และเปลี่ยน schema เป็นชุดก่อนปล่อยให้ B/A ใช้ field ใหม่ การ rollback แอปไม่ลบ orders/payments/appointments/consent/audit ที่บันทึกแล้ว ย้ายไป migration แก้ไขแบบเพิ่มได้เมื่อจำเป็น

## 8. เส้นทาง chat และ action ที่ทุกระบบใช้ร่วมกัน

1. รับ request พร้อม clientRequestId และตรวจ session/business/permission ก่อนอ่านข้อมูลร้าน
2. insert inbound receipt/message ด้วย unique key; replay คืน turn ที่มีอยู่แทน model call รอบใหม่
3. claim conversation turn ด้วย version/lease แล้วอ่าน state และ policy ล่าสุด
4. จอง allowance ของ account ก่อนเรียก model; กำหนด timeout, max tool calls, max output และ retry budget รวม
5. โหลด knowledge/catalog ที่อยู่ tenant และ revision ที่อนุมัติ; ใส่ข้อความจากลูกค้า/document เป็นข้อมูล ไม่เป็นสิทธิ์แก้ policy
6. model คืน structured intent/tool request โดยใช้ allowed tool registry เท่านั้น; URL, SQL, credentials และ arbitrary code ไม่เป็น tool arguments ที่อนุมัติ
7. tool คืน fact IDs/version/evidence ให้ deterministic validators ตรวจ ราคา วันเวลา จำนวน และเงื่อนไข
8. ถ้าจะเปลี่ยน order/booking/billing สร้าง immutable proposal แสดงให้ผู้ใช้เห็น และรอ consent; model พูดว่า “ลูกค้ายืนยัน” เองไม่ใช่ consent
9. confirmation ส่ง proposalId/version/presentation token; ตรวจ user/business/conversation/expiry/current facts แล้ว commit domain row+receipt+outbox ใน transaction เดียว
10. หลัง commit ให้ worker ส่งผลภายนอก; response ระบุ pending หาก provider ยังไม่ยืนยัน ห้ามแสดง sent/paid/calendar-synced ก่อนมีหลักฐาน
11. เก็บ usage ตาม provider ที่รายงานจริง release reservation ส่วนเหลือ; unknown cost เป็น null พร้อมเหตุผล
12. ส่ง trace/evidence ที่ไม่รั่ว secret ให้ staff และคืน UI DTO ที่ผูกกับ server facts

ตัวอย่างสัญญาที่ B/A ใช้เริ่มเขียนได้ทันที:

~~~ts
type ChatTurnRequest = {
  clientRequestId: string;
  text: string;
  attachmentIds?: string[];
};
type ChatTurnResult = {
  turnId: string;
  state: "completed" | "awaiting_confirmation" | "handoff" | "pending" | "failed";
  reply: { parts: MessagePart[]; evidenceIds: string[] };
  proposal?: {
    id: string;
    kind: "order.create" | "appointment.create" | "appointment.reschedule" | "appointment.cancel";
    version: number;
    expiresAt: string;
    summary: string;
    reviewToken: string;
  };
  delivery: { mode: "real" | "sandbox"; state: "not_required" | "pending" | "sent" | "failed" | "unknown" };
};
type ConfirmRequest = {
  clientRequestId: string;
  proposalId: string;
  version: number;
  reviewToken: string;
  decision: "confirm" | "cancel";
};
~~~

MessagePart จำกัดเป็น text, image, file, product_card, order_review, booking_review และ action_buttons ที่ schema อนุญาต UI ไม่ render arbitrary HTML จาก model รูปภาพ/ไฟล์ต้องมี canonical upload reference แทน URL ที่คนส่งเสนอให้เชื่อเอง

กรณีทดสอบที่ต้องเห็นเป็นพฤติกรรมจริง: ส่ง request เดิมสองครั้งได้ order เดียว; quote เก่าแล้วราคาเปลี่ยนต้องขอยืนยันใหม่; tenant A ใช้ ID ของ B ไม่เห็นข้อมูล; สองคำขอจองช่องสุดท้ายพร้อมกันได้จำนวนตาม capacity; model timeout ไม่บันทึกว่าชำระหรือจองสำเร็จ

## 9. Provider adapters และความจริงของ demo

เลือก provider adapter ที่มี port เดียวกันระหว่าง real กับ sandbox ทุก response ต้องระบุ mode; sandbox ไม่แตะ credentials จริงและไม่ส่งข้อความ/รับเงินจริง ตัวอย่าง normalized result:

~~~json
{
  "mode": "sandbox",
  "providerEnvironment": "simulated",
  "state": "accepted",
  "externalRef": null,
  "simulatedRef": "sandbox-message-001",
  "receipt": { "requestId": "req-001", "recordedAt": "2026-11-21T08:00:00Z" }
}
~~~

| Adapter | ต้องเตรียมเพื่อ real | ถ้ายังไม่มีแสดงสถานะใดได้ | หลักฐาน real |
| --- | --- | --- | --- |
| LINE | channel secret/token สำหรับ sandbox OA, reachable HTTPS webhook, recipient ที่เพิ่มเพื่อน | signed-event fixtures และ outbound capture viewer | webhook receipt + ข้อความที่บัญชีทดสอบได้รับ |
| Facebook/Instagram | Meta app, test users/assets, permissions และ account connection ที่ใช้ได้ | normalized webhook replay และ delivery outbox | event/provider request ID + ข้อความปลายทาง |
| WhatsApp | approved/test number, app permissions, template/consent readiness | Cloud API-shaped fixture, template state machine | inbound wamid/outbound wamid + test recipient |
| Calendar | OAuth consent/test user, redirect URI, refresh grant ของโปรเจกต์ใหม่ | local calendar events persisted พร้อม busy ranges | event ID ที่เปิดดูได้และกลับมาตรวจสถานะได้ |
| Google Docs/Sheets | grant ที่เหมาะกับ source และเอกสารทดสอบ | import fixture ของ text/tab/rows พร้อม source version | provider document revision และ import result |
| Payment/slip | test keys และ test webhook signature, test transactions ที่ provider รองรับ | payment simulator with explicit sandbox label | verified test transaction ref ที่ตรวจ amount/receiver/status ได้ |
| Email/invite | sandbox mail sender หรือ mailbox | restricted local email outbox; ไม่อ้างว่าส่งเมลแล้ว | message provider ID + recipient receipt |
| Browser push | HTTPS/localhost, browser permission, VAPID config | notification bell จริง + push event capture | browser notification ที่ test user อนุญาตแล้ว |
| Voice | microphone permission, audio transport/model ที่บัญชีมีสิทธิ์, timeout/metering | simulator ที่เดิน whole-app workflow+persist ครบ = S; prerecorded/replay อย่างเดียว = A | live utterance→transcript→same tool outcome→audio และ interruption test |

Provider integration ที่ยังไม่อนุมัติไม่ควรครองเวลาแก้ auth/verification ทั้งทีมเกินจุดตรวจที่กำหนด คน B ทำ domain ต่อจาก adapter contract ได้ คน C บันทึก provider เป็น blocked พร้อมเหตุผล ส่วน A แสดง capability/status ตามจริง เมื่อเปิด real ต้อง re-run acceptance ที่เกี่ยวข้อง ห้ามเปลี่ยน mode label เพียงเพื่อให้เป็นสีเขียว

ไม่เลือก Lambda เป็น topology หลักใน 7 ชั่วโมงนี้: one Node app+worker+PostgreSQL เป็น topology เดียวที่ทีมจะทดสอบ หากภายหลังย้าย HTTP API เข้า Lambda ต้องจัดฐานข้อมูล, connection pooling, queue/worker scheduling, packaging, IAM และ voice WebSocket แยกให้เหมาะสม ไม่ใช่เปลี่ยนไฟล์ handler แล้วถือว่า equivalence สำเร็จ

## 10. การรันและรวมงาน

แต่ละ laptop ใช้ clone/branch/DB ของตัวเอง: DEV_TENANT แยกและไม่มี connection string Papi จริง ถ้าบน laptop เดียวมีหลาย Codex ให้ใช้ worktree แยกพร้อม ports/DB name แยกด้วย แค่ branch คนละชื่อในโฟลเดอร์เดียวไม่แยกไฟล์ที่ agents กำลังเขียน

ทุก 45–60 นาที C รับ commit/PR ที่ผ่าน contract/unit checks เข้า demo branch แล้วรัน integration ชุดเล็ก คน A/B fetch/pull demo กลับเข้าพื้นที่ตัวเองตามวิธีใน runbook ก่อนเริ่มงานถัดไป Shared contract เปลี่ยนโดยมี version และ fixture ไม่ให้ UI ฝัง mock shape อีกชุดที่หลุดจาก schema

Code quality gates ที่ C ต้อง implement ในวันงาน: typecheck+build, lint ที่ใช้งานได้จริง, domain unit tests, contract fixture validation, DB migration from empty database, API integration and browser E2E มี fresh-DB test หลัง migration ทุกชุดที่เปลี่ยน schema ผลผ่านครั้งก่อนกับ schema เก่าใช้แทนไม่ได้

บันทึก artifact release SHA, schema version, provider modes, tested scenarios และ gaps ที่ /build-info กับ evidence manifest ให้ตรงกับ app ที่เปิด demo หาก deploy ยังไม่ผ่านใช้ local verified app เป็นเส้นทางสำรองที่ประกาศชัด ไม่อ้างว่า cloud production พร้อมใช้งานจาก health endpoint เพียงครั้งเดียว

### 10.1 Ancillary automation ที่ต้องคงไว้ใน full-system scope

SheetBot, SrsBot และ FetchMatchXG มี source อยู่จริง แต่เป็นงานประกอบหรือ test integration ไม่ใช่หน้า product หลักที่ต้องทำเมนูเหมือนกันทั้งหมด อย่านับสามตัวนี้เป็น importer ของฐานความรู้ร้านโดยอัตโนมัติ

| ระบบเดิม | พฤติกรรมที่ตรวจจาก source | งานใหม่ที่ต้องใส่ backlog |
| --- | --- | --- |
| SheetBot | ใช้ protocol catalog เทียบ inventory ของ Lambda/API Gateway แล้วเขียนสี่แท็บ API/WS ของ Google Sheet; ไม่แตะ human spec tabs | F35: อ่าน route registry/build-info ของแอปใหม่และ export protocol catalog JSON/CSV ที่เทียบ actual registered routes ได้; Google Sheets writer เป็น provider adapter แยก หากยังไม่เขียนจริงระบุ A ไม่ใช่ completed integration |
| SrsBot | อ่าน SRS Doc และ deployed-system metadata/schema summary, ใช้โมเดลสร้าง strict-JSON findings แล้วส่ง review comments; ไม่แก้ body | F35: documentation drift review ของ SPEC/CONTRACT กับ route/schema metadata ใหม่, เก็บ report+source version ใน DB และ default dry-run; Google Doc comment transport แยกและตรวจสิทธิ์ target |
| FetchMatchXG | handler รับ fixtureId, เรียก Sportmonks เพื่ออ่าน match/xG/lineups/statistics แล้วคืนผล TEST MODE | F10 ancillary: provider port และ domain endpoint จำกัดสิทธิ์ GET /admin/sports/fixtures/{fixtureId}; fixture response simulator ใช้ทดสอบ complete app path ได้, เรียก provider จริงต้อง test credential ของทีมและไม่ log token/raw secret |

Endpoint ops เหล่านี้ใช้ admin guard และไม่ต่อ AWS/Google/Sportmonks ของ Papi เดิม การ export CSV ในแอปใหม่เป็น functional local capability แต่ยังไม่เท่ากับ Google Sheets sync; ส่วน report findings สำเร็จยังไม่เท่ากับส่ง Google Doc comment แล้ว แยกสถานะราย operation ใน coverage matrix เมื่อจำเป็น

## 11. ตัวอย่าง request/response ที่ต้องแจกให้ A/B/C พร้อมกัน

ตัวอย่างทั้งหมดใช้ข้อมูลสมมติ ID แบบอ่านง่ายเพื่ออธิบาย; implementation ใช้ ID ที่ผ่าน shared schema จริง Response แสดงเฉพาะ data และต้องหุ้ม ApiResult พร้อม meta ตามข้อ 5 ทุกครั้ง ไม่ส่ง session secret, API key หรือ credential provider กลับ browser **ข้อมูลseedและค่าที่ใช้assertต้องยึดtemplates/SPEC.mdข้อ5เป็นแหล่งเดียว** ชื่อและราคาในตัวอย่างAPIต่อไปนี้เป็นillustrativeเท่านั้น Bสร้างfixtureจริงจากSPECในshared/featuresที่รับผิดชอบในวันงาน แล้วA/Cใช้ชุดเดียวกัน

### ตัวอย่าง 1 เข้าระบบและตรวจ principal

~~~http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"owner@example.test","password":"value-entered-locally"}
~~~

~~~json
{"user":{"id":"user-owner","email":"owner@example.test"},"accounts":[{"id":"account-a","role":"owner"}],"sessionExpiresAt":"2026-11-21T12:00:00Z"}
~~~

Opaque session cookie เป็น HttpOnly และมี expiry/revocation; API ไม่รับ role จาก request การ reset password ต้องตรวจ expiry และ single-use token; ถ้า mail transport ยัง sandbox ให้แสดงใน test-only outbox ที่มีสิทธิ์ ไม่ตอบว่า “อีเมลส่งถึงแล้ว” ผู้ใช้ seed สำหรับ demo ไม่มีสิทธิ์เข้าบัญชี Papi เดิมและไม่ใช้ password เดียวกับของจริง

### ตัวอย่าง 2 สร้างธุรกิจใหม่

~~~http
POST /api/v1/accounts/account-a/businesses

{"clientRequestId":"business-create-001","name":"Demo Board Game Shop","timezone":"Asia/Bangkok","language":"th"}
~~~

~~~json
{"business":{"id":"business-a","accountId":"account-a","name":"Demo Board Game Shop","status":"active","aiEnabled":false,"version":1},"permissions":["business.manage","knowledge.write","chat.read","chat.reply","orders.write"]}
~~~

Server ตรวจว่าผู้เรียกเป็นสมาชิก account-a แล้วสร้าง owner grant ใน transaction เดียวกัน สมัครหลาย account ไม่ทำให้เลือก business ของคนอื่นได้

### ตัวอย่าง 3 นำเข้าฐานความรู้และติดตามงาน

~~~http
POST /api/v1/businesses/business-a/imports

{"clientRequestId":"import-001","kind":"text","title":"Shipping policy","text":"ส่งวันจันทร์ถึงศุกร์ ค่าส่ง 50 บาท","visibility":"draft"}
~~~

~~~json
{"job":{"id":"job-import-001","state":"queued","mode":"real"},"knowledgeItemId":"knowledge-policy","revision":1,"indexState":"not_started"}
~~~

GET /imports/job-import-001 คืน queued/running/completed/failed พร้อม errors ที่ปลอดภัย ไม่ใช้ 202 เป็นหลักฐานว่า indexing เสร็จแล้ว หลัง review+activate ต้องเห็น activeRevision และ indexState=ready จึงนำไปตอบ การอัปโหลด PDF/CSV/URL ใช้ job contract เดียวกันและห้ามคืน success เมื่อ parse ได้เพียงชื่อไฟล์

### ตัวอย่าง 4 สินค้าและหน่วยขาย

~~~http
POST /api/v1/businesses/business-a/catalog/items

{"clientRequestId":"catalog-001","sku":"AVA-TH","name":"Avalon","kind":"product","saleUnit":"box","currency":"THB","priceMinor":75000,"available":true,"variants":[]}
~~~

~~~json
{"item":{"id":"item-avalon","sku":"AVA-TH","saleUnit":"box","priceMinor":75000,"currency":"THB","available":true,"version":1}}
~~~

จำนวน 2 boxes ต้องคำนวณ subtotalMinor=150000 โดยโค้ด หากมีค่าจัดส่งต้องคืน fee แยกจาก subtotal และรวม total อีกครั้ง ไม่ยกยอดจากคำตอบตัวอย่างมาใช้แทนกติกา

### ตัวอย่าง 5 ส่งข้อความให้ AI และแสดงหลักฐาน

~~~http
POST /api/v1/conversations/conversation-a/turns

{"clientRequestId":"turn-001","text":"Avalon ราคาเท่าไหร่ ส่งยังไงครับ"}
~~~

~~~json
{"turnId":"turn-a","state":"completed","reply":{"parts":[{"type":"text","text":"Avalon กล่องละ 750 บาท ค่าส่ง 50 บาท ส่งวันจันทร์ถึงศุกร์ครับ"}],"evidenceIds":["item-avalon:v1","knowledge-policy:v1"]},"delivery":{"mode":"real","state":"not_required"}}
~~~

ค่า real ในตัวอย่างหมายถึงเส้นทางเว็บและโมเดลจริงที่ตรวจแล้ว ไม่ใช่ข้อความถูกส่งไป LINE ถ้ายังใช้ fixture โมเดลต้องระบุ sandbox ในรายงาน test และ demo ให้ตรงด้วย

### ตัวอย่าง 6 ข้อเสนอซื้อและการยืนยันที่ป้องกันงานซ้ำ

~~~http
POST /api/v1/conversations/conversation-a/proposals

{"clientRequestId":"quote-001","kind":"order.create","items":[{"itemId":"item-avalon","variantId":null,"quantity":2}],"deliveryMethod":"shipping"}
~~~

~~~json
{"proposal":{"id":"proposal-a","kind":"order.create","version":1,"subtotalMinor":150000,"deliveryFeeMinor":5000,"totalMinor":155000,"currency":"THB","expiresAt":"2026-11-21T08:15:00Z","reviewToken":"opaque-server-token"},"state":"awaiting_confirmation"}
~~~

~~~http
POST /api/v1/proposals/proposal-a/confirm

{"clientRequestId":"confirm-001","proposalId":"proposal-a","version":1,"reviewToken":"opaque-server-token","decision":"confirm"}
~~~

~~~json
{"receiptId":"receipt-a","replayed":false,"order":{"id":"order-a","version":1,"status":"awaiting_payment","paymentState":"unpaid","totalMinor":155000,"currency":"THB"}}
~~~

ส่ง confirm-001 ซ้ำได้ receipt-a/order-a เดิมและ replayed=true หากใช้ request ID เดิมแต่เปลี่ยน payload ให้ 409 IDEMPOTENCY_CONFLICT หากราคาเปลี่ยนหรือ proposal หมดอายุให้ 409 VERSION_CONFLICT หรือ 422 PROPOSAL_EXPIRED พร้อมให้ขอ quote ใหม่

### ตัวอย่าง 7 จองคิวและแยกสถานะ calendar

~~~http
POST /api/v1/appointments/proposals

{"clientRequestId":"booking-001","businessId":"business-a","conversationId":"conversation-a","serviceId":"service-demo","resourceId":"staff-demo","startAt":"2026-11-22T03:00:00Z","timezone":"Asia/Bangkok","customerName":"Demo Customer"}
~~~

~~~json
{"proposal":{"id":"proposal-booking","version":1,"kind":"appointment.create","localDisplay":"22 พ.ย. 2569 10:00 Asia/Bangkok","reviewToken":"opaque-booking-token","expiresAt":"2026-11-21T08:15:00Z"}}
~~~

หลัง confirm ใช้ receipt contract เดียวกับ order และคืน appointment.status=booked กับ externalSync.state=pending จน provider ยืนยันจริง เก็บ local appointment แม้ calendar ล่ม ทดสอบ capacity โดยยิงสองคำขอพร้อมกันให้ผู้ชนะเท่ากับ capacity ที่กำหนด

### ตัวอย่าง 8 ลงทะเบียน channel ในโหมด sandbox

~~~http
POST /api/v1/businesses/business-a/channels/line

{"clientRequestId":"channel-001","mode":"sandbox","displayName":"Contest LINE sandbox"}
~~~

~~~json
{"channel":{"id":"channel-line","provider":"line","mode":"sandbox","state":"configured","inboundVerified":false,"outboundVerified":false,"generation":1},"requiredForReal":["credential_ref","webhook_https","signature_test","recipient_receipt"]}
~~~

ค่าที่ configured ไม่ใช่ connected_verified โหมด real รับ credential reference ที่ C ตั้งฝั่ง server ไม่รับ API key กลับจาก browser ไม่มี endpoint ปิด signature check ของ production webhook เพื่อให้ fixture ผ่าน หากต้อง replay fixture ให้ใช้ authenticated sandbox-only admin tool แยก

### ตัวอย่าง 9 คอมเมนต์และ live code

~~~http
PUT /api/v1/businesses/business-a/comment-rules

{"version":1,"enabled":true,"keywords":["CF","สนใจ"],"privateReplyTemplateId":"template-demo","publicReplyText":"ส่งรายละเอียดในแชทแล้วครับ"}
~~~

~~~json
{"rule":{"id":"rule-a","version":2,"enabled":true},"providerReadiness":{"mode":"sandbox","canReceiveComments":true,"canSendPrivateReply":false}}
~~~

Product code fixture ใช้ {code:"A01",itemId:"item-avalon",variantId:null,assignmentVersion:1,note:"สินค้าตัวอย่าง"} การอ่าน code กับการแก้ note ต้องตรวจ assignment version เพื่อไม่ทับ code ที่เพื่อนย้ายไปสินค้าอื่นแล้ว Provider fixture ที่รับ comment ได้ไม่ทำให้ canSendPrivateReply=true เอง

### ตัวอย่าง 10 Broadcast preview และการอนุมัติ

~~~http
POST /api/v1/businesses/business-a/broadcasts

{"clientRequestId":"broadcast-001","templateId":"template-demo","audience":{"tagIds":["tag-vip"]},"mode":"sandbox"}
~~~

~~~json
{"broadcast":{"id":"broadcast-a","state":"draft","version":1},"preview":{"eligibleCount":3,"excludedCount":1,"audienceHash":"server-hash","previewToken":"opaque-preview","expiresAt":"2026-11-21T08:15:00Z"}}
~~~

Confirm ต้องส่ง id/version/previewToken และ server ตรวจ consent ล่าสุดก่อน enqueue งานแต่ละ recipient การส่งสำเร็จใน sandbox คือ outbound capture ที่ตรวจได้ ไม่ใช่ delivered จริง จำนวน rejected/failed/unknown ไม่ควรรวมเป็น sent

### ตัวอย่าง 11 แพ็กเกจ โควตา และ checkout แบบทดสอบ

~~~http
POST /api/v1/billing/checkout

{"clientRequestId":"billing-001","accountId":"account-a","planVersionId":"plan-demo-v1","mode":"sandbox"}
~~~

~~~json
{"checkout":{"id":"checkout-a","mode":"sandbox","state":"pending","amountMinor":10000,"currency":"THB","testUrl":"https://sandbox.example.test/checkout-a"},"subscriptionChanged":false}
~~~

URL เป็นเพียงตัวอย่าง ห้ามคัดลอกไปใช้ว่าเป็น provider จริง Subscription จะเปลี่ยนหลังตรวจ verified payment event ที่มี amount/currency/account/plan ถูกต้อง; webhook ซ้ำไม่เพิ่ม allowance ซ้ำ API การใช้โมเดลต้องจองและ commit quota ผ่าน ledger แม้หน้า UI จะยังแสดงยอดก่อนหน้าอยู่

### ตัวอย่าง 12 Voice session และขอบเขตการยืนยัน

~~~http
POST /api/v1/businesses/business-a/voice/sessions

{"clientRequestId":"voice-001","conversationId":"conversation-a","mode":"real","maxSeconds":120}
~~~

~~~json
{"session":{"id":"voice-a","state":"ready","expiresAt":"2026-11-21T08:02:00Z","maxSeconds":120,"mode":"real"},"transport":{"path":"/voice/voice-a","ticket":"short-lived-scoped-ticket"}}
~~~

Session ticket ผูก user/business/conversation และใช้ช่วงสั้น ไม่ใช้ master API key ใน browser คำสั่งซื้อหรือจองที่พูดผ่าน voice ยังต้องแสดงหรืออ่าน review ของ proposal และเก็บ consent; การสตรีมเสียงจบไม่ได้พิสูจน์ว่าคนได้ยินหรืออนุมัติ ต้องมี interruption test และเก็บเวลาใช้งานจาก server เมื่อปิด session รวมกรณีหลุดการเชื่อมต่อ

## 12. ความสัมพันธ์ข้อมูลที่ต้องเชื่อมให้ได้ก่อนเพิ่มหน้าจอ

~~~mermaid
erDiagram
  ACCOUNT ||--o{ BUSINESS : owns
  ACCOUNT ||--o{ ACCOUNT_MEMBER : grants
  USER ||--o{ ACCOUNT_MEMBER : joins
  BUSINESS ||--o{ BUSINESS_MEMBER : permits
  USER ||--o{ BUSINESS_MEMBER : joins
  BUSINESS ||--o{ KNOWLEDGE_REVISION : publishes
  BUSINESS ||--o{ CATALOG_ITEM : prices
  BUSINESS ||--o{ CHANNEL : connects
  BUSINESS ||--o{ CUSTOMER : serves
  CUSTOMER ||--o{ CONVERSATION : starts
  CONVERSATION ||--o{ MESSAGE : stores
  CONVERSATION ||--o{ PROPOSAL : reviews
  PROPOSAL ||--o| ORDER : confirms
  PROPOSAL ||--o| APPOINTMENT : confirms
  ORDER ||--o{ PAYMENT_ATTEMPT : verifies
  ACCOUNT ||--o{ USAGE_LEDGER : meters
  BUSINESS ||--o{ OUTBOX_JOB : sends
~~~

ER นี้แสดงความสัมพันธ์แกน ไม่ใช่รายชื่อทุกตาราง ให้ใช้ logical schema ในข้อ 7 สำหรับ extended domains ข้อจำกัด FK, unique keys, current versions และ transaction เป็นส่วนที่ต้องลงจริง; TypeScript types อย่างเดียวไม่ป้องกัน race หรือ API caller ที่ข้าม UI

## 13. ความเสี่ยงที่ต้องเผื่อในแผนสามคน

- ทั้ง 36 กลุ่มระบบเป็น scope ที่ต้องไล่ทำ ไม่ใช่คำรับรองว่าจะ production-complete ใน 21 person-hours การอ่าน implementation เดิมช่วยลดการตัดสินใจ แต่ไม่ได้ทำให้ testing/integration/provider approvals หายไป
- B ถือ domain endpoints และ DTO จำนวนมาก จึงแบ่งเป็น task files ย่อยกับ Codex subagent ได้เฉพาะโฟลเดอร์ feature ที่ไม่ซ้อนกัน และมี B เป็นผู้รับงานรวม ห้ามเปิดหลาย writers ที่ register.ts หรือ shared/features ชื่อไฟล์เดียวกัน
- C ถือ platform, schema, integration, deployment และ E2E ซึ่งเป็น critical path ให้ทำ platform ports+minimal schemas ก่อน UI ทุกหน้า และรับ schema change เป็นรอบ ไม่ปล่อยแต่ละ agent แก้ migration เอง
- A ถือ UI ทุกกลุ่มระบบ ให้ใช้ generic list/detail/form patterns ที่สร้างใหม่ในวันงาน ลดเวลาวาดหน้าที่มีโครงเดียวกัน แล้วลงรายละเอียด workflow สำคัญตาม build order
- Full feature UI ที่ไม่มี backend จริงนับเป็น adapter/unimplemented เท่านั้น หากเวลาจบต้องส่ง coverage matrix ที่บอกผลจริงทุก ID ไม่ใช้ menu count เป็นหลักฐานว่า “ทำครบ”
- การทดสอบ live ระบบภายนอกและการเผยแพร่ไม่ใช้ credentials/ฐานข้อมูล/recipient ของ production Papi โดยอัตโนมัติ ใช้ test assets ของการแข่งขันที่ทีมตั้งใจเลือกไว้เท่านั้น

ตัวเลขใน feature-backlog.csv เป็นประมาณการเชิงวางแผนของ first functional slice ต่อ feature ไม่ใช่ benchmark ความเร็ว Codex และไม่ใช่ production parity ของระบบเดิม รวมค่าต่ำ 1,755 person-minutes (29.25 person-hours) และค่าสูง 4,155 person-minutes (69.25 person-hours) ก่อนความไม่แน่นอนของ provider approvals ขณะที่ทีมมี 1,260 person-minutes ใน 7 ชั่วโมง ตัวเลขนี้ทำให้การทำทุกกลุ่มเป็นแผนที่ทะเยอทะยานและต้องวัดความคืบหน้าจริง ไม่ใช่เหตุผลให้ตัดระบบออกจาก backlogหรือรับปากว่าทำทันแน่นอน

รายละเอียดการลงมือและลำดับเวลาให้ใช้ runbook หลักร่วมกับ feature-backlog.csv; ห้ามนำเอกสารนี้ไปสั่ง agent ว่า “ทำทั้งหมดพร้อมกันใน checkout เดียว”
