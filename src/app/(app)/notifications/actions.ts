"use server";

import { revalidatePath } from "next/cache";
import { markAllNotificationsRead } from "@/server/services/notification";
import { requireUser } from "@/server/session";

/** Marks all of the signed-in person's notifications read; the count in the sidebar follows. */
export async function markAllReadAction() {
  const user = await requireUser();
  await markAllNotificationsRead(user);
  revalidatePath("/", "layout");
}
