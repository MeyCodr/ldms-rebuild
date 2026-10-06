import "server-only";
import { db } from "../db";
import { resolveApprover, type ApproverResult } from "../rules/approver";
import { approverInput, approverStaffSelect } from "./pmeSync";

const approverSelect = approverStaffSelect;
const toInput = approverInput;

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
