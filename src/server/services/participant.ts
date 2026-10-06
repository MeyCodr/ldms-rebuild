import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import type { SessionUser } from "../permissions";
import {
  addParticipantBlock,
  addToTrainingBlock,
  ATTENDANCE_AFTER,
  participantActionBlock,
} from "../rules/attendance";
import { countsTowardHours, trainingHours } from "../rules/training";
import type { ParticipantActionInput } from "@/lib/validation/participant";
import { ATTENDANCE_LABELS, PARTICIPANT_ACTION_LABELS } from "@/lib/validation/participant";
import { nowInMalaysia, plural } from "@/lib/format";
import { recordAudit } from "./audit";
import { ensure } from "./org";
import { syncPmes } from "./pmeSync";

// Participant changes are audited with entity "Participant" and the training's
// id, so the training page's history shows who changed whose attendance. Each
// add or action writes one entry, listing everyone it touched, so adding a
// whole department doesn't push the training's own changes out of its history.

/** "Name (staff no.)", as audit entries name people. */
const who = (s: { name: string; staffNo: string }) => `${s.name} (${s.staffNo})`;

const participantSelect = {
  id: true,
  attendance: true,
  attendanceReason: true,
  source: true,
  submittedAt: true,
  createdAt: true,
  // Their PME for this training, when they have one (rules/pme.ts).
  pme: { select: { id: true, status: true, periodEnd: true, returnedAt: true } },
  staff: {
    select: {
      id: true,
      staffNo: true,
      name: true,
      position: true,
      designation: true,
      status: true,
      department: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
} satisfies Prisma.ParticipantSelect;

export type ParticipantRow = Prisma.ParticipantGetPayload<{ select: typeof participantSelect }>;

/** A training's participants, by department then name. */
export async function listParticipants(user: SessionUser, trainingId: number): Promise<ParticipantRow[]> {
  ensure(user, "training.view");
  return db.participant.findMany({
    where: { trainingId },
    orderBy: [{ staff: { department: { name: "asc" } } }, { staff: { name: "asc" } }],
    select: participantSelect,
  });
}

/** The participant list with the hours each person gets, for the Excel export. */
export async function participantsForExport(user: SessionUser, trainingId: number) {
  ensure(user, "training.view");
  const training = await db.training.findUnique({ where: { id: trainingId }, include: { sessions: true } });
  if (!training) return null;
  const hours = trainingHours(training) ?? 0;
  const rows = await listParticipants(user, trainingId);
  return {
    training,
    rows: rows.map((p) => ({ ...p, hours: countsTowardHours({ attendance: p.attendance, training }) ? hours : 0 })),
  };
}

/**
 * Active staff to choose from when adding participants, with the ones already
 * on the list marked. Loaded when the Add dialog opens, not with the page.
 */
export async function participantCandidates(user: SessionUser, trainingId: number) {
  ensure(user, "training.manage");
  const [staff, added] = await Promise.all([
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        staffNo: true,
        name: true,
        designation: true,
        departmentId: true,
        sectionId: true,
        department: { select: { name: true, division: { select: { name: true } } } },
      },
    }),
    db.participant.findMany({ where: { trainingId }, select: { staffId: true } }),
  ]);
  const onList = new Set(added.map((a) => a.staffId));
  const departments = await db.department.findMany({
    orderBy: [{ division: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, division: { select: { name: true } }, sections: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
  return {
    staff: staff.map((s) => ({
      id: s.id,
      staffNo: s.staffNo,
      name: s.name,
      designation: s.designation,
      departmentId: s.departmentId,
      sectionId: s.sectionId,
      departmentName: s.department.name,
      added: onList.has(s.id),
    })),
    departments: departments.map((d) => ({ id: d.id, name: d.name, division: d.division.name, sections: d.sections })),
  };
}

export type AddResult = { added: number; skipped: string[] };

/** Adds staff as PENDING participants. Duplicates and resigned staff are skipped and reported. */
export async function addParticipants(user: SessionUser, trainingId: number, staffIds: number[]): Promise<AddResult> {
  ensure(user, "training.manage");
  return db.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id: trainingId }, select: { id: true, title: true, status: true } });
    if (!training) throw new UserError("This training no longer exists.");
    const blocked = addToTrainingBlock(training);
    if (blocked) throw new UserError(blocked);

    const [staff, existing] = await Promise.all([
      tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, staffNo: true, name: true, status: true }, orderBy: { name: "asc" } }),
      tx.participant.findMany({ where: { trainingId, staffId: { in: staffIds } }, select: { staffId: true } }),
    ]);
    const onList = new Set(existing.map((e) => e.staffId));
    const skipped: string[] = [];
    if (staff.length < staffIds.length) skipped.push(plural(staffIds.length - staff.length, "staff member") + " no longer in the staff list.");
    const adding = staff.filter((s) => {
      const why = addParticipantBlock(s, onList.has(s.id));
      if (why) skipped.push(why);
      return !why;
    });

    if (adding.length) {
      await tx.participant.createMany({
        data: adding.map((s) => ({ trainingId, staffId: s.id, source: "ADMIN" as const, recordedById: user.id })),
      });
      const one = adding.length === 1;
      await recordAudit(tx, {
        actorId: user.id,
        action: "CREATE",
        entity: "Participant",
        entityId: trainingId,
        summary: `Added ${one ? who(adding[0]) : plural(adding.length, "participant")} to ${training.title}`,
        changes: one ? undefined : { staff: [null, adding.map(who).join(", ")] },
      });
    }
    return { added: adding.length, skipped };
  });
}

