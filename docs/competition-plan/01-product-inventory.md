# แผนผังระบบ Papi และ Nless สำหรับสร้างใหม่จากศูนย์

> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** ขอบเขตระบบในเอกสารนี้ยังใช้ได้ แต่ส่วน “ข้อตกลงการแบ่งส่วนของระบบใหม่” และข้อห้ามใช้โค้ดเดิมถูกแทนที่ด้วย [PLAN.md](../../PLAN.md) ถ้าเนื้อหาขัดกันให้ยึด PLAN.md

เอกสารนี้เป็นบัญชีขอบเขตของผลิตภัณฑ์เดิมเพื่อให้ทีมสร้างรุ่นแข่งขันขึ้นใหม่ โดยไม่คัดลอก implementation เดิมเข้า repository แข่ง ทุกระบบมีรายการกำกับ ไม่มีการเปลี่ยนโจทย์ให้เหลือเพียงแชทหรือ checkout

ขอบเขตในรายการนี้หมายถึง **ทำให้แต่ละระบบมีพฤติกรรมขั้นต่ำที่ตรวจได้** ไม่ใช่รับรองว่าจะสร้างระบบภายนอกทุกช่องทางและคุณภาพ production เท่าของเดิมได้ใน 7 ชั่วโมง งานที่เชื่อม provider ไม่สำเร็จต้องคงแถวนั้นไว้และแสดงสถานะตามจริง

## อ่านสถานะอย่างไร

- **R — Real:** พฤติกรรมของแอปใหม่ทำงานจริงและบันทึก state จริงตาม acceptance ของแถวนั้น ยังไม่ใช่คำรับรอง production readiness
- **S — Sandbox:** กระบวนการแอปและการบันทึกstateรันครบ แต่effectภายนอกเป็นsimulatorที่ติดป้าย; provider test APIที่เรียกจริงและมีหลักฐานครบใช้Rพร้อมenvironment=test
- **A — Adapter:** มี interface และ fixture/replay ให้ส่วนอื่นต่อได้ ยังไม่เชื่อมบริการจริง
- **U — Unimplemented:** ยังไม่มี หรือยังไม่มีหลักฐานให้ตรวจ
- คอลัมน์ “เป้าหมาย” เป็นแผนสำหรับวันแข่ง **ขณะสร้างคู่มือนี้ทุกความสามารถของแอปใหม่ยังเป็น U** ไม่ได้สร้าง implementation ไว้ล่วงหน้า
- `R/A` หมายถึงต้องเตรียม provider/test credentials จึงทำ R ได้ ถ้าขาดให้แสดง A และไม่นับว่าเชื่อมต่อจริง; `R/S` ต้องระบุผลสุดท้ายให้เหลือสถานะที่รันได้จริง ไม่ปล่อยกำกวม
- F01–F36 คือรหัสงานใน [สถาปัตยกรรมและ backlog ตามระบบ](02-architecture-contracts.md) และ [ลำดับสร้างกับเจ้าของงาน](03-build-order-and-ownership.md)

## ขอบเขตของแผน

เอกสารฉบับแชร์เก็บรายการความสามารถ 47 กลุ่มและพฤติกรรมขั้นต่ำสำหรับสร้างใหม่ โดยไม่แนบ source เดิม รายการไฟล์ภายใน หรือผลสำรวจเครื่องเดิม ทุกความสามารถต้องมีผลทดสอบของแอปแข่งขันตามสถานะ R/S/A/U ของตนเอง

ช่องทางภายนอกต้องตรวจสิทธิ์ บัญชีทดสอบ และผลปลายทางแยกจากการเขียนโค้ด โดยเฉพาะ Shopee/TikTok ให้รายงานเป็นช่องทางที่ยังไม่เชื่อมต่อจนกว่าจะมีหลักฐานจริง

## ข้อตกลงการแบ่งส่วนของระบบใหม่

