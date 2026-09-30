import "server-only";
import type { Prisma, TrainingStatus, TrainingType } from "@prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import type { SessionUser } from "../permissions";
import { canBeInternalTrainer, INTERNAL_TRAINER_DESIGNATIONS, trainingDeleteBlock, trainingHours } from "../rules/training";
import type { TrainingInput } from "@/lib/validation/training";
import { TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { formatDateRange, formatTime } from "@/lib/format";
import { diffFields, recordAudit } from "./audit";
import { ensure } from "./org";

// ---------- Listing ----------

export type TrainingFilters = {
  q?: string;
  type?: TrainingType;
  year?: number;
  status?: TrainingStatus | "ALL";
  sort?: TrainingSort;
  dir?: "asc" | "desc";
  page?: number;
};

export const TRAINING_SORTS = ["date", "title", "type", "participants"] as const;
export type TrainingSort = (typeof TRAINING_SORTS)[number];

/** Direction a column sorts in when first clicked: newest, most participants; A–Z otherwise. */
export const TRAINING_SORT_DEFAULT_DIR: Record<TrainingSort, "asc" | "desc"> = {
  date: "desc",
  title: "asc",
  type: "asc",
  participants: "desc",
};

function trainingOrderBy(f: TrainingFilters): Prisma.TrainingOrderByWithRelationInput[] {
  const sort = f.sort ?? "date";
  const dir = f.dir ?? TRAINING_SORT_DEFAULT_DIR[sort];
  // Ties fall back to newest first, so the order is stable across pages.
  const newest: Prisma.TrainingOrderByWithRelationInput[] = [{ startDate: "desc" }, { startTime: "desc" }, { id: "desc" }];
  switch (sort) {
    case "title":
      return [{ title: dir }, ...newest];
    case "type":
      // Enum order: Public / In-house, OJT, Departmental.
      return [{ type: dir }, ...newest];
    case "participants":
      return [{ participants: { _count: dir } }, ...newest];
    default:
      return [{ startDate: dir }, { startTime: dir }, { id: dir }];
  }
}

export const TRAINING_PAGE_SIZE = 50;

function trainingWhere(f: TrainingFilters): Prisma.TrainingWhereInput {
  const and: Prisma.TrainingWhereInput[] = [];
  if (f.type) and.push({ type: f.type });
  if (f.status && f.status !== "ALL") and.push({ status: f.status });
  if (f.year) and.push({ startDate: { gte: new Date(Date.UTC(f.year, 0, 1)), lt: new Date(Date.UTC(f.year + 1, 0, 1)) } });
  if (f.q) {
    const q = f.q.trim();
    and.push({ OR: [{ title: { contains: q } }, { trainerName: { contains: q } }, { venue: { contains: q } }] });
  }
  return { AND: and };
}

const listSelect = {
  id: true,
  type: true,
  title: true,
  code: true,
  program: true,
  function: true,
  platform: true,
  provider: true,
  category: true,
  venue: true,
  trainerName: true,
  hrdfClaimable: true,
  cost: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  status: true,
  department: { select: { name: true } },
  sessions: { select: { date: true, startTime: true, endTime: true } },
  _count: { select: { participants: true } },
} satisfies Prisma.TrainingSelect;

type ListRow = Prisma.TrainingGetPayload<{ select: typeof listSelect }>;

/** Adds hours and completed-participant counts to training rows. */
async function withTotals(rows: ListRow[]) {
  const completed = rows.length
    ? await db.participant.groupBy({
        by: ["trainingId"],
        where: { trainingId: { in: rows.map((r) => r.id) }, attendance: "COMPLETED" },
        _count: { _all: true },
      })
    : [];
  const done = new Map(completed.map((c) => [c.trainingId, c._count._all]));
  return rows.map((r) => ({
    ...r,
    hours: trainingHours(r),
    participantCount: r._count.participants,
    completedCount: done.get(r.id) ?? 0,
  }));
}

export async function listTrainings(user: SessionUser, f: TrainingFilters) {
  ensure(user, "training.view");
  const where = trainingWhere(f);
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.training.findMany({
      where,
      orderBy: trainingOrderBy(f),
      skip: (page - 1) * TRAINING_PAGE_SIZE,
      take: TRAINING_PAGE_SIZE,
      select: listSelect,
    }),
    db.training.count({ where }),
  ]);
  return { rows: await withTotals(rows), total, page, pages: Math.max(1, Math.ceil(total / TRAINING_PAGE_SIZE)) };
}

