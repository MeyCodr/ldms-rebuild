// Keeps PMEs in step with attendance. No "server-only" here, so the seed and
// prisma/sync-pme.ts can use it too; inside the app it is always called from a
// service, in the same transaction as the change it follows.

import type { Prisma } from "@prisma/client";
import { resolveApprover } from "../rules/approver";
import { pmeFollowsAttendance, pmePeriod, pmeRequirement } from "../rules/pme";
import { trainingHours } from "../rules/training";

type Tx = Prisma.TransactionClient;

/** What resolveApprover needs to know about a staff member. */
export const approverStaffSelect = {
  id: true,
  _count: { select: { hodOf: true } },
  department: {
    select: {
      hodId: true,
      hod: { select: { status: true } },
      division: { select: { headId: true } },
    },
  },
} satisfies Prisma.StaffSelect;

export type StaffForApprover = Prisma.StaffGetPayload<{ select: typeof approverStaffSelect }>;

export function approverInput(s: StaffForApprover) {
  return {
    staffId: s.id,
    isHodAnywhere: s._count.hodOf > 0,
    department: {
      hodId: s.department.hodId,
      hodActive: s.department.hod?.status === "ACTIVE",
      division: { headId: s.department.division.headId },
    },
  };
}

export type PmeSyncResult = { created: number; updated: number; withdrawn: number };

/**
 * Makes each of these participants' PME what it should be:
 *  - attendance Completed and the person gets one (pmeRequirement): made, as
 *    PENDING, or NOT_REQUIRED for a short training, with its period
 *  - anything else: withdrawn
 * A PME the HOD has already evaluated is left alone, whatever happens to the
 * attendance or the training afterwards.
 */
export async function syncPmes(tx: Tx, where: Prisma.ParticipantWhereInput): Promise<PmeSyncResult> {
  const rows = await tx.participant.findMany({
    where,
    select: {
      id: true,
      attendance: true,
      staff: { select: { status: true, designation: true, ...approverStaffSelect } },
      training: {
        select: {
          type: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          sessions: { select: { date: true, startTime: true, endTime: true } },
        },
      },
      pme: { select: { id: true, status: true, returnedAt: true, periodStart: true, periodEnd: true } },
    },
  });

  const result: PmeSyncResult = { created: 0, updated: 0, withdrawn: 0 };
  for (const p of rows) {
    if (p.pme && !pmeFollowsAttendance(p.pme)) continue;
    const need =
      p.attendance === "COMPLETED"
        ? pmeRequirement(p.staff, { type: p.training.type, hours: trainingHours(p.training) }, resolveApprover(approverInput(p.staff)))
        : null;

    if (!need || need.kind === "NONE") {
      if (p.pme) {
        await tx.pme.delete({ where: { id: p.pme.id } });
        result.withdrawn++;
      }
      continue;
    }

    const status = need.kind === "REQUIRED" ? ("PENDING" as const) : ("NOT_REQUIRED" as const);
    const period = pmePeriod(p.training);
    if (!p.pme) {
      await tx.pme.create({ data: { participantId: p.id, status, ...period } });
      result.created++;
    } else if (
      p.pme.status !== status ||
      p.pme.periodStart.getTime() !== period.periodStart.getTime() ||
      p.pme.periodEnd.getTime() !== period.periodEnd.getTime()
    ) {
      await tx.pme.update({ where: { id: p.pme.id }, data: { status, ...period } });
      result.updated++;
    }
  }
  return result;
}
