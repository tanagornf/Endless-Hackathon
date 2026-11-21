# ตั้งค่าแอป ChatGPT (Codex) บนเครื่องวันงาน: คลิกต่อคลิก

อัปเดต 20 พ.ย. 2569 · ตาม [D14](../DECISIONS-2026-11-20.md#d14-codex-runs-in-the-chatgpt-desktop-app-windows-cli-only-as-fallback) และ D3 · ทำ**คืนนี้**บนเครื่องของตัวเอง (A, B, C) แล้วทำซ้ำส่วนที่ต้องทำใหม่ตอน 10:00 (ข้อ 3–4) · ใช้คู่กับ [pc-preparation.md](pc-preparation.md) (ติดตั้ง, Neon, secrets) และ [templates/codex/README.md](../competition-plan/templates/codex/README.md) (hooks, config, rules)

**ป้ายที่ยังไม่ได้เห็นในแอปจริงเขียนว่า UNCONFIRMED พร้อมสิ่งที่ต้องมองหา** ชื่อเมนูมาจาก D14 และเอกสารของ OpenAI ผู้เขียนแผนไม่มีแอปตัวนี้ในเครื่องที่เขียน ถ้าป้ายในแอปต่างจากที่เขียน ให้ยึดแอปแล้วจดความต่างไว้โพสต์ให้ทีม

## 1. ติดตั้ง อัปเดต ล็อกอิน

1. ติดตั้งหรืออัปเดตแอป: `winget install --id 9PLM9XGG6VKS -s msstore` (ถ้าติดตั้งแล้วให้ `winget upgrade --id 9PLM9XGG6VKS -s msstore` หรือเปิด Microsoft Store > Library > Get updates) GPT-6.2 ออก 17 พ.ย. แอปเก่าไม่มีโมเดลนี้
2. เปิดแอป ChatGPT → ล็อกอินด้วยบัญชี **Pro** ของตัวเอง
3. สลับเป็น **Codex** (ตัวสลับโหมดในแอป; UNCONFIRMED ตำแหน่ง: มองหาแท็บ/ปุ่มชื่อ Codex ที่แถบข้างหรือบนสุด)
4. Settings → ตัวเลือก agent/ environment ต้องเป็น **Windows native** (UNCONFIRMED ชื่อ: มองหาหัวข้อที่เลือกระหว่าง Windows native กับ WSL) ต้องมี git ติดตั้งแบบ native แล้ว
5. คัดลอกไฟล์ระดับเครื่อง (ครั้งเดียว) ตาม [codex README § ติดตั้ง](../competition-plan/templates/codex/README.md): `%USERPROFILE%\.codex\config.toml` (จาก `templates/codex/user/config.toml` แก้ `REPLACE_ROOT` กับตัวอักษรคน) และ `%USERPROFILE%\.codex\rules\default.rules` แล้ว**ปิดแอปให้สนิท (ไอคอน tray ด้วย) เปิดใหม่** เพราะ rules โหลดตอนเริ่ม · **ห้ามมี** `%USERPROFILE%\.codex\AGENTS.md` ในวันงาน

## 2. สร้าง worktree 4 ตัวต่อคน (สคริปต์ของเรา ไม่ใช้โหมด Worktree ของแอป)

แอปสร้าง worktree ชั่วคราวเองใต้ `%USERPROFILE%\.codex\worktrees` และรับ worktree ที่เราสร้างไม่ได้ จึงสร้างเองแล้วเปิดแต่ละโฟลเดอร์เป็น project · ทำที่ clone หลักของ repo แข่ง (ที่ `git fetch origin` ได้และมี `origin/main` แล้ว วันงานหลัง 10:00 ที่หัวหน้า push baseline เสร็จ; คืนนี้ซ้อมกับ repo ว่างหรือ repo ซ้อมก็ได้):

```powershell
# รันใน clone หลักของ repo แข่ง (โฟลเดอร์ชื่อเช่น C:\hack\nless) · worktree จะอยู่ข้างกัน: C:\hack\nless-a0 ฯลฯ
function New-NlessWorktrees([string[]]$Lanes) {
    git fetch origin
    $common = (git rev-parse --git-common-dir).Trim()
    Add-Content -LiteralPath (Join-Path $common 'info\exclude') '.lane'      # กัน .lane เข้า git
    Add-Content -LiteralPath (Join-Path $common 'info\exclude') '.team-board/'
    foreach ($lane in $Lanes) {
        $path = Join-Path '..' ('nless-' + $lane.ToLower())
        if (Test-Path $path) { Write-Output "มีแล้ว: $path"; continue }
        git worktree add --detach $path origin/main      # x0 = orchestrator ตาม origin/main เสมอ · worker สร้าง branch lane/<LANE>/<slug> เองหลัง SETUP READY
        Set-Content -LiteralPath (Join-Path $path '.lane') -Value $lane -NoNewline
    }
    git worktree list
}
# เลือกบรรทัดของตัวเองบรรทัดเดียว:
New-NlessWorktrees 'A0', 'A1', 'A2', 'A3'    # คน A
New-NlessWorktrees 'B0', 'B1', 'B2', 'B3'    # คน B
New-NlessWorktrees 'C0', 'C1', 'C2', 'C3'    # คน C
```

ตรวจ: `type ..\nless-a0\.lane` ได้ `A0` (ของ B/C ใช้ตัวอักษรของตัวเอง) · `git worktree list` เห็น 4 โฟลเดอร์ · `..\nless.secrets.env` อยู่ข้าง ๆ ตามที่ pc-preparation บอก · worktree ที่สร้างก่อน push `.codex/` ต้อง `git fetch` แล้ว `git checkout --detach origin/main` ในนั้นอีกครั้งหลัง baseline มี `.codex/` และ `tools/team-board.ps1` · **อย่าใช้ dropdown branch ของแอปสลับไป branch ที่ worktree อื่นเช็กเอาต์อยู่**

## 3. เพิ่ม project และเปิด chat (ต่อ worktree: 4 รอบ)

1. กด **Ctrl+O** (หรือปุ่ม **Add new project** ที่แถบข้าง; UNCONFIRMED: ถ้า Ctrl+O ไม่ตอบ ให้ใช้ปุ่มในแถบข้าง) → เลือกโฟลเดอร์ `nless-a0` (หรือของ lane อื่น)
2. ในโปรเจกต์นั้นกด **New chat** → ที่ **Work in** เลือก **This computer** (Local) · **ห้ามเปิด Worktree** (สวิตช์ Worktree ต้องปิด; UNCONFIRMED ป้าย: มองหาตัวเลือก Local / Worktree / Cloud ใต้ช่องข้อความ)
3. ถ้าแอปถามให้ **Trust** โปรเจกต์ → กด Trust (ไม่ trust = `.codex/` ทั้ง hooks และ config ถูกข้าม)
4. พิมพ์ใน chat (ยังไม่ใช่ prompt งาน): `ช่วยรัน pwd แล้ว type .lane` → ต้องได้โฟลเดอร์ `...\nless-a0` และ `A0` ถ้าไม่ตรง = เปิดผิดโฟลเดอร์ ปิด chat แล้วทำใหม่
5. ทำให้ครบทั้ง 4 project แล้วเรียงชื่อ chat ให้เห็นง่าย (`A0`, `A1`, `A2`, `A3`)

## 4. ตั้งค่าต่อ chat ก่อนข้อความแรก (ทุก chat, ทุกครั้งที่เปิดใหม่)

ตัวเลือกอยู่ใต้ช่องข้อความ (composer) · ยังไม่รู้ว่าแอปจำค่าเหล่านี้ต่อ chat หรือไม่ (UNCONFIRMED) **จึงตรวจทุก composer ก่อนส่งข้อความแรกเสมอ**

| ตั้ง | ค่า | หมายเหตุ |
|---|---|---|
| Model | **GPT-6.2 Sol** (`gpt-6.2-sol`) | ห้าม Astra · ถ้ามีแถบ Power/Advanced ให้เปิด Advanced แล้วเลือก Sol ตรง ๆ (UNCONFIRMED ชื่อที่แสดง: มองหา "6.2 Sol") |
| Effort | orchestrator (x0) = **High** · worker = **Medium** · งานกล (i18n, seed, fixture, rename, เอกสาร) = **Light** | ห้าม ultra · ติดเกิน 20 นาที = xhigh + Fast · ติดเกิน 45 นาที = max (ทีละ session) · UNCONFIRMED ชื่อระดับ: Light/Medium/High ในแอปตรงกับ low/medium/high |
| Fast (ปุ่มสายฟ้า) | ดูตารางด้านล่าง | ใช้ usage 2 เท่า |
| Permissions | **Approve for me** (auto-review) | ห้าม Full access เป็นค่าเริ่มต้น · UNCONFIRMED ป้าย: มองหา Approve for me / Auto-review |

**Fast ต่อ chat (D3):**

| Chat | Fast |
|---|---|
| C1 ตอน setup (วาง prompt ~10:05 ถึง `SETUP READY`) | **เปิด** |
| orchestrator A0 / B0 / C0 | เปิดตั้งแต่ `SETUP READY` (~10:50) ถึง 13:00 · ปิด 13:00–15:30 · เปิดอีกครั้ง 15:30–17:00 |
| worker **A1, B1, B2, C1, C2** | เปิดได้**ก่อน 13:00 เท่านั้น** และเมื่อ usage ของคนนั้น < 40% หลังจากนั้นปิด |
| worker A2, A3, B3, C3 | **ปิดตลอดวัน** (C3 และ lane ที่เริ่ม P1 ตามคำสั่งใน budget-and-priority) |
| งานกล / sub-agent | ปิด (sub-agent สืบทอดจาก chat แม่ ปิดของแม่ก่อนสั่งหลายตัว) |

**กฎไฟล์ (rules):** `%USERPROFILE%\.codex\rules\default.rules` ทำให้ `git add/commit/fetch/rebase/push/worktree/switch/checkout/status/diff/log` และ `gh pr` / `gh run` รวมถึงสคริปต์บอร์ด `tools/team-board.ps1` กับ `tools/alert.ps1` (เรียกแบบ `powershell -NoProfile -ExecutionPolicy Bypass -File tools/…` ตามที่ทุก prompt ใช้) รันนอก sandbox โดยไม่ถาม (force-push กับ `reset --hard` ยังถาม) · **ทดสอบคืนนี้** (UNCONFIRMED ว่าแอปใช้ไฟล์นี้): ใน chat ของ worktree สั่ง `git status` แล้ว `git commit --allow-empty -m probe` ต้องไม่ขึ้นขออนุมัติ · ถ้า commit ยัง `index.lock: Permission denied` (GH#32880) → ให้คน commit/push จาก terminal ของตัวเอง; ทางสุดท้าย chat นั้นเปลี่ยนเป็น Full access (เครื่องเฉพาะกิจ งาน repo เท่านั้น)

## 5. Trust และ hooks (ต่อ project ทั้ง 4)

1. ต้องมี `.codex/hooks.json` และ `tools/team-board.ps1` ใน worktree (หลัง baseline) → เปิด **Settings > Hooks** (หรือปุ่ม **Review hooks** ใน composer; UNCONFIRMED ตำแหน่ง) → กด refresh → **Review และ Trust ทั้ง 3 ตัว** (SessionStart, UserPromptSubmit, Stop) ทำใน**ทุก project** · แก้ไฟล์ใน `.codex/` เมื่อไรต้อง trust ใหม่
2. สำรองถ้าแอปไม่จำ trust: ใส่ `[projects.'<path worktree>'] trust_level = "trusted"` ใน `%USERPROFILE%\.codex\config.toml` (มีอยู่แล้วใน `user/config.toml`) (UNCONFIRMED ว่าได้ผลในแอป)
3. **ทดสอบ MANGO / PONG ในแอป** (ไม่ใช่แค่ CLI): ทำตาม [codex README § ทดสอบ 5 นาที](../competition-plan/templates/codex/README.md) บน repo ซ้อม `C:\hack\hooktest` ต้องได้ **MANGO** ตอนเปิด chat, **PONG** (Codex ทำต่อเองจาก Stop hook) และ **KIWI** ตอนพิมพ์ข้อความถัดไป ถ้า Stop hook ไม่ปลุกในแอป = ปลุกด้วยมือ (พิมพ์ "อ่านบอร์ด") และแจ้งหัวหน้าทันที
4. ทดสอบกับบอร์ดจริง (GitHub issue ที่ปักหมุด) จาก 3 เครื่องตาม [START.md ข้อ 4](../../START.md): `check`, `post` แล้วดูบนหน้า issue · ทีมที่ตั้ง Sites dashboard ไว้ทดสอบเพิ่มตาม [sites-dashboard.md ข้อ 4](../board/sites-dashboard.md) (ไม่บังคับ)

## 6. ทำให้ chat ทำงานได้ตลอดวันโดยไม่มีคนเฝ้า

- **Settings > Notifications** ([เอกสาร](https://learn.chatgpt.com/docs/notifications?surface=app)): turn completion = **Always** (ไม่ใช่ "เฉพาะตอนแอปอยู่ background" เพราะคุณเปิดแอปดู chat อื่นอยู่เกือบตลอด), permission notifications **on**, question notifications **on** · chat ที่ติดขออนุมัติจะหยุดรอ ดู **กระดิ่ง Activity** (**Ctrl+Alt+U**) ทุกครั้งที่ว่าง
- **มือถือ** ([เอกสาร](https://learn.chatgpt.com/docs/remote-connections)): Settings → **Connections → Control this Mac or PC → Set up** → สแกน QR ด้วยแอป ChatGPT ในมือถือ (บัญชีเดียวกัน) → อนุญาตแจ้งเตือน · มือถือจะได้แจ้งเตือนเมื่อ chat จบงานหรือต้องการคุณ และตอบ/อนุมัติจากมือถือได้ · จับคู่เฉพาะมือถือของตัวเอง · เครื่องต้องไม่หลับและออนไลน์ (หน้า Connections มีตัวเลือก keep awake) · UNCONFIRMED สำหรับบัญชีของเรา: ขึ้นกับ rollout และ workspace ที่จัดการโดย admin อาจต้องเปิด Remote Control ก่อน ถ้าไม่มีเมนูนี้ ใช้แจ้งเตือนบนเครื่องอย่างเดียว
- **ทำไม chat ที่ติดต้องจบ turn:** แอปแจ้งเตือนเมื่อ turn จบ ขออนุมัติ หรือถามคำถาม แต่ระหว่างที่ Stop hook รอบอร์ด (สูงสุด 9 นาที) turn ยังไม่จบ จึงเงียบ · chat ที่ต้องการคนจึงจบข้อความด้วยบรรทัดขึ้นต้น 🛑 แล้ว Stop hook ของเราจะปล่อยให้ turn จบทันที (และร้องเตือนในเครื่องผ่าน `tools\alert.ps1`)
- **Windows ไม่หลับ** (แอปไม่มีตัวเลือก prevent sleep บน Windows) เสียบปลั๊กตลอดแล้วรันใน PowerShell:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # ปิดฝาแล้วไม่หลับ (โน้ตบุ๊ก)
powercfg /setactive SCHEME_CURRENT
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE               # ดูว่า AC เป็น 0x00000000
```

- **เสียงเตือนในเครื่อง (สำรอง)** ([START.md ข้อ 3](../../START.md)): โพสต์ `BLOCKED` และ Stop hook ที่เห็นบรรทัด 🛑 เรียก `tools\alert.ps1` (ร้อง 3 ครั้ง + แจ้งเตือน Windows ค้างไว้) · ทดสอบคืนนี้จาก terminal: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\alert.ps1 -Test` (UNCONFIRMED ว่าคำสั่งที่ agent รันใน sandbox ออกเสียงได้ ส่วน hook รันโดยแอปเอง) · Windows: Settings → System → Notifications เปิด, Do not disturb / Focus ปิด
- **Usage**: เปิด chatgpt.com/codex/settings/usage ไว้แท็บหนึ่ง (หัวหน้าถามตอน checkpoint 11:30 / 13:00 / 14:30) · **ตัดสินใจคืนนี้**ว่าเปิด credit auto top-up หรือไม่ (credit ใช้หลัง included usage หมด; US$100 ≈ 2,500 credits; ไม่เปิด = chat หยุดเมื่อหมด) บอกผลในกลุ่มทีม
- **Dev server คนเป็นคนรัน**: sandbox ของ Windows (MXC) ฆ่า process ลูกเมื่อคำสั่งจบ agent จึงรัน server ค้างไม่ได้ · เปิด terminal ของตัวเองต่อ lane แล้ว `cd ..\nless-<lane>; npm run dev` (พอร์ต API 3000+เลข lane, web 5170+เลข lane ตาม [environments.md](environments.md); orchestrator ใช้ 3000/5170 บนเครื่องของแต่ละคน) · หรือสร้าง **Action** ในแอปที่รัน `npm run dev` (UNCONFIRMED ว่า Action ไม่โดนฆ่าเหมือนคำสั่งของ agent: ทดสอบคืนนี้ ถ้าโดนฆ่าใช้ terminal)
- `npm ci` ใน chat ล้มด้วย EPERM (GH#45697) → รันใน terminal ของตัวเอง · PowerShell บล็อก `npm.ps1` → `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 7. ปัญหา Windows ที่รู้แล้ว → วิธีเลี่ยง

| อาการ | วิธีแก้ |
|---|---|
| แอปค้างที่หน้า splash ระหว่างทำงาน (GH#62277) | Task Manager → จบ process `codex.exe ... app-server` แล้วเปิดแอปใหม่ (chat เดิมกลับมา) |
| `git commit` ใน worktree: `index.lock: Permission denied` (GH#32880) | ใช้ rules ข้อ 4 (รันนอก sandbox) · ไม่ได้ผล → คน commit เอง · ทางสุดท้าย Full access ใน chat นั้น |
| `npm ci` ล้ม EPERM (esbuild postinstall, GH#45697) | รันใน terminal ของตัวเอง ไม่ใช่ใน chat |
| แอปค้างตอนเปิดเพราะตรวจ PATH ของ WSL (GH#60143) | อัปเดตแอป หรือปิด WSL integration ชั่วคราว (`wsl --shutdown`) |
| โหมด Worktree: "Cannot serialize value" (GH#55827) | ไม่โดน เราใช้ Local ทั้งหมด · ถ้าเผลอเปิด Worktree ให้ปิด chat แล้วสร้างใหม่ใน Local |
| hooks ไม่ทำงาน | ดูตารางแก้ปัญหาใน [codex README](../competition-plan/templates/codex/README.md) (ไม่มี `.lane`, ยังไม่ trust, เปิดจากโฟลเดอร์ย่อย) · แก้ไม่ได้ใน 10 นาที: ใช้ตัวตั้งเวลาของแอปแทน พิมพ์ครั้งเดียวในแต่ละ chat ตาม [START.md ข้อ 4](../../START.md) ("Schedule a task in this chat every 5 minutes: run … team-board.ps1 read …") · ทางสุดท้าย: พิมพ์ `read the board` เมื่อแอปแจ้งว่า chat จบ |

## 8. สำรอง: Codex CLI ≥ 0.171

ถ้าแอปมีปัญหาที่แก้ไม่ทันใน 10 นาที (CLI 0.147 ใช้ GPT-6.2 ไม่ได้ ต้อง 0.171 ขึ้นไป):

```powershell
npm install -g @openai/codex@latest
codex --version                              # ต้อง >= 0.171.0
codex -C C:\hack\nless-a1                    # หนึ่ง terminal ต่อ lane (ใช้ %USERPROFILE%\.codex ร่วมกับแอป: config, rules, trust)
```

ใน CLI ตั้ง model/effort ด้วย `/model` (หรือ `-c model_reasoning_effort=high`), Fast ด้วย `/fast`, hooks ด้วย `/hooks` (trust ทุก worktree) · ถ้า CLI ถามล็อกอิน: `codex login` (ChatGPT account; UNCONFIRMED ว่าใช้ session ร่วมกับแอป) · **ห้าม**ล็อกอินด้วย API key (`codex login --with-api-key`): ใช้ API credit ของแอปและตัด cloud features

## 9. MCP: Neon (ทุกคน) และ Render (เฉพาะ C)

กติกาและเหตุผลอยู่ใน [codex README § MCP](../competition-plan/templates/codex/README.md#mcp-neon-ทุกคน-และ-render-เฉพาะ-c) · ทุกคนล็อกอินด้วยบัญชีของตัวเอง ไม่แชร์บัญชีหรือ key ไม่มีค่าลับในไฟล์ บอร์ด หรือแชท

1. **ทุกคน (Neon):** Neon console → project `nless-hack-<A|B|C>` → **Settings** → คัดลอก **Project ID** → แทน `REPLACE_NEON_PROJECT_ID` ใน `[mcp_servers.neon]` ของ `%USERPROFILE%\.codex\config.toml` (มาจาก `user/config.toml` แล้ว)
2. ล็อกอิน แล้วรีสตาร์ทแอป:
   ```powershell
   codex mcp login neon
   ```
   เบราว์เซอร์เปิดหน้า Neon → กด **Authorize** ด้วยบัญชี Neon ของตัวเอง (สมาชิก org `Endless`; ถ้าถามให้เลือก org ให้เลือก `Endless`) (ถ้าไม่มี CLI: เปิด chat ในแอปแล้วถามเรื่อง Neon แอปจะชวน login เอง)
3. **เฉพาะเครื่อง C (Render):** C login Render ในเบราว์เซอร์ก่อน แล้วรัน:
   ```powershell
   codex mcp add render --url https://mcp.render.com/mcp --oauth-client-id codex
   ```
   ทำ authorization ในเบราว์เซอร์ให้จบ → เปิด `%USERPROFILE%\.codex\config.toml` → ใต้หัว `[mcp_servers.render]` ที่คำสั่งเขียนให้ วางบรรทัด `enabled_tools = [...]` จากบล็อกที่ comment ไว้ในไฟล์ (tool อ่านอย่างเดียว) → รีสตาร์ทแอป · ทางเลือก: Plugins → **Render** ในแอป แล้วเพิ่ม `enabled_tools` แบบเดียวกัน
4. ทดสอบตามตาราง UNCONFIRMED ใน codex README § MCP (Neon: list ตารางได้ สร้าง DB ไม่ได้ · Render: list service ได้ สั่ง deploy ไม่ได้)
5. A และ B **ไม่**ต่อ Render (workspace Hobby มีสมาชิกคนเดียว) ต้องการ log ของ production ให้ขอ C0

## 10. เช็กลิสต์ก่อนนอน

- [ ] แอปอัปเดตแล้ว เห็น GPT-6.2 Sol · ล็อกอิน Pro · Codex mode
- [ ] `config.toml` + `rules\default.rules` อยู่ใน `%USERPROFILE%\.codex\` · ไม่มี `AGENTS.md` ส่วนกลาง
- [ ] MCP: Neon ล็อกอินแล้ว list ตารางได้ สร้าง DB ไม่ได้ · เครื่อง C: Render list service ได้ สั่ง deploy ไม่ได้ (§9)
- [ ] ทดสอบ commit ใน worktree ของซ้อมได้โดยไม่ขออนุมัติ (หรือจดว่าไม่ได้ แล้วแจ้งทีม)
- [ ] MANGO / PONG ผ่านในแอป
- [ ] แจ้งเตือนของแอป: turn completion Always, permission on, question on · มือถือจับคู่แล้ว · ทดสอบ `Reply with one word, then stop.` แล้วได้แจ้งเตือนทั้งบนเครื่องและมือถือ
- [ ] ทดสอบใน worktree ซ้อม: สั่ง chat ว่า "จบข้อความด้วยบรรทัดขึ้นต้น 🛑 ต้องการคน: ทดสอบ" แล้ว turn ต้องจบทันที (ไม่ค้างที่ "Waiting up to 9 min") และมีแจ้งเตือน · `alert.ps1 -Test` ได้ยินเสียง + เห็นแจ้งเตือน Windows
- [ ] `powercfg` ตั้งแล้ว · Notifications เปิด · usage page เปิดได้ · ตัดสินใจ auto top-up แล้ว
- [ ] CLI สำรองติดตั้งแล้ว (`codex --version` ≥ 0.171)
- [ ] รายการ UNCONFIRMED ด้านบนที่ป้ายในแอปต่างจากที่เขียน: จดแล้วโพสต์ให้ทีม
