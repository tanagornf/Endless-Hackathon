# Demo loop: โต๊ะ 3 นาที, เวอร์ชัน 90 วินาที, เวที

ฉบับ 21 พ.ย. 2569 ตาม scope รุ่น LINE-onlyใน [PLAN.md](../../PLAN.md) · ใช้กับ [PITCH.md](PITCH.md) (พูดทับ loop นี้) · ข้อมูลทั้งหมดคือ seed สังเคราะห์ ร้าน A `Demo Boardgame Shop` (`demo-boardgame`) · Demo ทำบน **production URL** ไม่ใช่เครื่องในห้อง (D7)

**กติกา**

- ขั้นไหนที่ฟีเจอร์ไม่เป็น R ตอน 15:30 ฟีเจอร์นั้นถูกซ่อนอยู่แล้ว ให้ใช้ทางสำรองในคอลัมน์ "ถ้าไม่ R" หรือตัดขั้นทิ้ง ห้ามทำปุ่มหลอก ห้ามเปิดหน้าที่ถูกซ่อน
- ทุกอย่างที่โชว์เกิดสดบน production ยกเว้นเมื่อเปิด recording ที่ติดป้ายแล้ว ([VIDEO-SCRIPT](VIDEO-SCRIPT.md))
- **ทุกรอบ ให้กรรมการลองบนมือถือตัวเองก่อนหรือหลัง loop** (สแกน QR ของ LINE OA *NLess Demo* หรือ Demo Chat) · ข้อความของกรรมการขึ้นใน inbox บน STAGE สด ใช้เป็นหลักฐานว่าไม่ได้จัดฉาก
- LINE เป็นช่องทางภายนอกช่องทางเดียว · ตรวจ core loop ได้ผ่าน Demo Chat บนเว็บ · ตรวจสลิปไม่ใช่การยืนยันจากธนาคาร
- **ทุกรอบต้องมีหนึ่งคำถามภาษาไทยและหนึ่งคำถามภาษาอังกฤษ** (ขั้น 0:20 ไทย ขั้น 0:40 อังกฤษ ในตารางข้างล่าง): ผลิตภัณฑ์ใช้ได้ครบสองภาษา กรรมการถามภาษาไหนก็ได้ ข้อมูลร้านในเดโมเป็นสองภาษาในตัว (knowledge มีประโยคไทยและอังกฤษ สินค้ามีชื่ออังกฤษ) ส่วนข้อมูลที่ร้านเขียนภาษาเดียวตอบข้ามภาษาได้ด้วยการค้นข้ามภาษา ([F07 §5.4a](../specs/F07-knowledge-search.md))

## ข้อมูล seed ที่ใช้ (ร้าน A, SPEC §5)

| รายการ | ค่า |
|---|---|
| `A-GAME-01` | 1,490 บาท (2 กล่อง = 2,980 บาท ส่งฟรี เพราะ subtotal ตั้งแต่ 2,000 บาท) |
| `A-CARD-01` | 99 บาท (2 ชุด = 198 บาท + ค่าส่ง 100 บาท = 298 บาท) |
| `A-SOLD-01` | หมด |
| `A-SERVICE-01` | สอนเล่นเกม 30 นาที 500 บาท (จอง) |
| FAQ | รับคืนเฉพาะสินค้าที่ยังไม่แกะ ภายใน 7 วัน |
| ร้าน B | มี marker `TENANT_B_ONLY_OWL_482` ที่ร้าน A ต้องไม่รู้ |
| สลิปสังเคราะห์ | 2 ใบพร้อมในเครื่องและมือถือ: (1) ถูกต้อง ยอดตรงกับออเดอร์ 2,980 บาท (2) สำเนาที่แก้ยอด มีคำว่า "ตัวอย่าง" ทั้งคู่ สร้างด้วยโค้ดของ F37/F14 (ไม่ใช่สลิปจริง) |

ตรวจก่อน 17:00: ราคาไม่ถูกแก้, ใน `/ops` กด demo reset แล้วข้อมูล seed กลับมา (id ไม่เปลี่ยน)

## อุปกรณ์และบทบาท

