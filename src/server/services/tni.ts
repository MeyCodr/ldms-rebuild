import "server-only";
import type { Prisma } from "@prisma/client";
import { parseTniContent, tniContentProblems, type TniContent, type TniProblem } from "@/lib/forms/tni";
import { db } from "../db";
import { UserError } from "../errors";
import type { SessionUser } from "../permissions";
import { tniDepartmentScope, tniEditBlock, tniViewer } from "../rules/tni";
import { recordAudit } from "./audit";
import { tnaOpen } from "./tna";

// TNI: one list per department per year, kept by its HOD (see rules/tni.ts).
// The year being filled in is the TNA's (tnaOpen): L&D's one switch moves both.
// A department the user may not see is treated as not found.
//
// Audit entries use entity "Tni" with the TNI's id. The rows themselves
// aren't diffed into the log: the entry says what happened and how many rows
// the list has.

const itemSelect = { indicator: true, expected: true, actual: true, causes: true, ask: true, method: true, evaluation: true } satisfies Prisma.TniItemSelect;
const itemOrder = [{ sortOrder: "asc" }, { id: "asc" }] satisfies Prisma.TniItemOrderByWithRelationInput[];

const departmentSelect = {
  id: true,
  name: true,
  divisionId: true,
  division: { select: { name: true } },
  hod: { select: { id: true, name: true, status: true } },
} satisfies Prisma.DepartmentSelect;

const activeHod = (d: { hod: { id: number; name: string; status: string } | null }) => (d.hod && d.hod.status === "ACTIVE" ? { id: d.hod.id, name: d.hod.name } : null);

/** The user's departments, each with its TNI for the year (or none yet). */
export async function tniList(user: SessionUser, year: number, today: Date) {
  const open = await tnaOpen(today);
  const scope = tniDepartmentScope(user);
  if (!scope) return [];
  const departments = await db.department.findMany({
    where: scope,
    orderBy: { name: "asc" },
    select: { ...departmentSelect, tnis: { where: { year }, select: { id: true, updatedAt: true, updatedBy: { select: { name: true } }, _count: { select: { items: true } } } } },
  });
  return departments.map(({ tnis, ...d }) => {
    const viewer = tniViewer(user, d);
    return { department: d, hod: activeHod(d), tni: tnis[0] ?? null, viewer, editBlock: tniEditBlock(d, year, viewer, open) };
  });
}

/** One department's TNI for a year: the department, its rows (empty when none is on record) and what this user can do. Null when they may not see it. */
export async function getTni(user: SessionUser, departmentId: number, year: number, today: Date) {
  const open = await tnaOpen(today);
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      ...departmentSelect,
      tnis: { where: { year }, select: { id: true, createdAt: true, updatedAt: true, updatedBy: { select: { name: true } }, items: { orderBy: itemOrder, select: itemSelect } } },
    },
  });
  if (!department) return null;
  const viewer = tniViewer(user, department);
  if (!viewer.canView) return null;
  const { tnis, ...d } = department;
  const tni = tnis[0] ?? null;
  return { department: d, hod: activeHod(d), year, tni, content: (tni?.items ?? []) as TniContent, viewer, editBlock: tniEditBlock(d, year, viewer, open) };
}

export type TniView = NonNullable<Awaited<ReturnType<typeof getTni>>>;

/** The latest earlier TNI of the department that has rows: what "Start from last year's" copies. */
export async function tniToCopy(departmentId: number, year: number) {
  const previous = await db.tni.findFirst({
    where: { departmentId, year: { lt: year }, items: { some: {} } },
    orderBy: { year: "desc" },
    select: { year: true, items: { orderBy: itemOrder, select: itemSelect } },
  });
  return previous ? { year: previous.year, content: previous.items as TniContent } : null;
}

/** The years on record for a department, newest first. */
export async function tniYearsOf(departmentId: number) {
  return (await db.tni.findMany({ where: { departmentId }, orderBy: { year: "desc" }, select: { year: true, _count: { select: { items: true } } } })).map((t) => ({ year: t.year, rows: t._count.items }));
}

/** The years the list's picker offers: this year, and every earlier one with a TNI on record. Newest first. */
export async function tniYears(today: Date): Promise<number[]> {
  const found = await db.tni.findMany({ distinct: ["year"], select: { year: true } });
  return [...new Set([await tnaOpen(today), ...found.map((t) => t.year)])].sort((a, b) => b - a);
}

/** The content problems as a user error the form can place: each tied to its row. */
export class TniContentError extends UserError {
  constructor(public problems: TniProblem[]) {
    const whole = problems.find((p) => p.at === "form");
    super(whole ? whole.message : "Check the highlighted rows.");
  }
}

/** The HOD saves their department's TNI for the open year: the list as the form sends it replaces the one on record. */
export async function saveTni(user: SessionUser, departmentId: number, json: string, today: Date) {
  const year = await tnaOpen(today);
  const content = parseTniContent(json);
  if (!content) throw new UserError("The form didn't arrive in one piece. Reload the page and try again.");
  return db.$transaction(async (tx) => {
    const department = await tx.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true, divisionId: true, tnis: { where: { year }, select: { id: true, _count: { select: { items: true } } } } } });
    if (!department) throw new UserError("That department is no longer on record.");
    const viewer = tniViewer(user, department);
    if (!viewer.canView) throw new UserError("That department is no longer on record.");
    const blocked = tniEditBlock(department, year, viewer, year);
    if (blocked) throw new UserError(blocked);
    const problems = tniContentProblems(content);
    if (problems.length) throw new TniContentError(problems);

    const before = department.tnis[0] ?? null;
    const tni = before
      ? await tx.tni.update({ where: { id: before.id }, data: { updatedById: user.id, updatedAt: new Date() }, select: { id: true } })
      : await tx.tni.create({ data: { year, departmentId, updatedById: user.id }, select: { id: true } });
    await tx.tniItem.deleteMany({ where: { tniId: tni.id } });
    await tx.tniItem.createMany({
      // Checked above: every row has its levels and method.
      data: content.map((r, i) => ({ tniId: tni.id, sortOrder: i, indicator: r.indicator, expected: r.expected!, actual: r.actual!, causes: r.causes, ask: r.ask, method: r.method!, evaluation: r.evaluation })),
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: before ? "UPDATE" : "CREATE",
      entity: "Tni",
      entityId: tni.id,
      summary: `${before ? "Updated" : "Filled in"} ${department.name}'s TNI for ${year}`,
      changes: (before?._count.items ?? null) !== content.length ? { rows: [before?._count.items ?? null, content.length] } : undefined,
    });
    return { created: !before };
  });
}

/** Every row of the year's TNIs the user may see, by department: the Excel export. */
export async function tniExportRows(user: SessionUser, year: number) {
  const scope = tniDepartmentScope(user);
  if (!scope) throw new UserError("You don't have access to TNIs.");
  const tnis = await db.tni.findMany({
    where: { year, department: scope },
    orderBy: { department: { name: "asc" } },
    select: { updatedAt: true, updatedBy: { select: { name: true } }, department: { select: { name: true } }, items: { orderBy: itemOrder, select: itemSelect } },
  });
  return tnis.flatMap((t) => t.items.map((item, i) => ({ department: t.department.name, no: i + 1, item, updatedBy: t.updatedBy?.name ?? "", updatedAt: t.updatedAt })));
}

/** The latest audit entries for one TNI. */
export async function tniHistory(id: number) {
  return db.auditLog.findMany({
    where: { entity: "Tni", entityId: String(id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
    include: { actor: { select: { name: true } } },
  });
}
