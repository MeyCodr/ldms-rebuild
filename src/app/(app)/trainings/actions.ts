"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { trainingSchema } from "@/lib/validation/training";
import { parseForm, toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import { cancelTraining, createTraining, deleteTraining, restoreTraining, updateTraining } from "@/server/services/training";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** The fields on the training form (see trainingSchema). */
function fields(fd: FormData) {
  return {
    type: str(fd.get("type")),
    title: str(fd.get("title")),
    venue: str(fd.get("venue")),
    cost: str(fd.get("cost")),
    hrdfClaimable: str(fd.get("hrdfClaimable")),
    platform: str(fd.get("platform")),
    function: str(fd.get("function")),
    startDate: str(fd.get("startDate")),
    endDate: str(fd.get("endDate")),
    startTime: str(fd.get("startTime")),
    endTime: str(fd.get("endTime")),
    program: str(fd.get("program")),
    trainerStaffId: str(fd.get("trainerStaffId")),
    trainerName: str(fd.get("trainerName")),
  };
}

export async function createTrainingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: number;
  try {
    const training = await createTraining(user, parseForm(trainingSchema, fields(fd)));
    id = training.id;
  } catch (e) {
    return toErrorState(e);
  }
  revalidatePath("/trainings");
  redirect(`/trainings/${id}?saved=created`);
}

export async function updateTrainingAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await updateTraining(user, id, parseForm(trainingSchema, fields(fd)));
  } catch (e) {
    return toErrorState(e);
  }
  revalidatePath("/trainings");
  redirect(`/trainings/${id}?saved=updated`);
}

export async function cancelTrainingAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await cancelTraining(user, id);
    revalidatePath(`/trainings/${id}`);
    return { status: "ok", message: "Training cancelled. Its hours no longer count toward anyone's total." };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function restoreTrainingAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await restoreTraining(user, id);
    revalidatePath(`/trainings/${id}`);
    return { status: "ok", message: "Training restored. Completed attendance counts toward hours again." };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function deleteTrainingAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteTraining(user, id);
  } catch (e) {
    return toErrorState(e);
  }
  revalidatePath("/trainings");
  redirect("/trainings?deleted=1");
}
