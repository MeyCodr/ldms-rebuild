import "server-only";
import type { Prisma, TnaSection } from "@prisma/client";
import { parseTnaContent, TNA_METHODS, TNA_SECTIONS, tnaContentProblems, type TnaContent, type TnaProblem } from "@/lib/forms/tna";
import { plural } from "@/lib/format";
import { db } from "../db";
import { UserError } from "../errors";
import { can, type SessionUser } from "../permissions";
import {
  JOB_GRADES,
  TNA_ACTIONS,
  TNA_BY_GRADE_WHERE,
  TNA_OWN_WHERE,
  TNA_STAGES,
  tnaActionBlock,
  tnaDepartmentScope,
  tnaGradeName,
  tnaKind,
  tnaMyBlock,
  tnaOpenedEarly,
  tnaOpenYear,
  tnaOwnBlock,
  tnaStaffScope,
  tnaStage,
  tnaStartBlock,
  tnaTitle,
  tnaViewer,
  type TnaAction,
  type TnaOwner,
  type TnaStage,
} from "../rules/tna";
import { countsTowardHours, trainingHours } from "../rules/training";
import { recordAudit } from "./audit";

// TNA: one per year for each person who fills in their own, and one per job
// grade per department (see rules/tna.ts for who fills in, who approves and
// which year is open). A TNA the user may not open is treated as not found.
//
// Audit entries use entity "Tna" with the TNA's id. The rows themselves
// aren't diffed into the log: the entry says what happened and how many rows
// the TNA has.

export const MAX_TNA_REASON = 255;
export const TNA_PAGE_SIZE = 100;

const gone = () => new UserError("This TNA no longer exists.");

const hodSelect = { select: { id: true, name: true, status: true } } as const;

const staffSelect = {
  id: true,
  staffNo: true,
  name: true,
  position: true,
  designation: true,
  status: true,
  jobGrade: true,
  fillsOwnTna: true,
  departmentId: true,
  department: { select: { id: true, name: true, divisionId: true, hod: hodSelect } },
  section: { select: { name: true } },
  hodOf: { select: { id: true } },
  headOf: { select: { id: true } },
} satisfies Prisma.StaffSelect;

const person = { select: { name: true, staffNo: true } } as const;

const tnaSelect = {
  id: true,
  year: true,
  staffId: true,
  departmentId: true,
  jobGrade: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  returnReason: true,
  returnedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: person,
  submittedBy: person,
  approvedBy: person,
  returnedBy: person,
  staff: { select: staffSelect },
  department: { select: { id: true, name: true, divisionId: true, hod: hodSelect } },
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, section: true, problem: true, optionId: true, trainingName: true, targetSkill: true, currentSkill: true, method: true, month: true },
  },
} satisfies Prisma.TnaSelect;

type TnaRecord = Prisma.TnaGetPayload<{ select: typeof tnaSelect }>;
type StaffRecord = Prisma.StaffGetPayload<{ select: typeof staffSelect }>;

const isHead = (s: { hodOf: unknown[]; headOf: unknown[] }) => s.hodOf.length > 0 || s.headOf.length > 0;
const staffOwner = (s: Pick<StaffRecord, "id" | "name" | "departmentId" | "department">): TnaOwner => ({
  staffId: s.id,
  departmentId: s.departmentId,
  divisionId: s.department.divisionId,
  name: s.name,
});
const gradeOwner = (d: { id: number; name: string; divisionId: number }, jobGrade: number): TnaOwner => ({
  staffId: null,
  departmentId: d.id,
  divisionId: d.divisionId,
  name: tnaGradeName(d.name, jobGrade),
});

/** A TNA with what the pages need worked out: whose it is, where it stands, and what this user can do. */
function view(t: TnaRecord, user: SessionUser, openYear: number) {
  // Exactly one of staff and department is set; the department shown is the person's today, or the job grade's.
  const department = t.staff ? t.staff.department : t.department!;
  const owner = t.staff ? staffOwner(t.staff) : gradeOwner(department, t.jobGrade!);
  const viewer = tnaViewer(user, owner);
  const state = { year: t.year, status: t.status, owner };
  const hod = department.hod;
  return {
    ...t,
    owner,
    department: { id: department.id, name: department.name },
    stage: tnaStage(t),
    /** The HOD who approves, today. Null when the department has no active HOD. */
    approver: hod && hod.status === "ACTIVE" ? { id: hod.id, name: hod.name } : null,
    content: t.items.map((i) => ({
      section: i.section,
      problem: i.problem,
      optionId: i.optionId,
      trainingName: i.trainingName,
      target: i.targetSkill,
      current: i.currentSkill,
      method: i.method,
      month: i.month,
    })) as TnaContent,
    viewer,
    /** Why this user can't take each step, or null when they can. */
    blocked: Object.fromEntries(TNA_ACTIONS.map((a) => [a, tnaActionBlock(a, state, viewer, openYear)])) as Record<TnaAction, string | null>,
  };
}

export type TnaView = ReturnType<typeof view>;

// ---------- The open year ----------

const YEAR_SETTING = "tna.year";

