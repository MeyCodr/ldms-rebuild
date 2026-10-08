// Training Need Identification (phase 3, module 4). Pure functions.
//
// One list per department per year, kept by the department's HOD: where
// performance falls short of what is expected, and how the gap will be
// closed. There is no approval and there are no statuses: what the HOD saves
// is the record, and they can change it for as long as its year is open.
// The open year is the TNA's (tnaOpenYear in rules/tna.ts): the calendar
// year, or next year once L&D have opened it early. One switch moves both.
// Other years stay on record, view-only, and can be copied forward.
// L&D see every department's and can fill one in on a department's behalf,
// as the old system let them; a division head sees their division's.
//
// Decision 15 in docs/phase-3-plan.md §3, and module 4 in §8.

import type { Prisma } from "@prisma/client";
import { isAdmin, isDivisionHead, isHod, type SessionUser } from "../permissions";

/** A year from the URL, or null when it isn't one. */
export function parseTniYear(value: string | undefined): number | null {
  return /^20\d{2}$/.test(value ?? "") ? Number(value) : null;
}

/** Why a year's TNI can't be changed, or null when it is the open year. */
export function tniYearBlock(year: number, open: number): string | null {
  if (year === open) return null;
  if (year > open) return `${year}'s TNI isn't open yet. It opens on 1 Jan ${year}, or earlier if L&D open it.`;
  return `${year}'s TNI is closed, so it can only be viewed. Start ${open}'s from it to carry it forward.`;
}

export type TniDepartment = { id: number; name: string; divisionId: number };

/** What the signed-in person is to a department's TNI. */
export type TniViewer = {
  /** HOD of the department, or L&D on its behalf: fills it in. */
  canEdit: boolean;
  /** May open it: those, and the head of its division. */
  canView: boolean;
};

export function tniViewer(user: SessionUser, department: Pick<TniDepartment, "id" | "divisionId">): TniViewer {
  const canEdit = user.hodOfDepartmentIds.includes(department.id) || isAdmin(user);
  return { canEdit, canView: canEdit || user.headOfDivisionIds.includes(department.divisionId) };
}

/** Who has the TNI screen: HODs, division heads and L&D. */
export const seesTnis = (user: SessionUser) => isAdmin(user) || isHod(user) || isDivisionHead(user);

/** The departments whose TNI the user may open. Null: none. */
export function tniDepartmentScope(user: SessionUser): Prisma.DepartmentWhereInput | null {
  if (isAdmin(user)) return {};
  const or: Prisma.DepartmentWhereInput[] = [];
  if (isHod(user)) or.push({ id: { in: user.hodOfDepartmentIds } });
  if (isDivisionHead(user)) or.push({ divisionId: { in: user.headOfDivisionIds } });
  return or.length ? { OR: or } : null;
}

/** Why the person can't fill in or change a department's TNI for a year, or null when they can. */
export function tniEditBlock(department: Pick<TniDepartment, "name">, year: number, viewer: TniViewer, open: number): string | null {
  if (!viewer.canEdit) return `Only ${department.name}'s HOD, or L&D, fills in its TNI.`;
  return tniYearBlock(year, open);
}
