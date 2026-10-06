import { describe, expect, it } from "vitest";
import { pmeAnswersSchema, pmeBandOf, readPmeAnswers, type PmeAnswers } from "@/lib/forms/pme";
import { can, hasApprovals, pmeStaffScope, type SessionUser } from "@/server/permissions";
import type { ApproverResult } from "@/server/rules/approver";
import { participantActionBlock } from "@/server/rules/attendance";
import {
  pmeActionBlock,
  pmeFollowsAttendance,
  pmeMark,
  pmeOpensOn,
  pmePeriod,
  pmePeriodEnded,
  pmeReopenBlock,
  pmeRequirement,
  pmeStage,
  pmeStageWhere,
  type PmeState,
  type PmeViewer,
} from "@/server/rules/pme";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Today" as the services pass it: Malaysia time shifted into UTC, any hour of the day. */
const today = (iso: string) => new Date(`${iso}T15:30:00Z`);

const HOD: ApproverResult = { approverId: 10, basis: "HOD" };
const none = (reason: "IS_HOD" | "IS_DIVISION_HEAD" | "NO_HOD"): ApproverResult => ({ approverId: null, basis: "NONE", reason });
const exec = { status: "ACTIVE", designation: "EXECUTIVE" } as const;
const course = { type: "PUBLIC_INHOUSE", hours: 9 } as const;

describe("pmeRequirement", () => {
  it("gives executives and managers a PME for a course", () => {
    expect(pmeRequirement(exec, course, HOD)).toEqual({ kind: "REQUIRED" });
    expect(pmeRequirement({ status: "ACTIVE", designation: "MANAGER" }, { type: "DEPARTMENTAL", hours: 16 }, HOD)).toEqual({ kind: "REQUIRED" });
  });
  it("gives non-executive, contract and trainee staff none", () => {
    for (const designation of ["NON_EXECUTIVE", "CONTRACT", "TRAINEE"] as const)
      expect(pmeRequirement({ status: "ACTIVE", designation }, course, HOD)).toEqual({ kind: "NONE", reason: "DESIGNATION" });
  });
  it("gives OJT none, whoever did it", () => {
    expect(pmeRequirement(exec, { type: "OJT", hours: 9 }, HOD)).toEqual({ kind: "NONE", reason: "OJT" });
  });
  it("gives HODs and division heads none: no one evaluates them", () => {
    expect(pmeRequirement({ status: "ACTIVE", designation: "MANAGER" }, course, none("IS_HOD"))).toEqual({ kind: "NONE", reason: "IS_HEAD" });
    expect(pmeRequirement({ status: "ACTIVE", designation: "MANAGER" }, course, none("IS_DIVISION_HEAD"))).toEqual({ kind: "NONE", reason: "IS_HEAD" });
  });
  it("still makes one when the department has no active HOD, so it waits rather than being lost", () => {
    expect(pmeRequirement(exec, course, none("NO_HOD"))).toEqual({ kind: "REQUIRED" });
  });
  it("gives someone who has resigned none", () => {
    expect(pmeRequirement({ status: "RESIGNED", designation: "EXECUTIVE" }, course, HOD)).toEqual({ kind: "NONE", reason: "RESIGNED" });
  });
  it("needs no evaluation for 4 hours or less", () => {
    expect(pmeRequirement(exec, { type: "PUBLIC_INHOUSE", hours: 4 }, HOD)).toEqual({ kind: "NOT_REQUIRED" });
    expect(pmeRequirement(exec, { type: "PUBLIC_INHOUSE", hours: 2.5 }, HOD)).toEqual({ kind: "NOT_REQUIRED" });
    expect(pmeRequirement(exec, { type: "PUBLIC_INHOUSE", hours: 4.5 }, HOD)).toEqual({ kind: "REQUIRED" });
  });
});