/**
 * The year being filled in, for the TNA and the TNI alike: this calendar
 * year, or next year once L&D have opened it early (the tna.year setting; see
 * tnaOpenYear in rules/tna.ts).
 */
export async function tnaOpen(today: Date): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: YEAR_SETTING }, select: { value: true } });
  return tnaOpenYear(today, typeof setting?.value === "number" ? setting.value : null);
}

/** What L&D's year switch on the TNA screen shows: the open year, whether it was opened early, and why it can't be switched (or null). */
export async function tnaYearSwitch(user: SessionUser, today: Date) {
  const open = await tnaOpen(today);
  const calendar = today.getUTCFullYear();
  const early = tnaOpenedEarly(today, open);
  const started = early ? (await db.tna.count({ where: { year: open } })) + (await db.tni.count({ where: { year: open } })) : 0;
  return {
    open,
    calendar,
    early,
    mayManage: can(user, "tna.manage"),
    /** Why next year's can't be closed again, once opened early. */
    closeBlock: early && started > 0 ? `${started === 1 ? "A TNA or TNI" : `${started} TNAs and TNIs`} for ${open} ${started === 1 ? "has" : "have"} already been started, so ${open} stays open.` : null,
  };
}

/** L&D open next year's TNAs and TNIs before January. This year's close at the same moment: one year is open at a time. */
export async function openNextTnaYear(user: SessionUser, today: Date) {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D can open a year's TNAs.");
  const calendar = today.getUTCFullYear();
  return db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: YEAR_SETTING }, select: { value: true } });
    if (tnaOpenYear(today, typeof before?.value === "number" ? before.value : null) !== calendar) throw new UserError(`${calendar + 1}'s TNAs are already open.`);
    await tx.setting.upsert({ where: { key: YEAR_SETTING }, update: { value: calendar + 1, updatedById: user.id }, create: { key: YEAR_SETTING, value: calendar + 1, updatedById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Setting",
      entityId: YEAR_SETTING,
      summary: `Opened ${calendar + 1}'s TNAs and TNIs early; ${calendar}'s are now closed`,
      changes: { year: [calendar, calendar + 1] },
    });
    return calendar + 1;
  });
}

/** L&D close next year's again, if it was opened by mistake and no one has started one. This year's reopen. */
export async function closeNextTnaYear(user: SessionUser, today: Date) {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D can close a year's TNAs.");
  const calendar = today.getUTCFullYear();
  return db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: YEAR_SETTING }, select: { value: true } });
    if (tnaOpenYear(today, typeof before?.value === "number" ? before.value : null) === calendar) throw new UserError(`${calendar + 1}'s TNAs aren't open.`);
    const started = (await tx.tna.count({ where: { year: calendar + 1 } })) + (await tx.tni.count({ where: { year: calendar + 1 } }));
    if (started > 0) throw new UserError(`${started === 1 ? "A TNA or TNI" : `${started} TNAs and TNIs`} for ${calendar + 1} ${started === 1 ? "has" : "have"} already been started, so ${calendar + 1} stays open.`);
    await tx.setting.update({ where: { key: YEAR_SETTING }, data: { value: calendar, updatedById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Setting",
      entityId: YEAR_SETTING,
      summary: `Closed ${calendar + 1}'s TNAs and TNIs again; ${calendar}'s are open`,
      changes: { year: [calendar + 1, calendar] },
    });
    return calendar;
  });
}

// ---------- One TNA ----------

/** One TNA, or null (also when the user may not open it). */
export async function getTna(user: SessionUser, id: number, today: Date): Promise<TnaView | null> {
  const openYear = await tnaOpen(today);
  const t = await db.tna.findUnique({ where: { id }, select: tnaSelect });
  if (!t) return null;
  const v = view(t, user, openYear);
  return v.viewer.canView ? v : null;
}

/** The signed-in person's own TNA for a year, or null when they have none. */
export async function myTna(user: SessionUser, year: number, today: Date): Promise<TnaView | null> {
  const openYear = await tnaOpen(today);
  const t = await db.tna.findUnique({ where: { year_staffId: { year, staffId: user.id } }, select: tnaSelect });
  return t ? view(t, user, openYear) : null;
}

/**
 * How the signed-in person's training needs are recorded, and the years they
 * have a TNA on record (newest first). `block` is why they have none of their
 * own, or null when they fill one in.
 */
export async function myTnaInfo(user: SessionUser) {
  const staff = await db.staff.findUniqueOrThrow({
    where: { id: user.id },
    select: { ...staffSelect, tnas: { orderBy: { year: "desc" }, select: { id: true, year: true, status: true, returnReason: true, _count: { select: { items: true } } } } },
  });
  const { tnas, ...s } = staff;
  return { staff: s, block: tnaMyBlock({ ...s, isHead: isHead(s) }), years: tnas.map((t) => ({ ...t, stage: tnaStage(t) })) };
}

/** Whose TNA is being started: a person's (staffId) or a job grade's in a department. */
export type TnaTarget = { staffId: number } | { departmentId: number; jobGrade: number };

