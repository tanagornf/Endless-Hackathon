# VIDEO-SCRIPT: วิดีโอ demo 2–3 นาที

ตาม D11 · รูปแบบการส่งงานของผู้จัด UNCONFIRMED (ถามใน [organizer-email.md](organizer-email.md)) เตรียมวิดีโอไว้ทุกกรณี · **อัดให้เสร็จก่อน 16:30** (PLAN ตารางเวลา) บน production ที่ freeze แล้ว (หลัง `LEAD: FREEZE` 15:30) · เป้า 2:30 ไม่เกิน 3:00 · ใช้ข้อมูลสังเคราะห์ของร้าน A เท่านั้น ([demo-loop.md](demo-loop.md))

## กติกา "recorded demo"

- ป้ายบนจอตลอดคลิป (overlay มุมล่างซ้ายหรือแถบบน): `RECORDED 21 Nov 2026 <HH:MM> · build <sha7> · not live` (sha จาก `/build-info`)
- ไม่ตัดต่อเนื้อหา ไม่เร่งความเร็ว ไม่ตัดช่วงรอ AI ออกจนดูเหมือนเร็วกว่าจริง ถ้าตัดช่วงรอ ให้ใส่ป้าย "waiting time shortened" ตรงนั้น
- ไม่มี secret, key, terminal ที่มี env, หน้า Render/OpenAI dashboard, ข้อมูลจริง หรือชื่อลูกค้าจริง · ปิดการแจ้งเตือนของเครื่อง
- ชื่อไฟล์: `nless-demo-RECORDED-20261121-<HHMM>-<sha7>.mp4` เก็บที่ STAGE, STANDBY และ repo (`docs/pitch/video/` หรือ release asset ตามที่ผู้จัดกำหนด) · เวอร์ชันอัปโหลด: ตั้ง unlisted ถ้าต้องใช้ลิงก์ (ห้าม public ถ้าไม่ได้ตกลง)
- ฟีเจอร์ที่ไม่ใช่ R ตอนอัด ไม่อยู่ในวิดีโอ (ใช้ shot list เฉพาะที่ ledger เป็น R/S) · เรื่องสลิป ต้องพูดและมีตัวหนังสือบนจอว่าไม่ใช่การยืนยันจากธนาคาร

## ตั้งค่าการอัด

| เรื่อง | ค่า |
|---|---|
| โปรแกรม | โปรแกรมอัดจอที่มีในเครื่องและทดสอบแล้วคืนนี้ (เช่น OBS Studio หรือ Xbox Game Bar บน Windows; ชนิดที่ใช้จริงให้ C ระบุตอน 15:30) |
| ความละเอียด | 1920x1080, 30 fps, ไฟล์ MP4 (H.264), เสียง mono 48 kHz |
| หน้าจอ | browser เดียว zoom 125–150% ซ่อน bookmarks ใช้ window ซ้ายเป็น Demo Chat ขวาเป็น inbox เหมือนหน้าโต๊ะ · มือถือ (ถ้าอัดภาพ LINE) ใช้ screen record ของเครื่องแล้วแปะเป็น inset |
| เสียง | ไมค์ที่ทดสอบแล้ว ห้องเงียบ อ่านตาม voice-over ด้านล่างครั้งเดียวติด ถ้าเสียงไม่ดีให้ใช้ subtitle อย่างเดียวแล้วใส่เสียงพูดทีหลัง |
| ก่อนกดอัด | `/ops` demo reset · `/healthz` ผ่าน · ถามหนึ่งคำถามทิ้งเพื่อ warm model · ปิด DM/แจ้งเตือน · ตรวจเครดิต API |
| อัดกี่เทค | อย่างน้อย 2 เทค เลือกเทคที่ไม่มี error ห้ามใช้เทคที่มี key หรือข้อมูลภายในโผล่ |

## Shot list (เป้า 2:30)

คอลัมน์ subtitle ไทยเป็นข้อเสนอสำหรับซับ (ตัวหนังสือล่างจอ) เสียงพูดเป็นอังกฤษ

