# Prep sheet, person A: inbox, sales, customers

Name: Wattanun Teeratanapong · GitHub: @Ikkyuuuu

Everything you finish **before 10:00 on Saturday 21 Nov 2026**, in order. Tick each box. Your lanes on the day: A1 inbox and Demo Chat, then staff takeover · A2 orders, payment QR and slip check, live codes · A3 customers, booking, calendar. What you do during the day is on your day sheet, [A.md](./A.md).

If this page disagrees with [START.md](../../START.md) on how to start, START.md wins. On scope and schedule, [PLAN.md](../../PLAN.md) wins.

## 1. Start with one line

- [ ] In the ChatGPT app (Codex), open the folder of this planning repo (`sea`) as a project → **New chat → Work in: This computer** → model **GPT-6.2 Sol**, effort **Medium**, **Approve for me**, then type:

```text
You are A. Prepare this PC: follow START.md section "Prep".
```

Codex pulls the repo, runs the checks, fixes what it can and tells you each step that only you can do. The sections below are those steps, so you can also work through them by hand.

## 2. This PC

- [ ] **Folders:** one short work folder with no spaces and no Thai letters, for example `C:\hack`. The planning repo is `C:\hack\sea`. The secrets file will be `C:\hack\nless.secrets.env`, next to the repo and never inside one.
- [ ] **Git for Windows**, then `git config --global core.longpaths true`, and set `user.name` and `user.email`. If GitHub rejects a push because of e-mail privacy, set `user.email` to your GitHub noreply address.
- [ ] **Node.js 24 LTS:** `node -v` prints `v24.x` and `npm -v` works.
- [ ] **GitHub CLI:** `gh auth login` (GitHub.com, HTTPS, in the browser), then `gh auth status`. You run this yourself; Codex must not.
- [ ] **ChatGPT app:** latest version, signed in with the Pro account, Codex visible, model GPT-6.2 Sol available.
- [ ] **Playwright browser:** `npx playwright install chromium` (about 300 MB, once).
- [ ] **No global Codex rules file:** if `%USERPROFILE%\.codex\AGENTS.md` exists, rename it for the day. Together with the project rules it goes over the size limit.
- [ ] **The PC stays awake:** the power settings block in [chatgpt-app-setup.md §6](../../docs/day/chatgpt-app-setup.md). Plug in the charger.
- [ ] Not needed: Docker, a local Postgres.

## 3. Accounts and the secrets file

You type every value yourself, from the dashboard, into `..\nless.secrets.env`, one `NAME=value` per line. Never paste a key into a chat, an e-mail or the board, and never ask Codex to read one out.