async function resolveTarget(client: Prisma.TransactionClient | typeof db, user: SessionUser, target: TnaTarget, openYear: number) {
  const year = openYear;
  if ("staffId" in target) {
    const staff = await client.staff.findUnique({ where: { id: target.staffId }, select: { ...staffSelect, tnas: { where: { year }, select: { id: true } } } });
    if (!staff) return null;
    const owner = staffOwner(staff);
    const viewer = tnaViewer(user, owner);
    const existingId = staff.tnas[0]?.id ?? null;
    return {
      owner,
      viewer,
      staff,
      department: { id: staff.department.id, name: staff.department.name },
      jobGrade: null,
      headcount: null,
      year,
      existingId,
      blocked: tnaStartBlock(owner, viewer, tnaOwnBlock({ ...staff, isHead: isHead(staff) }), existingId !== null, year, openYear),
    };
  }
  if (!(JOB_GRADES as readonly number[]).includes(target.jobGrade)) return null;
  const department = await client.department.findUnique({
    where: { id: target.departmentId },
    select: { id: true, name: true, divisionId: true, tnas: { where: { year, jobGrade: target.jobGrade }, select: { id: true } } },
  });
  if (!department) return null;
  const headcount = await client.staff.count({ where: { ...TNA_BY_GRADE_WHERE, departmentId: department.id, jobGrade: target.jobGrade } });
  const owner = gradeOwner(department, target.jobGrade);
  const viewer = tnaViewer(user, owner);
  const existingId = department.tnas[0]?.id ?? null;
  const subject = headcount === 0 ? `No one in ${department.name} is covered by job grade ${target.jobGrade}, so there is nothing to fill in.` : null;
  return {
    owner,
    viewer,
    staff: null,
    department: { id: department.id, name: department.name },
    jobGrade: target.jobGrade,
    headcount,
    year,
    existingId,
    blocked: tnaStartBlock(owner, viewer, subject, existingId !== null, year, openYear),
  };
}

/** Who a new TNA would be for this year, with why it can't be started (or null). Null when the user may not see it. */
export async function tnaStartFor(user: SessionUser, target: TnaTarget, today: Date) {
  const start = await resolveTarget(db, user, target, await tnaOpen(today));
  return start && start.viewer.canView ? start : null;
}

/**
 * The latest earlier TNA of the same owner that has rows: what "Start from
 * last year's" copies. Its rows come back as content, with options that have
 * since been hidden or removed turned into typed-in names.
 */
export async function tnaToCopy(owner: Pick<TnaOwner, "staffId" | "departmentId">, jobGrade: number | null, year: number) {
  const previous = await db.tna.findFirst({
    where: { ...(owner.staffId !== null ? { staffId: owner.staffId } : { departmentId: owner.departmentId, jobGrade }), year: { lt: year }, items: { some: {} } },
    orderBy: { year: "desc" },
    select: { id: true, year: true, items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { ...tnaSelect.items.select, option: { select: { active: true } } } } },
  });
  if (!previous) return null;
  const content: TnaContent = previous.items.map((i) => ({
    section: i.section,
    problem: i.problem,
    optionId: i.option?.active ? i.optionId : null,
    trainingName: i.trainingName,
    target: i.targetSkill,
    current: i.currentSkill,
    method: i.method,
    month: i.month,
  }));
  return { id: previous.id, year: previous.year, content };
}

/**
 * A person's training hours in a year, from completed attendance: what the
 * old TNA form showed beside the form, to help decide what is still needed.
 */
export async function tnaTrainingHours(staffId: number, year: number) {
  const rows = await db.participant.findMany({
    where: { staffId, attendance: "COMPLETED", training: { startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } } },
    select: {
      attendance: true,
      training: { select: { type: true, status: true, startDate: true, endDate: true, startTime: true, endTime: true, sessions: { select: { date: true, startTime: true, endTime: true } } } },
    },
  });
  let ojt = 0;
  let courses = 0;
  for (const p of rows) {
    if (!countsTowardHours(p)) continue;
    const hours = trainingHours(p.training) ?? 0;
    if (p.training.type === "OJT") ojt += hours;
    else courses += hours;
  }
  return { ojt, courses, total: ojt + courses };
}

/** How many staff a department's TNA for a job grade covers today. */
export async function tnaGradeHeadcount(departmentId: number, jobGrade: number) {
  return db.staff.count({ where: { ...TNA_BY_GRADE_WHERE, departmentId, jobGrade } });
}