- **A:** `web/src/**` — หน้าจอ, navigation, forms, feature panels, UI tests
- **B:** `server/src/domains/**` และ `shared/features/**` — กฎธุรกิจ, route registration ของ domain, DTO/runtime validation ของ feature, domain tests
- **C:** `server/src/platform/**`, `server/src/index.ts`, `shared/base/**`, `migrations/**`, `tests/e2e/**`, root config — session/tenant guards, DB/jobs/outbox/model wrapper/framework, migrations, integration, build และ release
- Domain route ของ B รับ platform dependencies ผ่าน interface ของ C; ห้ามสร้าง auth, DB client, model key หรือ job worker อีกชุดเอง
- หน้าเว็บของ A ใช้ HTTP ตาม shared contract; ห้าม import server-only modules หรือ API key เข้า browser
- B ลงทะเบียน routes ของตัวเองได้โดยไม่แก้ entry point ของ C ผ่าน domain registration contract ที่ตกลงต้นงาน
- โฟลเดอร์ domain เป็นข้อเสนอชื่อความรับผิดชอบ ไม่ใช่แพ็กเกจที่ต้อง publish และไม่จำเป็นต้อง deploy เป็น Lambda แยก
- ระบบที่ provider ยังไม่พร้อมต้องคงหน้าและ API สถานะ `not_configured`/adapter อย่างตรงไปตรงมา หน้า placeholder เพียงอย่างเดียวไม่นับว่าทำระบบนั้นเสร็จ

## ตัวตน ธุรกิจ และช่องทาง

| รหัสและระบบ | พฤติกรรมขั้นต่ำที่ต้องพิสูจน์ในระบบใหม่ | งานและโมดูลใหม่ | เป้าหมาย |
|---|---|---|---|
| **P01 หน้าแนะนำผลิตภัณฑ์และทางเข้าสมัคร** | เปิดหน้าแนะนำ → สมัคร/เข้าสู่ระบบ → เข้าธุรกิจ โดยลิงก์ไม่วน | **F01**<br>`marketing`<br>`/` | R |
| **P02 ตัวตน การเข้าสู่ระบบ และกู้รหัสผ่าน** | สมัครผู้ใช้ใหม่ ยืนยัน/เข้าออกได้ session หมดอายุถูกปฏิเสธ และไม่เก็บ key ฝั่งเว็บ | **F02**<br>`auth (C platform)`<br>`/login /signup /confirm /forgot-password /reset-password` | R |
| **P03 Registration intent และรับคำเชิญ** | เชิญสมาชิกให้ธุรกิจ รับ/ปฏิเสธได้ token ใช้ซ้ำไม่เพิ่มสมาชิกซ้ำ และ email เปลี่ยนเองไม่ได้ | **F02/F03**<br>`identity/membership`<br>`/invite` | R/S |
| **P04 บัญชี ธุรกิจหลายแห่ง และการสลับ tenant** | สร้างสองธุรกิจ สลับแล้วข้อมูลแชท/สินค้าไม่รั่วข้าม พร้อม API denial test | **F03**<br>`tenants (C platform)`<br>`/business /business/:id` | R |
| **P05 สมาชิก บทบาท และสิทธิ์รายธุรกิจ** | Owner เชิญ Staff ให้ read-only แล้ว API write 403; เพิกถอนแล้ว request ถัดไปใช้ไม่ได้ | **F03**<br>`members/authorization`<br>`/member` | R |
| **P06 ข้อมูลธุรกิจ เวลาทำการ และความสามารถที่เปิดให้ AI** | บันทึกข้อมูลร้าน/เวลา/AI on-off แล้วมีผลต่อบทสนทนาใหม่และแสดงค่าที่บันทึกจริง | **F04**<br>`business`<br>`/business/:id` | R |
| **P07 ศูนย์เชื่อมต่อช่องทางและ Google integrations** | บันทึก channel connection แสดง configured/verified/error แยกกัน และ disconnect ต้องหยุดการส่งใหม่ | **F17/F18/F19/F20/F06/F16**<br>`channels/integrations`<br>`/channels` | R/A |
| **P08 LINE รับส่งข้อความและ rich cards** | ส่งข้อความจาก LINE ทดสอบ → inbox → AI → LINE; event เดิมซ้ำไม่ตอบสองครั้ง | **F17**<br>`channels/line`<br>`/channels /chat` | R หรือ A |
| **P09 Facebook Messenger รับส่งและเลือก Page** | รับข้อความจาก Page ทดสอบ ตอบกลับและบันทึก message ID พร้อม duplicate rejection | **F18**<br>`channels/facebook`<br>`/channels /chat` | R หรือ A |
| **P10 Instagram Professional DM และ OAuth** | ทดสอบกับ IG Professional ที่ได้รับสิทธิ์ หรือแสดง adapter replay ที่ติดป้ายชัด | **F18**<br>`channels/instagram`<br>`/channels /instagram/callback /chat` | R หรือ A |
| **P11 WhatsApp inbound/outbound/media/receipts** | รับ test message → ตอบใน window ที่อนุญาต → อัปเดต receipt; นอก window ต้องปฏิเสธ free text | **F19**<br>`channels/whatsapp`<br>`/channels /chat` | R หรือ A |
| **P12 Shopee/TikTok และช่องทางที่ยังเป็น Upcoming** | มีรายการแผน connector ที่ปิด action พร้อมแจ้ง unavailable; adapter replay ไม่นับเป็นเชื่อม API จริง | **F17–F20 (coverage annex)**<br>`channels/preview`<br>`/channels` | A/U |
| **P13 ประวัติ LINE, contacts, retention และ refresh credentials** | นำเข้า CSV ทดสอบซ้ำแล้วไม่ซ้ำ แสดง progress/review contacts; historical messages ไม่ยิง AI ตอบลูกค้าเอง | **F20**<br>`channel-history`<br>`/channels` | R/A |

