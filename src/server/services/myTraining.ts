import "server-only";
import type { Prisma } from "@prisma/client";
import { answersSchema, CURRENT_FORM, questionsOf, type Answers } from "@/lib/forms/feedback";
import { formatDate, formatTime } from "@/lib/format";
import type { OjtInput } from "@/lib/validation/myTraining";
import { db } from "../db";
import { parseForm, UserError } from "../errors";
import type { SessionUser } from "../permissions";
import { countsTowardHours, trainingHours, trainingPhase } from "../rules/training";
import { formAccess, formKind, ojtDateBlock, ojtDeleteBlock, ojtDetailsBlock } from "../rules/myTraining";
import { diffFields, recordAudit } from "./audit";
import { discardCertificateFile } from "./certificate";
import { syncPmes } from "./pmeSync";
import { newTrainingCode } from "./training";

// My Training: everything here works on the signed-in person's own rows only,
// so no permission beyond being signed in is needed. A participant id that
// isn't theirs is treated as not found.
//
// Audit entries use entity "Participant" with the training's id (as the
// participants list does), and "Training" for OJT people record themselves.

const trainingSelect = {
  id: true,
  type: true,
  title: true,
  function: true,
  platform: true,
  program: true,
  ojtMethod: true,
  venue: true,
  trainerName: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  status: true,
  certificateFile: true,
  sessions: { select: { date: true, startTime: true, endTime: true } },
  _count: { select: { participants: true } },
} satisfies Prisma.TrainingSelect;

const participantSelect = {
  id: true,
  attendance: true,
  attendanceReason: true,
  source: true,
  feedback: true,
  feedbackVersion: true,
  submittedAt: true,
  training: { select: trainingSelect },
} satisfies Prisma.ParticipantSelect;

type Row = Prisma.ParticipantGetPayload<{ select: typeof participantSelect }>;

/** A row with what the pages need worked out: hours, where the training stands, what the person can do. */
function view(p: Row, today: Date) {
  return {
    ...p,
    hours: trainingHours(p.training) ?? 0,
    counts: countsTowardHours(p),
    phase: trainingPhase(p.training, today),
    kind: formKind(p.training),
    access: formAccess(p, p.training, today),
    /** Other staff on the same training (an OJT someone recorded is theirs alone). */
    others: p.training._count.participants - 1,
  };
}

export type MyTrainingRow = ReturnType<typeof view>;

/** Every training the person is on, newest first. */
export async function myTrainings(user: SessionUser, today: Date): Promise<MyTrainingRow[]> {
  const rows = await db.participant.findMany({
    where: { staffId: user.id },
    select: participantSelect,
    orderBy: [{ training: { startDate: "desc" } }, { id: "desc" }],
  });
  return rows.map((p) => view(p, today));
}

/** Feedback forms waiting for the person, the longest-waiting first. */
export async function feedbackWaiting(user: SessionUser, today: Date): Promise<MyTrainingRow[]> {
  const rows = await db.participant.findMany({
    where: { staffId: user.id, attendance: "PENDING", training: { status: "SCHEDULED" } },
    select: participantSelect,
    orderBy: [{ training: { endDate: "asc" } }, { id: "asc" }],
  });
  return rows.map((p) => view(p, today)).filter((p) => p.access.mode === "submit");
}

/** One of the person's own trainings, or null (also when it belongs to someone else). */
export async function myParticipant(user: SessionUser, participantId: number, today: Date): Promise<MyTrainingRow | null> {
  const p = await db.participant.findFirst({ where: { id: participantId, staffId: user.id }, select: participantSelect });
  return p ? view(p, today) : null;
}

const notFound = () => new UserError("That training is no longer on your record.");

/**
 * Saves the person's answers. On an open form this completes the training;
 * on a completed OJT it updates the answers. Returns which of the two it did.
 */
export async function submitAnswers(user: SessionUser, participantId: number, raw: Record<string, string>, today: Date): Promise<"submitted" | "updated"> {
  return db.$transaction(async (tx) => {
    const p = await tx.participant.findFirst({ where: { id: participantId, staffId: user.id }, select: participantSelect });
    if (!p) throw notFound();
    const access = formAccess(p, p.training, today);
    if (access.mode === "closed") throw new UserError(access.reason);
    if (access.mode === "view") throw new UserError("Your feedback for this training has already been sent.");

    const kind = formKind(p.training);
    const form = CURRENT_FORM[kind];
    // Only this form's questions; one left unanswered arrives as "" and is checked as such.
    const fields = Object.fromEntries(questionsOf(form).map((q) => [q.id, raw[q.id] ?? ""]));
    const answers = parseForm(answersSchema(form), fields);
    const now = new Date();
    const who = `${user.name} (${user.staffNo})`;

    if (access.mode === "submit") {
      await tx.participant.update({
        where: { id: p.id },
        data: { attendance: "COMPLETED", feedback: answers as Prisma.InputJsonObject, feedbackVersion: form.version, submittedAt: now },
      });
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Participant",
        entityId: p.training.id,
        summary: kind === "OJT" ? `${who} gave their OJT answers` : `${who} submitted feedback`,
        changes: { attendance: ["Pending", "Completed"] },
      });
      // Completing a course starts the PME for executives and managers.
      await syncPmes(tx, { id: p.id });
      return "submitted";
    }

    await tx.participant.update({
      where: { id: p.id },
      data: { feedback: answers as Prisma.InputJsonObject, feedbackVersion: form.version, submittedAt: p.submittedAt ?? now },
    });
    await recordAudit(tx, { actorId: user.id, action: "UPDATE", entity: "Participant", entityId: p.training.id, summary: `${who} updated their OJT answers` });
    return "updated";
  });
}

