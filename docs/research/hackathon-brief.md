# Research brief: hackathon, Sea, OpenAI, Codex, hosting (checked 20 Nov 2026)

Working input for the plan rewrite. Every number has a source; anything marked UNCONFIRMED must not be stated as fact in the pitch. Decisions built on this brief are in [DECISIONS-2026-11-20.md](../DECISIONS-2026-11-20.md).

## 1. The hackathon (Sea x OpenAI Regional Codex Hackathon Thailand, Sat 21 Nov 2026)

Sources: [Luma](https://luma.com/39zve8ph) (L), [Techsauce](https://techsauce.co/pr-news/sea-x-openai-hackathon-thailand) (T, 16 Oct 2026), Thaiger, Pattaya News, other editions' pages.

- **Judging criteria (organizer's opening slides, 21 Nov):** Problem & Solution Fit, Build Quality, Insight & Originality, Real-World Value, Alignment with Build Direction, and Use of Codex. The slides did not specify weights.
- **Build directions (pick ≥1):** Autonomous & Adaptive AI ("agents that can be trusted to operate without constant human oversight") · AI-Native Products & Operations (not AI as an add-on) · Deep Domain AI ("reflecting how work is actually done"). T adds: solutions should be usable in practice and responsible toward consumers, businesses and communities.
- **Team:** 3–4 members, each registers individually under the same team name; up to 40 teams.
- **Prior work (Thailand, L):** "You're welcome to arrive with ideas or build on existing personal or open-source projects" · new work "must take place during the event and be significant and substantial" · "Only work completed during the event will be judged." Company/employer code is **not mentioned**. Singapore, Vietnam and Malaysia editions banned all pre-built code ("Pre-built code or existing projects shall not be submitted"). → Treat a company codebase as know-how only.
- **Schedule (L):** 08:30 doors · 09:20 opening · 10:00 hacking · 12:30 working lunch · **17:00 code freeze + submissions** · 17:15 dinner + Round 1 ("teams present to judges in rotation") · 19:30 top-5 finalist presentations (on stage; length UNCONFIRMED, ~8–10 min inferred) · 20:30 awards.
- **Language:** Round 1 Thai or English, assessed equally; final: English preferred, Thai accepted.
- **Prizes:** US$30k / $15k / $5k OpenAI API credits; top-5 members get 1 year ChatGPT Pro.
- **Submission format (organizer's opening slides, 21 Nov):** one Google Form per team by 17:00 Bangkok. Include the new public GitHub repository, a project writeup explaining problem, solution, build direction and Codex use, a live demo or prototype link, and declarations of prior OSS/personal projects and what was built during the event. Keep video and slides for the presentation or any optional form fields.
- **People:** guests of honour: Deputy Minister of Digital Economy and Society (SMEs, digital economy, consumer protection), Sea (Thailand) CEO Maneerut Anulomsombut, OpenAI APAC GTM Director Sidharth Sharma (praised "a clear sense of who they were building for" in Vietnam). Speakers: Shopee Thailand Head of Regional BI & Financial Strategy (metrics, unit economics, fraud), CEO of Siametrics/ViaLink (B2B commerce, data). Judges not named.
- **"Effective use of Codex":** no official definition. Signals: Vietnam finalists explained how they used AI in development; OpenAI's SF Codex hackathon highlighted "parallel tasks, skills, and worktrees"; another OpenAI hackathon rubric scored Codex use "across coding, iteration, debugging, and testing".
- **Comparable winners:** Taiwan (Shopee-hosted, Sep 2026) 1st = TurnDeal, a commerce agent that matches products and negotiates with sellers. Vietnam (Oct 2026) 1st = Bioweave. Singapore OpenAI (Feb 2026) 2nd = GambitHunter (agent collecting evidence on illegal gambling; real social problem).
- **Codex in Thailand:** OpenAI data: Thailand is top-20 for weekly ChatGPT and Codex users; weekly Codex use up >350× this year (Thaiger). Sea is "one of our largest Codex customers in Asia" (OpenAI Head of Codex, [sea.com/news/395](https://www.sea.com/news/395)).

## 2. What Sea cares about

- **Live and video commerce:** Q3 2026 call (10 Nov): Shopee orders from live and short video +45% YoY, >25% of physical-goods orders in SEA ([transcript](https://www.fool.com/earnings/call-transcripts/2026/11/10/sea-se-q3-2026-earnings-call-transcript/)).
- **Off-platform creators on Meta:** affiliate orders from Facebook-linked creators +90% QoQ; >4M Instagram reels tagged with Shopee products since April (same call).
- **AI for sellers:** Q2 call: always-on "IM assistance for sellers" rolling out ([transcript](https://www.fool.com/earnings/call-transcripts/2026/08/11/sea-limited-se-q2-2026-earnings-call-transcript/)). Shopee Thailand Seller Centre has a Chat AI Assistant for selected sellers only, inside Shopee ([seller.shopee.co.th](https://seller.shopee.co.th/edu/article/24000)). Sea's own SEA-language LLM Compass Max v3.5 ([sea.com/news/394](https://www.sea.com/news/394)).
- **Monee / ShopeePay:** SPayLater growth tied to national QR infrastructure (Q2); credit quality worse "especially in Thailand" (Q3); internal AI uses: fraud detection, customer service, content generation (Q3).
- **Sea x OpenAI partnership (22 Jun 2026, [sea.com/news/406](https://www.sea.com/news/406)):** Shopee inside ChatGPT in 8 markets incl. Thailand (discovery only; checkout stays on Shopee); Shopee sellers get ChatGPT for Business for listings, marketing and customer-service workflows.
- **Thailand market (third-party estimates):** Cube: TikTok Shop overtook Shopee in Thai GMV share in Q2 2026 (48% vs 45%) ([cube.asia](https://cube.asia/ecommerce-in-thailand/)). Government commission cut for ~1.2M sellers on Shopee/Lazada/TikTok Shop, 1 Dec 2026 – 31 May 2027 ([Pattaya Mail](https://www.pattayamail.com/latestnews/news/thailand-secures-six-month-fee-cuts-for-smes-on-shopee-lazada-and-tiktok-shop-570521)).

## 3. What OpenAI cares about (SEA / Thailand)

- OpenAI x MHESI accelerator for Thai startups (Aug 2026) ([openai.com](https://openai.com/index/supporting-next-generation-ai-startups-thailand/)); OpenAI for Singapore exists, no Thailand version found.
- **Agentic commerce:** Instant Checkout scaled back to approved partners (Mar 2026); the Agentic Commerce Protocol (ACP) is open to all for product feeds/discovery ([docs](https://developers.openai.com/commerce/guides/key-concepts)). ChatGPT apps became "plugins" (Jul 2026) and support MCP (secondary source).
- **Thai tool use:** FahMai-TeleBench (AACL 2026): GPT-5.4 97–99% vs Typhoon-2.5 58–74% on Thai tool calling ([ACL Anthology](https://aclanthology.org/2026.aacl-short.15/)) → supports a frontier OpenAI model for Thai agents.
- `gpt-6.2-sol` shipped 17 Nov 2026. Our own tests: Sol handles every planned text job in Thai ([openai-api.md §15](../openai-api.md#15-ผลทดสอบจริง-20-พย-2569)).

## 4. Evidence for the problems NLess solves (usable in the pitch)

- **Chat workload:** LINE Thailand (Aug 2026): >12B LINE OA conversations in 2025; 800M OA friend-adds in H1 2026; ">90% of new customer chats receive no follow-up after the first response" ([release](https://pr.thaiquest.com/post/747849)). LINE is launching "Seller AI Automation" in MyShop (competitor). LINE 56M Thai users; Messenger 36.5M ([Elite Asia](https://www.eliteasia.co/digital-and-social-media-trends-in-thailand-in-2026/)).
- **Payment trust:** Krungthai Bank: fake-slip scams "continue to rise"; advice = scan the slip QR in a bank app ([Thaiger](https://thethaiger.com/news/national/krungthai-bank-reveals-quick-way-to-spot-fake-transfers)). ChatGPT shown forging a realistic slip ([Thaiger](https://thethaiger.com/news/national/chatgpt-update-sparks-fake-bangkok-bank-slip-warning)). No official slip-fraud statistics exist → do not quote a number.
- **Online fraud (buyer side):** ACSC, week of 8–14 Nov 2026: 5,917 cases, ฿265M losses; 73.3% product/service fraud; 72.6% started on Facebook, 5.5% on LINE ([Siamrath](https://siamrath.co.th/crime/336015)).
- **PromptPay:** 2.38B transactions in May 2026; 82.91M registrations ([Nation](https://www.nationthailand.com/business/economy/40067858)).
- No official numbers for: Shopee Thailand seller count, chat-commerce GMV share, seller chat hours → do not quote.

## 5. Codex on the day (ChatGPT Pro for a day + US$100 Codex credits + US$100 API credits each)

The team uses **Codex inside the ChatGPT desktop app** on Windows; app-specific setup (projects per worktree, Local chats, permissions, hooks, known issues) is in [DECISIONS D14](../DECISIONS-2026-11-20.md#d14-codex-runs-in-the-chatgpt-desktop-app-windows-cli-only-as-fallback). The facts below apply to both the app and the CLI.

Sources: learn.chatgpt.com/docs (pricing, models, subagents, speed, hooks, cli, auth), github.com/openai/codex; downloaded copies in the session scratchpad.

- **Update the CLI first:** 0.147.0 (installed on one machine) predates GPT-6.2; `gpt-6.2-sol` needs ≥0.166.0; latest 0.171.0 (20 Nov). Install: `npm install -g @openai/codex@latest` (or the official install.ps1).
- **Pro limits:** "Pro plans currently have no five-hour limit"; "Weekly limits may also apply" (size unpublished). Included usage is consumed first, then credits (credits ≈ US$0.04 each; US$100 ≈ 2,500 credits; Sol = 50/2.5/250 credits per 1M input/cached/output). Check usage at chatgpt.com/codex/settings/usage or `/status`.
- **API key for Codex:** `codex login --with-api-key` works but replaces the ChatGPT login (use a separate `CODEX_HOME`), loses cloud features, and **API credits tied to ChatGPT plans exclude Codex usage**; whether hackathon API credits cover Codex is UNCONFIRMED → reserve API credits for the app's own AI calls.
- **Models:** `gpt-6.2-sol` (500k context, everyday coding), `gpt-6.2-astra`, `gpt-6.1-terra`, `gpt-6-luna` …; effort `low|medium|high|xhigh|max|ultra` (default `low` for 6.2) · **never `ultra`** (auto-spawns sub-agents).
- **Fast mode:** `/fast`, `service_tier = "fast"` or the app's lightning button; ~1.5–2× faster; **costs 2× usage** on 6.2 models; sub-agents inherit the parent's speed. Ultrafast is not on the $100 Pro tier.
- **Sub-agents:** on by default; tools `spawn_agent`, `send_input`, `wait_agent`, `close_agent`; config `[agents]` `max_concurrent_threads_per_session` (default 6), `default_subagent_model`, `default_subagent_reasoning_effort`; depth 1 (sub-agents cannot spawn). **Sub-agents share the parent's folder, sandbox and approvals** → parallel writes conflict; use them for read-only exploration, test triage and reviews. Parallel coding = separate worktrees (app Worktree mode, `codex --worktree`, or `git worktree add`). Custom agents: `.codex/agents/*.toml` (`name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`).
- **Codex Cloud:** per-task VM (4 vCPU / 16 GiB); good for independent tickets once an environment is published; needs ChatGPT login (not API key); concurrent limit on Pro UNCONFIRMED; weak fit for tasks needing local Postgres/LINE.
- **AGENTS.md:** global + one per directory root→cwd, 32 KiB combined cap (`project_doc_max_bytes`). Skills: `.agents/skills/<n>/SKILL.md`. Hooks events include SessionStart, UserPromptSubmit, Stop, SubagentStart/Stop, Pre/PostToolUse; trusted per hook hash.
- **Windows:** default permissions "Auto" (`workspace-write` + `on-request`); `.git` is read-only in workspace-write so commits prompt → `approvals_reviewer = "auto_review"` reduces prompts; MXC sandbox preferred (test: `codex -c windows.sandbox=mxc sandbox --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK`); MXC kills background dev servers when the command exits → run dev servers in your own terminal; `git config --global core.longpaths true`; app freeze issues exist → keep the CLI as fallback.
- **Throughput estimate (not official):** an active Sol thread ≈ 120–170 credits/hour (≈US$5–7); per person (orchestrator high + 3 workers half-active + 1 h hard debugging + 2 h Fast on the orchestrator) ≈ 3,600 credits (≈US$145) → covered by Pro included usage first, then the US$100 Codex credits.

## 6. Production hosting

- **Primary: Render, Singapore** — Docker web service (Node 24, Express + WebSocket on the same server, in-process worker), managed Postgres 17 with `CREATE EXTENSION vector`, 1 GB disk for uploads, `preDeployCommand` for migrations, `healthCheckPath`, HTTPS subdomain (works for LINE/Meta webhooks and phone microphone), no sleep on paid instances; ≈US$0.45–1.10 for the day (web `1c-2g` or `0.5c-512mb` + PG `0.1c-256mb`, billed per second). A disk disables zero-downtime deploys → freeze deploys at 16:45.
- **Fallback: Railway Hobby, Singapore** (pgvector template + volume; verify the account first — unverified trial accounts restrict outbound network). Last resort: laptop + Cloudflare named tunnel.
- **Rules for the app:** listen on `process.env.PORT` and `0.0.0.0`; `/healthz` runs `SELECT 1`; first migration `CREATE EXTENSION IF NOT EXISTS vector`; no secrets in `VITE_*`; WebSocket ping every 25 s with client reconnect; uptime monitor on `/healthz` from 16:30; warm-up at 17:00 (one voice session, one LINE message, one upload).
- Meta development-mode apps only work for app roles/test users → **judges use LINE (anyone can add the OA) and the web Demo Chat**; Messenger/IG are demoed by the team.

## 7. Latest NLess (Papi)

- `origin/develop` = `4ba90e34` (20 Nov 06:10 UTC): 2 commits after the plan's `71ee7659` snapshot. Only behaviour change: **LINE reply token used for up to 50 s (LINE documents ~1 min); after that send via Push** (costs quota) — AB#2768. Affects F17.