export async function listTrainingsForExport(user: SessionUser, f: TrainingFilters) {
  ensure(user, "training.view");
  const rows = await db.training.findMany({
    where: trainingWhere(f),
    orderBy: trainingOrderBy(f),
    select: listSelect,
  });
  return withTotals(rows);
}

/** Years to offer in the year filter: every year with a training, plus this year. */
export async function trainingYears(thisYear: number): Promise<number[]> {
  const { _min, _max } = await db.training.aggregate({ _min: { startDate: true }, _max: { startDate: true } });
  const first = Math.min(_min.startDate?.getUTCFullYear() ?? thisYear, thisYear);
  const last = Math.max(_max.startDate?.getUTCFullYear() ?? thisYear, thisYear);
  const years: number[] = [];
  for (let y = last; y >= first; y--) years.push(y);
  return years;
}

// ---------- One training ----------

export async function getTraining(user: SessionUser, id: number) {
  ensure(user, "training.view");
  const training = await db.training.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      trainerStaff: { select: { id: true, name: true, staffNo: true, status: true } },
      sessions: { orderBy: [{ date: "asc" }, { startTime: "asc" }] },
      _count: { select: { participants: true } },
    },
  });
  if (!training) return null;
  const [attendance, createdBy] = await Promise.all([
    db.participant.groupBy({ by: ["attendance"], where: { trainingId: id }, _count: { _all: true } }),
    training.createdById ? db.staff.findUnique({ where: { id: training.createdById }, select: { id: true, name: true } }) : null,
  ]);
  const count = (a: string) => attendance.find((g) => g.attendance === a)?._count._all ?? 0;
  return {
    ...training,
    hours: trainingHours(training),
    createdBy,
    participantCount: training._count.participants,
    attendance: { pending: count("PENDING"), completed: count("COMPLETED"), absent: count("ABSENT") },
  };
}

/**
 * Staff who can be picked as an internal trainer: active executives and
 * managers. The current trainer is kept in the list (marked) even if they have
 * since resigned or changed designation, so editing an old training still works.
 */
export async function internalTrainerOptions(currentTrainerId?: number | null) {
  const staff = await db.staff.findMany({
    where: {
      OR: [
        { status: "ACTIVE", designation: { in: [...INTERNAL_TRAINER_DESIGNATIONS] } },
        ...(currentTrainerId ? [{ id: currentTrainerId }] : []),
      ],
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, staffNo: true, status: true, designation: true, department: { select: { name: true } } },
  });
  return staff.map((s) => ({ ...s, eligible: canBeInternalTrainer(s) }));
}

export async function trainingHistory(id: number) {
  return db.auditLog.findMany({
    where: { entity: "Training", entityId: String(id) },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { actor: { select: { name: true } } },
  });
}

// ---------- Changes ----------

type SessionRow = { date: Date; startTime: Date; endTime: Date };

const describeSessions = (sessions: SessionRow[]) =>
  sessions.map((s) => `${s.date.toISOString().slice(0, 10)} ${formatTime(s.startTime)}–${formatTime(s.endTime)}`).join("; ");

/** The columns the training form changes. */
type FormColumns = TrainingInput;

/** Comparable plain values for the audit diff: dates as YYYY-MM-DD, times as HH:MM, cost as 0.00. */
function auditView(t: Omit<FormColumns, "cost"> & { cost: { toString(): string } | null }) {
  return {
    type: t.type,
    title: t.title,
    venue: t.venue,
    cost: t.cost === null ? null : Number(t.cost.toString()).toFixed(2),
    hrdfClaimable: t.hrdfClaimable,
    platform: t.platform,
    function: t.function,
    startDate: t.startDate.toISOString().slice(0, 10),
    endDate: t.endDate.toISOString().slice(0, 10),
    startTime: formatTime(t.startTime),
    endTime: formatTime(t.endTime),
    program: t.program,
    trainerName: t.trainerName,
    trainerStaffId: t.trainerStaffId,
  };
}

const AUDITED = [
  "type",
  "title",
  "venue",
  "cost",
  "hrdfClaimable",
  "platform",
  "function",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "program",
  "trainerName",
  "trainerStaffId",
] as const;

