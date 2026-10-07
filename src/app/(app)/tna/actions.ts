"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia, plural } from "@/lib/format";
import { toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import { approveTnas, createTna, deleteTna, reopenTna, sendBackTna, submitTna, TnaContentError, updateTna, type TnaTarget } from "@/server/services/tna";

// Every action asks only that the person is signed in: the service checks
// what they are to the TNA (the person it is about, the main clerk, the HOD,
// L&D, or none of these), whether its year is open and what step it is at,
// and refuses with the reason.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The TNA's pages, the lists it appears in, and the counts in the sidebar. */
function refresh() {
  revalidatePath("/", "layout");
}

/** Content problems come back keyed "section.ESG" or "row.3", so the form can show each in its place. */
function toFormError(e: unknown): ActionState {
  if (e instanceof TnaContentError)
    return {
      status: "error",
      message: e.message,
      fieldErrors: e.problems.reduce<Record<string, string[]>>((all, p) => {
        if (p.at === "form") return all;
        const key = "section" in p.at ? `section.${p.at.section}` : `row.${p.at.row}`;
        (all[key] ??= []).push(p.message);
        return all;
      }, {}),
    };
  return toErrorState(e);
}

const modeOf = (fd: FormData) => (str(fd.get("intent")) === "submit" ? "submit" : "draft");
/** A person's own TNA lives under My TNA; everyone else's under Team. */
const home = (own: boolean, id: number) => (own ? "/my-tna" : `/tna/${id}`);

/** This year's TNA for a person or a job grade: saved as a draft or sent to the HOD. */
export async function createTnaAction(target: TnaTarget, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const mode = modeOf(fd);
  let id: number;
  try {
    id = await createTna(user, target, str(fd.get("content")), mode, nowInMalaysia());
  } catch (e) {
    return toFormError(e);
  }
  refresh();
  redirect(`${home("staffId" in target && target.staffId === user.id, id)}?saved=${mode === "submit" ? "submitted" : "draft"}`);
}

/** The form again: for a draft, one sent back, or (the HOD and L&D) one waiting for approval. */
export async function updateTnaAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const mode = modeOf(fd);
  let result: { withHod: boolean; own: boolean };
  try {
    result = await updateTna(user, id, str(fd.get("content")), mode, nowInMalaysia());
  } catch (e) {
    return toFormError(e);
  }
  refresh();
  redirect(`${home(result.own, id)}?saved=${result.withHod ? "changed" : mode === "submit" ? "submitted" : "draft"}`);
}

/** Sends a draft to the HOD as it stands. */
export async function submitTnaAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await submitTna(user, id, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Sent to the HOD for approval." };
}

export async function deleteTnaAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  let deleted: { own: boolean; individual: boolean };
  try {
    deleted = await deleteTna(user, id, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(deleted.own ? "/my-tna?deleted=1" : `/tna?view=${deleted.individual ? "staff" : "grade"}&deleted=1`);
}

/** The HOD approves one TNA, or every one listed. */
export async function approveTnasAction(ids: number[], _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { approved, skipped } = await approveTnas(user, ids, nowInMalaysia());
    refresh();
    return {
      status: "ok",
      message: `${approved === 1 ? "Approved." : `Approved ${plural(approved, "TNA")}.`}${skipped.length ? ` ${skipped.length} skipped: ${skipped[0]}` : ""}`,
    };
  } catch (e) {
    return toErrorState(e);
  }
}

/** The HOD sends a TNA back to whoever fills it in. */
export async function sendBackTnaAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await sendBackTna(user, id, str(fd.get("reason")), nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Sent back. It can now be changed and submitted again." };
}

/** L&D reopen an approved TNA. */
export async function reopenTnaAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await reopenTna(user, id, str(fd.get("reason")), nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Reopened. It can now be changed, and must be submitted and approved again." };
}
