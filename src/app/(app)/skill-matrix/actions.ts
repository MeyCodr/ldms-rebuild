"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia, plural } from "@/lib/format";
import { toErrorState } from "@/server/errors";
import { quarterParam } from "@/server/rules/skill";
import { requireUser } from "@/server/session";
import {
  approveSkillMatrices,
  createSkillMatrix,
  deleteSkillMatrix,
  duplicateSkillMatrix,
  duplicateTargets,
  sendBackSkillMatrix,
  SkillContentError,
  submitSkillMatrix,
  updateSkillMatrix,
} from "@/server/services/skill";

// Every action asks only that the person is signed in: the service checks
// what they are to the matrix (its evaluator, the HOD, or neither), whether
// its quarter is open and what step it is at, and refuses with the reason.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The matrix's pages, the lists it appears in, and the counts in the sidebar. */
function refresh() {
  revalidatePath("/", "layout");
}

/** Content problems come back keyed "section.KNOWLEDGE" or "topic.3", so the form can show each in its place. */
function toFormError(e: unknown): ActionState {
  if (e instanceof SkillContentError)
    return {
      status: "error",
      message: e.message,
      fieldErrors: e.problems.reduce<Record<string, string[]>>((all, p) => {
        const key = "section" in p.at ? `section.${p.at.section}` : `topic.${p.at.topic}`;
        (all[key] ??= []).push(p.message);
        return all;
      }, {}),
    };
  return toErrorState(e);
}

const modeOf = (fd: FormData) => (str(fd.get("intent")) === "submit" ? "submit" : "draft");

/** A new matrix for a staff member, in the open quarter: saved as a draft or sent to the HOD. */
export async function createSkillMatrixAction(staffId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const mode = modeOf(fd);
  let id: number;
  try {
    id = await createSkillMatrix(user, staffId, str(fd.get("content")), mode, nowInMalaysia());
  } catch (e) {
    return toFormError(e);
  }
  refresh();
  redirect(`/skill-matrix/${id}?saved=${mode === "submit" ? "submitted" : "draft"}`);
}

/** The form again, for a draft or a matrix the HOD sent back. */
export async function updateSkillMatrixAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const mode = modeOf(fd);
  try {
    await updateSkillMatrix(user, id, str(fd.get("content")), mode, nowInMalaysia());
  } catch (e) {
    return toFormError(e);
  }
  refresh();
  redirect(`/skill-matrix/${id}?saved=${mode === "submit" ? "submitted" : "draft"}`);
}

/** Sends a draft to the HOD as it stands. */
export async function submitSkillMatrixAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await submitSkillMatrix(user, id, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Sent to the HOD for approval." };
}

export async function deleteSkillMatrixAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  let quarter: { year: number; quarter: number };
  try {
    quarter = await deleteSkillMatrix(user, id, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/skill-matrix?quarter=${quarterParam(quarter)}&deleted=1`);
}

/** The HOD approves one matrix, or every one listed. */
export async function approveSkillMatricesAction(ids: number[], _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { approved, skipped } = await approveSkillMatrices(user, ids, nowInMalaysia());
    refresh();
    return {
      status: "ok",
      message: `${approved === 1 ? "Approved." : `Approved ${plural(approved, "matrix", "matrices")}.`}${skipped.length ? ` ${skipped.length} skipped: ${skipped[0]}` : ""}`,
    };
  } catch (e) {
    return toErrorState(e);
  }
}

/** The HOD sends a matrix back to the evaluator. */
export async function sendBackSkillMatrixAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await sendBackSkillMatrix(user, id, str(fd.get("reason")), nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Sent back to the evaluator, who can now change it and submit again." };
}

/** Who a matrix can be duplicated to. Loaded when the Duplicate dialog opens, not with the page. */
export async function duplicateTargetsAction(id: number) {
  const user = await requireUser();
  return duplicateTargets(user, id, nowInMalaysia());
}

/** Copies a matrix to the chosen staff, as drafts in the open quarter. */
export async function duplicateSkillMatrixAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const staffIds = [...new Set(fd.getAll("staffIds").map((v) => Number(v)))].filter((n) => Number.isInteger(n) && n > 0);
  if (!staffIds.length) return { status: "error", message: "Choose at least one staff member." };
  if (staffIds.length > 200) return { status: "error", message: "Choose at most 200 at a time." };
  try {
    const { created, skipped } = await duplicateSkillMatrix(user, id, staffIds, nowInMalaysia());
    refresh();
    return {
      status: "ok",
      message: `${plural(created, "draft")} made.${skipped.length ? ` ${skipped.length} skipped: ${skipped[0]}` : ""} Open each one to adjust the ratings before sending it to the HOD.`,
    };
  } catch (e) {
    return toErrorState(e);
  }
}
