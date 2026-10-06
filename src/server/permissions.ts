// Roles → permissions. Pages, server actions and the sidebar all ask can();
// nothing checks a role name directly.
//
// HOD and division head are not granted roles. They are derived from the org
// chart when the session user is loaded, so moving a HOD in Organization
// changes their access on their next request.

import type { Designation, Prisma, RoleCode } from "@prisma/client";

export type Permission =
  | "org.view"
  | "org.manage"
  | "staff.view"
  | "staff.manage"
  | "staff.import"
  | "staff.roles"
  | "audit.view"
  | "training.view"
  | "training.manage"
  | "ojt.manage"
  | "report.view"
  | "skill.evaluate"
  | "pme.view"
  | "pme.verify";

export type SessionUser = {
  id: number;
  staffNo: string;
  name: string;
  departmentId: number;
  departmentName: string;
  divisionId: number;
  roles: RoleCode[];
  hodOfDepartmentIds: number[];
  headOfDivisionIds: number[];
  mustChangePassword: boolean;
};

const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  LD_ADMIN: [
    "org.view",
    "org.manage",
    "staff.view",
    "staff.manage",
    "staff.import",
    "staff.roles",
    "audit.view",
    "training.view",
    "training.manage",
    "ojt.manage",
    "report.view",
    "skill.evaluate",
    "pme.view",
    "pme.verify",
  ],
  MAIN_CLERK: ["staff.view", "staff.manage", "staff.import", "ojt.manage", "skill.evaluate"],
  CLERK: ["staff.view", "staff.manage", "staff.import", "ojt.manage"],
  // Fills in skill matrices for their own department (phase 3, module 2). Managers get this from their designation.
  SKILL_EVALUATOR: ["skill.evaluate"],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  LD_ADMIN: "L&D admin",
  MAIN_CLERK: "Main clerk",
  CLERK: "Clerk",
  SKILL_EVALUATOR: "Skill matrix evaluator",
};

export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  LD_ADMIN: "Full access: trainings, reports, organization, all staff, imports, roles and the audit log.",
  MAIN_CLERK: "Adds and updates contract staff and records their OJT. Will also handle TNA, PME and skill matrix for contract staff as those screens open.",
  CLERK: "Adds and updates contract staff and records their OJT.",
  SKILL_EVALUATOR: "Fills in the quarterly skill matrix for non-executive and contract staff in their own department, for the HOD to approve.",
};

export function isAdmin(user: SessionUser): boolean {
  return user.roles.includes("LD_ADMIN");
}

export function isHod(user: SessionUser): boolean {
  return user.hodOfDepartmentIds.length > 0;
}

export function isDivisionHead(user: SessionUser): boolean {
  return user.headOfDivisionIds.length > 0;
}

export function permissionsOf(user: SessionUser): Set<Permission> {
  const perms = new Set<Permission>();
  for (const role of user.roles) ROLE_PERMISSIONS[role].forEach((p) => perms.add(p));
  // HODs can look up the staff they approve for; division heads can view their division.
  // Both get the training reports and the PME list, for those same staff (see reportStaffScope).
  if (isHod(user) || isDivisionHead(user)) {
    perms.add("staff.view");
    perms.add("report.view");
    perms.add("pme.view");
  }
  return perms;
}

export function can(user: SessionUser, permission: Permission): boolean {
  return permissionsOf(user).has(permission);
}

/** Who has an Approvals page: HODs (their staff's records to evaluate or approve) and L&D (what they verify). */
export function hasApprovals(user: SessionUser): boolean {
  return isHod(user) || can(user, "pme.verify");
}

const isClerk = (user: SessionUser) => user.roles.includes("CLERK") || user.roles.includes("MAIN_CLERK");

/**
 * Which staff records the user may see. Returns null when they may see none.
 * Clerks see contract staff; HODs see their departments; division heads see
 * their divisions. The scopes add up.
 */
