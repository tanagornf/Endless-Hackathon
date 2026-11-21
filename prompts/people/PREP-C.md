# Prep sheet, person C: platform, channels, settings and access, production

Name: Tanagorn Fukuhara · GitHub: @tanagornf

Everything you finish **before 10:00 on Saturday 21 Nov 2026**, in order. Tick each box. Your lanes on the day: C1 setup and the first deploy, jobs, release · C2 LINE, Messenger and Instagram · C3 shop settings, permissions, sign-in, notifications. What you do during the day is on your day sheet, [C.md](./C.md).

If this page disagrees with [START.md](../../START.md) on how to start, START.md wins. On scope and schedule, [PLAN.md](../../PLAN.md) wins.

## 1. Start with one line

- [ ] In the ChatGPT app (Codex), open the folder of this planning repo (`sea`) as a project → **New chat → Work in: This computer** → model **GPT-6.2 Sol**, effort **Medium**, **Approve for me**, then type:

```text
You are C. Prepare this PC: follow START.md section "Prep".
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

- [ ] **Neon for the team:** create the organization `Endless` with three projects (`nless-hack-a`, `nless-hack-b`, `nless-hack-c`, region Singapore) and invite A and B on the People page ([environments.md](../../docs/day/environments.md)).
- [ ] **Competition repo and board:** during Prep, check the rehearsal board. At the official start, follow [START.md Day](../../START.md#day-instructions-for-codex) to create a fresh competition repo and its pinned issue, then give A and B the new repo and issue URL.
- [ ] **Rehearse the C1 setup** from an empty folder with [C1-setup.md](../C1-setup.md) and time it (target 45 minutes, 55 at most). Delete the rehearsal repo afterwards.
- [ ] **Render:** account with a card, one rehearsal deploy from the blueprint. Check the Singapore region, the disk, Postgres with `CREATE EXTENSION vector`, and WebSocket. **Railway:** a verified account and one rehearsal of the fallback ([deployment.md](../../docs/day/deployment.md)).
- [ ] **LINE:** two Messaging API channels. *NLess Demo* is the one judges scan; its webhook will point at production and its secret and token go into Render only. *NLess Dev* points at your tunnel; its secret and token go into `..\nless.secrets.env`. Turn off auto-reply and the greeting message on the Demo account.
- [ ] **LINE display name:** change the display name of the demo account to **Endless** in LINE Official Account Manager (Settings → Account name). The channel name in the Developers console stays *NLess Demo*. Do it before the QR is printed if you can; your day sheet repeats it at 12:00. If LINE does not allow the change, tell the lead.
- [ ] **Meta:** a developer app in development mode, a test Page, a test Instagram account, and test users or app roles for all three people. Write down the Graph API version the dashboard shows.
- [ ] **Tunnel:** cloudflared (or ngrok) receives a LINE Dev webhook on this PC ([environments.md](../../docs/day/environments.md)).
- [ ] **Keys you generate:** VAPID keys for web push and `TOKEN_ENCRYPTION_KEY`, with the commands in `.env.example`.
- [ ] **Production key:** the lead holds the `app-prod` OpenAI key and gives it to you privately for Render. It never goes into a file on a PC, a chat or the board.
- [ ] **Render MCP** for C0 only, read-only ([chatgpt-app-setup.md §9](../../docs/day/chatgpt-app-setup.md)).

## 7. Read before 10:00

- [ ] [docs/PRODUCT.md](../../docs/PRODUCT.md): what the finished product is. About ten minutes. Every Codex session reads it too, so you will be judging their work against it.
- [ ] Your day sheet [C.md](./C.md) and your orchestrator's prompt [C0.md](../orchestrators/C0.md), so you know what it will ask of you (change effort or Fast, run a dev server, report usage).
- [ ] [START.md](../../START.md) sections 3, 5 and 6: how Codex reaches you, the times that do not move, and what to do if the start breaks.
- [ ] Specs in full: [F01 core](../../docs/specs/F01-core.md), [F35 jobs](../../docs/specs/F35-core-jobs.md), [F17 LINE](../../docs/specs/F17-line.md), [F04 settings](../../docs/specs/F04-business-settings.md), [F03 tenancy](../../docs/specs/F03-tenancy.md).
- [ ] Sections 1 and 11 only: [F02](../../docs/specs/F02-auth.md), [F18](../../docs/specs/F18-meta.md), [F36](../../docs/specs/F36-release.md), [F39](../../docs/specs/F39-chatgpt-catalog.md), [F31](../../docs/specs/F31-notifications.md).
- [ ] [C1-setup.md](../C1-setup.md) once more, and [deployment.md](../../docs/day/deployment.md) section 4 (the first deploy and the LINE webhook switch).

## 8. If you prepared before the morning of 21 Nov

Pull `main` again (`git pull --ff-only`) and note what changed:

- The product is called **Endless** wherever a user sees a name. Folder names, `nless.secrets.env` and the LINE channel names keep the old name.
- Both languages are mandatory: every page and every message to a customer exists in Thai and English.
- F31 notifications moved to **P1** for its first slice (the in-app bell). C3 does it after F02 when `LEAD: OPEN P1` is posted; settings and web push stay P2.
- The C1 setup grew by about 10 minutes: the shared language helpers, the `TH | EN` switch and the check that every feature ships both language files.
- `start-day.ps1` now creates a missing work folder, and `preflight.ps1 -OpenAI` makes its own test images (it needs Python with Pillow).
- The 13:00 gate has one English question: `How much is A-GAME-01?` must be answered in English with `1,490 baht`.

## 9. Bring

Laptop and charger · your own phone, paired with the ChatGPT app · a hotspot you can fall back on · A second phone or account that is a friend of the LINE demo account · the Render and Railway logins · the printed QR codes if you print them

## 10. You are ready when

- [ ] `preflight.ps1` shows 0 FAIL and the `-OpenAI` run passed.
- [ ] The board check prints `state=open` and your test post was seen by the other two.
- [ ] A notification reached both the desktop and your phone.
- [ ] You can open the competition repo.
- [ ] Every box in section 6 is ticked, or the lead knows which one is not.
- [ ] You told the team your preflight result.

At 10:00 sharp you type the Day line from [START.md](../../START.md): `You are C. Start the day: follow START.md section "Day".`
