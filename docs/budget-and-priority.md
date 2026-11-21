# งบ token และลำดับความสำคัญของฟีเจอร์

อัปเดต 20 พฤศจิกายน 2569 (ค่ำ) · ใช้คู่กับ [PLAN.md](../PLAN.md), [DECISIONS D3, D4, D17](DECISIONS-2026-11-20.md) และ [openai-api.md](openai-api.md) · ตัวเลขทุกตัวเป็น **ประมาณการของทีม ไม่ใช่ตัวเลขทางการ** ต้องเช็กราคาและ usage จริงเช้าวันงานและที่ทุก checkpoint

> **สถานะ:** tier และลำดับใน lane ด้านล่างตรงกับ [PLAN.md](../PLAN.md#tier-core-ก่อน-ส่วนเสริมทีหลัง), [AGENTS.md](competition-plan/templates/AGENTS.md), `contracts.ts` (`tier`, `LANE_ORDER`), คอลัมน์ `tier` ใน backlog และ prompts ถ้าขัดกัน ยึด PLAN.md (ตรวจด้วย `docs/competition-plan/checks/check-consistency.mjs`)

## สรุปในหนึ่งนาที

- ต่อคน: **ChatGPT Pro สำหรับวันงาน + Codex credits US$100 + OpenAI API credits US$100** (ทีม US$600 ไม่นับ Pro)
- **Codex (เขียนโค้ด):** login ด้วยบัญชี ChatGPT Pro ใช้ included usage ก่อน แล้วจึงหัก Codex credits (US$100 ≈ 2,500 credits) · ประมาณการ **~3,200–3,500 credits-equivalent ต่อคนต่อวัน** (≈US$127–139) สำหรับ orchestrator 1 + worker 3 → included usage ของ Pro ต้องรับส่วนใหญ่ และ Codex credits เป็นกันชน
- **Codex ไม่ login ด้วย API key** เว้นแต่ทั้ง included usage และ Codex credits หมด (API credits อาจใช้กับ Codex ไม่ได้: **UNCONFIRMED** ถามผู้จัดในอีเมล)
- **แอป (AI ตอนรันจริง):** dev ใช้ key ของแต่ละคนใน project **`app-dev` (hard limit US$30)** · production ใช้ key เดียวใน **`app-prod` (hard limit US$60)** → ค่าใช้จ่าย dev กระจายเท่ากันสามบัญชี งบ demo ไม่ถูกแตะ
- ต้นทุนต่อคนเท่ากันโดยโครงสร้าง: ทุกคนรัน session ชุดเดียวกันด้วย model และ effort เดียวกัน ([ตาราง](#ต้นทุน-codex-ต่อคน))
- **ไม่พอ** ถ้าใช้ `gpt-6.2-astra` (แพงกว่า Sol 4 เท่า), effort `ultra` (แตก sub-agent เอง) หรือเปิด Fast ทั้งวัน (คิด usage 2 เท่า) → ห้ามทั้งสามอย่าง และเปิด tier ถัดไปที่ checkpoint เท่านั้น

## 1. ราคาที่ใช้คำนวณ

ราคา API ของ OpenAI (เช็ก 20 พ.ย. 2569 จาก developers.openai.com/api/docs/pricing) หน่วย USD ต่อ 1M token:

| Model | Input | Cached input | Output | ใช้ทำอะไร |
|---|---|---|---|---|
| `gpt-6.2-astra` | $8 | $0.40 | $40 | **ไม่ใช้** (ทีมตัดสิน: แพงกว่า Sol 4 เท่าเกินจำเป็น) |
| **`gpt-6.2-sol`** | **$2** | **$0.10** | **$10** | **Codex: ทุก session** · **แอป: ทุกงาน text** (alias chat / fast / strong) |
| `gpt-6.1-terra` | $1 | $0.05 | $5 | ไม่ใช้ในแผน (สำรองถ้าต้องลดต้นทุน) |
| `gpt-6-luna` | $0.10 | $0.01 | $0.50 | ไม่ใช้ในแผน (สำรอง: ลด alias `fast` ผ่าน env ถ้า classifier ช้าไป) |

- prompt ที่ input เกิน 272K token คิด 2× input และ 1.5× output · cache write (TTL 30 นาที) คิด 1.25× input · reasoning token คิดเป็น output
- Codex credits ของ Sol: 50 / 2.5 / 250 credits ต่อ 1M input / cached / output (≈US$0.04 ต่อ credit; US$100 ≈ 2,500 credits) ([research brief §5](research/hackathon-brief.md))
- **Fast mode คิด usage 2 เท่า** บน model ตระกูล 6.2 และ sub-agent ใช้ความเร็วเดียวกับ parent
- Pro: ไม่มี limit ราย 5 ชั่วโมง แต่อาจมี weekly limit (ผู้ให้บริการไม่บอกขนาด) → ดูอัตราการใช้จริงที่หน้า usage ตอน 11:30

## 2. งบของ Codex ที่ใช้เขียนโค้ด (ส่วนที่กินมากที่สุด)

### ต้นทุนต่อ 1 ชั่วโมงที่ session ทำงานจริง (`gpt-6.2-sol`)

ทุก turn ของ agent ส่ง context เดิมซ้ำ (ส่วนใหญ่เป็น cached) บวก output ของ tool ใหม่และคำตอบ

| กรณี | Input ใหม่ | Cached | Output | credits ต่อชั่วโมง | ≈ USD |
|---|---|---|---|---|---|
| ต่ำ | 0.3M | 4M | 0.15M | ~63 | $2.5 |
| กลาง (worker effort medium) | 0.5M | 8M | 0.3M | **~120** | $4.8 |
| กลาง-สูง (orchestrator effort high) | 0.7M | 11M | 0.43M | **~170** | $6.8 |
| สูง | 1.0M | 15M | 0.6M | ~238 | $9.5 |

### ต้นทุน Codex ต่อคน

สมมติฐาน: worker ทำงานจริง 60% ของนาทีงานค่ากลาง (ที่เหลือรอ CI, tier, คน) · orchestrator ทำงานจริง 70% ของ 10:15–17:00 · Fast คิด 2 เท่าเฉพาะช่วงที่เปิด · debug ยาก 1 ชั่วโมงต่อคน

| รายการ | วิธีคิด | A | B | C |
|---|---|---|---|---|
| Worker สร้างฟีเจอร์ (medium, 120 credits/ชม.) | นาทีงานค่ากลาง × 60% ÷ 60 × 120 | 855 นาที → 1,026 | 892.5 นาที → 1,071 | 855 นาที → 1,026 |
| Worker อ่าน spec + แผน 10:15–10:45 | 0.5 ชม. × 60 credits ต่อ lane | 90 | 90 | 60 |
| C1 setup (medium + Fast) | 0.6 ชม. × 120 × 2 | — | — | 144 |
| Orchestrator (high, 170 credits/ชม.) | 6.75 ชม. × 70% × 170 | 803 | 803 | 803 |
| Fast ของ orchestrator (`SETUP READY`–13:00 + 15:30–17:00 ≈ 3.75 ชม.) | 3.75 × 70% × 170 | 446 | 446 | 446 |
| Fast ของ worker ที่ทำ P0 ก่อน 13:00 (2.25 ชม.) | 162 ต่อ lane | 162 (A1) | 324 (B1, B2) | 324 (C1, C2) |
| Debug ยาก 1 ชม. (xhigh + Fast) | ~1.5 × 170 × 2 | 510 | 510 | 510 |
| Sub-agent อ่านอย่างเดียว (low) | ~10 ครั้ง × 15 | 150 | 150 | 150 |
| **รวม (credits-equivalent)** | | **~3,190** | **~3,390** | **~3,460** |
| **≈ USD** | × 0.04 | **~US$127** | **~US$136** | **~US$139** |
| เทียบค่าเฉลี่ย ~3,350 | | −4.8% | +1.4% | +3.4% |

- ทั้งสามคนอยู่ใน ±5% ของค่าเฉลี่ย · ส่วนต่างมาจากจำนวน lane ที่เปิด Fast ก่อน gate เท่านั้น จึงกำหนดว่า **lane ที่เปิด Fast ได้คือ A1 · B1, B2 · C1, C2** (C3 ไม่เปิด เพราะ F04/F03 เป็นงานเล็กและทำให้ C เกินคนอื่น)
- ถ้า weekly limit ของ Pro รับไม่ถึง ~3,300 credits-equivalent ต่อคน Codex credits 2,500 จะรับส่วนที่เหลือ ถ้ายังไม่พอ ใช้เบรกงบข้อ 6
- ทั้งทีม ~10,000 credits-equivalent (≈US$400 ถ้าคิดเป็นเงิน) เทียบกับ Codex credits รวม 7,500 + included usage ของ Pro สามบัญชี

### ถ้า usage ของใครใกล้หมด

1. หัวหน้าเห็นจาก `LEAD: BUDGET` (แต่ละคนอ่านหน้า chatgpt.com/codex/settings/usage ของตัวเองแล้วบอกที่ checkpoint)
2. ทำตามเบรกงบในข้อ 6 ตามลำดับ: ปิด Fast → worker ลด effort → เหลือ orchestrator + worker 1 ตัว
3. ทั้ง included usage และ Codex credits หมดจริง: หัวหน้าตัดสินว่าจะให้ session ของคนนั้น login Codex ด้วย API key ของตัวเอง (project แยกจาก `app-dev`) หรือไม่ **ห้ามใช้ key `app-prod`** และต้องยืนยันก่อนว่า API credits ใช้กับ Codex ได้

## 3. งบของแอปตอนรันจริง (OpenAI API)

model และพารามิเตอร์ตาม [openai-api.md](openai-api.md):

| รายการ | ประมาณการ | อยู่ที่ project |
|---|---|---|
| ทดสอบแชตตอน dev ~500 turns ต่อคน · 6k input + 0.4k output ต่อ turn บน `gpt-6.2-sol` | ~$0.016/turn ไม่มี cache · ~$0.007 ถ้า prefix ถูก cache → ~$4–8 ต่อคน | `app-dev` ของแต่ละคน |
| classifier + extraction (~2 call ต่อ turn, วัดจริง ~$0.0004/call) | ~$0.0008/turn | `app-dev` / `app-prod` |
| Embeddings ของร้านทดสอบสองร้าน + query | < $1 | ทั้งสอง |
| Moderation `omni-moderation-latest` | ฟรี | — |
| อ่านสลิปด้วย vision (F14) ~100 รูป | ~$1–2 | `app-dev` ของ A / `app-prod` |
| Real eval (F37) 1–2 รอบ × ~68 เคส (56 แชต + 12 สลิป) | เพดาน `EVAL_MAX_COST_USD` (ค่าใน `.env.example` US$1.5 ต่อรอบ) · B1 ประมาณ ~US$0.8 ต่อรอบเต็ม (ยังไม่ได้วัดจริง) | `app-prod` |
| Voice realtime (F30, ถ้าทำ) ทดสอบ 30 นาที | ดูอัตราต่อนาทีใน [openai-api.md](openai-api.md#10-voice) · สำรอง $10–15 | `app-dev` ของ B / `app-prod` |
| Production: gate, smoke, demo ของกรรมการ 17:15–20:30 (~400 turns รวม Demo Chat ที่กรรมการลองเอง) | ~$5–10 | `app-prod` |
| **รวม** | **dev ~$8–20 ต่อคน · production ~$20–35** | hard limit: `app-dev` US$30 · `app-prod` US$60 |

กติกา:

- ตั้ง **hard budget limit** ที่ project (Project settings → Limits → Enforce a hard limit) เกิน limit จะได้ 429 `project_spend_limit_exceeded` การตัดไม่ได้เกิดทันที จึงตั้งเผื่อ · แอปต้องรับ error นี้ด้วยการส่งต่อให้ staff ไม่ใช่ล่ม ([F10 spec](specs/F10-ai-agent.md))
- ทุก alias ใช้ `gpt-6.2-sol` ตลอดวัน รวมตอน dev เพื่อให้ผลทดสอบเหมือนตอน demo · tests และ CI ใช้ fake mode เสมอ
- Demo Chat สาธารณะบน production มีเพดาน turn ต่อวันและ rate limit ต่อผู้ใช้ (กันงบ `app-prod` ถูกใช้หมดโดยคนนอก) ([F09 spec](specs/F09-inbox.md))
- กันงบ `app-prod` อย่างน้อย **US$20** ไว้ใช้หลัง 16:45: ช่วงกรรมการและรอบ finalist

## 4. ลำดับความสำคัญของฟีเจอร์ (tier)

วิธีเลือก: (1) อยู่บน loop หลักที่กรรมการเห็นไหม (2) ตรงกับเกณฑ์ตัดสิน (problem framing, build quality, depth of thinking, effective use of Codex) และสิ่งที่ Sea/OpenAI สนใจไหม ([research brief](research/hackathon-brief.md)) (3) ฟีเจอร์อื่นพึ่งไหม (4) ต้นทุนและความเสี่ยง provider

ตัดออกจาก scope แล้ว (ไม่ทำ ไม่รายงาน): F19 WhatsApp, F20 ประวัติ LINE, F25 ฟอร์ม, F28 แพ็กเกจ/โควตา, F29 billing, F32 help/support, F33 platform admin, F34 legal/privacy/PDPA · **ไม่มีโควตา ใช้ได้ไม่จำกัด**

### P0 — Core loop (ต้องเป็น R บน production ภายใน gate 13:00) · 11 ฟีเจอร์

| ID | ฟีเจอร์ | Lane | ทำไม |
|---|---|---|---|
| F01 | core / setup + OpenAI wrapper + deploy production | C1 | ทุกอย่างรอสิ่งนี้ |
| F35 | jobs / outbox / ops (ขั้นพื้นฐาน) | C1 | AI ตอบและส่งข้อความผ่าน jobs |
| F04 | ตั้งค่าร้าน: เปิด/ปิด AI, เวลาทำการ, answer policy | C3 | gate ของ AI |
| F03 | tenancy สองร้านแยกกัน | C3 | ความปลอดภัยพื้นฐาน; ใช้ dev login ไปก่อนได้ |
| F05 | คลังความรู้ | B1 | แหล่งข้อมูลของ AI |
| F07 | ค้นหา pgvector (OpenAI embeddings) | B1 | RAG |
| F08 | สินค้าและราคา | B1 | ราคาจริง (validator) |
| F09 | inbox + Demo Chat | A1 | ที่เห็นข้อความ และที่กรรมการลองเอง |
| F11 | takeover (ส่วนที่ทำให้บอทหยุด) | A1 | trust layer: คนตัดสินใจสุดท้าย |
| F10 | AI ตอบ (ราคา, สินค้า, ไม่รู้ = ไม่แต่ง) | B2 | หัวใจของ product |
| F17 | LINE | C2 | ช่องทางที่กรรมการสแกน QR ลองเอง |

### P1 — ความลึกของ demo + ช่องทาง · 8 ฟีเจอร์

| ID | ฟีเจอร์ | Lane | ทำไม |
|---|---|---|---|
| F02 | login จริง (แทน dev login) | C3 | build quality; ปิด dev login บน production |
| F18 | Messenger + Instagram (Meta developer app, test users) | C2 | ครึ่งของ chat commerce ที่อยู่นอก Shopee |
| F13 | orders: AI เสนอ order → ลูกค้ายืนยัน | A2 | agent ที่มีขอบเขต: ข้อเสนอที่ลูกค้ายืนยัน |
| F14 | payments: QR ต่อออเดอร์ + ตรวจสลิปจาก QR และ vision | A2 | ความเชื่อใจเรื่องเงิน (สลิปปลอม) |
| F24 | ลูกค้าและ tags (แผงข้างแชต) | A3 | inbox ดูครบ |
| F06 | นำเข้าไฟล์ (ข้อความ + CSV ก่อน แล้วค่อย URL) | B3 | "อัปโหลดชีต → ตอบราคาถูกใน X วินาที" |
| F36 | release + หลักฐาน Codex (SHA, บอร์ด, PR) | C1 | เกณฑ์ "effective use of Codex" |
| F31 | กระดิ่งในแอป (slice 1 · ตั้งค่าและ web push เป็น P2) | C3 | ทีมร้านเห็นเมื่อ AI หรืองานเบื้องหลังล้มเหลวถาวร |

ทำก่อนงาน P1 อื่น (slice ของฟีเจอร์ P0 ที่ไม่อยู่ใน gate): F10 หน้า trace ทีละคำตอบ (B2) · F11 สถานะพนักงาน + แจกแชตอัตโนมัติ (A1) · F31 slice 1 (C3) · ที่มา: [ข้อเสนอ Endless](competition-plan/ENDLESS-PRIORITY-PROPOSAL.md) ที่ทีมรับแล้ว 21 พ.ย.

### P2 — ส่วนเสริม · 11 ฟีเจอร์

**เก็บไว้เสมอ:** F37 AI evals (B1) และ F27 dashboard + ผลลัพธ์ของร้าน (B3) เพราะเป็นหลักฐาน "วัดผลได้" · F38 follow-up nudges (B2) · F39 ChatGPT-ready catalog (C1) · F12 template ข้อความ (A1) · F23 broadcast (A1) · F21 ตอบคอมเมนต์ (C2) · F15 booking (A3) · F16 calendar (A3) · F26 insights (B3) · F22 live-commerce codes (A2, ย้ายจาก P1: live/video commerce ที่ Sea เน้น ทำเมื่อ F08/F13 มีข้อมูลจริง) · ส่วนตั้งค่าและ web push ของ F31 (C3)

### P3 — ของแถม · 1 ฟีเจอร์

F30 voice realtime (B2) ทำเมื่อทุกอย่างข้างบนผ่านแล้วเท่านั้น

**ลำดับตัดเมื่อไม่ทัน (หัวหน้าตัดสินที่ 14:30):** F30 → F16 → F21 → F23 → F22 → F39 → F12 → F31 ส่วน slice 2–4 (ตั้งค่า + web push) → F26

## 5. ลำดับใน lane

| Lane | ลำดับ (tier) | นาทีงาน low–high | ค่ากลาง |
|---|---|---|---|
| C1 | F01 (P0) → F35 (P0) → F39 (P2) → F36 (P1, เริ่ม 15:15) | 225–480 | 352.5 |
| C2 | F17 (P0) → F18 (P1) → F21 (P2) | 150–390 | 270 |
| C3 | F04 (P0) → F03 (P0) → F02 (P1, ไม่ต้องรอ `LEAD: OPEN`) → F31 (P1) | 150–315 | 232.5 |
| B1 | F05 (P0) → F07 (P0) → F08 (P0) → F37 (P2) | 180–390 | 285 |
| B2 | F10 (P0) → F38 (P2) → F30 (P3) | 195–465 | 330 |
| B3 | F06 (P1) → F26 (P2) → F27 (P2) | 150–405 | 277.5 |
| A1 | F09 (P0) → F11 (P0) → F12 (P2) → F23 (P2) | 180–420 | 300 |
| A2 | F13 (P1) → F14 (P1) → F22 (P2) | 180–420 | 300 |
| A3 | F24 (P1) → F15 (P2) → F16 (P2) | 150–360 | 255 |

ค่ากลางต่อคน: **A 855 · B 892.5 · C 855** นาทีงาน (ต่างจากค่าเฉลี่ย 867.5 ไม่เกิน ±3%) รวม 2,602.5 เทียบกับ 2,520 นาทีที่มี (9 lanes × 280 นาทีจาก ~10:50 ถึง 15:30) บวกเวลาเพิ่มของ C1 ~105 นาที → เกือบทันที่ค่ากลาง จึงต้องเปิดตาม tier และตัดท้าย lane ก่อน

## 6. เปิด tier ตาม usage และเบรกงบ

ทุก session เปิดด้วยบรรทัดเดียวจาก [START.md](../START.md) และอ่าน spec (Phase 0) ตอน 10:15 แต่ **เขียนโค้ดได้เฉพาะฟีเจอร์ใน tier ที่เปิดแล้ว** หัวหน้าเปิด tier ด้วยโพสต์ `LEAD: OPEN <tier>` (hook ปลุก lane ที่รออยู่):

| Tier | เปิดเร็วสุด | เงื่อนไข | lane ที่รอ tier นี้ตั้งแต่ต้นวัน |
|---|---|---|---|
| P0 | `SETUP READY` (~10:50) | — | — |
| P1 | checkpoint 11:30 | checkpoint 1 ผ่าน และ usage ไม่เกิน 20% ต่อคน ไม่งั้นเปิดเมื่อ gate 13:00 ผ่าน | A2, A3, B3 |
| P2 | gate 13:00 ผ่าน | usage ไม่เกิน 40% ต่อคน ไม่งั้นเช็กใหม่ 14:30 | — |
| P3 | checkpoint 14:30 | P0 เป็น R, P1 เป็น R/S และ usage ไม่เกิน 55% ต่อคน | — |
| freeze | 15:30 `LEAD: FREEZE` | orchestrator + worker ที่ยังมีบั๊กต้องแก้ | — |

- **% usage ต่อคน** = ตัวเลข weekly limit ที่หน้า chatgpt.com/codex/settings/usage · ถ้า included usage หมดแล้ว นับ 100% + สัดส่วน Codex credits ที่ใช้ไป
- **ข้อยกเว้น:** C3 ทำ F02 ต่อจาก F03 ได้เลย และ C1 เริ่ม F36 เวลา 15:15 ตามนาฬิกา
- worker ที่ทำฟีเจอร์ของ tier ที่เปิดแล้วหมด: โพสต์ `NEED TO:<orchestrator> next task` แล้วรอ ห้ามเริ่ม tier ถัดไปเอง

**เบรกงบ (ที่ 11:30 / 13:00 / 14:30 หัวหน้าโพสต์ `LEAD: BUDGET A <x>% · B <y>% · C <z>%`):**

| สัญญาณ | สิ่งที่ทำ |
|---|---|
| usage ของคนใดถึง 40% | ปิด Fast ทุก chat ของคนนั้น |
| เกิน 50% ก่อน 13:00 | worker ของคนนั้นลดเป็น effort low (orchestrator ยัง high) |
| included usage หมด และ Codex credits เหลือไม่ถึง 30% | เหลือ orchestrator + worker 1 ตัว (lane ที่มีงาน tier สูงสุด) ตาม [fallback](../prompts/README.md#fallback-orchestrator--2-workers) |
| API ของ project ใดเกิน 70% ของ hard limit | หาสาเหตุก่อน (test เรียก model จริงซ้ำ, loop) แล้วหัวหน้าตัดสินเพิ่ม limit |

## 7. กติกาประหยัด token สำหรับทุก session

1. **1 ฟีเจอร์ = 1 chat ใหม่เมื่อ context ยาว** เปิดใหม่ด้วย prompt 7 (worker) หรือ prompt 10 (orchestrator) ใน [prompts/README.md](../prompts/README.md#prompt-สั้นที่ใช้ซ้ำ)
2. **อ่านเฉพาะ spec ของฟีเจอร์ที่ทำ** และส่วนของ `contracts.ts` ที่ใช้ ห้ามสั่ง "สำรวจทั้ง repo" · `../papi-ref` ปิด ([D1](DECISIONS-2026-11-20.md))
3. ใช้ `rg` แบบเจาะจง และห้ามแปะ log ยาวหรือ lockfile เข้า prompt
4. รันเฉพาะ test ของฟีเจอร์ตัวเอง (orchestrator รันทั้ง repo ชั่วโมงละครั้ง) · test ใช้ `MODEL_MODE=fake` ไม่เรียก OpenAI จริง
5. Model และ effort ตาม [ตาราง D3](../PLAN.md#model-และ-effort-ของ-codex-ต่อประเภทงาน): Sol เท่านั้น · orchestrator high · worker medium · งานกล low · **ไม่ใช้ Astra ไม่ใช้ `ultra`**
6. Fast เปิดเฉพาะ: C1 setup · orchestrator ตั้งแต่ `SETUP READY` ถึง 13:00 และ 15:30–17:00 · worker A1, B1, B2, C1, C2 ก่อน 13:00 เมื่อ usage ของคนนั้นยังไม่ถึง 40% · debug ยาก
7. Stop hook ปลุกเฉพาะโพสต์ที่ถึง lane จริง (การปลุกแต่ละครั้งส่ง context ซ้ำ) · orchestrator ถูกปลุกเพิ่มทุก 30 นาทีเพื่อ `STAGE` เท่านั้น
8. Session ที่รอ tier หรือรองาน **จบ turn แล้วรอ hook** อย่าสั่งให้ "หาอะไรทำ" ระหว่างรอ
9. Sub-agent ของ orchestrator: อ่านอย่างเดียว effort low ไม่เกิน 3 ตัวพร้อมกัน และปิด Fast ของ orchestrator ก่อนเปิดหลายตัว

## 8. ข้อที่ยังต้องยืนยันคืนนี้และเช้าวันงาน

- [ ] ทุกคนได้ ChatGPT Pro, Codex credits US$100 และ API credits US$100 แล้ว: วันหมดอายุ และ model ที่ใช้ได้
- [ ] weekly limit ของ Pro รับ 4 chat ต่อคนทั้งวันได้แค่ไหน (**UNCONFIRMED**: ดูอัตราการใช้ที่หน้า usage หลังซ้อมคืนนี้ และอีกครั้งตอน 11:30)
- [ ] API credits ใช้กับ Codex ได้ไหม (**UNCONFIRMED**: ถามผู้จัด) และเปิด auto top-up ของ Codex credits หรือไม่
- [ ] API key ของแต่ละคนอยู่ใน usage tier ไหน และ rate limit ของ model ใน [openai-api.md](openai-api.md) (รัน smoke test ผ่าน preflight `-OpenAI`)
- [ ] hard limit ตั้งแล้ว: `app-dev` US$30 ทุกคน · `app-prod` US$60 (หัวหน้า)