export function staffViewScope(user: SessionUser): Prisma.StaffWhereInput | null {
  if (isAdmin(user)) return {};
  const or: Prisma.StaffWhereInput[] = [];
  if (isClerk(user)) or.push({ designation: "CONTRACT" });
  if (isHod(user)) or.push({ departmentId: { in: user.hodOfDepartmentIds } });
  if (isDivisionHead(user)) or.push({ department: { divisionId: { in: user.headOfDivisionIds } } });
  return or.length ? { OR: or } : null;
}

/**
 * Whose OJT the user may see and record. Admin: everyone. Clerks: contract
 * staff (who also need no extra access; see ojtStaffBlock). Null: no one.
 */
export function ojtStaffScope(user: SessionUser): Prisma.StaffWhereInput | null {
  if (!can(user, "ojt.manage")) return null;
  if (isAdmin(user)) return {};
  return { designation: "CONTRACT" };
}

/**
 * Whose training the reports show the user. Admin: everyone. HODs: their
 * departments. Division heads: their divisions. Null: no one (clerks have no
 * reports, though they can see contract staff's records).
 */
export function reportStaffScope(user: SessionUser): Prisma.StaffWhereInput | null {
  if (!can(user, "report.view")) return null;
  if (isAdmin(user)) return {};
  const or: Prisma.StaffWhereInput[] = [];
  if (isHod(user)) or.push({ departmentId: { in: user.hodOfDepartmentIds } });
  if (isDivisionHead(user)) or.push({ department: { divisionId: { in: user.headOfDivisionIds } } });
  return or.length ? { OR: or } : null;
}

/**
 * Whose PMEs the PME list shows the user: the same people as the reports.
 * L&D: everyone. HODs: their departments (they evaluate these). Division
 * heads: their divisions, to look at only. Null: no one. Everyone also sees
 * their own PMEs, on My training.
 */
export function pmeStaffScope(user: SessionUser): Prisma.StaffWhereInput | null {
  return can(user, "pme.view") ? reportStaffScope(user) : null;
}

/** The departments those staff belong to: what the reports' department filter and the department report list. */
export function reportDepartmentScope(user: SessionUser): Prisma.DepartmentWhereInput | null {
  if (!can(user, "report.view")) return null;
  if (isAdmin(user)) return {};
  const or: Prisma.DepartmentWhereInput[] = [];
  if (isHod(user)) or.push({ id: { in: user.hodOfDepartmentIds } });
  if (isDivisionHead(user)) or.push({ divisionId: { in: user.headOfDivisionIds } });
  return or.length ? { OR: or } : null;
}

/** Designations the user may create or edit. Admin: all. Clerks: contract only. */
export function manageableDesignations(user: SessionUser): Designation[] {
  if (isAdmin(user)) return ["NON_EXECUTIVE", "EXECUTIVE", "MANAGER", "CONTRACT", "TRAINEE"];
  if (isClerk(user)) return ["CONTRACT"];
  return [];
}

/** What a manage check needs to know about the target. Load roles, hodOf and headOf with the record. */
export type ManagedStaff = {
  designation: Designation;
  roles: { role: RoleCode }[];
  hodOf: unknown[];
  headOf: unknown[];
};

/**
 * Whether someone holds access beyond an ordinary staff member's: an L&D or
 * clerk role, or a HOD or division-head post. The Skill matrix evaluator role
 * doesn't count: it lets a line leader fill in matrices the HOD still has to
 * approve, and those leaders are often contract staff the clerks look after.
 */
export function hasExtraAccess(staff: Pick<ManagedStaff, "roles" | "hodOf" | "headOf">): boolean {
  return staff.roles.some((r) => r.role !== "SKILL_EVALUATOR") || staff.hodOf.length > 0 || staff.headOf.length > 0;
}

export function canManageStaffRecord(user: SessionUser, staff: ManagedStaff): boolean {
  if (!can(user, "staff.manage") || !manageableDesignations(user).includes(staff.designation)) return false;
  // Only admins may change someone who holds extra access (a role, HOD or
  // division head). Otherwise a clerk could reset that person's password and
  // sign in with their access.
  if (!isAdmin(user) && hasExtraAccess(staff)) return false;
  return true;
}
