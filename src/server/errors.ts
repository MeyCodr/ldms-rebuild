import { Prisma } from "@prisma/client";
import { z } from "zod";

/** A business-rule failure whose message is safe to show the user as-is. */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

import type { ActionState } from "@/lib/action-state";

export type { ActionState };
export { idle } from "@/lib/action-state";

export function parseForm<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error);
    throw new UserError("Check the highlighted fields.", fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

/** Turns thrown errors into a form state. Unknown errors are logged, not shown. */
export function toErrorState(e: unknown): ActionState {
  if (e instanceof UserError) return { status: "error", message: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String((e.meta?.target as string[] | string | undefined) ?? "");
    if (target.includes("staffNo")) return { status: "error", message: "That staff no. is already in use.", fieldErrors: { staffNo: ["Already in use"] } };
    return { status: "error", message: "That name is already in use here.", fieldErrors: { name: ["Already in use"] } };
  }
  // Next.js uses thrown errors for redirect() and forbidden(); let them through.
  if (e && typeof e === "object" && "digest" in e) throw e;
  console.error(e);
  return { status: "error", message: "Something went wrong and nothing was saved. Try again, or tell the L&D unit if it keeps happening." };
}
