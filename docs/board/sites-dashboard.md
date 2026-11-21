# Sites dashboard: บอร์ดทีมบน ChatGPT Sites (+ GitHub mirror)

อัปเดต 20 พ.ย. 2569 (รอบ D9/D17: orchestrator, `STAGE`, การ์ดคน) · ใช้คู่กับ [PLAN.md § บอร์ดสื่อสาร](../../PLAN.md#บอร์ดสื่อสาร-github-issue--chatgpt-sites-ส่วนเสริม) และสคริปต์ [team-board.ps1](../competition-plan/tools/team-board.ps1) · ข้อที่เขียนว่า **UNVERIFIED** ต้องผ่าน[การทดสอบก่อนวันงาน](#4-ทดสอบก่อนวันงาน-เฉพาะทีมที่ใช้-sites-ทั้ง-3-เครื่อง)ก่อนจึงเชื่อได้

- **หน้านี้เป็นส่วนเสริม ไม่บังคับ:** บอร์ดทำงานครบด้วย GitHub issue ที่ปักหมุดอย่างเดียว (ไม่ต้องตั้ง `SITES_*`; ดู [START.md ข้อ 4](../../START.md)) dashboard บน Sites เพิ่มมุมมองการ์ดให้คนดู ใช้เมื่อ site พร้อมและทดสอบจาก 3 เครื่องผ่านแล้วเท่านั้น
- เพื่อนที่มี ChatGPT subscription สร้าง site ก่อนวันงานด้วย [prompt ในข้อ 2](#2-prompt-สำหรับ-chatgpt-sites) แล้วแชร์ให้ 3 บัญชีของทีมเท่านั้น
- ตัวเขียนตัวเดียวคือ `tools/team-board.ps1` ไม่ใช่ AI และไม่ใช่หน้าเว็บ ทุกโพสต์เขียนลง Sites และ mirror ไป GitHub issue ที่ปักหมุดเสมอ
- ถ้า Sites ใช้ไม่ได้ ตั้ง `BOARD_SOURCE=github` แล้วทำงานต่อด้วย GitHub board ได้ทันที

## 1. dashboard แสดงอะไร

**แถบ stage ของทีม (บนสุด):** Setup → P0 → Gate → P1/P2 → Freeze → Demo คำนวณฝั่ง server จากโพสต์ที่ script เขียน (ไม่มีใครตั้งมือ) ตามตารางนี้ ขั้นปัจจุบันเน้นสี ขั้นที่ผ่านแล้วเป็นสีจาง และแสดงเวลาที่เข้าขั้นนั้น

| ขั้น | เข้าเมื่อ |
|---|---|
| Setup | ยังไม่มี `SETUP READY` |
| P0 | มี `SETUP READY <sha>` และยังไม่มีผล gate (tier P1 ที่เปิดแล้วแสดงเป็นชิปข้าง ๆ) |
| Gate | ผล gate ล่าสุดคือ `BLOCKED GATE` (แสดง step และ lane ที่ถูกแท็ก) จนกว่าจะมี `DONE GATE` |
| P1/P2 | ผล gate ล่าสุดคือ `DONE GATE` (ชิป tier ที่เปิด P1 P2 P3 จาก `LEAD: OPEN`) |
| Freeze | มี `LEAD: FREEZE` |
| Demo | มี `DEPLOY FREEZE` |

**การ์ดคน 3 ใบ (A · B · C):** ข้อความสรุปล่าสุดจาก `STAGE` ของ orchestrator (`PUT /api/people/<A|B|C>` ที่ `team-board.ps1 stage` เรียก; เขียนได้เฉพาะ A0/B0/C0 ตามตัวอักษร หรือ LEAD), ชื่อ lane ที่ส่ง, เวลาอัปเดต ("x นาทีที่แล้ว", สีเหลืองเมื่อเกิน 30 นาที, สีแดงเมื่อเกิน 45 นาที = orchestrator ลืม STAGE), **% usage** ของคนนั้นจาก `LEAD: BUDGET` ล่าสุด (แถบ เกิน 40% เหลือง เกิน 60% แดง) และชิป lane ที่ BLOCKED ของคนนั้น

**การ์ด lane 12 ใบ** (จัดกลุ่มตามคน C · B · A; ในกลุ่มเรียง 0 1 2 3, ใบ `x0` = orchestrator ใช้การ์ดแบบไม่มีฟีเจอร์ได้) แต่ละใบมี: lane, คน (A/B/C), ฟีเจอร์ปัจจุบัน (`F11 team`; orchestrator แสดงเฉพาะ note เช่น "ตรวจ F10 บน main"), tier, สถานะ **R/S/A/U** (R ใช้จริงครบ · S sandbox · A adapter/fake · U ยังไม่ทำ), เวลาอัปเดตล่าสุด (Asia/Bangkok), SHA ล่าสุดที่ merge และธง BLOCKED

| Lane | คน | ฟีเจอร์ตามลำดับ (tier) |
|---|---|---|
| C0 · B0 · A0 | C · B · A | orchestrator: ไม่มีฟีเจอร์ (C0 ตรวจ gate 13:00 และดูแล production) |
| C1 | C | F01 core (P0) → F35 core/jobs (P0) → F39 chatgpt-catalog (P2) → F36 release (P1, เริ่ม 15:15) |
| C2 | C | F17 line (P0) → F30 voice (P3) · F18/F21 U-deferred |
| C3 | C | F04 business-settings (P0) → F03 tenancy (P0) → F02 auth (P1) → F31 notifications (P1) |
| B1 | B | F05 knowledge (P0) → F07 knowledge-search (P0) → F08 catalog (P0) → F37 evals (P2) |
| B2 | B | F10 ai-agent (P0) → F38 follow-ups (P2) |
| B3 | B | F06 knowledge-import (P1) → F26 insights (P2) → F27 analytics (P2) |
| A1 | A | F09 inbox (P0) → F11 team (P0) → F12 message-templates (P2) → F23 broadcast (P2) |
| A2 | A | F13 orders (P1) → F14 payments (P1) → F22 live-commerce (P2) |
| A3 | A | F24 crm (P1) → F15 booking (P2) → F16 calendar (P2) |

**feed ข้อความ:** ใหม่สุดก่อน กรองตาม lane (ผู้เขียนหรือ `TO:`) และตามประเภท รองรับทุกประเภท: `DONE` `DONE FIX` `TASK` `NEED` `CHANGE` `FIX` `BLOCKED` `SETUP READY` `DONE GATE` `BLOCKED GATE` `LEAD: OPEN` `LEAD: BUDGET` `LEAD: FREEZE` `LEAD: PAPI-REF OPEN` `DEPLOY FREEZE` `STATUS` `STAGE` `NOTE` · ซ่อน `STATUS` และ `STAGE` เป็นค่าเริ่มต้น (กดเปิดได้ เพราะ STAGE อยู่บนการ์ดคนแล้ว) · refresh อัตโนมัติทุก 20 วินาที (ช่วง 15–30) · หน้าเว็บอ่านอย่างเดียว ไม่มีช่องโพสต์

## 2. Prompt สำหรับ ChatGPT Sites

เพื่อนแทน `<...>` แล้ววางทั้งก้อน ค่า `<BOARD_SECRET_SHA256>` ได้จาก[ข้อ 3](#3-ออก-bypass-token-แชร์-site-และ-board_secret) (ใส่แค่ hash ห้ามใส่ secret จริง)

```text
Build a private team dashboard site called "NLess Hackathon Board". It is read by 3 people and written ONLY by a script through a JSON API.

AUDIENCE: Private. Share only with these 3 ChatGPT accounts as viewers: <EMAIL_A>, <EMAIL_B>, <EMAIL_C>. Never public.

STORAGE (D1). Create and seed exactly:
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, lane TEXT NOT NULL, type TEXT NOT NULL,
    to_lanes TEXT NOT NULL DEFAULT '[]', text TEXT NOT NULL, sha TEXT, post_key TEXT UNIQUE);
  CREATE TABLE lanes (lane TEXT PRIMARY KEY, person TEXT NOT NULL, feature_id TEXT, slug TEXT, tier TEXT, status TEXT NOT NULL DEFAULT 'U',
    note TEXT NOT NULL DEFAULT '', sha TEXT, blocked INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
  CREATE TABLE people (person TEXT PRIMARY KEY, summary TEXT NOT NULL DEFAULT '', lane TEXT, updated_at TEXT);
  CREATE TABLE team (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  Seed lanes (status U): C0 C - - - | C1 C F01 core P0 | C2 C F17 line P0 | C3 C F04 business-settings P0 | B0 B - - - | B1 B F05 knowledge P0 |
    B2 B F10 ai-agent P0 | B3 B F06 knowledge-import P1 | A0 A - - - | A1 A F09 inbox P0 | A2 A F13 orders P1 | A3 A F24 crm P1
    (A0 B0 C0 are orchestrators: feature_id, slug and tier are NULL).
  Seed people: A, B, C with summary '' and updated_at NULL.
  created_at/updated_at are set by the server in UTC ISO 8601 (e.g. 2026-11-21T03:45:12Z). to_lanes is a JSON array stored as text; return it as an array.

AUTH (server-side, every /api/* route, reads included): require header "Authorization: Bearer <secret>". Compute SHA-256 hex of <secret> and
  compare in constant time with BOARD_SECRET_SHA256 = "<BOARD_SECRET_SHA256>" (or keep the hash in the site's secret storage if Sites offers it).
  Mismatch or missing -> 401 {"error":"unauthorized"} and write nothing. Scripts reach the site with a Sign in with ChatGPT bypass token in the
  OAI-Sites-Authorization header (Sites handles that header). No CORS headers. Never log or display request headers or secrets.

API (all responses Content-Type: application/json; charset=utf-8, Cache-Control: no-store; errors are {"error":"<field>: <reason>"}):
1) POST /api/posts  body {"lane":"A1","type":"DONE","to_lanes":["B2","C2"],"text":"DONE F09 inbox merged abc1234 TO:B2 TO:C2","sha":"abc1234","post_key":"A1:F09-A1-done-1"}
   -> 201 {"post":{"id":42,"created_at":"...","lane":"A1","type":"DONE","to_lanes":["B2","C2"],"text":"...","sha":"abc1234","post_key":"A1:F09-A1-done-1"},"duplicate":false}
   If post_key already exists: 200 {"post":<the existing row>,"duplicate":true} and insert nothing.
   In the same transaction update derived state:
     SETUP READY -> team.setup_ready = {"sha":sha,"at":created_at} and add "P0" to team.open_tiers
     LEAD: OPEN  -> add the tier found in text (P1|P2|P3) to team.open_tiers (JSON array)
     DONE GATE / BLOCKED GATE -> team.gate = {"result":"DONE"|"BLOCKED","text":first 200 chars,"at":created_at}
     LEAD: FREEZE -> team.freeze_at = created_at
     DEPLOY FREEZE -> team.deploy_freeze_at = created_at
     LEAD: PAPI-REF OPEN -> team.papi_ref_open_at = created_at
     LEAD: BUDGET -> team.budget = {"A":n,"B":n,"C":n,"at":created_at} parsed from "A 18%" style numbers in text
     BLOCKED (from a lane A0..C3) -> lanes.blocked = 1 for that lane
     DONE or DONE FIX with sha (from a lane) -> lanes.sha = sha, lanes.updated_at = now
     STAGE and STATUS posts change no derived state (STAGE cards arrive through PUT /api/people).
   After every derived-state change recompute team.stage (a string) with these rules, first match wins:
     deploy_freeze_at set -> "Demo" | freeze_at set -> "Freeze" | gate.result = "DONE" -> "P1/P2" | gate.result = "BLOCKED" -> "Gate" |
     setup_ready set -> "P0" | otherwise "Setup". Also store team.stage_since = created_at of the post that changed it.
2) GET /api/posts?after=<id>&to=<lane>&limit=<n>  (after default 0; to optional = only posts whose to_lanes contains that lane; limit default 50, max 100)
   -> 200 {"posts":[<post>, ...ascending id, only id > after],"last_id":<max id in table>}
3) PUT /api/lanes/<lane>  body {"person":"A","feature_id":"F11","slug":"team","tier":"P0","status":"S","note":"takeover works","sha":"abc1234","blocked":false}
   -> 200 {"lane":{"lane":"A1","person":"A","feature_id":"F11","slug":"team","tier":"P0","status":"S","note":"...","sha":"abc1234","blocked":false,"updated_at":"..."}}
   Upsert; "sha": null keeps the previous sha. For orchestrator lanes A0 B0 C0, feature_id, slug and tier may be null.
4) GET /api/lanes -> 200 {"lanes":[12 lane objects as above, order C0 C1 C2 C3 B0 B1 B2 B3 A0 A1 A2 A3],
   "team":{"setup_ready":{...}|null,"open_tiers":["P0"],"gate":{...}|null,"freeze_at":null,"deploy_freeze_at":null,"papi_ref_open_at":null,
           "budget":{...}|null,"stage":"Setup","stage_since":null}}
5) PUT /api/people/<person>  (person A|B|C)  body {"person":"A","summary":"10:30 done: ... next: ... usage: 18%","lane":"A0"}
   -> 200 {"person":{"person":"A","summary":"...","lane":"A0","updated_at":"..."}}   Upsert; summary 1..400 characters; lane A0|B0|C0|LEAD.
6) GET /api/people -> 200 {"people":[3 person objects, order C B A, each also with "budget": <n or null> copied from team.budget>]}
The page itself loads data from a separate read-only route GET /ui/state (lanes + people + team + latest 200 posts) that relies only on the site's
private sharing. The browser must never need, store or receive BOARD_SECRET.

VALIDATION (reject with 400, write nothing): post lane in A0 A1 A2 A3 B0 B1 B2 B3 C0 C1 C2 C3 LEAD; path lane in A0..C3 only;
  type in DONE, DONE FIX, TASK, NEED, CHANGE, FIX, BLOCKED, STATUS, STAGE, SETUP READY, LEAD: OPEN, LEAD: BUDGET, LEAD: FREEZE,
  LEAD: PAPI-REF OPEN, DEPLOY FREEZE, DONE GATE, BLOCKED GATE, NOTE;
  to_lanes = array of at most 12 unique lanes A0..C3; text 1..2000 characters; note <= 500; sha null or /^[0-9a-f]{7,40}$/;
  post_key /^[A-Za-z0-9_.:-]{1,120}$/; status R|S|A|U; tier null or P0..P3; feature_id null or /^F\d{2}$/; person A|B|C; blocked boolean; body <= 16 KB.
  Unknown routes -> 404 JSON. Treat all text as untrusted: render as escaped plain text, never as HTML or Markdown.

UI (Thai first, mobile friendly):
- Fonts: "Noto Sans Thai", "Sarabun", "Leelawadee UI", Tahoma, sans-serif; line-height 1.6. Times in Asia/Bangkok as HH:mm plus "x นาทีที่แล้ว".
- Top stage bar from team.stage: Setup > P0 > Gate > P1/P2 > Freeze > Demo (current highlighted, earlier ones dimmed, time since team.stage_since),
  plus chips: SETUP READY sha+time, opened tiers, latest gate result (BLOCKED shows the text), FREEZE time, DEPLOY FREEZE time, PAPI-REF OPEN time.
- 3 person cards (C, B, A): person letter, STAGE summary text, "x minutes ago" (amber over 30, red over 45), usage % bar from team.budget
  (amber above 40%, red above 60%), chips for that person's blocked lanes.
- 12 lane cards grouped C / B / A (4 per group: x0 orchestrator first; 3 columns on desktop, 1 column on phones): lane, person, feature_id + slug
  (orchestrator: note only), tier, status badge (R green, S blue, A amber, U grey), note, short sha, updated time; red border + "BLOCKED" when
  blocked; greyed if not updated for 45 minutes.
- Message feed, newest first: time, author lane, type badge, TO lanes, text. Filters: lane (author or TO) and type; STATUS and STAGE hidden by default.
- Auto-refresh every 20 seconds (pause while the tab is hidden), show "last refreshed" and a visible banner if refresh fails.
- No write UI, no own login form, no analytics, no third-party scripts (web fonts only). Never show secrets or tokens.

DONE WHEN: the 6 API routes return exactly the shapes above (posts, lanes x2, people x2); a request without the correct Authorization bearer gets 401;
a repeated post_key returns duplicate:true without a new row; Thai text round-trips unchanged; the page works at 375 px width.
Ask me before inventing anything not specified here.
```

## 3. ออก bypass token, แชร์ site และ BOARD_SECRET

ตรวจกับเอกสาร Sites เมื่อ 20 พ.ย. 2569 ([Data and connections](https://learn.chatgpt.com/docs/sites/data-and-connections), [Publish and share](https://learn.chatgpt.com/docs/sites/publishing-and-sharing), [Overview](https://learn.chatgpt.com/codex/sites)):

- **ออก token (verified):** เอกสาร **ไม่มีเมนูใน UI** ให้สั่งในแชต ChatGPT/Codex ของ site นั้นว่า `Generate a Sign in with ChatGPT bypass token for this site so my service can call it without signing in through a browser.` agent จะเรียก `generate_siwc_bypass_token` แล้วคืนค่า `siwc_bypass_bearer_token`
- **ใช้ token (verified):** ส่ง `OAI-Sites-Authorization: Bearer <token>` Sites ใช้ header นี้แล้วตัดออกก่อนส่งต่อให้ site ส่วน `Authorization` ของ site เองส่งผ่านไปได้ request แบบ bypass ไม่มีตัวตนผู้ใช้
- **เปลี่ยน token (verified):** ออกใหม่ = ของเก่าใช้ไม่ได้ (อาจยังใช้ได้อีกไม่เกิน 5 นาที) ต้องอัปเดตทั้ง 3 เครื่อง ใช้วิธีนี้ทันทีถ้า token หลุด
- **แชร์ (verified):** Share → Who has access → **Only those invited** → ใส่อีเมลใน **Enter an email address** (personal site) → **Viewer** → **Invite** คนที่ได้รับเชิญต้อง sign in ด้วยบัญชีนั้น · เอกสารเขียนว่า external invitations "rolling out" บน Plus/Pro/Business/Enterprise ถ้าบัญชีเพื่อนยังเชิญไม่ได้ = ข้าม site ใช้ GitHub
- **UNVERIFIED:** script ภายนอก POST/PUT เข้า route ของ site ได้จริง (เอกสารไม่ได้อธิบาย API routes), Sites มี secret storage สำหรับ site หรือไม่, รูปแบบ URL `<name>.openai.chatgpt.site` (เอกสารมีแค่ตัวอย่าง)

สร้าง `BOARD_SECRET` บนเครื่องเดียว แล้วส่งให้อีก 2 เครื่องทางช่องทางส่วนตัว ส่งให้เพื่อนแค่ hash:

```powershell
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Add-Content -Path ..\nless.secrets.env -Value "BOARD_SECRET=$secret" -Encoding UTF8
$sha = [Security.Cryptography.SHA256]::Create()
-join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($secret)) | ForEach-Object { $_.ToString('x2') })   # = BOARD_SECRET_SHA256 ใส่ใน prompt
```

## 4. ทดสอบก่อนวันงาน (เฉพาะทีมที่ใช้ Sites: ทั้ง 3 เครื่อง)

เตรียม: `..\nless.secrets.env` มี `SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET` · มี repo/issue ซ้อมสำหรับ GitHub mirror · รันจาก root ของ repo เตรียมงาน (วันงานใช้ `.\tools\team-board.ps1`) · ทุกเครื่องใช้ lane แรกของตัวเอง: C → `C1`, B → `B1`, A → `A1` และส่งต่อวน C1 → B1 → A1 → C1

```powershell
$lane = 'C1'; $next = @{ C1 = 'B1'; B1 = 'A1'; A1 = 'C1' }[$lane]; $first = @{ C1 = 'F01'; B1 = 'F05'; A1 = 'F09' }[$lane]
$board = '.\docs\competition-plan\tools\team-board.ps1'
$cfg = @{}; Get-Content ..\nless.secrets.env -Encoding UTF8 | Where-Object { $_ -match '^(SITES_URL|SITES_BYPASS_TOKEN|BOARD_SECRET)=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $cfg[$k] = $v.Trim().Trim('"') }
$u = $cfg.SITES_URL.TrimEnd('/'); $h = @{ 'OAI-Sites-Authorization' = "Bearer $($cfg.SITES_BYPASS_TOKEN)"; Authorization = "Bearer $($cfg.BOARD_SECRET)" }
function Send-BoardJson($verb, $path, $obj) { Invoke-RestMethod "$u$path" -Method $verb -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))) -TimeoutSec 15 -MaximumRedirection 0 }

# 1) POST แล้วส่งซ้ำด้วย post_key เดิม
$key = "$lane`:pretest-$(Get-Date -Format HHmmss)"; $p = @{ lane = $lane; type = 'NOTE'; to_lanes = @($next); text = "pretest ทดสอบ จาก $lane"; sha = $null; post_key = $key }
$r = Send-BoardJson Post '/api/posts' $p; $r.post.id                 # ต้องได้ตัวเลข
(Send-BoardJson Post '/api/posts' $p).duplicate                      # ต้องได้ True
# 2) GET กลับด้วย after/to
(Invoke-RestMethod "$u/api/posts?after=$($r.post.id - 1)&to=$next" -Headers $h -TimeoutSec 15 -MaximumRedirection 0).posts | Format-List id, lane, type, text   # ต้องเห็นโพสต์ ภาษาไทยอ่านออก
@((Invoke-RestMethod "$u/api/posts?after=$($r.post.id - 1)&to=A3" -Headers $h -TimeoutSec 15 -MaximumRedirection 0).posts).Count   # ต้องได้ 0
# 3) PUT การ์ด lane แล้วอ่านกลับ (และการ์ดคน: PUT /api/people/<A|B|C>)
Send-BoardJson Put "/api/lanes/$lane" @{ person = $lane.Substring(0, 1); feature_id = $first; slug = 'pretest'; tier = 'P0'; status = 'U'; note = 'pretest'; sha = $null; blocked = $false } | Out-Null
(Invoke-RestMethod "$u/api/lanes" -Headers $h -TimeoutSec 15 -MaximumRedirection 0).lanes | Where-Object lane -eq $lane | Format-List lane, feature_id, status, updated_at
# 4) ต้องถูกปฏิเสธเมื่อไม่มี BOARD_SECRET
try { Invoke-RestMethod "$u/api/posts?after=0" -Headers @{ 'OAI-Sites-Authorization' = $h['OAI-Sites-Authorization'] } -TimeoutSec 15 -MaximumRedirection 0 | Out-Null; 'FAIL: read without BOARD_SECRET' } catch { 'OK: ' + $_.Exception.Message }
# 5) สคริปต์ครบวงจร (GitHub mirror ไป issue ซ้อม)
Send-BoardJson Put "/api/people/$($lane.Substring(0, 1))" @{ person = $lane.Substring(0, 1); summary = 'pretest stage'; lane = "$($lane.Substring(0, 1))0" } | Out-Null
(Invoke-RestMethod "$u/api/people" -Headers $h -TimeoutSec 15 -MaximumRedirection 0).people | Format-List person, summary, updated_at   # ต้องเห็นการ์ดของคนนั้น
$env:BOARD_REPO = '<owner>/<rehearsal-repo>'; $env:BOARD_ISSUE = '<issue-number>'
powershell -NoProfile -ExecutionPolicy Bypass -File $board check -AgentId $lane                                   # Sites: OK
powershell -NoProfile -ExecutionPolicy Bypass -File $board post -AgentId $lane -Text "NOTE pretest ทดสอบ TO:$next" -PostId "pretest-$lane-1"   # Sites: posted + Posted:
powershell -NoProfile -ExecutionPolicy Bypass -File $board status $lane $first U pretest การ์ด                    # Sites lane card + Posted:
powershell -NoProfile -ExecutionPolicy Bypass -File $board stage ($lane.Substring(0,1)) "pretest STAGE" -AgentId LEAD   # Sites person card + Posted: (STAGE ไม่ปลุกใคร)
powershell -NoProfile -ExecutionPolicy Bypass -File $board read -AgentId $lane                                    # เห็นโพสต์ของเครื่องก่อนหน้า (POST ... ) ไม่เห็น STATUS
powershell -NoProfile -ExecutionPolicy Bypass -File $board wait -AgentId $lane -DurationSeconds 120 -AsHookJson   # ให้เครื่องก่อนหน้าโพสต์ TO:$lane ระหว่างรอ → ได้ JSON บรรทัดเดียว
$env:SITES_URL = 'https://unreachable.invalid'; powershell -NoProfile -ExecutionPolicy Bypass -File $board read -AgentId $lane; Remove-Item env:SITES_URL   # WARNING ... falling back to GitHub
```

**ผ่านเมื่อ** ทั้ง 3 เครื่องได้ผลตามคอมเมนต์ครบทุกบรรทัด, issue ซ้อมมีโพสต์ `[C1/Codex]` `[B1/Codex]` `[A1/Codex]` ครบ, dashboard แสดงการ์ด lane, การ์ดคนจาก `/api/people`และ feed ภาษาไทยถูกต้อง และ `git status` ไม่มีไฟล์ secret · จดผลและวันที่ใน SOURCE-BASELINE

**ถ้าไม่ผ่าน:**

| อาการ | ทำอย่างไร |
|---|---|
| ข้อ 1–3 ได้ 401/403/หน้า sign-in หรือ "non-JSON" | ออก bypass token ใหม่ ([ข้อ 3](#3-ออก-bypass-token-แชร์-site-และ-board_secret)) ตรวจ hash ของ BOARD_SECRET แล้วลองใหม่ |
| script ภายนอก POST/PUT ไม่ได้เลย | ลบ `SITES_URL` ออกจาก secrets file (สคริปต์เขียน GitHub อย่างเดียว ไม่มีคำเตือน) ข้าม site |
| เขียนได้ แต่ GET ช้าหรือไม่เสถียร | ตั้ง `BOARD_SOURCE=github` ในทุก secrets file: hooks อ่าน GitHub ส่วน site ยังได้ข้อมูลจากการเขียน = ใช้เป็น display-only |
| ภาษาไทยเพี้ยนแค่ใน `Invoke-RestMethod` ข้อ 2 | ขอให้ site ส่ง `charset=utf-8` (สคริปต์บอร์ดอ่าน UTF-8 เองอยู่แล้ว ไม่กระทบ hooks) |

## 5. คำสั่งของสคริปต์ (สำหรับ prompts และ hooks)

| คำสั่ง | ใช้ที่ | พฤติกรรม |
|---|---|---|
| `check` | ก่อนเริ่ม | ตรวจ GitHub user, issue, Sites `GET /api/lanes` ไม่เขียนอะไร |
| `post -MessageFile handoff\<id>.txt -PostId <id>` (หรือ `-Text`) | ทุก lane | `POST /api/posts` + mirror ไป issue เป็น `[<LANE>/Codex] ...` · PostId เดิม = ไม่โพสต์ซ้ำทั้งสองที่ |
| `status <lane> <feature\|none> <R\|S\|A\|U> <note> [-Sha <sha>] [-Blocked]` | ทุก lane (lane A0..C3) | `PUT /api/lanes/<lane>` (slug/tier เติมให้จาก PLAN) แล้วโพสต์บรรทัด `STATUS` (ไม่ปลุกใคร) · orchestrator ไม่มีฟีเจอร์ใช้ `none` (เก็บเป็น `feature_id: null`; `-` เดี่ยว ๆ ส่งผ่าน `powershell -File` ไม่ได้เพราะ PowerShell อ่านเป็นชื่อ parameter) |
| `stage <A\|B\|C> "<สรุป ≤ 400 ตัว>"` | orchestrator (`A0` → `A`) หรือ LEAD เท่านั้น | `PUT /api/people/<person>` แล้วโพสต์ `STAGE <person> <สรุป>` (ไม่ปลุกใคร) และเขียน `.team-board\last-stage.txt` ให้ Stop hook นับ 30 นาที |
| `read` | `SessionStart`, `UserPromptSubmit` | พิมพ์โพสต์ใหม่ที่ถึง lane (กฎด้านล่าง) |
| `wait -AsHookJson [-Frozen]` | `Stop` | รอสูงสุด 540 วิ อ่านไม่บ่อยกว่า 30 วิต่อ lane มีโพสต์ = พิมพ์ `{"decision":"block","reason":"..."}` บรรทัดเดียว ไม่มี = ไม่พิมพ์อะไร |
| `watch` | terminal ของคน | ดูทุกโพสต์ ใช้ cursor แยก ไม่กินโพสต์ของ Codex |

- **ใครถูกปลุกด้วยโพสต์อะไร:** (1) `TO:<lane>` · `TASK TO:<lane>` · `FIX TO:<lane>` · `FIX <lane> <ไฟล์> <เหตุผล>` และ `DONE FIX <lane> <slug> <sha>` (lane ที่อยู่หลัง FIX ถือว่าถูกแท็ก) · (2) ทุก lane (12): `SETUP READY`, `LEAD: OPEN`, `LEAD: FREEZE`, `DEPLOY FREEZE` · (3) orchestrator `<P>0` เพิ่ม: `DONE` / `BLOCKED` / `NEED` / `FIX` / `CHANGE` ที่ผู้เขียนคือ `<P>1..3` แม้ไม่มี `TO:`, และ `DONE GATE` / `BLOCKED GATE` ของทุกคน (script ใส่ `<P>0` ลงใน `to_lanes` ตอนโพสต์ จึงใช้ตัวกรอง `to=` ของ server ได้) · (4) **ไม่ปลุกใคร:** `STATUS`, `STAGE`, `LEAD: BUDGET`, `LEAD: PAPI-REF OPEN` · หลัง `LEAD: FREEZE` Stop hook ใช้ `-Frozen`: worker ปลุกเฉพาะ `TASK`/`FIX`/`DONE FIX`/GATE/`DEPLOY FREEZE`, ไม่มีใครถูกปลุกด้วย `SETUP READY`/`LEAD: OPEN`
- **lane และ issue:** อ่าน `-AgentId` จากไฟล์ `.lane` และ `-Repo`/`-Issue` จาก `BOARD_REPO`/`BOARD_ISSUE` ถ้าไม่ได้ใส่ · หัวหน้าโพสต์ `LEAD: ...` และ `DEPLOY FREEZE` ด้วย `-AgentId LEAD` (ขึ้นต้น `[LEAD]`) · script เตือน (ไม่บล็อก) เมื่อ `TASK` ไม่มี `TO:` หรือ `DONE GATE`/`BLOCKED GATE` ไม่ได้โพสต์จาก C0
- **Sites ล่มตอนเขียน:** GitHub ยังได้โพสต์, สคริปต์พิมพ์ `WARNING` ทาง stderr และเก็บคำขอไว้ใน `.team-board\sites-outbox` ส่งให้ Sites อัตโนมัติในการรันครั้งถัดไป · GitHub ล่ม = คำสั่ง fail ให้รันซ้ำด้วย PostId เดิม
- **Sites ล่มตอนอ่าน:** สลับไป GitHub อัตโนมัติในรอบนั้น cursor ของแต่ละแหล่งแยกกัน และจำ post key ที่ส่งแล้ว จึงไม่ส่งโพสต์เดิมซ้ำเมื่อสลับไปมา
- **GitHub:** ดึงเฉพาะ comment ใหม่ (`since=`) และถ้าตั้ง `BOARD_TEAM_LOGINS` จะรับเฉพาะ 3 บัญชีทีม · token ไม่ถูกพิมพ์ทุกกรณี (error ถูก redact)
- **Sites เก่าที่ยังไม่มี `/api/people`:** `check` พิมพ์ `Sites people cards: UNAVAILABLE`; `stage` ยังโพสต์ลง GitHub ได้ แต่ไม่มีการ์ดคน (404/405 ถือเป็นการปฏิเสธถาวร ไม่เข้า outbox)
- test แบบ offline: `powershell -NoProfile -ExecutionPolicy Bypass -File docs/competition-plan/checks/test-team-board.ps1`

## 6. ตัวแปร env

ทุกค่าอยู่ใน `..\nless.secrets.env` (นอก repo ข้าง worktree) **เท่านั้น** ห้ามอยู่ใน git, โพสต์, prompt, `.codex/hooks.json`, screenshot หรือแชต ค่าใน env ของ shell ชนะค่าในไฟล์

| ตัวแปร | ค่า | ใช้ทำอะไร |
|---|---|---|
| `SITES_URL` | origin ของ site เช่น `https://<name>.openai.chatgpt.site` (ไม่มี path) | ปลายทาง API · ไม่ตั้ง = GitHub อย่างเดียว |
| `SITES_BYPASS_TOKEN` | `siwc_bypass_bearer_token` จากข้อ 3 | header `OAI-Sites-Authorization` |
| `BOARD_SECRET` | hex สุ่ม 64 ตัว (site เก็บแค่ SHA-256) | header `Authorization` |
| `BOARD_SOURCE` | `sites` (ค่าเริ่มต้น) หรือ `github` | แหล่งที่ hooks อ่าน (การเขียนไป Sites + GitHub เสมอ) |
| `BOARD_REPO`, `BOARD_ISSUE` | `owner/repo`, เลข issue ที่ปักหมุด | GitHub mirror (ไม่ลับ ใส่ไว้เพื่อไม่ต้องพิมพ์ทุกครั้ง) |
| `BOARD_TEAM_LOGINS` | `loginA,loginB,loginC` | GitHub: รับโพสต์เฉพาะ 3 บัญชีนี้ |

ถ้า token หรือ secret หลุด: ออก bypass token ใหม่ และ/หรือสร้าง BOARD_SECRET ใหม่ + ส่ง hash ใหม่ให้เพื่อนแก้ site แล้วอัปเดตทั้ง 3 เครื่อง

## 7. ค่าใช้จ่ายและ SOURCE-BASELINE

- ตามเอกสาร OpenAI (Sites Overview): **hosting ฟรีถึง 31 ธ.ค. 2569** ตั้งแต่ 1 ม.ค. 2570 Plus/Pro/Business จ่ายส่วนที่เกิน allowance รายเดือน ใช้ได้บน Plus, Pro, Business, Enterprise · D1 ได้ 10 GB
- การสร้าง site ก่อนวันงานคือ **การเตรียมเครื่องมือประสานงานของทีม ไม่ใช่โค้ดแอป** (ไม่มีโค้ด NLess/Papi ใน site) บันทึกใน [SOURCE-BASELINE](../competition-plan/templates/SOURCE-BASELINE.md) หัวข้อ "สิ่งที่มีอยู่ก่อน" เช่น: `ChatGPT Sites team dashboard (host <name>.openai.chatgpt.site) สร้างโดย <ชื่อ> วันที่ <วัน> เป็น dev tool ประสานงาน ไม่ใช่ส่วนของแอป · tools/team-board.ps1 จาก repo เตรียมงาน commit <sha> · ผลทดสอบ 3 เครื่อง: <ผ่าน/ไม่ผ่าน + BOARD_SOURCE ที่ใช้>`