describe("pmePeriod", () => {
  const period = (end: string) => {
    const p = pmePeriod({ endDate: day(end) });
    return [p.periodStart.toISOString().slice(0, 10), p.periodEnd.toISOString().slice(0, 10)];
  };
  it("starts the day after the training ends and runs three months", () => {
    expect(period("2026-06-10")).toEqual(["2026-06-11", "2026-09-11"]);
    expect(period("2026-08-31")).toEqual(["2026-09-01", "2026-12-01"]);
  });
  it("crosses the year end", () => {
    expect(period("2026-11-14")).toEqual(["2026-11-15", "2027-02-15"]);
    expect(period("2026-12-31")).toEqual(["2027-01-01", "2027-04-01"]);
  });
  it("stops at the end of a shorter month", () => {
    expect(period("2026-11-29")).toEqual(["2026-11-30", "2027-02-28"]);
    expect(period("2027-11-29")).toEqual(["2027-11-30", "2028-02-29"]); // leap year
    expect(period("2026-01-30")).toEqual(["2026-01-31", "2026-04-30"]);
  });
  it("is over the day after its last day", () => {
    const pme = { periodEnd: day("2026-09-11") };
    expect(pmePeriodEnded(pme, today("2026-09-10"))).toBe(false);
    expect(pmePeriodEnded(pme, today("2026-09-11"))).toBe(false);
    expect(pmePeriodEnded(pme, today("2026-09-12"))).toBe(true);
    expect(pmeOpensOn(pme).toISOString().slice(0, 10)).toBe("2026-09-12");
  });
});

describe("pmeStage", () => {
  const at = (status: PmeState["status"], on = "2026-10-06") => pmeStage({ status, periodEnd: day("2026-09-11") }, today(on));
  it("splits PENDING by the date", () => {
    expect(at("PENDING", "2026-09-11")).toBe("IN_PERIOD");
    expect(at("PENDING", "2026-09-12")).toBe("TO_EVALUATE");
  });
  it("names who each later status waits for", () => {
    expect(at("EVALUATED")).toBe("TO_ACKNOWLEDGE");
    expect(at("ACKNOWLEDGED")).toBe("TO_VERIFY");
    expect(at("VERIFIED")).toBe("VERIFIED");
    expect(at("NOT_REQUIRED")).toBe("NOT_REQUIRED");
  });
  it("draws the same line as a database filter", () => {
    expect(pmeStageWhere("IN_PERIOD", today("2026-09-11"))).toEqual({ status: "PENDING", periodEnd: { gte: day("2026-09-11") } });
    expect(pmeStageWhere("TO_EVALUATE", today("2026-09-12"))).toEqual({ status: "PENDING", periodEnd: { lt: day("2026-09-12") } });
    expect(pmeStageWhere("TO_VERIFY", today("2026-09-12"))).toEqual({ status: "ACKNOWLEDGED" });
  });
});

