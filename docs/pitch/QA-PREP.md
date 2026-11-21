# QA-PREP: คำถามที่กรรมการน่าจะถาม

ใช้ที่โต๊ะ (Round 1) และเวที · แต่ละข้อมี **key line (EN)** ให้พูดตามนั้น + ใจความภาษาไทย + สิ่งที่เปิดให้ดู · ทุกคนในทีมต้องตอบข้อ 1, 2, 3, 6, 7 ได้เหมือนกัน · ถ้าไม่ทราบ ให้พูดว่าไม่ทราบ ห้ามเดา · ตัวเลขนอกทีมมาจาก [hackathon-brief.md](../research/hackathon-brief.md) เท่านั้น ตัวเลขของเรามาจากหน้า `/ai-quality`, `/dashboard`, `model_usage`, git ตอน 16:15 (`<<fill at 16:15 from /ai-quality and /dashboard>>`) · ตัวเลข/ข้อเท็จจริงที่ยังยืนยันไม่ได้ทำเครื่องหมาย UNCONFIRMED

## 1. วันนี้สร้างอะไร อะไรมีมาก่อน (prior work)

- **EN:** "Before 10:00 we prepared only documents and interface declarations: the plan, written specs, prompts, a TypeScript contracts file with no implementation, the board script and Codex hooks, all at baseline `<<BASELINE_SHA>>`. Every line of application code was written today with Codex. The git history from baseline to `<<FINAL_SHA>>` shows it."
- **TH:** เตรียมก่อนงานเฉพาะเอกสารและการประกาศ interface (แผน, spec, prompt, contracts, สคริปต์บอร์ด, hooks) ทุกบรรทัดของแอปเขียนวันนี้ ดูได้จาก git
- ถ้าถามต่อเรื่องโค้ดบริษัท: อ่านย่อหน้าใน [PITCH §7](PITCH.md) ที่เลือก ห้ามพูดสด · แบบ A (ค่าเริ่มต้น): "We never opened our company's code." แบบ B เฉพาะเมื่อมีคำตอบเป็นลายลักษณ์อักษร
- เปิด: `git log <<BASELINE_SHA>>..<<FINAL_SHA>> --stat`, ไฟล์ baseline

## 2. ทำไมไม่ใช้แชต Shopee หรือ LINE Seller AI Automation ที่มีอยู่แล้ว

- **EN:** "Shopee's chat assistant lives inside Shopee, and only for selected sellers. LINE has announced Seller AI Automation in MyShop. Endless is for the shops chatting on LINE, Messenger and Instagram today, and its focus is trust: prices only from the catalog, orders only after the customer confirms, a per-order PromptPay QR, and measured quality. We complement Shopee; we don't integrate with it today."
- **TH:** Shopee Chat AI Assistant อยู่ในแอป Shopee และมีเฉพาะ seller ที่เลือก (brief §2) · LINE กำลังเปิด "Seller AI Automation" ใน MyShop (brief §4) เราไม่ทราบรายละเอียดฟีเจอร์ของเขา จึงไม่เปรียบเทียบรายฟีเจอร์ · จุดต่างของเราคือขอบเขตของ agent, QR ต่อออเดอร์, eval ที่เปิดให้ดู
- ห้ามพูดว่าเขาทำไม่ได้หรือทำแย่กว่า · ห้ามบอกว่าเชื่อมกับ Shopee/LINE MyShop · UNCONFIRMED: ฟีเจอร์ละเอียดของ LINE Seller AI Automation
- เปิด: สไลด์สำรอง (ตารางเปรียบเทียบ) ถ้ามี

## 3. ถ้าโมเดลแต่งราคาล่ะ (hallucinated prices)

