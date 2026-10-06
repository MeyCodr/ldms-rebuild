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
  | "report.view";

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
  ],
  MAIN_CLERK: ["staff.view", "staff.manage", "staff.import", "ojt.manage"],
  CLERK: ["staff.view", "staff.manage", "staff.import", "ojt.manage"],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  LD_ADMIN: "L&D admin",
  MAIN_CLERK: "Main clerk",
  CLERK: "Clerk",
};

export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  LD_ADMIN: "Full access: trainings, reports, organization, all staff, imports, roles and the audit log.",
  MAIN_CLERK: "Adds and updates contract staff and records their OJT. Will also handle TNA, PME and skill matrix for contract staff as those screens open.",
  CLERK: "Adds and updates contract staff and records their OJT.",
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
  // Both get the training reports, for those same staff (see reportStaffScope).
  if (isHod(user) || isDivisionHead(user)) {
    perms.add("staff.view");
    perms.add("report.view");
  }
  return perms;
}

export function can(user: SessionUser, permission: Permission): boolean {
  return permissionsOf(user).has(permission);
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

export function canManageStaffRecord(user: SessionUser, staff: ManagedStaff): boolean {
  if (!can(user, "staff.manage") || !manageableDesignations(user).includes(staff.designation)) return false;
  // Only admins may change someone who holds extra access (a role, HOD or
  // division head). Otherwise a clerk could reset that person's password and
  // sign in with their access.
  if (!isAdmin(user) && (staff.roles.length > 0 || staff.hodOf.length > 0 || staff.headOf.length > 0)) return false;
  return true;
}
