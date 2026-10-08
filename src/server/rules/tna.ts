// Training Need Analysis (phase 3). Pure functions.
//
// Old system: "office" users, executives and managers filled in their own TNA;
// everyone else was covered by one TNA per job grade per department, entered
// by the main clerk. HODs had none (staff/hod/tna/fetch_staff.php leaves them
// out, and they have no approver).

import type { Designation, Prisma, StaffStatus, TnaStatus } from "@prisma/client";
import { isAdmin, isDivisionHead, isHod, type SessionUser } from "../permissions";

export type TnaKind =
  | "OWN" // fills in their own TNA, approved by their HOD
  | "BY_GRADE" // covered by their department's TNA for their job grade
  | "NONE";

export type TnaStaff = {
  status: StaffStatus;
  designation: Designation;
  jobGrade: number | null;
  /** Ticked by L&D for a non-executive who fills in their own. */
  fillsOwnTna: boolean;
  /** HOD of any department, or head of a division: no approver in LDMS, so no TNA. */
  isHead: boolean;
};

/** How a staff member's training needs are recorded. */
export function tnaKind(staff: TnaStaff): TnaKind {
  if (staff.status !== "ACTIVE" || staff.isHead) return "NONE";
  if (staff.designation === "EXECUTIVE" || staff.designation === "MANAGER" || staff.fillsOwnTna) return "OWN";
  return staff.jobGrade ? "BY_GRADE" : "NONE";
}

/** The same, in words for the staff record. */
export function tnaKindLabel(staff: TnaStaff): string {
  const kind = tnaKind(staff);
  if (kind === "OWN") return staff.designation === "EXECUTIVE" || staff.designation === "MANAGER" ? "Fills in their own" : "Fills in their own (set by L&D)";
  if (kind === "BY_GRADE") return `By job grade ${staff.jobGrade}, for the department`;
  if (staff.status !== "ACTIVE") return "None: resigned";
  if (staff.isHead) return "None: HODs and division heads have no TNA";
  return "None until a job grade is set";
}

// ---------- The TNA itself (module 3) ----------
//
// One TNA per year for each person who fills in their own, and one per job
// grade per department for everyone else, entered by the department's main
// clerk. The department's HOD approves both kinds.
//
//   DRAFT       being filled in, or sent back (or reopened by L&D)
//   SUBMITTED   waiting for the HOD, who may send it back, or change it and approve it; L&D may too, as in the old system
//   APPROVED    locked; L&D can reopen it, with a reason
//
// The year being filled in ("the open year") is the calendar year today falls
// in, unless L&D have opened next year's early (they collect it before
// January): then it is next year. One year is open at a time. Earlier years
// stay on record, view-only, and can be copied forward as a start. A TNA
// submitted before its year closed still waits for the HOD, who can approve it. Decisions 11 to 14 in docs/phase-3-plan.md §3, and module 3 in §8.

/** The Prisma filter for staff who fill in their own TNA: the same people tnaKind calls OWN. */
export const TNA_OWN_WHERE = {
  status: "ACTIVE",
  hodOf: { none: {} },
  headOf: { none: {} },
  OR: [{ designation: { in: ["EXECUTIVE", "MANAGER"] } }, { fillsOwnTna: true }],
} satisfies Prisma.StaffWhereInput;

/** The Prisma filter for staff covered by their department's TNA for their job grade: tnaKind's BY_GRADE. */
export const TNA_BY_GRADE_WHERE = {
  status: "ACTIVE",
  hodOf: { none: {} },
  headOf: { none: {} },
  designation: { notIn: ["EXECUTIVE", "MANAGER"] },
  fillsOwnTna: false,
  jobGrade: { not: null },
} satisfies Prisma.StaffWhereInput;

export const JOB_GRADES = [1, 2, 3, 4, 5] as const;

// ---------- Years ----------

/**
 * The year being filled in: the calendar year today falls in (Malaysia time),
 * or next year once L&D have opened it early (`openedEarly`, the tna.year
 * setting). A setting for any other year is ignored, so on 1 January the new
 * year is open whether or not anyone opened it.
 */
export function tnaOpenYear(today: Date, openedEarly: number | null = null): number {
  const calendar = today.getUTCFullYear();
  return openedEarly === calendar + 1 ? calendar + 1 : calendar;
}

/** Whether the open year is next year's, opened early by L&D. */
export const tnaOpenedEarly = (today: Date, open: number) => open > today.getUTCFullYear();

/** A year from the URL, or null when it isn't one. */
export function parseTnaYear(value: string | undefined): number | null {
  return /^20\d{2}$/.test(value ?? "") ? Number(value) : null;
}

/** Why a year's TNAs can't be started, changed or submitted, or null when it is the open year. */
export function tnaYearBlock(year: number, open: number): string | null {
  if (year === open) return null;
  if (year > open) return `${year}'s TNAs aren't open yet. They open on 1 Jan ${year}, or earlier if L&D open them.`;
  return `${year}'s TNAs are closed, so they can only be viewed. Start ${open}'s from it to carry it forward.`;
}

