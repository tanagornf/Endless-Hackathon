# แผนบอร์ดส่งต่องานสำหรับ Codex สามคน — 20 พ.ย. 2569

**เริ่มด้วยบอร์ดเดิมและทำให้ส่งงานข้ามเครื่องได้หนึ่งรอบ** ให้ A0, B0 และ C0 ประสานงานระหว่างคน ส่วน worker ลงมือใน lane ของตัวเอง Codex ส่งข้อความผ่าน `team-board.ps1` และแต่ละ lane รับข้อความที่ถึงตัวเองผ่าน hooks ข้อเสนอนี้เป็น Markdown สำหรับเตรียมงาน การพัฒนาใหม่เริ่มเมื่อเปิดแข่ง 10:00 น. วันที่ 21 พ.ย. ส่งงานเวลา 17:00 น. ตามเวลาประเทศไทย [กำหนดการและกติกาผู้จัด](https://luma.com/39zve8ph)

## Codex collaboration options

Checked 21 Nov 2026. Keep the pinned GitHub issue as the message board across the team's three accounts. Use Codex-native tools for work within each person's chats and for review across PRs. The documented options below leave the Windows worktrees and hook routing in place.

| Option | How the team can use it |
|---|---|
| Codex desktop chat coordination and subagents | Each lead can steer their own local chats and delegate read-only diff review or test triage to the existing agents. Keep the assigned lane in charge of edits. [Desktop release notes](https://learn.chatgpt.com/docs/whats-new) · [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) |
| Codex PR review | Run `/review` from a separate lane against the PR branch and `main`. If the fresh event repo is connected and Code Review is enabled, request `@codex review` on a representative PR for an independently visible review. Keep the regular CI and merge rules. [Local review](https://learn.chatgpt.com/docs/code-review) · [GitHub review](https://learn.chatgpt.com/docs/third-party/github) |
| ChatGPT Space | Optional invite-only page for the three people to collect the writeup and evidence links. Collaborators can comment or mention ChatGPT, subject to their access. Lane assignments and wake-ups stay on GitHub. [Space collaboration](https://learn.chatgpt.com/docs/space/collaboration) · [Agents in Space](https://learn.chatgpt.com/docs/space/agents) |
| Linear, Slack, and Microsoft Teams | Linear offers issue mentions and follow-ups that start or continue cloud chats. Slack and Teams can delegate cloud coding where enabled for Enterprise. These require setup and a supported cloud environment, so omit them from Day setup. [Codex in Linear](https://learn.chatgpt.com/docs/third-party/linear) · [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) |
| Codex GitHub Action and MCP Events | The official Action can run repeatable Codex jobs from GitHub events on CI runners. MCP Events can deliver messages to cloud Work chats. Consider those for later automation if needed. Neither provides direct routing to the team's already-running local worktree chats. [Codex Action](https://learn.chatgpt.com/docs/github-action) · [MCP Events](https://developers.openai.com/plugins/build/mcp-events) |

OpenAI documents local chat coordination, read-only snapshots from macOS, and handoff to a connected host. The documentation does not establish that three separate accounts can co-steer live Windows worktree chats. Team Tasks run scheduled or event-triggered work in the cloud. [Codex snapshots](https://learn.chatgpt.com/docs/use-chatgpt#share-a-read-only-snapshot-of-a-codex-thread) · [Host handoff](https://learn.chatgpt.com/docs/remote-connections) · [Team Tasks](https://learn.chatgpt.com/docs/enterprise/teams)

## กิจกรรมล่าสุดที่ตรวจแล้ว

- GitHub `main` อยู่ที่ `aa016de` หลัง PR #7 เวลา 22:44 น. สคริปต์บอร์ดและ hooks ยังเหมือนรุ่นที่ซ้อม ณ เวลาที่ตรวจ repo เตรียมงานยังไม่มี Issue บอร์ดให้ปักหมุด ส่วน repo แข่งและเลข Issue ยังเป็น placeholder ในแผน ให้ Lead ยืนยันลิงก์วันแข่ง [GitHub main](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/tree/aa016de4323da5465afe30e2edb5e7cebb413d3a) · [README](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/README.md)
- PR #4 ยังเปิดอยู่ ผลซ้อม 75 assertions ครอบคลุมเจ้าของไฟล์และการรวมงานใน Git ชั่วคราว ใช้แนว handoff ที่มี SHA และหลักฐานตรวจสอบได้ และยึดแผน lane จาก `main` สำหรับวันแข่ง [PR #4](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/pull/4) · [ผลซ้อมใน PR](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/944b93da9b1520c09202e61a8b356a47d6e07938/docs/team-coordination/checks/RESULTS.md)
- บอร์ด Sites จริงมี TASK กับ STAGE ที่ส่งผ่าน PowerShell และ NOTE จากหน้าเว็บครบสามบัญชี การส่งผ่าน PowerShell บนโฮสต์ทดสอบจากเครื่องเดียวโดยจำลอง GitHub ขั้นต่อไปคือยืนยัน Codex hooks และ GitHub Issue จริงจากเครื่องทั้งสาม [ขั้นตอนทดสอบสามเครื่อง](sites-dashboard.md#4-ทดสอบก่อนวันงาน-เฉพาะทีมที่ใช้-sites-ทั้ง-3-เครื่อง)

## ชุด 1 สำคัญ — ส่ง รับ ส่งต่อ และกลับมาทำต่อได้

### ข้อมูลที่ต้องกรอกเพิ่ม

| ตำแหน่ง | ข้อมูลขั้นต่ำ |
|---|---|
| หัว Issue บอร์ด | ลิงก์ repo แข่งและ Issue ที่ปักหมุด คน A/B/C และ GitHub login ใครเป็น Lead บัญชีใดดูแล lane/worktree ใด และ SHA ตั้งต้น ใช้แม่แบบ `BOARD-ISSUE.md` |
| `TASK TO:<lane>` | ผู้รับหนึ่ง lane, `ref` ของ feature/slice, ผลงานหนึ่งอย่างที่ต้องส่ง และเกณฑ์ตรวจผ่าน ใส่ dependency หรือเวลาที่ต้องได้เฉพาะเมื่อกระทบงานคนอื่น |
| `NEED` / `BLOCKED` / `FIX` | `ref` เดิม ผู้รับที่ช่วยต่อได้ สิ่งที่ติด และสิ่งที่ขอให้ทำ เพิ่มลิงก์หลักฐานหรือเวลาที่ต้องตอบถ้าจำเป็น |
| `DONE` | `ref` เดิม ผลตรวจสั้น ๆ ลิงก์ PR หรือ SHA ที่รวมแล้ว และ `TO:<lane>` ของคนที่รับผลต่อ |
| `STATUS` / `STAGE` | งานที่กำลังทำ สิ่งที่ติด และงานถัดไปตามลำดับ ให้ A0/B0/C0 สรุปทุก 30 นาที ทั้งสองประเภทอัปเดตการ์ดแบบไม่ปลุก agent |

ใช้ `ref` เดิมตลอดอายุงาน เช่น `F09-s1` เพื่อให้คนตามงานเดียวกันได้ทั้ง Sites และ GitHub ส่วน `-PostId` ระบุข้อความหนึ่งรายการ ใช้ค่าเดิมเมื่อส่งข้อความเดิมซ้ำ และใช้ค่าใหม่สำหรับความคืบหน้าหรือการแก้คำสั่ง ใช้ข้อความใหม่เมื่อต้องชี้แจงโพสต์เก่าเพื่อให้ hook เห็น [แม่แบบ Issue และรูปแบบข้อความ](../competition-plan/templates/BOARD-ISSUE.md)

ตัวอย่างหนึ่งงานจาก A0 ไป A1 แล้วส่งผลให้ B2

~~~text
TASK TO:A1 F09 ref=F09-s1 รับข้อความเข้า Demo Chat ผ่านเมื่อส่งแล้วเห็นใน inbox
NEED TO:C0 ref=F09-s1 ขอให้ C3 ยืนยัน tenant fixture ก่อน 12:20
DONE F09 inbox merged abc1234 ref=F09-s1 ทดสอบส่งและเปิด inbox ผ่าน TO:A0 TO:B2
~~~

### วิธีรับส่งและเช็กพร้อมใช้

1. ให้ A0/B0/C0 จัดลำดับงานกับคนของตัวเอง เมื่อจะส่งข้ามคน ระบุผู้รับและ `ref` ให้ชัด เจ้าของไฟล์และ tier ใช้ตามแผนเดิม ให้ Lead ตัดสินใจกรณีย้ายงานข้ามคน
2. ลองด้วย issue ซ้อมส่วนตัวบน GitHub จริง วน C1 → B1 → A1 → C1 ผ่าน `team-board.ps1` ให้ครบสามเครื่อง ผ่านเมื่อภาษาไทยถึง lane เป้าหมาย เห็นโพสต์บนทั้งสองช่องทาง และส่ง PostId เดิมซ้ำแล้วแต่ละช่องทางมีหนึ่งรายการ
3. ให้ Codex รับงานผ่าน hook จริงหนึ่งรอบ แล้วทดสอบอ่านงานใหม่ด้วย `BOARD_SOURCE=github` เมื่อ Sites ขัดข้อง ค่านี้เลือกช่องทางอ่าน ส่วนการเขียนยังพยายามส่ง Sites ถ้ายังตั้งค่าอยู่ หากต้องใช้ GitHub เพียงช่องทางเดียวให้ทำตามคู่มือบอร์ด
4. Stop hook รอได้ประมาณ 9 นาที ถ้าแชตหยุด ให้คนเปิด turn ใหม่ใน lane นั้นเพื่อรับงานต่อหรืออ่านด้วย `team-board.ps1 read` ใช้หน้า dashboard หรือ `watch` สำหรับคนที่ดูสถานะอย่างเดียว เพราะ `watch` มี cursor แยก จด branch/SHA ล่าสุด สิ่งที่ทำแล้ว และงานถัดไปไว้กับ `ref` เมื่อต้องพักหรือสลับเซสชัน
5. จดผลต่อเครื่องใน `SOURCE-BASELINE.md` พอมี repo แข่งแล้ว ให้ Lead ยืนยัน Issue ที่ปักหมุดและตั้งปลายทางทั้งสามเครื่องตามลิงก์เดียวกัน

อ้างอิง [คู่มือบอร์ด](sites-dashboard.md) · [Stop hook บน GitHub](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/docs/competition-plan/templates/codex/hooks/stop.ps1#L30-L52) · [SOURCE-BASELINE](../competition-plan/templates/SOURCE-BASELINE.md)

## ชุด 2 รอง — ทำเมื่อผ่าน Core-loop Gate 13:00 และทีมยังติดจากการใช้บอร์ด

| สิ่งที่เพิ่ม | ทำเมื่อ | ผ่านเมื่อ |
|---|---|---|
| ลิงก์ไปฟีดและมุมมองงานถึง lane ของฉัน | ต้องเลื่อนผ่านการ์ดหรือกรองซ้ำบ่อย | จากหัวบอร์ดเข้าถึงงานที่ `TO:` มาถึง lane ได้ในสองขั้น ใช้ข้อมูลจากฟีดเดิม |
| สรุปงานติดค้าง | ต้องถามซ้ำว่าใครรับช่วงหรือกำลังรออะไร | เห็น `ref` เจ้าของ สิ่งที่ต้องทำต่อ อายุงาน และลิงก์หลักฐาน โดยอัปเดตผ่าน STATUS/STAGE เดิม |

## ชุด 3 เสริม — ทำเมื่อมีเวลาเหลือก่อนหยุดเพิ่มฟีเจอร์ 15:30

แสดงเลขโพสต์หรือลิงก์ตรงในฟีดและติดป้ายข้อมูลซ้อม แยก NOTE หน้าตาเหมือนกันได้ง่ายขึ้น เก็บงานสรุปอัตโนมัติหรือแสดงความสัมพันธ์ข้ามงานไว้ต่อเมื่อช่วยแก้ปัญหาที่พบจริง

## เมื่อต้องประหยัดโทเคนและเวลา

- เก็บชุด 1 กับ P0 ก่อน พักชุด 3 แล้วพักชุด 2 ใช้ `STAGE` และ `STATUS` สำหรับรายงานทั่วไป และปลุก lane เฉพาะเมื่อมีงานหรือสิ่งที่ต้องตอบ
- เขียนโพสต์สั้น 1–3 บรรทัด ใส่ลิงก์ PR/หลักฐานแทนประวัติแชตหรือ log เต็ม เก็บข้อมูลรับรองไว้ใน secret config ของเครื่อง ใช้ `NOTE TO:<lane>` ยืนยันรับเฉพาะงานข้ามคนที่ต้องอาศัยคำตอบทันที ถ้า hook ตัดข้อความที่ประมาณ 1,500 ตัวอักษร ให้เปิด `.team-board/hook-<event>.txt` เฉพาะเมื่อขาดรายละเอียดที่ต้องใช้ [ตัวจำกัดข้อความของ hook](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/docs/competition-plan/templates/codex/hooks/board-hook-common.ps1#L150-L160)
- Lead เช็กและโพสต์ usage เวลา 11:30, 13:00 และ 14:30 ตาม PLAN ถึง 40% ให้ปิด Fast ของคนนั้น เกิน 50% ก่อน 13:00 ให้ worker ลด effort เป็น low เมื่อ included usage หมดและ credits เหลือต่ำกว่า 30% ให้เหลือ orchestrator กับ worker ที่มีงานสำคัญสุดหนึ่งตัวต่อคน [เกณฑ์งบและกำหนดการ](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/PLAN.md)

## สองจุดที่ควรตกลงก่อนวาง prompt

- **C1** ใช้ `SETUP READY` ปล่อย lanes เมื่อผ่าน dev ตาม S8 แล้วให้สถานะ `R` เมื่อผ่านหลักฐาน production ใน S9 ตามเกณฑ์ F01 §11.2 [C1 setup](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/prompts/C1-setup.md#L118)
- **C3** ส่ง F03 S1 ก่อน 12:45 เพื่อให้ C0 ตรวจ login/tenant ตอน 13:00 ส่วนที่เหลือของ F03 ทำต่อหลัง Gate ตามลำดับงาน [C3 worker](https://github.com/Ikkyuuuu/Sea-x-OpenAI-Regional-Codex-Hackathon-Thailandd/blob/aa016de4323da5465afe30e2edb5e7cebb413d3a/prompts/lanes/C3.md#L93)
