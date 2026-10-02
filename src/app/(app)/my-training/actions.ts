"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { answersSchema, OJT_V1, questionsOf, type FormDefinition } from "@/lib/forms/feedback";
import { nowInMalaysia } from "@/lib/format";
import { ojtSchema } from "@/lib/validation/myTraining";
import { toErrorState, UserError } from "@/server/errors";
import { requireUser } from "@/server/session";
import { deleteOjt, recordOjt, submitAnswers, updateOjt } from "@/server/services/myTraining";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** A form's answers as submitted; unanswered questions come through as "". */
function answerFields(form: FormDefinition, fd: FormData): Record<string, string> {
  return Object.fromEntries(questionsOf(form).map((q) => [q.id, str(fd.get(q.id))]));
}

/** Section A of the OJT form (see ojtSchema). */
const ojtFields = (fd: FormData) => ({
  title: str(fd.get("title")),
  ojtMethod: str(fd.get("ojtMethod")),
  startDate: str(fd.get("startDate")),
  endDate: str(fd.get("endDate")),
  startTime: str(fd.get("startTime")),
  endTime: str(fd.get("endTime")),
  venue: str(fd.get("venue")),
  trainer: str(fd.get("trainer")),
});

/** Everything that shows the person's training: My Training, the overview, and the nav's count. */
function refresh() {
  revalidatePath("/", "layout");
}

/** Feedback or OJT answers for one of the person's trainings. */
export async function submitAnswersAction(participantId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let done: "submitted" | "updated";
  try {
    // Every submitted field: the service works out which form applies and reads its questions.
    const fields = Object.fromEntries([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
    done = await submitAnswers(user, participantId, fields, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/my-training/${participantId}?saved=${done}`);
}

/**
 * The whole OJT form: Section A (details) and Section B (answers), checked
 * together so every problem shows at once.
 */
function parseOjtForm(fd: FormData) {
  const details = ojtSchema.safeParse(ojtFields(fd));
  const answers = answersSchema(OJT_V1).safeParse(answerFields(OJT_V1, fd));
  if (details.success && answers.success) return { details: details.data, answers: answers.data };
  const fieldErrors = {
    ...(details.success ? {} : z.flattenError(details.error).fieldErrors),
    ...(answers.success ? {} : z.flattenError(answers.error).fieldErrors),
  } as Record<string, string[]>;
  throw new UserError("Check the highlighted fields.", fieldErrors);
}

/** Records an OJT the person did, with their answers. */
export async function recordOjtAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: number;
  try {
    const { details, answers } = parseOjtForm(fd);
    id = await recordOjt(user, details, answers, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/my-training/${id}?saved=recorded`);
}

/** Saves the OJT form again for an OJT the person recorded: details and answers. */
export async function updateOjtAction(participantId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { details, answers } = parseOjtForm(fd);
    await updateOjt(user, participantId, details, answers, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/my-training/${participantId}?saved=changed`);
}

export async function deleteOjtAction(participantId: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteOjt(user, participantId);
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect("/my-training?deleted=1");
}
