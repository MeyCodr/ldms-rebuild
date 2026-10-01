# Phase 2: Training core

Build plan for LDMS v2 phase 2. Written 29 Sep 2026, at the end of phase 1, so a new session can start without the
earlier conversation. Read with `README.md` (overview, security, decisions) and `CLAUDE.md` (conventions).

**How to work:** one module at a time, in the order below. After each module: typecheck, lint, unit tests, e2e tests,
screenshots at desktop and phone width, then stop and show the user before starting the next module.

---

## 1. Where things stand

- **Phase 1 (foundation) is done**: sign-in, permissions, org chart, staff, Excel import/export, audit log, data checks,
  and a security review with fixes (see README → Security).
- **Stack**: Next.js 16 (App Router, `src/proxy.ts` instead of middleware), React 19, TypeScript strict, Prisma 6 on
  MySQL 8 (database `ldms_v2`), Auth.js v5 (credentials), Zod 4, Tailwind 4, ExcelJS, Vitest, Playwright (installed Edge).
- **Dev**: `npm run dev` → http://localhost:3006/phn-ldms (base path `/phn-ldms`, see README → Where things are). Demo sign-ins, password `Ldms@2026`: 10001 L&D admin, 10002 main clerk,
  10003 clerk, 10231 HOD Stamping. Other seeded staff: migrated password `phn12345`.
- **Confirmed rules**: staff report to their department HOD; **HODs and division heads have no approver in LDMS**.
- **Still unconfirmed**: sign-in by staff no. only (Microsoft Entra later).

## 2. Scope

**In phase 2**

