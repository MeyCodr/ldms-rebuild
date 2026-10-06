# LDMS v2

Rebuild of the PHN Industry Learning and Development Management System on Next.js, Prisma and MySQL 8.
The plan lives in the **LDMS Rebuild Roadmap** artifact; this repo follows its phases.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Business rules sign-off, data cleanup in the old system | Rules for phase 1 written and tested; sign-off and cleanup are with L&D/HR |
| 1 | Foundation: org chart, staff, sign-in, permissions, audit log | **Built** |
| 2 | Training core: trainings, participants, attendance, OJT | **Built** (6 Oct 2026): Trainings, Participants, My Training, OJT for clerks, Certificates, Reports and staff training history; see `docs/phase-2-plan.md`. Still open: the 16 course feedback questions are placeholder wording until L&D supplies them |
| 3 | Workflows: PME, TNA, TNI, skill matrix | |
| 4 | Reporting, exports, daily jobs | |
| 5 | Migration rehearsal and cutover | |

## Run it locally

Needs Node 20.9+ and a local MySQL 8.

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate dev        # creates the ldms_v2 database and runs the seed
npm run dev                   # http://localhost:3006/phn-ldms
```

Demo sign-ins from the seed (password `Ldms@2026`):

| Staff no. | Who |
| --- | --- |
| 10001 | L&D admin |
| 10002 | Main clerk |
| 10003 | Clerk (contract staff only) |
| 10231 | HOD, Stamping |

Every other seeded staff member has the "migrated" MD5 password `phn12345`, which is upgraded to argon2 on first sign-in, exactly as migrated staff will experience it.

## Checks

```bash
npm run typecheck
npm run lint
npm test              # Vitest: the rules in src/server/rules and permissions
npm run test:e2e      # Playwright, uses the installed Microsoft Edge; starts the dev server if needed
```

## Where things are

```
prisma/schema.prisma        data model (phase 1 models; later phases add theirs)
prisma/seed.ts              settings + demo org chart
src/proxy.ts                early redirect for signed-out visitors (Next 16 "proxy", formerly middleware)
src/server/auth.ts          Auth.js credentials sign-in, MD5 → argon2 upgrade, lockout after 5 failures
src/server/session.ts       current user, requireUser(), requirePermission()
src/server/permissions.ts   roles → permissions, can(), staff visibility scopes
src/server/rules/           pure business rules, each with tests in tests/rules
src/server/services/        all reads and writes; check permissions and write the audit log
src/app/(app)/              signed-in screens
src/lib/validation/         Zod schemas shared by forms and services
```

**Base path**: the app is served under `/phn-ldms` (`src/lib/base-path.ts`, read by `next.config.ts`). `next/link`
and `redirect()` add it automatically; a plain `<a>` (file downloads) uses `withBasePath()`. Auth.js signs in and out
with `redirect: false` and the app redirects itself, because Auth.js would send a relative path to the site root. E2e
tests go to relative paths (`page.goto("trainings")`, not `"/trainings"`) so they stay under the base path.

Pages and server actions never call Prisma to change data directly; they call a service, which checks the
permission, applies the rules and writes the audit entry in the same transaction.

## Design notes

Colour system (tokens in `src/app/globals.css`):

| Role | Colour | Used for |
| --- | --- | --- |
| Primary | `#17324D` | Primary buttons, the one navy hero card per screen (the overview), sign-in panel |
| Secondary / learning accent | `#167D7F` | Links, focus rings, current location, progress, chart columns |
| Background / Surface | `#F4F6F8` / `#FFFFFF` | Page / cards, tables, dialogs |
| Primary / secondary text | `#1A2633` / `#6B7787` | Body text / labels, hints |
| Border | `#E2E7EC` (cards), `#CBD3DB` (inputs) | Hairlines |
| Success / Warning / Danger | `#2E7D5B` / `#B7791F` / `#C0392B` | Status only: done, waiting, blocked |

A small category palette (teal, blue, plum, amber, coral, olive, slate) tells **training categories**, **modules** and
**divisions** apart: each training has a category (`trainingCategory()` in `src/lib/trainingCategory.ts`: its type for
OJT and departmental, otherwise its function) that sets its cover, icon and tag colour; each screen has a module colour
(`MODULE_TONE`); each division keeps one colour for avatars and markers (`divisionTone()`). Status is a dot plus words,
never a filled badge.

**Layout.** A light sidebar (252px, collapsible to a 72px icon rail; a top bar and drawer below 1024px). Everything sits
in white cards (`.card` / `Panel`: hairline border, 12px corners, no shadow). The overview is a bento grid (12 columns on
desktop, 6 on tablet, 1 on phones) with deliberately different card sizes: a navy hero with the person's learning
hours, a tall "next training" card, a wide hours chart, then L&D figures for admins. Trainings have no images, so
`TrainingCover` draws a cover from the category colour, its icon and the steps mark.