/**
 * The internal trainer's name, after checking they are an active executive or
 * manager. Copied onto the training so lists and exports read the same as for
 * typed trainers. Keeping the trainer a training already had is always allowed.
 */
async function internalTrainerName(tx: Prisma.TransactionClient, trainerStaffId: number, currentTrainerId: number | null = null): Promise<string> {
  const staff = await tx.staff.findUnique({ where: { id: trainerStaffId }, select: { id: true, name: true, status: true, designation: true } });
  if (!staff) throw new UserError("That trainer is no longer in the staff list.", { trainerStaffId: ["Choose another trainer"] });
  if (staff.id !== currentTrainerId && !canBeInternalTrainer(staff))
    throw new UserError(`${staff.name} can't be the trainer: internal trainers must be active executives or managers.`, {
      trainerStaffId: ["Choose an active executive or manager"],
    });
  return staff.name;
}

export async function createTraining(user: SessionUser, input: TrainingInput) {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const trainerName = input.trainerStaffId ? await internalTrainerName(tx, input.trainerStaffId) : input.trainerName;
    const training = await tx.training.create({ data: { ...input, trainerName, createdById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "CREATE",
      entity: "Training",
      entityId: training.id,
      summary: `Added ${TRAINING_TYPE_LABELS[training.type]} training ${training.title} (${formatDateRange(training.startDate, training.endDate)})`,
    });
    return training;
  });
}

/**
 * Saves the training form. Columns the form doesn't show (course code,
 * category, provider, description, organising department) are left as they
 * are. Any sessions are removed: the form's dates and times now define the
 * schedule, so hours follow what the user sees.
 */
export async function updateTraining(user: SessionUser, id: number, input: TrainingInput) {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.training.findUnique({ where: { id }, include: { sessions: { orderBy: [{ date: "asc" }, { startTime: "asc" }] } } });
    if (!before) throw new UserError("This training no longer exists.");

    // Internal trainer: their name from the staff list. Otherwise: as typed.
    const trainerName = input.trainerStaffId ? await internalTrainerName(tx, input.trainerStaffId, before.trainerStaffId) : input.trainerName;
    const data: FormColumns = { ...input, trainerName };

    const changes = diffFields(auditView(before), auditView(data), [...AUDITED]);
    if (before.sessions.length) {
      changes.sessions = [describeSessions(before.sessions), "none"];
      await tx.trainingSession.deleteMany({ where: { trainingId: id } });
    }
    const training = await tx.training.update({ where: { id }, data });
    if (Object.keys(changes).length)
      await recordAudit(tx, { actorId: user.id, action: "UPDATE", entity: "Training", entityId: id, summary: `Updated training ${training.title}`, changes });
    return training;
  });
}

/** Cancelling keeps the record and its participants; its hours stop counting. */
export async function cancelTraining(user: SessionUser, id: number) {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id } });
    if (!training) throw new UserError("This training no longer exists.");
    if (training.status === "CANCELLED") throw new UserError(`${training.title} is already cancelled.`);
    await tx.training.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Training",
      entityId: id,
      summary: `Cancelled training ${training.title}`,
      changes: { status: ["SCHEDULED", "CANCELLED"] },
    });
  });
}

/** Undoes a cancellation, e.g. one made by mistake. */
export async function restoreTraining(user: SessionUser, id: number) {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id } });
    if (!training) throw new UserError("This training no longer exists.");
    if (training.status !== "CANCELLED") throw new UserError(`${training.title} is not cancelled.`);
    await tx.training.update({ where: { id }, data: { status: "SCHEDULED" } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Training",
      entityId: id,
      summary: `Restored cancelled training ${training.title}`,
      changes: { status: ["CANCELLED", "SCHEDULED"] },
    });
  });
}

export async function deleteTraining(user: SessionUser, id: number) {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id }, include: { _count: { select: { participants: true } } } });
    if (!training) throw new UserError("This training no longer exists.");
    const blocked = trainingDeleteBlock({ participantCount: training._count.participants });
    if (blocked) throw new UserError(blocked);
    await tx.training.delete({ where: { id } }); // sessions cascade
    await recordAudit(tx, {
      actorId: user.id,
      action: "DELETE",
      entity: "Training",
      entityId: id,
      summary: `Deleted training ${training.title} (${formatDateRange(training.startDate, training.endDate)})`,
    });
  });
}
