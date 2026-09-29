// Result of a form's server action. Shared by client forms and the server.

export type ActionState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const idle: ActionState = { status: "idle" };
