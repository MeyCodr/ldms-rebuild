import { describe, expect, it } from "vitest";
import { canManageStaffRecord, can, hasExtraAccess, type ManagedStaff, type SessionUser } from "@/server/permissions";
import { ojtStaffBlock } from "@/server/rules/ojt";
import { tnaKind, tnaKindLabel, type TnaStaff } from "@/server/rules/tna";

const staff = (over: Partial<TnaStaff> = {}): TnaStaff => ({
  status: "ACTIVE",
  designation: "NON_EXECUTIVE",
  jobGrade: null,
  fillsOwnTna: false,
  isHead: false,
  ...over,
});

describe("tnaKind", () => {
  it("has executives and managers fill in their own", () => {
    expect(tnaKind(staff({ designation: "EXECUTIVE" }))).toBe("OWN");
    expect(tnaKind(staff({ designation: "MANAGER", jobGrade: 3 }))).toBe("OWN");
  });
  it("has a non-executive fill in their own only when L&D ticked it", () => {
    expect(tnaKind(staff({ fillsOwnTna: true, jobGrade: 2 }))).toBe("OWN");
    expect(tnaKind(staff({ designation: "CONTRACT", fillsOwnTna: true }))).toBe("OWN");
  });
  it("covers everyone else by their job grade, when they have one", () => {
    expect(tnaKind(staff({ jobGrade: 2 }))).toBe("BY_GRADE");
    expect(tnaKind(staff({ designation: "CONTRACT", jobGrade: 1 }))).toBe("BY_GRADE");
    expect(tnaKind(staff())).toBe("NONE");
  });
  it("gives HODs, division heads and leavers none", () => {
    expect(tnaKind(staff({ designation: "MANAGER", isHead: true }))).toBe("NONE");
    expect(tnaKind(staff({ designation: "EXECUTIVE", status: "RESIGNED" }))).toBe("NONE");
  });
  it("says so in words", () => {
    expect(tnaKindLabel(staff({ designation: "EXECUTIVE" }))).toBe("Fills in their own");
    expect(tnaKindLabel(staff({ fillsOwnTna: true }))).toBe("Fills in their own (set by L&D)");
    expect(tnaKindLabel(staff({ jobGrade: 4 }))).toBe("By job grade 4, for the department");
    expect(tnaKindLabel(staff())).toBe("None until a job grade is set");
    expect(tnaKindLabel(staff({ designation: "MANAGER", isHead: true }))).toMatch(/HODs and division heads/);
  });
});

describe("the Skill matrix evaluator role", () => {
  const user = (roles: SessionUser["roles"]): SessionUser => ({
    id: 1,
    staffNo: "10003",
    name: "Someone",
    departmentId: 5,
    departmentName: "Stamping",
    divisionId: 1,
    roles,
    hodOfDepartmentIds: [],
    headOfDivisionIds: [],
    designation: "NON_EXECUTIVE",
    mustChangePassword: false,
  });
  const leader: ManagedStaff = { designation: "CONTRACT", roles: [{ role: "SKILL_EVALUATOR" }], hodOf: [], headOf: [] };

  it("lets its holder, the main clerk and L&D fill in skill matrices; not a clerk or plain staff", () => {
    expect(can(user(["SKILL_EVALUATOR"]), "skill.evaluate")).toBe(true);
    expect(can(user(["MAIN_CLERK"]), "skill.evaluate")).toBe(true);
    expect(can(user(["LD_ADMIN"]), "skill.evaluate")).toBe(true);
    expect(can(user(["CLERK"]), "skill.evaluate")).toBe(false);
    expect(can(user([]), "skill.evaluate")).toBe(false);
  });
  it("gives nothing else: no staff list, trainings or reports", () => {
    const evaluator = user(["SKILL_EVALUATOR"]);
    for (const p of ["staff.view", "staff.manage", "training.view", "ojt.manage", "report.view", "audit.view"] as const) expect(can(evaluator, p)).toBe(false);
  });
  it("isn't extra access: clerks still look after a contract line leader who holds it", () => {
    expect(hasExtraAccess(leader)).toBe(false);
    expect(canManageStaffRecord(user(["CLERK"]), leader)).toBe(true);
    expect(ojtStaffBlock(user(["CLERK"]), { ...leader, name: "Aung", staffNo: "C1", status: "ACTIVE" })).toBeNull();
  });
  it("still counts L&D and clerk roles, and HOD or division-head posts, as extra access", () => {
    expect(hasExtraAccess({ roles: [{ role: "CLERK" }], hodOf: [], headOf: [] })).toBe(true);
    expect(hasExtraAccess({ roles: [{ role: "SKILL_EVALUATOR" }, { role: "MAIN_CLERK" }], hodOf: [], headOf: [] })).toBe(true);
    expect(hasExtraAccess({ roles: [], hodOf: [{}], headOf: [] })).toBe(true);
    expect(canManageStaffRecord(user(["CLERK"]), { ...leader, roles: [{ role: "CLERK" }] })).toBe(false);
  });
});
