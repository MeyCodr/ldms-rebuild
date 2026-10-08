// The daily job, for the server's scheduler:
//
//   npm run job:daily
//
// On the Linux server, one crontab line runs it at 8am Malaysia time (see
// README, "The daily job"). It needs no web address and no token: being able
// to run it means being on the server. Safe to run again the same day; a run
// already going is left alone. What each run did is on the Jobs and email
// screen. Exits 1 if the run failed, so cron's mail or a monitor can tell.

import { UserError } from "../src/server/errors";
import { db } from "../src/server/db";
import { jobSummaryText } from "../src/server/rules/mail";
import { runDailyJob } from "../src/server/services/job";

const stamp = () => new Date().toISOString();

runDailyJob(null)
  .then(({ id, summary }) => {
    console.log(`[${stamp()}] Daily job run ${id}: ${jobSummaryText(summary)}.`);
  })
  .catch((e) => {
    if (e instanceof UserError) console.error(`[${stamp()}] ${e.message}`);
    else console.error(`[${stamp()}] Daily job failed:`, e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
