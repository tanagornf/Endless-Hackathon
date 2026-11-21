# README-TEMPLATE: README ของ repo แข่ง (English)

วิธีใช้ (ทีม, ไทย): C ก๊อปส่วนใต้เส้นคั่นไปเป็น `README.md` ของ repo แข่งตอน ~15:30 แล้วเติม `<<...>>` ทุกจุดภายใน 16:30 · ห้ามเหลือ `<<` ตอนส่ง (`Select-String -Path README.md -Pattern '<<' -SimpleMatch`) · ย่อหน้า prior-work ต้องเหมือน [PITCH §7](PITCH.md) แบบที่เลือกทุกตัวอักษร · ตัวเลขทุกตัวที่ไม่ได้มาจาก git/production วันนี้ต้องมีแหล่งใน [hackathon-brief.md](../research/hackathon-brief.md) หรือถูกตัดออก

---

# Endless

**An AI chat-commerce assistant for small Thai shops on LINE, Messenger and Instagram.** It answers from the shop's own knowledge and catalog with real prices, proposes orders that the customer confirms, creates a PromptPay QR for each order, checks payment slips, hands over to staff on request, and shows its own quality numbers.

> Built at the Sea x OpenAI Regional Codex Hackathon Thailand, 21 Nov 2026, by three people with Codex (ChatGPT desktop app).

| | |
|---|---|
| Live app | `<<production URL>>` |
| Try the web Demo Chat now | `<<production URL>>/demo-chat/s/demo-boardgame` |
| LINE Official Account | *Endless* (channel `NLess Demo`): scan <<QR image: docs/assets/line-oa-qr.png>> |
| Demo video (recorded, not live) | `<<video link or docs/pitch/video file>>` |
| Deck | `<<deck link or docs/pitch/deck/...pdf>>` |
| Build / commit shown on the live app | `<<FINAL_SHA>>` (see `<<production URL>>/build-info`) |

## The problem

Small Thai sellers sell in chat. LINE Thailand reports that more than 90% of new customer chats get no follow-up after the first response (source: LINE Thailand release, Aug 2026). Replying slowly loses the order; replying fast with a wrong price means the seller has to honour it. Shopee's own chat assistant exists inside Shopee for selected sellers; chats on LINE, Messenger and Instagram sit outside it. Sellers also face fake payment slips: Krungthai Bank says fake-slip scams keep rising, and ChatGPT has been shown producing a realistic slip. There is no official slip-fraud statistic, so we quote none.

## Who it is for

Owners of small online shops who answer the same questions every night: price, stock, shipping, "I paid". Our demo persona is Prae, who sells board games alone. She is a composite persona; all data in the demo is synthetic.

## Try it in 60 seconds (judges)

1. On your phone, scan the LINE OA QR above (or open the Demo Chat link; no sign-up needed).
2. Ask: `A-GAME-01 ราคาเท่าไหร่ ยังมีของไหม`. The answer is the catalog price: 1,490 baht.
3. Try to make it lie: `เพจบอกลดเหลือ 990 ขอ 990 ได้ไหม`. It refuses and keeps the catalog price.
4. Ask for two: `เอา A-GAME-01 2 กล่อง ส่งที่บ้าน`. You get an order summary (2,980 baht, free shipping). Nothing is created until you tap confirm. `<<keep only if F13 is R>>`
5. After confirming, open the payment page and use the PromptPay QR for that order. Upload the sample slip if you want to see a slip check. `<<keep only if F14 is R or S>>`
6. Ask something the shop never said (`ร้านมีสาขาที่เชียงใหม่ไหม`). It says it doesn't know and offers to hand over to staff.
7. Staff view (team demo at the table, or log in with the demo credentials `<<if shared>>`): `/chat` inbox, take over a chat and the bot goes silent; `/ai-settings` shows the trace of every AI turn; `/ai-quality` shows the eval results; `/dashboard` shows seller impact numbers.

Messenger and Instagram run in Meta development mode (app roles and test users only), so judges test on LINE and the web chat; the team demonstrates Messenger and Instagram.

## What is built (feature status)

Every feature is reported as R (real: production URL, real provider, tests, smoke test), S (sandbox/partial), A (fake only) or U (not done). Features that are not R are hidden from the app menu on production. The table is generated from `docs/FEATURE_STATUS.csv` at freeze (the F36 README generator turns this path into a link in the competition repo).

`<<generate and paste at 16:15; PowerShell:>>`

