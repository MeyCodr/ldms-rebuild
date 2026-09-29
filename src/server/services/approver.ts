import "server-only";
import { db } from "../db";
import { resolveApprover, type ApproverResult } from "../rules/approver";

const approverSelect = {
  id: true,
  _count: { select: { hodOf: true } },
  department: {
    select: {
      hodId: true,
      hod: { select: { status: true } },
      division: { select: { headId: true } },
    },
  },
} as const;

type StaffForApprover = {
  id: number;
  _count: { hodOf: number };
  department: { hodId: number | null; hod: { status: string } | null; division: { headId: number | null } };
};

function toInput(s: StaffForApprover) {
  return {
    staffId: s.id,
    isHodAnywhere: s._count.hodOf > 0,
    department: {
      hodId: s.department.hodId,
      hodActive: s.department.hod?.status === "ACTIVE",
      division: { headId: s.department.division.headId },
    },
  };
}

export async function approverFor(staffId: number): Promise<(ApproverResult & { approver?: { id: number; name: string; staffNo: string } }) | null> {
  const staff = await db.staff.findUnique({ where: { id: staffId }, select: approverSelect });
  if (!staff) return null;
  const result = resolveApprover(toInput(staff));
  if (result.approverId === null) return result;
  const approver = await db.staff.findUnique({ where: { id: result.approverId }, select: { id: true, name: true, staffNo: true } });
  return { ...result, approver: approver ?? undefined };
}

/** Resolves the approver for every active staff member in one pass. */
export async function approverMap(): Promise<Map<number, ApproverResult>> {
  const staff = await db.staff.findMany({ where: { status: "ACTIVE" }, select: approverSelect });
  return new Map(staff.map((s) => [s.id, resolveApprover(toInput(s))]));
}

/** Active staff whose approver resolves to this person. */
export async function approvesCount(staffId: number): Promise<number> {
  const map = await approverMap();
  let n = 0;
  for (const r of map.values()) if (r.approverId === staffId) n++;
  return n;
}