- **EN:** "The model never produces a price. It calls a tool that reads the catalog, and a deterministic validator checks every amount in the reply before it is sent. If a number isn't in the catalog result, the message is blocked and the customer gets a safe answer or a handover. We also test it: `<<fill at 16:15 from /ai-quality and /dashboard>>`, with bargaining and jailbreak cases in the eval set. It's a small set written by us, so it's a signal, not a guarantee."
- **TH:** ราคามาจาก tool ที่อ่าน catalog, validator ตรวจทุกตัวเลขก่อนส่ง, ไม่ผ่านก็ไม่ส่ง · มี eval ทั้งภาษาไทยและอังกฤษหมวด ต่อรอง/jailbreak ([F37](../specs/F37-evals.md)) ตัวเลขจากหน้า `/ai-quality`
- เปิด: ถามสดว่า "ลดเหลือ 990" · เปิด trace (`/ai-settings`) · [F10](../specs/F10-ai-agent.md) §1

## 4. สลิปปลอม รวมถึงสลิปที่ AI สร้าง

- **EN:** "We don't claim to verify slips with the bank. There's no bank API here. We reduce the risk: every order has its own PromptPay QR with the amount and order reference locked; the slip's own QR is decoded and checked in code; the transaction reference must not repeat; amount, receiver and time must match; and a vision read is only a second opinion. When anything is uncertain, a person confirms, and that tap is audited. A well-made fake may still get through, so the shop checks the money arrived."
- **TH:** ไม่ใช่การยืนยันจากธนาคาร · ป้องกัน: QR ต่อออเดอร์, อ่าน QR บนสลิป, เลขรายการซ้ำ, ยอด/ผู้รับ/เวลา, vision เป็นตัวช่วย · ไม่แน่ใจ = พนักงานกดยืนยัน (มี audit) · ข้อความ "โอนแล้ว" ของลูกค้าไม่เปลี่ยนสถานะ
- ที่มาของปัญหา: Krungthai บอกว่าสลิปปลอมยังเพิ่มขึ้น และ ChatGPT ถูกแสดงว่าปลอมสลิปที่สมจริงได้ (brief §4) · **ไม่มีสถิติทางการ ห้ามอ้างตัวเลข**
- เปิด: สลิปสังเคราะห์ถูกต้อง vs แก้ยอด · [F14](../specs/F14-payments.md) §1, F37 สลิปสังเคราะห์ ≥ 10 แบบ (D8) · ถ้า F14 เป็น S บอกว่าเป็น sandbox

## 5. PDPA และข้อมูลลูกค้า (เก็บอะไร, store:false)

- **EN:** "What we know and can state: every OpenAI call from our wrapper sends `store: false`, and OpenAI states that API data is not used for training by default. In our own database we keep the conversations, customers' display names, orders and uploaded slip images for the shop that owns them, isolated per shop. We did not build privacy pages, data export or deletion today, so I won't claim PDPA compliance. Today's data is synthetic."
- **TH:** ยืนยันได้จากเอกสาร: ทุก call ไป OpenAI ส่ง `store:false` (ค่าเริ่มต้นของ Responses คือ store=true เก็บ 30 วัน เราจึงปิด) และข้อมูล API ไม่ถูกใช้ train เป็นค่าเริ่มต้น ([openai-api.md](../openai-api.md) หัวข้อข้อมูล/caching) · ที่เก็บในฐานข้อมูลของเราและแยกตามร้าน: แชต, ข้อมูลลูกค้าเบื้องต้น, ออเดอร์, รูปสลิป · **ไม่ได้สร้างหน้า PDPA, export/ลบข้อมูล, consent** ใน scope วันนี้ (PLAN: ตัดออกจาก scope) · **UNCONFIRMED:** ระยะเวลาเก็บข้อมูลของ OpenAI นอกเหนือจากที่เอกสารของเราระบุ, สถานที่เก็บข้อมูล, ข้อกำหนด PDPA เต็มรูป ห้ามตอบเกินนี้ · ข้อความที่เก็บไม่ลงใน log (ไม่มีข้อความลูกค้าเต็ม ไม่มีเลขบัญชีเต็ม ตาม [quality-bar](../day/quality-bar.md) §4)
- ถ้ากดต่อ: "Before real shops, the next step is a proper privacy notice, retention rules, and export and delete tools."

