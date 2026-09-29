import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { can, type Permission, type SessionUser } from "./permissions";

/**
 * The signed-in staff member, loaded fresh from the database on every request
 * so role changes, HOD moves and resignations take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!Number.isInteger(id)) return null;

  const staff = await db.staff.findUnique({
    where: { id },
    select: {
      id: true,
      staffNo: true,
      name: true,
      status: true,
      departmentId: true,
      mustChangePassword: true,
      sessionVersion: true,
      department: { select: { name: true, divisionId: true } },
      roles: { select: { role: true } },
      hodOf: { select: { id: true } },
      headOf: { select: { id: true } },
    },
  });
  if (!staff || staff.status !== "ACTIVE") return null;
  // A password reset or change bumps sessionVersion, which ends every session
  // signed in before it (for example one on a lost or shared computer).
  if ((session as { sv?: number } | null)?.sv !== staff.sessionVersion) return null;

  return {
    id: staff.id,
    staffNo: staff.staffNo,
    name: staff.name,
    departmentId: staff.departmentId,
    departmentName: staff.department.name,
    divisionId: staff.department.divisionId,
    roles: staff.roles.map((r) => r.role),
    hodOfDepartmentIds: staff.hodOf.map((d) => d.id),
    headOfDivisionIds: staff.headOf.map((d) => d.id),
    mustChangePassword: staff.mustChangePassword,
  };
});

/**
 * The signed-in user, or a redirect to sign in. Someone signed in with a
 * temporary password can only reach the Account page (and its action) until
 * they choose their own password; this is enforced here, so it covers server
 * actions as well as pages.
 */
export async function requireUser(options: { allowPendingPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPendingPasswordChange) redirect("/account");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) forbidden();
  return user;
}
