"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/server/auth";
import type { ActionState } from "@/lib/action-state";
import { safeRedirect } from "@/lib/safe-redirect";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staffNo = String(formData.get("staffNo") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!staffNo || !password) {
    return {
      status: "error",
      message: "Enter your staff no. and password.",
      fieldErrors: { ...(!staffNo && { staffNo: ["Required"] }), ...(!password && { password: ["Required"] }) },
    };
  }
  try {
    await signIn("credentials", { staffNo, password, redirectTo: safeRedirect(formData.get("from")) });
    return { status: "idle" };
  } catch (e) {
    if (e instanceof AuthError) {
      if ("code" in e && e.code === "locked")
        return { status: "error", message: "Too many attempts for this staff no. Wait 10 minutes and try again." };
      return { status: "error", message: "Staff no. or password is not correct. Resigned staff can no longer sign in." };
    }
    throw e;
  }
}
