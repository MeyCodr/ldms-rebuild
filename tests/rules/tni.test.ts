import { describe, expect, it } from "vitest";
import { parseTniContent, tniContentProblems, type TniRow } from "@/lib/forms/tni";
import type { SessionUser } from "@/server/permissions";
import { parseTniYear, seesTnis, tniDepartmentScope, tniEditBlock, tniOpenYear, tniViewer, tniYearBlock } from "@/server/rules/tni";

/** "Today" as the services pass it: Malaysia time shifted into UTC, any hour of the day. */
const today = (iso: string) => new Date(`${iso}T15:30:00Z`);
const NOW = today("2026-10-07"); // 2026 is open

const STAMPING = { id: 5, name: "Stamping", divisionId: 2 };

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  staffNo: "10003",
  name: "Someone",
  departmentId: STAMPING.id,
  departmentName: "Stamping",
  divisionId: 2,
  roles: [],
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  designation: "EXECUTIVE",
  mustChangePassword: false,
  ...over,
});
const hod = user({ id: 30, designation: "MANAGER", hodOfDepartmentIds: [STAMPING.id] });
const otherHod = user({ id: 31, designation: "MANAGER", departmentId: 6, hodOfDepartmentIds: [6] });
const head = user({ id: 40, designation: "MANAGER", headOfDivisionIds: [2] });
const admin = user({ id: 60, departmentId: 10, divisionId: 9, roles: ["LD_ADMIN"] });
const clerk = user({ id: 50, roles: ["MAIN_CLERK"] });

describe("the TNI year", () => {
  it("is the calendar year today falls in, and only it can be changed", () => {
    expect(tniOpenYear(today("2026-12-31"))).toBe(2026);
    expect(tniOpenYear(today("2027-01-01"))).toBe(2027);
    expect(tniYearBlock(2026, NOW)).toBeNull();
    expect(tniYearBlock(2025, NOW)).toBe("2025 has ended, so its TNI can only be viewed. Start 2026's from it to carry it forward.");
    expect(tniYearBlock(2027, NOW)).toBe("2027's TNI is filled in from 1 Jan 2027.");
  });
  it("reads a year from the URL", () => {
    expect(parseTniYear("2025")).toBe(2025);
    for (const bad of [undefined, "", "25", "1999", "2025x"]) expect(parseTniYear(bad)).toBeNull();
  });
});

describe("who is what to a department's TNI", () => {
  it("has the department's HOD fill it in", () => {
    expect(tniViewer(hod, STAMPING)).toEqual({ canEdit: true, canView: true });
    expect(tniEditBlock(STAMPING, 2026, tniViewer(hod, STAMPING), NOW)).toBeNull();
  });
  it("lets L&D and the division head look, not change", () => {
    for (const u of [admin, head]) {
      expect(tniViewer(u, STAMPING)).toEqual({ canEdit: false, canView: true });
      expect(tniEditBlock(STAMPING, 2026, tniViewer(u, STAMPING), NOW)).toBe("Only Stamping's HOD fills in its TNI.");
    }
  });
  it("keeps other HODs, clerks and plain staff out", () => {
    for (const u of [otherHod, clerk, user()]) expect(tniViewer(u, STAMPING)).toEqual({ canEdit: false, canView: false });
  });
  it("keeps an earlier year view-only, even for the HOD", () => {
    expect(tniEditBlock(STAMPING, 2025, tniViewer(hod, STAMPING), NOW)).toMatch(/2025 has ended/);
  });
  it("gives the screen to HODs, division heads and L&D only, each with their departments", () => {
    for (const u of [hod, head, admin]) expect(seesTnis(u)).toBe(true);
    for (const u of [clerk, user()]) expect(seesTnis(u)).toBe(false);
    expect(tniDepartmentScope(admin)).toEqual({});
    expect(tniDepartmentScope(hod)).toEqual({ OR: [{ id: { in: [STAMPING.id] } }] });
    expect(tniDepartmentScope(head)).toEqual({ OR: [{ divisionId: { in: [2] } }] });
    expect(tniDepartmentScope(clerk)).toBeNull();
  });
});

describe("the TNI form", () => {
  const row = (over: Partial<TniRow> = {}): TniRow => ({
    indicator: "Changeover time",
    expected: 4,
    actual: 2,
    causes: "No standard work",
    ask: "Skill",
    method: "COACHING",
    evaluation: "Changeover under 20 minutes",
    ...over,
  });
  const json = (rows: unknown) => JSON.stringify(rows);
  const problems = (rows: TniRow[]) => tniContentProblems(rows).map((p) => p.message);

  it("tidies what the form sends: trims, and drops blank rows", () => {
    const blank = row({ indicator: "  ", expected: null, actual: null, causes: "", ask: " ", method: null, evaluation: "" });
    expect(parseTniContent(json([row({ indicator: "  Changeover   time " }), blank]))).toEqual([row()]);
  });
  it("refuses anything that isn't the form's shape", () => {
    for (const bad of ["", "{}", "[1]", json([row({ expected: 6 })]), json([row({ actual: 0 })]), json([{ ...row(), method: "SEMINAR" }]), json([{ ...row(), causes: 5 }])]) expect(parseTniContent(bad)).toBeNull();
  });
  it("needs at least one row, and every row complete: there are no drafts", () => {
    expect(tniContentProblems([])).toEqual([{ at: "form", message: "Add at least one performance indicator before saving." }]);
    expect(problems([row()])).toEqual([]);
    expect(problems([row({ expected: null, method: null })])).toEqual(["Fill in the expected performance and the L&D method."]);
    expect(problems([row({ evaluation: "" })])).toEqual(["Fill in the evaluation method."]);
    expect(tniContentProblems([row(), row({ causes: "" })])[0].at).toEqual({ row: 1 });
  });
  it("limits the rows and the lengths", () => {
    expect(tniContentProblems(Array.from({ length: 51 }, () => row()))).toEqual([{ at: "form", message: "At most 50 rows." }]);
    expect(problems([row({ indicator: "x".repeat(1001) })])).toEqual(["Keep the performance indicator under 1000 characters."]);
    expect(problems([row({ causes: "x".repeat(501) })])).toEqual(["Keep the possible causes under 500 characters."]);
  });
});
