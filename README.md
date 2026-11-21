# Endless

Endless is a bilingual sales assistant for Thai shops that sell through chat. The app brings customer conversations into a shared inbox and uses each shop’s catalog and knowledge to answer questions.

## Development

Use Node.js 24. In your assigned worktree, run:

```sh
npm ci
npm run lane:init
npm run db:migrate
npm run db:seed
npm run dev
```

The lane initializer provisions the assigned local and test PostgreSQL databases. Keep workstation configuration in the machine-level secrets file described in the [setup prompt](prompts/C1-setup.md). In development, open the web URL for your lane and visit `/dev-login` to select a synthetic owner or staff account.

```sh
npm run typecheck
npm test
npm run smoke
npm run e2e -- core
```

See [the product brief](docs/PRODUCT.md), [the development cookbook](docs/COOKBOOK.md), and [deployment instructions](docs/day/deployment.md).

## Declared prior work

The baseline contains planning documents, feature specifications, type-only contract references, the team board script, and Codex session configuration. Application implementation for the event starts with the F01 setup branch. The repository uses synthetic fixtures for the demo and development tests.