- [ ] **OpenAI:** your own project `app-dev` with a hard limit of US$30 → `OPENAI_API_KEY`.
- [ ] **Neon:** your own project (Singapore), **Direct connection** string → `PG_SERVER_URL`.
- [ ] **Board:** `BOARD_REPO`, `BOARD_ISSUE` and `BOARD_TEAM_LOGINS`. Use rehearsal coordinates in Prep. At the official start, switch to the new repo and board using [START.md Day](../../START.md#day-instructions-for-codex).
- [ ] **GitHub access:** verify access on the rehearsal repo in Prep. A and B accept the new competition repo invitations when C shares them at the official start.
- [ ] Not needed on your PC: the production key (`app-prod`), which lives in Render only.

## 4. Codex in the ChatGPT app

Follow [chatgpt-app-setup.md](../../docs/day/chatgpt-app-setup.md) once. The parts that matter most:

- [ ] `config.toml` and `rules\default.rules` are installed in `%USERPROFILE%\.codex\` (the Prep line installs them). Restart the app fully afterwards, tray icon included.
- [ ] **Hook test (MANGO / PONG):** the five-minute test in [the Codex README](../../docs/competition-plan/templates/codex/README.md). It proves a board post wakes a chat.
- [ ] **Commit test:** a chat can commit from inside a worktree.
- [ ] **Neon MCP**, read-only, for your own project ([§9](../../docs/day/chatgpt-app-setup.md)).
- [ ] **Notifications, three steps** ([START.md section 3](../../START.md)): in the app, turn completion = Always, permission on, question on · pair your own phone under Settings → Connections · type `Reply with one word, then stop.` in a chat, switch windows, and check that the desktop and the phone both notify you.
- [ ] **Alert test:** `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\alert.ps1 -Test` beeps and shows a Windows notification.

## 5. Checks to run

Run these in the planning repo. None of them prints a secret.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1 -OpenAI
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\team-board.ps1 check -AgentId LEAD
```

- [ ] The first prints a table with **0 FAIL**.
- [ ] The second calls the real OpenAI API once with your key (about US$0.08) and every check passes.
- [ ] The third prints `Board: … state=open`.
- [ ] One test post reaches the others: the round trip in [START.md section 4](../../START.md).

## 6. Only you

- [ ] **Payment test ID (F14):** agree the synthetic shop's PromptPay test ID with the team and type it into `..\nless.secrets.env` as `PROMPTPAY_TEST_ID`. No real transfer happens at any point.
- [ ] **Scan one generated QR:** build a QR from the example payload in [spec F14](../../docs/specs/F14-payments.md) and scan it with a real banking app. Look at the amount only. Do not transfer.
- [ ] **Google Calendar (F16):** a Google OAuth client with these redirect URIs: `http://localhost:5179/oauth/callback`, `http://localhost:5170/oauth/callback`, and the production URL once C has it. Add your test user on the consent screen.
- [ ] **Your phone as the judge's phone:** you test Demo Chat, the inbox and takeover on production at 12:30 with your own phone on mobile data, not on the venue Wi-Fi. Check that mobile data works where you will sit.
- [ ] **If you present:** rehearse the [demo loop](../../docs/pitch/demo-loop.md) and the [pitch](../../docs/pitch/PITCH.md) once, out loud, with one Thai and one English question.

## 7. Read before 10:00

- [ ] [docs/PRODUCT.md](../../docs/PRODUCT.md): what the finished product is. About ten minutes. Every Codex session reads it too, so you will be judging their work against it.
- [ ] Your day sheet [A.md](./A.md) and your orchestrator's prompt [A0.md](../orchestrators/A0.md), so you know what it will ask of you (change effort or Fast, run a dev server, report usage).
- [ ] [START.md](../../START.md) sections 3, 5 and 6: how Codex reaches you, the times that do not move, and what to do if the start breaks.
- [ ] Specs in full: [F09 inbox](../../docs/specs/F09-inbox.md), [F11 team](../../docs/specs/F11-team.md) (both are in the 13:00 gate).
- [ ] Sections 1 and 11 only: [F13](../../docs/specs/F13-orders.md), [F14](../../docs/specs/F14-payments.md), [F22](../../docs/specs/F22-live-commerce.md), [F24](../../docs/specs/F24-crm.md).

## 8. If you prepared before the morning of 21 Nov

Pull `main` again (`git pull --ff-only`) and note what changed:

- The product is called **Endless** wherever a user sees a name. Folder names, `nless.secrets.env` and the LINE channel names keep the old name.
- Both languages are mandatory: every page and every message to a customer exists in Thai and English.
- F22 live commerce moved to **P2**: A2 starts it only after `LEAD: OPEN P2`.
- After the gate, A1 does F11 slices 2 and 3 first (waiting queue, staff status, automatic assignment) before templates and broadcast.
- Order, payment and booking messages and card labels must exist in Thai and English and follow the customer's language.

## 9. Bring

Laptop and charger · your own phone, paired with the ChatGPT app · a hotspot you can fall back on · Your phone with LINE installed and mobile data · a second browser profile or device to play the customer

## 10. You are ready when

- [ ] `preflight.ps1` shows 0 FAIL and the `-OpenAI` run passed.
- [ ] The board check prints `state=open` and your test post was seen by the other two.
- [ ] A notification reached both the desktop and your phone.
- [ ] You can open the competition repo.
- [ ] Every box in section 6 is ticked, or the lead knows which one is not.
- [ ] You told the team your preflight result.

At 10:00 sharp you type the Day line from [START.md](../../START.md): `You are A. Start the day: follow START.md section "Day".`
