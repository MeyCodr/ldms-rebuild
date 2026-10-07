"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { toErrorState, UserError } from "@/server/errors";
import { requireUser } from "@/server/session";
import {
  addTnaCategory,
  addTnaOption,
  commitTnaOptionImport,
  deleteTnaCategory,
  deleteTnaOption,
  editTnaOption,
  previewTnaOptionImport,
  renameTnaCategory,
  toggleTnaOption,
  type OptionImportPreview,
} from "@/server/services/tnaOptions";

// The service checks that the person is L&D (tna.manage) on every call.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
/** The group chosen in a dialog: "" is no group. */
const group = (fd: FormData) => (/^\d{1,9}$/.test(str(fd.get("categoryId"))) ? Number(str(fd.get("categoryId"))) : null);

async function run(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath("/tna/options");
    return { status: "ok", message };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function addOptionAction(section: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await addTnaOption(user, section, group(fd), str(fd.get("name")));
    return "Added. It can be picked on the form from now on.";
  });
}

export async function editOptionAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const { renamed } = await editTnaOption(user, id, group(fd), str(fd.get("name")));
    return renamed ? `Saved. ${renamed} saved TNA ${renamed === 1 ? "row now shows" : "rows now show"} the new name.` : "Saved.";
  });
}

export async function toggleOptionAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => ((await toggleTnaOption(user, id)).active ? "Shown again." : "Hidden. Rows already saved keep it."));
}

export async function deleteOptionAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await deleteTnaOption(user, id);
    return "Deleted.";
  });
}

export async function addGroupAction(section: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await addTnaCategory(user, section, str(fd.get("name")));
    return "Group added. Put options in it with Add option, or by editing one.";
  });
}

export async function renameGroupAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await renameTnaCategory(user, id, str(fd.get("name")));
    return "Saved.";
  });
}

export async function deleteGroupAction(id: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await deleteTnaCategory(user, id);
    return "Group deleted.";
  });
}

// ---------- Excel import ----------

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function readFile(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("Choose an Excel file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new UserError("Only .xlsx files can be imported. Start from Download Excel on the Training options page.");
  if (file.size > 4 * 1024 * 1024) throw new UserError("The file is larger than 4 MB.");
  return { name: file.name, buffer: await file.arrayBuffer() };
}

function fail(e: unknown): { ok: false; message: string } {
  const state = toErrorState(e);
  return { ok: false, message: state.status === "error" ? state.message : "Import failed." };
}

export async function previewOptionImportAction(fd: FormData): Promise<Result<OptionImportPreview>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    return { ok: true, data: await previewTnaOptionImport(user, name, buffer) };
  } catch (e) {
    return fail(e);
  }
}

export async function commitOptionImportAction(fd: FormData): Promise<Result<{ created: number; updated: number }>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    const result = await commitTnaOptionImport(user, name, buffer);
    revalidatePath("/tna/options");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}