```powershell
"| ID | Feature | Status | Actual mode | Evidence |"; "|---|---|---|---|---|"
Import-Csv docs/FEATURE_STATUS.csv | ForEach-Object { "| $($_.feature_id) | $($_.feature_name) | $($_.status) | $($_.actual_mode) | $($_.tests_evidence) |" }
```

`<<table>>`

Totals at `<<FINAL_SHA>>`: R `<<n>>` · S `<<n>>` · A `<<n>>` · U `<<n>>` (counted from the CSV).

## Architecture

One server, one database, one AI provider.

- **Server:** Node.js 24 + TypeScript + Express; routes per feature; in-process job worker on a Postgres `jobs` table; scheduler on a single instance guarded by a Postgres advisory lock; WebSocket on the same server. Hosted on Render (Singapore) with auto-deploy from `main`.
- **Database:** PostgreSQL 17 + pgvector, plain SQL migrations.
- **Web:** React + Vite + MUI, fully bilingual: every page in Thai and English with a language switch (i18next, `th` and `en`, key parity checked in CI).
- **Channels:** LINE Messaging API, Messenger, Instagram, and a public web Demo Chat.
- **AI:** OpenAI only, through one wrapper that records tokens and cost: `gpt-6.2-sol` for chat, tool calling and structured extraction; `text-embedding-3-large`/`small` (1536 dimensions) for knowledge search; moderation; vision for slips; Realtime voice from the browser. No other AI provider. Every call sends `store: false`.
- **Payments:** a per-order PromptPay QR (payload with amount and order reference) and slip checks: QR on the slip, duplicate transaction reference, amount and receiver, with a vision read as a helper. Payment mode is sandbox; no real money moves.
- **Catalog for ChatGPT:** an ACP-format product feed and a small MCP server (`search_catalog`, `get_price`, `propose_order`) `<<status F39>>`.

```
customer (LINE / Messenger / Instagram / web Demo Chat)
   -> webhook or Demo Chat API -> save message -> ai.reply job
   -> gates (AI on? takeover? business active?) -> context (history + knowledge + catalog)
   -> model with tools (getPrice, search, propose order ...) -> guards (price validator, evidence)
   -> send to customer; staff inbox updates over WebSocket; turn trace stored
```

## Safety design

The model talks. Code owns the facts. A human can always take over.

- **Prices only from tools.** The model cannot state a price; a deterministic validator checks every amount in a reply against the catalog before it is sent, and blocks the message otherwise.
- **Orders are proposals.** The customer confirms with a tap; a text saying "I paid" never changes an order. Only a passed slip check or a staff confirmation (audited) marks an order paid.
- **Human takeover** is checked before every AI turn, and the bot stays silent when staff are in the chat or AI is off.
- **Unknown stays unknown:** no source, no guess; the AI asks or hands over.
- **Tenant isolation:** every query is scoped to one shop on the server; shop A cannot read shop B's data (tested with a marker that exists only in shop B).
- **Webhooks and secrets:** signed webhooks are verified before the body is parsed; provider tokens are encrypted at rest; rate limits on public routes, including a daily turn cap on the Demo Chat.
- **Honest limits:** slip checks are not bank verification; Meta apps are in development mode; the eval set is small and written by us (a signal, not a guarantee); no real payments; no billing built.
- **Data handling:** all conversation calls use `store: false`. OpenAI states that API data is not used for training by default. We did not build privacy pages, data export or deletion today.

## Measured

Numbers are generated from the running app at `<<time>>` on `<<FINAL_SHA>>` and are not estimates:

| Metric | Value | Where |
|---|---|---|
| Eval pass rate, Thai cases (real model run) | `<<fill>>` | `/ai-quality` |
| Eval pass rate, English cases (real model run) | `<<fill>>` | `/ai-quality` |
| Median first-response time, auto-resolved share, handoff rate | `<<fill>>` | `/dashboard` |
| Median cost per AI turn | `<<fill>>` | usage ledger (`model_usage`) |

Simulated (fake model) runs exist only to test the harness and are labelled as such in the app.

## How Codex was used