// ---------- Who ----------

/** Whose TNA it is: a person's, or a job grade's in a department. `name` is how it reads in a sentence. */
export type TnaOwner = {
  /** The person, for an individual's TNA; null for a job grade's. */
  staffId: number | null;
  /** The person's department today, or the job grade's. Its HOD approves. */
  departmentId: number;
  divisionId: number;
  name: string;
};

export const tnaGradeName = (department: string, jobGrade: number) => `${department}, job grade ${jobGrade}`;
/** "Siti's TNA" or "the TNA for Stamping, job grade 3". */
export const tnaTitle = (owner: Pick<TnaOwner, "staffId" | "name">) => (owner.staffId === null ? `the TNA for ${owner.name}` : `${owner.name}'s TNA`);

/** What the signed-in person is to a TNA. */
export type TnaViewer = {
  /** It is their own. */
  isOwner: boolean;
  /** May fill it in and submit it: the person themselves, the department's main clerk for a job grade's, and L&D for any. */
  canFill: boolean;
  /** HOD of the department, or L&D: may change a submitted one, approve it or send it back. Never the person it is about. */
  isApprover: boolean;
  /** L&D: may reopen an approved one. */
  isAdmin: boolean;
  /** May open it at all: any of the above, or head of the department's division. */
  canView: boolean;
};

export function tnaViewer(user: SessionUser, owner: TnaOwner): TnaViewer {
  const admin = isAdmin(user);
  const isOwner = owner.staffId === user.id;
  const isHodHere = user.hodOfDepartmentIds.includes(owner.departmentId);
  // L&D approve too, as they could in the old system.
  const isApprover = !isOwner && (isHodHere || admin);
  // A main clerk who is also the department's HOD approves, so doesn't fill in.
  const clerk = owner.staffId === null && user.roles.includes("MAIN_CLERK") && user.departmentId === owner.departmentId && !isHodHere;
  const canFill = isOwner || admin || clerk;
  return { isOwner, canFill, isApprover, isAdmin: admin, canView: canFill || isApprover || user.headOfDivisionIds.includes(owner.divisionId) };
}

/** Who has the TNA screen under Team: L&D, HODs, division heads and main clerks. Everyone else has only My TNA, if they fill in their own. */
export const seesTeamTnas = (user: SessionUser) => isAdmin(user) || isHod(user) || isDivisionHead(user) || user.roles.includes("MAIN_CLERK");

/** Whose individual TNAs the Team screen lists. L&D: everyone's. HODs: their departments'. Division heads: their divisions'. Null: no one's. */
export function tnaStaffScope(user: SessionUser): Prisma.StaffWhereInput | null {
  if (isAdmin(user)) return {};
  const or: Prisma.StaffWhereInput[] = [];
  if (isHod(user)) or.push({ departmentId: { in: user.hodOfDepartmentIds } });
  if (isDivisionHead(user)) or.push({ department: { divisionId: { in: user.headOfDivisionIds } } });
  return or.length ? { OR: or } : null;
}

/** The departments whose job-grade TNAs the Team screen lists: the same, plus the main clerk's own. */
export function tnaDepartmentScope(user: SessionUser): Prisma.DepartmentWhereInput | null {
  if (isAdmin(user)) return {};
  const or: Prisma.DepartmentWhereInput[] = [];
  const departments = [...new Set([...user.hodOfDepartmentIds, ...(user.roles.includes("MAIN_CLERK") ? [user.departmentId] : [])])];
  if (departments.length) or.push({ id: { in: departments } });
  if (isDivisionHead(user)) or.push({ divisionId: { in: user.headOfDivisionIds } });
  return or.length ? { OR: or } : null;
}

/**
 * Why a TNA can't be started for this owner and year, or null when it can.
 * `subjectBlock` is why the owner can't have one at all (not someone who
 * fills in their own; a job grade no one is on), worked out by the caller.
 */
export function tnaStartBlock(owner: TnaOwner, viewer: TnaViewer, subjectBlock: string | null, hasTna: boolean, year: number, open: number): string | null {
  if (!viewer.canFill) return owner.staffId === null ? `You don't fill in ${tnaTitle(owner)}. The department's main clerk does.` : `You don't fill in ${tnaTitle(owner)}.`;
  if (subjectBlock) return subjectBlock;
  const closed = tnaYearBlock(year, open);
  if (closed) return closed;
  if (hasTna) return `There is already a TNA for ${owner.name} for ${year}. There is one per year.`;
  return null;
}

