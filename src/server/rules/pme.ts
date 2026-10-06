// PME (Performance Monitoring Evaluation) rules. Pure functions: the PME
// service enforces them, and the pages use the same ones to say what each
// person can do and why not.
//
//   attendance Completed   a PME is made for executives and managers who have
//                          a HOD (pmeRequirement); a short training's is
//                          NOT_REQUIRED from the start
//   PENDING                the evaluation period runs for three months from
//                          the day after the training ends; the HOD evaluates
//                          once it is over
//   EVALUATED              the staff member acknowledges it (with an optional comment)
//   ACKNOWLEDGED           L&D verify it, which locks it, or send it back to the HOD
//   VERIFIED               locked
//
// Decisions 1 to 7 in docs/phase-3-plan.md §3.

import type { Designation, PmeStatus, Prisma, StaffStatus, TrainingStatus, TrainingType } from "@prisma/client";
import { PME_QUESTION_IDS, type PmeAnswers } from "@/lib/forms/pme";
import { formatDate } from "@/lib/format";
import type { ApproverResult } from "./approver";
import { dayNumber } from "./training";

const DAY_MS = 86_400_000;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/** A training of this many hours or less needs no evaluation (the same line as a short OJT). */
export const PME_SHORT_HOURS = 4;
/** How long the evaluation period runs. */
export const PME_PERIOD_MONTHS = 3;

export type NoPmeReason = "OJT" | "DESIGNATION" | "IS_HEAD" | "RESIGNED";

export const NO_PME_LABELS: Record<NoPmeReason, string> = {
  OJT: "OJT has no PME",
  DESIGNATION: "PME is for executives and managers",
  IS_HEAD: "HODs and division heads have no one to evaluate them",
  RESIGNED: "Resigned",
};

export type PmeRequirement = { kind: "REQUIRED" } | { kind: "NOT_REQUIRED" } | { kind: "NONE"; reason: NoPmeReason };

/**
 * Whether someone who completed a training gets a PME. Executives and
 * managers only, for anything but OJT. HODs and division heads have no
 * approver, so none. A department without an active HOD still gets one: it
 * waits, and shows as having no one to evaluate it, until a HOD is set.
 */
export function pmeRequirement(
  staff: { status: StaffStatus; designation: Designation },
  training: { type: TrainingType; hours: number | null },
  approver: ApproverResult,
): PmeRequirement {
  if (training.type === "OJT") return { kind: "NONE", reason: "OJT" };
  if (staff.status !== "ACTIVE") return { kind: "NONE", reason: "RESIGNED" };
  if (staff.designation !== "EXECUTIVE" && staff.designation !== "MANAGER") return { kind: "NONE", reason: "DESIGNATION" };
  if (approver.basis === "NONE" && approver.reason !== "NO_HOD") return { kind: "NONE", reason: "IS_HEAD" };
  if (training.hours !== null && training.hours <= PME_SHORT_HOURS) return { kind: "NOT_REQUIRED" };
  return { kind: "REQUIRED" };
}

/**
 * The evaluation period: from the day after the training ends, for three
 * months. 31 Aug → 1 Sep to 1 Dec; 29 Nov → 30 Nov to 28 Feb (the end of a
 * shorter month).
 */
export function pmePeriod(training: { endDate: Date }): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(training.endDate.getTime() + DAY_MS);
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth() + PME_PERIOD_MONTHS;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const periodEnd = new Date(Date.UTC(y, m, Math.min(periodStart.getUTCDate(), lastDay)));
  return { periodStart, periodEnd };
}

/** The period is over the day after its last day (Malaysia time). */
export function pmePeriodEnded(pme: { periodEnd: Date }, today: Date): boolean {
  return dayOf(today) > dayNumber(pme.periodEnd)!;
}

/** The first day the HOD can evaluate. */
export const pmeOpensOn = (pme: { periodEnd: Date }) => new Date(pme.periodEnd.getTime() + DAY_MS);

/** What the attendance rules need to know about a participant's PME. */
export type PmeProgress = { status: PmeStatus; returnedAt: Date | null };

/**
 * A PME the HOD hasn't touched follows its participant: made, changed and
 * withdrawn with the attendance. One L&D sent back is PENDING again but keeps
 * the HOD's answers, so it stays.
 */
export const pmeFollowsAttendance = (pme: PmeProgress) => pme.status === "NOT_REQUIRED" || (pme.status === "PENDING" && pme.returnedAt === null);

// ---------- Where a PME stands ----------

/** PENDING split in two by the date: still in its period, or waiting for the HOD. */
export const PME_STAGES = ["IN_PERIOD", "TO_EVALUATE", "TO_ACKNOWLEDGE", "TO_VERIFY", "VERIFIED", "NOT_REQUIRED"] as const;
export type PmeStage = (typeof PME_STAGES)[number];

export const PME_STAGE_LABELS: Record<PmeStage, string> = {
  IN_PERIOD: "In evaluation period",
  TO_EVALUATE: "Waiting for HOD",
  TO_ACKNOWLEDGE: "Waiting for staff",
  TO_VERIFY: "Waiting for L&D",
  VERIFIED: "Verified",
  NOT_REQUIRED: "Not required",
};

