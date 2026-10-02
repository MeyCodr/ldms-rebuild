import { describe, expect, it } from "vitest";
import { trainingSchema } from "@/lib/validation/training";
import { can, type SessionUser } from "@/server/permissions";
import {
  canBeInternalTrainer,
  countsTowardHours,
  dayNumber,
  manHours,
  minutesOfDay,
  sessionProblems,
  sessionSpan,
  trainingCode,
  trainingDays,
  trainingDeleteBlock,
  trainingHours,
  trainingPhase,
} from "@/server/rules/training";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const t = (s: string) => new Date(`1970-01-01T${s}:00Z`);

describe("trainingHours", () => {
  it("1 day 08:30–17:30 = 9 h", () => {
    expect(trainingHours({ startDate: "2026-04-03", endDate: "2026-04-03", startTime: "08:30", endTime: "17:30" })).toBe(9);
  });

  it("3 days 09:00–13:00 = 12 h", () => {
    expect(trainingHours({ startDate: "2026-04-01", endDate: "2026-04-03", startTime: "09:00", endTime: "13:00" })).toBe(12);
  });

  it("sessions 2 × 4 h = 8 h, ignoring the overall range", () => {
    expect(
      trainingHours({
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        startTime: "08:00",
        endTime: "17:00",
        sessions: [
          { date: "2026-04-01", startTime: "09:00", endTime: "13:00" },
          { date: "2026-04-15", startTime: "14:00", endTime: "18:00" },
        ],
      }),
    ).toBe(8);
  });

  it("gives the same answer for Prisma values as for form strings", () => {
    expect(trainingHours({ startDate: d("2026-04-01"), endDate: d("2026-04-02"), startTime: t("08:30"), endTime: t("17:30") })).toBe(18);
  });

  it("counts across a month end", () => {
    expect(trainingHours({ startDate: "2026-01-30", endDate: "2026-02-02", startTime: "09:00", endTime: "10:00" })).toBe(4);
  });

  it("rounds to 2 decimals", () => {
    // 3 × 20 minutes = 1 h; 1 × 25 minutes = 0.4166… → 0.42
    expect(trainingHours({ startDate: "2026-04-01", endDate: "2026-04-03", startTime: "09:00", endTime: "09:20" })).toBe(1);
    expect(trainingHours({ startDate: "2026-04-01", endDate: "2026-04-01", startTime: "09:00", endTime: "09:25" })).toBe(0.42);
  });

  it.each([
    ["end before start", { startDate: "2026-04-01", endDate: "2026-04-01", startTime: "17:00", endTime: "09:00" }],
    ["end equals start", { startDate: "2026-04-01", endDate: "2026-04-01", startTime: "09:00", endTime: "09:00" }],
    ["last day before first", { startDate: "2026-04-03", endDate: "2026-04-01", startTime: "09:00", endTime: "17:00" }],
    ["missing time", { startDate: "2026-04-01", endDate: "2026-04-01", startTime: "", endTime: "17:00" }],
    ["impossible date", { startDate: "2026-02-31", endDate: "2026-02-31", startTime: "09:00", endTime: "17:00" }],
  ])("is null when %s", (_label, input) => {
    expect(trainingHours(input)).toBeNull();
  });

  it("is null when any session is invalid", () => {
    expect(
      trainingHours({
        startDate: "",
        endDate: "",
        startTime: "",
        endTime: "",
        sessions: [
          { date: "2026-04-01", startTime: "09:00", endTime: "13:00" },
          { date: "2026-04-02", startTime: "13:00", endTime: "12:00" },
        ],
      }),
    ).toBeNull();
  });
});

describe("time and date parsing", () => {
  it("reads HH:MM and Prisma times", () => {
    expect(minutesOfDay("08:30")).toBe(510);
    expect(minutesOfDay("08:30:00")).toBe(510);
    expect(minutesOfDay(t("23:59"))).toBe(1439);
    expect(minutesOfDay("24:00")).toBeNull();
    expect(minutesOfDay("8:30")).toBeNull();
  });

  it("rejects rolled-over dates", () => {
    expect(dayNumber("2026-02-28")).not.toBeNull();
    expect(dayNumber("2026-02-29")).toBeNull();
    expect(dayNumber("03/04/2026")).toBeNull();
  });
});

describe("countsTowardHours", () => {
  it.each([
    ["COMPLETED", "SCHEDULED", true],
    ["COMPLETED", "CANCELLED", false],
    ["PENDING", "SCHEDULED", false],
    ["ABSENT", "SCHEDULED", false],
  ] as const)("%s at a %s training → %s", (attendance, status, expected) => {
    expect(countsTowardHours({ attendance, training: { status } })).toBe(expected);
  });
});

