"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import { saveTni, TniContentError } from "@/server/services/tni";

// The action asks only that the person is signed in: the service checks that
// they are the department's HOD and that the year is open, and refuses with the reason.

/** The HOD saves their department's TNI for this year. Row problems come back keyed "row.3", so the form can show each in its place. */
export async function saveTniAction(departmentId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const content = fd.get("content");
  try {
    await saveTni(user, departmentId, typeof content === "string" ? content : "", nowInMalaysia());
  } catch (e) {
    if (e instanceof TniContentError)
      return {
        status: "error",
        message: e.message,
        fieldErrors: e.problems.reduce<Record<string, string[]>>((all, p) => {
          if (p.at !== "form") (all[`row.${p.at.row}`] ??= []).push(p.message);
          return all;
        }, {}),
      };
    return toErrorState(e);
  }
  revalidatePath("/tni", "layout");
  redirect(`/tni/${departmentId}?saved=1`);
}
