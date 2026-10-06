# Phase 3: Workflows (PME, skill matrix, TNA, TNI)

Build plan for LDMS v2 phase 3. **Approved 6 Oct 2026: all sixteen recommendations in §3 confirmed.** Written after reading the old
system's code (`C:\Apache24\htdocs\ldms`) and its database (`phnportalenterto_trms`, read-only), so each section says
what the old system does today, then what v2 would do. Read with `README.md`, `CLAUDE.md` and `docs/phase-2-plan.md`.

**How to work:** as in phase 2. One module at a time, in the order in §8; after each: typecheck, lint, unit tests, e2e
tests, screenshots at desktop and phone width, then stop for review.

**The decisions are in §3**: sixteen questions, each with what the old system does and what v2 does. All were
confirmed as recommended on 6 Oct 2026; the rest of the plan follows from them.

---

## 1. Where things stand

- Phases 1 and 2 are on master: org chart, staff, sign-in, permissions, audit log, trainings, participants and
  attendance, My training, OJT, certificates, reports.
- Already in place for phase 3: who approves whom (`src/server/rules/approver.ts`: a person's department HOD; HODs and
  division heads have no approver in LDMS), HOD and division-head access derived from the org chart, and a
  `Participant` row per person per training for a PME to attach to.
- **Missing in v2, needed by phase 3**: a staff member's **job grade** (the old `user.grade`, 1 to 5; TNA by grade
  depends on it), and a way to say **who may fill in skill matrices** (the old `skill_matrix_whitelist`).

## 2. The four workflows in one table

| | PME | Skill matrix | TNA | TNI |
|---|---|---|---|---|
| Full name | Performance Monitoring Evaluation | Skill matrix evaluation | Training Need Analysis | Training Need Identification |
| What it is | The HOD rates how well a person applied a training | A quarterly rating of a person's knowledge, skills and abilities | A yearly list of the training a person (or a job grade) needs | A yearly list of a department's performance gaps and how to close them |
| About whom | Executives and managers, per training attended | Non-executive and contract staff | Office staff individually; other staff by job grade | A department |
| Filled in by | The person's HOD | A manager, a named evaluator or the main clerk | The person (or main clerk for a grade) | The HOD |
| Approved by | Staff member agrees, then L&D verifies | The HOD | The HOD | No one |
| How often | Once per training, after 3 months | Every quarter | Every year | Every year |
| Use today (old database) | 1,606 current, 6,616 archived | 1,545 this quarter (87,201 rated lines) | 92 current rows, 2,250 archived | 0 current, 49 archived |

Skill matrix is by far the most used; TNI the least.

---

## 3. Decisions (confirmed 6 Oct 2026)

Each has the old system's behaviour and what v2 does. The user confirmed every "Recommended for v2" column as it
stands, including keeping TNI (question 15), built last and simply.

### PME

