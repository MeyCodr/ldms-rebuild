"use server";

import type { ActionState } from "@/lib/action-state";
import { changePasswordSchema } from "@/lib/validation/staff";
import { parseForm, toErrorState } from "@/server/errors";
import { signIn } from "@/server/auth";
import { requireUser } from "@/server/session";
import { changeOwnPassword } from "@/server/services/staff";

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser({ allowPendingPasswordChange: true });
  let next: string;
  try {
    const input = parseForm(changePasswordSchema, { current: fd.get("current"), next: fd.get("next"), confirm: fd.get("confirm") });
    await changeOwnPassword(user, input.current, input.next);
    next = input.next;
  } catch (e) {
    return toErrorState(e);
  }
  // Changing the password ends every existing session, including this one.
  // Sign straight back in here so only other devices are signed out.
  await signIn("credentials", { staffNo: user.staffNo, password: next, redirectTo: user.mustChangePassword ? "/" : "/account?changed=1" });
  return { status: "idle" };
}
