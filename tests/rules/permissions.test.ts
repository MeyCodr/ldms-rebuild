import { describe, expect, it } from "vitest";
import { can, canManageStaffRecord, manageableDesignations, staffViewScope, type ManagedStaff, type SessionUser } from "@/server/permissions";

const base: SessionUser = {
  id: 1,
  staffNo: "10001",
  name: "Test",
  departmentId: 5,
  departmentName: "Stamping",
  divisionId: 1,
  roles: [],
  hodOfDepartmentIds: [],
  headOfDivisionIds: [],
  designation: "NON_EXECUTIVE",
  mustChangePassword: false,
};

const target = (designation: ManagedStaff["designation"], extra: Partial<ManagedStaff> = {}): ManagedStaff => ({
  designation,
  roles: [],
  hodOf: [],
  headOf: [],
  ...extra,
});

describe("permissions", () => {
  it("gives plain staff no access to staff or org screens", () => {
    expect(can(base, "staff.view")).toBe(false);
    expect(can(base, "org.view")).toBe(false);
    expect(staffViewScope(base)).toBeNull();
  });

  it("lets L&D admins do everything", () => {
    const admin = { ...base, roles: ["LD_ADMIN" as const] };
    expect(can(admin, "org.manage")).toBe(true);
    expect(can(admin, "staff.roles")).toBe(true);
    expect(staffViewScope(admin)).toEqual({});
    expect(manageableDesignations(admin)).toHaveLength(5);
  });

  it("limits clerks to contract staff", () => {
    const clerk = { ...base, roles: ["CLERK" as const] };
    expect(can(clerk, "staff.manage")).toBe(true);
    expect(can(clerk, "org.view")).toBe(false);
    expect(staffViewScope(clerk)).toEqual({ OR: [{ designation: "CONTRACT" }] });
    expect(canManageStaffRecord(clerk, target("CONTRACT"))).toBe(true);
    expect(canManageStaffRecord(clerk, target("EXECUTIVE"))).toBe(false);
  });

  it("lets a HOD view, but not edit, their department's staff", () => {
    const hod = { ...base, hodOfDepartmentIds: [5] };
    expect(can(hod, "staff.view")).toBe(true);
    expect(can(hod, "staff.manage")).toBe(false);
    expect(staffViewScope(hod)).toEqual({ OR: [{ departmentId: { in: [5] } }] });
  });

  it("adds scopes together for a clerk who is also a HOD", () => {
    const both = { ...base, roles: ["MAIN_CLERK" as const], hodOfDepartmentIds: [5] };
    expect(staffViewScope(both)).toEqual({ OR: [{ designation: "CONTRACT" }, { departmentId: { in: [5] } }] });
  });

  // Regression: a clerk could reset the password of a contract staff member
  // who also held extra access, then sign in with that access.
  it("stops clerks changing anyone with extra access, even contract staff", () => {
    const clerk = { ...base, roles: ["CLERK" as const] };
    expect(canManageStaffRecord(clerk, target("CONTRACT", { roles: [{ role: "LD_ADMIN" }] }))).toBe(false);
    expect(canManageStaffRecord(clerk, target("CONTRACT", { roles: [{ role: "CLERK" }] }))).toBe(false);
    expect(canManageStaffRecord(clerk, target("CONTRACT", { hodOf: [{ id: 3 }] }))).toBe(false);
    expect(canManageStaffRecord(clerk, target("CONTRACT", { headOf: [{ id: 1 }] }))).toBe(false);
  });

  it("still lets admins manage staff with extra access", () => {
    const admin = { ...base, roles: ["LD_ADMIN" as const] };
    expect(canManageStaffRecord(admin, target("MANAGER", { roles: [{ role: "LD_ADMIN" }], hodOf: [{ id: 3 }] }))).toBe(true);
  });
});
