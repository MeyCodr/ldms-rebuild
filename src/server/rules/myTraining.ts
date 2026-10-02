// What a staff member can do with their own trainings. Pure functions: the
// My Training service enforces them and the pages use them to explain what's
// possible before anything is sent.
//
//   course feedback   opens on the training's last day while attendance is
//                     PENDING; submitting it completes the training
//   OJT answers       same, and once completed they can still be updated
//   own OJT           recorded by the staff member (source SELF): saved as
//                     completed, details can be edited and it can be deleted
//   OJT from a clerk  or L&D: answers can be filled in or updated, but the
//                     record stays

import type { Attendance, ParticipantSource, TrainingStatus, TrainingType } from "@prisma/client";
import type { FormKind } from "@/lib/forms/feedback";
import { formatDate } from "@/lib/format";
import { trainingHasEnded } from "./attendance";
import { dayNumber } from "./training";

export const formKind = (t: { type: TrainingType }): FormKind => (t.type === "OJT" ? "OJT" : "FEEDBACK");

export type FormAccess =
  /** Pending and the training has ended: submitting completes it. */
  | { mode: "submit" }
  /** A completed OJT: the answers can be updated. */
  | { mode: "update" }
  /** Answers given; shown, not changed. */
  | { mode: "view" }
  /** No form to fill in, and why. */
  | { mode: "closed"; reason: string };

export type MyParticipant = { attendance: Attendance; submittedAt: Date | null };
export type MyTraining = { type: TrainingType; status: TrainingStatus; endDate: Date };

export function formAccess(p: MyParticipant, t: MyTraining, today: Date): FormAccess {
  const closed = (reason: string): FormAccess => ({ mode: "closed", reason });
  if (t.status === "CANCELLED") return closed("This training was cancelled, so there is no form to fill in.");
  if (p.attendance === "ABSENT") return closed("You were marked absent, so there is no form to fill in. Tell the L&D unit if that's wrong.");
  if (p.attendance === "PENDING")
    return trainingHasEnded(t, today) ? { mode: "submit" } : closed(`The form opens on ${formatDate(t.endDate)}, the training's last day.`);
  // Completed.
  if (formKind(t) === "OJT") return { mode: "update" };
  if (p.submittedAt) return { mode: "view" };
  return closed("The L&D unit recorded your attendance for you, so there was no feedback form to fill in.");
}

/** Waiting for the person's feedback: the form is open and not yet submitted. */
export const feedbackDue = (p: MyParticipant, t: MyTraining, today: Date) => formAccess(p, t, today).mode === "submit";

/**
 * Why the person can't change the details (title, date, times, trainer) of an
 * OJT, or null when they can: only OJT they recorded themselves, and only
 * while no one else is on it.
 */
export function ojtDetailsBlock(p: { source: ParticipantSource }, others: number): string | null {
  if (p.source !== "SELF")
    return "This OJT was recorded by your clerk or the L&D unit, so its details can't be changed here. You can still update your answers.";
  if (others > 0) return "Other staff have been added to this OJT, so ask the L&D unit to change it.";
  return null;
}

/** Why the person can't delete an OJT, or null when they can: same rule as editing it. */
export function ojtDeleteBlock(p: { source: ParticipantSource }, others: number): string | null {
  if (p.source !== "SELF") return "This OJT was recorded by your clerk or the L&D unit, so it stays on your record.";
  if (others > 0) return "Other staff have been added to this OJT, so ask the L&D unit to remove you from it.";
  return null;
}

/** OJT is recorded once it has happened: it ends today or earlier (Malaysia time). */
export function ojtDateBlock(endDate: Date, today: Date): string | null {
  return dayNumber(endDate)! > Math.floor(today.getTime() / 86_400_000) ? "OJT is recorded once it has happened. Pick today or an earlier date." : null;
}
