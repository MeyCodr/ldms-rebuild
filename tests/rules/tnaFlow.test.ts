import { describe, expect, it } from "vitest";
import { cleanOptionName, parseTnaContent, tnaContentProblems, tnaGap, tnaSectionTitle, type TnaContent, type TnaRow } from "@/lib/forms/tna";
import type { SessionUser } from "@/server/permissions";
import {
  parseTnaYear,
  seesTeamTnas,
  tnaActionBlock,
  tnaDepartmentScope,
  tnaGradeName,
  tnaMyBlock,
  tnaOpenedEarly,
  tnaOpenYear,
  tnaOwnBlock,
  tnaStaffScope,
  tnaStage,
  tnaStartBlock,
  tnaTitle,
  tnaViewer,
  tnaYearBlock,
  type TnaOwner,
  type TnaState,
  type TnaStaff,
} from "@/server/rules/tna";

/** "Today" as the services pass it: Malaysia time shifted into UTC, any hour of the day. */
const today = (iso: string) => new Date(`${iso}T15:30:00Z`);
const NOW = 2026; // the open year

const STAMPING = 5;
const WELDING = 6;
const DIVISION = 2;

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  staffNo: "10003",
  name: "Someone",
  departmentId: STAMPING,
  departmentName: "Stamping",
  divisionId: DIVISION,
  roles: [],
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  designation: "EXECUTIVE",
  mustChangePassword: false,
  ...over,
});
const executive = user({ id: 20 });
const hod = user({ id: 30, designation: "MANAGER", hodOfDepartmentIds: [STAMPING] });
const otherHod = user({ id: 31, designation: "MANAGER", departmentId: WELDING, hodOfDepartmentIds: [WELDING] });
const head = user({ id: 40, designation: "MANAGER", headOfDivisionIds: [DIVISION] });
const clerk = user({ id: 50, designation: "NON_EXECUTIVE", roles: ["MAIN_CLERK"] });
const otherClerk = user({ id: 51, designation: "NON_EXECUTIVE", roles: ["MAIN_CLERK"], departmentId: WELDING });
const plainClerk = user({ id: 52, designation: "NON_EXECUTIVE", roles: ["CLERK"] });
const admin = user({ id: 60, departmentId: 10, divisionId: 9, roles: ["LD_ADMIN"] });

/** The executive's own TNA, and Stamping's for job grade 3. */
const own: TnaOwner = { staffId: executive.id, departmentId: STAMPING, divisionId: DIVISION, name: "Ahmad" };
const grade: TnaOwner = { staffId: null, departmentId: STAMPING, divisionId: DIVISION, name: tnaGradeName("Stamping", 3) };

const state = (status: TnaState["status"], owner: TnaOwner = own, year = 2026): TnaState => ({ year, status, owner });