## ความรู้ AI และการทำงานกับบทสนทนา

| รหัสและระบบ | พฤติกรรมขั้นต่ำที่ต้องพิสูจน์ในระบบใหม่ | งานและโมดูลใหม่ | เป้าหมาย |
|---|---|---|---|
| **P14 คลังความรู้ โฟลเดอร์ สินค้า SKU และตัวเลือก** | สร้างสินค้า/FAQ/นโยบาย แก้ราคา/ตัวเลือก เปิด/ปิดข้อมูล และค้นเจอเฉพาะ active ของร้านนั้น | **F05/F08**<br>`knowledge/catalog`<br>`/knowledge` | R |
| **P15 นำเข้าด้วยข้อความ ไฟล์ URL และ Google Docs/Sheets** | ข้อความ+CSV ใช้จริงก่อน; แต่ละวิธีต้องมี job status/result/error และไม่ activate การ parse ล้มเหลว | **F06**<br>`knowledge-import`<br>`/knowledge/create` | R/A |
| **P16 สถานะ draft/active/index readiness และการค้นคืน RAG** | ข้อมูล draft/deleted/tenant อื่นต้องไม่ถูกใช้ตอบ; เปลี่ยนราคาแล้วคำตอบใหม่ใช้ version ล่าสุด | **F05/F07**<br>`knowledge/retrieval`<br>`/knowledge /chat/test` | R |
| **P17 Knowledge workbench, revision, taxonomy และ migration** | แก้ draft → เปรียบเทียบ query → เห็น source ที่เปลี่ยน → publish/rollback revision; metrics ไม่แสร้งเป็น accuracy | **F07**<br>`knowledge-evaluation`<br>`/knowledge` | R/S |
| **P18 การตั้งค่า AI ภาษา tone รูปแบบตอบ และ escalation** | บันทึกนโยบายร้านหนึ่งร้านแล้วเปิดแชทใหม่ใช้ค่าจริง; ข้อมูลขาดต้องถาม/ส่งต่อ | **F04/F10**<br>`assistant-settings`<br>`/chat/setting` | R |
| **P19 Demo Chat ส่วนตัวและหลักฐานการตอบ** | พิมพ์โจทย์ใหม่จากกรรมการ → เรียก API จริง → คืนคำตอบพร้อม source/trace/usage โดยไม่ส่งให้ลูกค้าจริง | **F09/F10/F27**<br>`chat-sandbox`<br>`/chat/test` | R |
| **P20 Inbox, history, attachments, rich messages และ live updates** | สอง browser เห็นบทสนทนาเดียวกัน ส่งข้อความ/ไฟล์ตัวอย่างแล้ว reload ยังอยู่ และ unauthorized ถูกปฏิเสธ | **F09/F12**<br>`conversations/messages`<br>`/chat` | R |
| **P21 Human takeover, assignment, team availability, schedules, notes/mentions** | คนรับช่วงแล้ว AI หยุดตอบ ส่งคืน AI แล้วกลับทำงาน; notes แยกจากข้อความลูกค้าและทีมอื่นอ่านไม่ได้ | **F11**<br>`team-operations`<br>`/chat` | R |
| **P22 คำตอบแนะนำ การแปล และแจ้งคำตอบผิด** | draft แนะนำไม่ส่งอัตโนมัติ; แปลไม่แก้ต้นฉบับ; flag reply แล้วมี report และ reporter เห็นคำตอบ staff | **F12/F32**<br>`assistance/answer-reports`<br>`/chat /feedback-inbox` | R/S |
| **P23 Saved message templates และตัวแก้ไข cards/files** | สร้าง/แก้/เรียง template → insert ใน composer → ผู้ใช้ตรวจแล้วค่อยส่ง; scope ร้านถูกต้อง | **F12**<br>`templates`<br>`/chat/template` | R |
| **P24 WhatsApp approved templates และ messaging consent** | sync status → เลือก sendable approved → ส่ง test recipient; revoked marketing consent ต้อง block | **F19**<br>`whatsapp-templates/consent`<br>`/whatsapp-templates` | R/A |

