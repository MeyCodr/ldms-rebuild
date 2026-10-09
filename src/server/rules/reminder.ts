// Reminders: the one email a person gets each day listing everything waiting
// on them, until it is done. Pure: which kinds exist, when each applies, and
// how the email reads. Who is waiting on what is worked out in
// services/reminder.ts with the same filters as "Waiting on you", so the
// email and the screen agree. The email itself is a Handlebars template
// (rules/emailTemplates.ts).

import { renderEmail } from "./emailTemplates";

export const REMINDER_KINDS = [
  "FEEDBACK",
  "PME_EVALUATE",
  "PME_RETURNED",
  "PME_ACKNOWLEDGE",
  "PME_VERIFY",
  "ATTENDANCE",
  "SKILL_FILL",
  "SKILL_APPROVE",
  "SKILL_RETURNED",
  "TNA_APPROVE",
  "TNA_RETURNED",
  "TNA_START",
  "TNI_START",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_INFO: Record<ReminderKind, { label: string; who: string; heading: string; href: string; action: string }> = {
  FEEDBACK: { label: "Feedback form not filled in after a training", who: "The participant", heading: "Trainings waiting for your feedback form", href: "/my-training", action: "Open My training" },
  PME_EVALUATE: { label: "PME to evaluate, its period over", who: "The HOD", heading: "PMEs to evaluate", href: "/approvals", action: "Open Approvals" },
  PME_RETURNED: { label: "PME sent back by L&D", who: "The HOD", heading: "PMEs L&D sent back to you", href: "/approvals", action: "Open Approvals" },
  PME_ACKNOWLEDGE: { label: "PME to acknowledge", who: "The staff member", heading: "Your PMEs to acknowledge", href: "/my-training", action: "Open My training" },
  PME_VERIFY: { label: "PME to verify", who: "L&D", heading: "PMEs to verify", href: "/approvals", action: "Open Approvals" },
  ATTENDANCE: { label: "Attendance not recorded after a training", who: "L&D", heading: "Trainings with attendance still to record", href: "/trainings", action: "Open Trainings" },
  SKILL_FILL: { label: "Skill matrices not submitted, in the quarter's last month", who: "The department's evaluators", heading: "Skill matrices still to fill in", href: "/skill-matrix", action: "Open Skill matrix" },
  SKILL_APPROVE: { label: "Skill matrix to approve", who: "The HOD", heading: "Skill matrices to approve", href: "/approvals", action: "Open Approvals" },
  SKILL_RETURNED: { label: "Skill matrix sent back", who: "Whoever filled it in", heading: "Skill matrices sent back to you", href: "/skill-matrix", action: "Open Skill matrix" },
  TNA_APPROVE: { label: "TNA to approve", who: "The HOD", heading: "TNAs to approve", href: "/approvals", action: "Open Approvals" },
  TNA_RETURNED: { label: "TNA sent back", who: "The staff member, or the main clerk for a job grade", heading: "TNAs sent back to you", href: "/tna", action: "Open TNA" },
  TNA_START: { label: "TNA not submitted, with a closing date near", who: "The staff member", heading: "Your TNA is not submitted yet", href: "/my-tna", action: "Open My TNA" },
  TNI_START: { label: "TNI not filled in, with a closing date near", who: "The HOD", heading: "TNIs not filled in yet", href: "/tni", action: "Open TNI" },
};

/**
 * The columns of each kind's table in the email, after "No." and before
 * "Days waiting". Kinds about other people name them by staff no. and name;
 * kinds about the reader's own records don't repeat who they are.
 */
export const REMINDER_COLUMNS: Record<ReminderKind, string[]> = {
  FEEDBACK: ["Training", "Ended"],
  PME_EVALUATE: ["Staff no.", "Staff name", "Training"],
  PME_RETURNED: ["Staff no.", "Staff name", "Training"],
  PME_ACKNOWLEDGE: ["Training"],
  PME_VERIFY: ["Staff no.", "Staff name", "Training"],
  ATTENDANCE: ["Training", "Ended", "Not recorded"],
  SKILL_FILL: ["Department", "Quarter", "Staff without one", "Closes on"],
  SKILL_APPROVE: ["Staff no.", "Staff name", "Quarter"],
  SKILL_RETURNED: ["Staff no.", "Staff name", "Quarter"],
  TNA_APPROVE: ["Staff no.", "Staff name", "Year"],
  TNA_RETURNED: ["TNA", "Year"],
  TNA_START: ["TNA", "Year", "Closes on"],
  TNI_START: ["Department", "Year", "Closes on"],
};

/** Columns whose text can run long and so may wrap; the rest (numbers, dates, years) stay on one line. */
const LONG_COLUMNS = ["Training", "Staff name", "Department", "TNA"];

/** A sent-back own TNA opens on My TNA; a job grade's on the TNA screen. The email's link follows what the person has. */
export const reminderHref = (kind: ReminderKind, items: ReminderItem[]) => (kind === "TNA_RETURNED" && items.every((i) => i.own) ? "/my-tna" : REMINDER_INFO[kind].href);

export type ReminderItem = {
  kind: ReminderKind;
  /** Who or what it is, in one line: for sorting, and for lists that have no columns. */
  text: string;
  /** The same, as the cells of its row in the email: one per column of REMINDER_COLUMNS for its kind. */
  cells: string[];
  /** The day it became this person's to do. Null: it has no such day (a count, or a closing date). */
  since: Date | null;
  /** TNA_RETURNED only: it is the person's own TNA. */
  own?: boolean;
};

// ---------- Settings ----------

export type ReminderSwitches = Record<ReminderKind, boolean>;

/** Which kinds are on. Every kind is on unless switched off. */
export function parseReminderSwitches(value: unknown): ReminderSwitches {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(REMINDER_KINDS.map((k) => [k, stored[k] !== false])) as ReminderSwitches;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A stored or submitted day (YYYY-MM-DD) as a date, or null. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);

/**
 * "Chase from": when L&D go live they choose a day, and anything that became
 * due before it is left out of the emails (it still shows on screen). An item
 * with no day of its own is always chased.
 */
export function isChased(item: Pick<ReminderItem, "since">, chaseFrom: Date | null): boolean {
  return !chaseFrom || !item.since || startOfDay(item.since).getTime() >= chaseFrom.getTime();
}

// ---------- When a kind applies ----------

/**
 * Skill matrices not yet submitted are chased only in the last month before
 * the quarter being filled in closes. That quarter closes when the calendar
 * quarter ends, so the last month is March, June, September or December.
 */
export const inSkillFillWindow = (today: Date) => today.getUTCMonth() % 3 === 2;

/** How long before the closing date people who haven't submitted a TNA or TNI start being reminded. */
export const CLOSING_NOTICE_DAYS = 14;

/** The closing date L&D set for a year's TNAs and TNIs. Kept in the tna.closingDate setting with the year it is for. */
export type Closing = { year: number; date: Date };

/** The stored closing date, if it is for the year now open. */
export function parseClosing(value: unknown, openYear: number): Closing | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { year?: unknown; date?: unknown };
  const date = parseDay(v.date);
  return v.year === openYear && date ? { year: openYear, date } : null;
}

