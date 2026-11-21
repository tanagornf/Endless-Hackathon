# Contract v1 ของแอปแข่งขัน

> **แทนที่แล้ว (18 พ.ย. 2569) ห้ามใช้เป็นกติกา:** หน้านี้เป็นของการแบ่งงานแบบเดิม (A = `web/src/**`, B = `server/src/domains/**`, C = platform, `registerDomains`, `PLATFORM_READY`) signature และ layout ที่ใช้จริงอยู่ใน `docs/competition-plan/templates/contracts.ts`, `AGENTS.md` และ `prompts/C1-setup.md` (`server/src/core`, `server/src/features/<slug>`, auto-load `routes.ts`/`pages.tsx`, `SETUP READY`)

คัดลอกไป `docs/CONTRACT.md` ในrepoใหม่และให้Cถือownership เป็นข้อกำหนดสำหรับimplementในงาน ไม่ใช่sourceที่สร้างไว้แล้ว รายละเอียดAPIครบอยู่ใน `docs/ARCHITECTURE.md` ที่นำมาจาก02ของkit

## สิ่งที่ freeze ก่อนแยกเขียน

- Node24/TypeScript rootnpmเดียว ReactVite; NodeAPIหนึ่งตัวและPostgreSQL; workerร่วมplatform
- A=`web/src/**`, B=`server/src/domains/**`และ`shared/features/**`, C=platform/base/migrations/roottoolchain
- `server/src/domains/register.ts` export `registerDomains(app, services)`; Cเรียกจากentrypointหนึ่งครั้ง
- developmentweb5173, API3000; webproxy`/api`ไปAPI; releaseoriginเดียว
- domainbase`/api/v1`; `/health/live`, `/health/ready`, `/build-info`แยกจากbase
- JSONcamelCase, UUID/opaqueIDs, UTCISOtimestamps, แสดงAsia/Bangkok, เงินintegerMinor+currency

## ตัวอย่าง wire envelope

```json
{"data":{"id":"opaque-id"},"meta":{"requestId":"request-id","schemaVersion":1,"serverTime":"2026-11-21T03:00:00Z"}}
```

```json
{"error":{"code":"VERSION_CONFLICT","message":"ข้อมูลเปลี่ยนแล้ว กรุณาตรวจข้อเสนอใหม่","retryable":false},"meta":{"requestId":"request-id","schemaVersion":1,"serverTime":"2026-11-21T03:00:00Z"}}
```

ใช้envelopeเดียวกับarchitectureของทีม ถ้าจะเปลี่ยนให้เปลี่ยนร่วมกันก่อนลงมือ ไม่ผสมbareJSONกับenvelopeระหว่างendpointโดยไม่ประกาศ

## Authentication และ tenant

Browserส่งsessionที่serverออกและตรวจแล้ว businessIdในURLเป็นคำขอเลือกscope ไม่ใช่สิทธิ์ Serverตรวจmembership/permission/objectownershipทุกครั้ง รวมchildresourcesที่URLไม่มีbusinessId ห้ามนำaccountId/roleจากbodyมาเชื่อ

เลือกcookie/sessionauthหนึ่งวิธีในbootstrap ถ้าใช้cookieให้มีHttpOnly, secureเมื่อHTTPS, appropriateSameSite, origin/CSRF checksสำหรับstatechange ไม่ใส่sessionหรือOpenAIkeysในfrontendbundle

## Platform ports ที่ C ต้องให้

| Port | Input ที่มีscope | Output/เงื่อนไข |
|---|---|---|
| auth | authenticatedsession + requestedbusiness/permission | trustedprincipal/AuthScopeหรือ401/403 |
| database | scope + parameterizedquery/transaction callback | tenant-safe result; timeouts; no providercallholdinglocks |
| model | scope + boundedprompt/tools/deadline | output+actualusage+trace; unknowncostnull |
| jobs/outbox | scope + kind/payload/dedupkey | durablependingjob; pendingไม่ใช่sent |
| providers | scope + explicitmode/operation | receipt/externalIDหรือtypedfailure |
| clock/ids/audit | scopedmetadata | serverUTC/IDs/redactedtrace |

Bเขียนdomainhandlersผ่านportsนี้ได้เลย Cไม่ต้องเขียนทุกrouteด้วยตัวเอง AทำfixtureตามDTOเดียวกันก่อนAPIจริงพร้อม

## Contracts ที่ต้องมีใน wave แรก

1. Session/user/role และbusinessmembership
2. Knowledgeitem/source/revision/indexstatus และcatalogproduct/variant/price
3. Conversation/message/turnrequest/turnresponse/sourcecitation
4. Immutableproposal/version/reviewtoken/expiry และconfirmationreceipt
5. Order/appointment/currentstate/version
6. Job/outboxdelivery/mode/providerreceipt/usage/trace

Requestที่อาจretryต้องมีclientRequestId คีย์lookupแบบuniqueคือ`(actorId,businessId,operation,clientRequestId)` เก็บcanonical`payloadHash`เป็นค่าประกอบสำหรับเปรียบเทียบ ไม่ใส่hashเข้าtupleของคีย์lookup หากคีย์เดิมpayloadHashต่างให้409 IDEMPOTENCY_CONFLICT; คีย์เดิมhashเดิมที่สำเร็จแล้วคืนreceiptเดิม หากยังin-progressให้pending/typedconflictตามcontract ห้ามให้LLMตัดสินเองว่ายืนยันแล้ว

## การเปลี่ยน contract

ผู้ขอส่ง `CONTRACT_CHANGE` พร้อมfieldเดิม/ใหม่, compatibility, affectedtasks, fixtureและtests เจ้าของCหรือBตามpathเป็นผู้แก้ ให้ทั้งA/B/Cรับทราบก่อนmergeการเปลี่ยนที่break ห้ามแก้JSONให้ต่างกันสามเครื่องแล้วแก้ที่integrationท้ายวัน

## Environment contract

Localentrypointsอ่าน`.env.local`ผ่านloaderร่วม; processenvมาก่อน fileenv Host`DATABASE_URL`กับCompose`DATABASE_URL_CONTAINER`อ้างDBเดียวกันแต่hostnameต่างกัน (`127.0.0.1`vs`db`) ห้ามdumpconfigsecret Migration/seed/test-resetต้องallowlistDB`nless_hack_*`และtesttenant ไม่แตะPapi production

## Readiness marker

Cโพสต์ `PLATFORM_READY` เมื่อscripts/config/ports/health/DB/testsที่ระบุทำงานจริง พร้อมcommitและknownstub list คำว่าreadyไม่ยกทุกfeatureเป็นcomplete A/Bเริ่มfixture/domainได้ก่อนmarker แต่เปลี่ยนไปใช้dependencyจริงหลังตรวจversionตรงกัน