| # | Question | Old system | Recommended for v2 |
|---|---|---|---|
| 1 | **Who gets a PME?** | Only **Executive** and **Manager** staff who are not a HOD or division head, are not resigned and have a HOD. Everyone else's row is `not_applicable` (920 of 1,606 today). | The same. Non-executive, contract and trainee staff get none. |
| 2 | **For which trainings?** | Public / In-house only (the `participation` table). OJT has no PME. | Public / In-house and Departmental. Not OJT. |
| 3 | **When does the PME start to exist?** | The moment the person is added to a training, whatever their attendance. L&D's list then hides those who didn't complete. | When the person's attendance becomes **Completed**. Absent or pending: no PME. If attendance is reopened before the HOD has evaluated, the PME is withdrawn. |
| 4 | **The evaluation period** | Starts the day after the training's start date, lasts 3 months. The HOD **cannot open the form until the period has ended**. | The same: 3 months, counted from the day after the training's **end** date (so a long course isn't evaluated before it finishes). HOD evaluates once it has ended. |
| 5 | **Short trainings** | 4 hours or less: no HOD evaluation; a daily job marks the PME completed once the period starts. | 4 hours or less: marked **Not required (short training)** from the start. No job needed. Same 4-hour line as short OJT. |
| 6 | **The staff member's step** | After the HOD evaluates, the staff member opens it and clicks **Agree**. There is no way to disagree. | Keep one **Acknowledge** button, plus an optional comment the HOD and L&D can read. |
| 7 | **L&D's step** | L&D **verify** it: the four percentages are totalled and averaged, and the PME is locked. | The same. Average shown as a mark out of 100. L&D can send it back to the HOD with a reason before verifying. |

### Skill matrix

| # | Question | Old system | Recommended for v2 |
|---|---|---|---|
| 8 | **Who fills them in?** | A manager who is not the HOD, for their department; **or** anyone on a hand-kept list of 137 staff numbers; **or** the main clerk. | A manager (not the HOD) in the department, the main clerk, and anyone L&D gives a new **Skill matrix evaluator** role on their staff record. The list of 137 becomes that role in the phase 5 import. |
| 9 | **Who is evaluated, how often, and for which quarter?** | Active **non-executive and contract** staff in the evaluator's department, **one per quarter** (calendar quarters). The quarter is always the one **today falls in**: from 1 October every page shows Q4, and Q3's drafts and pending matrices drop out of sight. | **Decided 6 Oct 2026.** Same people, one per quarter, but the matrix is for the quarter that has **just ended**: on 6 Oct 2026 people fill in Q3 2026, and Q4 2026 opens on 1 Jan 2027. When the next quarter opens, the earlier one is **closed**: no new matrix and no editing, but it can still be viewed and **duplicated into the open quarter**. Old records dated July to September 2026 are Q3 2026. |
| 10 | **Changing one after approval** | Not possible; a new one next quarter. A draft can be edited; one sent for approval can't. | The same, plus the HOD can **send it back** to the evaluator with a reason instead of approving. |

### TNA

| # | Question | Old system | Recommended for v2 |
|---|---|---|---|
| 11 | **The TNA year** | Hard-coded: every TNA is saved as year **2023**, though the page titles say FY 2025 / FY 2026. So there is really only ever one TNA per person, overwritten. | One TNA per person (or grade) **per calendar year**. Last year's stays on record and can be copied forward as a starting point. |
| 12 | **Who fills in their own TNA?** | "Office" staff: non-executives marked as office users, plus executives and managers who are not HODs. v2 has no "office" mark. | Executives and managers (not HODs), plus any non-executive L&D ticks **Fills in own TNA** on the staff record. The old "office" mark sets that tick in the import. |
| 13 | **TNA by job grade** | For everyone else: one TNA per **job grade (1 to 5) per department**, entered by the main clerk, approved by the HOD (71 of them in the archive). | The same. Needs **job grade** added to the staff record (and to the staff Excel import and export). |
| 14 | **After approval** | Locked for the staff member. A HOD who saves it approves it in the same click. L&D can also fill in and approve for anyone. | Locked once approved. The HOD can edit before approving, or send it back. L&D can reopen an approved one, with the reason in the audit log. |

### TNI and general

| # | Question | Old system | Recommended for v2 |
|---|---|---|---|
| 15 | **Keep TNI?** | One list per department per year, typed in by the HOD, no approval. 49 lines in 2025 from 10 departments; none since. | Keep it, built last and simply, as it is small. |
| 16 | **Reminder emails** | Daily emails to HODs about overdue PMEs. | Phase 4 (daily jobs), as planned. Phase 3 shows what is waiting on screen: a count in the sidebar and an overview card. |

---

## 4. What the old system does, in detail

### 4.1 PME

- **Created** by a database trigger when a participant is added: one `pme` row per participant, with the staff
  member's name, department and HOD copied in, and the period set (start date + 1 day, to + 3 months).
- **The form** (HOD), titled *Performance Monitoring Form*. Four questions, each with a rating band, a percentage
  inside that band, and remarks:

  | # | Section | Question |
  |---|---|---|
  | 1 | Learning level | Evaluate the employee's Knowledge Sharing Sessions (KSS) and On-the-Job Training (OJT) conducted for their teams after attending training. Also: *was the OJT conducted, yes or no*, with remarks (required): if yes the date, time and place; if no, why not. |
  | 2 | Learning level | Did the employee learn what they were supposed to learn from the training attended? |
  | 3 | Behavioural change | Did the employee apply their newly acquired skills and knowledge to their job? |
  | 4 | Result of training attended | Did the training have any measurable business impact? |

  Rating bands: **Excellent** 90 to 100, **Very good** 80 to 89, **Good** 70 to 79, **Satisfactory** 60 to 69,
  **Fair** 50 to 59, **Poor** 1 to 49. The percentage must fall inside the chosen band.
- **Statuses**: `pending` (waiting for the HOD) → `approved` (HOD has evaluated) → `completed` (staff member clicked
  Agree) → `verified` (L&D checked it; total and average mark saved). Plus `not_applicable`.
- **Short trainings** (4 hours or less): set to `completed` by a daily job once the period starts.
- **Lists**: the HOD's PME list (this year's, overdue first), the staff member's own PME list (status and a View
  button), L&D's per-training list (completed attendance only) with a PDF report.