| เครื่อง | เปิดอะไรไว้ | คนคุม |
|---|---|---|
| **STAGE** laptop (หันจอให้กรรมการ, ต่อไฟ) | Chrome สอง window: ซ้าย **Demo Chat** `/demo-chat/s/demo-boardgame` (ฝั่งลูกค้า) · ขวา **Inbox** `/chat` login owner A · tabs สำรอง: `/ai-settings` (trace), `/ai-quality`, `/dashboard` (seller impact), `/ops` (demo reset), หน้า F39 หรือ MCP ถ้า R, ledger | Driver |
| **STANDBY** laptop หรือโทรศัพท์ | production URL เดียวกัน login แล้ว · recording ติดป้ายเปิดได้ | Backstop |
| มือถือทีม (hotspot) | LINE ที่เพิ่ม OA *NLess Demo* แล้ว · สลิปสังเคราะห์ 2 ใบในอัลบั้ม | Backstop |
| ใบ QR ที่โต๊ะ | QR ของ LINE OA และ QR ของ Demo Chat (พิมพ์ 2 ชุด) + การ์ดคำถาม | ตั้งตอน 16:50 |

| บทบาท | หน้าที่ |
|---|---|
| **Speaker** | พูดตาม script, ชวนกรรมการลอง, เปิด trace เมื่อถูกถาม |
| **Driver** | คลิกและพิมพ์ตามตาราง ตอบแชตจาก inbox ตอนรับช่วง |
| **Backstop** | reset ระหว่างโต๊ะ, STANDBY, hotspot, ตัดสินใจใช้ทางสำรอง |

ผู้ยืนโต๊ะอย่างน้อย 2 คนตลอด Round 1 (17:15–19:30) กินข้าวสลับกัน

## เวอร์ชัน 3 นาที (โต๊ะ, กรรมการเดินมา)

เริ่ม: Demo Chat เป็นบทสนทนาใหม่ · ไม่มีรับช่วงค้าง · inbox อยู่ที่รายการแชต

