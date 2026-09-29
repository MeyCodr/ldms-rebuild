import "server-only";
import { db } from "../db";
import { approverMap } from "./approver";

// Data checks on the org chart and staff list. These are the checks the phase 5
// migration will refuse to pass, so they are shown to admins from day one.

export type Check = {
  key: string;
  label: string;
  why: string;
  severity: "blocks" | "warns" | "info";
  count: number;
  items?: { label: string; href: string }[];
  href?: string;
};

export async function runDataChecks(): Promise<Check[]> {
  const [departments, divisions, noEmail, legacy, noPassword, approvers] = await Promise.all([
    db.department.findMany({ include: { hod: { select: { status: true } }, division: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.division.findMany({ include: { head: { select: { status: true } } }, orderBy: { name: "asc" } }),
    db.staff.count({ where: { status: "ACTIVE", email: null, designation: { in: ["MANAGER", "EXECUTIVE"] } } }),
    db.staff.count({ where: { status: "ACTIVE", legacyMd5: { not: null } } }),
    db.staff.count({ where: { status: "ACTIVE", legacyMd5: null, passwordHash: null } }),
    approverMap(),
  ]);

  const deptsWithoutHod = departments.filter((d) => !d.hod || d.hod.status !== "ACTIVE");
  const divisionsWithoutHead = divisions.filter((d) => !d.head || d.head.status !== "ACTIVE");
  const noApprover = [...approvers.values()].filter((r) => r.basis === "NONE" && r.reason === "NO_HOD").length;

  return [
    {
      key: "dept-hod",
      label: "Departments without an active HOD",
      why: "Staff in these departments have no one to approve their PME, TNA or skill matrix.",
      severity: "blocks",
      count: deptsWithoutHod.length,
      items: deptsWithoutHod.map((d) => ({ label: `${d.name} · ${d.division.name}`, href: `/organization/departments/${d.id}` })),
    },
    {
      key: "division-head",
      label: "Divisions without an active head",
      why: "Not used for approvals. Recorded so the org chart is complete.",
      severity: "info",
      count: divisionsWithoutHead.length,
      items: divisionsWithoutHead.map((d) => ({ label: d.name, href: `/organization#division-${d.id}` })),
    },
    {
      key: "no-approver",
      label: "Active staff with no approver",
      why: "Staff in departments without an active HOD, counted per person. HODs and division heads have no approver by design.",
      severity: "blocks",
      count: noApprover,
      href: "/staff?flag=no-approver",
    },
    {
      key: "no-email",
      label: "Managers and executives without email",
      why: "PME and attendance reminders are sent by email.",
      severity: "warns",
      count: noEmail,
      href: "/staff?flag=no-email",
    },
    {
      key: "no-password",
      label: "Active staff who cannot sign in",
      why: "No migrated password and no v2 password. Reset their password from the staff record.",
      severity: "warns",
      count: noPassword,
      href: "/staff?flag=no-password",
    },
    {
      key: "legacy-password",
      label: "Not signed in to v2 yet",
      why: "Still on the migrated MD5 password. It is upgraded automatically at their first sign-in.",
      severity: "info",
      count: legacy,
      href: "/staff?flag=legacy-password",
    },
  ];
}