export type ActionResult = { changed: number; skipped: string[] };

/**
 * Applies one attendance action (or removal) to one or more participants of a
 * training. Rows the action doesn't apply to are skipped with the reason;
 * if none apply, nothing changes and the first reason is shown as the error.
 */
export async function applyParticipantAction(user: SessionUser, trainingId: number, input: ParticipantActionInput): Promise<ActionResult> {
  ensure(user, "training.manage");
  const today = nowInMalaysia();
  return db.$transaction(async (tx) => {
    const training = await tx.training.findUnique({ where: { id: trainingId }, select: { id: true, title: true, status: true, startDate: true, endDate: true } });
    if (!training) throw new UserError("This training no longer exists.");

    const rows = await tx.participant.findMany({
      where: { trainingId, id: { in: input.participantIds } },
      select: {
        id: true,
        attendance: true,
        attendanceReason: true,
        feedback: true,
        submittedAt: true,
        staff: { select: { name: true, staffNo: true } },
        pme: { select: { status: true, returnedAt: true } },
      },
      orderBy: { staff: { name: "asc" } },
    });
    const skipped: string[] = [];
    if (rows.length < input.participantIds.length)
      skipped.push(`${plural(input.participantIds.length - rows.length, "participant")} no longer on this training.`);

    const applying = rows.filter((p) => {
      const why = participantActionBlock(
        input.action,
        { name: p.staff.name, attendance: p.attendance, hasFeedback: p.feedback !== null || p.submittedAt !== null, pme: p.pme },
        training,
        today,
      );
      if (why) skipped.push(why);
      return !why;
    });
    if (!applying.length) throw new UserError(skipped[0] ?? "Nothing to change.");

    const ids = applying.map((p) => p.id);
    const after = ATTENDANCE_AFTER[input.action];
    if (after === null) await tx.participant.deleteMany({ where: { id: { in: ids } } });
    else
      await tx.participant.updateMany({
        where: { id: { in: ids } },
        // The reason belongs to the attendance it explains; going back to pending clears it.
        data: { attendance: after, attendanceReason: after === "PENDING" ? null : input.reason },
      });
    // Completed: executives and managers get a PME. Reopened: one not yet evaluated is withdrawn.
    if (after !== null) await syncPmes(tx, { id: { in: ids } });

    // One entry for the whole action. The reason is kept on the row for absent
    // and completed; for the other actions (reopen, undo absent, remove) it
    // lives in the audit log only.
    const label = PARTICIPANT_ACTION_LABELS[input.action];
    const changes: Record<string, [unknown, unknown]> = {};
    let name: string;
    if (applying.length === 1) {
      const [p] = applying;
      name = who(p.staff);
      if (after !== null) changes.attendance = [ATTENDANCE_LABELS[p.attendance], ATTENDANCE_LABELS[after]];
      if (input.reason) changes.reason = [p.attendanceReason, input.reason];
      else if (p.attendanceReason) changes.reason = [p.attendanceReason, null];
    } else {
      name = plural(applying.length, "participant");
      // The rules let each action start from one attendance only, so this is one value.
      const before = [...new Set(applying.map((p) => ATTENDANCE_LABELS[p.attendance]))].join(" or ");
      if (after !== null) changes.attendance = [before, ATTENDANCE_LABELS[after]];
      if (input.reason) changes.reasonGiven = [null, input.reason];
      // Anyone's earlier reason goes with their name, so the entry keeps what was replaced.
      changes.staff = [
        null,
        applying.map((p) => (p.attendanceReason ? `${p.staff.name} (${p.staff.staffNo}, reason was: ${p.attendanceReason})` : who(p.staff))).join(", "),
      ];
    }
    await recordAudit(tx, {
      actorId: user.id,
      action: after === null ? "DELETE" : "UPDATE",
      entity: "Participant",
      entityId: trainingId,
      summary: after === null ? `Removed ${name} from ${training.title}` : `${name} ${label.done}`,
      changes,
    });
    return { changed: applying.length, skipped };
  });
}