- **Reminders**: a daily email digest to each HOD of PMEs past their period and still pending.
- **Problems v2 avoids**: staff name, department and HOD copied onto each row and kept in step by triggers; the HOD
  form saves without checking who is signed in; rows created for people who can never be evaluated.

### 4.2 Skill matrix

- **One evaluation per staff member per quarter** (no staff member has two in a quarter in the data). It has three
  sections, **Knowledge**, **Skill** and **Ability**. Each section holds topics the evaluator types in; each topic
  holds up to 5 lines, each a sentence and a rating. An average evaluation has 12 topics.
- **Ratings**: 1 Beginner, 2 Basic, 3 Competent, 4 Advanced, 5 Expert.
- **Rules**: every section needs at least one topic; a topic needs a name and at least one complete line.
- **Save as draft** (not sent) or **Submit** (waiting for approval). The department's HOD approves, one at a time or
  all pending at once.
- **Which quarter**: worked out from today's date (`YEAR` and `QUARTER` of the evaluation date), on every page. So
  the old system has shown Q4 2026 since 1 October, with nobody "submitted"; Q3's 264 drafts and 316 matrices waiting
  for approval are no longer listed. v2 does not follow this (question 9).
- **Duplicate**: copy one person's matrix to other staff in the department who have none this quarter (the same
  topics and ratings, as a starting point). This is why 9 evaluators could create 264 drafts. It cannot copy from an
  earlier quarter.
- **Matrix chart** (HOD, L&D): a grid of staff against topics. A topic's score is its ratings added up, over the
  most they could be, as a percentage. Scores are shown in five levels: 100 Highly skilled (able to supervise
  others), 75 Competent, 50 Medium competency, 25 Novice (basic knowledge), 0 Minimal competency. Exports to Excel
  with evaluated-by, verified-by and approved-by.
- **Who**: evaluators as in question 8; approver is the department's HOD (a manager marked HOD who heads a department).

### 4.3 TNA

- **The form**, *Training Need Analysis (TNA) Form*, to be completed "in consultation with your immediate superior".
  Seven sections, each a list of rows the person adds:

  | | Section |
  |---|---|
  | a | ESG (Environment, Social, Governance) |
  | b | Soft skills |
  | c | Leadership awareness |
  | d | Data driven |
  | e | Functional awareness (critical priorities and future growth) |
  | f | Digital transformation and innovation |
  | g | Special project |

  Each row: **problem statement**; **training required** (picked from that section's list, or *Others* with the name
  typed in); **target** and **current** skill, each 1 to 5; **gap** (target minus current, worked out); **how it will
  be achieved** (1 On-job training, 2 Coaching, 3 External / In-house); **when** (a month).
- **Skill levels**: 1 Fundamental awareness, 2 Novice, 3 Intermediate, 4 Proficient, 5 Expert.
- **Training options**: 193 options, kept by L&D (added 2 Oct 2026), with Excel import and export. Functional
  awareness has 140 of them in 12 groups.
- **Statuses**: not submitted → waiting for approval → approved.
- **Two kinds**: an individual's TNA, and a TNA for a job grade in a department (question 13).
- **Who does what**: the staff member saves (waiting for approval); the HOD opens a staff member's or a grade's TNA,
  may change it, and *Save & Approve*; the main clerk enters grade TNAs; L&D can enter and approve any.
- **L&D's views**: list by individual and by grade per department; a summary (how many submitted per department,
  each department's status, share of rows per section, share per method); PDF exports.
- **The page also shows** the person's training hours this year (public / in-house, OJT, total).
- **Problems v2 avoids**: the year fixed at 2023; every save deletes all the person's rows and re-inserts them;
  the same 2,700-line form copied seven times.

