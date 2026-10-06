// Makes the PMEs that completed attendance already on record should have:
// run once after the PME migration, and after the phase 5 import.
//
//   npm run db:sync-pme
//
// Safe to run again: it only adds what is missing and never touches a PME a
// HOD has evaluated (src/server/services/pmeSync.ts).

import { PrismaClient } from "@prisma/client";
import { syncPmes } from "../src/server/services/pmeSync";

const db = new PrismaClient();

async function main() {
  const result = await db.$transaction((tx) => syncPmes(tx, { training: { type: { not: "OJT" } } }), { timeout: 120_000 });
  console.log(`PMEs: ${result.created} made, ${result.updated} updated, ${result.withdrawn} withdrawn.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
