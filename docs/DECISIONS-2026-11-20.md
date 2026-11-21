# Decision record, 20 Nov 2026 (evening)

Source of truth for the final plan rewrite. Facts behind each decision: [research/hackathon-brief.md](research/hackathon-brief.md). Earlier decisions that still stand: 28-feature scope (8 features removed), OpenAI-only AI with `gpt-6.2-sol` for every text job, ChatGPT Sites board with GitHub mirror, 3 people A/B/C, tiers P0–P3, CORE-LOOP GATE 13:00. Where this file conflicts with older docs, this file wins.

## D1. Build from our own specs; Papi code is not opened by default

- Thailand's rules allow "personal or open-source projects" and judge only work done at the event; company code is not mentioned, and sister events banned pre-built code. A company codebase is neither personal nor open source.
- **Default = spec-driven build from an empty repo.** `../papi-ref` stays closed unless the organizers confirm **in writing** that company code may be used as reference; even then it is read-only behaviour reference, never copied.
- Therefore every feature spec must be complete enough to build without Papi: data model, endpoints, algorithms, prompts, UI, tests. Papi knowledge already captured in briefs (behaviours, edge cases) is our know-how and stays.
- Brought into the competition repo at 10:00 and declared as prior work in the README: planning docs, prompts, `contracts.ts` (types and specs, no implementation), board script, Codex hooks/config. **Not** brought in: `tools/openai-check` (pre-event research code) and anything from Papi.

## D2. One orchestrator per person + 3 worker lanes, each in its own worktree

- Codex sub-agents share the parent's folder, sandbox and approvals, so parallel code-writing sub-agents in one folder conflict. Parallel coding needs separate worktrees.
- Per person: **1 orchestrator session** (lanes `A0`, `B0`, `C0`, worktree `..\nless-a0` …) + **3 worker sessions** (existing lanes A1–C3, each in its own worktree). 12 Codex sessions in total.
- **Orchestrator duties:** read specs and the board; send each worker its next task (`TO:<lane>` posts, which wake workers through the Stop hook); keep the person's lanes unblocked; review merged work against the spec; run integration and production smoke tests; fix cross-lane bugs (D5); post `STAGE` updates (D9); watch the person's usage (D4); talk to the other two orchestrators and the human lead. Orchestrators may spawn **read-only** sub-agents (explore, triage test failures, review a diff) but never code-writing sub-agents in their own worktree.
- Workers build features exactly as their lane prompt and specs say, self-merge when CI is green, and post DONE/STATUS.
- The human lead (one of A/B/C) still opens tiers, posts BUDGET/FREEZE and moves features between lanes.

## D3. Codex model and effort per task (all `gpt-6.2-sol`; never Astra, never `ultra`)

| Task | Model | Reasoning effort | Fast mode |
|---|---|---|---|
| Orchestrator: planning, dispatch, review, integration | gpt-6.2-sol | high (plan mode high) | on 10:45–13:00 and 15:30–17:00 only |
| C1 setup (everyone waits on it) | gpt-6.2-sol | medium | **on** |
| Worker feature build | gpt-6.2-sol | medium | on only for P0 lanes before the 13:00 gate, if the person's usage < 40% |
| Mechanical work (i18n, seeds, fixtures, renames, docs) | gpt-6.2-sol | low | off |
| Read-only sub-agents (explore, test triage, review) | gpt-6.2-sol | low | inherits parent; turn parent Fast off before spawning several |
| Hard debugging (stuck > 20 min) | gpt-6.2-sol | xhigh | on |
| Still stuck > 45 min | gpt-6.2-sol | max (one session at a time) | on |

- Codex runs in the **ChatGPT desktop app** (D14), updated tonight; the CLI ≥ 0.171.0 is only a fallback (0.147 cannot use GPT-6.2). `~/.codex/config.toml` has `model = "gpt-6.2-sol"`, `approvals_reviewer = "auto_review"`, `sandbox_mode = "workspace-write"` with network access, `[agents]` defaults (sub-agent model Sol, effort low, max 4 concurrent), MXC sandbox tested, `git config --global core.longpaths true`. Dev servers run in a human terminal (MXC kills background processes).

