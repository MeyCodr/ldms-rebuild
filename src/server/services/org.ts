import "server-only";
import { db } from "../db";
import { UserError } from "../errors";
import { can, type Permission, type SessionUser } from "../permissions";
import { diffFields, recordAudit } from "./audit";

export function ensure(user: SessionUser, permission: Permission) {
  if (!can(user, permission)) throw new UserError("You don't have access to do that.");
}

// ---------- Reads ----------

export async function getOrgTree() {
  const [divisions, activeCounts] = await Promise.all([
    db.division.findMany({
      orderBy: { name: "asc" },
      include: {
        head: { select: { id: true, name: true, status: true } },
        departments: {
          orderBy: { name: "asc" },
          include: {
            hod: { select: { id: true, name: true, status: true, staffNo: true } },
            _count: { select: { sections: true } },
          },
        },
      },
    }),
    db.staff.groupBy({ by: ["departmentId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const countByDept = new Map(activeCounts.map((c) => [c.departmentId, c._count._all]));
  return divisions.map((d) => ({
    ...d,
    departments: d.departments.map((dep) => ({ ...dep, activeStaff: countByDept.get(dep.id) ?? 0 })),
  }));
}

const SENIORITY = ["MANAGER", "EXECUTIVE", "NON_EXECUTIVE", "CONTRACT", "TRAINEE"];

/** Department with its staff listed HOD first, then by seniority and name. */
export async function getDepartmentDetail(id: number) {
  const dept = await db.department.findUnique({
    where: { id },
    include: {
      division: { include: { head: { select: { id: true, name: true, staffNo: true, status: true } } } },
      hod: { select: { id: true, name: true, staffNo: true, status: true, position: true } },
      sections: {
        orderBy: { name: "asc" },
        include: { _count: { select: { staff: { where: { status: "ACTIVE" } } } } },
      },
      staff: {
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, staffNo: true, name: true, position: true, designation: true, sectionId: true },
      },
    },
  });
  if (!dept) return null;
  const rank = (s: { id: number; designation: string }) => (s.id === dept.hodId ? -1 : SENIORITY.indexOf(s.designation));
  dept.staff.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return dept;
}

export async function getDivisionDetail(id: number) {
  return db.division.findUnique({
    where: { id },
    include: {
      head: { select: { id: true, name: true, staffNo: true, status: true, position: true } },
      departments: {
        orderBy: { name: "asc" },
        include: {
          hod: { select: { id: true, name: true, status: true } },
          _count: { select: { staff: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });
}

/** Active managers and executives, the usual candidates for HOD and division head. */
export async function headCandidates() {
  return db.staff.findMany({
    where: { status: "ACTIVE", designation: { in: ["MANAGER", "EXECUTIVE"] } },
    orderBy: [{ designation: "desc" }, { name: "asc" }],
    select: { id: true, name: true, staffNo: true, designation: true, department: { select: { name: true } } },
  });
}

export async function departmentOptions() {
  return db.department.findMany({
    orderBy: [{ division: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      division: { select: { name: true } },
      sections: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
}

// ---------- Divisions ----------

export async function createDivision(user: SessionUser, input: { name: string; shortName: string | null }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const division = await tx.division.create({ data: input });
    await recordAudit(tx, { actorId: user.id, action: "CREATE", entity: "Division", entityId: division.id, summary: `Created division ${division.name}` });
    return division;
  });
}

export async function updateDivision(user: SessionUser, id: number, input: { name: string; shortName: string | null }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.division.findUniqueOrThrow({ where: { id } });
    const division = await tx.division.update({ where: { id }, data: input });
    const changes = diffFields(before, input, ["name", "shortName"]);
    if (Object.keys(changes).length)
      await recordAudit(tx, { actorId: user.id, action: "UPDATE", entity: "Division", entityId: id, summary: `Updated division ${division.name}`, changes });
    return division;
  });
}

export async function setDivisionHead(user: SessionUser, id: number, staffId: number | null) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.division.findUniqueOrThrow({ where: { id }, include: { head: true } });
    const head = staffId ? await tx.staff.findUnique({ where: { id: staffId } }) : null;
    if (staffId && (!head || head.status !== "ACTIVE")) throw new UserError("Choose an active staff member.");
    await tx.division.update({ where: { id }, data: { headId: staffId } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Division",
      entityId: id,
      summary: head ? `Set ${head.name} as head of ${before.name}` : `Removed the head of ${before.name}`,
      changes: { headId: [before.head?.name ?? null, head?.name ?? null] },
    });
  });
}

export async function deleteDivision(user: SessionUser, id: number) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const division = await tx.division.findUniqueOrThrow({ where: { id }, include: { _count: { select: { departments: true } } } });
    if (division._count.departments > 0)
      throw new UserError(`Move or delete the ${division._count.departments} department(s) in ${division.name} first.`);
    await tx.division.delete({ where: { id } });
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "Division", entityId: id, summary: `Deleted division ${division.name}` });
  });
}

// ---------- Departments ----------

export async function createDepartment(user: SessionUser, input: { name: string; shortName: string | null; divisionId: number }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const dept = await tx.department.create({ data: input, include: { division: true } });
    await recordAudit(tx, { actorId: user.id, action: "CREATE", entity: "Department", entityId: dept.id, summary: `Created department ${dept.name} in ${dept.division.name}` });
    return dept;
  });
}

