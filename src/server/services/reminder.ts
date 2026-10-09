import "server-only";
import type { Prisma } from "@prisma/client";
import { BASE_PATH } from "@/lib/base-path";
import { formatDate } from "@/lib/format";
import { db } from "../db";
import { UserError } from "../errors";
import { can, type SessionUser } from "../permissions";
import { resolveApprover } from "../rules/approver";
import { isEmail } from "../rules/mail";
import { pmeStageWhere } from "../rules/pme";
import {
  closingDateBlock,
  digestEmail,
  digestKey,
  inClosingWindow,
  inSkillFillWindow,
  isChased,
  parseClosing,
  parseDay,
  parseReminderSwitches,
  REMINDER_KINDS,
  type Closing,
  type ReminderItem,
  type ReminderKind,
  type ReminderSwitches,
} from "../rules/reminder";
import { quarterLabel, SKILL_DESIGNATIONS, skillOpenQuarter, skillQuarterCloses } from "../rules/skill";
import { TNA_OWN_WHERE, tnaGradeName } from "../rules/tna";
import { trainingPhaseWhere } from "../rules/training";
import { recordAudit } from "./audit";
import { mailTestMode, queueEmail, sendEmail, type SendResult } from "./mail";
import { approverInput, approverStaffSelect } from "./pmeSync";
import { tnaOpen } from "./tna";

// Reminders: who is waiting on what, for everyone at once (see
// rules/reminder.ts for the kinds and the email). Each kind uses the same
// filter as the matching part of "Waiting on you" (pmeWaiting, skillWaiting,
// tnaWaiting, feedbackWaiting, the overview's attendance to record), so a
// person's email lists what their screen shows.
//
// The daily job calls queueReminders: one email per person per day, written
// down under a key that makes a second run the same day queue nothing. People
// with no email address get none; they are counted for L&D, and still see
// what is waiting on their overview.
//
// Settings: reminders.kinds (which are on), reminders.chaseFrom (leave out
// what became due before this day) and tna.closingDate (see services/tna.ts).

const KINDS = "reminders.kinds";
const CHASE_FROM = "reminders.chaseFrom";
const CLOSING = "tna.closingDate";

const live: Prisma.PmeWhereInput = { participant: { training: { status: "SCHEDULED" } } };
const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / 86_400_000) * 86_400_000);

export async function reminderSettings(): Promise<{ switches: ReminderSwitches; chaseFrom: Date | null }> {
  const rows = await db.setting.findMany({ where: { key: { in: [KINDS, CHASE_FROM] } }, select: { key: true, value: true } });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  return { switches: parseReminderSwitches(value(KINDS)), chaseFrom: parseDay(value(CHASE_FROM)) };
}

/** L&D choose which kinds are sent and the day to chase from ("" for none). */
export async function setReminderSettings(user: SessionUser, on: ReminderKind[], chaseFrom: string) {
  if (!can(user, "jobs.manage")) throw new UserError("Only L&D manage reminders.");
  const from = chaseFrom ? parseDay(chaseFrom) : null;
  if (chaseFrom && !from) throw new UserError("Check the highlighted fields.", { chaseFrom: ["Enter a date, or leave it empty"] });
  return db.$transaction(async (tx) => {
    const rows = await tx.setting.findMany({ where: { key: { in: [KINDS, CHASE_FROM] } }, select: { key: true, value: true } });
    const before = parseReminderSwitches(rows.find((r) => r.key === KINDS)?.value);
    const beforeFrom = parseDay(rows.find((r) => r.key === CHASE_FROM)?.value);
    const next = Object.fromEntries(REMINDER_KINDS.map((k) => [k, on.includes(k)])) as ReminderSwitches;
    const changes: Record<string, [unknown, unknown]> = {};
    for (const k of REMINDER_KINDS) if (before[k] !== next[k]) changes[k] = [before[k] ? "on" : "off", next[k] ? "on" : "off"];
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    if (day(beforeFrom) !== day(from)) changes.chaseFrom = [day(beforeFrom), day(from)];
    if (!Object.keys(changes).length) return;
    await tx.setting.upsert({ where: { key: KINDS }, update: { value: next, updatedById: user.id }, create: { key: KINDS, value: next, updatedById: user.id } });
    await tx.setting.upsert({ where: { key: CHASE_FROM }, update: { value: day(from) ?? "", updatedById: user.id }, create: { key: CHASE_FROM, value: day(from) ?? "", updatedById: user.id } });
    const off = REMINDER_KINDS.filter((k) => !next[k]).length;
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Setting",
      entityId: "reminders",
      summary: `Changed the reminder settings: ${off === 0 ? "every kind on" : `${off} of ${REMINDER_KINDS.length} kinds off`}${from ? `, chasing from ${formatDate(from)}` : ""}`,
      changes,
    });
  });
}

