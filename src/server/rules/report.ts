// Training reports (module 6). Pure functions, so every report and its Excel
// export add up the same way:
//
//   - Hours come from trainingHours, and count only for an attendance that
//     countsTowardHours (completed, training not cancelled).
//   - A training belongs to the period it starts in.
//   - A person's hours go to the department they are in now.
//   - A department's total is the sum of its staff rows in the staff report.
//     Its average divides by the manpower headcount (isActiveHeadcount: active
//     and not a trainee), as the old system's HOD dashboard did.

import type { Designation, StaffStatus } from "@prisma/client";
import { isActiveHeadcount } from "./headcount";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The period a report covers, as YYYY-MM-DD: the dates given, or the current calendar year. */
export function reportPeriod(from: string | undefined, to: string | undefined, today: Date): { from: string; to: string; isDefault: boolean } {
  const year = today.getUTCFullYear();
  const start = from ?? `${year}-01-01`;
  const end = to ?? `${year}-12-31`;
  // An end before the start would show nothing without saying why: read it as one day.
  return { from: start, to: end < start ? start : end, isDefault: !from && !to };
}

/** One attendance that counts toward hours. */
export type CountedHours = { staffId: number; hours: number };

export type StaffTotal = { completed: number; hours: number };

/** Trainings completed and hours for each person with any. */
export function staffTotals(counted: CountedHours[]): Map<number, StaffTotal> {
  const totals = new Map<number, StaffTotal>();
  for (const c of counted) {
    const t = totals.get(c.staffId) ?? { completed: 0, hours: 0 };
    t.completed += 1;
    t.hours += c.hours;
    totals.set(c.staffId, t);
  }
  for (const t of totals.values()) t.hours = round2(t.hours);
  return totals;
}

/**
 * Who the staff report lists: everyone still employed (with 0 hours if they
 * have none, so gaps show), and anyone who has left but has hours in the
 * period (so those hours aren't lost from the totals).
 */
export function inStaffReport(staff: { status: StaffStatus }, total: StaffTotal | undefined): boolean {
  return staff.status === "ACTIVE" || (total?.completed ?? 0) > 0;
}

export type ReportStaffRow = { departmentId: number; status: StaffStatus; designation: Designation } & StaffTotal;

export type DepartmentTotal = {
  /** Manpower headcount: active and not a trainee. */
  headcount: number;
  /** Of the headcount, how many completed at least one training. */
  trained: number;
  completed: number;
  hours: number;
  /** Hours per head; null when there is no one to divide by. */
  average: number | null;
};

/** Each department's figures, from the staff report's rows. */
export function departmentTotals(rows: ReportStaffRow[]): Map<number, DepartmentTotal> {
  const totals = new Map<number, DepartmentTotal>();
  for (const r of rows) {
    const t = totals.get(r.departmentId) ?? { headcount: 0, trained: 0, completed: 0, hours: 0, average: null };
    if (isActiveHeadcount(r)) {
      t.headcount += 1;
      if (r.completed > 0) t.trained += 1;
    }
    t.completed += r.completed;
    t.hours += r.hours;
    totals.set(r.departmentId, t);
  }
  for (const t of totals.values()) {
    t.hours = round2(t.hours);
    t.average = t.headcount ? round2(t.hours / t.headcount) : null;
  }
  return totals;
}

/** The bottom line of a report: the same sums over all its rows. */
export function grandTotal(rows: { headcount: number; trained: number; completed: number; hours: number }[]): DepartmentTotal {
  const t = rows.reduce(
    (a, r) => ({ headcount: a.headcount + r.headcount, trained: a.trained + r.trained, completed: a.completed + r.completed, hours: a.hours + r.hours }),
    { headcount: 0, trained: 0, completed: 0, hours: 0 },
  );
  return { ...t, hours: round2(t.hours), average: t.headcount ? round2(t.hours / t.headcount) : null };
}

/** A person's completed trainings and hours for each year they have any, latest first. */
export function hoursByYear(counted: { year: number; hours: number }[]): { year: number; completed: number; hours: number }[] {
  const years = new Map<number, StaffTotal>();
  for (const c of counted) {
    const t = years.get(c.year) ?? { completed: 0, hours: 0 };
    t.completed += 1;
    t.hours += c.hours;
    years.set(c.year, t);
  }
  return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, t]) => ({ year, completed: t.completed, hours: round2(t.hours) }));
}
