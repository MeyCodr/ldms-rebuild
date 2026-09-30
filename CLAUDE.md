@AGENTS.md

# LDMS v2

Rebuild of PHN Industry's Learning and Development Management System, built phase by phase and module by module.
Stop for the user's review after each module.

- **Status and plan**: `README.md` (phases, security, decisions). Current phase plan: `docs/phase-2-plan.md`.
- **Architecture**: pages/actions → services (`src/server/services`, permission check + audit log in the same
  transaction) → pure rules (`src/server/rules`, unit-tested). Never write through Prisma from a page or action.
- **Auth**: `requireUser()`/`requirePermission()` in every page and server action; never `redirect()` from a layout.
- **UI**: `PageHeader` (with `module`), `Panel`, `Select` (never native `<select>`), `DialogButton`, `useFormAction`,
  `Status`. Colours are tokens in `src/app/globals.css` (primary navy `#17324D`, accent teal `#167D7F`). Plain-language
  labels that say why an action is blocked. No gradients or decorative effects.
- **Checks before handing back**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` (dev server on
  port 3006, installed Edge), screenshots at desktop and phone width.
- **Windows**: stop the dev server before `prisma migrate dev`/`generate`.