## 6. Responsible AI และการคุ้มครองผู้บริโภค

- **EN:** "Bounded autonomy. The AI answers only from the shop's data, can't invent prices or promise discounts, can't create an order without the customer's confirmation, can't mark an order paid on its own word, and hands over to a human on request or when unsure. Every turn is traceable, and we report features honestly as real, sandbox, fake or not done; features that aren't real are hidden."
- **TH:** agent มีขอบเขต, ลูกค้ายืนยันเอง, รับช่วงต่อได้ทุกเมื่อ, trace ตรวจย้อนหลัง, ledger R/S/A/U ซื่อสัตย์ · ตรงกับโจทย์ "responsible toward consumers, businesses and communities" (Techsauce, brief §1)
- เปิด: takeover สด, trace, ledger · ข้อจำกัดที่บอกเอง: eval เล็ก, สลิปไม่ใช่ bank verification

## 7. ตอนนี้ต้นทุนต่อบทสนทนาเท่าไร (cost per conversation)

- **EN:** "We record tokens and cost for every model call. Today's median cost per AI turn: `<<fill at 16:15 from /ai-quality and /dashboard>>`. Before the event we measured, on tests, about 0.4 thousandths of a dollar for a classifier call and about 3 thousandths for a tool-loop test turn with Sol; a short voice question costs roughly 1 to 2 cents. Production numbers will differ because real conversations have longer context."
- **TH:** บันทึก token และต้นทุนทุก call (`model_usage`) · ตัวเลขที่วัดเองก่อนงาน ([openai-api.md §15](../openai-api.md)): classifier ~US$0.0004 ต่อ call (Sol, effort low) · tool loop ~US$0.003 ต่อ turn ทดสอบ · Realtime ~US$0.02 ต่อคำถามสั้น · PDF สแกน 2 หน้า ~US$0.066 · เป็นการทดสอบสั้นและ context เล็ก ตัวเลขจริงบน production ใช้ `<<...>>` ตอน 16:15 · ทีมตั้งเกณฑ์สืบสวนถ้าเกิน ~US$0.03 ต่อ turn ([quality-bar](../day/quality-bar.md) §3)
- ห้ามคูณเป็นต้นทุนต่อร้านต่อเดือน ถ้าไม่ได้วัด

## 8. ขยายเกินแฮ็กกาธอนได้อย่างไร (scale)

- **EN:** "Honestly: today it's one server instance by design. The job queue is Postgres-backed, the scheduler is guarded by an advisory lock, and the code is the same in dev and production. To scale we'd move uploads from the instance disk to object storage, run multiple web instances, and use a connection pool, none of which changes the product logic. We haven't load-tested it, so I won't give a throughput number."
- **TH:** ตอนนี้ instance เดียว (disk ของ Render ทำให้ deploy ไม่ zero-downtime, brief §6) ขั้นถัดไป: object storage, หลาย instance, load test · **UNCONFIRMED:** ปริมาณที่รับได้ (ไม่ได้ทดสอบ)
- Meta ต้องผ่าน app review ก่อนใช้งานสาธารณะ (ตอนนี้ development mode)

## 9. วันนี้สร้างอะไร vs ก่อนหน้า (เหมือนข้อ 1) และสิ่งที่ Codex ทำ vs มนุษย์ทำ

- **EN:** "Humans decided the product, the safety rules, the tier order and the gates, and they check the ledger for honesty. Codex wrote the code, the tests and the evals: `<<fill at 16:15 from /ai-quality and /dashboard>>` merged PRs."
- ตารางเต็มใน [PITCH §5](PITCH.md)

## 10. ใช้ Codex อย่างไร และที่ไหนที่มันพลาด

