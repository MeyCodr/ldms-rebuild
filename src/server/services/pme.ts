import "server-only";
import type { Prisma } from "@prisma/client";
import { CURRENT_PME_FORM, pmeAnswersSchema, readPmeAnswers } from "@/lib/forms/pme";
import { MAX_PME_COMMENT, MAX_PME_REASON } from "@/lib/validation/pme";
import { db } from "../db";
import { parseForm, UserError } from "../errors";
import { can, pmeStaffScope, reportDepartmentScope, type SessionUser } from "../permissions";
import { resolveApprover } from "../rules/approver";
import { pmeActionBlock, pmeMark, pmeStage, pmeStageWhere, PME_ACTIONS, type PmeAction, type PmeStage, type PmeViewer } from "../rules/pme";
import { trainingHours } from "../rules/training";
import { recordAudit } from "./audit";
import { approverInput, approverStaffSelect } from "./pmeSync";

// PME: one per person per training (see rules/pme.ts for the path it takes).
// Who may see one: the person it is about, their HOD, their division head,
// and L&D. Anyone else's id is treated as not found.
//
// Audit entries use entity "Pme" with the PME's id. Making and withdrawing a
// PME follows attendance (pmeSync.ts) and is covered by the attendance entry.

const pmeSelect = {
  id: true,
  status: true,
  periodStart: true,
  periodEnd: true,
  answers: true,
  answersVersion: true,
  averageMark: true,
  evaluatedAt: true,
  staffComment: true,
  acknowledgedAt: true,
  verifiedAt: true,
  returnReason: true,
  returnedAt: true,
  evaluatedBy: { select: { name: true, staffNo: true } },
  verifiedBy: { select: { name: true, staffNo: true } },
  participant: {
    select: {
      id: true,
      training: {
        select: {
          id: true,
          title: true,
          trainingCode: true,
          type: true,
          status: true,
          venue: true,
          trainerName: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          sessions: { select: { date: true, startTime: true, endTime: true } },
        },
      },
      staff: {
        select: {
          ...approverStaffSelect,
          staffNo: true,
          name: true,
          position: true,
          designation: true,
          status: true,
          department: {
            select: {
              ...approverStaffSelect.department.select,
              name: true,
              hod: { select: { id: true, name: true, staffNo: true, status: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PmeSelect;

type Row = Prisma.PmeGetPayload<{ select: typeof pmeSelect }>;

/** A PME with what the pages need worked out: where it stands, who evaluates, the mark, and what this user can do. */
function view(p: Row, user: SessionUser, today: Date) {
  const { staff, training } = p.participant;
  const approval = resolveApprover(approverInput(staff));
  const hod = approval.approverId !== null ? staff.department.hod : null;
  const viewer: PmeViewer = {
    isSubject: staff.id === user.id,
    isApprover: approval.approverId === user.id,
    canVerify: can(user, "pme.verify"),
  };
  const answers = readPmeAnswers(p.answers, p.answersVersion);
  const state = { status: p.status, periodEnd: p.periodEnd, staff, training };
  return {
    id: p.id,
    participantId: p.participant.id,
    status: p.status,
    stage: pmeStage(p, today),
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    staff: {
      id: staff.id,
      staffNo: staff.staffNo,
      name: staff.name,
      position: staff.position,
      designation: staff.designation,
      status: staff.status,
      department: staff.department.name,
    },
    training: { ...training, hours: trainingHours(training) },
    /** The HOD who evaluates, today. Null when the department has no active HOD. */
    evaluator: hod ? { id: hod.id, name: hod.name, staffNo: hod.staffNo } : null,
    answers,
    mark: answers ? pmeMark(answers) : null,
    evaluatedAt: p.evaluatedAt,
    evaluatedBy: p.evaluatedBy,
    staffComment: p.staffComment,
    acknowledgedAt: p.acknowledgedAt,
    verifiedAt: p.verifiedAt,
    verifiedBy: p.verifiedBy,
    returnReason: p.returnReason,
    returnedAt: p.returnedAt,
    viewer,
    /** Why this user can't take each step, or null when they can. */
    blocked: Object.fromEntries(PME_ACTIONS.map((a) => [a, pmeActionBlock(a, state, viewer, today)])) as Record<PmeAction, string | null>,
  };
}

export type PmeView = ReturnType<typeof view>;

/** PMEs of a training that went ahead: a cancelled training's are kept but not listed. */
const live: Prisma.PmeWhereInput = { participant: { training: { status: "SCHEDULED" } } };

// ---------- What is waiting ----------

/**
 * What is waiting on the signed-in person, the longest-waiting first:
 *  - toEvaluate: their staff's PMEs whose period has ended (HODs)
 *  - toVerify: PMEs the staff member has acknowledged (L&D)
 *  - toAcknowledge: their own PMEs their HOD has evaluated
 */
export async function pmeWaiting(user: SessionUser, today: Date) {
  const [evaluate, verify, acknowledge] = await Promise.all([
    user.hodOfDepartmentIds.length
      ? db.pme.findMany({
          where: {
            AND: [live, pmeStageWhere("TO_EVALUATE", today), { participant: { staff: { status: "ACTIVE", departmentId: { in: user.hodOfDepartmentIds } } } }],
          },
          select: pmeSelect,
          orderBy: [{ periodEnd: "asc" }, { id: "asc" }],
        })
      : [],
    can(user, "pme.verify")
      ? db.pme.findMany({
          // Acknowledged; or evaluated for someone who has since left and can't acknowledge.
          where: { AND: [live, { OR: [{ status: "ACKNOWLEDGED" }, { status: "EVALUATED", participant: { staff: { status: "RESIGNED" } } }] }] },
          select: pmeSelect,
          orderBy: [{ evaluatedAt: "asc" }, { id: "asc" }],
        })
      : [],
    db.pme.findMany({
      where: { AND: [live, { status: "EVALUATED", participant: { staffId: user.id } }] },
      select: pmeSelect,
      orderBy: [{ evaluatedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    // A department's HOD evaluates everyone in it who has an approver: this drops anyone who has none.
    toEvaluate: evaluate.map((p) => view(p, user, today)).filter((p) => p.viewer.isApprover),
    toVerify: verify.map((p) => view(p, user, today)),
    toAcknowledge: acknowledge.map((p) => view(p, user, today)),
  };
}

export type PmeWaiting = Awaited<ReturnType<typeof pmeWaiting>>;

// ---------- The PME list ----------

export const PME_PAGE_SIZE = 100;

export type PmeFilters = {
  q?: string;
  stage?: PmeStage;
  departmentId?: number;
  /** Training dates, YYYY-MM-DD: starts on or after `from`, ends on or before `to`. */
  from?: string;
  to?: string;
  page?: number;
};

function listWhere(user: SessionUser, f: PmeFilters, today: Date): Prisma.PmeWhereInput {
  const scope = pmeStaffScope(user);
  if (!scope) throw new UserError("You don't have access to the PME list.");
  const q = f.q?.trim();
  const and: Prisma.PmeWhereInput[] = [live, { participant: { staff: scope } }];
  if (f.stage) and.push(pmeStageWhere(f.stage, today));
  if (f.departmentId) and.push({ participant: { staff: { departmentId: f.departmentId } } });
  if (f.from) and.push({ participant: { training: { startDate: { gte: new Date(`${f.from}T00:00:00Z`) } } } });
  if (f.to) and.push({ participant: { training: { endDate: { lte: new Date(`${f.to}T00:00:00Z`) } } } });
  if (q)
    and.push({
      OR: [
        { participant: { staff: { name: { contains: q } } } },
        { participant: { staff: { staffNo: { contains: q } } } },
        { participant: { training: { title: { contains: q } } } },
        { participant: { training: { trainingCode: { contains: q } } } },
      ],
    });
  return { AND: and };
}

/** The user's staff's PMEs, the newest evaluation period first, a page at a time. */
export async function listPmes(user: SessionUser, f: PmeFilters, today: Date) {
  const where = listWhere(user, f, today);
  const total = await db.pme.count({ where });
  const pages = Math.max(1, Math.ceil(total / PME_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const rows = await db.pme.findMany({
    where,
    select: pmeSelect,
    orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
    skip: (page - 1) * PME_PAGE_SIZE,
    take: PME_PAGE_SIZE,
  });
  return { rows: rows.map((p) => view(p, user, today)), total, page, pages };
}

/** Every PME matching the filters, for the Excel export. */
export async function pmesForExport(user: SessionUser, f: PmeFilters, today: Date) {
  const rows = await db.pme.findMany({ where: listWhere(user, f, today), select: pmeSelect, orderBy: [{ periodEnd: "desc" }, { id: "desc" }] });
  return rows.map((p) => view(p, user, today));
}

/** How many of the user's staff's PMEs stand at each stage: the list's summary line. */
export async function pmeStageCounts(user: SessionUser, today: Date): Promise<Record<PmeStage, number>> {
  const stages: PmeStage[] = ["TO_EVALUATE", "TO_ACKNOWLEDGE", "TO_VERIFY", "IN_PERIOD", "VERIFIED", "NOT_REQUIRED"];
  const counts = await Promise.all(stages.map((stage) => db.pme.count({ where: listWhere(user, { stage }, today) })));
  return Object.fromEntries(stages.map((s, i) => [s, counts[i]])) as Record<PmeStage, number>;
}

/** The departments the list's department filter offers. */
export async function pmeDepartments(user: SessionUser) {
  const scope = reportDepartmentScope(user);
  if (!scope || !can(user, "pme.view")) return [];
  return db.department.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

// ---------- One PME ----------

/** Whether the user may open this PME: it is about them, they evaluate it, or it is one of their staff's. */
async function canOpen(user: SessionUser, p: Row): Promise<boolean> {
  if (p.participant.staff.id === user.id || can(user, "pme.verify")) return true;
  const scope = pmeStaffScope(user);
  if (!scope) return false;
  return (await db.staff.count({ where: { AND: [{ id: p.participant.staff.id }, scope] } })) > 0;
}

/** One PME, or null (also when the user has no business with it). */
export async function getPme(user: SessionUser, id: number, today: Date): Promise<PmeView | null> {
  const p = await db.pme.findUnique({ where: { id }, select: pmeSelect });
  if (!p || !(await canOpen(user, p))) return null;
  return view(p, user, today);
}

/** The signed-in person's own PMEs, by participant id: what My training shows beside each training. */
export async function myPmes(user: SessionUser, today: Date): Promise<Map<number, PmeView>> {
  const rows = await db.pme.findMany({ where: { participant: { staffId: user.id } }, select: pmeSelect });
  return new Map(rows.map((p) => [p.participant.id, view(p, user, today)]));
}

/** PME status for each participant of a training, by participant id (the training page and the attendance report). */
export async function pmeStagesOfTraining(trainingId: number, today: Date): Promise<Map<number, { id: number; stage: PmeStage }>> {
  const rows = await db.pme.findMany({ where: { participant: { trainingId } }, select: { id: true, participantId: true, status: true, periodEnd: true } });
  return new Map(rows.map((p) => [p.participantId, { id: p.id, stage: pmeStage(p, today) }]));
}

// ---------- The steps ----------

const gone = () => new UserError("This PME no longer exists.");
const who = (s: { name: string; staffNo: string }) => `${s.name} (${s.staffNo})`;

/** Loads a PME inside a transaction and checks the user may take this step. */
async function forStep(tx: Prisma.TransactionClient, user: SessionUser, id: number, action: PmeAction, today: Date) {
  const p = await tx.pme.findUnique({ where: { id }, select: pmeSelect });
  if (!p || !(await canOpen(user, p))) throw gone();
  const v = view(p, user, today);
  if (v.blocked[action]) throw new UserError(v.blocked[action]);
  return v;
}

/** The HOD's evaluation. `raw` is the form as submitted. */
export async function evaluatePme(user: SessionUser, id: number, raw: Record<string, string>, today: Date) {
  return db.$transaction(async (tx) => {
    const p = await forStep(tx, user, id, "EVALUATE", today);
    const answers = parseForm(pmeAnswersSchema, raw);
    const { average } = pmeMark(answers);
    await tx.pme.update({
      where: { id },
      data: {
        status: "EVALUATED",
        answers: answers as unknown as Prisma.InputJsonObject,
        answersVersion: CURRENT_PME_FORM.version,
        ojtConducted: answers.ojtConducted,
        evaluatedById: user.id,
        evaluatedAt: new Date(),
        // A fresh evaluation: whatever was said about the last one no longer applies.
        returnReason: null,
        returnedAt: null,
        staffComment: null,
        acknowledgedAt: null,
      },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Pme",
      entityId: id,
      summary: `${p.returnedAt ? "Re-evaluated" : "Evaluated"} ${who(p.staff)} for ${p.training.title} (PME)`,
      changes: { status: [p.status, "EVALUATED"], averageMark: [p.mark?.average ?? null, average] },
    });
  });
}

/** The staff member acknowledges their evaluation, with an optional comment. */
export async function acknowledgePme(user: SessionUser, id: number, comment: string | null, today: Date) {
  if (comment && comment.length > MAX_PME_COMMENT) throw new UserError("Check the highlighted fields.", { comment: [`At most ${MAX_PME_COMMENT} characters`] });
  return db.$transaction(async (tx) => {
    const p = await forStep(tx, user, id, "ACKNOWLEDGE", today);
    await tx.pme.update({ where: { id }, data: { status: "ACKNOWLEDGED", staffComment: comment, acknowledgedAt: new Date() } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Pme",
      entityId: id,
      summary: `${who(p.staff)} acknowledged their PME for ${p.training.title}`,
      changes: { status: [p.status, "ACKNOWLEDGED"], ...(comment ? { comment: [null, comment] } : {}) },
    });
  });
}

/** L&D verify: the mark is saved and the PME is locked. */
export async function verifyPme(user: SessionUser, id: number, today: Date) {
  return db.$transaction(async (tx) => {
    const p = await forStep(tx, user, id, "VERIFY", today);
    if (!p.mark) throw new UserError("This PME has no evaluation on record, so it can't be verified. Send it back to the HOD.");
    await tx.pme.update({ where: { id }, data: { status: "VERIFIED", averageMark: p.mark.average, verifiedById: user.id, verifiedAt: new Date() } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Pme",
      entityId: id,
      summary: `Verified ${who(p.staff)}'s PME for ${p.training.title}`,
      changes: { status: [p.status, "VERIFIED"], averageMark: [null, p.mark.average] },
    });
  });
}

/** L&D send it back to the HOD, who evaluates again starting from what they wrote. */
export async function sendBackPme(user: SessionUser, id: number, reason: string, today: Date) {
  if (!reason) throw new UserError("Check the highlighted fields.", { reason: ["Say what needs changing"] });
  if (reason.length > MAX_PME_REASON) throw new UserError("Check the highlighted fields.", { reason: [`At most ${MAX_PME_REASON} characters`] });
  return db.$transaction(async (tx) => {
    const p = await forStep(tx, user, id, "SEND_BACK", today);
    await tx.pme.update({
      where: { id },
      data: { status: "PENDING", returnReason: reason, returnedAt: new Date(), staffComment: null, acknowledgedAt: null },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Pme",
      entityId: id,
      summary: `Sent ${who(p.staff)}'s PME for ${p.training.title} back to the HOD`,
      changes: { status: [p.status, "PENDING"], reason: [null, reason], ...(p.staffComment ? { comment: [p.staffComment, null] } : {}) },
    });
  });
}

/** The latest audit entries for one PME. */
export async function pmeHistory(id: number) {
  return db.auditLog.findMany({
    where: { entity: "Pme", entityId: String(id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
    include: { actor: { select: { name: true } } },
  });
}
