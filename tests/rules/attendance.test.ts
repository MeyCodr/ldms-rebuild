import { describe, expect, it } from "vitest";
import type { Attendance } from "@prisma/client";
import { participantActionSchema } from "@/lib/validation/participant";
import {
  addParticipantBlock,
  addToTrainingBlock,
  ATTENDANCE_AFTER,
  PARTICIPANT_ACTIONS,
  participantActionBlock,
  trainingHasEnded,
  type ParticipantAction,
} from "@/server/rules/attendance";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const held = { status: "SCHEDULED" as const, startDate: d("2026-03-04"), endDate: d("2026-03-06") };
const upcoming = { status: "SCHEDULED" as const, startDate: d("2026-11-12"), endDate: d("2026-11-12") };
const running = { status: "SCHEDULED" as const, startDate: d("2026-09-29"), endDate: d("2026-10-02") };
const cancelled = { status: "CANCELLED" as const, startDate: d("2026-03-04"), endDate: d("2026-03-06") };
const today = new Date("2026-09-30T10:00:00Z");

const who = (attendance: Attendance, hasFeedback = false) => ({ name: "Aina", attendance, hasFeedback });
const allowed = (action: ParticipantAction, attendance: Attendance, t = held, hasFeedback = false) =>
  participantActionBlock(action, who(attendance, hasFeedback), t, today) === null;

describe("attendance transitions", () => {
  // Every (action, from) pair: exactly the transitions in the plan are allowed.
  const expected: Record<ParticipantAction, Attendance[]> = {
    MARK_ABSENT: ["PENDING"],
    UNDO_ABSENT: ["ABSENT"],
    MARK_COMPLETED: ["PENDING"],
    REOPEN: ["COMPLETED"],
    REMOVE: ["PENDING"],
  };
  for (const action of PARTICIPANT_ACTIONS)
    for (const from of ["PENDING", "COMPLETED", "ABSENT"] as Attendance[])
      it(`${action} from ${from}: ${expected[action].includes(from) ? "allowed" : "refused"}`, () => {
        expect(allowed(action, from)).toBe(expected[action].includes(from));
      });

  it("each action leads where the plan says", () => {
    expect(ATTENDANCE_AFTER).toEqual({ MARK_ABSENT: "ABSENT", UNDO_ABSENT: "PENDING", MARK_COMPLETED: "COMPLETED", REOPEN: "PENDING", REMOVE: null });
  });

  it("refuses every change while the training is cancelled, saying how to fix it", () => {
    for (const action of PARTICIPANT_ACTIONS)
      for (const from of ["PENDING", "COMPLETED", "ABSENT"] as Attendance[])
        expect(participantActionBlock(action, who(from), cancelled, today)).toMatch(/cancelled\. Restore it first/);
  });

  it("marks completed only from the training's last day", () => {
    expect(allowed("MARK_COMPLETED", "PENDING", upcoming)).toBe(false);
    expect(participantActionBlock("MARK_COMPLETED", who("PENDING"), upcoming, today)).toBe("The training hasn't started yet, so Aina can't be marked completed.");
    expect(participantActionBlock("MARK_COMPLETED", who("PENDING"), running, today)).toBe(
      "The training is still running until 02 Oct 2026, so Aina can be marked completed from that day.",
    );
    // On the last day itself (Malaysia date passed in as today) it is allowed.
    expect(allowed("MARK_COMPLETED", "PENDING", { status: "SCHEDULED", startDate: d("2026-09-28"), endDate: d("2026-09-30") })).toBe(true);
  });

  it("keeps anyone who gave feedback on record", () => {
    expect(allowed("REMOVE", "PENDING", held, true)).toBe(false);
    expect(participantActionBlock("REMOVE", who("PENDING", true), held, today)).toMatch(/already given feedback/);
  });

  it("explains refusals by name and says what to do instead", () => {
    expect(participantActionBlock("MARK_ABSENT", who("COMPLETED"), held, today)).toBe("Aina has completed this training. Reopen it first if they did not attend.");
    expect(participantActionBlock("REMOVE", who("ABSENT"), held, today)).toMatch(/Undo absent first/);
  });
});

describe("trainingHasEnded", () => {
  it("is true from the last day on", () => {
    expect(trainingHasEnded({ endDate: d("2026-09-29") }, today)).toBe(true);
    expect(trainingHasEnded({ endDate: d("2026-09-30") }, today)).toBe(true);
    expect(trainingHasEnded({ endDate: d("2026-10-01") }, today)).toBe(false);
  });
});

describe("adding participants", () => {
  it("skips duplicates and resigned staff", () => {
    expect(addParticipantBlock({ name: "Aina", status: "ACTIVE" }, false)).toBeNull();
    expect(addParticipantBlock({ name: "Aina", status: "ACTIVE" }, true)).toBe("Aina is already on the list.");
    expect(addParticipantBlock({ name: "Aina", status: "RESIGNED" }, false)).toBe("Aina has resigned.");
  });
  it("refuses a cancelled training", () => {
    expect(addToTrainingBlock({ status: "SCHEDULED" })).toBeNull();
    expect(addToTrainingBlock({ status: "CANCELLED" })).toMatch(/Restore it first/);
  });
});

describe("participantActionSchema", () => {
  const base = { participantIds: ["4", "7"], reason: "" };
  it("requires a reason to mark someone completed", () => {
    const r = participantActionSchema.safeParse({ ...base, action: "MARK_COMPLETED" });
    expect(r.success).toBe(false);
    expect(participantActionSchema.parse({ ...base, action: "MARK_COMPLETED", reason: "  Can't use a computer  " }).reason).toBe("Can't use a computer");
  });
  it("makes the reason optional otherwise, and stores blank as null", () => {
    expect(participantActionSchema.parse({ ...base, action: "MARK_ABSENT" })).toEqual({ action: "MARK_ABSENT", participantIds: [4, 7], reason: null });
  });
  it("refuses unknown actions, no rows and over-long reasons", () => {
    expect(participantActionSchema.safeParse({ ...base, action: "DELETE" }).success).toBe(false);
    expect(participantActionSchema.safeParse({ ...base, participantIds: [], action: "MARK_ABSENT" }).success).toBe(false);
    expect(participantActionSchema.safeParse({ ...base, action: "MARK_ABSENT", reason: "x".repeat(256) }).success).toBe(false);
  });
});