/** Why this person has no TNA of their own, or null when they fill one in. */
export function tnaOwnBlock(staff: TnaStaff & { name: string }): string | null {
  const kind = tnaKind(staff);
  if (kind === "OWN") return null;
  if (staff.status !== "ACTIVE") return `${staff.name} has resigned.`;
  if (staff.isHead) return "HODs and division heads have no approver in LDMS, so they have no TNA.";
  if (kind === "BY_GRADE") return `${staff.name}'s training needs are in their department's TNA for job grade ${staff.jobGrade}, which the main clerk fills in.`;
  return `${staff.name} has no job grade yet, so isn't covered by a TNA. L&D set the job grade on the staff record.`;
}

/** The same, said to the person themselves on My TNA. */
export function tnaMyBlock(staff: TnaStaff): string | null {
  const kind = tnaKind(staff);
  if (kind === "OWN") return null;
  if (staff.isHead) return "HODs and division heads have no approver in LDMS, so they have no TNA.";
  if (kind === "BY_GRADE") return `Your training needs are in your department's TNA for job grade ${staff.jobGrade}, which the main clerk fills in and your HOD approves.`;
  return "You have no job grade on record yet, so no TNA covers you. Ask L&D to set it on your staff record.";
}

// ---------- The steps ----------

export const TNA_ACTIONS = ["EDIT", "SUBMIT", "DELETE", "APPROVE", "SEND_BACK", "REOPEN"] as const;
export type TnaAction = (typeof TNA_ACTIONS)[number];

export type TnaState = { year: number; status: TnaStatus; owner: Pick<TnaOwner, "staffId" | "name"> };

/** Why the person can't take this step on a TNA, or null when they can. */
export function tnaActionBlock(action: TnaAction, t: TnaState, viewer: TnaViewer, open: number): string | null {
  const title = tnaTitle(t.owner);
  const closed = tnaYearBlock(t.year, open);
  switch (action) {
    case "EDIT":
      if (t.status === "APPROVED") return viewer.isAdmin ? "This TNA is approved. Reopen it to change it." : "This TNA is approved, so it can't be changed. L&D can reopen it.";
      if (t.status === "SUBMITTED") {
        // The HOD may change it as they approve it; so may L&D.
        if (!viewer.isApprover && !viewer.isAdmin)
          return viewer.canFill ? "This TNA is with the HOD for approval. It can be changed only if they send it back." : `You don't fill in ${title}.`;
        return closed;
      }
      if (!viewer.canFill) return viewer.isApprover ? "This TNA hasn't been submitted yet. You can change it once it is." : `You don't fill in ${title}.`;
      return closed;
    case "SUBMIT":
    case "DELETE":
      if (!viewer.canFill) return `You don't fill in ${title}.`;
      if (t.status === "APPROVED") return "This TNA is already approved.";
      if (t.status === "SUBMITTED") return action === "DELETE" ? "This TNA has been sent to the HOD, so it stays on record." : "This TNA is already with the HOD.";
      return closed;
    case "APPROVE":
      if (!viewer.isApprover) return "Only the department's HOD or L&D can approve a TNA.";
      if (t.status === "APPROVED") return "This TNA is already approved.";
      if (t.status === "DRAFT") return "This TNA hasn't been submitted yet.";
      // A closed year's TNA can still be approved: it waits for the HOD until it is.
      return null;
    case "SEND_BACK":
      if (!viewer.isApprover) return "Only the department's HOD or L&D can send a TNA back.";
      if (t.status === "APPROVED") return "This TNA is already approved.";
      if (t.status === "DRAFT") return "This TNA hasn't been submitted yet.";
      if (closed) return `${t.year}'s TNAs are closed, so this one can no longer be changed. You can still approve it.`;
      return null;
    case "REOPEN":
      if (!viewer.isAdmin) return "Only L&D can reopen an approved TNA.";
      if (t.status !== "APPROVED") return "Only an approved TNA needs reopening.";
      return closed;
  }
}

// ---------- Where a TNA stands ----------

export const TNA_STAGES = ["NOT_STARTED", "DRAFT", "RETURNED", "SUBMITTED", "APPROVED"] as const;
export type TnaStage = (typeof TNA_STAGES)[number];

export const TNA_STAGE_LABELS: Record<TnaStage, string> = {
  NOT_STARTED: "Not started",
  DRAFT: "Draft",
  RETURNED: "Sent back",
  SUBMITTED: "Waiting for HOD",
  APPROVED: "Approved",
};
export const TNA_STAGE_TONE: Record<TnaStage, "ok" | "wait" | "bad" | "na"> = {
  NOT_STARTED: "na",
  DRAFT: "na",
  RETURNED: "bad",
  SUBMITTED: "wait",
  APPROVED: "ok",
};

export function tnaStage(t: { status: TnaStatus; returnReason: string | null } | null | undefined): TnaStage {
  if (!t) return "NOT_STARTED";
  if (t.status === "DRAFT") return t.returnReason ? "RETURNED" : "DRAFT";
  return t.status;
}