describe("sessions", () => {
  it("accepts sessions on the same day that don't overlap", () => {
    expect(
      sessionProblems([
        { date: "2026-04-01", startTime: "09:00", endTime: "12:00" },
        { date: "2026-04-01", startTime: "13:00", endTime: "17:00" },
      ]),
    ).toEqual([]);
  });

  it("flags overlaps, bad times and missing dates by position", () => {
    expect(
      sessionProblems([
        { date: "2026-04-01", startTime: "09:00", endTime: "12:00" },
        { date: "2026-04-01", startTime: "11:00", endTime: "13:00" },
        { date: "2026-04-02", startTime: "14:00", endTime: "13:00" },
        { date: "", startTime: "09:00", endTime: "10:00" },
      ]),
    ).toEqual([
      { index: 1, message: "It overlaps session 1 on the same day." },
      { index: 2, message: "The end time must be after the start time." },
      { index: 3, message: "Enter the date." },
    ]);
  });

  it("derives the overall range from the sessions", () => {
    expect(
      sessionSpan([
        { date: d("2026-04-15"), startTime: t("14:00"), endTime: t("18:00") },
        { date: d("2026-04-01"), startTime: t("09:00"), endTime: t("13:00") },
      ]),
    ).toEqual({ startDate: d("2026-04-01"), endDate: d("2026-04-15"), startTime: t("09:00"), endTime: t("18:00") });
  });
});

describe("trainingPhase", () => {
  const training = { status: "SCHEDULED" as const, startDate: d("2026-04-01"), endDate: d("2026-04-03") };
  it.each([
    ["2026-03-31T23:00:00Z", "UPCOMING"],
    ["2026-04-01T00:00:00Z", "IN_PROGRESS"],
    ["2026-04-03T20:00:00Z", "IN_PROGRESS"],
    ["2026-04-04T00:00:00Z", "HELD"],
  ])("on %s → %s", (today, phase) => {
    expect(trainingPhase(training, new Date(today))).toBe(phase);
  });

  it("is cancelled whatever the date", () => {
    expect(trainingPhase({ ...training, status: "CANCELLED" }, d("2026-04-02"))).toBe("CANCELLED");
  });
});