export const PME_STAGE_TONE: Record<PmeStage, "ok" | "wait" | "na"> = {
  IN_PERIOD: "na",
  TO_EVALUATE: "wait",
  TO_ACKNOWLEDGE: "wait",
  TO_VERIFY: "wait",
  VERIFIED: "ok",
  NOT_REQUIRED: "na",
};

export function pmeStage(pme: { status: PmeStatus; periodEnd: Date }, today: Date): PmeStage {
  switch (pme.status) {
    case "NOT_REQUIRED":
      return "NOT_REQUIRED";
    case "PENDING":
      return pmePeriodEnded(pme, today) ? "TO_EVALUATE" : "IN_PERIOD";
    case "EVALUATED":
      return "TO_ACKNOWLEDGE";
    case "ACKNOWLEDGED":
      return "TO_VERIFY";
    case "VERIFIED":
      return "VERIFIED";
  }
}

/** The PMEs at a stage on a given day, as a database filter: the same lines pmeStage draws. */
export function pmeStageWhere(stage: PmeStage, today: Date): Prisma.PmeWhereInput {
  const day = new Date(dayOf(today) * DAY_MS);
  switch (stage) {
    case "NOT_REQUIRED":
      return { status: "NOT_REQUIRED" };
    case "IN_PERIOD":
      return { status: "PENDING", periodEnd: { gte: day } };
    case "TO_EVALUATE":
      return { status: "PENDING", periodEnd: { lt: day } };
    case "TO_ACKNOWLEDGE":
      return { status: "EVALUATED" };
    case "TO_VERIFY":
      return { status: "ACKNOWLEDGED" };
    case "VERIFIED":
      return { status: "VERIFIED" };
  }
}

// ---------- Who can do what ----------

export const PME_ACTIONS = ["EVALUATE", "ACKNOWLEDGE", "VERIFY", "SEND_BACK"] as const;
export type PmeAction = (typeof PME_ACTIONS)[number];

export type PmeState = {
  status: PmeStatus;
  periodEnd: Date;
  staff: { name: string; status: StaffStatus };
  training: { status: TrainingStatus };
};

/** What the signed-in person is to this PME. More than one can be true. */
export type PmeViewer = {
  /** The PME is about them. */
  isSubject: boolean;
  /** They are the staff member's approver today (their department's HOD). */
  isApprover: boolean;
  /** L&D: may verify or send back. */
  canVerify: boolean;
};

/** Why the person can't take this step, or null when they can. */
export function pmeActionBlock(action: PmeAction, pme: PmeState, viewer: PmeViewer, today: Date): string | null {
  const name = pme.staff.name;
  if (pme.training.status === "CANCELLED") return "This training was cancelled, so its PME is closed.";
  if (pme.status === "NOT_REQUIRED") return `The training was ${PME_SHORT_HOURS} hours or less, so no evaluation is needed.`;
  if (pme.status === "VERIFIED") return "The L&D unit has verified this PME, so it can't be changed.";

  switch (action) {
    case "EVALUATE":
      if (!viewer.isApprover) return `Only ${name}'s HOD can evaluate them.`;
      if (pme.status !== "PENDING") return `${name} has already been evaluated. Ask the L&D unit to send it back if it needs changing.`;
      if (pme.staff.status !== "ACTIVE") return `${name} has resigned, so there is nothing to evaluate.`;
      if (!pmePeriodEnded(pme, today))
        return `The evaluation period runs until ${formatDate(pme.periodEnd)}. You can evaluate from ${formatDate(pmeOpensOn(pme))}.`;
      return null;
    case "ACKNOWLEDGE":
      if (!viewer.isSubject) return `Only ${name} can acknowledge their own evaluation.`;
      if (pme.status === "PENDING") return "Your HOD hasn't evaluated you yet.";
      if (pme.status === "ACKNOWLEDGED") return "You have already acknowledged this evaluation.";
      return null;
    case "VERIFY":
      if (!viewer.canVerify) return "Only the L&D unit can verify a PME.";
      if (pme.status === "PENDING") return `${name}'s HOD hasn't evaluated them yet.`;
      // Someone who has left can't acknowledge, so theirs goes straight to L&D.
      if (pme.status === "EVALUATED" && pme.staff.status === "ACTIVE") return `${name} hasn't acknowledged the evaluation yet.`;
      return null;
    case "SEND_BACK":
      if (!viewer.canVerify) return "Only the L&D unit can send a PME back.";
      if (pme.status === "PENDING") return "This PME is already with the HOD.";
      return null;
  }
}

/** Why a completed participant's attendance can't be reopened, or null: an evaluated PME keeps it in place. */
export function pmeReopenBlock(name: string, pme: PmeProgress | null | undefined): string | null {
  if (!pme || pmeFollowsAttendance(pme)) return null;
  return `${name}'s HOD has already evaluated them for this training (PME), so their attendance stays completed.`;
}

// ---------- The mark ----------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The four percentages added up, and their average: the mark out of 100. */
export function pmeMark(answers: PmeAnswers): { total: number; average: number } {
  const total = PME_QUESTION_IDS.reduce((sum, id) => sum + answers[id].percent, 0);
  return { total, average: round2(total / PME_QUESTION_IDS.length) };
}