1. Trainings: Public / In-house, OJT and Departmental, in one model, with optional sessions. (Public and In-house
   were merged into one type on 29 Sep 2026 at the user's request.)
2. Participants and attendance: PENDING, COMPLETED or ABSENT.
3. My Training: each person's trainings, the feedback form (16 questions), self-recorded OJT.
4. OJT for clerks: bulk entry and Excel import with preview.
5. Certificates: upload and download per participant.
6. Reports: per-training attendance, hours per staff and per department, audit report, Excel exports.

**Not in phase 2** (don't build yet)

- PME, TNA, TNI, skill matrix: phase 3. But design `Participant` so phase 3 can attach one `Pme` per participant.
- Dashboards with charts, reminder emails, the daily job: phase 4.
- Importing the old database: phase 5 (but keep `legacySource`/`legacyId` columns now).

## 3. Questions for the user before starting

**Answered 29 Sep 2026: the user chose the default for all seven.** (Question 5 was later overtaken: the form now follows
the old system's fields; see module 1.) Q1–Q2 stay as `TODO` placeholders in
`src/lib/forms/feedback.ts` until L&D supplies the wording.

Ask these first. The default applies if the user has no preference.

| # | Question | Default if not answered |
|---|---|---|
| 1 | The 16 feedback questions: wording, answer scale per question, which are required | Build with the form versioned (`feedbackVersion = 1`) and placeholder wording clearly marked `TODO` in one file, so the wording can be swapped without code changes elsewhere |
| 2 | The 3 answers staff give when they record their own OJT | Same approach: placeholders in the form definition file |
| 3 | Certificate storage and limits | Folder `uploads/certificates/` (outside `public/`, git-ignored), PDF/JPG/PNG, max 5 MB, served only through a permission-checked route |
| 4 | Clerks' existing OJT Excel layout | Design a template like the staff import one |
| 5 | Extra training fields (course code, category, HRDF-claimable, provider…) | Include `code`, `provider`, `category` (free text), `hrdfClaimable` (boolean); all optional |
| 6 | When may staff fill in the feedback form: from the start date or only after the end date? | From the **end date** (old system sent reminders after the training ended) |
| 7 | What exactly was the old "audit report"? | A list of trainings in a date range with each participant's attendance, hours and certificate status, for ISO audits |

## 4. Conventions to follow (from phase 1)

- **Layers**: pages and server actions never write through Prisma directly. They call a service in
  `src/server/services/*`, which calls `ensure(user, permission)`, applies rules from `src/server/rules/*` (pure
  functions, no Prisma, unit-tested) and writes an `AuditLog` entry in the **same transaction** (`recordAudit`, `diffFields`).
- **Auth**: every page calls `requireUser()` or `requirePermission()`; every server action calls `requireUser()` first;
  route handlers call `getCurrentUser()` and check `mustChangePassword` and the permission. Never `redirect()` from a
  layout (it loops during client navigation).
- **Permissions**: add new ones to `Permission` and `ROLE_PERMISSIONS` in `src/server/permissions.ts`; check with `can()`.
  Record-level checks (like `canManageStaffRecord`) take a typed shape that forces callers to load what the check needs.
- **Validation**: Zod schemas in `src/lib/validation/*.ts`, parsed with `parseForm()`; errors become form state through
  `toErrorState()`. Business-rule failures throw `UserError` with a plain-language message.
- **Forms**: client forms use `useFormAction()` (no React form reset on error), `Field` + `fieldProps()`, `SubmitButton`.
  Required fields get `required` (red asterisk). Short confirmations and small forms go in `DialogButton`/`ConfirmDialog`.
  Keep a dialog mounted when the action changes the page under it (see `hideTrigger` in `Dialog.tsx`).
- **Dropdowns**: always `src/components/ui/Select.tsx` (groups, hints, search on long lists). Never a native `<select>`.
- **Pages**: `PageHeader` with a `module` (icon tile and colour). List pages with long tables use the `page-fit` +
  `table-scroll` classes (table fills the screen and scrolls on its own). White `Panel`s only for self-contained blocks.
- **Design** (redesigned 01 Oct 2026, see README → Design notes): light sidebar, white `.card`s, bento overview,
  `TrainingCover` for trainings. Colour tokens in `src/app/globals.css`. Primary navy `#17324D` (primary buttons, hero card), learning accent
  teal `#167D7F` (links, focus, current location), background `#F6F8FA`, text `#1F2933`/`#667085`, border `#D9E0E6`,
  success `#2E7D5B`, warning `#B7791F`, danger `#C0392B`. Status is a dot plus words (`Status`), never a filled badge.
  Plain-language labels and hints; explain *why* an action is blocked. Staff no., dates and hours use the `num` class.
  Dates shown as `03 Apr 2017` (`formatDate`), Malaysia time (`nowInMalaysia`). No gradients, glows or decoration.
- **Navigation**: screens appear in the sidebar only once built, grouped by what people do (see §7).
- **Excel import**: follow `src/server/services/staffImport.ts`: header-matched columns, per-row errors, preview, then
  commit that re-reads and re-validates the same file, optional "skip rows with errors", template download route.
- **Tests**: rules → `tests/rules/*.test.ts` (Vitest). Flows → `tests/e2e/*.spec.ts` (Playwright, one worker, uses the
  `choose()` helper for Select, relative paths such as `page.goto("trainings")` because of the base path). E2e tests create their own records with unique numbers and restore shared demo data
  in `finally`.
- **Windows**: stop the dev server before `prisma migrate dev`/`generate` (it locks the query engine DLL).
- **Base path**: plain `<a href>` (downloads) must use `withBasePath()` from `src/lib/base-path.ts`; `Link` and
  `redirect()` add it themselves.
- **Next 16**: read `node_modules/next/dist/docs/` before using an API you're unsure of. `params`/`searchParams` are
  promises; `forbidden()` needs `experimental.authInterrupts` (already on).

## 5. Data model (add to `prisma/schema.prisma`)

```prisma
enum TrainingType {
  PUBLIC_INHOUSE // a course run by an external provider, at their venue or at PHN
  OJT          // on-the-job training
  DEPARTMENTAL // run by a department for its own staff
}

enum TrainingStatus {
  SCHEDULED
  CANCELLED
}

enum Attendance {
  PENDING
  COMPLETED
  ABSENT
}

enum ParticipantSource {
  ADMIN   // added by L&D
  CLERK   // OJT entered or imported by a clerk
  SELF    // OJT recorded by the staff member
  IMPORT  // Excel import
}

model Training {
  id            Int             @id @default(autoincrement())
  type          TrainingType
  title         String          @db.VarChar(200)
  code          String?         @db.VarChar(40)
  provider      String?         @db.VarChar(160) // training provider / organiser
  trainerName   String?         @db.VarChar(160)
  venue         String?         @db.VarChar(160)
  category      String?         @db.VarChar(80)
  hrdfClaimable Boolean         @default(false)
  cost          Decimal?        @db.Decimal(12, 2) // RM, whole course
  description   String?         @db.Text
  startDate     DateTime        @db.Date
  endDate       DateTime        @db.Date
  startTime     DateTime        @db.Time(0)
  endTime       DateTime        @db.Time(0)
  status        TrainingStatus  @default(SCHEDULED)
  departmentId  Int?            // organising department (DEPARTMENTAL, and OJT)
  createdById   Int?
  legacySource  String?         @db.VarChar(10) // "training" | "ojt": old IDs overlap between tables
  legacyId      Int?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  department    Department?     @relation(fields: [departmentId], references: [id])
  sessions      TrainingSession[]
  participants  Participant[]

  @@unique([legacySource, legacyId])
  @@index([type, startDate])   // replaces the old *_archive tables
  @@index([startDate])
}

// Optional. Only for trainings whose days are not consecutive or whose times
// differ per day. Without sessions, hours come from the date range × daily hours.
model TrainingSession {
  id         Int      @id @default(autoincrement())
  trainingId Int
  date       DateTime @db.Date
  startTime  DateTime @db.Time(0)
  endTime    DateTime @db.Time(0)
  training   Training @relation(fields: [trainingId], references: [id], onDelete: Cascade)

  @@unique([trainingId, date, startTime])
}

model Participant {
  id                  Int               @id @default(autoincrement())
  trainingId          Int
  staffId             Int
  attendance          Attendance        @default(PENDING)
  source              ParticipantSource @default(ADMIN)
  recordedById        Int?              // who added the row (clerk, admin or the staff member)
  attendanceReason    String?           @db.VarChar(255) // why absent, or why marked completed on their behalf
  feedback            Json?             // answers, shape checked by the Zod schema for feedbackVersion
  feedbackVersion     Int?
  submittedAt         DateTime?
  certificateFile     String?           @db.VarChar(255) // stored name under uploads/certificates
  certificateName     String?           @db.VarChar(255) // original file name, for download
  certificateAt       DateTime?
  legacyId            Int?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  training            Training          @relation(fields: [trainingId], references: [id])
  staff               Staff             @relation(fields: [staffId], references: [id])
  // phase 3: pme Pme?

  @@unique([trainingId, staffId])
  @@index([staffId, attendance])
  @@index([attendance, trainingId])
}
```

Also add the back-relations on `Staff` (`participants Participant[]`) and `Department` (`trainings Training[]`), and
`"Training" | "Participant"` to the audit `entity` union in `src/server/services/audit.ts`.

## 6. Business rules (`src/server/rules/training.ts`, all unit-tested)

| Rule | Detail |
|---|---|
| `trainingHours(t)` | **The single definition of hours.** Without sessions: `(endDate − startDate + 1 days) × (endTime − startTime)`. With sessions: sum of each session's `endTime − startTime`. Round to 2 decimals. End time must be after start time (no overnight). Test: 1 day 08:30–17:30 = 9 h; 3 days 09:00–13:00 = 12 h; sessions 2×4 h = 8 h. |
| `countsTowardHours(p)` | Only when `attendance === "COMPLETED"` and the training is not CANCELLED. |
| Attendance transitions | PENDING → COMPLETED when the participant submits the feedback form (or admin marks it, with a reason, for people who can't use a computer). PENDING → ABSENT by admin, reason optional. ABSENT → PENDING (undo) by admin. COMPLETED → PENDING only by admin ("reopen"), audited. Nothing else. |
| Feedback availability | Form opens on the training's end date (see question 6) and stays open while attendance is PENDING. |
| OJT self-record | Saved directly as COMPLETED, source SELF, with the 3 OJT answers. |
| OJT edit/delete | Staff can edit and **delete** OJT they recorded themselves (source SELF). OJT recorded by a clerk or admin can be **edited but not deleted** by the staff member. |
| Clerk scope | Clerks enter OJT for **contract staff only** (same rule as phase 1 staff records, including the extra-access guard). |
| Remove participant | Only while PENDING and without feedback; otherwise mark ABSENT or reopen. |
| Delete training | Only with no participants; otherwise cancel it (status CANCELLED keeps history, hours stop counting). |
| Resigned staff | Can't be added as participants; their history stays. |

Feedback form definitions live in one file, `src/lib/forms/feedback.ts`: `FEEDBACK_V1` (16 questions) and
`OJT_SELF_V1` (3 answers), each with the question text, answer type (1–5 scale, yes/no, text) and a Zod schema. Store
`feedbackVersion` with every answer set so wording can change later.

## 7. Permissions and navigation

New permissions in `src/server/permissions.ts`:

| Permission | Who |
|---|---|
| `training.view` | L&D admin |
| `training.manage` (create/edit/cancel trainings, participants, attendance) | L&D admin |
| `ojt.manage` (OJT entry and import, contract staff only unless admin) | L&D admin, main clerk, clerk |
| `reports.view` | L&D admin; HODs see their own departments only |

Everyone can use My Training for themselves. HODs and division heads can see the training history of staff they can
already view (staff record page, §8 module 6).

Sidebar (only after each screen exists), with module keys and colours in `src/lib/tones.ts` / `moduleIcons.ts`:

- **My work**: My training (`training`, marigold)
- **Training**: Trainings (`training`), OJT (add module key `ojt`, e.g. olive, or reuse `training`)
- **Records**: Staff, Organization (as now)
- **Reports**: Training reports (add module key `reports`, cobalt)
- **Administration**: Audit log

## 8. Modules, in build order

Each module lists screens, services/actions, and when it is done.

### Module 1: Trainings (done 30 Sep 2026)

Built to match the old system's Add Training form, following the user's review. What exists now:

- `/trainings`: list with `page-fit` table. Filters: search (title, trainer, venue), type, year, status. Columns: dates,
  training (title + trainer and venue), type (Public / In-house shown as "Public"), hours, participants (completed /
  total), status (Upcoming / In progress / Held / Cancelled). Sortable by dates (default, newest first), title, type and
  participants. Excel export with the same filters and sort, columns in the form's order.
- `/trainings/new`, `/trainings/[id]/edit`: **Type** (Public / In-house or OJT), then the old form's fields in its order:
  Title, Venue, Cost (RM), HRDC (Yes/No), Platform (Physical / Online), Function (Business / Digital / Leadership /
  Personal effectiveness), Start/End date, Start/End time, Program (External public program / Internal training by
  external trainer / Internal training by internal trainer), then **Trainer**: a dropdown of active executives and
  managers for an internal trainer (`trainerStaffId`, name copied to `trainerName`), typed otherwise. Program,
  function and platform are required except for OJT. Hours are shown live. Dates and times use the custom
  `DateField` / `TimeField` (typed day-first dates or a calendar; 24-hour times or a 15-minute list).
- `/trainings/[id]`: the form's fields, schedule and hours, participant summary, history in plain language; actions Edit,
  Cancel training / Restore, Delete (only with no participants; the dialog explains otherwise).
- Service `src/server/services/training.ts`; validation `src/lib/validation/training.ts`; rules
  `src/server/rules/training.ts`; migration `20260929100000_phase2_trainings`.

**Kept in the model but not on the form:** Departmental type (left out for now), course code, category, provider,
description, organising department and sessions. Editing leaves them unchanged, except that saving replaces any sessions
with the form's dates and times. Decide at the phase 5 import whether the old data fills them; otherwise remove them.
Phase 5 must also map the old values of HRDC, platform, function and program.

### Module 2: Participants and attendance (built 30 Sep 2026, awaiting review)

- `/trainings/[id]`: Details beside Schedule, then a full-width **Participants** panel, then History. The panel has
  counts that double as filters (All / Pending / Completed / Absent), a name or staff no. search, and a table: staff no.,
  name, department and section, attendance (with its reason), feedback date, certificate. On phones the table scrolls
  sideways inside the panel.
- **Add participants** dialog: active staff load when it opens; narrow by department, section or search, tick people or
  "Select all" (everyone matching, which is how a whole department or section is added). Staff already on the list show
  "Already added". The server skips and reports duplicates and resigned staff.
- **Row actions**: Pending → Mark completed (reason required, only from the training's last day), Mark absent (reason
  optional), Remove. Absent → Undo absent. Completed → Reopen (reason optional, kept in history). **Bulk**: Mark
  completed, Mark absent, Remove for ticked rows. The dialog shows up front which rows will change and why the others
  are skipped; the server re-checks. Nothing changes while the training is cancelled.
- Every change writes an audit entry (entity `Participant`, the training's id), shown in the training's History. One
  entry per add or action, naming everyone it covered (a *Staff* line), so adding a whole department doesn't push the
  training's own changes out of the History's latest 25.
- **Excel export** of the participant list: training title and dates on top, then staff, attendance, reason, feedback
  date, certificate, and hours (training hours only when completed and not cancelled).
- Rules `src/server/rules/attendance.ts` (tests `tests/rules/attendance.test.ts`), service
  `src/server/services/participant.ts`, validation `src/lib/validation/participant.ts`, migration
  `20260930090000_participant_attendance_reason` (renames `absentReason` → `attendanceReason`, which now holds the
  reason for absent or for completed-on-their-behalf). The seed adds demo participants when the table is empty.

### Module 3: My Training

- `/my-training`: three sections: *Needs your feedback* (PENDING, form open), *Upcoming*, *History* (with total
  completed hours for the year, using `trainingHours`). Filter by year.
- `/my-training/[participantId]`: training details + the feedback form (FEEDBACK_V1). Submitting sets COMPLETED.
  Only the participant themselves can open it.
- `/my-training/ojt/new` and edit: record own OJT (title, date, times, trainer/mentor, the 3 answers).
- Overview → "Waiting on you": list pending feedback forms, most overdue first (replace the "all caught up" message
  when there are items).
- **Done when**: a staff member can find, fill and submit their form; totals match `trainingHours`.

### Module 4: OJT for clerks

- `/ojt`: OJT records list (clerks see contract staff only). Filters: department, date range, search.
- Bulk entry: one OJT activity (title, date, times, trainer) + pick many staff → one Training (type OJT) with one
  Participant per staff member, source CLERK, attendance COMPLETED.
- `/ojt/import`: Excel import like the staff import. Columns suggestion: Staff No, OJT Title, Date, Start Time, End Time,
  Trainer, Department (optional). Rows with the same title + date + times share one Training.
- Template download route, preview with per-row errors, commit with "skip rows with errors".
- **Done when**: a clerk can enter or import OJT for contract staff and is refused for others (row errors, not a crash).

### Module 5: Certificates

- Upload on a participant row (admin) or on My Training (the staff member, for their own record).
- Store under `uploads/certificates/<year>/<random id>.<ext>` (add `uploads/` to `.gitignore`); keep the original name in
  `certificateName`. Check type by file signature (PDF/JPG/PNG), max 5 MB. Replace and remove, both audited.
- Download route `/certificates/[participantId]` that checks: the owner, admin, or someone who can view that staff
  member. `Content-Disposition: attachment`, never served from `public/`.
- **Done when**: upload, replace, remove and download work, and a staff member can't fetch someone else's certificate.

### Module 6: Reports and staff training history

- `/reports/training` (tabs or separate pages):
  1. **Training attendance**: one training's participants with attendance, hours, certificate status.
  2. **Staff hours**: per staff member for a year: trainings completed, total hours. Filter division/department.
  3. **Department hours**: per department: headcount (`isActiveHeadcount`), total hours, average hours per head.
  4. **Audit report**: trainings in a date range with participants, attendance, hours, certificate yes/no.
- Every report exports to Excel. HODs see only their departments.
- Staff record page: add a *Training* panel with that person's history and hours per year.
- **Done when**: figures agree with the rule tests and with each other (staff totals add up to department totals).

## 9. Demo data (extend `prisma/seed.ts`)

Realistic trainings for a stamping and welding plant, spread over 2025–2026, e.g. *ISO 9001:2015 Internal Auditor*
(public, 2 days), *Power Press Safety* (in-house), *5S Workplace Organisation* (in-house), *Forklift Operation Licence*
(public), *Spot Welding Parameter Setting* (OJT), *Die Maintenance Basics* (OJT), *Excel for Production Reporting*
(departmental, HRA), *IATF 16949 Awareness* (in-house). Mix of PENDING / COMPLETED / ABSENT, some with feedback, one
cancelled training, one multi-session training. Only seed trainings when the Training table is empty.

## 10. Tests to add

- **Unit** (`tests/rules/training.test.ts`): `trainingHours` (single day, multi-day, sessions, invalid times),
  `countsTowardHours`, every attendance transition (allowed and refused), OJT edit/delete by source, feedback schema
  (required answers, out-of-range values), clerk scope for OJT.
- **E2e**: admin creates a training and adds participants; staff submits feedback and sees hours; admin marks absent and
  undoes; clerk enters OJT for a contract staff member and is refused for an executive; OJT import preview and commit;
  certificate upload and a refused download by another staff member; a report's Excel export downloads.

## 11. Phase 2 is done when

- Everything in §8 works and is covered by the tests in §10.
- On migrated data (checked in phase 5), training and OJT hours per staff member and per department match the old
  system for 2026.
- All checks pass: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.

## 12. Notes for the phase 5 migration

- The old `training` and `ojt` tables have overlapping IDs: import both into `Training` with `legacySource` set.
- Old public and in-house trainings both import as `PUBLIC_INHOUSE`.
- Old feedback columns `q1`–`q16` → `Participant.feedback` with `feedbackVersion = 1`.
- Old status values are free text (`'1'`, blank, `'APPROVE'`): map them explicitly and list anything unmapped in the
  reconciliation report rather than guessing.
