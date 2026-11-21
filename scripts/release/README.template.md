# Endless

Endless is a bilingual sales assistant for Thai shops that sell through chat. It connects a shared staff inbox to the shop's catalog and approved knowledge.

| | |
|---|---|
| Merchant app | {{LIVE_URL}} |
| Customer and judge entry | {{LINE_ENTRY}} |
| Candidate SHA | {{FINAL_SHA}} |

## The problem

Shop owners answer the same questions about price, stock and delivery throughout the day. Endless uses the shop's own records to answer those questions and gives staff a shared inbox for follow-up.

## Who it is for

The demo models a small board-game seller. Demo orders, messages and shop records use synthetic data.

## Try it in 60 seconds (judges)

1. Scan the LINE QR or open the team’s LINE Official Account.
2. Ask for the price of `A-GAME-01`.
3. Ask whether the sold-out demo item `A-SOLD-01` is available.

The web Demo Chat is reserved for internal QA.

## What is built (feature status)

{{FEATURE_TABLE}}

{{FEATURE_TOTALS}}

R means Real, S means Sandbox, A means Adapter, and U means Unimplemented.

## Architecture

One Express app serves the React frontend and WebSocket connections. PostgreSQL 17 with pgvector stores tenant data, jobs and retrieval indexes. A database-backed scheduler coordinates background work. The core model adapter calls OpenAI, and the customer channel uses LINE.

## Safety design

Server permissions constrain shop access and provider tools. Prices and stock come from the catalog. Customer and owner approval are required for the applicable sensitive operations.

## Measured

{{MEASURED}}

## How Codex was used

Three people coordinated lanes through the shared board, wrote implementations from the declared planning baseline, and used required CI before squash merges. [Development timeline](docs/evidence/codex-timeline.md).

## Prior-work declaration

{{PRIOR_WORK}}

## Run it locally

```sh
npm ci
npm run lane:init
npm run db:migrate
npm run db:seed
npm run dev
npm test
```

[Release evidence](docs/evidence/release.md).