describe("trainingDeleteBlock", () => {
  it("allows deleting a training with no participants", () => {
    expect(trainingDeleteBlock({ participantCount: 0 })).toBeNull();
  });

  it("explains why a training with participants can't be deleted", () => {
    expect(trainingDeleteBlock({ participantCount: 1 })).toMatch(/has 1 participant, so it can't be deleted\. Cancel it instead/);
    expect(trainingDeleteBlock({ participantCount: 12 })).toMatch(/12 participants/);
  });
});

/** A valid training form submission (the fields on the form); tests override single fields. */
const baseInput = {
  type: "PUBLIC_INHOUSE",
  title: "Power Press Safety",
  venue: "",
  cost: "",
  hrdfClaimable: "no",
  platform: "PHYSICAL",
  function: "BUSINESS",
  startDate: "2026-04-01",
  endDate: "2026-04-02",
  startTime: "08:30",
  endTime: "17:30",
  program: "INTERNAL_INTERNAL_TRAINER",
  trainerStaffId: "",
  trainerName: "",
};

describe("trainingSchema", () => {
  const base = baseInput;
  const errors = (input: object) => {
    const r = trainingSchema.safeParse({ ...base, ...input });
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("parses the form into dates, times and a cost", () => {
    const v = trainingSchema.parse({ ...base, cost: "RM 1,250.5", venue: " Training Room 2 " });
    expect(v).toEqual({
      type: "PUBLIC_INHOUSE",
      title: "Power Press Safety",
      venue: "Training Room 2",
      cost: "1250.50",
      hrdfClaimable: false,
      platform: "PHYSICAL",
      function: "BUSINESS",
      startDate: d("2026-04-01"),
      endDate: d("2026-04-02"),
      startTime: t("08:30"),
      endTime: t("17:30"),
      program: "INTERNAL_INTERNAL_TRAINER",
      trainerStaffId: null,
      trainerName: null,
    });
  });

  it("refuses overnight times, reversed dates and bad amounts", () => {
    expect(errors({ endTime: "08:00" })).toHaveProperty("endTime");
    expect(errors({ endDate: "2026-03-31" })).toHaveProperty("endDate");
    expect(errors({ cost: "12,50.5.0" })).toHaveProperty("cost");
    expect(errors({ cost: "-5" })).toHaveProperty("cost");
  });

  it("refuses date ranges longer than 60 days", () => {
    expect(errors({ endDate: "2026-06-30" }).endDate).toMatch(/at most 60 days/);
  });

  it("needs the dates and times", () => {
    expect(Object.keys(errors({ startDate: "", endDate: "", startTime: "", endTime: "" })).sort()).toEqual(["endDate", "endTime", "startDate", "startTime"]);
  });

  it("needs program, function and platform, except for OJT", () => {
    const missing = { program: "", function: "", platform: "" };
    expect(Object.keys(errors(missing)).sort()).toEqual(["function", "platform", "program"]);
    expect(errors({ ...missing, type: "OJT" })).toEqual({});
    expect(trainingSchema.parse({ ...base, ...missing, type: "OJT" })).toMatchObject({ program: null, function: null, platform: null });
    expect(errors({ platform: "HYBRID" })).toHaveProperty("platform");
  });

  it("flags every problem at once, even when a basic field is missing", () => {
    expect(Object.keys(errors({ hrdfClaimable: "", title: "", program: "", endTime: "08:00" })).sort()).toEqual([
      "endTime",
      "hrdfClaimable",
      "program",
      "title",
    ]);
  });

  it("needs HRDC answered Yes or No", () => {
    expect(errors({ hrdfClaimable: "" }).hrdfClaimable).toBe("Choose Yes or No");
    expect(trainingSchema.parse({ ...base, hrdfClaimable: "yes" }).hrdfClaimable).toBe(true);
    expect(trainingSchema.parse(base).hrdfClaimable).toBe(false);
  });
});

describe("internal trainer", () => {
  it.each([
    ["ACTIVE", "MANAGER", true],
    ["ACTIVE", "EXECUTIVE", true],
    ["ACTIVE", "NON_EXECUTIVE", false],
    ["ACTIVE", "CONTRACT", false],
    ["ACTIVE", "TRAINEE", false],
    ["RESIGNED", "MANAGER", false],
  ] as const)("%s %s → %s", (status, designation, expected) => {
    expect(canBeInternalTrainer({ status, designation })).toBe(expected);
  });

  it("keeps the picked staff member only for internal training by internal trainer", () => {
    const internal = trainingSchema.parse({ ...baseInput, program: "INTERNAL_INTERNAL_TRAINER", trainerStaffId: "42", trainerName: "typed" });
    expect(internal).toMatchObject({ trainerStaffId: 42, trainerName: null });
    const external = trainingSchema.parse({ ...baseInput, program: "INTERNAL_EXTERNAL_TRAINER", trainerStaffId: "42", trainerName: " Ir. Lim Boon Huat " });
    expect(external).toMatchObject({ trainerStaffId: null, trainerName: "Ir. Lim Boon Huat" });
  });
});

describe("training permissions", () => {
  const user: SessionUser = {
    id: 1,
    staffNo: "10001",
    name: "Test",
    departmentId: 1,
    departmentName: "HRA",
    divisionId: 1,
    roles: [],
    hodOfDepartmentIds: [],
    headOfDivisionIds: [],
    mustChangePassword: false,
  };

  it("lets only L&D admins view and manage trainings", () => {
    expect(can({ ...user, roles: ["LD_ADMIN"] }, "training.manage")).toBe(true);
    for (const roles of [[], ["CLERK"], ["MAIN_CLERK"]] as const) {
      expect(can({ ...user, roles: [...roles] }, "training.view")).toBe(false);
      expect(can({ ...user, roles: [...roles] }, "training.manage")).toBe(false);
    }
    expect(can({ ...user, hodOfDepartmentIds: [1] }, "training.manage")).toBe(false);
  });
});

describe("trainingCode", () => {
  it("is TR, the day it was added, then 6 digits", () => {
    expect(trainingCode("PUBLIC_INHOUSE", d("2026-10-02"), 909393)).toBe("TR20261002909393");
  });
  it("uses OJT for OJT and TR for departmental", () => {
    expect(trainingCode("OJT", d("2026-10-02"), 1)).toBe("OJT20261002000001");
    expect(trainingCode("DEPARTMENTAL", d("2026-01-05"), 999999)).toBe("TR20260105999999");
  });
  it("pads the random part to 6 digits and fits the 20-character column", () => {
    const code = trainingCode("OJT", d("2026-12-31"), 0);
    expect(code).toBe("OJT20261231000000");
    expect(code.length).toBeLessThanOrEqual(20);
  });
});

describe("trainingDays", () => {
  it("counts start to end date inclusive", () => {
    expect(trainingDays({ startDate: d("2026-02-10"), endDate: d("2026-02-12") })).toBe(3);
    expect(trainingDays({ startDate: d("2026-02-10"), endDate: d("2026-02-10") })).toBe(1);
  });
  it("counts the session days when there are sessions, not the span", () => {
    const s = (date: string) => ({ date: d(date), startTime: t("09:00"), endTime: t("12:00") });
    expect(trainingDays({ startDate: d("2026-03-02"), endDate: d("2026-03-09"), sessions: [s("2026-03-02"), s("2026-03-05"), s("2026-03-09")] })).toBe(3);
  });
  it("is null for an end before the start", () => {
    expect(trainingDays({ startDate: d("2026-02-12"), endDate: d("2026-02-10") })).toBeNull();
  });
});

describe("manHours", () => {
  it("is hours × completed participants", () => {
    expect(manHours({ hours: 9, completedCount: 8, status: "SCHEDULED" })).toBe(72);
    expect(manHours({ hours: 8.5, completedCount: 3, status: "SCHEDULED" })).toBe(25.5);
  });
  it("is 0 before anyone completes, for a cancelled training, or without valid hours", () => {
    expect(manHours({ hours: 9, completedCount: 0, status: "SCHEDULED" })).toBe(0);
    expect(manHours({ hours: 16, completedCount: 5, status: "CANCELLED" })).toBe(0);
    expect(manHours({ hours: null, completedCount: 5, status: "SCHEDULED" })).toBe(0);
  });
});
