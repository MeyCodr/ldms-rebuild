// Training rules. Pure functions with no database access, so the services,
// the reports and the training form's live preview all share one definition
// of training hours.
//
// Times come either from Prisma (@db.Time → a Date on 1970-01-01 UTC) or from
// a form ("08:30"). Dates come from Prisma (@db.Date → UTC midnight) or from a
// form ("2026-04-03").

import type { Attendance, Designation, StaffStatus, TrainingStatus, TrainingType } from "@prisma/client";

export type TimeValue = Date | string;
export type DateValue = Date | string;

export type SessionInput = { date: DateValue; startTime: TimeValue; endTime: TimeValue };

export type HoursInput = {
  startDate: DateValue;
  endDate: DateValue;
  startTime: TimeValue;
  endTime: TimeValue;
  /** When present and not empty, hours are the sum of the sessions. */
  sessions?: SessionInput[];
};

/** Without sessions, a training may run on at most this many consecutive days. */
export const MAX_CONSECUTIVE_DAYS = 60;
export const MAX_SESSIONS = 60;

const DAY_MS = 86_400_000;

/** Minutes since midnight, or null when the value is not a valid time. */
export function minutesOfDay(t: TimeValue): number | null {
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t.getUTCHours() * 60 + t.getUTCMinutes();
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Days since 1970-01-01, or null when the value is not a valid date. */
export function dayNumber(d: DateValue): number | null {
  let date: Date;
  if (d instanceof Date) date = d;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) date = new Date(`${d}T00:00:00Z`);
  else return null;
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  // Reject dates the Date constructor silently rolled over, like 2026-02-31.
  if (typeof d === "string" && date.toISOString().slice(0, 10) !== d) return null;
  return Math.floor(ms / DAY_MS);
}

/** Minutes between two times on the same day. Null unless end is after start (no overnight). */
export function dailyMinutes(start: TimeValue, end: TimeValue): number | null {
  const a = minutesOfDay(start);
  const b = minutesOfDay(end);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hours of a training: THE single definition, used for every total.
 * Without sessions: (endDate − startDate + 1 days) × (endTime − startTime).
 * With sessions: the sum of each session's endTime − startTime.
 * Rounded to 2 decimals. Null when the dates or times are not valid.
 */
export function trainingHours(t: HoursInput): number | null {
  if (t.sessions && t.sessions.length > 0) {
    let minutes = 0;
    for (const s of t.sessions) {
      const m = dailyMinutes(s.startTime, s.endTime);
      if (m === null || dayNumber(s.date) === null) return null;
      minutes += m;
    }
    return round2(minutes / 60);
  }
  const first = dayNumber(t.startDate);
  const last = dayNumber(t.endDate);
  const perDay = dailyMinutes(t.startTime, t.endTime);
  if (first === null || last === null || perDay === null || last < first) return null;
  return round2(((last - first + 1) * perDay) / 60);
}

/** Only completed attendance at a training that went ahead counts toward hours. */
export function countsTowardHours(p: { attendance: Attendance; training: { status: TrainingStatus } }): boolean {
  return p.attendance === "COMPLETED" && p.training.status !== "CANCELLED";
}

/** Days a training runs: one per session when it has sessions, otherwise start to end date inclusive. Null when the dates are not valid. */
export function trainingDays(t: Pick<HoursInput, "startDate" | "endDate" | "sessions">): number | null {
  if (t.sessions && t.sessions.length > 0) return new Set(t.sessions.map((s) => dayNumber(s.date))).size;
  const first = dayNumber(t.startDate);
  const last = dayNumber(t.endDate);
  return first === null || last === null || last < first ? null : last - first + 1;
}

/** Man hours: the training's hours × the people who completed it (as countsTowardHours); none for a cancelled training. */
export function manHours(t: { hours: number | null; completedCount: number; status: TrainingStatus }): number {
  return t.status === "CANCELLED" || t.hours === null ? 0 : round2(t.hours * t.completedCount);
}

/**
 * A training's code: "TR" ("OJT" for OJT), the day it was added as YYYYMMDD,
 * then 6 random digits, e.g. TR20261002909393. Given once when the training is
 * added and never changed, even if its type or dates are edited later.
 * `addedOn` is a Malaysia-local date (as from nowInMalaysia()); `random` is 0–999999.
 */
export function trainingCode(type: TrainingType, addedOn: Date, random: number): string {
  const day = addedOn.toISOString().slice(0, 10).replaceAll("-", "");
  return `${type === "OJT" ? "OJT" : "TR"}${day}${String(random).padStart(6, "0")}`;
}

export type SessionProblem = { index: number; message: string };

/** Problems with a list of sessions, each tied to the session's position (0-based). */
export function sessionProblems(sessions: SessionInput[]): SessionProblem[] {
  const problems: SessionProblem[] = [];
  if (sessions.length > MAX_SESSIONS) problems.push({ index: MAX_SESSIONS, message: `A training can have at most ${MAX_SESSIONS} sessions.` });
  const valid: { index: number; day: number; start: number; end: number }[] = [];
  sessions.forEach((s, index) => {
    const day = dayNumber(s.date);
    const start = minutesOfDay(s.startTime);
    const end = minutesOfDay(s.endTime);
    if (day === null) problems.push({ index, message: "Enter the date." });
    else if (start === null || end === null) problems.push({ index, message: "Enter the start and end times." });
    else if (end <= start) problems.push({ index, message: "The end time must be after the start time." });
    else valid.push({ index, day, start, end });
  });
  // Two sessions on the same day must not overlap.
  const sorted = [...valid].sort((a, b) => a.day - b.day || a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.day === prev.day && cur.start < prev.end)
      problems.push({ index: cur.index, message: `It overlaps session ${prev.index + 1} on the same day.` });
  }
  return problems.sort((a, b) => a.index - b.index);
}