- **EN:** "Three people, each with one orchestrator chat and three worker chats in the ChatGPT desktop app, one git worktree per chat. Workers build features from specs and merge on green CI; orchestrators dispatch, review, and fix cross-lane bugs on their own branches. AGENTS.md, hooks and a board keep them unblocked. Where it failed: `<<STORY: one real bug, the PR number and the test that now guards it>>`."
- **TH:** ใช้อธิบายโครงสร้าง + เล่าความล้มเหลวจริงหนึ่งเรื่อง (ห้ามแต่ง ถ้าไม่มีเรื่องจริง ให้พูดว่าสิ่งที่เจอจริงคือข้อจำกัดของเครื่องมือที่เจอวันนี้ เช่น sandbox ของ Windows ปิด dev server เบื้องหลัง ซึ่งเป็นความเสี่ยงที่วางแผนไว้ใน D14 เฉพาะถ้าเกิดขึ้นจริงเท่านั้น)
- เปิด: dashboard + PR timeline · สไลด์ 6

## 11. ทำไมใช้ OpenAI อย่างเดียว

- **EN:** "One provider means one wrapper that logs tokens and cost for every call, one set of failure modes, and one key to protect. In our own pre-event tests `gpt-6.2-sol` handled every text job we planned in Thai. A published Thai tool-calling benchmark (FahMai-TeleBench, AACL 2026) reports GPT-5.4 at 97 to 99% versus 58 to 74% for Typhoon-2.5, which supports a frontier model for Thai agents. Today this also keeps us inside the event's spirit, an OpenAI-and-Codex event."
- **TH:** wrapper เดียว บันทึก usage เดียว key เดียว · เราทดสอบเองแล้วว่า Sol ทำงาน text ทุกงานเป็นไทยได้ ([openai-api.md §15](../openai-api.md)) · benchmark: brief §3 (เป็น GPT-5.4 ไม่ใช่รุ่นที่เราใช้ ต้องพูดตามนี้)
- ถ้าถามว่ารุ่นอื่นถูกกว่าไหม: ไม่ได้เปรียบเทียบข้ามผู้ให้บริการ (UNCONFIRMED) · env เลือก model ได้ ไม่ hard-code

## 12. ถ้าโมเดลล่ม ทำอย่างไร

- **EN:** "Nothing is invented. If a model call times out or fails, no reply row is written, no order is created, and the failed turn is visible in the trace and the jobs page with a retry. Staff still see the customer's message in the inbox and can answer, and takeover works without the model."
- **TH:** timeout/error = ไม่มีข้อความ AI ไม่สร้างออเดอร์ ([F10](../specs/F10-ai-agent.md) §11) · ข้อความลูกค้ายังขึ้น inbox พนักงานตอบเองได้ · `/ops` มี jobs และ retry · ยังไม่มี failover ไปโมเดลอื่น (UNCONFIRMED ว่าจะมี)
- โชว์สดได้เฉพาะเมื่อเกิดเอง ห้ามจำลองความล้มเหลวโดยไม่บอก

## 13. ความปลอดภัย (tenant isolation, webhook signature)

- **EN:** "Every query is scoped to one shop on the server, and we test it with a marker that exists only in shop B: asking for it from shop A returns nothing. Webhooks from LINE and Meta have their signatures verified before the body is parsed, duplicate events don't create duplicate messages, public routes are rate-limited, provider tokens are encrypted at rest, and the demo chat has a daily turn cap. We run a security checklist against production before judging, and I will only claim the items that passed."
- **TH:** ตรวจตาม [quality-bar](../day/quality-bar.md) §5 (tenant, permission, webhook, secrets, session, upload/URL, prompt injection, เงิน) ผลที่ผ่านจริงให้พูดเฉพาะข้อที่ C0 ติ๊กแล้ว ข้อที่ไม่ผ่านห้ามอ้าง
- เปิด: ถาม `TENANT_B_ONLY_OWL_482` จากร้าน A สด