const describeOjt = (t: { title: string; startDate: Date }) => `${t.title} (${formatDate(t.startDate)})`;

/** Records an OJT the person did: saved as completed, with their answers. Returns the new participant id. */
export async function recordOjt(user: SessionUser, input: OjtInput, answers: Answers, today: Date): Promise<number> {
  const late = ojtDateBlock(input.endDate, today);
  if (late) throw new UserError(late, { endDate: ["Pick today or an earlier date"] });
  return db.$transaction(async (tx) => {
    const training = await tx.training.create({
      data: { type: "OJT", trainingCode: await newTrainingCode(tx, "OJT"), ...input, departmentId: user.departmentId, createdById: user.id },
    });
    const p = await tx.participant.create({
      data: {
        trainingId: training.id,
        staffId: user.id,
        attendance: "COMPLETED",
        source: "SELF",
        recordedById: user.id,
        feedback: answers as Prisma.InputJsonObject,
        feedbackVersion: CURRENT_FORM.OJT.version,
        submittedAt: new Date(),
      },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "CREATE",
      entity: "Training",
      entityId: training.id,
      summary: `${user.name} (${user.staffNo}) recorded their own OJT ${describeOjt(training)}`,
    });
    return p.id;
  });
}

type OjtColumns = Pick<OjtInput, "title" | "startDate" | "endDate" | "startTime" | "endTime"> & {
  ojtMethod: string | null;
  venue: string | null;
  program: string | null;
};

/** Comparable plain values for the audit diff: dates as YYYY-MM-DD, times as HH:MM. */
const ojtAuditView = (t: OjtColumns) => ({
  title: t.title,
  ojtMethod: t.ojtMethod,
  startDate: t.startDate.toISOString().slice(0, 10),
  endDate: t.endDate.toISOString().slice(0, 10),
  startTime: formatTime(t.startTime),
  endTime: formatTime(t.endTime),
  venue: t.venue,
  program: t.program,
});

/** Saves the OJT form for an OJT the person recorded themselves: its details and their answers, together. */
export async function updateOjt(user: SessionUser, participantId: number, input: OjtInput, answers: Answers, today: Date) {
  const late = ojtDateBlock(input.endDate, today);
  if (late) throw new UserError(late, { endDate: ["Pick today or an earlier date"] });
  return db.$transaction(async (tx) => {
    const p = await tx.participant.findFirst({ where: { id: participantId, staffId: user.id }, select: participantSelect });
    if (!p || p.training.type !== "OJT") throw notFound();
    const blocked = ojtDetailsBlock(p, p.training._count.participants - 1);
    if (blocked) throw new UserError(blocked);

    const changes = diffFields(ojtAuditView(p.training), ojtAuditView(input), [
      "title",
      "ojtMethod",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "venue",
      "program",
    ]);
    // Saving the form replaces any sessions, as the training form does.
    await tx.trainingSession.deleteMany({ where: { trainingId: p.training.id } });
    await tx.training.update({ where: { id: p.training.id }, data: input });
    if (Object.keys(changes).length)
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Training",
        entityId: p.training.id,
        summary: `${user.name} (${user.staffNo}) updated their own OJT ${input.title}`,
        changes,
      });

    // The answers, when they changed: the same entry as updating them on their own.
    if (JSON.stringify(p.feedback) !== JSON.stringify(answers)) {
      await tx.participant.update({
        where: { id: p.id },
        data: { feedback: answers as Prisma.InputJsonObject, feedbackVersion: CURRENT_FORM.OJT.version, submittedAt: p.submittedAt ?? new Date() },
      });
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "Participant",
        entityId: p.training.id,
        summary: `${user.name} (${user.staffNo}) updated their OJT answers`,
      });
    }
  });
}

/** Deletes an OJT the person recorded themselves, with its training record. */
export async function deleteOjt(user: SessionUser, participantId: number) {
  const certificate = await db.$transaction(async (tx) => {
    const p = await tx.participant.findFirst({ where: { id: participantId, staffId: user.id }, select: participantSelect });
    if (!p || p.training.type !== "OJT") throw notFound();
    const blocked = ojtDeleteBlock(p, p.training._count.participants - 1);
    if (blocked) throw new UserError(blocked);
    await tx.participant.delete({ where: { id: p.id } });
    await tx.training.delete({ where: { id: p.training.id } }); // sessions cascade
    await recordAudit(tx, {
      actorId: user.id,
      action: "DELETE",
      entity: "Training",
      entityId: p.training.id,
      summary: `${user.name} (${user.staffNo}) deleted their own OJT ${describeOjt(p.training)}`,
    });
    return p.training.certificateFile;
  });
  await discardCertificateFile(certificate);
}
