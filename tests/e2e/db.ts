import { rm } from "node:fs/promises";
import path from "node:path";
import { type Attendance, PrismaClient } from "@prisma/client";

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
 * default 1 Sep 2026, already held), with the given staff on it. Returns its
 * id. Remove it with deleteTestTraining.
 */
export async function createTestTraining(title: string, people: { staffNo: string; attendance: Attendance }[], day = "2026-09-01") {
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
        endTime: new Date("1970-01-01T17:30:00Z"),
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