## D4. Equal cost and time per person

- **Codex:** each person's Pro included usage first, then their own US$100 Codex credits (≈2,500 credits). Estimate ≈3,600 credits-equivalent per person for the day (orchestrator high + 3 workers half-active + 1 h hard debugging + limited Fast). Lead checks every checkpoint; anyone past 50% of the weekly allowance by 13:00 → workers to effort low, Fast off.
- **Codex never logs in with an API key** unless both included usage and Codex credits are exhausted (API credits may not cover Codex — UNCONFIRMED).
- **API credits (app runtime), split equally:** each person's lanes use **that person's own API key** for local dev and tests (OpenAI project `app-dev`, hard limit US$30). Production on Render uses **one** key in project `app-prod` (hard limit US$60, holder = lead). Dev traffic is spread across 3 accounts; prod stays isolated.
- Work is balanced on midpoint minutes per person (target ±5%) including the new features in D8; the plan must show the per-person totals.

## D5. Cross-lane fixes

- Workers never edit outside their lane; they post `FIX TO:<lane> <what is broken, file, how to reproduce>`.
- Orchestrators may fix another lane's code when: the bug blocks their lanes or breaks `main`/production; the fix is small (≈≤40 lines, no contract signature change, no migration on someone else's tables); they post `FIX <owner-lane> <file> <reason>` first and wait 5 minutes for an objection (skip the wait if `main`/production is broken); they use branch `fix/<owner-lane>/<slug>` with a test; they post `DONE FIX`. Bigger fixes go to the owner as a `FIX TO:<lane>` request. Contract changes still use `CHANGE`.
- CI ownership check allows `fix/<lane>/…` branches opened from orchestrator worktrees (`.lane` = A0/B0/C0).

## D6. "Production ready" is the bar, not mocks

- A feature counts as done (R) only when: real UI wired to real API and DB; real provider calls where the feature has one (LINE real OA, Meta test users, OpenAI real, Google test user); deployed on the production URL; unit + route tests plus one Playwright smoke against production; loading/empty/error states; Thai-first i18n; permission checks and tenant isolation; audit where money or customer data changes.
- Fakes exist only until the owner replaces them. **Anything not R at 15:30 is hidden from the menu by a feature flag** (no placeholder pages in front of judges) and reported honestly in FEATURE_STATUS.

## D7. Production deployment on Render (Singapore) from the first hour

- C1 setup adds `Dockerfile`, `render.yaml` (web service + Postgres 17 with pgvector + 1 GB disk, `preDeployCommand` migrations, `/healthz`), and auto-deploy from `main`. **First production deploy by 11:30.**
- LINE webhook points at production from ~12:00 (tunnel only for local debugging). Judges use the LINE OA (anyone can add it) and the web Demo Chat on their phones; Messenger/Instagram are demoed by the team (Meta dev mode = app roles only).
- Fallback: Railway Hobby (Singapore) prepared and verified the day before; last resort: laptop + Cloudflare named tunnel.
- Deploy freeze 16:45; uptime monitor on `/healthz` from 16:30; warm-up at 17:00 (voice session, LINE message, upload).

## D8. Scope additions driven by the judging criteria (owners are proposals; rebalance per D4)

| ID | Feature | Why judges care | Owner / tier |
|---|---|---|---|
| F14+ | Per-order dynamic PromptPay QR (EMVCo payload with amount + order ref); slip QR decode (e.g. jsQR) + duplicate transaction ref + amount/receiver checks + vision read as fallback | payment trust vs forged slips (Krungthai warning, Monee fraud focus) | A2 · P1 (part of F14) |
| F27+ | Seller impact metrics: auto-resolved %, median first-response time, handoff rate, orders from chat, recovered follow-ups | "measurable", Shopee BI judge | B3 · P2 (part of F27) |
| F37 | AI evals: Thai eval set (≥40 chat cases: prices, out-of-catalog, bargaining, jailbreak, handoff, order extraction; ≥10 synthetic slips incl. forged/duplicate) + runner (CI on fake model, manual/real run on demand) + "AI quality" page with latest pass rates | depth of thinking, build quality, Codex-written tests | B3 · P2 |
| F38 | Follow-up nudges: one polite follow-up after N hours when a customer asked about price/product and neither ordered nor got a staff reply; respects takeover and opt-out | LINE: >90% of new chats get no follow-up | C3 · P2 |
| F39 | ChatGPT-ready catalog: ACP-format product feed export + small MCP server (`search_catalog`, `get_price`, `propose_order`) | OpenAI agentic commerce / MCP; "Shopee in ChatGPT" for small shops | C1 · P3 |