## การขาย การตลาด การจอง และลูกค้า

| รหัสและระบบ | พฤติกรรมขั้นต่ำที่ต้องพิสูจน์ในระบบใหม่ | งานและโมดูลใหม่ | เป้าหมาย |
|---|---|---|---|
| **P25 ตอบคอมเมนต์โพสต์และไลฟ์เป็น private message** | event fixture ใหม่ → match rule → private-reply job หนึ่งงาน; replay ไม่ส่งซ้ำ และไม่สนใจไม่ match | **F21**<br>`comment-automation`<br>`/comment-replies /comment-replies/live` | R/A |
| **P26 Product codes สำหรับ live/post และ fullscreen presentation** | ผูก A12 กับสินค้าจริง → comment A12x2 → draft cart จาก canonical price → ยืนยัน; จอ present ใช้ codes เดียวกัน | **F22**<br>`live-commerce`<br>`/comment-replies/product-codes /comment-replies/product-codes/present` | R/S |
| **P27 Broadcast/segments/opt-in และประวัติส่ง** | เลือก segment → estimate recipients → ยืนยัน → job → per-recipient result; opt-out/ซ้ำ/นอกwindow ต้อง block | **F23**<br>`broadcasts`<br>`/broadcast` | R/A |
| **P28 ตะกร้า ออเดอร์ และ staff order operations** | แชทเลือกสินค้า → canonical quote → ยืนยัน → order DB; refresh แล้วอยู่; replay request ไม่สร้างซ้ำ | **F13**<br>`commerce/orders`<br>`/orders /chat` | R |
| **P29 PromptPay/บัญชีธนาคาร ตรวจสลิป และสถานะชำระ** | ยอดจาก saved order → test QR/payment intent → provider sandbox/webhook; browser claim ว่าจ่ายแล้วเปลี่ยน paid ไม่ได้ | **F14**<br>`payments`<br>`/orders /business/:id` | R/S |
| **P30 ข้อมูลจัดส่ง ค่าส่ง และ fulfillment** | คิดค่าส่งตามกฎ→ขอข้อมูล→บันทึก→staff เปลี่ยนสถานะ; ไม่เคลมขนส่งจริงหากไม่มี provider | **F13**<br>`fulfillment`<br>`/orders /business/:id` | R |
| **P31 จองนัด บริการ/resources/closures และปฏิทิน** | จอง slot → ยืนยัน → DB; slot ชนต้องปฏิเสธ; Calendar sync แสดง pending/success/error ตามจริง | **F15/F16**<br>`booking/calendar`<br>`/appointments /google/callback` | R/A |
| **P32 เตือนนัด ปิดแชท และ maintenance jobs** | งาน due เวลา Bangkok ถูก claim ครั้งเดียว; retry ไม่ส่งซ้ำ; timezone และสถานะ cancelled ถูกเคารพ | **F15/F35**<br>`scheduled-jobs`<br>`/appointments /chat` | R/S |
| **P33 Customer CRM, ประวัติ และ intake forms** | ลูกค้าทดลองกรอก form → server validate → CRM มีข้อมูล; token หมดอายุ/ใช้ซ้ำ/tenant อื่นปฏิเสธ | **F24/F25**<br>`customers/intake`<br>`/customers /public/forms/:token (ใหม่)` | R/S |
| **P34 Tags, automation และ audience membership** | เพิ่ม tag เองและจากกฎ → เห็น CRM → estimate broadcast ตรงกัน; ลบ assignment ไม่ลบคนอื่น | **F24**<br>`customer-tags`<br>`/customers /insight` | R |

