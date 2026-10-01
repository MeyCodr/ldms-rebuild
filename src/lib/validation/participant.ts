import { z } from "zod";
import { MAX_ADD, MAX_REASON, PARTICIPANT_ACTIONS, REASON_REQUIRED, type ParticipantAction } from "@/server/rules/attendance";

export const ATTENDANCE_LABELS = { PENDING: "Pending", COMPLETED: "Completed", ABSENT: "Absent" } as const;

/** Button, dialog and result wording for each action. */
export const PARTICIPANT_ACTION_LABELS: Record<ParticipantAction, { verb: string; done: string }> = {
  MARK_ABSENT: { verb: "Mark absent", done: "marked absent" },
  UNDO_ABSENT: { verb: "Undo absent", done: "set back to pending" },
  MARK_COMPLETED: { verb: "Mark completed", done: "marked completed" },
  REOPEN: { verb: "Reopen", done: "reopened" },
  REMOVE: { verb: "Remove", done: "removed" },
};

const ids = (max: number, what: string) =>
  z
    .array(z.coerce.number().int().positive())
    .min(1, `Choose at least one ${what}`)
    .max(max, `Choose at most ${max} at a time`)
    .transform((a) => [...new Set(a)]);

export const addParticipantsSchema = z.object({ staffIds: ids(MAX_ADD, "staff member") });

export const participantActionSchema = z
  .object({
    action: z.enum(PARTICIPANT_ACTIONS, "Choose what to do"),
    participantIds: ids(MAX_ADD, "participant"),
    reason: z.string().trim().max(MAX_REASON, `Keep the reason under ${MAX_REASON} characters`),
  })
  .superRefine((v, ctx) => {
    if (REASON_REQUIRED[v.action] && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Say why, e.g. they can't use a computer" });
  })
  .transform((v) => ({ ...v, reason: v.reason || null }));

export type ParticipantActionInput = z.infer<typeof participantActionSchema>;
