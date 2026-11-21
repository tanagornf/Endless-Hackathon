# Porting: know-how เดิมของ Papi ต่อฟีเจอร์ (F01–F36)

> **สถานะ 20 พ.ย. 2569 (ค่ำ) ตาม [D1](../DECISIONS-2026-11-20.md):** วันงาน **สร้างจาก build spec ใน [docs/specs/](../specs/README.md)** (31 ไฟล์ เขียนด้วยคำของทีมเอง) และ **`../papi-ref` ปิด** ไม่มี session ไหนเปิดโค้ด Papi เว้นแต่ผู้จัดยืนยันเป็นลายลักษณ์อักษรและหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN` · โฟลเดอร์นี้คือ **know-how เดิม**: brief ต่อฟีเจอร์ (พฤติกรรมและกรณีขอบที่ทีมรู้จากระบบเดิม) และแผนที่ไฟล์ ใช้อ่านประกอบ spec ได้ แต่ไม่ใช่แบบสร้าง · ฟีเจอร์ใหม่ F37 F38 F39 ไม่มี brief (มีแต่ spec) · snapshot ล่าสุดของระบบเดิมคือ `4ba90e34` (หลัง `71ee7659` สอง commit: LINE ใช้ reply token ได้ถึง ~50 วินาทีแล้วจึง Push) ซึ่งถูกรวมไว้ใน spec ของ F17 แล้ว

ส่วนที่เหลือของหน้านี้ (วิธีใช้ map, สูตรเตรียม `../papi-ref`, กติกาการ port) **ใช้เฉพาะเมื่อหัวหน้าโพสต์ `LEAD: PAPI-REF OPEN`** ถึงตอนนั้นหน้านี้บอกว่าแต่ละฟีเจอร์ต้องอ่านไฟล์ไหนใน `../papi-ref` และสิ่งไหนในระบบเดิม **ไม่ต้อง port**

- **[source-map.csv](source-map.csv)** มี 1,394 แถว ครบทุก path ของ Papi (ยกเว้น adapter หนึ่งไฟล์ของโมเดลแชตเดิมที่ไม่ port) `origin/develop` ที่ `71ee7659` (2026-11-19): Lambda 161 ตัว, service 2 ตัว, layer module 174 ไฟล์, SQL หลัก 77 ไฟล์, หน้าเว็บ 124 ไฟล์ และ components / hooks / helpers / locales ของ frontend (map เดิมทำที่ `6959a92f` 2026-11-18 สิ่งที่เปลี่ยนหลังจากนั้นอยู่ใน [เปลี่ยนหลัง snapshot เดิม](#เปลี่ยนหลัง-snapshot-เดิม-6959a92f--71ee7659)) · **20 พ.ย.:** [PLAN.md](../../PLAN.md#ตัดออกจาก-scope) ตัด 8 ฟีเจอร์ออกจาก scope แถวของฟีเจอร์เหล่านั้นเป็น `OUT` แล้ว ([รายการ OUT](#รายการ-out-มีใน-papi-แต่นอก-scope))
- **`<ID>-<slug>.md`** (เช่น [F10-ai-agent.md](F10-ai-agent.md), `F35-core-jobs.md`) คือ porting brief ของแต่ละฟีเจอร์ บอกพฤติกรรมที่ต้องรักษาและเงื่อนไขว่าเสร็จ
- ถ้าสองไฟล์นี้ขัดกัน: เรื่อง **พฤติกรรม** ยึด brief เรื่อง **path** ยึด map ส่วนเรื่องแผนทั้งหมดยึด [PLAN.md](../../PLAN.md)
- ค่าเริ่มต้นของวันงานคือไม่เปิด `../papi-ref`: ใช้ map นี้แค่ดูขอบเขตเท่านั้น ห้ามหาโค้ด Papi จากที่อื่น

## ใช้ยังไง (ต่อ lane)

```bash
# ทุกแถวของฟีเจอร์ตัวเอง (ตัวอย่าง B1 ทำ F05 ก่อน)
grep -E '^F05,' docs/porting/source-map.csv
# หลายฟีเจอร์ในคราวเดียว เฉพาะ backend
grep -E '^(F05|F07),' docs/porting/source-map.csv | grep -E ',(doc|function|service|layer|sql),'
```

```powershell
Select-String -Path docs/porting/source-map.csv -Pattern '^F05,' | ForEach-Object Line
Import-Csv docs/porting/source-map.csv | Where-Object feature_id -eq 'F05' | Format-Table kind, papi_path, note
```

**ลำดับอ่าน** (หยุดเมื่อเข้าใจพอจะเขียน ไม่ต้องอ่านทุกบรรทัด):

1. `doc`: อ่าน brief ของฟีเจอร์ก่อน แล้วอ่าน `AGENTS.md` (เฉพาะส่วนที่เกี่ยว) และ README ที่ map ชี้
2. `function`: เปิด `src/index.mjs` ของ Lambda ก่อน (note บอก entry และบอกว่ามี `README.md` ไหม) แล้วอ่านแถวที่เป็นไฟล์ย่อย เช่น `Backend/functions/Orchestrator/src/booking-tools.mjs`
3. `service`: `VoiceGateway` ถ้าฟีเจอร์ใช้ (F15, F30)
4. `layer`: `Backend/layers/nodejs-utils/nodejs/*.mjs` ซึ่งเป็นที่อยู่ของกฎธุรกิจจริงหลายตัว (booking-*, commerce/*, permissions.mjs, conversation-auto-assign.mjs)
5. `sql`: `Database/<file>.sql` (note มีชื่อตารางให้แล้ว) ใช้เป็น schema ปัจจุบันตอนเขียน migration ของฟีเจอร์
6. `page` → `component`: หน้าเว็บก่อน แล้วค่อยดู components, hooks (`useX.ts`), API helpers (`Frontend/src/functions/*.ts` ซึ่งบอก endpoint และ shape) และ i18n namespace

Test ของ Papi ใช้เป็นตัวอย่าง acceptance ได้ โดยเปิดอ่านอย่างเดียว ได้แก่ `*.test.tsx` ที่อยู่ข้างไฟล์ frontend และ `Backend/tests/*<ชื่อ function>*.test.mjs` **ห้ามรัน backend suite ของ Papi** เพราะต้องใช้ Lambda layer และใช้เวลาประมาณ 25 นาที

## คอลัมน์และค่าพิเศษ

`feature_id,slug,kind,papi_path,note`: หนึ่งแถวต่อหนึ่งคู่ (ฟีเจอร์, path) path เดียวจึงอยู่ได้หลายฟีเจอร์ path ทั้งหมดนับจาก root ของ Papi ซึ่งก็คือ root ของ `../papi-ref` path ที่ลงท้าย `/` หมายถึงทั้งโฟลเดอร์

| kind | หมายถึง |
|---|---|
| `function` | `Backend/functions/<Name>` (Lambda ทั้งตัว) หรือไฟล์/โฟลเดอร์ย่อยในนั้น |
| `service` | `Backend/services/*` (process ที่รันยาว) |
| `layer` | shared layer `Backend/layers/**` |
| `sql` | `Database/*.sql` (schema) |
| `page` | `Frontend/src/pages/**` |
| `component` | frontend ส่วนอื่น: `components/`, `hooks/`, `functions/` (API helpers), `contexts/`, `layout/`, `ui/`, `locales/th/*.json` |
| `doc` | README / AGENTS.md / eval suite ที่ควรอ่าน |

| feature_id | หมายถึง |
|---|---|
| `F01`–`F36` | 28 ฟีเจอร์ใน scope ตาม [backlog](../competition-plan/feature-backlog.csv) slug เดียวกับโฟลเดอร์ `features/<slug>/` (เลขที่ตัดออกไม่เลื่อนและไม่มีแถวแล้ว) |
| `DROP` | infra ที่สถาปัตยกรรมใหม่ไม่ต้องใช้ (ดูตาราง replacement ด้านล่าง) ห้าม port |
| `OUT` | พฤติกรรมที่มีใน Papi แต่อยู่นอก scope ห้าม port · แถวที่ note ขึ้นต้น `(เดิม Fxx)` คือฟีเจอร์ที่ทีมตัดออก 20 พ.ย. (ไม่ทำและไม่รายงาน) ส่วน OUT อื่นต้องรายงานตามจริงว่าไม่ได้ทำ |
| `UNMAPPED` | path ที่ยังจัดไม่ได้ (ตอนนี้ **0 แถว**) |

## เตรียม `../papi-ref`

ให้วาง `papi-ref` ไว้ในโฟลเดอร์แม่เดียวกับ clone และ worktree ทุกตัว จะได้ให้ `../papi-ref` จากทุก lane ชี้ที่เดียวกัน ต้อง export จาก git ที่ commit `71ee7659` **ห้าม copy จาก working tree** เพราะ working tree อาจ dirty, อาจขาด `CommerceJobRunner` หรือ TikTok และอาจยังมี `FetchMatchXG` ซึ่งถูกลบไปแล้ว

```powershell
$PAPI = 'C:\path\to\Papi'                 # clone ที่มี commit 71ee7659
$REF  = '..\papi-ref'
git -C $PAPI fetch origin develop
git -C $PAPI cat-file -t 71ee7659         # ต้องได้ commit
git -C $PAPI archive --format=zip -o "$env:TEMP\papi-ref.zip" 71ee7659
Expand-Archive "$env:TEMP\papi-ref.zip" -DestinationPath $REF
# ไฟล์ที่ Papi git-ignore แต่ต้องมี: คู่มือสถาปัตยกรรม 2 ไฟล์ copy ด้วยมือแล้วตั้งชื่อเป็น AGENTS.md
$GUIDE = 'REPLACE_PAPI_GUIDE_FILE'        # ชื่อไฟล์คู่มือสถาปัตยกรรมใน Papi (git-ignored, เจ้าของ Papi รู้ชื่อ)
Copy-Item "$PAPI\$GUIDE" "$REF\AGENTS.md"
Copy-Item "$PAPI\Backend\functions\Orchestrator\$GUIDE" "$REF\Backend\functions\Orchestrator\AGENTS.md"
# ลบสิ่งที่ห้ามมี (git archive ยังพา .env.example / .env.production / output/ มาด้วย)
Get-ChildItem $REF -Recurse -Force -Filter '.env*' | Remove-Item -Force
Remove-Item "$REF\output", "$REF\tart", "$REF\mock-line-chat-history-follow-up.csv" -Recurse -Force -ErrorAction SilentlyContinue
# SrsBot (ops bot ที่ไม่ port) มีไฟล์ที่ดูเหมือน credential อยู่ใน git: ลบทั้งโฟลเดอร์ ห้ามเปิดไฟล์ข้างใน
Remove-Item "$REF\Backend\functions\SrsBot" -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $REF -Recurse -Force -Include '*credentail*','*credential*.json','*_key.json'   # ต้องไม่มีผลลัพธ์
```

```bash
PAPI=/c/path/to/Papi; PARENT=..
git -C "$PAPI" archive --format=tar --prefix=papi-ref/ 71ee7659 | tar -x -C "$PARENT"
GUIDE=REPLACE_PAPI_GUIDE_FILE   # ชื่อไฟล์คู่มือสถาปัตยกรรมใน Papi (git-ignored, เจ้าของ Papi รู้ชื่อ)
cp "$PAPI/$GUIDE" "$PARENT/papi-ref/AGENTS.md"
cp "$PAPI/Backend/functions/Orchestrator/$GUIDE" "$PARENT/papi-ref/Backend/functions/Orchestrator/AGENTS.md"
find "$PARENT/papi-ref" -name '.env*' -delete
rm -rf "$PARENT/papi-ref/output" "$PARENT/papi-ref/tart" "$PARENT/papi-ref/mock-line-chat-history-follow-up.csv"
rm -rf "$PARENT/papi-ref/Backend/functions/SrsBot"   # ops bot ที่ไม่ port: มีไฟล์ที่ดูเหมือน credential ใน git
find "$PARENT/papi-ref" \( -iname '*credentail*' -o -iname '*credential*.json' -o -iname '*_key.json' \) -print   # ต้องไม่มีผลลัพธ์
```

**ตรวจก่อนวันงาน** (ทั้ง 3 เครื่อง แล้วบันทึกใน `SOURCE-BASELINE.md`):

- มี `Backend/functions/` 160 โฟลเดอร์ (161 ใน git ลบ `SrsBot` แล้ว: `(Get-ChildItem ..\papi-ref\Backend\functions -Directory).Count`)
- มี `ConnectTikTokChannel` และ `CommerceJobRunner/src/handler.mjs` ส่วน `FetchMatchXG` ต้อง **ไม่มี**
- มี `AGENTS.md` ครบ 2 ไฟล์ และค้น `.env*`, `output/`, `tart/`, `Backend/functions/SrsBot`, `*credentail*`, `*credential*.json`, `*_key.json` แล้วต้องไม่เจอ
- ห้ามเก็บ secret, dump DB, ข้อมูลลูกค้าหรือร้านจริง, `Backend/.env` และ `Frontend/.env` ไว้ในนั้น
- URL ของ API/WebSocket production ที่เขียนอยู่ใน `AGENTS.md` มีไว้อ่านประกอบเท่านั้น **ห้ามเรียก**

## กติกาการ port

**Port พฤติกรรม ไม่ port AWS glue** ให้อ่านกฎ สถานะ validation และกรณีขอบ (คอมเมนต์ "WHY" ในโค้ด Papi มักอธิบายบั๊กที่เคยเกิด) แล้วเขียนใหม่เป็น TypeScript ในโครงสร้างของ PLAN ไม่ copy ไฟล์ทั้งไฟล์ และไม่ย้ายส่วนที่ parse event, จัดการ SQS batch หรือ IAM มาด้วย

| Papi | ระบบใหม่ |
|---|---|
| Lambda `src/index.mjs` (event → response) | function ใน `server/src/features/<slug>/service.ts` + route ใน `routes.ts` |
| API Gateway REST + `AuthorizeToken` + `business-scope.mjs` | `routes.ts` + `getUser()` / `getBusiness()` / `requirePermission()` ของ core |
| SQS (incoming, per-channel outbound, DLQ) | `jobs.enqueue()` + job handler (F35) และ `sendToCustomer()` + `registerChannelSender()` |
| EventBridge schedules | cron ของ core/jobs (F35) ดูตาราง scheduled ด้านล่าง |
| API Gateway WebSocket (`WebsocketConnect/Disconnect/Push`) | WebSocket ใน server เดียว (core) |
| Cognito + triggers (`PreSignUpIntentGate`, `TriggerPostUserSignup`) | login อีเมล + รหัสผ่านของเราเอง (F02) และย้าย provisioning ไปไว้ตอน signup |
| S3 presigned upload | อัปโหลดลงโฟลเดอร์บนดิสก์ผ่าน core |
| Secrets Manager / SSM (`secrets.mjs`, `*-credentials.mjs`) | `.env` + token ref ที่เข้ารหัสใน DB |
| Bedrock / OpenRouter / Gemini / Cohere / Qwen / Grok / Muse / Cartesia, Bedrock Guardrails + Rekognition | **OpenAI API อย่างเดียว** ผ่าน key เดียวและ `model.*` ของ core ([ตาราง Papi → OpenAI](../openai-api.md#2-papi-ใช้อะไร--ระบบใหม่ใช้อะไร)): Responses API `model.chat({ model: 'chat' \| 'fast' \| 'strong' })`, `model.embed()` = `text-embedding-3-large` `dimensions:1536`, `model.moderate()` = `omni-moderation-latest`, `model.transcribe()`, Realtime `gpt-realtime-2.1` (F30) · ทุก call บันทึก `model_usage` |
| Jina Reader, Slip2Go, Google Maps geocoding | อ่าน URL เองด้วย fetch + SSRF guard (F06) · อ่านสลิปด้วย OpenAI vision แล้วตรวจในโค้ด (F14) · geocoding ไม่ทำ |
| CloudWatch alarms, GuardDuty, ops Lambdas | ไม่ทำ (`DROP`) |
| `Database/*.sql` + `Database/migrations/` (323 ไฟล์) | migrations ใน `features/<slug>/migrations/` โดยใช้ root `*.sql` เป็น schema ปัจจุบัน |

- **Enum:** ค่าในระบบใหม่ยึด union types ใน `contracts.ts` (`Channel`, `MessageAuthor`, handler `'ai' | 'human'`, `JobState` …) ซึ่ง C1 แตกไว้ใน `shared/core` ให้ทุก lane import ห้ามพิมพ์ string ที่ contract ไม่มี ส่วน `Backend/layers/nodejs-utils/nodejs/enums.mjs` (คู่กับ `Database/enum.sql` ซึ่งมี 35 type) ใช้เข้าใจความหมายของค่าเดิมแล้ว map ตามที่ brief บอก (เช่น Papi sender `bot` → author `ai`, สถานะ `escalated` → handler `human`) ค่าที่ไม่ต้อง map เช่น `'line'`, `'customer'` ใช้ string เดิม
- **สำเนาใน `src/`:** บาง function มีสำเนาของ layer module อยู่ใน `src/` (เช่น `CommerceSettings/src/policy/*`, `CommentReplyRules/src/variant-details.mjs`) ถ้า brief ไม่ได้บอกเป็นอย่างอื่น ให้ถือ layer เป็นตัวจริง
- **Prompt และ threshold:** port เจตนาแล้วจูนใหม่บน OpenAI ค่า RAG เช่น similarity cutoff ถูกจูนกับ Cohere/Gemini จึงต้องวัดใหม่ด้วย fixtures ของ SPEC ห้ามคัดค่าเดิม
- **ไฟล์ provider-specific** (`gemini-*.mjs`, `openrouter-*.mjs`, `bedrock-utils.mjs`, adapter ของโมเดลแชตเดิม, `qwen-rag.mjs`, `embedding-routing.mjs`, `google-query-embedding.mjs`, `slip2go.mjs` และ provider adapter ใน `VoiceGateway`): อ่านเพื่อดู shape และเจตนาเท่านั้น **ห้าม port provider** · AI ทุกอย่างของแอปใช้ OpenAI API ผ่าน key เดียวตาม [docs/openai-api.md](../openai-api.md) ห้าม Bedrock, Gemini/Vertex, Cohere, OpenRouter, Qwen/DashScope, DeepInfra, xAI/Grok, Meta Muse, Cartesia, ElevenLabs, Google TTS, Rekognition, Bedrock Guardrails และ Jina Reader · embedding ใช้ index ชุดเดียว 1536 มิติ
- **Live ≠ git:** ทีมเคย deploy overlay layer ขึ้น live โดยไม่ผ่าน git map นี้จึงตรงกับ git ที่ `71ee7659` เท่านั้น ความต่างกับ live อยู่นอกขอบเขต
- **Orchestrator** เป็นของ F10 ทั้งตัว (283 modules) แต่มี **88 แถวย่อย** ที่ชี้ logic ของฟีเจอร์อื่น เช่น `src/commerce/` → F13/F14, `booking-*.mjs` → F15, `flex-templates.mjs` → F17 lane เจ้าของ domain เป็นคน port ส่วนนั้นเข้า `service.ts` ของตัวเอง แล้ว F10 เรียกผ่าน contract (`createOrderFromProposal()`, `findSlots()`, `createBooking()` …)

## จำนวนแถวต่อฟีเจอร์

นับเป็น **แถว** ไม่ใช่จำนวนไฟล์ที่ไม่ซ้ำ path ที่ใช้ร่วมกันจึงถูกนับในทุกฟีเจอร์ที่อ้างถึง (ยกเว้น OUT ที่รวม path ซ้ำเหลือแถวเดียว) `fn` = Lambda ทั้งตัว, `fn-sub` = แถวไฟล์ย่อยใน function (ส่วนใหญ่อยู่ใน Orchestrator/CreateKnowledge), `comp` = components + hooks + helpers + locales ทุกฟีเจอร์ (และ OUT) มี `AGENTS.md` นับรวมใน doc แล้ว 1 แถว

| ID | slug | fn | fn-sub | service | layer | sql | page | comp | doc |
|---|---|---|---|---|---|---|---|---|---|
| F01 | core | 1 | 0 | 0 | 17 | 2 | 6 | 70 | 5 |
| F02 | auth | 11 | 0 | 0 | 2 | 3 | 8 | 10 | 1 |
| F03 | tenancy | 15 | 0 | 0 | 5 | 6 | 11 | 33 | 1 |
| F04 | business-settings | 7 | 5 | 0 | 7 | 5 | 20 | 19 | 2 |
| F05 | knowledge | 3 | 1 | 0 | 1 | 3 | 7 | 44 | 2 |
| F06 | knowledge-import | 3 | 17 | 0 | 6 | 3 | 8 | 10 | 1 |
| F07 | knowledge-search | 1 | 11 | 0 | 26 | 4 | 0 | 7 | 3 |
| F08 | catalog | 2 | 8 | 0 | 2 | 1 | 2 | 3 | 1 |
| F09 | inbox | 7 | 0 | 0 | 3 | 4 | 11 | 19 | 1 |
| F10 | ai-agent | 4 | 16 | 0 | 1 | 2 | 5 | 10 | 5 |
| F11 | team | 6 | 7 | 0 | 7 | 3 | 4 | 12 | 2 |
| F12 | message-templates | 4 | 5 | 0 | 5 | 1 | 17 | 21 | 1 |
| F13 | orders | 4 | 13 | 0 | 8 | 6 | 4 | 15 | 2 |
| F14 | payments | 1 | 10 | 0 | 2 | 1 | 2 | 1 | 2 |
| F15 | booking | 7 | 14 | 1 | 13 | 2 | 1 | 12 | 4 |
| F16 | calendar | 3 | 0 | 0 | 4 | 1 | 2 | 4 | 1 |
| F17 | line | 6 | 5 | 0 | 9 | 1 | 3 | 10 | 1 |
| F18 | meta | 13 | 4 | 0 | 13 | 3 | 4 | 11 | 1 |
| F21 | comments | 6 | 3 | 0 | 1 | 1 | 1 | 4 | 3 |
| F22 | live-commerce | 3 | 3 | 0 | 1 | 2 | 2 | 7 | 1 |
| F23 | broadcast | 3 | 1 | 0 | 3 | 6 | 1 | 7 | 1 |
| F24 | crm | 3 | 3 | 0 | 2 | 6 | 2 | 12 | 1 |
| F26 | insights | 3 | 3 | 0 | 2 | 2 | 3 | 31 | 1 |
| F27 | analytics | 4 | 5 | 0 | 2 | 3 | 3 | 18 | 1 |
| F30 | voice | 1 | 7 | 1 | 1 | 2 | 3 | 21 | 2 |
| F31 | notifications | 4 | 0 | 0 | 4 | 2 | 0 | 7 | 1 |
| F35 | core/jobs | 3 | 0 | 0 | 6 | 3 | 0 | 0 | 1 |
| F36 | release | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| DROP | – | 19 | 0 | 0 | 5 | 4 | 2 | 1 | 2 |
| OUT | – | 49 | 8 | 1 | 49 | 20 | 17 | 114 | 3 |

ข้อสังเกต: F08 ไม่มี Lambda ของตัวเองเพราะสินค้าใน Papi คือ `knowledge_items` ที่ `item_type='product'` ซึ่งสร้างผ่าน `CreateKnowledge` ส่วน F36 ไม่มีโค้ดให้ port และมีแค่รายการ scenario ใน `Backend/tests/e2e/`

## จุดที่หลายเจ้าของใช้ร่วมกัน

ไฟล์กลุ่มนี้อยู่ใน map หลายฟีเจอร์ ให้คนแรกที่ทำเป็น **host** แล้วฟีเจอร์อื่นเติมผ่าน `service.ts` หรือ slot ตาม contract ห้ามแก้ไฟล์ของ lane อื่น

- **ตาราง:** `conversation.sql` (F09/F11), `endusers.sql` (F09/F24), `conversationrouting.sql` (F17/F18), `businesses.sql` (F03/F04), `knowledgeitems.sql` (F05/F08/F07), `enum.sql` (F01) ให้ยึดเจ้าของตาม C1 setup และ contracts ส่วนฟีเจอร์อื่นเก็บข้อมูลเพิ่มในตารางของตัวเองที่อ้าง FK ผ่าน migration ของตัวเอง (ห้าม ALTER ตารางของคนอื่นหรือของ core ตาม AGENTS.md §5 ต้องการคอลัมน์ใน core → `NEED TO:C1`)
- **หน้าเว็บ:** `Messager.tsx` (host F09, slot F11/F12/F13/F15/F24/F26/F27), `BusinessDetail.tsx` + `businessdetail_pages/*` (host F04), `Channels.tsx` / `BusinessChannel.tsx` (F17 host, F18), `modal/AccountSettings*` (F01 เท่านั้น: แท็บแพ็กเกจ/billing/support และ `AccountTab.tsx` เป็น OUT), `GoogleOAuthCallback.tsx` (F16/F06), `Home.tsx` (F27: ส่วน platform dashboard เป็น OUT)
- **i18n:** namespace ของ Papi ไม่ตรงกับ slug เช่น `chat.json` ใช้ทั้ง F09/F11/F12/F04/F10 และ `common.json` / `nav.json` เป็นของ F01 ฟีเจอร์ไหนใช้ key ไหนให้คัดเฉพาะ key นั้นไปไว้ใน `web/src/features/<slug>/`

## จัดตามดุลยพินิจ และที่เปลี่ยนจาก kit 11-17

kit เดิม (`output/hackathon-from-zero-20261117/backend-inventory.json`) ทำจาก commit `8eeb00c1` map นี้ใช้ `featureIds` ของ kit เป็นฐาน แล้วอ่านโค้ดที่ `6959a92f` เพื่อแก้ส่วนที่ไม่ตรง:

- **ไม่อยู่ใน F01–F36 เดิม จึงวางไว้ที่ฟีเจอร์ที่ใกล้ที่สุด:** `ImagePad` → F18 (pad รูปให้ Meta cards), `DescriptionParaphasing` → F05, `TranslateSummary` → F26 · ส่วน TikTok (`ConnectTikTokChannel` / `DisconnectTikTokChannel` / `RefreshTikTokAccessTokens` + `TikTokOAuthCallback.tsx`, `connectTikTok.ts`) เคยวางไว้ F18 ตอนนี้เป็น **OUT** `(เดิม F18)` เพราะ TikTok ตัดออกจาก scope 20 พ.ย.
- **`FetchMatchXG`** ถูกลบใน PR 912 จึงไม่อยู่ใน map ให้ตัด Sportmonks ออกจากขอบเขต F10
- **ย้ายเจ้าของ:** `GetPaymentConfig` (Omise public key ของการจ่ายค่าแพ็กเกจ ไม่ใช่การจ่ายเงินของร้าน), `SelectChannelRetention` (เลือก channel ที่เก็บไว้เมื่อ allowance ลด) และ `BillingDemoControl` เคยย้ายไปฟีเจอร์แพ็กเกจ/billing ตอนนี้เป็น OUT, `GetAccountInfo` / `UpdateAccountInfo` → F04 + F03 ("account" ใน Papi คือ business profile), `GetIntegrations` → F16, `WebsocketSendMessage` → F09 + F11 (มีแถวไฟล์ย่อยให้ F12 ส่วน `whatsapp-send.mjs` เป็น OUT), `WebsocketPush` → F01 + F09, `CommerceSettings` → F13 + F14
- **แตกแถวย่อย:** `Orchestrator` (88 แถวไปยัง 19 ฟีเจอร์), `CreateKnowledge` (F06/F07/F08/F15), `CommerceJobRunner` (F13/F15/F26/F10), `StaffOrders`, `LineWebhook`, `InsightExtraction`, `MessengerWebhook`

## Scheduled handlers (สำหรับ cron ของ F35)

cadence มาจาก README หรือคอมเมนต์ของแต่ละ function และเป็นเวลา UTC (เวลาไทย = UTC+7) ช่องที่เขียนว่า "–" แปลว่าไม่มีระบุไว้ใน README หรือคอมเมนต์ · handler ของฟีเจอร์ที่ตัดออก (เช่น billing runner, support retention, LINE OA crawler, refresh รูป OA, refresh token ของ TikTok) ไม่อยู่ในตารางนี้แล้ว

| Function | cadence | F |
|---|---|---|
| ChatIdleReassignment | rate(1 minute) | F11 |
| CommentReplyWorker | rate(1–5 minutes) | F21 |
| CommentReplyReconciler | rate(5 minutes) | F21 |
| AppointmentReminder | rate(15 minutes) | F15 |
| RefillMessengerProfiles | ทุก 15 นาที (ตามคอมเมนต์ใน `customer-profile.mjs`) | F18 |
| AppointmentMaintenance | rate(1 hour) | F15 |
| TimeoutCloseConversation | rate(1 hour) | F11 |
| GoogleDocsKnowledge (sync) | rate(1 hour) | F06 |
| ExportTurnTraces | cron(15 * * * ? *) | F27 |
| CustomerTagAutomation | cron(0 17 * * ? *) = 00:00 ไทย | F24 |
| RefreshLineAccessTokens | cron(15 17 * * ? *) | F17 |
| RefreshInstagramAccessTokens | cron(30 17 * * ? *) | F18 |
| OrderMaintenance, CommentLivePoller, ChatOutboxDispatch, CommerceJobRunner | – | F13, F21, F35, F13 |

## รายการ DROP (ไม่ port)

| Path | เหตุผล |
|---|---|
| 7 Migration Lambdas: `BusinessContactChannelsMigration`, `CustomerTagAutomationMigration`, `CustomerTagDescriptionMigration`, `EscalationScenarioMigration`, `LegalAcceptanceMigration`, `LineBroadcastMigration`, `LineHistoryImportMigration` | migration ครั้งเดียว schema ปัจจุบันอยู่ใน `Database/*.sql` แล้ว |
| `Database`, `NestTestPipeline` | SQL runner และ CI Lambda ซึ่ง migration runner ของ F01 ทำแทน |
| `WebsocketConnect`, `WebsocketDisconnect` | lifecycle ของ API Gateway WebSocket ซึ่ง core WebSocket ทำแทน (เรื่อง auth ให้ดู `websocket-authorization.mjs`) |
| `PreSignUpIntentGate`, `InboundFederationAttributeNormalizer` | Cognito triggers ส่วนกฎ intent ยังอยู่ที่ `registration-intents.mjs` → F02 |
| `Outgoing`, `DlqAutoRedrive`, `outgoing-batch.mjs`, `pending-ingress.mjs` | SQS glue ซึ่ง `sendToCustomer()` และ jobs retry/dead state ของ F35 ทำแทน |
| `FormatAlarmEmail`, `OpsLineAlert`, `DailyHealthReport`, `upload-scan.mjs` | ops alarm และ GuardDuty |
| `llmproviderhealth.sql`, `Orchestrator/migrations/…provider-health.sql`, `pgaudit.sql` | ระบบใหม่ใช้ provider เดียว และ pgaudit เป็น DB infra |
| `Database/migrations/`, `Backend/scripts/`, `Frontend/pipeline-local/`, `Backend/layers/external/`, `nodejs/certs/` | ประวัติ migration, deploy tooling, layer packaging และ RDS CA |
| `TestBackend.tsx`, `UiGallery.tsx`, `Frontend/src/data/` | dev tool และ mock |
| `SrsBot` | ops bot (ตรวจ SRS doc drift) ที่ไม่ port และโฟลเดอร์มีไฟล์ที่ดูเหมือน credential อยู่ใน git จึงลบออกจาก `papi-ref` ตั้งแต่ตอนเตรียม (ดูสูตรด้านบน) |

## รายการ OUT (มีใน Papi แต่นอก scope)

| Path | เหตุผล |
|---|---|
| `GetDocsAccess`, `docs/tutorial_web/`, `nav/DocsLink.tsx`, `layout/DocsMenu.tsx`, `functions/internalDocs.ts` | internal docs site ที่อธิบาย Lambda เดิม ไม่มีความหมายในสถาปัตยกรรมใหม่ |
| `AuthCallback.tsx` (`/callback`), `functions/federatedAuth.ts` | Google sign-in ซึ่ง PLAN ใช้อีเมล + รหัสผ่านแทน (ปุ่ม Google ใน `SocialAuthButtons.tsx` จึงไม่ทำด้วย) |
| `TeamWorkflowPreview.tsx`, `functions/staffWorkflowTrial.ts`, `teamWorkflowPermissions.ts`, `teamWorkflowStore.ts` | หน้า preview แบบ static ที่ใช้ข้อมูลตัวอย่างใน browser ไม่ใช่หน้าสินค้าที่มี route |
| แถวที่ note ขึ้นต้น `(เดิม F19)` `(เดิม F20)` `(เดิม F25)` `(เดิม F28)` `(เดิม F29)` `(เดิม F32)` `(เดิม F33)` `(เดิม F34)` และ TikTok `(เดิม F18)` รวม 250 แถว (path ที่ซ้ำกันเหลือแถวเดียว): WhatsApp + consent, ประวัติ LINE / OA Manager crawler / session broker, ฟอร์มลูกค้า, แพ็กเกจ / โควตา / allowance, billing / subscription checkout, help copilot / support / feedback, platform admin, legal / privacy / PDPA / export-delete / retention, TikTok | **ทีมตัดสินใจ 20 พ.ย.** ([PLAN](../../PLAN.md#ตัดออกจาก-scope)): นอก scope ของวันงาน · ใช้ได้ไม่จำกัด จึงไม่มีแพ็กเกจ โควตา หรือ billing · ไม่มี legal, ฟอร์ม หรือ PDPA flow · ช่องทางมีแค่ LINE / Messenger / Instagram (ไม่มี WhatsApp หรือ TikTok) · ไม่มีหน้า admin หรือ support · ไม่มีการนำเข้าประวัติ LINE · กลุ่มนี้**ไม่ทำและไม่รายงาน** (ไม่มีแถวใน FEATURE_STATUS) |

**UNMAPPED: 0 แถว** ทุก path ใน 161 functions, 2 services, 174 layer modules, 77 SQL และ frontend ถูกจัดลงฟีเจอร์ DROP หรือ OUT แล้ว ถ้าพบ path ใหม่ที่ไม่มีใน map ให้โพสต์ `NEED TO:<lane เจ้าของ>` บนบอร์ด

## เปลี่ยนหลัง snapshot เดิม (6959a92f → 71ee7659)

Papi `origin/develop` มี commit เพิ่ม 243 ตัว (18–19 พ.ย.) ไฟล์เพิ่ม 120 ลบ 3 แก้ 1,389 (ส่วนใหญ่เป็น test และ fix) map อัปเดตแล้ว: เพิ่ม 33 แถว ลบ 3 แถว (`socketAccessToken.ts` → `accessToken.ts`, `BusinessCapabilitiesEditor.tsx` ถูกลบ, `DeliveryPolicyEditor.tsx` → `deliveryControls.tsx`) brief แต่ละตัวยังเขียนจากโค้ดที่ `6959a92f` ส่วนพฤติกรรมใหม่ที่ควรรู้อยู่ในตารางนี้ และในหัวข้อ "เปลี่ยนถึง 71ee7659" ของ brief ที่เกี่ยว ถ้า brief ขัดกับโค้ดใน `../papi-ref` ให้ยึดโค้ด

| F | เปลี่ยนอะไร (commit ของ Papi) |
|---|---|
| F01 | frontend ใช้ `getAccessToken()` ตัวเดียวทั้ง REST และ WebSocket แทนการส่ง `accessToken` prop (`8c696680`) |
| F03 | รายชื่อสมาชิกกรอง role/สถานะ และเรียงได้ 6 แบบ ฝั่ง client (`3230fdb2`) · ค้นหาในหน้าต่างสิทธิ์ (`f4d1e93e`) · ทุกหน้าให้สิทธิ์รายคนได้ (`c64de354`) · Orders มีระดับ Read & write = `orders.read` + `orders.write` (`5b59a8cb`) · สิทธิ์ใหม่ `chat.templates`, `comments.read`, `comments.write` |
| F04 | หน้า Delivery ยาวในหน้าร้านและ business capabilities editor ถูกเอาออกจาก UI ย้ายไป Orders → Settings (ดู F13) (`7d819206`) |
| F05 | เตือนความรู้คล้ายกันก่อนบันทึก + การ์ดรายการซ้ำพร้อม preview (`01aca060`) · เติม vector ที่หายเฉพาะตอนบันทึก draft (`974cd90f`) · extraction เก็บข้อเท็จจริงเชิง "ไม่มี" และเก็บ attribute อิสระเฉพาะที่ไม่กำกวม (AB#2655) |
| F08 | หลาย SKU ต่อ variant, ทุก SKU ค้นได้, SKU chips, เช็ก "SKU ถูกใช้แล้ว" (`178c7a26`, `01aca060`) · เพิ่ม variant พร้อม SKU จากหน้าสินค้า (`ec31d06c`) · ล็อก catalog ระหว่าง live/presentation: `businesses.product_catalog_locked` ทำให้แก้สินค้าไม่ได้จนปลดล็อก (`1b662eac`) |
| F09 | แสดงรูป/ไฟล์ที่ staff ส่งจาก Meta Page Inbox (`3aaf0807`) · ธง/แถบเตือนเมื่อ Meta AI ถือแชต (`3faa0fcf`) |
| F10 | **ตอบก่อน แล้วค่อยถามว่าจะส่งต่อเจ้าหน้าที่ไหม** แทนการส่งแค่คำถาม handoff; ขอคนจริงตรง ๆ เท่านั้นที่ส่งต่อทันที (`c1ced9ce`, `handoff-offer.mjs`) · ปิดเลขบัตรก่อนส่งเข้าโมเดลทุกตัว, reranker และ trace (AB#2691, `payment-card.mjs`) · ภาษาไทยอ้างคำญี่ปุ่น/จีนของร้านได้ (AB#2602) · fix grounding สินค้าและ variant จำนวนมาก (AB#2655, AB#2662, AB#2688) |
| F11 | reassign ได้แม้ปิด auto-assign (`cb39d227`) · แชตจากคอมเมนต์ถูก assign เข้าทีม (`1b662eac`) |
| F12 | template ส่วนตัว (`owner_user_id`) คู่กับ template กลาง เขียน template กลางต้องมี `chat.templates` (`8ddd7b7c`) |
| F13 | เลขออเดอร์ใหม่ `<6 hex ร้าน>-<DDMONYY>-<4>-<4>-<ช่องทาง>` เก็บเลขเดิมใน `legacy_order_number` (`743b5aea`) · เลข tracking + ขนส่ง แจ้งลูกค้า, ORDER_LOOKUP บอกเลข (`ab537602`, `1830b63c`) · รายงานยอดขายและจัดส่งรายวันแบบพิมพ์ได้ (`8bc13900`) · ยืนยันออเดอร์แล้วเสนอ "คืนแชตให้ AI" (`c295fec5`) · ออเดอร์จ่ายแล้วรอส่งไม่บล็อกออเดอร์ใหม่ (`a997fe90`) · ค่าส่งแบบง่าย 3 แบบใน Orders → Settings: ค่าส่งต่อออเดอร์ / ติดต่อแอดมิน (ค่าเริ่มต้น) / กฎที่ร้านเขียนเอง (`7d819206`, `a0cdd634`) · ถามตะกร้าได้การ์ดทีละบรรทัด (`cart-cards.mjs`) · fix variant/ที่อยู่จัดส่งจำนวนมาก |
| F14 | การ์ดออเดอร์ Messenger เป็นใบเสร็จพร้อมข้อมูลลูกค้า (`0450b7d7`, `d1b2c2aa`) |
| F18 | เก็บข้อความของ Page เอง (`message_echoes`) รวมรูป/ไฟล์ใน storage (`8ac95ff3`, `4ea561c2`) · handover protocol: รู้เมื่อ Meta AI หรือ app อื่นถือแชต + หน้าคู่มือปิด Meta AI (`3faa0fcf`, `5bc89d5e`) · Lambda ใหม่ `RefillMessengerProfiles` เติมชื่อ/รูปลูกค้าทุก 15 นาที (`bf3736fb`) · ข้อความยาวแบ่งส่ง (Messenger 2,000 ตัวอักษร, IG 1,000 bytes) (`0252ba51`) · หา Page ได้เมื่อให้สิทธิ์ "ทุก Page" (`39430256`) |
| F21 | คอมเมนต์ตอบอัตโนมัติได้แม้ปิด AI (`473dbe8e`) · ชื่อ contact จากคอมเมนต์แทน id (AB#2664) · bug sweep การอ่าน/ส่ง/reconcile คอมเมนต์ live และตอบแบบคนขาย (AB#2690) |
| F22 | แก้ product code เลือกหลาย option ได้เหมือนตอนเพิ่ม (`65583d24`) · หน้า product codes ที่ค้างไม่ทับ code ใหม่กว่า (`b0eeace9`) · live cart อยู่รอดแม้ปิดแชต แยกต่อ live หมดอายุได้ (`57496037`) |
| F24 | สร้าง tag ใหม่จากแชตได้ ไม่ทับ tag ที่เพื่อนเพิ่งเพิ่ม (`cb39d227`) |
| F27 | platform admin เห็น Developer Mode ทุกแชตเป็นค่าเริ่มต้น (`f87c3c26`) |

ฟีเจอร์อื่นมีแค่การแก้ร่วมของ F01 (`getAccessToken()`) ถ้าจะดูละเอียด ให้รันใน clone ของ Papi (ไม่ใช่ `papi-ref` ซึ่งไม่มีประวัติ git): `git log --oneline 6959a92f..71ee7659 -- <path จาก map>`

## ที่มาของ map

สร้างเมื่อ 18 พ.ย. 2569 ด้วยสคริปต์ชั่วคราวนอก repo จากข้อมูลสามชุด:

- `git ls-tree -r 6959a92f` ของ Papi
- import graph `/opt/nodejs/*.mjs` ของทุก function (ใช้ดูว่า layer module ไหนถูกใครเรียก)
- `featureIds` ของ kit 11-17

จากนั้นอ่าน README และคอมเมนต์หัวไฟล์ของส่วนที่กำกวมเพื่อจัดให้ถูก ถ้าจะแก้ ให้แก้ CSV ตรง ๆ แล้วแก้ตารางจำนวนในหน้านี้ให้ตรงกันด้วย

**อัปเดต 20 พ.ย. 2569** เป็น `71ee7659`: ใช้ `git diff --name-status 6959a92f 71ee7659` หาไฟล์ที่เพิ่ม/ลบ จัดไฟล์ใหม่ที่ไม่ใช่ test/css/md ลงฟีเจอร์ (ไฟล์ใน Lambda ที่ map ทั้งโฟลเดอร์อยู่แล้วเพิ่มแถวย่อยเฉพาะที่ logic เป็นของฟีเจอร์อื่น) แล้วนับตารางจำนวนใหม่จาก CSV

**อัปเดต 20 พ.ย. 2569 (ตัด scope ตาม PLAN):** แถวของ F19 F20 F25 F28 F29 F32 F33 F34 และแถว TikTok ของ F18 เปลี่ยนเป็น `OUT` slug `-` โดย note ขึ้นต้น `(เดิม Fxx)` (path ที่ซ้ำกันใน OUT รวมเหลือแถวเดียว เช่น `(เดิม F28/F29)`), `SrsBot` ย้ายจาก F35 เป็น `DROP` และ note ของ `BusinessDetail.tsx` (F04) เอา slot ของฟีเจอร์ที่ตัดออกออก รวมเหลือ 1,395 แถว ไม่มีแถวอื่นเปลี่ยน แล้วนับตารางจำนวนใหม่จาก CSV