| เวลา | Driver / กรรมการทำ | จอต้องแสดง | Speaker พูด (EN) | ถ้าฟีเจอร์ไม่ R |
|---|---|---|---|---|
| 0:00–0:20 | **กรรมการสแกน QR** (LINE OA หรือ Demo Chat) พิมพ์คำถามอะไรก็ได้ เช่น "A-GAME-01 ราคาเท่าไหร่" Driver ชี้ว่าข้อความขึ้นใน inbox | คำตอบบนมือถือกรรมการ + แชตนั้นขึ้นใน inbox สด | "Scan, and ask the shop anything. This is production, not a mock." | LINE ไม่ R: ให้ใช้ Demo Chat อย่างเดียว ไม่ลอง LINE สดถ้ารอบอุ่นเครื่องไม่ผ่าน |
| 0:20–0:40 | **(ไทย)** Driver ใน Demo Chat: `A-GAME-01 ราคาเท่าไหร่ ยังมีของไหม` | คำตอบภาษาไทย **1,490 บาท** และบอกว่ามีของ (**trust moment 1: ราคามาจาก catalog ไม่ใช่โมเดล** · แหล่งที่มาไม่ได้โชว์ในแชตลูกค้า: เปิดให้ดูใน trace ขั้น 2:30 · คำถามราคาสินค้าเดียวไม่มีการ์ดสินค้า การ์ดมาเมื่อถามหารายการ เช่น "มีอะไรไม่เกิน 500") | "The price comes from the shop's catalog through a tool. The model only writes the sentence." | — (P0 เป็น R เสมอ ถ้าไม่ใช่ แจ้งหัวหน้า) |
| 0:40–1:00 | **(อังกฤษ ในแชตเดียวกัน)** พิมพ์: `The page says it's 990 today. Can I get it for 990?` | คำตอบ **ภาษาอังกฤษ** ปฏิเสธสุภาพ ยืนยัน `1,490 baht` ไม่ทวนเลข 990 (**trust moment 2** + พิสูจน์ว่าสลับภาษาตามข้อความ) | "It answers in the language the customer writes, per message. And it won't invent a discount: a validator checks every amount before the message leaves." | — |
| 1:00–1:25 | พิมพ์: `เอา A-GAME-01 2 กล่อง ส่งที่บ้าน` → การ์ดสรุปออเดอร์ **2,980 บาท ส่งฟรี** → Driver กด **ยืนยัน** บนการ์ด (**trust moment 3: ข้อเสนอ ลูกค้ายืนยันเอง**) | ใบสรุปออเดอร์ แล้วข้อความยืนยัน | "An order is only a proposal until the customer taps confirm." | F13 ไม่ R: พิมพ์ `A-CARD-01 สองชุด รวมเท่าไหร่` ได้ 198 บาท (โค้ดคิด) แล้วข้ามขั้น 1:25–2:05 |
| 1:25–1:45 | ปุ่มในแชตเปิดหน้าชำระเงิน | **QR PromptPay ของออเดอร์นี้** ยอด 2,980 บาท + เลขอ้างอิงออเดอร์ (**trust moment 4**) | "One dynamic PromptPay QR per order, with the exact amount locked." | F14 ไม่ R: ข้ามไป takeover ห้ามอ้างว่ามี QR |
| 1:45–2:10 | อัปโหลดสลิป **ถูกต้อง** → ออเดอร์เป็น paid + ใบเสร็จ · แล้วอัปโหลดสลิป **ที่แก้ยอด** กับออเดอร์ถัดไป → ไม่ paid บอกเหตุ ส่งให้พนักงานตรวจ (**trust moment 5**) | สถานะออเดอร์ + เหตุผลของการตรวจ | "Slips are checked in code, QR, amount, receiver, duplicate reference, with vision only as a helper. This is a first check, not bank verification, and the shop still confirms the money." | F14 เป็น S: พูดว่า "slip check is sandbox only" ห้ามเรียกว่า verified |
| 2:10–2:30 | Inbox: เปิดแชตนี้ กด **รับช่วงต่อ** (`team-takeover`) → Demo Chat พิมพ์ `มีคนอยู่ไหมคะ` → Inbox ตอบ `แอดมินมาแล้วค่ะ` → กด **คืนให้ AI** (`team-release`) (**trust moment 6**) | บอทเงียบหลังรับช่วง ข้อความแอดมินโผล่ในแชตลูกค้า | "When staff take over, the bot stops. Always." | F11 takeover เป็น P0: ถ้าไม่ผ่านให้แจ้ง lead ทันที |
| 2:30–2:45 | สลับ tab `/ai-settings` เปิด turn ของคำถาม 990 | trace: intent, ภาษาที่ตอบ (`en`), tool `get_price` (ป้าย "ดึงล่วงหน้าโดยระบบ"), evidence `catalog:`, ผล validator, เวลา (**trust moment 7**) | "Every turn has a trace: what it called, what it checked, how long it took." | — |
| 2:45–3:00 | สลับ `/ai-quality` แล้ว `/dashboard` | อัตราผ่าน eval **แยกภาษาไทยและอังกฤษ** และป้ายจริง/จำลอง · ไทล์ seller impact | "We measure it, in Thai and in English: `<<fill at 16:15 from /ai-quality and /dashboard>>`." (อ่านตัวเลขสองภาษาจากการ์ด "อัตราผ่านแยกตามภาษา" บนจอเท่านั้น) | F37/F27 ไม่ R: ไม่มี tab (ถูกซ่อน) พูดเรื่อง trace แทน |
| ถ้ามีเวลา | **MCP / ChatGPT-ready catalog**: เรียก `search_catalog` ผ่านช่องทางที่ F39 `EVIDENCE.md` ระบุ ได้รายการสินค้าพร้อมราคาเดียวกับแชต | ผลของ `search_catalog` | "The same catalog is open to ChatGPT through a product feed and an MCP server, so a small shop can be found where buyers already ask." | F39 ไม่ R: ตัดทิ้ง ไม่พูดถึง |
| ปิด | ยื่นมือถือหรือคีย์บอร์ดให้กรรมการ | — | "Your turn: try to make it lie." | — |

### ถ้ากรรมการถามเอง

| ถาม | ควรเห็น | พูดว่า |
|---|---|---|
| ของที่มีในข้อมูล (คืนสินค้า, สอนเล่น) | คำตอบจาก knowledge + แหล่ง | "That came from the shop's own knowledge." |
| ของที่ไม่มีในข้อมูล | บอกว่าไม่มีข้อมูล ถามกลับหรือส่งต่อพนักงาน | "No source, no guess." |
| `A-SOLD-01` | หมด ไม่รับสั่ง | — |
| ภาษาอังกฤษ หรือสลับภาษากลางแชต | ตอบภาษาเดียวกับข้อความนั้น (เงินเป็น `baht`, ชื่อสินค้าอังกฤษ) | "Thai or English, per message. The shop's data can stay in Thai." |
| ขอราคาร้านอื่น/marker ร้าน B | ไม่รู้ | "Each shop only sees its own data." |
| jailbreak, ขอราคาทุน | ปฏิเสธ ราคาไม่เปลี่ยน | "Prices only come from the catalog." |