### 4.4 TNI

- **The form**, *Training Need Identification (TNI) Form*: one list per department per year, by the HOD. One
  section, **Mandatory (within the first 3 months in the role)**. Each row: performance indicator (critical to
  quality or process); expected and actual performance, each 1 to 5; gap; possible causes; attitude, skill or
  knowledge; L&D method (the same three as TNA); evaluation method. The last few are free text.
- No approval and no statuses. Saving replaces the department's list for the year. L&D can view every department's.

---

## 5. Data model (proposed; add to `prisma/schema.prisma`)

Names and shapes may still change as each module is built. Forms that may be reworded later are versioned, as the feedback form is.

```prisma
// --- groundwork ---
// Staff: jobGrade Int?   (1 to 5; null when the old value was 0 or blank)
//        fillsOwnTna Boolean @default(false)   (question 12)
// RoleCode: add SKILL_EVALUATOR                (question 8)

// --- PME ---
enum PmeStatus {
  NOT_REQUIRED  // short training
  PENDING       // waiting for the HOD (who may evaluate once the period has ended)
  EVALUATED     // HOD has evaluated; waiting for the staff member
  ACKNOWLEDGED  // staff member has agreed; waiting for L&D
  VERIFIED      // L&D has verified; locked
}

model Pme {
  id             Int        @id @default(autoincrement())
  participantId  Int        @unique           // one per person per training
  status         PmeStatus  @default(PENDING)
  // as built: also returnedAt, createdAt, updatedAt; evaluatedBy / verifiedBy link to Staff
  periodStart    DateTime   @db.Date
  periodEnd      DateTime   @db.Date
  answers        Json?      // the four ratings, percentages and remarks; shape checked by a Zod schema
  answersVersion Int?
  ojtConducted   Boolean?
  averageMark    Decimal?   @db.Decimal(5, 2) // set when verified
  evaluatedById  Int?
  evaluatedAt    DateTime?
  staffComment   String?    @db.VarChar(500)
  acknowledgedAt DateTime?
  verifiedById   Int?
  verifiedAt     DateTime?
  returnReason   String?    @db.VarChar(255)  // when L&D sends it back to the HOD
  legacyId       Int?
  // who evaluates is not stored: it is the person's approver today (rules/approver.ts)
}

// --- Skill matrix ---
enum SkillSection { KNOWLEDGE  SKILL  ABILITY }
enum SkillStatus  { DRAFT  SUBMITTED  APPROVED }

model SkillEvaluation {
  id           Int         @id @default(autoincrement())
  staffId      Int
  year         Int
  quarter      Int                              // 1 to 4: the quarter evaluated, stored, never worked out from a date
  status       SkillStatus @default(DRAFT)
  createdById  Int
  copiedFromId Int?                             // the matrix it was duplicated from, if any
  submittedAt  DateTime?
  approvedById Int?
  approvedAt   DateTime?
  returnReason String?     @db.VarChar(255)
  topics       SkillTopic[]
  @@unique([staffId, year, quarter])
}
model SkillTopic { id, evaluationId, section SkillSection, name VarChar(500), sortOrder, items SkillItem[] }
model SkillItem  { id, topicId, text Text, rating Int /* 1 to 5 */, sortOrder }

// --- TNA ---
enum TnaSection { ESG  SOFT_SKILLS  LEADERSHIP  DATA_DRIVEN  FUNCTIONAL  DIGITAL  SPECIAL_PROJECT }
enum TnaMethod  { OJT  COACHING  EXTERNAL_INHOUSE }
enum TnaStatus  { DRAFT  SUBMITTED  APPROVED }

model Tna {
  id           Int       @id @default(autoincrement())
  year         Int
  staffId      Int?      // an individual's TNA ...
  departmentId Int?      // ... or a job grade's, in a department
  jobGrade     Int?
  status       TnaStatus @default(DRAFT)
  submittedById Int?  submittedAt DateTime?
  approvedById  Int?  approvedAt  DateTime?
  returnReason String?   @db.VarChar(255)
  items        TnaItem[]
  @@unique([year, staffId])
  @@unique([year, departmentId, jobGrade])
}
model TnaItem {
  id, tnaId, section TnaSection, sortOrder
  problem       Text
  optionId      Int?           // the option picked, or null for "Others"
  trainingName  VarChar(255)   // the option's name when saved, or what was typed
  targetSkill   Int            // 1 to 5
  currentSkill  Int            // 1 to 5; the gap is worked out, not stored
  method        TnaMethod
  month         Int            // 1 to 12
}
model TnaTrainingCategory { id, section TnaSection, name, sortOrder }
model TnaTrainingOption   { id, section TnaSection, categoryId Int?, name, sortOrder, active Boolean }

// --- TNI ---
model Tni     { id, year, departmentId, updatedById, items TniItem[]  @@unique([year, departmentId]) }
model TniItem { id, tniId, sortOrder, indicator Text, expected Int, actual Int,
                causes VarChar(500), ask VarChar(255), method TnaMethod, evaluation VarChar(255) }
```

