# Frontend integration

The independent UI lane tracks the team board and tests features after they merge to main. Its dedicated worktree uses the local lane marker `UI` and a separate board cursor. Feature ownership stays with the competition lanes. The shared branch is `feat/frontend-integration`. Feature owners continue to register routes, menus and slots in `web/src/features/<slug>/pages.tsx`, with Thai and English text in that feature’s i18n folder. A registered lane screen takes priority at the same URL. Its loader, route guards, menus and slots are preserved. New registrations are picked up when the integration branch incorporates the lane’s merged commit.

## Run the local UI preview

From the repository root, install the pinned dependencies with `npm ci`, then run:

```sh
node node_modules/vite/bin/vite.js --config web/preview.config.ts
```

Open [the shop workspace](http://127.0.0.1:5189/?view=workspace). The preview binds to loopback, provides a synthetic signed-in shop for navigation, and returns a service-unavailable response for feature requests. It needs no database, secrets or provider account. Stop it with Ctrl+C. The normal web build uses `web/vite.config.ts` and the actual session, API and feature flags.

## Connect a feature

1. Register the real screen with the canonical route, permission and layout in the lane’s `pages.tsx`. Use its existing translations and the core UI kit. Register cross-feature controls through the documented slots.
2. Test the UI with the feature’s API in the lane’s environment. Cover loading, empty, error, permissions and both languages. Include the route and merged SHA in the lane’s board update.
3. Bring the merged commit from `main` into the integration branch. Check the web tests and production build, then exercise the route with the intended shop and role.

`web/src/integration/screens.ts` defines preparatory views from the build specs. Tables and summary panels read only their listed response fields. The sidebar preview shows planned routes. The regular web build takes its routes and menus directly from the feature owners. A merged native registration replaces its preparatory view in the preview automatically. Publication and production flags remain under the existing release process.

## Verify the frontend

```sh
npm test -- --project web
npm run build
```