## รายงาน เสียง การเงิน และผู้ดูแลระบบ

| รหัสและระบบ | พฤติกรรมขั้นต่ำที่ต้องพิสูจน์ในระบบใหม่ | งานและโมดูลใหม่ | เป้าหมาย |
|---|---|---|---|
| **P35 Insights: trends/topics/service/knowledge/booking** | มีแชททดลองแล้ว query ตัวเลขจาก DB; summary มี evidence links และไม่แสดง seed เป็นผลลูกค้าจริง | **F26**<br>`insights`<br>`/insight` | R/S |
| **P36 Merchant dashboard และ allowance/คิวรอ** | ตัวเลขรวมมาจาก orders/messages/jobs จริง ช่วงเวลาตรงกัน และ userไม่มี chat.read ไม่เห็นคิวลูกค้า | **F27**<br>`dashboard`<br>`/` | R |
| **P37 Voice web call และ text/voice session** | เริ่ม browser voice ด้วย consent → transcript → same conversation → audio reply; ไม่มีproviderให้แสดง unavailable/replay | **F30**<br>`voice`<br>`/demo/voice /call/:businessId` | R/A |
| **P38 Subscriptions, entitlements, quota และ billing usage** | เลือก plan sandbox → event ยืนยัน → entitlement เปลี่ยน → quota gate; duplicate event ไม่ลง ledger ซ้ำ | **F28/F29**<br>`billing/usage`<br>`/business/:id /billing/return` | R/S |
| **P39 Platform admin จัดการบัญชีและสถานะธุรกิจ** | Admin ดู/ระงับบัญชีทดสอบได้ Staff ปกติ API 403; suspendแล้ว write ของ tenant นั้นหยุด | **F33**<br>`admin-accounts`<br>`/accounts` | R |
| **P40 Platform usage/cost และ account drilldown** | usage จาก recorded calls คำนวณอัตราที่ระบุ แสดง actual/estimated/unknown; no cross-tenant access ให้ merchant | **F27/F33**<br>`admin-usage`<br>`/usage /usage/:accountId` | R/S |
| **P41 Plan replacement rules, referrals และ addons** | เปลี่ยน retired-plan mapping sandbox → preview renewal → ledger test; ยังไม่ chargeเงินจริง | **F29/F33**<br>`admin-plans/billing`<br>`/plans` | R/S |