/**
 * The overall date range and times of a training that runs in sessions: first
 * and last day, earliest start and latest end. Stored on the training so lists
 * and filters don't need the sessions.
 */
export function sessionSpan<S extends { date: Date; startTime: Date; endTime: Date }>(sessions: S[]) {
  if (sessions.length === 0) throw new Error("sessionSpan needs at least one session");
  const byTime = (a: Date, b: Date) => a.getTime() - b.getTime();
  const dates = sessions.map((s) => s.date).sort(byTime);
  const starts = sessions.map((s) => s.startTime).sort(byTime);
  const ends = sessions.map((s) => s.endTime).sort(byTime);
  return { startDate: dates[0], endDate: dates[dates.length - 1], startTime: starts[0], endTime: ends[ends.length - 1] };
}

export type TrainingPhase = "UPCOMING" | "IN_PROGRESS" | "HELD" | "CANCELLED";

/** Where a training stands on a given day (today in Malaysia time). */
export function trainingPhase(t: { status: TrainingStatus; startDate: Date; endDate: Date }, today: Date): TrainingPhase {
  if (t.status === "CANCELLED") return "CANCELLED";
  const day = Math.floor(today.getTime() / DAY_MS);
  if (day < dayNumber(t.startDate)!) return "UPCOMING";
  if (day > dayNumber(t.endDate)!) return "HELD";
  return "IN_PROGRESS";
}

/** Why a training can't be deleted, or null when it can. */
export function trainingDeleteBlock(t: { participantCount: number }): string | null {
  if (t.participantCount === 0) return null;
  const who = t.participantCount === 1 ? "1 participant" : `${t.participantCount} participants`;
  return `This training has ${who}, so it can't be deleted. Cancel it instead: the record is kept and its hours stop counting.`;
}

/** Designations that can be picked as an internal trainer: executive and above. */
export const INTERNAL_TRAINER_DESIGNATIONS = ["EXECUTIVE", "MANAGER"] as const satisfies readonly Designation[];

/** Only "internal training by internal trainer" picks the trainer from the staff list. */
export const usesInternalTrainer = (program: string | null | undefined) => program === "INTERNAL_INTERNAL_TRAINER";

/** An active executive or manager can be chosen as an internal trainer. */
export function canBeInternalTrainer(staff: { status: StaffStatus; designation: Designation }): boolean {
  return staff.status === "ACTIVE" && (INTERNAL_TRAINER_DESIGNATIONS as readonly Designation[]).includes(staff.designation);
}
