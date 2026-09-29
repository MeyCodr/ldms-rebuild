import { describe, expect, it } from "vitest";
import { hasNoApproverByDesign, resolveApprover, type ApproverInput } from "@/server/rules/approver";

const HOD = 10;
const DIV_HEAD = 20;
const STAFF = 30;

function input(staffId: number, over: Partial<ApproverInput["department"]> = {}, extra: Partial<ApproverInput> = {}): ApproverInput {
  return {
    staffId,
    department: { hodId: HOD, hodActive: true, division: { headId: DIV_HEAD }, ...over },
    ...extra,
  };
}

describe("resolveApprover", () => {
  it("routes ordinary staff to their department HOD", () => {
    expect(resolveApprover(input(STAFF))).toEqual({ approverId: HOD, basis: "HOD" });
  });

  it("gives a HOD no approver", () => {
    expect(resolveApprover(input(HOD))).toEqual({ approverId: null, basis: "NONE", reason: "IS_HOD" });
  });

  it("gives no approver to someone who is HOD of a different department", () => {
    // e.g. a manager seated in Stamping who heads Die Engineering
    expect(resolveApprover(input(STAFF, {}, { isHodAnywhere: true }))).toEqual({ approverId: null, basis: "NONE", reason: "IS_HOD" });
  });

  it("never routes a HOD to the division head", () => {
    expect(resolveApprover(input(HOD)).approverId).not.toBe(DIV_HEAD);
  });

  it("gives the division head no approver", () => {
    expect(resolveApprover(input(DIV_HEAD))).toEqual({ approverId: null, basis: "NONE", reason: "IS_DIVISION_HEAD" });
  });

  it("reports NO_HOD when the department has no HOD", () => {
    expect(resolveApprover(input(STAFF, { hodId: null }))).toEqual({ approverId: null, basis: "NONE", reason: "NO_HOD" });
  });

  it("does not route to a resigned HOD", () => {
    expect(resolveApprover(input(STAFF, { hodActive: false }))).toEqual({ approverId: null, basis: "NONE", reason: "NO_HOD" });
  });

  it("does not escalate staff to the division head when the HOD is missing", () => {
    expect(resolveApprover(input(STAFF, { hodId: null })).approverId).toBeNull();
  });

  it("treats HOD and division head as no-approver by design, but a missing HOD as a gap", () => {
    expect(hasNoApproverByDesign(resolveApprover(input(HOD)))).toBe(true);
    expect(hasNoApproverByDesign(resolveApprover(input(DIV_HEAD)))).toBe(true);
    expect(hasNoApproverByDesign(resolveApprover(input(STAFF, { hodId: null })))).toBe(false);
  });
});
