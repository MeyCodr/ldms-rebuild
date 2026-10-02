import { PrismaClient } from "@prisma/client";

/**
 * Test-only clean-up for a training the app deliberately never lets anyone
 * delete: once a participant has given feedback they stay on record. Tests
 * that submit feedback create their own training (with a unique title) and
 * remove it here. It talks to the database directly, so it only works when
 * the tests run on the same machine as the dev server (not E2E_BASE_URL
 * against another one). Audit entries are left in place.
 */
export async function deleteTestTraining(title: string) {
  const db = new PrismaClient();
  try {
    const ids = (await db.training.findMany({ where: { title }, select: { id: true } })).map((t) => t.id);
    if (!ids.length) return;
    await db.participant.deleteMany({ where: { trainingId: { in: ids } } });
    await db.training.deleteMany({ where: { id: { in: ids } } }); // sessions cascade
  } finally {
    await db.$disconnect();
  }
}