## การแจ้งเตือน การช่วยเหลือ ข้อมูลส่วนบุคคล และระบบปฏิบัติการ

| รหัสและระบบ | พฤติกรรมขั้นต่ำที่ต้องพิสูจน์ในระบบใหม่ | งานและโมดูลใหม่ | เป้าหมาย |
|---|---|---|---|
| **P42 Notifications, unread counts และ web push** | order/report/invite event → notification เฉพาะrecipient → mark readคงอยู่; push failureไม่ลบnotification | **F31**<br>`notifications`<br>`account shell /account` | R/A |
| **P43 Help copilot, support history, feedback และ answer-report staff inbox** | ถามคู่มือ→cited answer; ส่งfeedback→Adminตอบ→แจ้งผู้ส่ง; browser history ห้ามใช้เป็นคำสั่งtrusted | **F32/F33**<br>`support/help`<br>`/account /feedback-inbox` | R/S |
| **P44 Legal acceptance, privacy, retention และ data deletion** | แสดงเอกสารเวอร์ชันปัจจุบัน บันทึกยอมรับจริง analyticsไม่ติ๊กเอง; ทดสอบลบเฉพาะfixtureของtenant | **F34**<br>`legal/privacy`<br>`/terms /privacy /data-deletion` | R/S |
| **P45 Profile, locale/theme/scale, responsive account และ onboarding tour** | เปลี่ยนชื่อ/ภาษา/ธีมแล้วreloadคงอยู่; mobile navigationใช้งานได้; onboardingไม่เอาmockเป็นสมาชิกจริง | **F01/F02/F04 (UI annex)**<br>`profile/preferences`<br>`/profile /account /account/:tab` | R |
| **P46 Tracing, jobs/outbox, diagnostics และ error recovery** | requestมีtraceID/modelusage/tooloutcome; kill/retry jobไม่ซ้ำsideeffect; dashboardแยกpending/failed | **F27/F35/F36**<br>`ops (C platform)`<br>`/dev/traces /ops (ใหม่)` | R/S |
| **P47 Ancillary SheetBot, SrsBot และ FetchMatchXG** | มีinterface+fixture testsและป้ายadapter; จะนับrealต้องตรวจreport/testsheetและreviewcommentในtestdocหรือproviderทดสอบจริง; SrsBotไม่แก้bodyเอกสาร | **F35/F36/F10 (annex)**<br>`specialized-adapters`<br>`/integrations (ใหม่;ไม่มีrouteproductตรง)` | A/U |

## ความครบของระบบที่ต้องตรวจตอนรวมงาน

การตรวจแต่ละแถวต้องได้ **หน้า/API + การเปลี่ยน state จริง + สิทธิ์ + failure path + หลักฐาน** ระบบ CRUD ที่เปิดหน้าได้แต่บันทึกไม่ลง DB ยังเป็น U ส่วน provider adapter ที่ไม่มี callback/test delivery จริงเป็น A