## D9. Status and stage reporting

- Every session posts `STATUS <lane> <feature> <R|S|A|U> <note>` when it starts, finishes or blocks a feature.
- Each orchestrator posts `STAGE <person> <summary>` every 30 minutes (what is done, in progress, blocked, next) and keeps its person card current.
- Dashboard shows: team stage (Setup → P0 → Gate → P1/P2 → Freeze → Demo), 3 person cards (from orchestrators), 12 lane cards, budget per person, feed. Board script, tests, hooks and the Sites spec accept lanes `A0 B0 C0` and the `STAGE` / `FIX` post types.

## D10. Pitch and demo angles (sourced numbers only)

1. "The off-Shopee half of Thai chat commerce": LINE, Messenger, Instagram where Shopee's chat assistant does not reach; >90% of new LINE OA chats get no follow-up (LINE Thailand). Complements Shopee (live/video >25% of orders; Meta creators +90% QoQ).
2. A bounded autonomous agent: prices only from tools, orders are proposals the customer confirms, human handoff, full turn trace — Autonomous & Adaptive + Deep Domain directions.
3. Payment trust: per-order PromptPay QR + slip checks; ChatGPT can forge slips, our OpenAI-powered checks defend against them.
4. Measured: eval pass rates and seller impact metrics live in the app.
5. Built with Codex: 3 orchestrators + 9 worktree lanes coordinating through a live dashboard, AGENTS.md, hooks, Codex-written tests and evals, PR timeline; one slide on "what humans decided vs what Codex built".

## D11. Submission kit (format unconfirmed, so prepare all)

**21 Nov update:** The opening slides confirmed one Google Form per team by 17:00, with a fresh public repo, project writeup, live demo or prototype, and declarations. Use the [current submission checklist](pitch/SUBMISSION-CHECKLIST.md).

Repo with README (problem, live URL, LINE OA QR, architecture, how Codex was used, prior-work declaration, feature status) · production URL · LINE OA QR card at the table · 2–3 min demo video recorded by 16:30 · 6-slide deck (problem with data, persona, live demo flow, architecture + safety, metrics/evals, Codex usage) · 60–90 s table pitch (TH/EN) · 5–7 min English finalist pitch.

## D12. Day-before checklist additions

