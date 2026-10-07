import { rm } from "node:fs/promises";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { type Attendance, PrismaClient, type RoleCode, type SkillStatus, type TnaStatus } from "@prisma/client";
import { syncPmes } from "../../src/server/services/pmeSync";

/** Where the app keeps certificates (src/server/services/certificate.ts). */
export const CERTIFICATE_DIR = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"), "certificates");

/**
 * Test-only clean-up for a training the app deliberately never lets anyone
 * delete: once a participant has given feedback they stay on record. Tests
 * that submit feedback create their own training (with a unique title) and
 * remove it here, with its certificate file if it has one. It talks to the
 * database directly, so it only works when the tests run on the same machine
 * as the dev server (not E2E_BASE_URL against another one). Audit entries are
 * left in place.
 */
export async function deleteTestTraining(title: string) {
  const db = new PrismaClient();
  try {
    const found = await db.training.findMany({ where: { title }, select: { id: true, certificateFile: true } });
    if (!found.length) return;
    const ids = found.map((t) => t.id);
    await db.participant.deleteMany({ where: { trainingId: { in: ids } } });
    await db.training.deleteMany({ where: { id: { in: ids } } }); // sessions cascade
    for (const t of found) if (t.certificateFile) await rm(path.join(CERTIFICATE_DIR, t.certificateFile), { force: true });
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only set-up: a one-day public training on `day` (YYYY-MM-DD; by
 * default 1 Sep 2026, already held), from 08:30 to `endTime` (9 hours by
 * default), with the given staff on it. Returns its id. Remove it with deleteTestTraining.
 */
export async function createTestTraining(title: string, people: { staffNo: string; attendance: Attendance }[], day = "2026-09-01", endTime = "17:30") {
  const db = new PrismaClient();
  try {
    const staff = await db.staff.findMany({ where: { staffNo: { in: people.map((p) => p.staffNo) } }, select: { id: true, staffNo: true } });
    const training = await db.training.create({
      data: {
        type: "PUBLIC_INHOUSE",
        title,
        trainingCode: `TR${day.replaceAll("-", "")}${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`,
        venue: "Training Room 1",
        startDate: new Date(`${day}T00:00:00Z`),
        endDate: new Date(`${day}T00:00:00Z`),
        startTime: new Date("1970-01-01T08:30:00Z"),
        endTime: new Date(`1970-01-01T${endTime}:00Z`),
      },
    });
    await db.participant.createMany({
      data: people.map((p) => ({ trainingId: training.id, staffId: staff.find((s) => s.staffNo === p.staffNo)!.id, attendance: p.attendance })),
    });
    return training.id;
  } finally {
    await db.$disconnect();
  }
}

/** The stored name of a training's certificate, to check its file on disk. */
export async function storedCertificate(trainingId: number) {
  const db = new PrismaClient();
  try {
    return (await db.training.findUnique({ where: { id: trainingId }, select: { certificateFile: true } }))?.certificateFile ?? null;
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only: makes the PMEs a test training's completed participants should
 * have, as the app does when attendance is completed on screen.
 */
export async function makeTestPmes(trainingId: number) {
  const db = new PrismaClient();
  try {
    await db.$transaction((tx) => syncPmes(tx, { trainingId }));
    return await db.pme.findMany({ where: { participant: { trainingId } }, select: { id: true, status: true, participant: { select: { staff: { select: { staffNo: true } } } } } });
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only: lets a demo staff member who has no password sign in with the
 * demo one. Returns a function that puts their record back as it was.
 */
export async function giveDemoPassword(staffNo: string, password: string) {
  const db = new PrismaClient();
  try {
    const before = await db.staff.findUniqueOrThrow({ where: { staffNo }, select: { id: true, passwordHash: true, legacyMd5: true, mustChangePassword: true } });
    await db.staff.update({ where: { id: before.id }, data: { passwordHash: await hash(password), legacyMd5: null, mustChangePassword: false } });
    return async () => {
      const again = new PrismaClient();
      try {
        await again.staff.update({ where: { id: before.id }, data: { passwordHash: before.passwordHash, legacyMd5: before.legacyMd5, mustChangePassword: before.mustChangePassword } });
      } finally {
        await again.$disconnect();
      }
    };
  } finally {
    await db.$disconnect();
  }
}

/** Test-only: gives a staff member a role for the run. Returns a function that takes it away again (if they didn't have it). */
export async function giveRole(staffNo: string, role: RoleCode) {
  const db = new PrismaClient();
  try {
    const staff = await db.staff.findUniqueOrThrow({ where: { staffNo }, select: { id: true, roles: { select: { role: true } } } });
    const had = staff.roles.some((r) => r.role === role);
    if (!had) await db.staffRole.create({ data: { staffId: staff.id, role } });
    return async () => {
      if (had) return;
      const again = new PrismaClient();
      try {
        await again.staffRole.deleteMany({ where: { staffId: staff.id, role } });
      } finally {
        await again.$disconnect();
      }
    };
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only: a skill matrix put straight into a quarter (the app only lets
 * the open quarter be filled in), with one rated topic in each section.
 * Returns its id.
 */
export async function createTestSkillMatrix(staffNo: string, quarter: { year: number; quarter: number }, status: SkillStatus, evaluatorStaffNo: string) {
  const db = new PrismaClient();
  try {
    const [staff, evaluator] = await Promise.all([
      db.staff.findUniqueOrThrow({ where: { staffNo }, select: { id: true } }),
      db.staff.findUniqueOrThrow({ where: { staffNo: evaluatorStaffNo }, select: { id: true } }),
    ]);
    const m = await db.skillEvaluation.create({
      data: {
        staffId: staff.id,
        ...quarter,
        status,
        createdById: evaluator.id,
        submittedAt: status === "DRAFT" ? null : new Date(),
        topics: {
          create: (["KNOWLEDGE", "SKILL", "ABILITY"] as const).map((section, i) => ({
            section,
            name: `Test ${section.toLowerCase()} topic`,
            sortOrder: i,
            items: { create: [{ text: "Does it without help", rating: 4, sortOrder: 0 }] },
          })),
        },
      },
    });
    return m.id;
  } finally {
    await db.$disconnect();
  }
}

/** Test-only clean-up: every skill matrix of these staff, in any quarter. */
export async function deleteTestSkillMatrices(staffNos: string[]) {
  const db = new PrismaClient();
  try {
    await db.skillEvaluation.deleteMany({ where: { staff: { staffNo: { in: staffNos } } } }); // topics and lines cascade
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only: gives staff a job grade for the run, so their department has a
 * job grade's TNA to fill in. Returns a function that puts each one's back.
 */
export async function setJobGrade(staffNos: string[], jobGrade: number) {
  const db = new PrismaClient();
  try {
    const before = await db.staff.findMany({ where: { staffNo: { in: staffNos } }, select: { id: true, jobGrade: true } });
    await db.staff.updateMany({ where: { id: { in: before.map((s) => s.id) } }, data: { jobGrade } });
    return async () => {
      const again = new PrismaClient();
      try {
        for (const s of before) await again.staff.update({ where: { id: s.id }, data: { jobGrade: s.jobGrade } });
      } finally {
        await again.$disconnect();
      }
    };
  } finally {
    await db.$disconnect();
  }
}

/**
 * Test-only: a person's TNA put straight into a year (the app only lets this
 * year's be filled in), with one complete typed-in row under Special project.
 * Returns its id.
 */
export async function createTestTna(staffNo: string, year: number, status: TnaStatus, training = "Test kaizen project") {
  const db = new PrismaClient();
  try {
    const staff = await db.staff.findUniqueOrThrow({ where: { staffNo }, select: { id: true } });
    const t = await db.tna.create({
      data: {
        year,
        staffId: staff.id,
        status,
        createdById: staff.id,
        submittedById: status === "DRAFT" ? null : staff.id,
        submittedAt: status === "DRAFT" ? null : new Date(),
        items: {
          create: [{ section: "SPECIAL_PROJECT", sortOrder: 0, problem: "Changeovers take too long", trainingName: training, targetSkill: 4, currentSkill: 2, method: "COACHING", month: 6 }],
        },
      },
    });
    return t.id;
  } finally {
    await db.$disconnect();
  }
}

/** Test-only clean-up: every TNA of these staff and of this department's job grades, in any year, and training options by name. */
export async function deleteTestTnas(staffNos: string[], departmentName: string, optionNames: string[] = []) {
  const db = new PrismaClient();
  try {
    await db.tna.deleteMany({ where: { OR: [{ staff: { staffNo: { in: staffNos } } }, { department: { name: departmentName } }] } }); // rows cascade
    if (optionNames.length) await db.tnaTrainingOption.deleteMany({ where: { name: { in: optionNames } } });
  } finally {
    await db.$disconnect();
  }
}