1. **Identity และ tenant:** มีผู้ใช้ทดสอบสองร้าน และผู้ไม่มีสิทธิ์อย่างน้อยหนึ่งคน ทุก domain ต้องผ่าน cross-tenant denial ไม่ใช่ตรวจเฉพาะ login
2. **One conversation:** web/LINE/Meta/WhatsApp normalized เข้า conversation/message contract เดียวกัน โดยเก็บ provider refs แยกกัน; dedup event ก่อนเรียกโมเดล
3. **One knowledge/catalog:** chat, comment codes, orders, voice และ booking อ่านข้อมูลรุ่นและ scope เดียวกัน; ราคามาจาก canonical record
4. **One action lifecycle:** ข้อเสนอจากโมเดลไม่ใช่คำสั่งที่อนุมัติแล้ว การซื้อ/จอง/ส่ง broadcast ต้องขอคำยืนยันและตรวจ current state ซ้ำก่อน commit
5. **One outbox/jobs:** side effect ที่ส่งออกภายนอกต้องมี idempotency, attempt state และผล unknown; network timeout ไม่ใช่เหตุผลให้ blind retry
6. **One usage ledger:** model calls ทุกเส้นทางต้องผ่าน wrapper กลางของ C ที่บันทึก usage/cost estimate ตาม rate version; quota ของลูกค้าไม่ปนกับ API credit ของทีม
7. **One truth inventory:** ตอน 16:00 ทุกแถวต้องเปลี่ยนจากเป้าหมายเป็นผลจริง R/S/A/U พร้อม commit/test/trace; แถวที่ยังไม่ผ่านต้องอยู่ในเอกสารส่งงาน
8. **One release:** source ของ demo build, test result และ evidence ต้องอ้าง commit เดียวกัน; startup ผ่านไม่ได้แปลว่า acceptance ทุกระบบผ่าน

## หน้าตาแอปที่ควรสร้างให้ครอบคลุม

ใช้ shell/sidebar เดียวและ feature panels แทนสร้างการนำทางหลายชุด:

- **Home:** dashboard + waiting queue + usage
- **Inbox:** list + timeline + customer pane + handoff/notes + orders/appointments action
- **Knowledge:** folders/list/editor/import + source evidence/workbench
- **Assistant:** settings + web test chat + voice tab พร้อม status provider
- **Commerce:** orders/payment/delivery และ live codes
- **Customers:** CRM/tags/intake + broadcasts
- **Reports:** insights/service/knowledge/booking/usage
- **Settings:** business/hours/capabilities/channels/members/subscription/profile
- **Support:** help copilot/history/feedback/answer reports
- **Platform Admin:** accounts/usage/plans/feedback/traces เฉพาะ admin
- **Public:** login/signup/invite/legal/customer form และ marketing

การรวมหน้าตามข้างต้นไม่ใช่การตัดระบบออก แต่ลดจำนวนหน้าและโครง layout ที่ต้องเขียนใหม่ในวันงาน คง acceptance ของแต่ละระบบไว้ แม้รวมอยู่ใน tab เดียวกัน

## ขอบเขตการพิสูจน์ระบบใหม่

- ระบบความรู้ต้องมี revision, publish และ rollback ที่ตรวจได้ พร้อมเปิดเผยว่าสร้าง implementation ใหม่จากประสบการณ์เดิม
- Staff order/payment ต้องมี server-side state และผลปลายทางจริง; ข้อมูล browser-local ไม่ใช่ server order feed และ manual receipt ไม่ใช่ slip verification
- การเชิญสมาชิกต้องพิสูจน์ด้วยผู้ใช้และสิทธิ์จริง ไม่ใช้ mock members เป็นหลักฐาน
- WhatsApp และช่องทางอื่นต้องแยกสถานะการตั้งค่า สิทธิ์ provider และ live verification; feature flag ที่เปิดแล้วอย่างเดียวไม่พิสูจน์การเชื่อมต่อ
- Product-code presentation และ notes ต้องมีผลบันทึกและทดสอบ; หน้าจอที่แสดงได้อย่างเดียวไม่ยืนยัน release หรือผลภายนอก
- Agent routes ต้องทดสอบใน environment ที่ระบุ พร้อม commit และ deployment evidence ก่อนอ้างว่าใช้งานจริง
- SheetBot/SrsBot เป็นเครื่องมือดูแล protocol/SRS และ FetchMatchXG เป็น specialized provider integration แยกจากหน้าผลิตภัณฑ์ merchant; เก็บ SheetBot/SrsBot ใน annex/adapters F35/F36 และ FetchMatchXG ใน F10 พร้อมสถานะและผลทดสอบ

