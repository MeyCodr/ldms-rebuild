import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { SessionUser } from "../permissions";
import { countsTowardHours, trainingHours, trainingPhase } from "../rules/training";
import { ensure } from "./org";

// Read-only figures for the overview. Hours always come from trainingHours and
// countsTowardHours, and a training belongs to the year and month it starts in
// (the same rule as the trainings list's year filter).

const trainingSelect = {
  id: true,
  type: true,
  title: true,
  function: true,
  platform: true,
  venue: true,
  trainerName: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  status: true,
  sessions: { select: { date: true, startTime: true, endTime: true } },
} satisfies Prisma.TrainingSelect;

type TrainingRow = Prisma.TrainingGetPayload<{ select: typeof trainingSelect }>;

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });
const byStart = (a: { startDate: Date }, b: { startDate: Date }) => a.startDate.getTime() - b.startDate.getTime();

/** Hours per month (Jan–Dec) of a year, from rows that count toward hours. */
function monthlyHours(rows: { hours: number; startDate: Date }[]): number[] {
  const months = Array<number>(12).fill(0);
  for (const r of rows) months[r.startDate.getUTCMonth()] += r.hours;
  return months.map((h) => Math.round(h * 100) / 100);
}

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

/** The signed-in person's own trainings: what's next, what they've done, their hours. */
export async function myLearning(user: SessionUser, today: Date) {
  const year = today.getUTCFullYear();
  const rows = await db.participant.findMany({
    where: { staffId: user.id },
    select: { id: true, attendance: true, submittedAt: true, training: { select: trainingSelect } },
  });
  const all = rows.map((p) => ({
    ...p,
    hours: trainingHours(p.training) ?? 0,
    phase: trainingPhase(p.training, today),
    counts: countsTowardHours(p),
  }));
  const thisYear = all.filter((p) => p.training.startDate.getUTCFullYear() === year);
  const done = thisYear.filter((p) => p.counts).map((p) => ({ hours: p.hours, startDate: p.training.startDate }));

  return {
    year,
    hoursThisYear: sum(done.map((d) => d.hours)),
    completedThisYear: done.length,
    /** Trainings they're on this year that are going ahead: the "of" in "2 of 3 completed". */
    enrolledThisYear: thisYear.filter((p) => p.training.status !== "CANCELLED").length,
    monthly: monthlyHours(done),
    hoursAllTime: sum(all.filter((p) => p.counts).map((p) => p.hours)),
    completedAllTime: all.filter((p) => p.counts).length,
    /** Trainings they're on that haven't finished yet, soonest first. */
    upcoming: all
      .filter((p) => (p.phase === "UPCOMING" || p.phase === "IN_PROGRESS") && p.attendance === "PENDING")
      .sort((a, b) => byStart(a.training, b.training)),
    /** Trainings that have been held, latest first. */
    recent: all
      .filter((p) => p.phase === "HELD")
      .sort((a, b) => byStart(b.training, a.training))
      .slice(0, 5),
  };
}

export type MyLearning = Awaited<ReturnType<typeof myLearning>>;

/** Training across PHN this year, for L&D. */
export async function trainingOverview(user: SessionUser, today: Date) {
  ensure(user, "training.view");
  const year = today.getUTCFullYear();
  const trainings = await db.training.findMany({
    where: { startDate: yearRange(year) },
    select: { ...trainingSelect, cost: true, participants: { select: { attendance: true } } },
  });

  const live = trainings.filter((t) => t.status !== "CANCELLED");
  const rows = live.map((t) => ({ ...t, hours: trainingHours(t) ?? 0, phase: trainingPhase(t, today) }));
  const held = rows.filter((t) => t.phase === "HELD");

  // Participant-hours: each completed attendance at a training that went ahead.
  const delivered: { hours: number; startDate: Date }[] = [];
  for (const t of rows)
    for (const p of t.participants)
      if (countsTowardHours({ attendance: p.attendance, training: t })) delivered.push({ hours: t.hours, startDate: t.startDate });

  const attendance = { COMPLETED: 0, PENDING: 0, ABSENT: 0 };
  for (const t of held) for (const p of t.participants) attendance[p.attendance]++;

  const toRecord = held
    .map((t) => ({ ...t, pending: t.participants.filter((p) => p.attendance === "PENDING").length, total: t.participants.length }))
    .filter((t) => t.pending > 0)
    .sort((a, b) => byStart(b, a));

  const upcoming = await db.training.findMany({
    where: { status: "SCHEDULED", endDate: { gte: new Date(Date.UTC(year, today.getUTCMonth(), today.getUTCDate())) } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: 4,
    select: { ...trainingSelect, _count: { select: { participants: true } } },
  });

  return {
    year,
    planned: rows.length,
    heldCount: held.length,
    cancelled: trainings.length - live.length,
    deliveredHours: sum(delivered.map((d) => d.hours)),
    /** Course cost (RM) of this year's trainings that are going ahead. */
    spend: sum(live.map((t) => (t.cost === null ? 0 : Number(t.cost)))),
    monthly: monthlyHours(delivered),
    attendance,
    toRecord,
    upcoming: upcoming.map((t) => ({ ...t, hours: trainingHours(t), phase: trainingPhase(t, today), participantCount: t._count.participants })),
  };
}

export type TrainingOverview = Awaited<ReturnType<typeof trainingOverview>>;
export type { TrainingRow };