describe("pmeActionBlock", () => {
  const pme = (over: Partial<PmeState> = {}): PmeState => ({
    status: "PENDING",
    periodEnd: day("2026-09-11"),
    staff: { name: "Ahmad", status: "ACTIVE" },
    training: { status: "SCHEDULED" },
    ...over,
  });
  const nobody: PmeViewer = { isSubject: false, isApprover: false, canVerify: false };
  const hod: PmeViewer = { ...nobody, isApprover: true };
  const subject: PmeViewer = { ...nobody, isSubject: true };
  const ld: PmeViewer = { ...nobody, canVerify: true };
  const now = today("2026-10-06");

  it("lets the HOD evaluate once the period has ended", () => {
    expect(pmeActionBlock("EVALUATE", pme(), hod, now)).toBeNull();
    expect(pmeActionBlock("EVALUATE", pme(), hod, today("2026-09-11"))).toMatch(/runs until 11 Sep 2026. You can evaluate from 12 Sep 2026/);
  });
  it("lets no one else evaluate: another HOD, L&D, or the person themselves", () => {
    for (const viewer of [nobody, ld, subject]) expect(pmeActionBlock("EVALUATE", pme(), viewer, now)).toMatch(/Only Ahmad's HOD/);
  });
  it("doesn't let the HOD evaluate twice, or evaluate someone who has left", () => {
    expect(pmeActionBlock("EVALUATE", pme({ status: "EVALUATED" }), hod, now)).toMatch(/already been evaluated/);
    expect(pmeActionBlock("EVALUATE", pme({ status: "ACKNOWLEDGED" }), hod, now)).toMatch(/already been evaluated/);
    expect(pmeActionBlock("EVALUATE", pme({ staff: { name: "Ahmad", status: "RESIGNED" } }), hod, now)).toMatch(/has resigned/);
  });
  it("lets only the person acknowledge, and only an evaluation", () => {
    expect(pmeActionBlock("ACKNOWLEDGE", pme({ status: "EVALUATED" }), subject, now)).toBeNull();
    expect(pmeActionBlock("ACKNOWLEDGE", pme({ status: "EVALUATED" }), hod, now)).toMatch(/Only Ahmad can acknowledge/);
    expect(pmeActionBlock("ACKNOWLEDGE", pme({ status: "EVALUATED" }), ld, now)).toMatch(/Only Ahmad can acknowledge/);
    expect(pmeActionBlock("ACKNOWLEDGE", pme(), subject, now)).toMatch(/hasn't evaluated you yet/);
    expect(pmeActionBlock("ACKNOWLEDGE", pme({ status: "ACKNOWLEDGED" }), subject, now)).toMatch(/already acknowledged/);
  });
  it("lets L&D verify once it is acknowledged", () => {
    expect(pmeActionBlock("VERIFY", pme({ status: "ACKNOWLEDGED" }), ld, now)).toBeNull();
    expect(pmeActionBlock("VERIFY", pme({ status: "EVALUATED" }), ld, now)).toMatch(/hasn't acknowledged/);
    expect(pmeActionBlock("VERIFY", pme(), ld, now)).toMatch(/hasn't evaluated them yet/);
    expect(pmeActionBlock("VERIFY", pme({ status: "ACKNOWLEDGED" }), hod, now)).toMatch(/Only the L&D unit can verify/);
  });
  it("lets L&D verify an evaluation the person left before acknowledging", () => {
    expect(pmeActionBlock("VERIFY", pme({ status: "EVALUATED", staff: { name: "Ahmad", status: "RESIGNED" } }), ld, now)).toBeNull();
  });
  it("lets L&D send an evaluation back, acknowledged or not", () => {
    expect(pmeActionBlock("SEND_BACK", pme({ status: "EVALUATED" }), ld, now)).toBeNull();
    expect(pmeActionBlock("SEND_BACK", pme({ status: "ACKNOWLEDGED" }), ld, now)).toBeNull();
    expect(pmeActionBlock("SEND_BACK", pme(), ld, now)).toMatch(/already with the HOD/);
    expect(pmeActionBlock("SEND_BACK", pme({ status: "EVALUATED" }), hod, now)).toMatch(/Only the L&D unit/);
  });
  it("locks a verified PME against every step", () => {
    for (const action of ["EVALUATE", "ACKNOWLEDGE", "VERIFY", "SEND_BACK"] as const)
      for (const viewer of [hod, subject, ld]) expect(pmeActionBlock(action, pme({ status: "VERIFIED" }), viewer, now)).toMatch(/verified this PME/);
  });
  it("has nothing to do for a short training or a cancelled one", () => {
    expect(pmeActionBlock("EVALUATE", pme({ status: "NOT_REQUIRED" }), hod, now)).toMatch(/4 hours or less/);
    expect(pmeActionBlock("EVALUATE", pme({ training: { status: "CANCELLED" } }), hod, now)).toMatch(/cancelled/);
    expect(pmeActionBlock("VERIFY", pme({ status: "ACKNOWLEDGED", training: { status: "CANCELLED" } }), ld, now)).toMatch(/cancelled/);
  });
});

describe("a PME and its attendance", () => {
  const never = { returnedAt: null };
  it("follows the attendance until the HOD has evaluated", () => {
    expect(pmeFollowsAttendance({ status: "PENDING", ...never })).toBe(true);
    expect(pmeFollowsAttendance({ status: "NOT_REQUIRED", ...never })).toBe(true);
    for (const status of ["EVALUATED", "ACKNOWLEDGED", "VERIFIED"] as const) expect(pmeFollowsAttendance({ status, ...never })).toBe(false);
  });
  it("stays once L&D has sent it back: the HOD's answers are on it", () => {
    expect(pmeFollowsAttendance({ status: "PENDING", returnedAt: new Date() })).toBe(false);
  });
  it("keeps attendance completed once evaluated", () => {
    expect(pmeReopenBlock("Ahmad", null)).toBeNull();
    expect(pmeReopenBlock("Ahmad", { status: "PENDING", ...never })).toBeNull();
    expect(pmeReopenBlock("Ahmad", { status: "EVALUATED", ...never })).toMatch(/Ahmad's HOD has already evaluated them/);
  });
  it("is checked when an admin reopens attendance", () => {
    const t = { status: "SCHEDULED", startDate: day("2026-06-10"), endDate: day("2026-06-10") } as const;
    const p = (pme: { status: "PENDING" | "VERIFIED"; returnedAt: null } | null) =>
      ({ name: "Ahmad", attendance: "COMPLETED", hasFeedback: true, pme }) as const;
    expect(participantActionBlock("REOPEN", p(null), t, today("2026-10-06"))).toBeNull();
    expect(participantActionBlock("REOPEN", p({ status: "PENDING", returnedAt: null }), t, today("2026-10-06"))).toBeNull();
    expect(participantActionBlock("REOPEN", p({ status: "VERIFIED", returnedAt: null }), t, today("2026-10-06"))).toMatch(/attendance stays completed/);
  });
});

// ---------- The form ----------

const filled: Record<string, string> = {
  q1_rating: "VERY_GOOD",
  q1_percent: "85",
  q1_remarks: "OJT on 12 Aug 2026, 2pm, Press Line 3",
  q2_rating: "EXCELLENT",
  q2_percent: "90",
  q2_remarks: "",
  q3_rating: "GOOD",
  q3_percent: "75",
  q3_remarks: " Applies it daily ",
  q4_rating: "SATISFACTORY",
  q4_percent: "60",
  q4_remarks: "",
  ojtConducted: "YES",
};
const errorsOf = (raw: Record<string, string>) => {
  const r = pmeAnswersSchema.safeParse(raw);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("the Performance Monitoring Form", () => {
  it("accepts a complete form and stores it tidily", () => {
    const answers = pmeAnswersSchema.parse(filled);
    expect(answers).toEqual({
      q1: { rating: "VERY_GOOD", percent: 85, remarks: "OJT on 12 Aug 2026, 2pm, Press Line 3" },
      q2: { rating: "EXCELLENT", percent: 90, remarks: null },
      q3: { rating: "GOOD", percent: 75, remarks: "Applies it daily" },
      q4: { rating: "SATISFACTORY", percent: 60, remarks: null },
      ojtConducted: true,
    });
    expect(readPmeAnswers(answers, 1)).toEqual(answers);
  });
  it("keeps each percentage inside its rating's band", () => {
    expect(errorsOf({ ...filled, q1_percent: "90" })).toEqual({ q1_percent: "Very good is 80 to 89" });
    expect(errorsOf({ ...filled, q2_percent: "101" })).toEqual({ q2_percent: "Excellent is 90 to 100" });
    expect(errorsOf({ ...filled, q4_rating: "POOR", q4_percent: "0" })).toEqual({ q4_percent: "Poor is 1 to 49" });
    expect(errorsOf({ ...filled, q4_rating: "POOR", q4_percent: "49" })).toEqual({});
  });
  it("wants a rating and a whole-number percentage for every question", () => {
    expect(errorsOf({ ...filled, q3_rating: "", q3_percent: "" })).toEqual({ q3_rating: "Choose a rating", q3_percent: "Enter the percentage" });
    expect(errorsOf({ ...filled, q3_percent: "75.5" })).toEqual({ q3_percent: "A whole number, without the % sign" });
    expect(errorsOf({ ...filled, q3_rating: "BRILLIANT" })).toMatchObject({ q3_rating: "Choose a rating" });
  });
  it("wants the OJT answer, and remarks on question 1 that fit it", () => {
    expect(errorsOf({ ...filled, ojtConducted: "" })).toEqual({ ojtConducted: "Choose yes or no" });
    expect(errorsOf({ ...filled, q1_remarks: " " })).toEqual({ q1_remarks: "Give the date, time and place of the OJT" });
    expect(errorsOf({ ...filled, ojtConducted: "NO", q1_remarks: "" })).toEqual({ q1_remarks: "Say why the OJT wasn't conducted" });
  });
  it("reports every problem at once", () => {
    expect(Object.keys(errorsOf({})).sort()).toEqual(
      ["ojtConducted", "q1_percent", "q1_rating", "q1_remarks", "q2_percent", "q2_rating", "q3_percent", "q3_rating", "q4_percent", "q4_rating"].sort(),
    );
  });
  it("doesn't read answers of an unknown shape or version", () => {
    expect(readPmeAnswers(null, 1)).toBeNull();
    expect(readPmeAnswers({ q1: { rating: "GOOD", percent: 70 } }, 1)).toBeNull();
    expect(readPmeAnswers(pmeAnswersSchema.parse(filled), 2)).toBeNull();
  });
  it("finds the band a percentage falls in", () => {
    expect(pmeBandOf(100)?.value).toBe("EXCELLENT");
    expect(pmeBandOf(89)?.value).toBe("VERY_GOOD");
    expect(pmeBandOf(50)?.value).toBe("FAIR");
    expect(pmeBandOf(1)?.value).toBe("POOR");
    expect(pmeBandOf(0)).toBeNull();
  });
});

describe("pmeMark", () => {
  it("adds up the four percentages and averages them", () => {
    expect(pmeMark(pmeAnswersSchema.parse(filled))).toEqual({ total: 310, average: 77.5 });
  });
  it("rounds the average to two decimals", () => {
    const a = pmeAnswersSchema.parse({ ...filled, q4_percent: "61" }) as PmeAnswers;
    expect(pmeMark(a)).toEqual({ total: 311, average: 77.75 });
  });
});

// ---------- Who sees what ----------

describe("PME permissions", () => {
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
  it("shows L&D every PME and lets them verify", () => {
    const ld = user({ roles: ["LD_ADMIN"] });
    expect(can(ld, "pme.view")).toBe(true);
    expect(can(ld, "pme.verify")).toBe(true);
    expect(pmeStaffScope(ld)).toEqual({});
    expect(hasApprovals(ld)).toBe(true);
  });
  it("shows a HOD their departments' PMEs, without verifying", () => {
    const hod = user({ hodOfDepartmentIds: [5, 6] });
    expect(can(hod, "pme.view")).toBe(true);
    expect(can(hod, "pme.verify")).toBe(false);
    expect(pmeStaffScope(hod)).toEqual({ OR: [{ departmentId: { in: [5, 6] } }] });
    expect(hasApprovals(hod)).toBe(true);
  });
  it("shows a division head their division's PMEs to look at, with nothing to approve", () => {
    const head = user({ headOfDivisionIds: [2] });
    expect(can(head, "pme.view")).toBe(true);
    expect(pmeStaffScope(head)).toEqual({ OR: [{ department: { divisionId: { in: [2] } } }] });
    expect(hasApprovals(head)).toBe(false);
  });
  it("gives clerks, evaluators and plain staff no PME list", () => {
    for (const roles of [["CLERK"], ["MAIN_CLERK"], ["SKILL_EVALUATOR"], []] as SessionUser["roles"][]) {
      const u = user({ roles });
      expect(can(u, "pme.view")).toBe(false);
      expect(pmeStaffScope(u)).toBeNull();
      expect(hasApprovals(u)).toBe(false);
    }
  });
});