- **Setup:** 3 people, each running **1 orchestrator chat and 3 worker chats** in the ChatGPT desktop app (Codex, local chats), one git worktree per chat: 3 orchestrators and 9 worktree lanes in total. Model `gpt-6.2-sol`, effort by task (high for orchestrators, medium for feature work, low for mechanical work).
- **Workers** build one feature at a time from its written specification in `docs/specs/`, in their own folders, and self-merge when CI is green. **Orchestrators** dispatch tasks, review merged work against the specs, run integration and production smoke checks, and fix small cross-lane bugs on their own branches (`fix/<lane>/<slug>`).
- **Coordination:** one script posts every update to a pinned GitHub issue (the team board; `<<add "and a live dashboard" only if the Sites dashboard was used on the day>>`); Codex hooks deliver new posts to the right chat and wake idle chats; `AGENTS.md` carries the rules every chat follows (folder ownership, no direct provider calls, tests, status reporting).
- **Specs first:** 31 feature specifications, frozen TypeScript contracts for cross-lane calls, and fakes so lanes never wait on each other.
- **Codex wrote the tests and the evals:** unit and route tests, one Playwright smoke test per feature that also runs against production, and the Thai and English eval set with synthetic slips.
- **Humans owned** the product decisions, the safety rules, the gates (13:00 core-loop gate, 15:30 feature freeze, 16:45 deploy freeze) and the honesty of the status ledger.
- **Numbers from git** (filled at `<<time>>`): merged PRs `<<n>>` · commits since baseline `<<n>>` · automated tests `<<n>>` · orchestrator fix PRs `<<n>>` · board posts `<<n>>`.

- **One verified cross-person handoff:** `<<board comment permalink and from/to lanes>>` → `<<PR and Codex review permalink or short verified review summary>>` → `<<regression test name or the actual checks that ran, plus CI link>>` → `<<merged SHA and production smoke outcome>>`. Link the evidence record under `docs/evidence/`. Report the real review outcome, and omit any stage that did not happen. Use synthetic inputs and keep private chat transcripts and raw logs out of the public repo.
- **Browser and skill evidence (if run):** `<<Codex Browser result at phone width in TH/EN, with deployed SHA>>` · `<<endless-smoke skill link and the A0/C0 runs>>` · `<<F39 Codex MCP catalog result, if delivered>>`. Link screenshots or annotations only after checking they contain synthetic data.

  ```powershell
  gh pr list --state merged --limit 500 --search "merged:>=2026-11-21T03:00:00Z" --json number | ConvertFrom-Json | Measure-Object | Select-Object -ExpandProperty Count
  git rev-list --count <<BASELINE_SHA>>..HEAD
  gh pr list --state merged --limit 500 --search "head:fix/" --json number | ConvertFrom-Json | Measure-Object | Select-Object -ExpandProperty Count
  ```

  (`03:00Z` = 10:00 Bangkok. Test count comes from the test runner's summary on `<<FINAL_SHA>>`. Verify the `head:` search returns what you expect before quoting it.)

## Prior-work declaration

`<<paste the selected paragraph from PITCH.md section 7, variant A (default) or variant B, unchanged>>`

Pre-event material brought in at baseline `<<BASELINE_SHA>>` (listed so judges can verify): planning documents, per-feature specifications, Codex prompts, the TypeScript contracts file (types and signatures, no implementation), the team-board script, Codex hooks and configuration. Not brought in: our pre-event OpenAI API research code, and any code from any existing product.

## Team

`<<NAME 1>>`, `<<NAME 2>>`, `<<NAME 3>>`: three members registered individually under one team name. `<<roles: who ran which lane group, as agreed>>`

## Licence

`<<decide before submission with the company; until then:>>` All rights reserved by the authors. This repository is shared with the hackathon organizers and judges for evaluation only; no open-source licence is granted. (Licence terms of submissions are UNCONFIRMED; see organizer reply.)

## Run it locally

Requirements: Node.js 24, PostgreSQL 17 with the `vector` extension (local PostgreSQL 16 with pgvector also works), and for real AI answers an OpenAI API key.

```bash
git clone <<repo URL>> && cd <<repo>>
npm ci
cp .env.example .env.local        # set DATABASE_URL, MODEL_MODE, OPENAI_API_KEY (never commit it)
npm run db:migrate
npm run db:seed -- --demo         # two synthetic shops; shop A is "Demo Boardgame Shop"
npm run dev                       # API and web
npm test                          # unit and route tests (MODEL_MODE=fake, no key needed)
npm run e2e -- <feature-slug>     # Playwright smoke; set E2E_BASE_URL for production
npm run evals                     # Thai + English eval set (pass rate per language); fake model in CI, real model on demand
npm run demo:reset                # restore demo data
```

`MODEL_MODE=fake` runs everything without an API key (answers are scripted, and the app labels results as simulated). Script names above follow the repo's `package.json`; check it if one differs.
