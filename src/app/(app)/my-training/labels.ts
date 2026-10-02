import type { MyTrainingRow } from "@/server/services/myTraining";

type StatusTone = "ok" | "wait" | "bad" | "na";

/** The statuses My training can be filtered by, in the filter's order. */
export const MY_STATUSES = {
  due: "Feedback due",
  upcoming: "Coming up",
  completed: "Completed",
  absent: "Absent",
  cancelled: "Cancelled",
} as const;
export type MyStatusKey = keyof typeof MY_STATUSES;

/** Where one of the person's trainings stands, in their words. */
export function myStatus(r: Pick<MyTrainingRow, "attendance" | "access" | "training" | "kind">): { key: MyStatusKey; tone: StatusTone; label: string } {
  if (r.training.status === "CANCELLED") return { key: "cancelled", tone: "bad", label: "Cancelled" };
  if (r.access.mode === "submit") return { key: "due", tone: "wait", label: r.kind === "OJT" ? "Answers due" : "Feedback due" };
  if (r.attendance === "ABSENT") return { key: "absent", tone: "na", label: "Absent" };
  if (r.attendance === "PENDING") return { key: "upcoming", tone: "na", label: "Coming up" };
  return { key: "completed", tone: "ok", label: "Completed" };
}

/** Who put an OJT on the person's record ("you", "your clerk", "L&D"); nothing for other trainings. */
export function ojtRecordedBy(r: Pick<MyTrainingRow, "kind" | "source">): string | null {
  if (r.kind !== "OJT") return null;
  return r.source === "SELF" ? "you" : r.source === "CLERK" || r.source === "IMPORT" ? "your clerk" : "L&D";
}