**Pieces.** `Progress` (thin bar), `EmptyState` (icon, what's missing and why), `CategoryTag` / `.tag` (quiet labels),
`ColumnChart` (single-series columns in HTML: one hue, rounded data end, value on hover/focus, a screen-reader table),
`.skeleton` (loading placeholder for data loaded on the client). There is no route-level `loading.tsx`: streaming
would send a 200 before a page can answer 403 or 404.

**Scale.** On desktop (1024px and wider) the whole app is drawn at 75% (`--app-zoom` and `zoom` on `html` in
`globals.css`), for a calmer, less crowded screen; phones and tablets stay at 100% so text stays readable. Sizes are
still written at full size; the zoom scales them. Two things need care under zoom: a full-screen height is
`calc(100dvh / var(--app-zoom))` (`.h-full-screen`, `.min-h-full-screen`, `.page-fit`), and anything placed with
`getBoundingClientRect()` divides by `pageZoom()` (`src/lib/zoom.ts`), as `Select` and `usePopover` do. Pages have no
width cap: they and their tables fill the screen, however wide. Forms, notices and the import steps keep a readable width.

**Tables.** Every table starts with a **No.** column (muted, right-aligned, shrunk to fit), counting on across pages;
the audit log is the only table without one. A row that has a record opens it when clicked anywhere (`ClickableRow`), and keeps a real link
in one cell (title or name) for keyboard users; tick boxes, buttons and links inside the row still do their own thing.
Import previews have no record yet, so their rows don't open anything.

The mark is four ascending steps (`src/components/brand.tsx`). Titles use Bricolage Grotesque, body IBM Plex Sans with
tabular figures for numbers in columns. Corners: 8px controls, 12px cards, 16px hero. No gradients, glows or glass; one
soft shadow only for things that float (menus, dialogs). Screens only appear in the navigation once they exist.

## Security

Reviewed at the end of phase 1 (29 Sep 2026). Regression tests are in `tests/e2e/security.spec.ts` and `tests/rules/`.

- **Passwords**: argon2id. Migrated MD5 hashes are verified once, then replaced. Failed sign-ins take the same time
  whether or not the staff no. exists, so response times don't reveal valid staff numbers.
- **Lockout**: 5 failed sign-ins on a staff no. lock it for 10 minutes.
- **Sessions**: 10-hour signed cookies. Every request reloads the staff member, so resignation and role changes apply
  at once. A password reset or change bumps `Staff.sessionVersion`, which signs out every other session.
- **Temporary passwords**: until changed, only the Account page and its action work (`requireUser` enforces this for
  pages and server actions; the export routes check it too).
- **Authorization**: every server action and route handler checks the session and permission itself; `proxy.ts` is only
  an early redirect. Clerks manage contract staff only, and never anyone holding a role, a HOD or a division-head post.
- **Redirects**: `?from=` after sign-in only accepts paths on this site (`src/lib/safe-redirect.ts`).
- **Headers**: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy and a restrictive
  permissions policy on every response; `X-Powered-By` is off.
- **Uploaded files** (certificates): kept outside `public/` in `uploads/certificates/<year>/` under random names,
  type checked by content, and only served by `/certificates/[trainingId]` after a permission check.
- **Dependencies**: `npm audit` is clean. `deepmerge-ts` and `uuid` are pinned to patched versions through `overrides`
  in `package.json`; remove them once Prisma and ExcelJS ship fixed versions.

Still to do before go-live:

- **HTTPS and HSTS** at the reverse proxy (Nginx/Apache) on the production server.
- **Back up `uploads/` with the database.** Certificate files live there (the database only holds their names), so
  backups and server moves need both. `UPLOAD_DIR` can point it at another disk.
- **A full Content-Security-Policy** with nonces for Next.js's inline scripts.
- **Lockout across processes and per IP**: the lockout is in memory and keyed by staff no. Move it to the database
  (or Redis) if the app ever runs more than one process, and add a per-IP limit against password spraying.

## Decisions taken in phase 1 (pending sign-off)

- **Approvers**: staff report to their department's HOD. **HODs and division heads have no approver in LDMS**
  (confirmed 24 Sep 2026, same as the old system). Staff in a department without an active HOD have no approver
  and are flagged in the data checks, rather than silently escalated.
- **A HOD who is transferred or resigns** stops being HOD; the department is flagged until a new HOD is chosen.
- **Clerks** see and edit contract staff only. HODs and division heads can view the staff they approve for.
- **Sign-in** is staff no. + password. Microsoft Entra ID can be added to `src/server/auth.ts` later.