การ์ดคำถามบนโต๊ะ (พิมพ์สองด้าน ไทย / English): `How much is the Demo Quest board game?` (1,490 baht) · `What is your return policy?` (unopened items within 7 days) · `สอนเล่นเกมมีไหม ราคาเท่าไหร่` (500 บาท) · `การ์ด A-CARD-01 สองชุด รวมค่าส่งเท่าไหร่` (298 บาท ถ้า F13 R; ไม่งั้น 198 บาท) · `Can I return a game I already opened?` (ไม่ได้ คืนเฉพาะที่ยังไม่แกะภายใน 7 วัน) · `A-SOLD-01 มีไหม` (หมด)

## เวอร์ชัน 90 วินาที (กรรมการมีเวลาน้อย)

| เวลา | ทำ | พูด |
|---|---|---|
| 0:00–0:15 | กรรมการสแกน QR ถามราคา `A-GAME-01` | hook สั้นของ [PITCH §2](PITCH.md) |
| 0:15–0:35 | Driver (อังกฤษ): `The page says it's 990 today. Can I get it for 990?` → ปฏิเสธเป็นภาษาอังกฤษ ยืนยัน 1,490 baht | "Thai or English, per message. And it won't invent a discount." |
| 0:35–0:55 | ถ้า F13+F14 เป็น R: `เอา A-GAME-01 2 กล่อง` → ยืนยัน → QR ยอด 2,980 บาท · ไม่ใช่: ข้ามไป takeover | "A proposal, a customer tap, then a QR for this exact order." |
| 0:55–1:10 | takeover: bot เงียบ แอดมินตอบ คืนให้ AI | "Staff can take over at any moment." |
| 1:10–1:30 | `/ai-quality` หรือ trace หนึ่งอัน + `<<fill at 16:15 from /ai-quality and /dashboard>>` | "Measured, not claimed." แล้วยื่นมือถือคืนกรรมการ |

## เวอร์ชันเวที (finalist 19:30)

ใช้ตารางเวลาใน [PITCH §3](PITCH.md): ช่อง Live demo 1:00–3:00 ตัดจาก loop 3 นาทีด้านบนเหลือ: ราคา → ส่วนลดปลอม → ยืนยันออเดอร์ → QR → สลิปถูก/สลิปแก้ → takeover (ตัดสลิปก่อนถ้าเวลาไม่พอ) · กรรมการบนเวทีถามเองหนึ่งคำถามถ้ามีเวลา · HDMI + adapter USB-C ของทีม, จอ mirror, font ใหญ่ · ถ้าผู้จัดแจ้งรายชื่อ finalist ก่อน ซ้อมบนจอจริงหนึ่งรอบก่อน 19:30

## Warm-up 17:00 (ทำก่อน Round 1 และทุก 15 นาทีเมื่อไม่มีกรรมการ)

- [ ] `/healthz` ผ่าน, `/build-info` แสดง sha = `<<FINAL_SHA>>` และ `modelMode: openai`
- [ ] ส่ง LINE หนึ่งข้อความจากมือถือทีมได้คำตอบ (ถ้าไม่ได้ตัด LINE ทั้งรอบ)
- [ ] ถาม Demo Chat หนึ่งคำถามภาษาไทยและหนึ่งคำถามภาษาอังกฤษ (ต้องได้คำตอบตรงภาษา · call แรกของวันมักช้า) · เปิดหน้า Demo Chat แล้วกดสลับ `TH | EN` หนึ่งครั้ง · เปิด voice หนึ่ง session · อัปโหลดหนึ่งไฟล์ (PLAN ตาราง 17:00)
- [ ] ตรวจเพดาน turn ต่อวันของ Demo Chat (`DEMO_CHAT_DAILY_TURN_CAP`, ดูใน tab ตั้งค่า Demo Chat) ว่าเหลือพอสำหรับกรรมการ ถ้าใกล้เต็ม แจ้ง C0 ให้ปรับก่อนจะถึง 17:15
- [ ] เครดิต API ของ `app-prod` เหลือพอ (hard limit US$60, D4) ดูครั้งเดียว
- [ ] demo reset ที่ `/ops` · Demo Chat เป็นบทสนทนาใหม่ · ไม่มีรับช่วงค้าง · inbox login owner A
- [ ] tabs `/ai-settings`, `/ai-quality`, `/dashboard` เปิดไว้และโหลดแล้ว · สลิปสังเคราะห์ 2 ใบอยู่ในเครื่องและมือถือ
- [ ] STAGE ต่อไฟ ปิด sleep เปิด Do Not Disturb · zoom 125–150% · hotspot ทดสอบแล้ว · STANDBY login แล้ว · QR + การ์ดวางโต๊ะ