---

## 6. Rules (pure functions in `src/server/rules`, all unit-tested)

| Rule | Behaviour |
|---|---|
| `pmeRequirement(staff, training, approver)` | Whether a completed participant gets a PME, and if not, why: wrong designation, is a HOD or division head, resigned, or OJT. A short training's is Not required. (A department with no active HOD still gets one: see module 1.) |
| `pmePeriod(training)` | Period start and end (question 4). |
| `pmeActionBlock(action, pme, viewer, today)` | Why the person can't evaluate, acknowledge, verify or send back, or null: evaluate is only the person's approver, only while PENDING, only after the period has ended. Built as one rule in place of `pmeEvaluateBlock` and `pmeTransition`. |
| `pmeMark(answers)` | Total and average of the four percentages; each percentage must sit inside its rating's band. |
| `pmeFollowsAttendance(pme)`, `pmeReopenBlock` | Withdrawal: a PME the HOD hasn't touched follows the attendance; an evaluated one keeps attendance completed. |
| `skillOpenQuarter(today)` | The quarter being filled in: the last **completed** calendar quarter, in Malaysia time. 6 Oct 2026 → Q3 2026; 31 Dec 2026 → Q3 2026; 1 Jan 2027 → Q4 2026. |
| `skillQuarterBlock(year, quarter, today)` | Why a quarter can't be changed, or null: only the open quarter takes a new matrix, an edit or a submit. Any quarter can be viewed. |
| `skillDuplicateBlock(source, target, user, today)` | Source: any matrix the user may view, in the open quarter or a closed one. Target: the open quarter only, a person the user may evaluate who has no matrix in it (the same person, from a closed quarter, or others). The copy is a draft. |
| `skillEvaluatorScope(user)` | Whose matrices the user may fill in: their department's non-executive and contract staff, if they are a manager there (not its HOD), the main clerk, or hold the evaluator role. |
| `skillEvaluationBlock(...)` | One per person per quarter; editable while a draft or sent back; every section needs a topic; a topic needs a name and one complete line. |
| `skillTopicScore(items)` and `skillLevel(score)` | A topic's percentage, and which of the five levels it falls in. |
| `tnaOwnerKind(staff)` | Individual TNA, covered by a grade TNA, or none (HODs and division heads). |
| `tnaEditBlock(tna, user)` | Who may edit at each status; locked once approved. |
| `tnaGap(target, current)` | Target minus current. |

---

## 7. Permissions and navigation

| Who | Gets |
|---|---|
| Every staff member | **My PME** on My training (their evaluations to acknowledge) and, if they fill in their own, **My TNA**. |
| HOD (derived from the org chart) | **Approvals**: PMEs to evaluate, skill matrices and TNAs to approve; their department's TNI; the matrix chart. |
| Division head | Views for their division, as with reports. No approving. |
| Manager in a department, Skill matrix evaluator role, main clerk | **Skill matrix**: fill in and submit for the department's staff. Main clerk also: TNAs by job grade. |
| L&D admin | Everything: verify PMEs, see and reopen any record, TNA training options, summaries and exports. |

Sidebar: under **My work**: My training, **My TNA**. A new group **Team** for HODs and evaluators: **Approvals**
(with a count of what is waiting), **Skill matrix**, **TNA**, **TNI**. L&D see the same screens for every department.

---

## 8. Modules, in build order

Each is reviewed before the next starts. Order is by how much each is used and what it depends on.

