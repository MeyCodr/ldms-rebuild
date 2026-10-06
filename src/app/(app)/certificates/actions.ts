"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { toErrorState, UserError } from "@/server/errors";
import { requireUser } from "@/server/session";
import { removeCertificate, uploadCertificate } from "@/server/services/certificate";

/** The training page, the OJT record and My training all show the certificate. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function uploadCertificateAction(trainingId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const file = fd.get("certificate");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the certificate file first.", { certificate: ["Choose a file"] });
    await uploadCertificate(user, trainingId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Certificate uploaded." };
}

export async function removeCertificateAction(trainingId: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await removeCertificate(user, trainingId);
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  return { status: "ok", message: "Certificate removed." };
}