/** Rename and/or move to another division. */
export async function updateDepartment(user: SessionUser, id: number, input: { name: string; shortName: string | null; divisionId: number }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.department.findUniqueOrThrow({ where: { id }, include: { division: true } });
    const dept = await tx.department.update({ where: { id }, data: input, include: { division: true } });
    const changes = diffFields(before, input, ["name", "shortName", "divisionId"]);
    if (changes.divisionId) changes.divisionId = [before.division.name, dept.division.name];
    if (Object.keys(changes).length)
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Department",
        entityId: id,
        summary: changes.divisionId ? `Moved ${dept.name} to ${dept.division.name}` : `Updated department ${dept.name}`,
        changes,
      });
    return dept;
  });
}

export async function setDepartmentHod(user: SessionUser, id: number, staffId: number | null) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.department.findUniqueOrThrow({ where: { id }, include: { hod: true } });
    const hod = staffId ? await tx.staff.findUnique({ where: { id: staffId } }) : null;
    if (staffId && (!hod || hod.status !== "ACTIVE")) throw new UserError("Choose an active staff member.");
    await tx.department.update({ where: { id }, data: { hodId: staffId } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Department",
      entityId: id,
      summary: hod ? `Set ${hod.name} as HOD of ${before.name}` : `Removed the HOD of ${before.name}`,
      changes: { hodId: [before.hod?.name ?? null, hod?.name ?? null] },
    });
  });
}

export async function deleteDepartment(user: SessionUser, id: number) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const dept = await tx.department.findUniqueOrThrow({ where: { id }, include: { _count: { select: { staff: true } } } });
    if (dept._count.staff > 0)
      throw new UserError(`${dept.name} still has ${dept._count.staff} staff record(s), including resigned staff. Transfer them first.`);
    await tx.section.deleteMany({ where: { departmentId: id } });
    await tx.department.delete({ where: { id } });
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "Department", entityId: id, summary: `Deleted department ${dept.name}` });
  });
}

// ---------- Sections ----------

export async function createSection(user: SessionUser, input: { name: string; departmentId: number }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const section = await tx.section.create({ data: input, include: { department: true } });
    await recordAudit(tx, { actorId: user.id, action: "CREATE", entity: "Section", entityId: section.id, summary: `Added section ${section.name} to ${section.department.name}` });
    return section;
  });
}

export async function renameSection(user: SessionUser, id: number, name: string) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const before = await tx.section.findUniqueOrThrow({ where: { id } });
    await tx.section.update({ where: { id }, data: { name } });
    await recordAudit(tx, { actorId: user.id, action: "UPDATE", entity: "Section", entityId: id, summary: `Renamed section ${before.name} to ${name}`, changes: { name: [before.name, name] } });
  });
}

export async function deleteSection(user: SessionUser, id: number) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const section = await tx.section.findUniqueOrThrow({ where: { id }, include: { _count: { select: { staff: true } } } });
    if (section._count.staff > 0) throw new UserError(`${section.name} still has ${section._count.staff} staff record(s). Move them to another section first.`);
    await tx.section.delete({ where: { id } });
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "Section", entityId: id, summary: `Deleted section ${section.name}` });
  });
}

// ---------- Transfers ----------

/**
 * Moves staff to another department (and optionally a section). A HOD who is
 * transferred out stops being HOD of the old department; the org screen then
 * shows that department as needing a HOD.
 */
export async function transferStaff(user: SessionUser, input: { staffIds: number[]; departmentId: number; sectionId: number | null }) {
  ensure(user, "org.manage");
  return db.$transaction(async (tx) => {
    const target = await tx.department.findUniqueOrThrow({ where: { id: input.departmentId }, include: { sections: true } });
    if (input.sectionId && !target.sections.some((s) => s.id === input.sectionId))
      throw new UserError("That section is not in the chosen department.", { sectionId: ["Not in this department"] });

    const staff = await tx.staff.findMany({ where: { id: { in: input.staffIds } }, include: { department: true } });
    const moving = staff.filter((s) => s.departmentId !== input.departmentId || s.sectionId !== input.sectionId);
    if (!moving.length) throw new UserError("The selected staff are already in that department and section.");

    await tx.staff.updateMany({ where: { id: { in: moving.map((s) => s.id) } }, data: { departmentId: input.departmentId, sectionId: input.sectionId } });

    const hodsLeaving = await tx.department.findMany({
      where: { hodId: { in: moving.map((s) => s.id) }, id: { not: input.departmentId } },
    });
    for (const d of hodsLeaving) {
      await tx.department.update({ where: { id: d.id }, data: { hodId: null } });
      await recordAudit(tx, { actorId: user.id, action: "UPDATE", entity: "Department", entityId: d.id, summary: `HOD of ${d.name} cleared after transfer` });
    }
    for (const s of moving) {
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Staff",
        entityId: s.id,
        summary: `Transferred ${s.name} from ${s.department.name} to ${target.name}`,
        changes: { department: [s.department.name, target.name] },
      });
    }
    return { moved: moving.length, hodsCleared: hodsLeaving.map((d) => d.name) };
  });
}
