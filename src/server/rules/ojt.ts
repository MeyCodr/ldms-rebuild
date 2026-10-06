// OJT recorded by clerks and L&D: on screen for many staff at once, or from
// the Excel template. Pure functions: the services enforce them and the
// import preview shows the same results before anything is saved.
//
// Whether each person is COMPLETED or still owes their answers follows the
// template's instructions (the clerks' template, rebuilt by buildOjtTemplate; Instructions sheet):
//   - answers given (what they learned, skill before and after): COMPLETED
//   - an OJT of 4 hours or less in total: COMPLETED, no answers needed
//   - otherwise: PENDING, and the person gives their answers on My Training

import type { Attendance, Designation, ParticipantSource, StaffStatus } from "@prisma/client";
import { MAX_ANSWER, type Answers } from "@/lib/forms/feedback";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { hasExtraAccess, isAdmin, type ManagedStaff, type SessionUser } from "../permissions";
import { dailyMinutes, dayNumber, MAX_CONSECUTIVE_DAYS, trainingHours } from "./training";

/** An OJT of this many hours or less is completed as soon as it is recorded. */
export const SHORT_OJT_HOURS = 4;

export type OjtStaff = ManagedStaff & { name: string; staffNo: string; status: StaffStatus };

/**
 * Why the user can't record OJT for this staff member, or null when they can.
 * Admin: anyone still employed. Clerks: contract staff only, and not someone
 * who holds extra access (a role, HOD or division head), as for staff records.
 */
export function ojtStaffBlock(user: SessionUser, staff: OjtStaff): string | null {
  const who = `${staff.name} (${staff.staffNo})`;
  if (staff.status !== "ACTIVE") return `${who} has resigned`;
  if (isAdmin(user)) return null;
  if (staff.designation !== "CONTRACT")
    return `${who} is ${DESIGNATION_LABELS[staff.designation as Designation].toLowerCase()} staff: clerks record OJT for contract staff only`;
  if (hasExtraAccess(staff)) return `${who} has extra access, so only an L&D admin can record their OJT`;
  return null;
}

/** COMPLETED when the answers are in or the OJT is short; otherwise the person still owes their answers. */
export function ojtEntryAttendance(hours: number | null, hasAnswers: boolean): Extract<Attendance, "COMPLETED" | "PENDING"> {
  return hasAnswers || (hours !== null && hours <= SHORT_OJT_HOURS) ? "COMPLETED" : "PENDING";
}

export type OjtPerson = { source: ParticipantSource; designation: Designation; name: string; staffNo: string };

/**
 * Why the user can't edit or delete an OJT from the OJT page, or null when
 * they can. Someone who recorded their own OJT changes it on My training.
 * Clerks change OJT recorded by a clerk or imported, while everyone on it is
 * contract staff; L&D change any other.
 */
export function ojtChangeBlock(user: SessionUser, people: OjtPerson[]): string | null {
  const self = people.find((p) => p.source === "SELF");
  if (self) return `${self.name} (${self.staffNo}) recorded this OJT themselves, so only they can change it, on My training.`;
  if (isAdmin(user)) return null;
  if (people.some((p) => p.source === "ADMIN")) return "The L&D unit recorded this OJT, so ask them to change it.";
  if (people.some((p) => p.designation !== "CONTRACT")) return "This OJT includes staff who aren't contract staff, so ask the L&D unit to change it.";
  return null;
}

/**
 * A person's attendance once an OJT's dates or times change. Where it was set
 * by the hours (completed because the OJT was short, or waiting for answers),
 * it follows the new hours. Answers given, and anything set by hand (absent,
 * say), stay as they are.
 */
export function ojtAttendanceAfterEdit(p: { attendance: Attendance; hasAnswers: boolean }, oldHours: number | null, newHours: number | null): Attendance {
  if (p.hasAnswers || p.attendance !== ojtEntryAttendance(oldHours, false)) return p.attendance;
  return ojtEntryAttendance(newHours, false);
}

// ---------- The Excel template ----------

/** The template's columns, as headed in row 1 (hints in brackets are ignored when matching). */
export const OJT_IMPORT_COLUMNS = [
  "Title",
  "Venue",
  "Start Date",
  "End Date",
  "Start Time",
  "End Time",
  "Trainer Type",
  "Trainer Name",
  "Participant Staff No",
  "What Did You Learn",
  "Skill Before Training 1-5",
  "Skill After Training 1-5",
] as const;
export type OjtImportColumn = (typeof OJT_IMPORT_COLUMNS)[number];