/** People are reminded from 14 days before the closing date, and after it until they submit. No date: no one is chased to start. */
export function inClosingWindow(closing: Closing | null, today: Date): boolean {
  return !!closing && startOfDay(today).getTime() >= closing.date.getTime() - CLOSING_NOTICE_DAYS * DAY_MS;
}

/** Why this closing date can't be set, or null. It is a day from today to the end of the open year. */
export function closingDateBlock(date: Date | null, openYear: number, today: Date): string | null {
  if (!date) return "Enter a date.";
  if (date.getTime() < startOfDay(today).getTime()) return "The closing date can't be in the past.";
  if (date.getUTCFullYear() > openYear) return `The closing date for ${openYear}'s TNAs and TNIs can't be after ${openYear}.`;
  return null;
}

// ---------- The email ----------

export const daysWaiting = (since: Date, today: Date) => Math.max(0, Math.floor(startOfDay(today).getTime() / DAY_MS) - Math.floor(since.getTime() / DAY_MS));

/** How long a row has waited, for the email's last column: a number of days, or "Today". */
function waited(since: Date | null, today: Date): string {
  if (!since) return "";
  const days = daysWaiting(since, today);
  return days === 0 ? "Today" : String(days);
}

/** One email per person per day. */
export const digestKey = (staffId: number, today: Date) => `digest:${staffId}:${today.toISOString().slice(0, 10)}`;

/** How many lines of a kind the email lists before "and N more". */
export const DIGEST_LINES = 10;

/** The person's items grouped by kind, in the fixed order of REMINDER_KINDS, each group longest-waiting first. */
export function groupReminders(items: ReminderItem[]): { kind: ReminderKind; items: ReminderItem[] }[] {
  return REMINDER_KINDS.map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind).sort((a, b) => (a.since?.getTime() ?? Infinity) - (b.since?.getTime() ?? Infinity) || a.text.localeCompare(b.text)),
  })).filter((g) => g.items.length > 0);
}

export function digestSubject(count: number): string {
  return count === 1 ? "LDMS: 1 thing is waiting for you" : `LDMS: ${count} things are waiting for you`;
}

/**
 * The email: what is waiting, kind by kind, each as a table (No., who and
 * what, days waiting) with a button into LDMS. It names people and trainings and nothing else: no
 * marks, ratings or reasons. `link` turns an LDMS path into the full address.
 */
export function digestEmail(name: string, items: ReminderItem[], today: Date, link: (path: string) => string): { subject: string; html: string } {
  const one = items.length === 1;
  const subject = digestSubject(items.length);
  const html = renderEmail(
    "digest",
    {
      name,
      summary: one ? "1 thing is waiting for you in LDMS." : `${items.length} things are waiting for you in LDMS.`,
      closing: `You will get this email each day until ${one ? "it is" : "these are"} done.`,
      sections: groupReminders(items).map(({ kind, items: lines }) => ({
        heading: REMINDER_INFO[kind].heading,
        count: lines.length,
        columns: REMINDER_COLUMNS[kind],
        // The last column only where the rows have a day they became due.
        timed: lines.some((i) => i.since !== null),
        rows: lines.slice(0, DIGEST_LINES).map((i, n) => ({
          no: n + 1,
          cells: i.cells.map((text, c) => ({ text, nowrap: !LONG_COLUMNS.includes(REMINDER_COLUMNS[kind][c]) })),
          days: waited(i.since, today),
        })),
        more: Math.max(0, lines.length - DIGEST_LINES),
        span: REMINDER_COLUMNS[kind].length + 2,
        href: link(reminderHref(kind, lines)),
        action: REMINDER_INFO[kind].action,
      })),
    },
    subject,
    groupReminders(items)
      .map((g) => `${REMINDER_INFO[g.kind].heading} (${g.items.length})`)
      .join(" · "),
  );
  return { subject, html };
}
