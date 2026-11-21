# อีเมลถึงผู้จัด: DRAFT ยังไม่ส่ง

> **DRAFT — NOT SENT.** หัวหน้าทีมส่งเองจากอีเมลที่ลงทะเบียน ห้ามแนบโค้ด ไฟล์ภายในบริษัท หรือข้อมูลลูกค้า · ฉบับสั้น 4 ข้อ ตาม D1 ([DECISIONS](../DECISIONS-2026-11-20.md)): ทีมสร้างจาก spec ของเราเอง และ **จะไม่เปิดโค้ดบริษัท จนกว่าจะมีคำตอบ "ได้" เป็นลายลักษณ์อักษร**

| ช่อง | ค่า |
|---|---|
| To | `regionalcodex_th@ultronasia.com` (บรรทัด "For more information" บนหน้า Luma https://luma.com/39zve8ph ตรวจเมื่อ 18 พ.ย. 2569) |
| From / Cc | [อีเมลหัวหน้าทีมที่ลงทะเบียน] / [อีเมลสมาชิกอีกสองคน] |
| Subject | [Team TEAM NAME] Four questions before 21 Nov: reference code, submission format, finalist length, API credits for Codex |

**ก่อนส่ง:** เติม `[TEAM NAME]`, `[NAME 1-3]`, `[COMPANY]`, `[CONTACT]` · ได้ไฟเขียวจากบริษัทก่อนเขียนว่าบริษัทอนุญาต · ส่งฉบับเดียว สองภาษาในอีเมลเดียวก็ได้

---

## ภาษาไทย

เรียน ทีมผู้จัดงาน Sea x OpenAI Regional Codex Hackathon Thailand

ทีม [TEAM NAME] ([NAME 1], [NAME 2], [NAME 3]) ขอคำยืนยันเป็นลายลักษณ์อักษร 4 ข้อก่อนวันที่ 21 พ.ย. เพื่อทำตามกติกาให้ถูกต้อง

1. **โค้ดของนายจ้างเป็น reference แบบอ่านอย่างเดียว:** สมาชิกทีมทำงานที่ [COMPANY] ซึ่งมีผลิตภัณฑ์ที่คล้ายกับสิ่งที่เราจะสร้าง ทีมเขียน spec ของตัวเองเสร็จก่อนงานและจะสร้างแอปทั้งหมดในวันงาน **เราจะไม่เปิดโค้ดของบริษัทเลย เว้นแต่ผู้จัดตอบเป็นลายลักษณ์อักษรว่าอนุญาต** ขอถามว่า ใช้ codebase ของนายจ้างเป็น reference แบบอ่านอย่างเดียว (ไม่คัดลอกเข้า repository) ได้หรือไม่
2. **รูปแบบและกำหนดการส่งงาน:** ต้องส่งอะไร (ลิงก์ repository, URL ที่ deploy, วิดีโอ, สไลด์), ส่งที่ไหน, ภายในกี่โมง (เราเข้าใจว่า 17:00) และ repository ต้อง public หรือส่งแบบ private ได้
3. **ความยาวการนำเสนอรอบ finalist:** กี่นาที (รวมถามตอบหรือไม่) และรอบ Round 1 ที่โต๊ะแต่ละทีมมีเวลาเท่าไร
4. **API credits กับ Codex:** เครดิต API ที่ผู้จัดมอบให้ใช้กับ Codex ได้หรือไม่ หรือใช้ได้เฉพาะแอปที่เราสร้าง

ขอบคุณมาก

[NAME] หัวหน้าทีม [TEAM NAME] · [CONTACT]

---

## English

Dear Sea x OpenAI Regional Codex Hackathon Thailand organizing team,

We are team [TEAM NAME] ([NAME 1], [NAME 2], [NAME 3]). Before 21 November we would like written answers to four short questions so that we follow the rules exactly.

1. **Employer's code as a read-only reference.** Our members work at [COMPANY], which has a product similar to what we will build. We wrote our own specifications before the event and will build the whole application on the day. **We will not open our company's code unless you confirm in writing that we may.** May we use our employer's codebase as a read-only behaviour reference (nothing copied into our repository)?
2. **Submission format and deadline.** What exactly do we submit (repository link, deployed URL, video, slides), where, and by what time (we understand 17:00)? Must the repository be public, or may it be private?
3. **Finalist presentation length.** How many minutes (including Q&A?), and how long is each team's slot in the Round 1 table rotation?
4. **API credits and Codex.** Can the API credits provided by the organizers be used by Codex itself, or only by the application we build?

Thank you very much.

[NAME], team lead, [TEAM NAME] · [CONTACT]

---

## หลังได้คำตอบ

| คำตอบ | ทำอะไรต่อ |
|---|---|
| ข้อ 1 = ได้ (เป็นลายลักษณ์อักษร) | บันทึกวันที่ ผู้ตอบ และข้อความใน `SOURCE-BASELINE.md` · ใช้ prior-work **แบบ B** ใน [PITCH §7](PITCH.md) · หัวหน้าตัดสินใจเองว่าจะโพสต์ `LEAD: PAPI-REF OPEN` หรือไม่ (ทีมไม่จำเป็นต้องเปิดเพื่อทำงานให้เสร็จ) |
| ข้อ 1 = ไม่ได้ / ไม่ชัด / ไม่มีคำตอบ | แบบ A (ค่าเริ่มต้น) `../papi-ref` ปิดทั้งวัน ถามเจ้าหน้าที่ที่ registration 08:30 จดชื่อผู้ตอบและเวลา |
| ข้อ 2 (ส่งงาน) | แก้ [SUBMISSION-CHECKLIST](SUBMISSION-CHECKLIST.md) ช่อง "ฟอร์มส่งงาน" ก่อน 15:30 · ถ้าต้อง public ต้องได้ไฟเขียวจากบริษัท |
| ข้อ 3 (ความยาว) | ปรับ [PITCH §2–§3](PITCH.md) และ [demo-loop](demo-loop.md) |
| ข้อ 4 (API credits) | ถ้าใช้กับ Codex ได้ แจ้ง lead ปรับงบ ([DECISIONS D4](../DECISIONS-2026-11-20.md)) ถ้าไม่ได้หรือไม่ทราบ คง `UNCONFIRMED` และอย่าใช้ API key กับ Codex |

เก็บอีเมลตอบกลับเป็น PDF หรือ screenshot ไว้กับหลักฐานของทีม ห้ามโพสต์อีเมลหรือข้อมูลติดต่อบนบอร์ด
