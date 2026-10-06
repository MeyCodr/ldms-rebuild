"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import { acknowledgePme, evaluatePme, sendBackPme, verifyPme } from "@/server/services/pme";

// Every action asks only that the person is signed in: the service checks
// what they are to this PME (its subject, their HOD, or L&D) and what step it
// is at, and refuses with the reason.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The PME's pages, the lists it appears in, and the counts in the sidebar. */
function refresh() {
  revalidatePath("/", "layout");
}

/** The HOD's evaluation: the Performance Monitoring Form. */
export async function evaluatePmeAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const fields = Object.fromEntries([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
    await evaluatePme(user, id, fields, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/pme/${id}?saved=evaluated`);
}

/** The staff member acknowledges their evaluation. */
export async function acknowledgePmeAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await acknowledgePme(user, id, str(fd.get("comment")) || null, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/pme/${id}?saved=acknowledged`);
}

/** L&D verify. */
export async function verifyPmeAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await verifyPme(user, id, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Verified. This PME is now locked." };
}

/** L&D send it back to the HOD. */
export async function sendBackPmeAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await sendBackPme(user, id, str(fd.get("reason")), nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Sent back to the HOD, who can now evaluate again." };
}
