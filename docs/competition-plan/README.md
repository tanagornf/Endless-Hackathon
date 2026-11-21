# คู่มือสร้าง Papi/Nless ใหม่จากศูนย์สำหรับทีมสามคน

> **อัปเดต 20 พ.ย. 2569 (ค่ำ):** [PLAN.md](../../PLAN.md) ฉบับค่ำและ [DECISIONS D1–D17](../DECISIONS-2026-11-20.md) แทนเอกสารนี้: 31 ฟีเจอร์, 12 Codex sessions (orchestrator 3 + worker 9), สร้างจาก [build specs](../specs/README.md) ไม่เปิดโค้ด Papi, production บน Render, dev บน Neon · เอกสาร 01–07 ในโฟลเดอร์นี้เป็นข้อมูลประกอบเท่านั้น
>
> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** ฉบับปัจจุบันคือ [PLAN.md](../../PLAN.md) + prompt ใน [prompts/](../../prompts/README.md) + [AGENTS.md ฉบับใหม่](templates/AGENTS.md) (แบ่งตามฟีเจอร์ 3 คน × 3 lanes, อ่านโค้ด Papi ที่ `../papi-ref` แบบ read-only ได้) ถ้าเนื้อหาในชุดนี้ขัดกัน ให้ยึด PLAN.md และ prompts/

เอกสารชุดนี้เป็นแผนและเครื่องมือประสานงานที่เตรียมก่อนการแข่งขัน เป้าหมายยังเป็น **สร้างความสามารถครบทุกระบบขึ้นใหม่** โดยไม่คัดลอก implementation เดิม ส่วนความสมบูรณ์จริงต้องรายงานตามหลักฐานในวันงาน

เริ่มที่ [แผนสำหรับทีมรีวิว](../../PLAN.md) แล้วใช้ [06 คู่มือวันแข่ง](06-day-of-runbook.md) เป็นหน้าหลักระหว่างพัฒนา วันที่วางแผนไว้คือ **21 พฤศจิกายน 2569 เวลา 10:00–17:00 น. Asia/Bangkok** ให้ยึดคำชี้แจงล่าสุดของผู้จัดหากมีการเปลี่ยนแปลง

## เอกสารตามลำดับการใช้งาน

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| [01 บัญชีความสามารถ](01-product-inventory.md) | ตรวจขอบเขต 47 กลุ่มความสามารถและพฤติกรรมที่ต้องพิสูจน์ |
| [02 สถาปัตยกรรมและ contracts](02-architecture-contracts.md) | ตกลงโครงสร้าง โฟลเดอร์ การ import, HTTP, schema และ ownership |
| [03 ลำดับสร้างและแบ่งงาน](03-build-order-and-ownership.md) | ดูเวลา dependencies เจ้าของงาน และ checkpoint |
| [04 GitHub บอร์ด และ Codex](04-github-board-codex.md) | ตั้ง workflow สำหรับ clone, branch, PR, review, merge และบอร์ด |
| [05 Prompt pack](05-prompts.md) | ส่งคำสั่งให้ Codex ตามบทบาทและแต่ละ task |
| [06 คู่มือวันแข่ง](06-day-of-runbook.md) | เปิดเครื่อง → รับงาน → พัฒนา → รวม → ตรวจ → ส่งงาน |
| [07 Validation งบ และ demo](07-validation-and-demo.md) | ตรวจ acceptance, งบ, provenance, การสาธิต และการส่ง |
| [Feature backlog](feature-backlog.csv) | 36 กลุ่มงานพร้อม owner, dependencies, acceptance และความเสี่ยง |
| [SPEC](templates/SPEC.md) | สเปกพฤติกรรมสำหรับแจกให้ Codex ทั้งสามคน |
| [Feature status เริ่มต้น](templates/FEATURE_STATUS.csv) | ledger เริ่มต้น UNIMPLEMENTED ทุกแถว |
| [Templates](templates/) | AGENTS, CONTRACT, TASK, BOARD, BASELINE และ EVIDENCE |
| [Board helper](tools/team-board.ps1) | อ่าน/ส่งสถานะงานผ่าน GitHub issue ตามคำสั่งของทีม |
| [Preflight](tools/preflight.ps1) | ตรวจโปรแกรมบน PATH แบบอ่านอย่างเดียว |

## วิธีใช้ชุดนี้

1. เลือกคนจริงสำหรับ **A: UI**, **B: domain + AI + feature DTO**, **C: platform + DB + integration** แล้วให้แต่ละคนรีวิว scope กับเวลาที่มี
2. เตรียมเครื่องมือ ฐานข้อมูล สิทธิ์ Codex/API และบัญชีทดสอบก่อนงาน โดยไม่ใส่ credentials ใน Git
3. ตกลงว่าจะใช้ repository implementation แยก หรือใช้ repo นี้ต่อด้วย baseline ที่เปิดเผย ตรวจข้อกำหนดผู้จัดก่อนใช้เอกสารและเครื่องมือที่เตรียมไว้
4. เริ่ม implementation เมื่อได้รับอนุญาต A ทำ UI จาก fixtures, B ทำ domain ตาม contract, C ทำ platform พร้อมกัน แล้วส่ง PLATFORM_READY ตาม checkpoint
5. แยก clone/branch และพื้นที่เขียน ส่งงานเป็น PR รวมเป็นระยะ แล้วตรวจ release จาก SHA ที่ส่งจริง

