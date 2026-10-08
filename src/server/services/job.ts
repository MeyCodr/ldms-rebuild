import "server-only";
import { db } from "../db";
import { UserError } from "../errors";
import { can, type SessionUser } from "../permissions";
import { jobIsStale, retentionCutoff, type JobSummary } from "../rules/mail";
import { sendWaitingEmails } from "./mail";

// The daily job: started once a day by the server's scheduler
// (npm run job:daily, scripts/daily-job.ts), or by L&D's Run now. Every run
// is a JobRun row with what it did. Running it twice in a day is harmless:
// each step only does what is still left to do.
//
// What it does today: sends emails still waiting (and tries failed ones
// again), then removes emails, notifications and runs older than 90 days.
// Module 2 adds the step before these that works out who is reminded.

const DAILY = "daily";

const formatTime = (d: Date) => {
  const local = new Date(d.getTime() + 8 * 3_600_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * Runs the daily job. `startedById` is null when the scheduler started it.
 * Refuses while another run is going; one that died is closed as failed first.
 */
export async function runDailyJob(startedById: number | null, now: Date = new Date()): Promise<{ id: number; summary: JobSummary }> {
  const run = await db.$transaction(async (tx) => {
    const running = await tx.jobRun.findMany({ where: { job: DAILY, status: "RUNNING" }, select: { id: true, startedAt: true } });
    const stale = running.filter((r) => jobIsStale(r.startedAt, now));
    if (stale.length) await tx.jobRun.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: "FAILED", finishedAt: now, error: "The run stopped without finishing." } });
    const live = running.find((r) => !jobIsStale(r.startedAt, now));
    if (live) throw new UserError(`The daily job is already running (started at ${formatTime(live.startedAt)}). Try again in a few minutes.`);
    return tx.jobRun.create({ data: { job: DAILY, startedById, startedAt: now }, select: { id: true } });
  });

  try {
    const emails = await sendWaitingEmails(run.id);
    const cutoff = retentionCutoff(now);
    const [removedEmails, removedNotifications, removedRuns] = await Promise.all([
      db.emailMessage.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      db.notification.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      db.jobRun.deleteMany({ where: { startedAt: { lt: cutoff }, id: { not: run.id } } }),
    ]);
    const summary: JobSummary = {
      emailsSent: emails.sent,
      emailsRecorded: emails.recorded,
      emailsFailed: emails.failed,
      removedEmails: removedEmails.count,
      removedNotifications: removedNotifications.count,
      removedRuns: removedRuns.count,
    };
    await db.jobRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), summary } });
    return { id: run.id, summary };
  } catch (e) {
    await db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: (e instanceof Error ? e.message : String(e)).slice(0, 2000) } });
    throw e;
  }
}

/** L&D's Run now. */
export async function runDailyJobNow(user: SessionUser) {
  if (!can(user, "jobs.manage")) throw new UserError("Only L&D can run the daily job.");
  return runDailyJob(user.id);
}

export const JOB_LIST_SIZE = 30;

/** The latest runs, newest first, for L&D. */
export async function jobRuns(user: SessionUser) {
  if (!can(user, "jobs.manage")) throw new UserError("Only L&D manage email and the daily job.");
  return db.jobRun.findMany({
    where: { job: DAILY },
    orderBy: { id: "desc" },
    take: JOB_LIST_SIZE,
    select: { id: true, startedAt: true, finishedAt: true, status: true, summary: true, error: true, startedBy: { select: { name: true } } },
  });
}