describe("the TNA year", () => {
  it("is the calendar year today falls in", () => {
    expect(tnaOpenYear(today("2026-01-01"))).toBe(2026);
    expect(tnaOpenYear(today("2026-12-31"))).toBe(2026);
    expect(tnaOpenYear(today("2027-01-01"))).toBe(2027);
  });
  it("is next year once L&D have opened it early, and only next year", () => {
    expect(tnaOpenYear(today("2026-11-15"), 2027)).toBe(2027);
    expect(tnaOpenedEarly(today("2026-11-15"), 2027)).toBe(true);
    // The setting still says 2026, or was never set: the calendar year.
    expect(tnaOpenYear(today("2026-11-15"), 2026)).toBe(2026);
    expect(tnaOpenYear(today("2026-11-15"), null)).toBe(2026);
    expect(tnaOpenedEarly(today("2026-11-15"), 2026)).toBe(false);
    // A year that isn't next year is ignored: nobody can open 2028 in 2026, and an old setting doesn't hold a year back.
    expect(tnaOpenYear(today("2026-11-15"), 2028)).toBe(2026);
    expect(tnaOpenYear(today("2027-01-01"), 2026)).toBe(2027);
    // On 1 January the year opened early is simply the year.
    expect(tnaOpenYear(today("2027-01-01"), 2027)).toBe(2027);
    expect(tnaOpenedEarly(today("2027-01-01"), 2027)).toBe(false);
  });
  it("lets only the open year be filled in", () => {
    expect(tnaYearBlock(2026, 2026)).toBeNull();
    expect(tnaYearBlock(2025, 2026)).toBe("2025's TNAs are closed, so they can only be viewed. Start 2026's from it to carry it forward.");
    expect(tnaYearBlock(2027, 2026)).toBe("2027's TNAs aren't open yet. They open on 1 Jan 2027, or earlier if L&D open them.");
    // Opened early: this year's close at the same moment.
    expect(tnaYearBlock(2027, 2027)).toBeNull();
    expect(tnaYearBlock(2026, 2027)).toMatch(/2026's TNAs are closed/);
  });
  it("reads a year from the URL", () => {
    expect(parseTnaYear("2025")).toBe(2025);
    for (const bad of [undefined, "", "25", "1999", "2025x", "20255"]) expect(parseTnaYear(bad)).toBeNull();
  });
});

describe("who is what to a TNA", () => {
  it("has the person fill in their own, and their department's HOD approve it", () => {
    expect(tnaViewer(executive, own)).toEqual({ isOwner: true, canFill: true, isApprover: false, isAdmin: false, canView: true });
    expect(tnaViewer(hod, own)).toEqual({ isOwner: false, canFill: false, isApprover: true, isAdmin: false, canView: true });
  });
  it("has the department's main clerk fill in a job grade's, but not a person's", () => {
    expect(tnaViewer(clerk, grade)).toMatchObject({ canFill: true, isApprover: false, canView: true });
    expect(tnaViewer(clerk, own)).toMatchObject({ canFill: false, canView: false });
    expect(tnaViewer(otherClerk, grade)).toMatchObject({ canFill: false, canView: false });
    expect(tnaViewer(plainClerk, grade)).toMatchObject({ canFill: false, canView: false });
  });
  it("has a main clerk who is the department's HOD approve, not fill in", () => {
    const both = user({ id: 70, roles: ["MAIN_CLERK"], hodOfDepartmentIds: [STAMPING] });
    expect(tnaViewer(both, grade)).toMatchObject({ canFill: false, isApprover: true });
  });
  it("lets L&D fill in any, approve it as the HOD can, and reopen", () => {
    for (const owner of [own, grade]) expect(tnaViewer(admin, owner)).toEqual({ isOwner: false, canFill: true, isApprover: true, isAdmin: true, canView: true });
    // ... but not their own.
    expect(tnaViewer(admin, { ...own, staffId: admin.id })).toMatchObject({ isOwner: true, canFill: true, isApprover: false });
  });
  it("lets the division head look, and keeps other departments and other staff out", () => {
    expect(tnaViewer(head, own)).toEqual({ isOwner: false, canFill: false, isApprover: false, isAdmin: false, canView: true });
    expect(tnaViewer(otherHod, own).canView).toBe(false);
    expect(tnaViewer(user({ id: 21 }), own).canView).toBe(false);
  });
  it("never has someone approve their own", () => {
    const self = user({ id: executive.id, hodOfDepartmentIds: [STAMPING] });
    expect(tnaViewer(self, own)).toMatchObject({ isOwner: true, isApprover: false });
  });
  it("gives the Team screen to L&D, HODs, division heads and main clerks only", () => {
    for (const u of [admin, hod, head, clerk]) expect(seesTeamTnas(u)).toBe(true);
    for (const u of [executive, plainClerk]) expect(seesTeamTnas(u)).toBe(false);
  });
  it("scopes the lists: people by HOD and division, job grades also by the clerk's department", () => {
    expect(tnaStaffScope(admin)).toEqual({});
    expect(tnaStaffScope(hod)).toEqual({ OR: [{ departmentId: { in: [STAMPING] } }] });
    expect(tnaStaffScope(head)).toEqual({ OR: [{ department: { divisionId: { in: [DIVISION] } } }] });
    expect(tnaStaffScope(clerk)).toBeNull();
    expect(tnaDepartmentScope(clerk)).toEqual({ OR: [{ id: { in: [STAMPING] } }] });
    expect(tnaDepartmentScope(executive)).toBeNull();
    expect(tnaDepartmentScope(admin)).toEqual({});
  });
  it("names a TNA in a sentence", () => {
    expect(tnaTitle(own)).toBe("Ahmad's TNA");
    expect(tnaTitle(grade)).toBe("the TNA for Stamping, job grade 3");
  });
});

describe("who has a TNA of their own", () => {
  const staff = (over: Partial<TnaStaff> = {}): TnaStaff & { name: string } => ({
    name: "Siti",
    status: "ACTIVE",
    designation: "NON_EXECUTIVE",
    jobGrade: null,
    fillsOwnTna: false,
    isHead: false,
    ...over,
  });
  it("says why someone has none, to others and to the person", () => {
    expect(tnaOwnBlock(staff({ designation: "EXECUTIVE" }))).toBeNull();
    expect(tnaOwnBlock(staff({ fillsOwnTna: true }))).toBeNull();
    expect(tnaOwnBlock(staff({ jobGrade: 2 }))).toMatch(/Siti's training needs are in their department's TNA for job grade 2/);
    expect(tnaOwnBlock(staff())).toMatch(/Siti has no job grade yet/);
    expect(tnaOwnBlock(staff({ designation: "MANAGER", isHead: true }))).toMatch(/HODs and division heads/);
    expect(tnaOwnBlock(staff({ designation: "EXECUTIVE", status: "RESIGNED" }))).toBe("Siti has resigned.");
    expect(tnaMyBlock(staff({ designation: "MANAGER" }))).toBeNull();
    expect(tnaMyBlock(staff({ jobGrade: 4 }))).toMatch(/^Your training needs are in your department's TNA for job grade 4/);
    expect(tnaMyBlock(staff())).toMatch(/^You have no job grade on record yet/);
  });
});

describe("starting a TNA", () => {
  const me = tnaViewer(executive, own);
  it("is for whoever fills it in, this year, once", () => {
    expect(tnaStartBlock(own, me, null, false, 2026, NOW)).toBeNull();
    expect(tnaStartBlock(grade, tnaViewer(clerk, grade), null, false, 2026, NOW)).toBeNull();
    expect(tnaStartBlock(own, tnaViewer(admin, own), null, false, 2026, NOW)).toBeNull();
    expect(tnaStartBlock(own, me, null, true, 2026, NOW)).toBe("There is already a TNA for Ahmad for 2026. There is one per year.");
    expect(tnaStartBlock(own, me, null, false, 2025, NOW)).toMatch(/2025's TNAs are closed/);
    expect(tnaStartBlock(own, me, null, false, 2027, NOW)).toMatch(/2027's TNAs aren't open yet/);
  });
  it("is refused to the HOD, and to anyone when the owner can't have one", () => {
    expect(tnaStartBlock(own, tnaViewer(hod, own), null, false, 2026, NOW)).toBe("You don't fill in Ahmad's TNA.");
    expect(tnaStartBlock(grade, tnaViewer(hod, grade), null, false, 2026, NOW)).toBe("You don't fill in the TNA for Stamping, job grade 3. The department's main clerk does.");
    expect(tnaStartBlock(grade, tnaViewer(clerk, grade), "No one in Stamping is covered by job grade 3.", false, 2026, NOW)).toBe("No one in Stamping is covered by job grade 3.");
  });
});

describe("the steps of a TNA", () => {
  const me = tnaViewer(executive, own);
  const approver = tnaViewer(hod, own);
  const ld = tnaViewer(admin, own);
  const looker = tnaViewer(head, own);

  it("lets whoever fills it in change, submit or delete a draft", () => {
    for (const action of ["EDIT", "SUBMIT", "DELETE"] as const) {
      expect(tnaActionBlock(action, state("DRAFT"), me, NOW)).toBeNull();
      expect(tnaActionBlock(action, state("DRAFT"), ld, NOW)).toBeNull();
      expect(tnaActionBlock(action, state("DRAFT", grade), tnaViewer(clerk, grade), NOW)).toBeNull();
      expect(tnaActionBlock(action, state("DRAFT"), looker, NOW)).toBe("You don't fill in Ahmad's TNA.");
    }
    expect(tnaActionBlock("EDIT", state("DRAFT"), approver, NOW)).toBe("This TNA hasn't been submitted yet. You can change it once it is.");
    expect(tnaActionBlock("APPROVE", state("DRAFT"), approver, NOW)).toBe("This TNA hasn't been submitted yet.");
    expect(tnaActionBlock("SEND_BACK", state("DRAFT"), approver, NOW)).toBe("This TNA hasn't been submitted yet.");
  });
  it("hands a submitted one to the HOD, who may change it, approve it or send it back", () => {
    for (const action of ["EDIT", "APPROVE", "SEND_BACK"] as const) expect(tnaActionBlock(action, state("SUBMITTED"), approver, NOW)).toBeNull();
    expect(tnaActionBlock("EDIT", state("SUBMITTED"), me, NOW)).toBe("This TNA is with the HOD for approval. It can be changed only if they send it back.");
    expect(tnaActionBlock("SUBMIT", state("SUBMITTED"), me, NOW)).toBe("This TNA is already with the HOD.");
    expect(tnaActionBlock("DELETE", state("SUBMITTED"), me, NOW)).toBe("This TNA has been sent to the HOD, so it stays on record.");
    // L&D may do the same, as in the old system.
    for (const action of ["EDIT", "APPROVE", "SEND_BACK"] as const) expect(tnaActionBlock(action, state("SUBMITTED"), ld, NOW)).toBeNull();
    expect(tnaActionBlock("APPROVE", state("SUBMITTED"), me, NOW)).toBe("Only the department's HOD or L&D can approve a TNA.");
    expect(tnaActionBlock("APPROVE", state("SUBMITTED"), looker, NOW)).toBe("Only the department's HOD or L&D can approve a TNA.");
    expect(tnaActionBlock("SEND_BACK", state("SUBMITTED"), looker, NOW)).toBe("Only the department's HOD or L&D can send a TNA back.");
  });
  it("locks an approved one for everyone but L&D, who reopen it", () => {
    expect(tnaActionBlock("EDIT", state("APPROVED"), me, NOW)).toBe("This TNA is approved, so it can't be changed. L&D can reopen it.");
    expect(tnaActionBlock("EDIT", state("APPROVED"), approver, NOW)).toMatch(/L&D can reopen it/);
    expect(tnaActionBlock("EDIT", state("APPROVED"), ld, NOW)).toBe("This TNA is approved. Reopen it to change it.");
    for (const action of ["SUBMIT", "DELETE", "APPROVE", "SEND_BACK"] as const) expect(tnaActionBlock(action, state("APPROVED"), action === "SUBMIT" || action === "DELETE" ? me : approver, NOW)).toBe("This TNA is already approved.");
    expect(tnaActionBlock("REOPEN", state("APPROVED"), ld, NOW)).toBeNull();
    expect(tnaActionBlock("REOPEN", state("APPROVED"), approver, NOW)).toBe("Only L&D can reopen an approved TNA.");
    expect(tnaActionBlock("REOPEN", state("APPROVED"), me, NOW)).toBe("Only L&D can reopen an approved TNA.");
    expect(tnaActionBlock("REOPEN", state("SUBMITTED"), ld, NOW)).toBe("Only an approved TNA needs reopening.");
  });
  it("keeps an earlier year view-only, except that the HOD can still approve what was submitted", () => {
    for (const action of ["EDIT", "SUBMIT", "DELETE"] as const) expect(tnaActionBlock(action, state("DRAFT", own, 2025), me, NOW)).toMatch(/2025's TNAs are closed/);
    expect(tnaActionBlock("EDIT", state("SUBMITTED", own, 2025), approver, NOW)).toMatch(/2025's TNAs are closed/);
    expect(tnaActionBlock("APPROVE", state("SUBMITTED", own, 2025), approver, NOW)).toBeNull();
    expect(tnaActionBlock("SEND_BACK", state("SUBMITTED", own, 2025), approver, NOW)).toBe("2025's TNAs are closed, so this one can no longer be changed. You can still approve it.");
    expect(tnaActionBlock("REOPEN", state("APPROVED", own, 2025), ld, NOW)).toMatch(/2025's TNAs are closed/);
  });
  it("says where a TNA stands", () => {
    expect(tnaStage(null)).toBe("NOT_STARTED");
    expect(tnaStage({ status: "DRAFT", returnReason: null })).toBe("DRAFT");
    expect(tnaStage({ status: "DRAFT", returnReason: "Add the forklift course" })).toBe("RETURNED");
    expect(tnaStage({ status: "SUBMITTED", returnReason: null })).toBe("SUBMITTED");
    expect(tnaStage({ status: "APPROVED", returnReason: null })).toBe("APPROVED");
  });
});

describe("the TNA form", () => {
  const row = (over: Partial<TnaRow> = {}): TnaRow => ({
    section: "ESG",
    problem: "Scrap isn't sorted at the line",
    optionId: 7,
    trainingName: "",
    target: 4,
    current: 2,
    method: "EXTERNAL_INHOUSE",
    month: 3,
    ...over,
  });
  const json = (rows: unknown) => JSON.stringify(rows);

  it("works out the gap: target minus current", () => {
    expect(tnaGap(4, 2)).toBe(2);
    expect(tnaGap(3, 3)).toBe(0);
    expect(tnaGap(null, 2)).toBeNull();
    expect(tnaGap(4, null)).toBeNull();
  });
  it("letters its headings a to g", () => {
    expect(tnaSectionTitle("ESG")).toBe("a. ESG");
    expect(tnaSectionTitle("FUNCTIONAL")).toBe("e. Functional awareness");
    expect(tnaSectionTitle("SPECIAL_PROJECT")).toBe("g. Special project");
  });
  it("tidies what the form sends: trims, drops blank rows, puts headings in order", () => {
    const blank = row({ section: "DIGITAL", problem: "  ", optionId: null, target: null, current: null, method: null, month: null });
    const parsed = parseTnaContent(json([row({ section: "SPECIAL_PROJECT", optionId: null, trainingName: "  Kaizen   week " }), blank, row({ problem: " Scrap " })]));
    expect(parsed).toEqual([row({ problem: "Scrap" }), row({ section: "SPECIAL_PROJECT", optionId: null, trainingName: "Kaizen week" })]);
  });
  it("ignores a typed name when an option is chosen: the list's name is used", () => {
    expect(parseTnaContent(json([row({ trainingName: "Something else" })]))![0].trainingName).toBe("");
  });
  it("refuses anything that isn't the form's shape", () => {
    for (const bad of ["", "{}", "[1]", json([{ ...row(), section: "OTHER" }]), json([row({ target: 6 })]), json([row({ current: 0 })]), json([row({ month: 13 })]), json([{ ...row(), method: "SEMINAR" }]), json([row({ optionId: -1 })]), json([{ ...row(), problem: 5 }])])
      expect(parseTnaContent(bad)).toBeNull();
  });

  const problems = (content: TnaContent, mode: "draft" | "submit") => tnaContentProblems(content, mode).map((p) => p.message);
  it("needs at least one row, even for a draft", () => {
    expect(tnaContentProblems([], "draft")).toEqual([{ at: "form", message: "Add at least one training need before saving." }]);
  });
  it("lets a draft be unfinished, and a submitted one not", () => {
    const partial = [row({ optionId: null, target: null, month: null })];
    expect(problems(partial, "draft")).toEqual([]);
    expect(problems(partial, "submit")).toEqual(["Fill in the training required, the target skill and when."]);
    expect(problems([row({ problem: "" })], "submit")).toEqual(["Fill in the problem statement."]);
    expect(problems([row(), row({ section: "SPECIAL_PROJECT", optionId: null, trainingName: "Kaizen week" })], "submit")).toEqual([]);
    expect(tnaContentProblems([row(), row({ method: null })], "submit")[0].at).toEqual({ row: 1 });
  });
  it("doesn't need every heading: one row anywhere is enough to submit", () => {
    expect(problems([row({ section: "DATA_DRIVEN" })], "submit")).toEqual([]);
  });
  it("limits a heading's rows and the lengths", () => {
    expect(tnaContentProblems(Array.from({ length: 21 }, () => row()), "draft")).toEqual([{ at: { section: "ESG" }, message: "At most 20 rows in a section." }]);
    expect(problems([row({ problem: "x".repeat(1001) })], "draft")).toEqual(["Keep the problem statement under 1000 characters."]);
    expect(problems([row({ optionId: null, trainingName: "x".repeat(256) })], "draft")).toEqual(["Keep the training's name under 255 characters."]);
  });
});

describe("a training option's name", () => {
  it("is stored in capitals with single spaces", () => {
    expect(cleanOptionName("  forklift   safety ")).toEqual({ name: "FORKLIFT SAFETY", error: null });
    expect(cleanOptionName("5S & Kaizen's basics")).toEqual({ name: "5S & KAIZEN'S BASICS", error: null });
  });
  it("can't be empty, too long, or Others", () => {
    expect(cleanOptionName("   ").error).toBe("Give it a name");
    expect(cleanOptionName("x".repeat(256)).error).toBe("At most 255 characters");
    expect(cleanOptionName("others").error).toBe("Others is on every list already");
  });
});
