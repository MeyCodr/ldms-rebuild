// Participant and attendance rules. Pure functions: the services enforce them,
// and the participants table uses the same ones to show which rows an action
// applies to before anything is sent.
//
//   PENDING → COMPLETED   the participant submits feedback, or an admin marks it (reason required)
//   PENDING → ABSENT      admin, reason optional
//   ABSENT → PENDING      admin ("undo absent")
//   COMPLETED → PENDING   admin ("reopen")
//   remove                only while PENDING and without feedback
//
// Nothing else. Nothing changes while the training is cancelled.

import type { Attendance, StaffStatus, TrainingStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { dayNumber } from "./training";

export const PARTICIPANT_ACTIONS = ["MARK_ABSENT", "UNDO_ABSENT", "MARK_COMPLETED", "REOPEN", "REMOVE"] as const;
export type ParticipantAction = (typeof PARTICIPANT_ACTIONS)[number];

/** What each action needs to know about the participant row. */
export type ParticipantState = {
  name: string;
  attendance: Attendance;
  hasFeedback: boolean;
};

export type TrainingState = { status: TrainingStatus; startDate: Date; endDate: Date };

/** The attendance an action leaves behind; null for REMOVE (the row goes). */
export const ATTENDANCE_AFTER: Record<ParticipantAction, Attendance | null> = {
  MARK_ABSENT: "ABSENT",
  UNDO_ABSENT: "PENDING",
  MARK_COMPLETED: "COMPLETED",
  REOPEN: "PENDING",
  REMOVE: null,
};

/** Actions where the admin must say why. */
export const REASON_REQUIRED: Record<ParticipantAction, boolean> = {
  MARK_ABSENT: false,
  UNDO_ABSENT: false,
  MARK_COMPLETED: true,
  REOPEN: false,
  REMOVE: false,
};

/** Maximum length of an attendance reason (the column is VARCHAR(255)). */
export const MAX_REASON = 255;

/**
 * The feedback form opens, and an admin may mark someone completed, from the
 * training's last day (Malaysia time). Before that it hasn't happened yet.
 */
export function trainingHasEnded(t: { endDate: Date }, today: Date): boolean {
  return Math.floor(today.getTime() / 86_400_000) >= dayNumber(t.endDate)!;
}

/** Why no one can be marked completed yet: the training hasn't started, or is still running. */
function notEndedYet(name: string, t: { startDate: Date; endDate: Date }, today: Date): string {
  if (Math.floor(today.getTime() / 86_400_000) < dayNumber(t.startDate)!)
    return `The training hasn't started yet, so ${name} can't be marked completed.`;
  return `The training is still running until ${formatDate(t.endDate)}, so ${name} can be marked completed from that day.`;
}

/** Why the action can't be applied to this participant, or null when it can. */
export function participantActionBlock(action: ParticipantAction, p: ParticipantState, t: TrainingState, today: Date): string | null {
  if (t.status === "CANCELLED") return "This training is cancelled. Restore it first to change attendance.";
  const { name, attendance } = p;
  switch (action) {
    case "MARK_ABSENT":
      if (attendance === "ABSENT") return `${name} is already marked absent.`;
      if (attendance === "COMPLETED") return `${name} has completed this training. Reopen it first if they did not attend.`;
      return null;
    case "UNDO_ABSENT":
      return attendance === "ABSENT" ? null : `${name} is not marked absent.`;
    case "MARK_COMPLETED":
      if (attendance === "COMPLETED") return `${name} has already completed this training.`;
      if (attendance === "ABSENT") return `${name} is marked absent. Undo that first if they did attend.`;
      if (!trainingHasEnded(t, today)) return notEndedYet(name, t, today);
      return null;
    case "REOPEN":
      return attendance === "COMPLETED" ? null : `${name} has not completed this training, so there is nothing to reopen.`;
    case "REMOVE":
      if (attendance === "COMPLETED") return `${name} has completed this training, so they stay on record. Reopen it first if they were added by mistake.`;
      if (attendance === "ABSENT") return `${name} is marked absent, which stays on record. Undo absent first if they were added by mistake.`;
      if (p.hasFeedback) return `${name} has already given feedback, so they stay on record.`;
      return null;
  }
}

/** Why a staff member can't be added to a training, or null when they can. */
export function addParticipantBlock(staff: { name: string; status: StaffStatus }, alreadyAdded: boolean): string | null {
  if (alreadyAdded) return `${staff.name} is already on the list.`;
  if (staff.status !== "ACTIVE") return `${staff.name} has resigned.`;
  return null;
}

/** Why no one can be added to the training, or null when they can. */
export function addToTrainingBlock(t: { status: TrainingStatus }): string | null {
  return t.status === "CANCELLED" ? "This training is cancelled. Restore it first to add participants." : null;
}

/** At most this many staff in one add. */
export const MAX_ADD = 1000;