/** "Start Date (YYYY-MM-DD)" → "start date": how a heading is matched to a column. */
export const headingKey = (heading: string) =>
  heading
    .replace(/\(.*?\)/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** 2026-01-05, or 5/1/2026 (day first, as typed in Malaysia). Null when it isn't a real date. */
export function importDate(text: string): string | null {
  const s = text.trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null;
  return iso && dayNumber(iso) !== null ? iso : null;
}

/** 08:00, 8:00 or 08:00:00 (24-hour). Null when it isn't a time. */
export function importTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export type OjtImportRow = {
  title: string;
  venue: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  trainer: "INTERNAL" | "EXTERNAL";
  trainerName: string;
  staffNo: string;
  /** The OJT form's answers (a1 learned, a2 before, a3 after), or null when left blank. */
  answers: Answers | null;
  hours: number;
};

/**
 * Checks one row of the template. Returns every problem with the column it's
 * in, so the clerk can fix the whole row at once.
 */
export function checkOjtImportRow(raw: Record<OjtImportColumn, string>, today: Date): { row?: OjtImportRow; errors: string[] } {
  const errors: string[] = [];
  const v = (c: OjtImportColumn) => raw[c].trim();

  const title = v("Title");
  if (!title) errors.push("Title is empty");
  else if (title.length < 3) errors.push("Title: at least 3 characters");
  else if (title.length > 200) errors.push("Title: at most 200 characters");
  const venue = v("Venue");
  if (!venue) errors.push("Venue is empty");
  else if (venue.length > 160) errors.push("Venue: at most 160 characters");

  const startDate = v("Start Date") ? importDate(v("Start Date")) : null;
  const endDate = v("End Date") ? importDate(v("End Date")) : null;
  if (!v("Start Date")) errors.push("Start Date is empty");
  else if (!startDate) errors.push(`Start Date "${v("Start Date")}" is not a date (use YYYY-MM-DD)`);
  if (!v("End Date")) errors.push("End Date is empty");
  else if (!endDate) errors.push(`End Date "${v("End Date")}" is not a date (use YYYY-MM-DD)`);
  if (startDate && endDate) {
    const days = dayNumber(endDate)! - dayNumber(startDate)! + 1;
    if (days < 1) errors.push("End Date is before the Start Date");
    else if (days > MAX_CONSECUTIVE_DAYS) errors.push(`The OJT runs ${days} days: at most ${MAX_CONSECUTIVE_DAYS}`);
    else if (dayNumber(endDate)! > Math.floor(today.getTime() / 86_400_000)) errors.push("End Date is in the future: OJT is recorded once it has happened");
  }

  const startTime = v("Start Time") ? importTime(v("Start Time")) : null;
  const endTime = v("End Time") ? importTime(v("End Time")) : null;
  if (!v("Start Time")) errors.push("Start Time is empty");
  else if (!startTime) errors.push(`Start Time "${v("Start Time")}" is not a time (use HH:MM, 24-hour)`);
  if (!v("End Time")) errors.push("End Time is empty");
  else if (!endTime) errors.push(`End Time "${v("End Time")}" is not a time (use HH:MM, 24-hour)`);
  if (startTime && endTime && dailyMinutes(startTime, endTime) === null) errors.push("End Time must be after the Start Time");

  const trainerText = v("Trainer Type").toUpperCase();
  const trainer = trainerText === "INTERNAL" || trainerText === "EXTERNAL" ? trainerText : null;
  if (!trainerText) errors.push("Trainer Type is empty (INTERNAL or EXTERNAL)");
  else if (!trainer) errors.push(`Trainer Type "${v("Trainer Type")}" must be INTERNAL or EXTERNAL`);
  const trainerName = v("Trainer Name");
  if (!trainerName) errors.push("Trainer Name is empty");
  else if (trainerName.length > 160) errors.push("Trainer Name: at most 160 characters");

  const staffNo = v("Participant Staff No").toUpperCase();
  if (!staffNo) errors.push("Participant Staff No is empty");

  // The three answers come together or not at all.
  const learned = v("What Did You Learn");
  const before = v("Skill Before Training 1-5");
  const after = v("Skill After Training 1-5");
  const filled = [learned, before, after].filter(Boolean).length;
  let answers: Answers | null = null;
  if (filled > 0 && filled < 3) errors.push("What Did You Learn, Skill Before and Skill After: fill in all three or leave all three blank");
  else if (filled === 3) {
    const score = (s: string, label: string) => {
      if (/^[1-5]$/.test(s)) return Number(s);
      errors.push(`${label} "${s}" must be a whole number from 1 to 5`);
      return null;
    };
    const a2 = score(before, "Skill Before");
    const a3 = score(after, "Skill After");
    if (learned.length > MAX_ANSWER) errors.push(`What Did You Learn: at most ${MAX_ANSWER} characters`);
    else if (a2 !== null && a3 !== null) answers = { a1: learned, a2, a3 };
  }

  if (errors.length || !startDate || !endDate || !startTime || !endTime || !trainer) return { errors };
  const hours = trainingHours({ startDate, endDate, startTime, endTime })!;
  return { row: { title, venue, startDate, endDate, startTime, endTime, trainer, trainerName, staffNo, answers, hours }, errors };
}

/**
 * Rows that describe the same OJT share one training: the same title (exact
 * spelling and case, as the template says), venue, dates, times and trainer.
 */
export function ojtGroupKey(r: Pick<OjtImportRow, "title" | "venue" | "startDate" | "endDate" | "startTime" | "endTime" | "trainer" | "trainerName">): string {
  return [r.title, r.venue, r.startDate, r.endDate, r.startTime, r.endTime, r.trainer, r.trainerName].join("\u0000");
}