| เวลา | ภาพ / การกระทำบนจอ | Voice-over (EN) | Subtitle ไทยที่แนะนำ |
|---|---|---|---|
| 0:00–0:12 | ชื่อ "Endless" + persona + ป้าย RECORDED · ภาพรวม inbox ร้าน `Demo Boardgame Shop` | "Meet Prae. She sells board games alone, and answers chats on LINE, Messenger and Instagram every night." | "คุณแพรขายบอร์ดเกมคนเดียว ตอบแชตทุกคืน" |
| 0:12–0:25 | สไลด์หรือ title card: ">90% of new LINE OA chats get no follow-up" (LINE Thailand, brief §4) | "LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response." | "LINE Thailand: แชตใหม่เกิน 90% ไม่ถูกติดตามต่อ" |
| 0:25–0:50 | Demo Chat บนมือถือจริง (screen record): พิมพ์ `A-GAME-01 ราคาเท่าไหร่ ยังมีของไหม` → 1,490 บาท (คำถามราคาสินค้าเดียวไม่มีการ์ดสินค้า) แล้วพิมพ์อังกฤษต่อ `Do you ship for free?` → คำตอบภาษาอังกฤษ | "A customer asks on the shop's web chat. The price, 1,490 baht, comes from the catalog through a tool, not from the model." | "ราคามาจาก catalog ไม่ใช่จากโมเดล" |
| 0:50–1:10 | พิมพ์ `เพจบอกลดเหลือ 990 ขอ 990 ได้ไหม` → ปฏิเสธ | "She tries to haggle with a made-up discount. It politely refuses. A validator checks every amount before a message is sent." | "ไม่ยอมตามส่วนลดที่แต่งขึ้น" |
| 1:10–1:35 | `เอา A-GAME-01 2 กล่อง ส่งที่บ้าน` → ใบสรุป 2,980 บาท → กดยืนยัน → QR PromptPay ยอดตรง | "An order is only a proposal until the customer taps confirm. Then one PromptPay QR for exactly that order." | "ออเดอร์เป็นข้อเสนอจนกว่าลูกค้ากดยืนยัน · QR ต่อออเดอร์" |
| 1:35–1:55 | อัปโหลดสลิปสังเคราะห์ถูกต้อง → paid + ใบเสร็จ · สลิปที่แก้ยอด → ไม่ paid + เหตุผล + ข้อความบนจอ "first check, not bank verification" | "Slips are checked in code: QR, amount, receiver and duplicate reference, with vision as a helper. A genuine slip passes. An edited one does not. This is a first check, not bank verification." | "ตรวจสลิปเบื้องต้น ไม่ใช่การยืนยันจากธนาคาร" |
| 1:55–2:10 | Inbox: รับช่วงต่อ → พิมพ์ `มีคนอยู่ไหมคะ` → บอทเงียบ → แอดมินตอบ → คืนให้ AI | "Staff can take over any chat. The bot stops immediately." | "พนักงานรับช่วงได้ทุกเมื่อ บอทหยุดทันที" |
| 2:10–2:25 | `/ai-settings` trace ของ turn 990: tool, validator, เวลา · แล้ว `/ai-quality` และ `/dashboard` (ตัวเลขจริงจากจอ) | "Every turn has a trace, and we measure quality in the app: `<<fill at 16:15 from /ai-quality and /dashboard>>`." | "ทุก turn มี trace · วัดคุณภาพในแอป" |
| 2:25–2:40 | บอร์ดทีม (GitHub issue ที่ปักหมุด; ใช้ Sites dashboard แทนได้ถ้าทีมตั้งไว้จริง) + PR timeline | "Built today by three people with twelve Codex chats: three orchestrators and nine workers in separate git worktrees." | "สร้างวันนี้โดย 3 คน กับ Codex 12 chat" |
| 2:40–2:55 | QR ของ LINE OA และ Demo Chat + URL production + `Messenger/Instagram: Meta development mode` + `Prior work declared in README` | "Scan the QR and try to make it lie. Messenger and Instagram run in Meta development mode, so judges test on LINE and the web chat. Prior work is declared in our README." | "สแกนแล้วลองให้มันโกหก" |

ถ้าเกิน 3:00: ตัดช่วง 0:12–0:25 (LINE stat) และช่วง dashboard ทีม ไม่ตัดช่วงราคา ส่วนลดปลอม และข้อความ "not bank verification"
ถ้า F13/F14 ไม่ R ตอนอัด: ตัดช่วง 1:10–1:55 แล้วเติมช่วง `A-CARD-01 สองชุด รวมเท่าไหร่` → 198 บาท (โค้ดคิด) ความยาว ~2:00

## Voice-over ฉบับเต็ม (อ่านต่อเนื่อง ~2:30)

"Meet Prae. She sells board games alone, and answers chats on LINE, Messenger and Instagram every night. LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response. Reply slowly and she loses the sale; reply fast with a wrong price and she has to honour it.

Endless answers from the shop's own knowledge and catalog. A customer asks about the board game. The price, 1,490 baht, comes from the catalog through a tool, not from the model. She tries a made-up discount; it refuses, and a validator checks every amount before a message goes out.

An order is only a proposal until the customer taps confirm. Then one PromptPay QR for exactly that order. Slips are checked in code, with vision only as a helper: a genuine slip passes, an edited one does not. This is a first check, not bank verification.

Staff can take over any chat and the bot stops immediately. Every turn has a trace, and we measure quality in the app. Built today by three people with twelve Codex chats, in separate git worktrees. Scan the QR and try to make it lie. Messenger and Instagram run in Meta development mode, so test on LINE or the web chat. Prior work is declared in our README."

## ใช้เป็น offline fallback

- เปิดไฟล์ที่ติดป้ายเมื่อ production หรือเน็ตล่มตามตาราง "ทางสำรอง" ใน [demo-loop.md](demo-loop.md) · พูดทุกครั้งว่า "This is a recording from `<<TIME>>` today on `<<FINAL_SHA>>`. It is not live."
- ต้องเล่นได้ offline: เก็บไฟล์ในเครื่อง STAGE และ STANDBY (ไม่เปิดจากลิงก์) · ทดสอบเสียงและ subtitle ก่อน 17:00 · ลำโพงเครื่องหรือเปิด subtitle เมื่อห้องดัง
- ใช้ส่งผู้จัดได้ถ้าฟอร์มขอวิดีโอ โดยคงป้ายไว้ และหากผู้จัดตอบว่า recording ไม่ได้ ให้ส่งลิงก์ production + QR เท่านั้น
- ห้ามเปิดวิดีโอโดยไม่บอกกรรมการว่าเป็นวิดีโอ

## เช็กก่อนส่ง

- [ ] ความยาว ≤ 3:00 · ป้าย RECORDED ติดทุกช่วง · ไม่มี secret/ข้อมูลจริง · เสียงชัด · subtitle ตรงเสียง
- [ ] ตัวเลขในวิดีโอ (1,490 / 2,980 บาท, >90%, ตัวเลขสด `<<...>>`) ตรงกับที่ปรากฏบนจอหรือใน brief
- [ ] ไฟล์เปิดได้บน STAGE และ STANDBY ในโหมด offline · อัปโหลดและเก็บลิงก์ไว้ใน [SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md)