### Module 0: Groundwork (built 06 Oct 2026)
- Migration `20261006030000_staff_job_grade_and_evaluator_role`: `Staff.jobGrade` (1 to 5, or none),
  `Staff.fillsOwnTna`, and `SKILL_EVALUATOR` added to `RoleCode`.
- **Job grade**: on the staff form (anyone who can edit the record), the staff record, the Excel export and import.
- **Fills in their own TNA**: a tick on the staff form that only L&D can change (a clerk sees it greyed out, and a
  clerk's save or import leaves it as it was). Executives and managers always fill in their own, so the form says so
  instead of offering the tick. The staff record shows how the person's TNA will work (`tnaKind` in
  `src/server/rules/tna.ts`): their own, by job grade, or none (HODs, division heads, leavers, no grade yet).
- **Import**: two new optional columns, *Job Grade* and *Fills Own TNA* (Yes / No). A file without them, such as one
  made from the older template, leaves those values as they are.
- **Skill matrix evaluator** role, given on the staff record's Access panel; permission `skill.evaluate` (also the
  main clerk and L&D). It opens nothing yet: module 2 builds the screens. It does **not** count as extra access
  (`hasExtraAccess`), so clerks can still edit, and record OJT for, a contract line leader who holds it.
- Fixed on the way: the roles action kept its own list of three roles, so a new role would have been dropped on
  save; it now uses the same list as the Access panel.
- **Moved to module 1**: the Approvals page and its sidebar count, so it isn't shipped as an empty screen.
- Tests: `tests/rules/tna.test.ts`; e2e in `tests/e2e/staff-changes.spec.ts`.

### Module 1: PME (built 06 Oct 2026, awaiting review)
- Migration `20261006090000_pme`: the `Pme` table (§5, plus `returnedAt` and links to who evaluated and verified).
  After migrating, `npm run db:sync-pme` makes the PMEs that completed attendance already on record should have
  (safe to run again; the seed does the same).
- **When a PME exists** (`pmeRequirement`, `src/server/rules/pme.ts`): made when attendance becomes Completed, by
  the person's feedback or by L&D, for an active executive or manager who is not a HOD or division head, on anything
  but OJT. 4 hours or less: **Not required**. Reopening attendance withdraws one the HOD hasn't evaluated; once
  evaluated, attendance can't be reopened. Editing a training's dates or times moves the periods of those not yet
  evaluated. One place does all of this: `syncPmes` (`src/server/services/pmeSync.ts`).
- **The period**: from the day after the training ends, for three months (`pmePeriod`). The HOD can evaluate from
  the day after it ends, as in the old system.
- **The form** (`src/lib/forms/pme.ts`, version 1): the old form's four questions; each takes a rating band and a
  whole percentage inside it, and remarks. Question 1 also asks whether OJT was conducted, with remarks required
  (the others' are optional), as in the old form. The mark (total of 400, average of 100) adds up as the HOD types.
- **The path**: HOD evaluates → staff member acknowledges (optional comment) → L&D verify (mark saved, locked) or
  send back with a reason (the HOD starts from what they wrote; the staff member acknowledges again). Every step is
  in the audit log (entity `Pme`) and in the History on the PME's page.
- **Screens**: **Approvals** (`/approvals`: HODs see PMEs to evaluate, L&D those to verify, longest-waiting first,
  with the count in the sidebar); **PME** (`/pme`: the list, filters, Excel export; HODs their departments,
  division heads their divisions to look at, L&D everyone); the PME's own page (`/pme/[id]`: progress, the form or
  the evaluation, the steps). Sidebar group **Team**. Staff: a PME column and an Acknowledge button on My training, a
  PME card on each training's page there, and the sidebar count. Overview: PMEs in *Waiting on you*.
- PME status beside each participant: the training page, the attendance report, and both Excel exports.
- **Decided while building** (say if any should change):
  - A department **without an active HOD still gets PMEs**: they wait, marked *No active HOD*, instead of never
    being made (the plan's rule listed this as a reason for none; the old system made none).
  - If the staff member **resigns after being evaluated**, L&D can verify without their acknowledgement.
  - There is no separate "overdue" state: a PME is *Waiting for HOD* from the day after its period ends, and lists
    show how long it has waited.
  - L&D cannot evaluate on a HOD's behalf, as in the old system.
- Tests: `tests/rules/pme.test.ts` (who gets one, the period on month ends and year ends, each step allowed and
  refused, the form's bands, the mark, who sees what); `tests/e2e/pme.spec.ts` (the whole path with a send-back;
  the period lock, short trainings, withdrawal on reopen, and a clerk, the person themselves and another HOD kept out).

### Module 2: Skill matrix
- Evaluator: list of the department's staff with their status for the **open quarter** (the one just ended, named in
  the header with the day it closes); the form (three sections, topics, lines); save as draft, submit; duplicate to
  other staff.
