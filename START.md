# START HERE: one line per person

Hackathon: **Saturday 21 Nov 2026, coding 10:00–17:00 (Bangkok)**. Every step below is "open a folder in the ChatGPT app (Codex), type one line". Codex does the work and **the app notifies you, on the PC and on your phone, when it needs you**.

If this page disagrees with [PLAN.md](PLAN.md) on scope or schedule, PLAN.md wins. For how to start, this page wins.

## 1. The lines to type

Open the folder of this planning repo (`sea`) as a project in the ChatGPT app → Codex → **New chat → Work in: This computer** → model **GPT-6.2 Sol**, effort **Medium**, **Approve for me** → type your line.

| When | Person A | Person B | Person C |
|---|---|---|---|
| **Before the event** (tonight or by 09:00) | `You are A. Prepare this PC: follow START.md section "Prep".` | `You are B. Prepare this PC: follow START.md section "Prep".` | `You are C. Prepare this PC: follow START.md section "Prep".` |
| **10:00 sharp** | `You are A. Start the day: follow START.md section "Day".` | `You are B. Start the day: follow START.md section "Day".` | `You are C. Start the day: follow START.md section "Day".` |

The day line ends by printing four folders and **one line for each of your four chats** (also saved as `..\nless-START-<letter>.txt`). They look like this:

| Chat | Folder | Effort · Fast | Line to type |
|---|---|---|---|
| C1 (first, ~10:05) | `..\nless-c1` | Medium · Fast on | `You are C1. Open prompts/C1-setup.md and do exactly what the text block under "1. Prompt" says, as if I had pasted it here. Start now.` |
| A0 / B0 / C0 | `..\nless-<p>0` | High · Fast off until `SETUP READY` | `You are A0. Open prompts/orchestrators/A0.md and do exactly what its text block says, as if I had pasted it here. Start now.` |
| A1…A3, B1…B3, C2, C3 | `..\nless-<lane>` | Medium · Fast per the printed list | `You are A1. Open prompts/lanes/A1.md and do exactly what its text block says, as if I had pasted it here. Start now.` |
| C1 again, after the first production deploy | `..\nless-c1`, **new chat** | Medium | `You are C1. Open prompts/lanes/C1.md and do exactly what its text block says, as if I had pasted it here. Start now.` |

For each folder: **Add new project** (Ctrl+O) → pick the folder → **Trust** → New chat → **This computer** (never Worktree mode) → GPT-6.2 Sol → effort and Fast as printed → Approve for me → Review hooks: trust all three → type the line. Details and known app problems: [chatgpt-app-setup.md](docs/day/chatgpt-app-setup.md).

## 2. Fill this in once (lead, tonight)

`docs/competition-plan/team.json` is the only place that says who is who. The scripts read it to fill the prompts, the board settings and the repo name.

```json
{
  "competitionRepo": "<C's GitHub login>/<new repo name>",
  "boardIssue": 0,
  "lead": "A",
  "people": {
    "A": { "name": "…", "login": "<GitHub login>" },
    "B": { "name": "…", "login": "<GitHub login>" },
    "C": { "name": "…", "login": "<GitHub login>" }
  }
}
```

