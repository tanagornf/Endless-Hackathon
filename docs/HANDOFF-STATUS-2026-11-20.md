# Status and hand-over, 20 Nov 2026 (night)

> **Historical snapshot (noted 21 Nov).** Three statements below are no longer true; the current truth is in [START.md](../START.md): chats are started with one typed line (nobody pastes a whole prompt), the board is the pinned GitHub issue (the Sites dashboard is optional and does not need rebuilding), and there are no Omise keys (payments are PromptPay QR plus slip checks).

For whoever continues the preparation. The hackathon starts **Sat 21 Nov 2026, 10:00 Asia/Bangkok** (code freeze 17:00). This file says what is done, what was never verified, and what is still to do. The brief this work answered is [prompts/PLAN-HANDOFF.md](../prompts/PLAN-HANDOFF.md); the decisions are [DECISIONS-2026-11-20.md](DECISIONS-2026-11-20.md) (D1–D17).

## Where to start reading

1. [PLAN.md](../PLAN.md): scope, production bar, gate, tiers, people and lanes, schedule, budget, tonight's checklist.
2. [prompts/README.md](../prompts/README.md) and your own sheet in [prompts/people/](../prompts/people/LEAD.md).
3. [docs/specs/README.md](specs/README.md): index of the 31 build specs.
4. [docs/day/](day/pc-preparation.md): PC preparation, ChatGPT app setup, environments, deployment, failure drills, quality bar.
5. [docs/pitch/](pitch/PITCH.md): pitch, demo loop, deck, video, README template, submission checklist, Q&A.

## What is done

| Deliverable | State | Where |
|---|---|---|
| Plan re-baselined to D1–D17 | done | `PLAN.md`, `AGENTS.md`, `SPEC.md`, budget doc, backlog, `FEATURE_STATUS`, `.env.example`, `SOURCE-BASELINE` |
| Build specs for 31 features | done, same 15 headings each | `docs/specs/` |
| Cross-lane contracts | done, type-checks | `docs/competition-plan/templates/contracts.ts` |
| Orchestrator prompts A0 / B0 / C0 | done (generated) | `prompts/orchestrators/` |
| Worker lane prompts (9) and C1 setup prompt | done | `prompts/lanes/`, `prompts/C1-setup.md` |
| People sheets and lead sheet | done (generated) | `prompts/people/` |
| Board script, tests, hooks, Codex config templates | done, 124 offline assertions pass | `docs/competition-plan/tools/`, `checks/`, `templates/codex/` |
| Deployment, environments, failure drills | done | `docs/day/` |
| Pitch and submission kit | done | `docs/pitch/` |
| Consistency checker | done, passes | `docs/competition-plan/checks/check-consistency.mjs` |

Orchestrator prompts and people sheets are generated: edit `docs/competition-plan/tools/gen-orchestrator-prompts.py` or `gen-people-sheets.py` and re-run them (`python <script> prompts/orchestrators` / `prompts/people`), do not edit the outputs by hand.

## Key decisions made tonight (D17)

- 31 features. F37 evals → B1, F38 follow-ups → B2, F39 ChatGPT-ready catalog stays on C1 as **P2**.
- Midpoint minutes per person: A 855, B 892.5, C 855 (within ±3% of the mean). Estimated Codex cost per person about 3,190 / 3,390 / 3,460 credits (our estimate, not official).
- Worker Fast mode only in lanes A1, B1, B2, C1, C2 before 13:00.
- C pastes the setup prompt at ~10:05; `SETUP READY` target ~10:50, latest 11:00.
- C0 (not C1) verifies the 13:00 gate, on production.
- Board: orchestrators post `STAGE` every 30 minutes, dispatch with `TASK TO:<lane>`, fix across lanes on `fix/<owner-lane>/<slug>`. Orchestrator status uses `status A0 none U "..."` (a bare `-` cannot be passed through `powershell -File`).
- The owning feature (orders, booking) sends the customer confirmation message; channels stay silent on success.

## Not verified (do not assume these work)

- Nothing was run inside the real ChatGPT desktop app: hooks, allow-rules, sub-agents and project trust are untested there. The nine checks are in [day/chatgpt-app-setup.md](day/chatgpt-app-setup.md).
- The C1 setup prompt has not been rehearsed or timed since it was restructured.
- Render blueprint was checked against Render's published spec but never deployed. Neon free-tier limits (8 databases per person, connections) are unconfirmed.
- LINE and Meta API details in F17 / F18 / F21 were written from memory.
- The mini-QR layout on real Thai bank slips, and how bank apps treat the PromptPay order-reference tag.
- ACP feed submission and which ChatGPT accounts can add a custom MCP connector (F39).
- The 31 specs were written by sub-agents and only spot-checked. Structure, links and lane/tier consistency are machine-checked; content is not. On the day `contracts.ts` wins over a spec.
- The size of the ChatGPT Pro weekly limit.

Every doc lists its own UNCONFIRMED items with the check to run.

## Still to do before 10:00

**Lead**
- Send [the organizer email](pitch/organizer-email.md) and record the answer in `SOURCE-BASELINE.md`.
- Replace `REPLACE_*` in `prompts/` (names, GitHub logins, lead).
- Create OpenAI project `app-prod` with a US$60 hard limit.
- Decide presenter, Codex credit auto top-up, production database.
- Print the LINE OA QR and the Demo Chat QR.

**Everyone, on the hackathon PC**
- Follow [day/pc-preparation.md](day/pc-preparation.md) and run `docs/competition-plan/tools/preflight.ps1`.
- Neon project plus the database probe; OpenAI project `app-dev` with a US$30 hard limit.
- Run the app checks in [day/chatgpt-app-setup.md](day/chatgpt-app-setup.md).

**C**
- Rehearse `prompts/C1-setup.md` from an empty folder and time it (target 45 min, limit 55).
- Render dry run and Railway verification ([day/deployment.md](day/deployment.md)).
- Two LINE channels, Meta app with test users, tunnel.

**A**
- Google OAuth client with all redirect URIs.
- Scan a generated PromptPay QR in a bank app (scan only, no transfer).

**Friend hosting the board**
- Rebuild the Sites dashboard from the updated [board/sites-dashboard.md](board/sites-dashboard.md) (it now needs `/api/people`) and test from all three PCs.

## Open work for whoever continues

- Read at least the P0 specs critically (F01, F09, F10, F11, F17, F04, F03, F05, F07, F08, F35) against `contracts.ts`.
- Fold the results of tonight's checks back into the docs (remove UNCONFIRMED marks that are settled).
- `docs/competition-plan/01–07` are legacy and were not rewritten.
- Placeholders in the pitch kit: `<<PRESENTER>>`, `<<COMPANY>>`, `<<STORY>>`, `<<production URL>>`, `<<BASELINE_SHA>>`, `<<FINAL_SHA>>`.

## How to re-run the checks

```powershell
node docs/competition-plan/checks/check-consistency.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File docs/competition-plan/checks/test-team-board.ps1
npx -y -p typescript@5.6.3 tsc --noEmit --strict --target es2022 --moduleResolution bundler --module esnext docs/competition-plan/templates/contracts.ts
```

All three passed at the last commit. Real-API validation spent about US$0.21 of the US$3 cap; the scripts are in `tools/openai-check/checks/`.