/** The latest audit entries for one TNA. */
export async function tnaHistory(id: number) {
  return db.auditLog.findMany({
    where: { entity: "Tna", entityId: String(id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
    include: { actor: { select: { name: true } } },
  });
}

// ---------- Training options, for the form ----------

/**
 * Each section's "Training required" list, as the form shows it: ungrouped
 * options first, then each group in order. Hidden options are left out,
 * except those in `keep` (already on the TNA being edited), so a saved row
 * still finds its training.
 */
export async function tnaFormOptions(keep: number[] = []) {
  const options = await db.tnaTrainingOption.findMany({
    where: { OR: [{ active: true }, { id: { in: keep } }] },
    select: { id: true, section: true, name: true, sortOrder: true, active: true, category: { select: { name: true, sortOrder: true } } },
  });
  options.sort(
    (a, b) =>
      Number(a.category !== null) - Number(b.category !== null) ||
      (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0) ||
      a.sortOrder - b.sortOrder ||
      a.id - b.id,
  );
  return Object.fromEntries(
    TNA_SECTIONS.map((s) => [s, options.filter((o) => o.section === s).map((o) => ({ id: o.id, name: o.name, group: o.category?.name ?? null, active: o.active }))]),
  ) as Record<TnaSection, { id: number; name: string; group: string | null; active: boolean }[]>;
}

export type TnaFormOptions = Awaited<ReturnType<typeof tnaFormOptions>>;

// ---------- Saving ----------

/** The content problems as a user error the form can place: each tied to its section or row. */
export class TnaContentError extends UserError {
  constructor(public problems: TnaProblem[]) {
    const whole = problems.find((p) => p.at === "form");
    // Other problems are shown in their place in the form, so the message at the top only points there.
    super(whole ? whole.message : "Check the highlighted rows.");
  }
}

/**
 * Reads and checks the form's content, and looks each chosen option up in
 * its section's list: the name saved is the list's. A hidden option is
 * accepted only if the TNA already had it (`had`).
 */
async function checked(tx: Prisma.TransactionClient, json: string, mode: "draft" | "submit", had: (number | null)[] = []): Promise<TnaContent> {
  const content = parseTnaContent(json);
  if (!content) throw new UserError("The form didn't arrive in one piece. Reload the page and try again.");
  const problems = tnaContentProblems(content, mode);
  const ids = [...new Set(content.map((r) => r.optionId).filter((id): id is number => id !== null))];
  const options = new Map((await tx.tnaTrainingOption.findMany({ where: { id: { in: ids } }, select: { id: true, section: true, name: true, active: true } })).map((o) => [o.id, o]));
  content.forEach((r, row) => {
    if (r.optionId === null) return;
    const option = options.get(r.optionId);
    if (!option || option.section !== r.section || (!option.active && !had.includes(option.id)))
      problems.push({ at: { row }, message: "That training is no longer on the list. Choose another, or Others." });
    else r.trainingName = option.name;
  });
  if (problems.length) throw new TnaContentError(problems);
  return content;
}

async function writeItems(tx: Prisma.TransactionClient, tnaId: number, content: TnaContent) {
  await tx.tnaItem.deleteMany({ where: { tnaId } });
  if (!content.length) return;
  await tx.tnaItem.createMany({
    data: content.map((r, i) => ({
      tnaId,
      section: r.section,
      sortOrder: i,
      problem: r.problem,
      optionId: r.optionId,
      trainingName: r.trainingName,
      targetSkill: r.target,
      currentSkill: r.current,
      method: r.method,
      month: r.month,
    })),
  });
}

const sent = (mode: "draft" | "submit", user: SessionUser) =>
  mode === "submit" ? { status: "SUBMITTED" as const, submittedById: user.id, submittedAt: new Date(), returnReason: null, returnedById: null, returnedAt: null } : {};

/** Starts this year's TNA for a person or a job grade, as a draft or sent straight to the HOD. Returns its id. */
export async function createTna(user: SessionUser, target: TnaTarget, json: string, mode: "draft" | "submit", today: Date): Promise<number> {
  const year = await tnaOpen(today);
  return db.$transaction(async (tx) => {
    const start = await resolveTarget(tx, user, target, year);
    if (!start || !start.viewer.canView) throw new UserError("That TNA can't be started: the person or department is no longer on record.");
    if (start.blocked) throw new UserError(start.blocked);
    const content = await checked(tx, json, mode);
    const t = await tx.tna.create({
      data: { year, ...("staffId" in target ? { staffId: target.staffId } : { departmentId: target.departmentId, jobGrade: target.jobGrade }), createdById: user.id, ...sent(mode, user) },
    });
    await writeItems(tx, t.id, content);
    await recordAudit(tx, {
      actorId: user.id,
      action: "CREATE",
      entity: "Tna",
      entityId: t.id,
      summary: `${mode === "submit" ? "Submitted" : "Started"} ${tnaTitle(start.owner)} for ${year}`,
      changes: { rows: [null, content.length] },
    });
    return t.id;
  });
}

/** Loads a TNA inside a transaction and checks the user may take this step. */
async function forStep(tx: Prisma.TransactionClient, user: SessionUser, id: number, action: TnaAction, today: Date) {
  const openYear = await tnaOpen(today);
  const t = await tx.tna.findUnique({ where: { id }, select: tnaSelect });
  if (!t) throw gone();
  const v = view(t, user, openYear);
  if (!v.viewer.canView) throw gone();
  if (v.blocked[action]) throw new UserError(v.blocked[action]);
  return v;
}

/**
 * Saves the form again. A draft (or one sent back) is kept as a draft or sent
 * to the HOD. A submitted TNA is changed by the HOD or L&D: "approve" saves
 * and approves it in one step, as the old system's Save & Approve did;
 * otherwise it stays submitted. Either way it must stay complete.
 */
export async function updateTna(user: SessionUser, id: number, json: string, mode: "draft" | "submit" | "approve", today: Date) {
  return db.$transaction(async (tx) => {
    const t = await forStep(tx, user, id, "EDIT", today);
    const withHod = t.status === "SUBMITTED";
    if (!withHod && mode === "submit" && t.blocked.SUBMIT) throw new UserError(t.blocked.SUBMIT);
    const approve = mode === "approve";
    if (approve && t.blocked.APPROVE) throw new UserError(t.blocked.APPROVE);
    const content = await checked(
      tx,
      json,
      withHod || approve ? "submit" : mode,
      t.items.map((i) => i.optionId),
    );
    if (approve) await tx.tna.update({ where: { id }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
    else if (!withHod) await tx.tna.update({ where: { id }, data: sent(mode, user) });
    else await tx.tna.update({ where: { id }, data: { updatedAt: new Date() } });
    await writeItems(tx, id, content);
    const what = approve ? "Approved" : withHod ? "Changed" : mode === "submit" ? (t.returnReason ? "Submitted again" : "Submitted") : "Updated";
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Tna",
      entityId: id,
      summary: `${what} ${tnaTitle(t.owner)} for ${t.year}${approve ? ", with changes" : withHod ? " before approval" : ""}`,
      changes: {
        ...(approve ? { status: ["SUBMITTED", "APPROVED"] as [unknown, unknown] } : !withHod && mode === "submit" ? { status: ["DRAFT", "SUBMITTED"] as [unknown, unknown] } : {}),
        ...(t.items.length !== content.length ? { rows: [t.items.length, content.length] as [unknown, unknown] } : {}),
      },
    });
    return { withHod, approved: approve, own: t.viewer.isOwner };
  });
}

/** Sends a draft to the HOD as it stands, from its page. It must be complete. */
export async function submitTna(user: SessionUser, id: number, today: Date) {
  return db.$transaction(async (tx) => {
    const t = await forStep(tx, user, id, "SUBMIT", today);
    const problems = tnaContentProblems(t.content, "submit");
    if (problems.length) {
      const first = problems[0];
      const where = typeof first.at === "object" && "row" in first.at ? `row ${first.at.row + 1}: ` : "";
      throw new UserError(`This TNA isn't complete yet (${where}${first.message.replace(/\.$/, "")}). Open Edit to finish it.`);
    }
    await tx.tna.update({ where: { id }, data: sent("submit", user) });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Tna",
      entityId: id,
      summary: `${t.returnReason ? "Submitted again" : "Submitted"} ${tnaTitle(t.owner)} for ${t.year}`,
      changes: { status: ["DRAFT", "SUBMITTED"] },
    });
  });
}