Share the roster before the event. Any repo and issue already recorded here are for rehearsal. At the official start, C gives the go-ahead, switches to the new public competition repo, and shares its board link. Follow [Day](#day-instructions-for-codex).

## 3. When Codex needs you

The ChatGPT app tells you itself, on the desktop and on your phone. Set it up once per PC (2 minutes):

1. **Desktop:** ChatGPT app → **Settings → Notifications**: turn completion = **Always**, permission notifications **on**, question notifications **on**. Allow the app in Windows Settings → System → Notifications, and keep Do not disturb / Focus off for the day.
2. **Phone:** ChatGPT app → **Settings → Connections → Control this Mac or PC → Set up**, then scan the QR code with the ChatGPT mobile app (same account) and allow its notifications. The phone then gets a notification when a chat finishes or needs your attention, and you can answer or approve from the phone. Pair only your own phone. The PC must stay awake and online.
3. **Check:** in any chat type `Reply with one word, then stop.` and switch to another window. A desktop notification and a phone notification should arrive.

Phone pairing depends on rollout and, for managed accounts, on the workspace allowing Remote Control. If it is not offered on your account, the desktop notification and the beep below still work. Sources: [Notifications](https://learn.chatgpt.com/docs/notifications?surface=app), [Remote connections](https://learn.chatgpt.com/docs/remote-connections).

What the app notifies about, and what our setup adds:

| Situation | What you get |
|---|---|
| A chat asks for an approval (permission) | App notification, at once. Answer in the chat or on the phone |
| A chat is blocked and needs you | It posts `BLOCKED @<you>` (this PC beeps three times and shows a Windows notification that stays), then **ends its turn** with a block that starts with **🛑 ต้องการคน:** (what is stuck, options, the exact step). The app notifies desktop and phone because the turn ended |
| A chat finished and is idle | It keeps listening to the board by itself (section 4). When a worker has heard nothing for about 70 minutes it stops and the app notifies you: type `read the board` or give the next instruction |
| A chat is blocked on another lane, not on you | No notification: it keeps working and its orchestrator handles it |

A session counts as blocked when it failed twice, has been stuck for 20 minutes, needs your account, a secret or a decision, would have to edit outside its folders, or a provider is down.

Why the stop sign matters: while a chat waits for board posts, its turn is still running, so the app would stay silent for up to nine minutes. Our Stop hook sees the 🛑 line and lets the turn end immediately.

Your side: answer in that chat within 5 minutes. Past alerts are in `..\nless.alerts.log`. Optional second screen: a terminal in `..\nless-<p>0` that prints every board post and beeps on `BLOCKED` and on posts that mention you:

```powershell
while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }
```

## 4. How the chats talk to each other

**One board: the pinned issue of the public competition repo on GitHub.** Every chat uses `tools/team-board.ps1` to read it and post concise updates. `BOARD_REPO`, `BOARD_ISSUE`, and the three `BOARD_TEAM_LOGINS` come from `team.json`. The reader filters GitHub authors by login and refuses to read a public board without an allowlist. Post only task IDs, PR links, and sanitized evidence. Use a private channel for sensitive discussion. The [Codex coordination options](docs/board/REHEARSAL-REVIEW-2026-11-20.md#codex-collaboration-options) explain what native tools the team can use alongside the board.

| What | How it works |
|---|---|
| A chat posts | `team-board.ps1 post` / `status` / `stage` adds a comment to the issue. `TO:A1` addresses a lane, `@login` addresses a person |
| A chat hears a post | When it ends a turn, the Stop hook listens for posts addressed to its lane (it checks every 30 seconds, in 9-minute windows) and continues the chat with the post |
| A quiet 9 minutes | The hook continues the chat with a one-line heartbeat ("nothing new, reply waiting") and listens again. Orchestrators stay on all day; a worker stays on for about 70 minutes, then stops and the app notifies you. Type `read the board` to start it again |
| You watch | The issue page on GitHub (web or phone), or the `watch` terminal of section 3. Click **Unsubscribe** on the issue, or GitHub mails you every post |

Test the round trip once from all three PCs (10 minutes) using the rehearsal repo and board before the event. Repeat the board check in the new competition repo at the event start:

1. Everyone, in the planning repo: `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\team-board.ps1 check -AgentId LEAD` must print `Board: … state=open`.
2. One person posts `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\team-board.ps1 post -AgentId LEAD -Text "LEAD: test from <name>" -PostId test-<name>`; the other two see it on the issue page.
3. In the ChatGPT app, do the 5-minute hook test of [the Codex README](docs/competition-plan/templates/codex/README.md) (MANGO / PONG). It proves that hooks run in the app and that a post wakes a chat.

If hooks do not run in the app, use the app's own timer instead. Type this once in each chat (it is the "schedule a task inside a chat" feature):

```text
Schedule a task in this chat every 5 minutes: run "powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 read". If it prints posts for this lane, act on them as your prompt says. If it prints "No new posts", end the turn at once without doing anything else.
```

Last resort: when the app says a chat finished, type `read the board` in it.

If a chat reports that `gh` is not signed in while it works in your own terminal: the board script must run outside the sandbox. Prep installs the rule for that in `%USERPROFILE%\.codex\rules\default.rules`; restart the app fully after Prep, or approve the command when the chat asks.

## 5. Times that do not move

| Time | What must be true | If it is not |
|---|---|---|
| 10:00 | Everyone has typed the Day line | Read the `[FAIL]` and `[HUMAN]` lines; fix; run again |
| **11:00** | C1 posted `SETUP READY` | C1 ships the "minimum" of each remaining step ([C1-setup.md §5](prompts/C1-setup.md)); everyone else keeps planning |
| 11:30 | Production answers `/healthz` | Render stuck for 15 min → Railway ([deployment.md](docs/day/deployment.md)) |
| **13:00** | Core-loop gate passes on production (Demo Chat) | Tagged lanes stop new features until it passes |
| 14:30 | Lead decides what to cut | Cut order: F30 → F16 → F21 → F23 → F22 → F39 → F12 → F31 extras (settings, web push) → F26 |
| **15:30** | `LEAD: FREEZE`: no new features | Anything not real on production is hidden from the menu |
| 16:30 | Demo video recorded | Record what works now; label it a recording |
| **16:45** | Deploy freeze, `pg_dump`, **submit** | Submit what is on production. A late polish is worth less than a missed deadline |
| 17:00 | Organizer code freeze | Nothing is pushed after this |

Set phone alarms for 11:00, 13:00, 15:30 and **16:40**.

## 6. If something breaks at the start

| Problem | Do this |
|---|---|
| The Day line prints `[HUMAN] You cannot open <repo>` | C has not created the repo, or you have not accepted the invitation: open `https://github.com/<repo>/invitations` |
| `[WAIT] origin/main has no baseline yet` for more than 5 minutes | C runs the Day line (C's PC pushes the baseline). C is away: the lead runs `start-day.ps1 -Person <own letter> -Mode Day -Baseline` |
| The app does not see Sol, hooks or the project | Update the app, restart it fully (tray icon too), trust the project again |
| Hooks do not wake a chat | Trust the project and its three hooks again. Still nothing: the scheduled task of section 4, or type `read the board` in that chat |
| The app freezes | Task Manager → end `codex.exe … app-server` → reopen. Still bad after 10 minutes: Codex CLI ≥ 0.171, one terminal per lane (`codex -C ..\nless-a1`), same one-line prompt |
| `npm ci` fails with EPERM, or a dev server is needed | You run it in your own terminal; agents cannot keep a process alive |
| No notification when a chat needs you | App: Settings → Notifications (turn completion Always, permission and question on). Windows: Notifications on, Do not disturb off. Phone: still listed under Settings → Connections, notifications allowed. The 🛑 block in the chat and `..\nless.alerts.log` always exist |
| A PC dies | Production is on Render, code is on GitHub. Use the fallback "orchestrator + 2 workers" in [prompts/README.md](prompts/README.md#fallback-orchestrator--2-workers) on the remaining PCs |
| Wi-Fi fails | Phone hotspot. Everything else: [failure-drills.md](docs/day/failure-drills.md) (18 cases with the first five minutes of each) |

---

## Prep (instructions for Codex)

You were told `You are <A|B|C>. Prepare this PC`. The goal is that this PC passes every check before 10:00 and its owner knows exactly which steps are theirs.

1. Run `git pull --ff-only` in this repo.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person <letter> -Mode Prep`. Use the rehearsal repo and board for the GitHub checks. Wait for the official start to create the competition repo and its board.
3. Read every line of the output. Fix what you can without asking and run the script again:
   - `npx playwright install chromium` when preflight says Playwright is missing.
   - `npm ci` inside `docs\competition-plan\tools\preflight-db` when the database probe needs it.
   - Anything the script marks `[FAIL]` that is a file or a git setting.
4. Do **not** do these yourself; give the person the exact command or clicks instead: installers (`winget …`, `npm install -g …`), `gh auth login`, `codex mcp login`, `powercfg` (the block in [chatgpt-app-setup.md §6](docs/day/chatgpt-app-setup.md)), creating accounts or API keys, accepting invitations, typing any secret. The person types keys into `..\nless.secrets.env` themselves; never ask them to paste a secret into the chat and never print one.
5. When `OPENAI_API_KEY` is in the secrets file, run once: `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1 -OpenAI` (about US$0.08). It proves that every model the app uses exists on this account. A model that returns 403 or 404 is a blocker for the lead.
6. Walk the person through what only they can do, one item at a time, using [pc-preparation.md](docs/day/pc-preparation.md) and [chatgpt-app-setup.md](docs/day/chatgpt-app-setup.md) and their prep sheet `prompts/people/PREP-<letter>.md` (the full checklist for that person, in order; section 6 is what only they can do). Ask them to confirm the alert test (beeps and a Windows notification) and to do the three notification steps of section 3 (app settings, phone pairing, the one-word check).
7. Finish with a table: check, PASS / WARN / FAIL, and for each open item who does what. If anything is still `[FAIL]` or `[HUMAN]`, write a line starting with `🛑 ต้องการคน:` and run `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\alert.ps1 "Prep <letter>: <what you need>"`.

Do not build application code and do not copy anything into the competition repo in this mode.

## Day (instructions for Codex)

You were told `You are <A|B|C>. Start the day`. The goal is four worktrees ready in under five minutes.

1. Run `git pull --ff-only` in this repo.
2. At the official start, wait for **C's explicit go-ahead** before creating anything. C puts the fresh `owner/repo` in local `docs/competition-plan/team.json` and sets `boardIssue` to `0`. In `..\nless.secrets.env`, blank `BOARD_REPO` and `BOARD_ISSUE` so the script can replace the rehearsal coordinates. Clear any stale shell overrides and confirm the three `BOARD_TEAM_LOGINS` match the roster. Preserve credentials. Use `BOARD_SOURCE=github` and leave optional Sites entries blank if they point to rehearsal. Review the baseline for public release before running `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person C -Mode Day`. It creates the new **public** GitHub repo, invites A and B, creates and pins the issue, and pushes the declared planning-only baseline. If C creates it manually, create an empty public repo without a starter commit and send A and B write invitations. Share the repo and pinned issue URL as soon as the issue exists.
3. **A and B** accept the new repo invitations. Use C's new repo and issue values in local `docs/competition-plan/team.json`, clear the two rehearsal board entries and shell overrides, then run `powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person <letter> -Mode Day`. Move any old clone or worktree at an intended path aside first. Verify each worktree's `git remote get-url origin` and confirm the exact board is open, public, and reports three configured team logins. Test a sanitized, addressed handoff across machines. Use `read` to check delivery before enabling hooks, then verify one hook wake-up after review and trust. Sync subsequent shared plan changes through a reviewed PR and update the lanes from the merged revision.
4. Resolve `[FAIL]` and `[HUMAN]` lines, then rerun Day setup as needed. For post-setup review and evidence, follow the [Codex review handoff](PLAN.md#codex-review-and-handoff-evidence).
5. When the worktrees are ready, show the person the block that starts with `ENDLESS - person <letter> - what to do now` exactly as printed. That block is their checklist.
6. Stay available in this chat as the person's helper for the day: re-run the script, read `..\nless.alerts.log`, explain a board post. Do **not** write application code from this chat and do not edit files inside the `nless-*` worktrees: each lane's own chat does that.

If the script itself fails, the manual steps are in [prompts/C1-setup.md §0.2–0.3](prompts/C1-setup.md) and [chatgpt-app-setup.md §2](docs/day/chatgpt-app-setup.md).