บอร์ดใช้ส่งข้อความและ handoff ไม่ล็อกไฟล์ ไม่ sync Git และไม่ปลุก Codex ที่จบ turn แล้ว การแยกพื้นที่เขียนกับ ownership เป็นวิธีหลักในการลดงานชนกัน

## นำไปใช้ใน repo implementation เมื่อผู้จัดอนุญาต

> **แทนที่แล้ว (18 พ.ย.):** ตารางด้านล่างเป็นของแผนเดิม copy list ที่ใช้จริงอยู่ใน [prompts/C1-setup.md](../../prompts/C1-setup.md) ข้อ 0.2: `AGENTS.md`, `contracts.ts`, `.env.example`, `SPEC.md`, `.gitignore` ไปที่ root, `docs/` และ `prompts/` copy ทั้งโฟลเดอร์ที่ path เดิม, `tools/team-board.ps1` ไปที่ `tools/` ส่วน `docs/FEATURE_STATUS.csv` C1 (F36) สร้างจาก `EVIDENCE.md` ตอนท้ายวัน

| จากชุดนี้ | ที่อยู่ใน repo implementation |
|---|---|
| templates/AGENTS.md | AGENTS.md |
| templates/SPEC.md | docs/SPEC.md |
| 02-architecture-contracts.md | docs/ARCHITECTURE.md |
| templates/CONTRACT.md | docs/CONTRACT.md |
| feature-backlog.csv | docs/FEATURE_BACKLOG.csv |
| templates/FEATURE_STATUS.csv | docs/FEATURE_STATUS.csv |
| templates/TASK.md | docs/tasks/A, B หรือ C ตามเจ้าของ |
| templates/SOURCE-BASELINE.md | docs/SOURCE-BASELINE.md |
| templates/EVIDENCE.md | evidence/A, B, C และ final release |
| templates/.gitignore, templates/.gitattributes | root ของ repo implementation |
| tools/team-board.ps1, tools/preflight.ps1 | tools/ โดยเปิดเผยว่าเตรียมไว้ก่อน |

อย่านำ template AGENTS ไปทับ checkout ผลิตภัณฑ์เดิม C สร้าง docs/TEAM.md และ docs/TASKS.md จากข้อมูลที่ทีมตกลงจริง คำสั่ง setup ในคู่มือเป็นขั้นตอนสำหรับ implementation ไม่ต้องรันเพื่อรีวิวแผน

## สถานะและข้อจำกัด

ทุก feature ในชุดนี้เริ่มเป็น **U: ยังไม่มี implementation** R หมายถึงพฤติกรรมใหม่รันจริงมีหลักฐานพร้อม provider environment; S หมายถึง workflow และ persistence รันครบแต่ผลภายนอกจำลอง; A หมายถึง adapter/interface/replay ที่ยังไม่พิสูจน์ workflow ครบ

ทีมมี 21 person-hours ส่วน effort ของ first functional slices รวมใน backlog ประมาณ 29–69 person-hours เป็นประมาณการตรวจความเสี่ยง ไม่ใช่ benchmark Codex หรือคำรับประกัน production parity แผนยังเก็บทุกระบบไว้และต้องรายงานงานที่ไม่เสร็จตามจริง

งบ API เป็นสิทธิ์ **US$100 ต่อคน รวมมูลค่า US$300 สำหรับสามคน** ต้องตรวจ expiry, model access และ rate limits ของแต่ละบัญชี ไม่ถือว่าเครดิตย้ายรวมเป็น wallet เดียวได้ สิทธิ์ ChatGPT/Codex ต้องตรวจแพ็กเกจจริง

## ตรวจเครื่องมือ workflow

จาก root ของ repository แผนนี้ รัน offline test ของ board helper ได้:

```powershell
pwsh -NoProfile -File .\docs\competition-plan\checks\test-team-board.ps1
```

ตัวทดสอบใช้ gh จำลอง ไม่เรียก GitHub หรือส่งข้อความจริง ผลนี้ตรวจเครื่องมือประสานงานเท่านั้น ไม่ใช่ผลทดสอบแอปที่จะแข่งขัน

## แหล่งข้อมูลและ provenance

จัดทำแผนต้นฉบับ 17 พฤศจิกายน 2569 และจัดสำเนาสำหรับทีมรีวิวใน repository นี้ โดยไม่นำ source แอปเดิม ข้อมูลลูกค้า credentials หรือ raw source inventory ขึ้นมา สถานะ provider ต้องตรวจใหม่ในวันงาน

อ้างอิง: [กำหนดการ/FAQ ผู้จัด](https://luma.com/39zve8ph), [GitHub CLI](https://cli.github.com/manual/), [Git worktree](https://git-scm.com/docs/git-worktree), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [แนวคิด Agent Board](https://github.com/azizu06/hackathon-agent-board)
