"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { plural } from "@/lib/format";
import { addParticipantsSchema, PARTICIPANT_ACTION_LABELS, participantActionSchema } from "@/lib/validation/participant";
import { parseForm, toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import { addParticipants, applyParticipantAction, participantCandidates } from "@/server/services/participant";

/** "Skipped 2: A is already on the list. B has resigned." */
const skippedNote = (skipped: string[]) => (skipped.length ? ` Skipped ${skipped.length}: ${skipped.join(" ")}` : "");

/** Staff to choose from in the Add participants dialog. */
export async function participantCandidatesAction(trainingId: number) {
  const user = await requireUser();
  return participantCandidates(user, trainingId);
}

export async function addParticipantsAction(trainingId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { staffIds } = parseForm(addParticipantsSchema, { staffIds: fd.getAll("staffIds") });
    const r = await addParticipants(user, trainingId, staffIds);
    revalidatePath(`/trainings/${trainingId}`);
    if (r.added === 0) return { status: "error", message: `No one was added.${skippedNote(r.skipped)}` };
    return { status: "ok", message: `Added ${plural(r.added, "participant")}.${skippedNote(r.skipped)}` };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function participantAction(trainingId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const input = parseForm(participantActionSchema, {
      action: fd.get("action"),
      participantIds: fd.getAll("participantIds"),
      reason: typeof fd.get("reason") === "string" ? fd.get("reason") : "",
    });
    const r = await applyParticipantAction(user, trainingId, input);
    revalidatePath(`/trainings/${trainingId}`);
    const done = PARTICIPANT_ACTION_LABELS[input.action].done;
    const what = r.changed === 1 ? "1 participant" : `${r.changed} participants`;
    return { status: "ok", message: `${what[0].toUpperCase()}${what.slice(1)} ${done}.${skippedNote(r.skipped)}` };
  } catch (e) {
    return toErrorState(e);
  }
}