ChatGPT app updated + Codex config + rules + hooks test in the app on every hackathon PC (CLI ≥ 0.171 as fallback) · Codex MCP signed in with each person's own account through OAuth: Neon read-only, scoped to that person's dev project (everyone), Render with read-only tools only (C's PC, used by C0) — no shared accounts, no Render/Neon credentials in files, chat or the board · OpenAI projects `app-dev` (each person) and `app-prod` (lead) with hard limits · Render account + card + blueprint dry run; Railway account verified · LINE OA QR printed · Meta test users added · Sites board tested from 3 machines · hooks trusted in all 4 lane projects per person · email organizers about company code (D1) · optional: register the Sites host as a 4th team member (rules allow 3–4) if registration is still open.

## D13. Snapshot

Papi reference snapshot moves to `4ba90e34` (2 commits after `71ee7659`); only behaviour change: LINE reply token used up to ~50 s, then Push. Relevant only as know-how (D1).

## D14. Codex runs in the ChatGPT desktop app (Windows); CLI only as fallback

- **Install/update:** ChatGPT desktop app from the Microsoft Store (`winget install --id 9PLM9XGG6VKS -s msstore`), sign in with the Pro account, switch to **Codex**; native Git installed; Settings → agent = "Windows native". Update the app tonight (GPT-6.2 shipped 17 Nov).
- **One project per lane folder, Local mode:** the app's own Worktree mode creates throwaway worktrees under `%USERPROFILE%\.codex\worktrees` and cannot attach worktrees we create, so we create the 4 worktrees per person with our script (`..\nless-a0`, `..\nless-a1` …, each with its `.lane`), then **Add new project** (Ctrl+O) for each folder and start a **New chat → Work in: This computer** (Local, Worktree off). Check with `pwd` and `type .lane` in the chat terminal. Do not use the app's branch dropdown to switch to a branch another worktree has checked out.
- **Per chat, before the first message:** model **GPT-6.2 Sol** (picker under the composer; open Advanced if a Power slider shows), effort per D3 (High = orchestrator, Medium = workers, Light = mechanical), Fast (lightning bolt) per D3. Whether these persist per chat is UNCONFIRMED, so check every composer. Also set defaults in `%USERPROFILE%\.codex\config.toml` (`model = "gpt-6.2-sol"`, `model_reasoning_effort`, `[sandbox_workspace_write] network_access = true`, `[agents]`).
- **Permissions:** **Approve for me** (auto-review, same sandbox) for every thread; never Full access by default. Add allow rules in `%USERPROFILE%\.codex
ules\default.rules` for `git` (add, commit, fetch, rebase, push, worktree) and `gh pr` — they run outside the sandbox, which also avoids the open linked-worktree commit bug (`index.lock: Permission denied`, GH#32880). Test a commit in a lane worktree tonight; if it still fails, the human commits/pushes from their own terminal, and as a last resort that worker thread switches to Full access (dedicated hackathon PC, repo work only).
- **Trust:** trust each of the 4 projects and **Review hooks** (composer or Settings → Hooks) in each; re-review after any hook edit. Fallback: `[projects.'<worktree path>'] trust_level = "trusted"` for every worktree path in the user config. Run the MANGO/PONG hook test (codex README) inside the app tonight — the Stop-hook wake-up must work in the app, not just the CLI.
- **Dev servers and installs:** the Windows sandbox (MXC) stops child processes when a command exits, so humans start `npm run dev` per lane in their own terminal or as an app **Action**; agents only run tests. If `npm ci` fails in the sandbox with EPERM (esbuild postinstall, GH#45697), run it in a human terminal. If PowerShell blocks `npm.ps1`: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Unattended running:** chats keep working in the background but stop at approval prompts → Settings → Notifications: background + permission alerts on; watch the Activity bell (Ctrl+Alt+U); Windows power plan = never sleep (the app's prevent-sleep option is macOS/Linux only).
- **Sub-agents:** the orchestrator may ask for read-only sub-agents (they inherit its folder, permissions, model and effort; custom `.codex/agents/*.toml` can lower effort).
- **Cloud mode:** not used for lanes (no access to local worktrees or dev servers); optional for an isolated task with no local dependency.
- **Usage:** chatgpt.com/codex/settings/usage; decide tonight whether credit auto top-up is on (credits are consumed after included usage).
- **Known Windows issues → workaround:** app frozen on splash during a task (GH#62277) → end the `codex.exe … app-server` process in Task Manager; Worktree-mode "Cannot serialize value" (GH#55827) → not affected (we use Local); startup hang from a WSL PATH probe (GH#60143) → update the app / temporarily disable WSL integration. **Fallback:** Codex CLI ≥ 0.171 (`npm install -g @openai/codex@latest`), shares `%USERPROFILE%\.codex`; `codex -C <worktree>` per lane.

## D15. Where everything runs (databases, server, jobs, webhooks, files, secrets)

**No PC is a production server.** Production runs on Render; each person's hackathon PC runs only its own development copies. (The PC used to prepare this plan is **not** a hackathon PC — nothing may depend on it; see D16.)

| Environment | Runs where | Database | Used for |
|---|---|---|---|
| Worker lanes (9) | the owner's hackathon PC, one worktree per lane, ports API 3001–3009 / web 5171–5179 | person's Neon project (dev), DB `nless_hack_<lane>` + `_test` | building and testing a feature |
| Orchestrator integration (3) | each person's hackathon PC, worktree `a0`/`b0`/`c0` tracking `origin/main`, ports 3000 / 5170 (same ports on different PCs = no clash) | person's Neon project, DB `nless_hack_<a0|b0|c0>` | checking `main` after merges, cross-lane fixes |
| CI | GitHub Actions, Postgres service container `pgvector/pgvector:pg17` | ephemeral | typecheck, tests, ownership check on every PR |
| **Production** | **Render Singapore, one web instance, auto-deploy from `main`** | **Render Postgres 17 + pgvector** | judges, LINE demo OA, Demo Chat, the gate from 13:00 |
| Fallback production | Railway Singapore (prepared the day before), last resort C's hackathon PC + Cloudflare tunnel | Railway pgvector | only if Render fails |

**Development databases: Neon free tier (Singapore), one team organization `Endless` with one project per person.** C creates the organization and the three projects and invites A and B, who sign in with their own Neon accounts (the free plan allows unlimited organization members; nobody shares a password). Projects stay separate because the free quotas (1 GB, 100 compute-hours a month) are per project and one person's lanes cannot touch another person's databases. Inside each project, one database per lane and per orchestrator (`nless_hack_<lane>` + `_test`, created by the setup's `db:create` exactly as today), reached through Neon's **direct (non-pooled) endpoint** so session features work (advisory locks, prepared statements); small pools (≤5 per process). Zero install on unknown PCs, same setup for all three people, pgvector built in. Auto-suspend after 5 min idle only adds ~0.5 s to the first query; Bangkok→Singapore latency makes test runs slightly slower than local. **Why not Supabase for dev:** one database per project and an IPv6-only direct connection would force schema-per-lane plus the pooler (setup changes and more risk) — keep Supabase as a backup. **Fallback:** if Neon is down or a person's tests are too slow, local Postgres 16 + pgvector inside WSL Ubuntu 24.04 (`sudo apt install postgresql-16 postgresql-16-pgvector`; pgvector 0.6 supports `vector`, cosine `<=>` and HNSW). Docker is not required.

**Production database:** Render Postgres 17 + pgvector in the same Render region (wired by `render.yaml`, no cold starts, cents for the day). Zero-cost alternative: Supabase free (Singapore, pgvector built in, no auto-suspend within a day) through its **session pooler** (IPv4, port 5432, session mode keeps advisory locks) — choose one before 10:00 and record it in SOURCE-BASELINE.

**What replaces Papi's Lambdas (all inside the one Node server, the same code in dev and production):**

| Papi (AWS) | Our runtime |
|---|---|
| API Gateway + HTTP Lambdas | Express routes in `features/<slug>/routes.ts` |
| SQS consumers / workers | in-process job worker on the Postgres `jobs` table (F35) |
| EventBridge schedules | in-process scheduler (F35); runs on **one** instance only, guarded by a Postgres advisory lock |
| API Gateway WebSocket | WebSocket on the same server (`/ws`) |
| S3 uploads | disk: `uploads/` per worktree in dev, Render disk `/var/data/uploads` in production |
| Cognito | our email + password sessions (F02) |
| VoiceGateway on EC2 | browser ↔ OpenAI Realtime over WebRTC; tools run on our server |
| Secrets Manager / SSM | dev: `..\nless.secrets.env` per laptop · production: Render environment variables |

**Webhooks and provider channels:**
- **LINE:** two Messaging API channels. *NLess Demo* (production): webhook → Render from ~12:00; this OA's QR is what judges scan. *NLess Dev*: webhook → C2's tunnel for local work. Each channel allows only one webhook URL, so never point the demo channel at a laptop.
- **Meta:** one developer app, one webhook URL. C2 points it at the tunnel while building F18, then switches it to Render as soon as F18 is deployed (C2 posts `DONE` with the switch). Only app roles/test users can message in development mode.
- **Google OAuth (F16):** register both `http://localhost:<web port>/oauth/callback` for every lane and the Render URL.
- **No Omise (cut 20 Nov):** F14 is PromptPay QR plus slip checks only; no payment-provider account or webhook.

**Who holds what:**
- C (owner of setup and production): Render and Railway accounts, the production environment variables, the LINE Demo channel, the Meta app, the tunnel.
- Lead: the `app-prod` OpenAI key (entered into Render by C or the lead).
- Each person: their own `app-dev` key, their Neon connection string and the board variables in `..\nless.secrets.env` **on their hackathon PC** (typed in there by hand; never copied from another machine through chat or git).
- Resources are shared, logins are not: Render stays C's workspace (Hobby = one member; A and B ask C0 for production logs and use the app's `/ops` page; never share C's Render password or an API key) and the Neon organization is shared with each person signed in as themselves. Codex reaches both through MCP with each person's own OAuth login, so no Render or Neon credential is ever posted to the board (every post is fed into all 12 Codex sessions and mirrored to a GitHub issue).

**Production data:**
- Migrations run in Render's `preDeployCommand`.
- The two synthetic demo shops are seeded by a one-off command after the first deploy.
- The ops "demo reset" restores them before judging.
- `pg_dump` of production at 16:45 (from WSL with `postgresql-client`) as a backup.

**Hackathon PCs:**
- ≥16 GB RAM recommended: 4 Codex threads (models run remotely) + up to 4 API and 4 Vite dev servers + Postgres + tests ≈ 6–8 GB.
- Run dev servers in your own terminal, not inside the agent's sandbox.
- Bring a phone hotspot, since venue Wi-Fi is unconfirmed. Production does not depend on venue Wi-Fi.

## D16. Preparing each hackathon PC (tonight, by its owner)

The hackathon PCs are not the machine this plan was written on, so each person sets up and verifies their own PC tonight; nothing may rely on files that exist only on the planning PC (the API key file, `tools/openai-check/results`, fixtures).

1. **Install:** Git (+ `git config --global core.longpaths true`), Node.js 24 LTS, GitHub CLI (`gh auth login`), the ChatGPT desktop app (sign in with the Pro account; Codex inside it), PowerShell 5.1+ (built in).
2. **Database:** accept C's invitation to the Neon organization `Endless` (C creates it and the projects `nless-hack-a/b/c` in Singapore, `aws-ap-southeast-1`), open your own project, copy the **direct** connection string's server part into `PG_SERVER_URL` in the secrets file (the setup creates the per-lane databases); verify tonight that `CREATE DATABASE nless_probe` works over the direct endpoint and that `CREATE EXTENSION vector` works inside it (then drop it) — Neon's multi-database support and free-tier connection limits are the two assumptions to confirm. Optional fallback: enable WSL2 + Ubuntu 24.04 and install Postgres 16 + pgvector (D15).
3. **Repos:** clone the planning repo (this repo) and the empty competition repo side by side; `..\nless.secrets.env` next to them with the person's own `OPENAI_API_KEY` (project `app-dev`), board variables (`SITES_URL`, `SITES_BYPASS_TOKEN`, `BOARD_SECRET`, `BOARD_REPO`, `BOARD_ISSUE`, `BOARD_TEAM_LOGINS`) and `PG_SERVER_URL`. Type the key in by hand from the OpenAI dashboard.
4. **Codex in the ChatGPT app:** set model/effort/permissions per D3/D14, trust the project hooks and config after the 10:00 copy (and rehearse once tonight on a scratch repo).
5. **Readiness check:** run the preflight script (to be extended: Node 24, git longpaths, `gh auth status`, Neon (or local) Postgres reachable with `CREATE EXTENSION vector` in a scratch DB, secrets file present with the required keys (names only, never values), board `check`, OpenAI smoke via `tools/openai-check` (`npm ci; npm run fixtures; npm run check text` ≈ US$0.08 on the person's own key), free RAM/disk). Every person posts the result to the team before going to bed.
6. **Fallbacks:** Neon unavailable or too slow → local Postgres in WSL2; < 16 GB RAM → run at most 2 local dev servers at a time and test more on production; Codex app problems → install the Codex CLI ≥0.171 as a backup.

## D17. Final owner and tier rebalance (decided 20 Nov evening, after D16; applied to contracts.ts, backlog, PLAN, prompts)

D8's owners were proposals. Final placement, balanced on midpoint minutes (D4) and on when each lane has free time:

| Change | Reason |
|---|---|
| **F37 AI evals → B1** (was B3), P2 | B1 finishes its three P0 features around the 13:00 gate and had nothing after; it already owns retrieval evaluation (F07). B3 would have carried 362 midpoint minutes. |
| **F38 follow-up nudges → B2** (was C3), P2 | B2 is otherwise idle between F10 (P0) and voice (P3); the nudge reuses F10's reply generator, gate and guards. C already carries setup, production and the provider accounts. |
| **F39 ChatGPT-ready catalog stays on C1 but is P2** (was P3) | C1 is free between F35 (≈12:45) and the release work at 15:15; as P3 it would get 45 minutes. It pauses at 15:15 for F36 and whenever a `NEED TO:C1` arrives. |
| **F14 keeps the dynamic QR + slip QR checks, F27 keeps the seller impact metrics** | as D8. Estimates raised: F14 75–180 min, F27 60–165 min, F01 60–105 min (adds the production deploy of D7). |
| **The 13:00 CORE-LOOP GATE is verified by C0 on production** (was C1 on `main`) | D2 gives integration and production smoke to orchestrators; C1 stays on core and `NEED TO:C1`. C1 still posts `SETUP READY`. |
| **New board post `TASK TO:<lane> <ID> <what>`** next to D9's `STAGE` and D5's `FIX` | the orchestrator's way to hand a worker its next task; it wakes the worker through the Stop hook. An idle worker asks with `NEED TO:<P>0 next task`. |
| **New cross-lane contracts** | `listCatalogItems` (B1), `analyzeSlip`, `getOrderMetrics`, `listOrdersByCustomer` (A2), `getAiTurnMetrics`, `getFollowUpMetrics` (B2), `MetricsRange` (core types): needed by F37, F38, F39 and the F27 seller metrics so that no feature reads another feature's tables. |

Result (midpoint minutes; lane order = work order):

| Person | Lane 1 | Lane 2 | Lane 3 | Total | vs mean 867.5 |
|---|---|---|---|---|---|
| A | A1 F09 → F11 → F12 → F23 = 300 | A2 F13 → F14 → F22 = 300 | A3 F24 → F15 → F16 = 255 | **855** | −1.4% |
| B | B1 F05 → F07 → F08 → F37 = 285 | B2 F10 → F38 → F30 = 330 | B3 F06 → F26 → F27 = 277.5 | **892.5** | +2.9% |
| C | C1 F01 → F35 → F39 → F36 = 352.5 | C2 F17 → F18 → F21 = 270 | C3 F04 → F03 → F02 → F31 = 232.5 | **855** | −1.4% |

Fast mode for workers is limited to lanes A1 · B1, B2 · C1, C2 before the 13:00 gate (C3 keeps it off) so that the estimated Codex cost per person stays within ±5% (≈3,190 / 3,390 / 3,460 credits-equivalent for A / B / C). Setup: C pastes the C1 prompt at ~10:05; `SETUP READY` target ~10:50, latest 11:00 (the added core scope — feature flags, rate limit, Playwright fixture — raised the timeboxes to 55 min).

31 features, 2,602.5 midpoint minutes against 9 lanes × 280 min = 2,520 min of build time (C1 has about 105 min more because setup starts at ~10:05 and F36 runs to 16:30): the plan fits only just below the midpoint, which is why tiers open by checkpoint and the last feature of a lane is the first to be dropped. Codex cost per person is equal by construction (1 orchestrator + 3 workers each, same model and effort rules, D3); the estimate is in [budget-and-priority.md](budget-and-priority.md).
