// Who approves a staff member's PME, TNA and skill-matrix records.
//
// Old system: trigger trg_departments_hod_update copied the HOD onto every
// user.hodid row, and a HOD's own approver was 0 (none).
// Rule (confirmed by L&D, 24 Sep 2026): staff report to their department's
// HOD. HODs and division heads have no approver inside LDMS.

export type ApproverInput = {
  staffId: number;
  department: {
    hodId: number | null;
    hodActive: boolean;
    division: { headId: number | null };
  };
  /** True when this person is HOD of any department, not only their own. */
  isHodAnywhere?: boolean;
};

export type NoApproverReason = "IS_HOD" | "IS_DIVISION_HEAD" | "NO_HOD";

export type ApproverResult = { approverId: number; basis: "HOD" } | { approverId: null; basis: "NONE"; reason: NoApproverReason };

export function resolveApprover({ staffId, department, isHodAnywhere }: ApproverInput): ApproverResult {
  if (department.division.headId === staffId) {
    return { approverId: null, basis: "NONE", reason: "IS_DIVISION_HEAD" };
  }
  if (department.hodId === staffId || isHodAnywhere) {
    return { approverId: null, basis: "NONE", reason: "IS_HOD" };
  }
  // A resigned HOD still linked to the department is treated as no HOD, so
  // records are never routed to someone who cannot sign in.
  if (department.hodId !== null && department.hodActive) {
    return { approverId: department.hodId, basis: "HOD" };
  }
  return { approverId: null, basis: "NONE", reason: "NO_HOD" };
}

/** Reasons that are expected, as opposed to a gap in the org chart. */
export function hasNoApproverByDesign(r: ApproverResult): boolean {
  return r.basis === "NONE" && (r.reason === "IS_HOD" || r.reason === "IS_DIVISION_HEAD");
}

export const approverReasonLabel: Record<NoApproverReason, string> = {
  IS_HOD: "HOD, no approver in LDMS",
  IS_DIVISION_HEAD: "Division head, no approver in LDMS",
  NO_HOD: "Department has no active HOD",
};