/** Deletes a draft. */
export async function deleteTna(user: SessionUser, id: number, today: Date) {
  return db.$transaction(async (tx) => {
    const t = await forStep(tx, user, id, "DELETE", today);
    await tx.tna.delete({ where: { id } }); // rows cascade
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "Tna", entityId: id, summary: `Deleted the draft of ${tnaTitle(t.owner)} for ${t.year}` });
    return { year: t.year, own: t.viewer.isOwner, individual: t.staffId !== null };
  });
}

// ---------- The HOD's steps, and L&D's ----------

export type ApproveResult = { approved: number; skipped: string[] };

/** Approves one or more TNAs. Those the user can't approve are skipped with the reason; if none can be, the first reason is the error. */
export async function approveTnas(user: SessionUser, ids: number[], today: Date): Promise<ApproveResult> {
  const openYear = await tnaOpen(today);
  return db.$transaction(async (tx) => {
    const rows = await tx.tna.findMany({ where: { id: { in: ids } }, select: tnaSelect, orderBy: { id: "asc" } });
    const skipped: string[] = [];
    if (rows.length < ids.length) skipped.push(`${plural(ids.length - rows.length, "TNA")} no longer on record.`);
    const approving = rows
      .map((t) => view(t, user, openYear))
      .filter((t) => {
        const blocked = t.viewer.canView ? t.blocked.APPROVE : "This TNA no longer exists.";
        if (blocked) skipped.push(blocked);
        return !blocked;
      });
    if (!approving.length) throw new UserError(skipped[0] ?? "Nothing to approve.");
    const now = new Date();
    await tx.tna.updateMany({ where: { id: { in: approving.map((t) => t.id) } }, data: { status: "APPROVED", approvedById: user.id, approvedAt: now } });
    for (const t of approving)
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Tna",
        entityId: t.id,
        summary: `Approved ${tnaTitle(t.owner)} for ${t.year}`,
        changes: { status: ["SUBMITTED", "APPROVED"] },
      });
    return { approved: approving.length, skipped };
  });
}

function reasonOf(reason: string, missing: string): string {
  if (!reason) throw new UserError("Check the highlighted fields.", { reason: [missing] });
  if (reason.length > MAX_TNA_REASON) throw new UserError("Check the highlighted fields.", { reason: [`At most ${MAX_TNA_REASON} characters`] });
  return reason;
}

