import "server-only";
import type { AuditAction, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  actorId: number;
  action: AuditAction;
  entity: "Staff" | "Division" | "Department" | "Section" | "StaffRole" | "Setting" | "Training" | "Participant" | "Pme" | "SkillEvaluation" | "Tna" | "TnaTrainingOption" | "Tni";
  entityId: number | string;
  summary: string;
  changes?: Record<string, [unknown, unknown]>;
};

/** Written inside the same transaction as the change it describes. */
export async function recordAudit(tx: Tx, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: String(entry.entityId),
      summary: entry.summary.slice(0, 255),
      changes: entry.changes && Object.keys(entry.changes).length ? (entry.changes as Prisma.InputJsonValue) : undefined,
    },
  });
}

const normalise = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null);

/** Field-level before/after for the keys that actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T & string)[],
): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of keys) {
    if (!(key in after)) continue;
    const a = normalise(before[key]);
    const b = normalise(after[key]);
    if (a !== b) changes[key] = [a, b];
  }
  return changes;
}