## Reset ระหว่างกรรมการ (Backstop ไม่เกิน 30 วินาที)

1. `/ops` → **demo reset** (ล้างออเดอร์ แชต การจองที่เกิดระหว่าง demo แล้ว seed ใหม่ ใช้ ~10 วินาที, id ของ seed ไม่เปลี่ยน, [quality-bar](../day/quality-bar.md) §6) ถ้าปุ่มไม่ทำงาน (`DEMO_RESET_ENABLED` ปิด) แจ้ง C0 ทันที
2. เปิด Demo Chat บทสนทนาใหม่ · คืนรับช่วงให้ AI · ปิด trace · เลื่อน inbox ขึ้นบน
3. ห้ามล้าง DB ด้วยมือ ห้ามแก้ราคา seed (ยกเว้นขั้น "แก้ราคาสด" ที่ซ้อมแล้วและแก้กลับ)

## ทางสำรอง

| อาการ | ทำอะไร | พูดว่า |
|---|---|---|
| Wi-Fi หน้างานล่ม | ต่อ hotspot มือถือ (production อยู่บน Render ไม่ขึ้นกับ Wi-Fi งานแต่ STAGE ต้องออกเน็ต) | — |
| โมเดลช้า/429/timeout | รอ: ระบบลองใหม่เองเงียบ ๆ ได้ถึง 3 ครั้ง แล้วถ้ายังไม่ได้จะส่งข้อความขออภัยและส่งต่อพนักงานเอง ([F10 §5.9](../specs/F10-ai-agent.md)); ให้ชี้ว่าระบบไม่แต่งคำตอบ ไม่สร้างออเดอร์ แล้วเปิดแชตใหม่ลองอีกหนึ่งครั้ง (เป้า p50 6 วินาที ค่าที่วัดไว้ก่อนงาน 7–11.5 วินาที ต่อ turn ที่มี tool, [openai-api.md §15](../openai-api.md)) | "The model call failed. Notice it made nothing up: it apologised and called staff." |
| LINE ไม่ตอบ | ใช้ Demo Chat เท่านั้น | "Please use the web Demo Chat to test the core flow." (ถ้า LINE ไม่ R ไม่พูดว่า LINE ทำงาน) |
| STAGE ค้าง | สลับ STANDBY | "Switching to our second machine, same production." |
| production ล่ม | เปิด recording ที่ติดป้าย | "This is a recording from `<<TIME>>` today on `<<FINAL_SHA>>`. It is not live." |
| ฟีเจอร์พังกลางรอบ | ข้ามขั้นนั้น ไม่โชว์ซ้ำ จด `FIX TO:` ให้ orchestrator แต่ห้าม deploy หลัง 16:45 | พูดตรงว่าขั้นนี้ยังไม่เสถียร |

recording ใช้ตามกติกาใน [VIDEO-SCRIPT](VIDEO-SCRIPT.md) (ติดป้าย "RECORDED ... not live" ตลอดคลิป)

## ตารางเวลา 16:45–20:30

| เวลา | ทำอะไร | ใคร |
|---|---|---|
| 16:45 | deploy freeze, `pg_dump`, ส่งงาน ([SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md)) | lead + C |
| 17:00 | code freeze ของผู้จัด · warm-up · ซ้อม loop หนึ่งรอบจับเวลา | ทุกคน |
| 17:15–19:30 | Round 1: กรรมการเวียนโต๊ะ | Speaker + Driver + Backstop |
| 19:30 | finalist บนเวที ถ้าเข้ารอบ ([PITCH §3](PITCH.md)) | Speaker + Driver, Backstop ถือ STANDBY |
| 20:30 | ประกาศรางวัล | — |

ความยาวต่อโต๊ะและความยาวรอบ finalist UNCONFIRMED (ถามใน [organizer-email.md](organizer-email.md)) ถ้าจริงสั้นกว่า ให้ใช้เวอร์ชัน 90 วินาที