/** The HOD sends a TNA back to whoever fills it in, who changes it and submits again. */
export async function sendBackTna(user: SessionUser, id: number, reason: string, today: Date) {
  reasonOf(reason, "Say what needs changing");
  return db.$transaction(async (tx) => {
    const t = await forStep(tx, user, id, "SEND_BACK", today);
    await tx.tna.update({ where: { id }, data: { status: "DRAFT", returnReason: reason, returnedById: user.id, returnedAt: new Date() } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Tna",
      entityId: id,
      summary: `Sent ${tnaTitle(t.owner)} for ${t.year} back`,
      changes: { status: ["SUBMITTED", "DRAFT"], reason: [null, reason] },
    });
  });
}

/** L&D reopen an approved TNA: it goes back to whoever fills it in, to be changed, submitted and approved again. */
export async function reopenTna(user: SessionUser, id: number, reason: string, today: Date) {
  reasonOf(reason, "Say why it is being reopened");
  return db.$transaction(async (tx) => {
    const t = await forStep(tx, user, id, "REOPEN", today);
    await tx.tna.update({
      where: { id },
      data: { status: "DRAFT", approvedById: null, approvedAt: null, returnReason: reason, returnedById: user.id, returnedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Tna",
      entityId: id,
      summary: `Reopened ${tnaTitle(t.owner)} for ${t.year} after approval`,
      changes: { status: ["APPROVED", "DRAFT"], reason: [null, reason] },
    });
  });
}

// ---------- The Team lists ----------

export type TnaFilters = { q?: string; departmentId?: number; stage?: TnaStage; page?: number };

/** Staff who fill in their own TNA in the year: those who do today, or who have one on record for it. */
function staffListWhere(user: SessionUser, year: number, f: TnaFilters): Prisma.StaffWhereInput | null {
  const scope = tnaStaffScope(user);
  if (!scope) return null;
  const q = f.q?.trim();
  const and: Prisma.StaffWhereInput[] = [scope, { OR: [TNA_OWN_WHERE, { tnas: { some: { year } } }] }];
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (q) and.push({ OR: [{ name: { contains: q } }, { staffNo: { contains: q } }] });
  if (f.stage === "NOT_STARTED") and.push({ ...TNA_OWN_WHERE, tnas: { none: { year } } });
  else if (f.stage === "DRAFT") and.push({ tnas: { some: { year, status: "DRAFT", returnReason: null } } });
  else if (f.stage === "RETURNED") and.push({ tnas: { some: { year, status: "DRAFT", returnReason: { not: null } } } });
  else if (f.stage) and.push({ tnas: { some: { year, status: f.stage } } });
  return { AND: and };
}

/** The user's staff who fill in their own TNA, each with theirs for the year (or none yet), by department then name, a page at a time. */
export async function tnaStaffList(user: SessionUser, year: number, f: TnaFilters, today: Date) {
  const openYear = await tnaOpen(today);
  const where = staffListWhere(user, year, f);
  if (!where) return { rows: [], total: 0, page: 1, pages: 1 };
  const total = await db.staff.count({ where });
  const pages = Math.max(1, Math.ceil(total / TNA_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const staff = await db.staff.findMany({
    where,
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
    skip: (page - 1) * TNA_PAGE_SIZE,
    take: TNA_PAGE_SIZE,
    select: { ...staffSelect, tnas: { where: { year }, select: { id: true, status: true, returnReason: true, submittedAt: true, _count: { select: { items: true } } } } },
  });
  const rows = staff.map(({ tnas, ...s }) => {
    const tna = tnas[0] ?? null;
    const owner = staffOwner(s);
    const viewer = tnaViewer(user, owner);
    const state = tna && { year, status: tna.status, owner };
    return {
      staff: s,
      tna,
      stage: tnaStage(tna),
      /** Why the user can't start this person's TNA, or null when they can (L&D, on the person's behalf). */
      startBlock: tnaStartBlock(owner, viewer, tnaOwnBlock({ ...s, isHead: isHead(s) }), tna !== null, year, openYear),
      canEdit: !!state && tnaActionBlock("EDIT", state, viewer, openYear) === null,
      canApprove: !!state && tnaActionBlock("APPROVE", state, viewer, openYear) === null,
    };
  });
  return { rows, total, page, pages };
}

/** How many of the user's staff stand at each stage in the year. */
export async function tnaStaffStageCounts(user: SessionUser, year: number, departmentId?: number): Promise<Record<TnaStage, number>> {
  const counts = await Promise.all(
    TNA_STAGES.map((stage) => {
      const where = staffListWhere(user, year, { stage, departmentId });
      return where ? db.staff.count({ where }) : 0;
    }),
  );
  return Object.fromEntries(TNA_STAGES.map((s, i) => [s, counts[i]])) as Record<TnaStage, number>;
}

/**
 * The job grades of the user's departments, each with its TNA for the year
 * (or none yet) and how many staff it covers. A grade is listed when someone
 * is on it today, or it has a TNA on record for the year.
 */
export async function tnaGradeList(user: SessionUser, year: number, f: Pick<TnaFilters, "departmentId" | "stage">, today: Date) {
  const openYear = await tnaOpen(today);
  const scope = tnaDepartmentScope(user);
  if (!scope) return { rows: [], counts: emptyCounts() };
  const departments = await db.department.findMany({
    where: { AND: [scope, f.departmentId ? { id: f.departmentId } : {}] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, divisionId: true, hod: hodSelect },
  });
  const ids = departments.map((d) => d.id);
  const [headcounts, tnas] = await Promise.all([
    db.staff.groupBy({ by: ["departmentId", "jobGrade"], where: { ...TNA_BY_GRADE_WHERE, departmentId: { in: ids } }, _count: { _all: true } }),
    db.tna.findMany({
      where: { year, departmentId: { in: ids } },
      select: { id: true, departmentId: true, jobGrade: true, status: true, returnReason: true, submittedAt: true, createdBy: { select: { name: true } }, _count: { select: { items: true } } },
    }),
  ]);
  const all = departments.flatMap((d) =>
    JOB_GRADES.flatMap((jobGrade) => {
      const headcount = headcounts.find((h) => h.departmentId === d.id && h.jobGrade === jobGrade)?._count._all ?? 0;
      const tna = tnas.find((t) => t.departmentId === d.id && t.jobGrade === jobGrade) ?? null;
      if (headcount === 0 && !tna) return [];
      const owner = gradeOwner(d, jobGrade);
      const viewer = tnaViewer(user, owner);
      const state = tna && { year, status: tna.status, owner };
      const subject = headcount === 0 ? `No one in ${d.name} is covered by job grade ${jobGrade}.` : null;
      return [
        {
          department: { id: d.id, name: d.name },
          jobGrade,
          headcount,
          tna,
          stage: tnaStage(tna),
          startBlock: tnaStartBlock(owner, viewer, subject, tna !== null, year, openYear),
          canEdit: !!state && tnaActionBlock("EDIT", state, viewer, openYear) === null,
          canApprove: !!state && tnaActionBlock("APPROVE", state, viewer, openYear) === null,
        },
      ];
    }),
  );
  const counts = emptyCounts();
  for (const r of all) counts[r.stage]++;
  return { rows: f.stage ? all.filter((r) => r.stage === f.stage) : all, counts };
}

const emptyCounts = () => Object.fromEntries(TNA_STAGES.map((s) => [s, 0])) as Record<TnaStage, number>;

/** The departments the Team screen covers for this user, for its department filter. */
export async function tnaDepartments(user: SessionUser) {
  const scope = tnaDepartmentScope(user);
  if (!scope) return [];
  return db.department.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** The years the picker offers: this year, and every earlier one with a TNA on record. Newest first. */
export async function tnaYears(today: Date): Promise<number[]> {
  const open = await tnaOpen(today);
  const found = await db.tna.findMany({ distinct: ["year"], select: { year: true } });
  return [...new Set([open, ...found.map((t) => t.year)])].sort((a, b) => b - a);
}

// ---------- What is waiting ----------

/**
 * What is waiting on the signed-in person:
 *  - toApprove: submitted TNAs of their departments (people's and job grades'), any year, the longest-waiting first (HODs)
 *  - returned: this year's TNAs they fill in that were sent back (their own; the main clerk's job grades)
 * and, for the sidebar, whether they fill in their own TNA at all.
 */
export async function tnaWaiting(user: SessionUser, today: Date) {
  const year = await tnaOpen(today);
  const hodOf = user.hodOfDepartmentIds;
  const clerk = user.roles.includes("MAIN_CLERK") && !hodOf.includes(user.departmentId);
  const [me, approve, returned] = await Promise.all([
    db.staff.findUnique({ where: { id: user.id }, select: { status: true, designation: true, jobGrade: true, fillsOwnTna: true, hodOf: { select: { id: true } }, headOf: { select: { id: true } } } }),
    hodOf.length
      ? db.tna.findMany({
          where: { status: "SUBMITTED", OR: [{ staff: { departmentId: { in: hodOf } }, staffId: { not: user.id } }, { departmentId: { in: hodOf } }] },
          orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            year: true,
            jobGrade: true,
            submittedAt: true,
            submittedBy: { select: { name: true } },
            staff: { select: { staffNo: true, name: true, position: true, department: { select: { name: true } } } },
            department: { select: { name: true } },
            _count: { select: { items: true } },
          },
        })
      : [],
    db.tna.findMany({
      where: {
        year,
        status: "DRAFT",
        returnReason: { not: null },
        OR: [{ staffId: user.id }, ...(clerk ? [{ departmentId: user.departmentId }] : [])],
      },
      select: { id: true, staffId: true },
    }),
  ]);
  return {
    year,
    /** Whether My TNA is theirs to fill in. */
    fillsOwn: !!me && tnaKind({ ...me, isHead: isHead(me) }) === "OWN",
    toApprove: approve.map((t) => ({ ...t, earlierYear: t.year !== year })),
    ownReturned: returned.some((t) => t.staffId === user.id),
    gradesReturned: returned.filter((t) => t.staffId === null).length,
  };
}

export type TnaWaiting = Awaited<ReturnType<typeof tnaWaiting>>;

// ---------- L&D's summary ----------

const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/**
 * The year at a glance, for L&D: per department, how many individual and
 * job-grade TNAs are due and where they stand; and across every submitted or
 * approved TNA, how the rows divide between the form's sections and the three
 * ways of achieving them, and the trainings asked for most.
 */
export async function tnaSummary(user: SessionUser, year: number) {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D can see the TNA summary.");
  const [departments, own, grades, tnas, bySection, byMethod, byTraining] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
    db.staff.groupBy({ by: ["departmentId"], where: TNA_OWN_WHERE, _count: { _all: true } }),
    db.staff.groupBy({ by: ["departmentId", "jobGrade"], where: TNA_BY_GRADE_WHERE, _count: { _all: true } }),
    db.tna.findMany({ where: { year }, select: { status: true, returnReason: true, staffId: true, departmentId: true, staff: { select: { departmentId: true } } } }),
    db.tnaItem.groupBy({ by: ["section"], where: { tna: { year, status: { in: ["SUBMITTED", "APPROVED"] } } }, _count: { _all: true } }),
    db.tnaItem.groupBy({ by: ["method"], where: { tna: { year, status: { in: ["SUBMITTED", "APPROVED"] } } }, _count: { _all: true } }),
    db.tnaItem.groupBy({
      by: ["trainingName"],
      where: { tna: { year, status: { in: ["SUBMITTED", "APPROVED"] } } },
      _count: { _all: true },
      orderBy: [{ _count: { trainingName: "desc" } }, { trainingName: "asc" }],
      take: 10,
    }),
  ]);
  const rows = departments
    .map((d) => {
      const mine = tnas.filter((t) => (t.staff ? t.staff.departmentId : t.departmentId) === d.id);
      const tally = (individual: boolean) => {
        const counts = emptyCounts();
        for (const t of mine) if ((t.staffId !== null) === individual) counts[tnaStage(t)]++;
        return counts;
      };
      const individuals = tally(true);
      const byGrade = tally(false);
      const started = (c: Record<TnaStage, number>) => c.DRAFT + c.RETURNED + c.SUBMITTED + c.APPROVED;
      // Due: those who should have one today, or more when leavers' and old grades' TNAs are still on record.
      const dueOwn = Math.max(own.find((o) => o.departmentId === d.id)?._count._all ?? 0, started(individuals));
      const dueGrades = Math.max(grades.filter((g) => g.departmentId === d.id).length, started(byGrade));
      individuals.NOT_STARTED = dueOwn - started(individuals);
      byGrade.NOT_STARTED = dueGrades - started(byGrade);
      return { department: d, dueOwn, individuals, dueGrades, byGrade, due: dueOwn + dueGrades, approved: individuals.APPROVED + byGrade.APPROVED };
    })
    .filter((r) => r.due > 0);
  const totalRows = bySection.reduce((sum, s) => sum + s._count._all, 0);
  return {
    year,
    departments: rows,
    totals: {
      due: rows.reduce((n, r) => n + r.due, 0),
      approved: rows.reduce((n, r) => n + r.approved, 0),
      submitted: rows.reduce((n, r) => n + r.individuals.SUBMITTED + r.byGrade.SUBMITTED, 0),
      notStarted: rows.reduce((n, r) => n + r.individuals.NOT_STARTED + r.byGrade.NOT_STARTED, 0),
      rows: totalRows,
    },
    sections: TNA_SECTIONS.map((section) => {
      const count = bySection.find((s) => s.section === section)?._count._all ?? 0;
      return { section, count, share: share(count, totalRows) };
    }),
    methods: TNA_METHODS.map((method) => {
      const count = byMethod.find((m) => m.method === method)?._count._all ?? 0;
      return { method, count, share: share(count, totalRows) };
    }),
    trainings: byTraining.map((t) => ({ name: t.trainingName, count: t._count._all })),
  };
}

/** Every row of every TNA of the year, with whose it is and where it stands: the Excel export. */
export async function tnaExportRows(user: SessionUser, year: number) {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D can export TNAs.");
  const tnas = await db.tna.findMany({
    where: { year },
    select: {
      id: true,
      jobGrade: true,
      status: true,
      returnReason: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      staff: { select: { staffNo: true, name: true, position: true, department: { select: { name: true } } } },
      department: { select: { name: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: tnaSelect.items.select },
    },
  });
  const department = (t: (typeof tnas)[number]) => t.staff?.department.name ?? t.department?.name ?? "";
  return tnas
    .sort((a, b) => department(a).localeCompare(b.staff?.department.name ?? b.department?.name ?? "") || Number(a.staff === null) - Number(b.staff === null) || (a.staff?.name ?? "").localeCompare(b.staff?.name ?? "") || (a.jobGrade ?? 0) - (b.jobGrade ?? 0))
    .flatMap((t) => t.items.map((item) => ({ tna: t, department: department(t), stage: tnaStage(t), item })));
}