/** The closing date L&D set for the open year's TNAs and TNIs, if any. */
export async function tnaClosing(openYear: number): Promise<Closing | null> {
  const setting = await db.setting.findUnique({ where: { key: CLOSING }, select: { value: true } });
  return parseClosing(setting?.value, openYear);
}

/**
 * L&D set, change or clear ("") the closing date of the open year's TNAs and
 * TNIs. It closes nothing by itself: it is the date people are reminded
 * about, from 14 days before.
 */
export async function setTnaClosingDate(user: SessionUser, value: string, today: Date): Promise<Closing | null> {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D set the closing date.");
  const openYear = await tnaOpen(today);
  const date = value ? parseDay(value) : null;
  if (value) {
    const block = closingDateBlock(date, openYear, today);
    if (block) throw new UserError(block, { closingDate: [block] });
  }
  return db.$transaction(async (tx) => {
    const before = parseClosing((await tx.setting.findUnique({ where: { key: CLOSING }, select: { value: true } }))?.value, openYear);
    const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
    if (day(before?.date) === day(date)) return before;
    const stored = date ? { year: openYear, date: day(date) } : {};
    await tx.setting.upsert({ where: { key: CLOSING }, update: { value: stored, updatedById: user.id }, create: { key: CLOSING, value: stored, updatedById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Setting",
      entityId: CLOSING,
      summary: date ? `Set the closing date for ${openYear}'s TNAs and TNIs to ${formatDate(date)}` : `Removed the closing date for ${openYear}'s TNAs and TNIs`,
      changes: { closingDate: [day(before?.date), day(date)] },
    });
    return date ? { year: openYear, date } : null;
  });
}

type Due = Map<number, ReminderItem[]>;

/**
 * Everything waiting, by the person it is waiting on, for the kinds that are
 * switched on. `today` is Malaysia's (nowInMalaysia). Only active staff are
 * in it. "Chase from" is applied here.
 */
export async function remindersDue(today: Date): Promise<Due> {
  const [{ switches, chaseFrom }, openYear] = await Promise.all([reminderSettings(), tnaOpen(today)]);
  const due: Due = new Map();
  const add = (staffId: number | null | undefined, item: ReminderItem) => {
    if (!staffId || !switches[item.kind] || !isChased(item, chaseFrom)) return;
    due.set(staffId, [...(due.get(staffId) ?? []), item]);
  };
  const day = startOfDay(today);
  const wants = (...kinds: ReminderKind[]) => kinds.some((k) => switches[k]);

  // L&D: everyone holding the role.
  const admins = wants("PME_VERIFY", "ATTENDANCE") ? (await db.staffRole.findMany({ where: { role: "LD_ADMIN", staff: { status: "ACTIVE" } }, select: { staffId: true } })).map((r) => r.staffId) : [];

  // 1. Feedback forms: the training has ended and the person hasn't filled theirs in.
  if (wants("FEEDBACK")) {
    const rows = await db.participant.findMany({
      where: { attendance: "PENDING", staff: { status: "ACTIVE" }, training: { status: "SCHEDULED", endDate: { lt: day } } },
      select: { staffId: true, training: { select: { title: true, endDate: true } } },
    });
    for (const p of rows) add(p.staffId, { kind: "FEEDBACK", text: `${p.training.title} (ended ${formatDate(p.training.endDate)})`, cells: [p.training.title, formatDate(p.training.endDate)], since: p.training.endDate });
  }

  // 2 and 3. PMEs whose period is over, to the HOD who evaluates today. One L&D sent back is listed apart.
  if (wants("PME_EVALUATE", "PME_RETURNED")) {
    const rows = await db.pme.findMany({
      where: { AND: [live, pmeStageWhere("TO_EVALUATE", today), { participant: { staff: { status: "ACTIVE" } } }] },
      select: { periodEnd: true, returnReason: true, returnedAt: true, participant: { select: { training: { select: { title: true } }, staff: { select: { ...approverStaffSelect, staffNo: true, name: true } } } } },
    });
    for (const p of rows) {
      const { staff, training } = p.participant;
      const text = `${staff.name}, ${training.title}`;
      const hodId = resolveApprover(approverInput(staff)).approverId;
      const cells = [staff.staffNo, staff.name, training.title];
      if (p.returnReason) add(hodId, { kind: "PME_RETURNED", text, cells, since: p.returnedAt ?? p.periodEnd });
      else add(hodId, { kind: "PME_EVALUATE", text, cells, since: p.periodEnd });
    }
  }

  // 4. PMEs the HOD has evaluated, to the staff member.
  if (wants("PME_ACKNOWLEDGE")) {
    const rows = await db.pme.findMany({
      where: { AND: [live, { status: "EVALUATED", participant: { staff: { status: "ACTIVE" } } }] },
      select: { evaluatedAt: true, participant: { select: { staffId: true, training: { select: { title: true } } } } },
    });
    for (const p of rows) add(p.participant.staffId, { kind: "PME_ACKNOWLEDGE", text: p.participant.training.title, cells: [p.participant.training.title], since: p.evaluatedAt });
  }

  // 5. PMEs to verify, to L&D: acknowledged, or evaluated for someone who has since left.
  if (wants("PME_VERIFY") && admins.length) {
    const rows = await db.pme.findMany({
      where: { AND: [live, { OR: [{ status: "ACKNOWLEDGED" }, { status: "EVALUATED", participant: { staff: { status: "RESIGNED" } } }] }] },
      select: { evaluatedAt: true, acknowledgedAt: true, participant: { select: { training: { select: { title: true } }, staff: { select: { staffNo: true, name: true } } } } },
    });
    for (const p of rows) for (const id of admins) add(id, { kind: "PME_VERIFY", text: `${p.participant.staff.name}, ${p.participant.training.title}`, cells: [p.participant.staff.staffNo, p.participant.staff.name, p.participant.training.title], since: p.acknowledgedAt ?? p.evaluatedAt });
  }

  // 6. Attendance to record, to L&D: this year's trainings that have been held with people still pending.
  if (wants("ATTENDANCE") && admins.length) {
    const year = today.getUTCFullYear();
    const rows = await db.training.findMany({
      where: { AND: [trainingPhaseWhere("HELD", today), { startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }, { participants: { some: { attendance: "PENDING" } } }] },
      select: { title: true, endDate: true, _count: { select: { participants: { where: { attendance: "PENDING" } } } } },
    });
    for (const t of rows) for (const id of admins) add(id, { kind: "ATTENDANCE", text: `${t.title}: ${t._count.participants} not recorded`, cells: [t.title, formatDate(t.endDate), String(t._count.participants)], since: t.endDate });
  }

  const quarter = skillOpenQuarter(today);

  // 7. Skill matrices not submitted, to the department's evaluators, in the last month before the quarter closes.
  if (wants("SKILL_FILL") && inSkillFillWindow(today)) {
    const departments = await db.department.findMany({
      select: {
        id: true,
        name: true,
        hodId: true,
        _count: {
          select: {
            staff: {
              where: {
                status: "ACTIVE",
                designation: { in: [...SKILL_DESIGNATIONS] },
                skillEvaluations: { none: { year: quarter.year, quarter: quarter.quarter, status: { in: ["SUBMITTED", "APPROVED"] } } },
              },
            },
          },
        },
      },
    });
    const missing = departments.filter((d) => d._count.staff > 0);
    if (missing.length) {
      // A manager, the main clerk or a named evaluator, in their own department, unless they are its HOD.
      const evaluators = await db.staff.findMany({
        where: { status: "ACTIVE", departmentId: { in: missing.map((d) => d.id) }, OR: [{ designation: "MANAGER" }, { roles: { some: { role: { in: ["MAIN_CLERK", "SKILL_EVALUATOR"] } } } }] },
        select: { id: true, departmentId: true },
      });
      const closes = formatDate(skillQuarterCloses(quarter));
      for (const d of missing)
        for (const e of evaluators)
          if (e.departmentId === d.id && e.id !== d.hodId)
            add(e.id, {
              kind: "SKILL_FILL",
              text: `${d._count.staff} staff in ${d.name} have no skill matrix submitted for ${quarterLabel(quarter)}, which closes on ${closes}`,
              cells: [d.name, quarterLabel(quarter), String(d._count.staff), closes],
              since: null,
            });
    }
  }

  // 8 and 9. Skill matrices to approve (the HOD), and ones sent back (whoever filled them in).
  if (wants("SKILL_APPROVE", "SKILL_RETURNED")) {
    const rows = await db.skillEvaluation.findMany({
      where: { OR: [{ status: "SUBMITTED" }, { status: "DRAFT", returnReason: { not: null }, year: quarter.year, quarter: quarter.quarter }] },
      select: { status: true, year: true, quarter: true, submittedAt: true, returnedAt: true, createdById: true, staff: { select: { staffNo: true, name: true, department: { select: { hodId: true, hod: { select: { status: true } } } } } } },
    });
    for (const m of rows) {
      const text = `${m.staff.name}, ${quarterLabel(m)}`;
      const cells = [m.staff.staffNo, m.staff.name, quarterLabel(m)];
      if (m.status === "SUBMITTED") add(m.staff.department.hod?.status === "ACTIVE" ? m.staff.department.hodId : null, { kind: "SKILL_APPROVE", text, cells, since: m.submittedAt });
      else add(m.createdById, { kind: "SKILL_RETURNED", text, cells, since: m.returnedAt });
    }
  }

  // 10 and 11. TNAs to approve (the HOD, never their own), and ones sent back (the person, or the main clerks for a job grade's).
  if (wants("TNA_APPROVE", "TNA_RETURNED")) {
    const hod = { select: { id: true, name: true, hodId: true, hod: { select: { status: true } } } } as const;
    const rows = await db.tna.findMany({
      where: { OR: [{ status: "SUBMITTED" }, { status: "DRAFT", returnReason: { not: null }, year: openYear }] },
      select: { status: true, year: true, staffId: true, jobGrade: true, submittedAt: true, returnedAt: true, staff: { select: { staffNo: true, name: true, department: hod } }, department: hod },
    });
    const clerks = await db.staff.findMany({ where: { status: "ACTIVE", roles: { some: { role: "MAIN_CLERK" } } }, select: { id: true, departmentId: true } });
    for (const t of rows) {
      const department = t.staff ? t.staff.department : t.department;
      if (!department) continue;
      const who = t.staff ? t.staff.name : tnaGradeName(department.name, t.jobGrade ?? 0);
      if (t.status === "SUBMITTED") {
        const hodId = department.hod?.status === "ACTIVE" ? department.hodId : null;
        // A job grade's has no staff no.: its row names the department and grade.
        if (hodId !== t.staffId) add(hodId, { kind: "TNA_APPROVE", text: `${who}, ${t.year}`, cells: [t.staff?.staffNo ?? "–", who, String(t.year)], since: t.submittedAt });
      } else if (t.staffId) add(t.staffId, { kind: "TNA_RETURNED", text: `Your TNA for ${t.year}`, cells: ["Your own TNA", String(t.year)], since: t.returnedAt, own: true });
      else
        for (const c of clerks)
          if (c.departmentId === department.id && c.id !== department.hodId) add(c.id, { kind: "TNA_RETURNED", text: `${who}, ${t.year}`, cells: [who, String(t.year)], since: t.returnedAt });
    }
  }

  // 12 and 13. Not submitted with the closing date near: only when L&D have set one.
  if (wants("TNA_START", "TNI_START")) {
    const closing = await tnaClosing(openYear);
    if (closing && inClosingWindow(closing, today)) {
      const closes = formatDate(closing.date);
      if (switches.TNA_START) {
        // Those who fill in their own, with none for the year or a draft never submitted. One sent back is listed above instead.
        const staff = await db.staff.findMany({
          where: { ...TNA_OWN_WHERE, tnas: { none: { year: openYear, OR: [{ status: { in: ["SUBMITTED", "APPROVED"] } }, { returnReason: { not: null } }] } } },
          select: { id: true },
        });
        for (const s of staff) add(s.id, { kind: "TNA_START", text: `Your TNA for ${openYear} closes on ${closes}`, cells: ["Your own TNA", String(openYear), closes], since: null });
      }
      if (switches.TNI_START) {
        const departments = await db.department.findMany({ where: { hod: { status: "ACTIVE" }, tnis: { none: { year: openYear } } }, select: { name: true, hodId: true } });
        for (const d of departments) add(d.hodId, { kind: "TNI_START", text: `${d.name}'s TNI for ${openYear} closes on ${closes}`, cells: [d.name, String(openYear), closes], since: null });
      }
    }
  }

  // Someone who has since resigned (a HOD still named on a department, an evaluator who left) is not chased.
  const active = new Set((await db.staff.findMany({ where: { id: { in: [...due.keys()] }, status: "ACTIVE" }, select: { id: true } })).map((s) => s.id));
  for (const id of [...due.keys()]) if (!active.has(id)) due.delete(id);
  return due;
}

const appLink = (path: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${BASE_PATH}${path}`;

export type ReminderPerson = { id: number; staffNo: string; name: string; email: string | null; department: string; items: ReminderItem[] };

/** Everyone with something waiting today, the most items first, with who they are. */
export async function reminderPeople(today: Date): Promise<ReminderPerson[]> {
  const due = await remindersDue(today);
  const staff = await db.staff.findMany({ where: { id: { in: [...due.keys()] } }, select: { id: true, staffNo: true, name: true, email: true, department: { select: { name: true } } } });
  return staff
    .map((s) => ({ id: s.id, staffNo: s.staffNo, name: s.name, email: s.email && isEmail(s.email.trim()) ? s.email.trim() : null, department: s.department.name, items: due.get(s.id) ?? [] }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

const ensureManager = (user: SessionUser) => {
  if (!can(user, "jobs.manage")) throw new UserError("Only L&D manage reminders.");
};

/** For L&D's screen: the settings, and who would be emailed if the daily job ran now. */
export async function reminderOverview(user: SessionUser, today: Date) {
  ensureManager(user);
  const [settings, people, openYear] = await Promise.all([reminderSettings(), reminderPeople(today), tnaOpen(today)]);
  const perKind = Object.fromEntries(REMINDER_KINDS.map((k) => [k, { items: 0, people: 0 }])) as Record<ReminderKind, { items: number; people: number }>;
  for (const p of people)
    for (const k of REMINDER_KINDS) {
      const n = p.items.filter((i) => i.kind === k).length;
      if (n) perKind[k] = { items: perKind[k].items + n, people: perKind[k].people + 1 };
    }
  return { ...settings, people, perKind, withEmail: people.filter((p) => p.email).length, closing: await tnaClosing(openYear), openYear, skillWindow: inSkillFillWindow(today) };
}

/** The email one person would get today, for L&D to read. Null: nothing is waiting on them. */
export async function reminderPreview(user: SessionUser, staffId: number, today: Date) {
  ensureManager(user);
  const person = (await reminderPeople(today)).find((p) => p.id === staffId);
  if (!person) return null;
  return { person, email: digestEmail(person.name, person.items, today, appLink) };
}

/**
 * L&D send themselves a copy of the reminder one person would get today, to
 * see it in their own mail program. It goes to the L&D person's own address
 * (or the test address in Test mode), never to the person it is about, and
 * doesn't count as that person's reminder for the day.
 */
export async function sendReminderCopy(user: SessionUser, staffId: number, today: Date): Promise<{ status: SendResult; sentTo: string; error: string | null }> {
  const preview = await reminderPreview(user, staffId, today);
  if (!preview) throw new UserError("Nothing is waiting on this person any more, so there is no email to send.");
  const [testMode, me] = await Promise.all([mailTestMode(), db.staff.findUnique({ where: { id: user.id }, select: { email: true } })]);
  const mine = me?.email?.trim() || (testMode.enabled ? testMode.address : "");
  if (!isEmail(mine)) throw new UserError("Your staff record has no email address, so there is nowhere to send it. Add your email on your staff record first.");
  const id = await queueEmail({
    kind: "copy",
    staffId: user.id,
    intendedTo: mine,
    subject: `[Copy of ${preview.person.name}'s reminder] ${preview.email.subject}`,
    body: preview.email.html,
    dedupeKey: `copy:${user.id}:${Date.now()}`,
  });
  if (!id) throw new UserError("That copy was already sent. Try again.");
  const status = await sendEmail(id);
  const row = await db.emailMessage.findUnique({ where: { id }, select: { sentTo: true, error: true } });
  return { status, sentTo: row?.sentTo ?? "", error: row?.error ?? null };
}

export type QueuedReminders = { due: number; queued: number; noEmail: number; noEmailByDepartment: Record<string, number> };

/**
 * The daily job's step: writes down today's email for each person with
 * something waiting. One per person per day, so a second run queues nothing
 * new. People with no usable email address are counted, by department.
 */
export async function queueReminders(today: Date): Promise<QueuedReminders> {
  const people = await reminderPeople(today);
  const result: QueuedReminders = { due: people.length, queued: 0, noEmail: 0, noEmailByDepartment: {} };
  for (const p of people) {
    if (!p.email) {
      result.noEmail++;
      result.noEmailByDepartment[p.department] = (result.noEmailByDepartment[p.department] ?? 0) + 1;
      continue;
    }
    const email = digestEmail(p.name, p.items, today, appLink);
    const id = await queueEmail({ kind: "digest", staffId: p.id, intendedTo: p.email, subject: email.subject, body: email.html, dedupeKey: digestKey(p.id, today) });
    if (id) result.queued++;
  }
  return result;
}
