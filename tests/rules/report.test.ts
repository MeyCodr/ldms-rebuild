import { describe, expect, it } from "vitest";
import { can, reportDepartmentScope, reportStaffScope, type SessionUser } from "@/server/permissions";
import { departmentTotals, grandTotal, hoursByYear, inStaffReport, reportPeriod, staffTotals, type ReportStaffRow } from "@/server/rules/report";

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  staffNo: "10001",
  name: "Someone",
  departmentId: 5,
  departmentName: "Stamping",
  divisionId: 1,
  roles: [],
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  mustChangePassword: false,
  ...over,
});

describe("who sees reports", () => {
  it("gives L&D every department", () => {
    const admin = user({ roles: ["LD_ADMIN"] });
    expect(can(admin, "report.view")).toBe(true);
    expect(reportStaffScope(admin)).toEqual({});
    expect(reportDepartmentScope(admin)).toEqual({});
  });
  it("gives a HOD their departments and a division head their divisions", () => {
    const hod = user({ hodOfDepartmentIds: [5, 6] });
    expect(reportStaffScope(hod)).toEqual({ OR: [{ departmentId: { in: [5, 6] } }] });
    expect(reportDepartmentScope(hod)).toEqual({ OR: [{ id: { in: [5, 6] } }] });
    const head = user({ headOfDivisionIds: [2] });
    expect(reportStaffScope(head)).toEqual({ OR: [{ department: { divisionId: { in: [2] } } }] });
    expect(reportDepartmentScope(head)).toEqual({ OR: [{ divisionId: { in: [2] } }] });
  });
  it("gives clerks and plain staff none", () => {
    for (const u of [user({ roles: ["CLERK"] }), user({ roles: ["MAIN_CLERK"] }), user()]) {
      expect(can(u, "report.view")).toBe(false);
      expect(reportStaffScope(u)).toBeNull();
      expect(reportDepartmentScope(u)).toBeNull();
    }
  });
});

describe("reportPeriod", () => {
  const today = new Date("2026-10-06T03:00:00Z");
  it("is the current calendar year unless dates are given", () => {
    expect(reportPeriod(undefined, undefined, today)).toEqual({ from: "2026-01-01", to: "2026-12-31", isDefault: true });
    expect(reportPeriod("2025-07-01", undefined, today)).toEqual({ from: "2025-07-01", to: "2026-12-31", isDefault: false });
    expect(reportPeriod("2025-01-01", "2025-06-30", today)).toEqual({ from: "2025-01-01", to: "2025-06-30", isDefault: false });
  });
  it("reads an end before the start as one day", () => {
    expect(reportPeriod("2026-05-10", "2026-05-01", today)).toMatchObject({ from: "2026-05-10", to: "2026-05-10" });
  });
});

describe("staffTotals", () => {
  it("adds up each person's completed trainings and hours", () => {
    const totals = staffTotals([
      { staffId: 1, hours: 9 },
      { staffId: 1, hours: 3.5 },
      { staffId: 2, hours: 0.1 },
      { staffId: 2, hours: 0.2 },
    ]);
    expect(totals.get(1)).toEqual({ completed: 2, hours: 12.5 });
    expect(totals.get(2)).toEqual({ completed: 2, hours: 0.3 }); // not 0.30000000000000004
    expect(totals.get(3)).toBeUndefined();
  });
});

describe("inStaffReport", () => {
  it("lists everyone still employed, hours or not", () => {
    expect(inStaffReport({ status: "ACTIVE" }, undefined)).toBe(true);
  });
  it("lists someone who has left only when they have hours in the period", () => {
    expect(inStaffReport({ status: "RESIGNED" }, undefined)).toBe(false);
    expect(inStaffReport({ status: "RESIGNED" }, { completed: 1, hours: 4 })).toBe(true);
  });
});

describe("departmentTotals", () => {
  const row = (departmentId: number, completed: number, hours: number, over: Partial<ReportStaffRow> = {}): ReportStaffRow => ({
    departmentId,
    status: "ACTIVE",
    designation: "NON_EXECUTIVE",
    completed,
    hours,
    ...over,
  });
  const rows = [
    row(5, 2, 12.5),
    row(5, 0, 0),
    row(5, 1, 4, { designation: "TRAINEE" }), // hours count, not in the headcount
    row(5, 1, 9, { status: "RESIGNED" }), // hours count, not in the headcount
    row(6, 1, 3),
    row(7, 0, 0, { designation: "TRAINEE" }), // a department of trainees only
  ];
  const totals = departmentTotals(rows);

  it("counts the manpower headcount and who of them trained", () => {
    expect(totals.get(5)).toMatchObject({ headcount: 2, trained: 1 });
    expect(totals.get(6)).toMatchObject({ headcount: 1, trained: 1 });
  });
  it("totals every row's hours, and averages them over the headcount", () => {
    expect(totals.get(5)).toMatchObject({ completed: 4, hours: 25.5, average: 12.75 });
    expect(totals.get(6)).toMatchObject({ completed: 1, hours: 3, average: 3 });
  });
  it("has no average where there is no one to divide by", () => {
    expect(totals.get(7)).toEqual({ headcount: 0, trained: 0, completed: 0, hours: 0, average: null });
  });
  it("adds up: staff rows, department totals and the grand total agree", () => {
    const staffHours = rows.reduce((a, r) => a + r.hours, 0);
    const all = grandTotal([...totals.values()]);
    expect(all.hours).toBe(staffHours);
    expect(all.completed).toBe(rows.reduce((a, r) => a + r.completed, 0));
    expect(all).toMatchObject({ headcount: 3, trained: 2, average: 9.5 });
  });
});

describe("hoursByYear", () => {
  it("groups by year, latest first", () => {
    expect(
      hoursByYear([
        { year: 2025, hours: 4 },
        { year: 2026, hours: 9 },
        { year: 2026, hours: 3.5 },
      ]),
    ).toEqual([
      { year: 2026, completed: 2, hours: 12.5 },
      { year: 2025, completed: 1, hours: 4 },
    ]);
    expect(hoursByYear([])).toEqual([]);
  });
});