## Route อ้างอิงสำหรับตรวจหมวดความสามารถ

รายการต่อไปนี้ใช้จัดประเภทเส้นทางอ้างอิงและตรวจว่าไม่มีหมวดความสามารถหล่น ไม่จำเป็นต้องสร้าง URL เก่าทุกเส้นในแอปใหม่ Redirect เก่าสามารถระบุว่าไม่อยู่ในขอบเขต compatibility ของ fresh product ได้ แต่ความสามารถปลายทางต้องอยู่ใน inventory

| Route อ้างอิง | ลักษณะ |
|---|---|
| `/` | route |
| `/home` | redirect_or_gate |
| `/accounts` | route |
| `/usage` | route |
| `/usage/:accountId` | route |
| `/plans` | route |
| `/feedback-inbox` | route |
| `/dev/traces` | route |
| `/business` | route |
| `/business/:id` | route |
| `/channels` | route |
| `/knowledge` | route |
| `/knowledge/create` | route |
| `/product` | redirect_or_gate |
| `/product/create` | redirect_or_gate |
| `/chat` | route |
| `/chat/template` | route |
| `/templates` | redirect_or_gate |
| `/whatsapp-templates` | route |
| `/comment-replies` | route |
| `/comment-replies/live` | route |
| `/comment-replies/product-codes` | route |
| `/comment-replies/product-codes/present` | route |
| `/orders` | route |
| `/appointments` | route |
| `/broadcast` | route |
| `/demo/voice` | route |
| `/demo/voice/:businessId` | route |
| `/chat/setting` | route |
| `/chat/setting/:businessId` | route |
| `/chat/test` | route |
| `/demo` | redirect_or_gate |
| `/demo/:businessId` | redirect_or_gate |
| `/chat/settings` | redirect_or_gate |
| `/member` | route |
| `/user` | redirect_or_gate |
| `/dashboard` | redirect_or_gate |
| `/insight` | route |
| `/customers` | route |
| `/profile` | route |
| `/account` | route |
| `/account/:tab` | route |
| `/terms` | route |
| `/privacy` | route |
| `/data-deletion` | route |
| `/login` | route |
| `/signup` | route |
| `/confirm` | route |
| `/forgot-password` | route |
| `/reset-password` | route |
| `/callback` | route |
| `/invite` | route |
| `/call/line-callback` | route |
| `/call/:businessId` | route |
| `/instructions/line` | route |
| `/instagram/callback` | route |
| `/google/callback` | route |
| `/billing/return` | route |
| `/ui` | development_only |
| `*` | not_found |
| `/testapi` | route |

## วิธีใช้ inventory ในวันแข่ง

ให้ C เปิดรายการนี้ตอนเริ่มงานและหลังแต่ละ integration wave ถ้า feature ถูกลดจาก R เป็น A/U ให้บันทึกเหตุผลกับผลที่ตรวจได้ ห้ามลบแถวเพื่อให้เปอร์เซ็นต์ดูสูงขึ้น ทีมต้องพูดว่า “มี 47 หมวดในแผน ผลจริง R กี่หมวด S กี่หมวด A กี่หมวด และ U กี่หมวด” ตามผลตรวจ ไม่พูดว่า “ทุกระบบเสร็จ” เพียงเพราะมีเมนูครบ

นับ subsystem coverage แยกจาก acceptance pass rate, provider integrations verified และ user outcome ของ demo เพราะแต่ละตัวตอบคนละคำถาม จำนวนหมวดใน inventory นี้ไม่ใช่จำนวนฟีเจอร์สำหรับให้คะแนนหรือจำนวนบริการที่ต้อง deploy