## 14. Accessibility และ UX สองภาษา (ไทย / อังกฤษ)

- **EN:** "Every screen works in Thai and in English, with a language switch on every page including the public Demo Chat. The AI replies in the language of each customer message and switches when the customer switches; order, payment and booking messages follow the customer's language too. The Demo Chat is built for phones: no horizontal scroll, large touch targets, labelled inputs, keyboard support and live regions for new messages. We checked a minimum accessibility list today; we haven't done a full audit."
- **TH:** i18n ครบสองภาษา th/en ทุกหน้า (CI ตรวจ key ครบ) และ AI ตอบตามภาษาของลูกค้า, รายการตรวจใน [quality-bar](../day/quality-bar.md) §1–§2 · พูดเฉพาะข้อที่ตรวจผ่านจริง · ยังไม่ได้ตรวจกับ screen reader จริง (UNCONFIRMED ถ้าไม่ได้ทำ)

## 15. โมเดลธุรกิจ

- **EN:** "Shops pay a monthly subscription that scales with the AI replies they use. We haven't set prices and didn't build billing today. Every model call is logged with its cost, which is what pricing will be based on."
- **TH:** สมัครรายเดือนตามจำนวนการตอบโดย AI · ยังไม่กำหนดราคา ไม่ได้สร้าง billing · ห้ามพูดราคา

## 16. คู่แข่ง

- **EN:** "Chat-commerce tools inside marketplaces (Shopee's seller chat assistant), LINE's own seller tooling, general chatbot builders, and ChatGPT for Business, which Sea offers to Shopee sellers. We differ in three ways: we serve chat channels outside the marketplace, the agent is bounded and measured, and payment trust is built in."
- ที่มา: brief §2 (Shopee chat assistant; ChatGPT for Business สำหรับ seller, sea.com/news/406), §4 (LINE Seller AI Automation) · ห้ามอ้างจำนวนผู้ใช้หรือส่วนแบ่งตลาดของใคร (brief §4: ไม่มีตัวเลขทางการ)

## 17. 30 วันถัดไป

- **EN:** "Pilot with a handful of real shops with their consent. Go through Meta app review for Messenger and Instagram. Add privacy notices, retention, and data export and delete. Evaluate real slip verification options, since today's check isn't bank verification. Grow the eval set with anonymised real failures. Finish billing."
- ทุกข้อเป็นแผน ไม่ใช่สิ่งที่ทำแล้ว · UNCONFIRMED: ตัวเลือกยืนยันสลิปกับธนาคาร, กำหนดเวลา app review ของ Meta

## 18. คำถามติดตามที่ควรเตรียม

| คำถาม | คำตอบสั้น |
|---|---|
| ใช่แค่ ChatGPT wrapper ไหม | "A wrapper lets the model decide what's true. Here the model picks tools and writes sentences; code owns prices, totals, order state and payment state." |
| คิดตัวเลข "เกิน 90%" เองหรือ | "No, it's LINE Thailand's figure from its August 2026 release. We quote it for framing, not as our result." |
| ใช้กับลูกค้าจริงไหม | "No. Today's demo uses synthetic shops and synthetic customers." (ห้ามพูดถึงลูกค้าของผลิตภัณฑ์เดิม ถ้าบริษัทไม่อนุญาต) |
| ตัวไหนจริง ตัวไหนจำลอง | เปิด ledger: R/S/A/U; ชำระเงิน = sandbox; Messenger/Instagram = Meta development mode |
| เครดิต API ของงานใช้กับ Codex ได้ไหม | UNCONFIRMED (brief §5) เราใช้เครดิต Codex ของแต่ละคนสำหรับ Codex และ API key แยกสำหรับแอป |
| ทำไมต้องตอบแบบไทย/ค่ะ | ข้อความถึงลูกค้าสุภาพแบบร้านไทย (ค่ะ/นะคะ) ส่วน UI พนักงานเป็นกลาง |