- **Earlier quarters**: a quarter picker. A closed quarter is view-only and says why; its matrices keep a
  **Duplicate** button that copies into the open quarter, for the same person or for others.
- HOD: approve one or all pending; send back with a reason.
- Matrix chart for a department and quarter, with Excel export.
- History of earlier quarters on the staff record.
- **Still to decide**: a matrix submitted in time but not yet approved when its quarter closes. Suggested: the HOD
  can still approve it, but can no longer send it back; drafts never submitted stay as they are, view-only.
- **Done when**: a quarter's cycle works end to end, one matrix per person per quarter is enforced, a closed quarter
  refuses a new matrix, an edit and a submit, a closed quarter's matrix can be duplicated into the open one, and
  the chart's figures match the rule tests.

### Module 3: TNA
- TNA training options: L&D's list, with Excel import and export.
- Individual TNA (My TNA) and TNA by job grade (main clerk), with the seven sections; copy last year's forward.
- HOD: review, edit, approve or send back. L&D: any department, reopen, summaries (by department, by section, by
  method), Excel export.
- **Done when**: both kinds work through approval for a year, and a second year keeps the first on record.

### Module 4: TNI
- HOD: the department's list for the year. L&D: every department's, with Excel export.

---

## 9. Not in phase 3

- Reminder emails and the daily job: phase 4.
- Dashboards with charts across these four: phase 4.
- Importing the old PME, skill matrix, TNA and TNI records: phase 5 (§11).
- PDF exports in the old layouts: Excel first; PDFs only if L&D still needs them for audits.

## 10. Tests to add

- **Unit**: every rule in §6, especially who gets a PME, the period, the rating bands, each allowed and refused
  step in the three approval flows, one skill matrix per quarter, the open quarter on each boundary day (31 Mar,
  1 Apr, 31 Dec, 1 Jan), closed-quarter refusals, duplicating from a closed quarter, topic scores and levels, TNA
  owner kind.
- **E2e**, one flow per module: HOD evaluates, staff acknowledges, L&D verifies; an evaluator fills in and submits a
  skill matrix, the HOD approves, the chart shows it; a staff member submits a TNA, the HOD approves it, it is
  locked; a HOD saves a TNI. Plus refusals: another department's HOD, a clerk, a plain staff member.

## 11. Notes for the phase 5 migration

- **PME**: `pme` and `pme_archive` → `Pme`, matched to the migrated participant. Old `approved` → EVALUATED,
  `completed` → ACKNOWLEDGED, `verified` → VERIFIED, `not_applicable` → no PME row. Ratings are stored as words and
  percentages as text: convert, and list anything that doesn't fit its band.
- **Skill matrix**: straight across; a blank `approval_status` is a draft. Quarter from `evaluation_date` (decided
  6 Oct 2026: a matrix dated July to September 2026 is Q3 2026). **Watch out:** the old system is not being changed,
  so anything entered in it from 1 Oct 2026 is dated Q4 although it is meant for Q3, and a person can end up with a
  Q3-dated and a Q4-dated matrix for the same quarter. The import must list these for a decision, not guess.
- **Whitelist**: the 137 staff numbers in `skill_matrix_whitelist` get the Skill matrix evaluator role.
- **TNA**: every old row says year 2023. Decide in phase 5 which year each really belongs to (`dateapprove` helps
  for approved ones). Statuses are `''`, `'1'` and `'APPROVE'`. Method is `1`, `2` or `3`; month is `Jan` to `Dec`.
  Rows with a `grade` are grade TNAs; `training` holds the option's name as text, so match by name and keep the
  text where there is no match.
- **TNI**: `tni_archive` only (49 rows, 2025). Free text columns as they are.
- **Staff**: `user.grade` → `jobGrade` (0 and blank → none); `usertype = 'OFFICE'` → `fillsOwnTna`.
