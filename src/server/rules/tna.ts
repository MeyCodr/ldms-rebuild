// Training Need Analysis (phase 3). Pure functions.
//
// Old system: "office" users, executives and managers filled in their own TNA;
// everyone else was covered by one TNA per job grade per department, entered
// by the main clerk. HODs had none (staff/hod/tna/fetch_staff.php leaves them
// out, and they have no approver).

import type { Designation, StaffStatus } from "@prisma/client";

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
