"use server";

import { revalidatePath } from "next/cache";
import { toErrorState, UserError } from "@/server/errors";
import { requireUser } from "@/server/session";
import { commitStaffImport, previewStaffImport, type ImportPreview } from "@/server/services/staffImport";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function readFile(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("Choose an Excel file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new UserError("Only .xlsx files can be imported. In Excel, use File → Save As → Excel Workbook.");
  if (file.size > 4 * 1024 * 1024) throw new UserError("The file is larger than 4 MB. Split it into smaller files.");
  return { name: file.name, buffer: await file.arrayBuffer() };
}

function fail(e: unknown): { ok: false; message: string } {
  const state = toErrorState(e);
  return { ok: false, message: state.status === "error" ? state.message : "Import failed." };
}

export async function previewImportAction(fd: FormData): Promise<Result<ImportPreview>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    return { ok: true, data: await previewStaffImport(user, name, buffer) };
  } catch (e) {
    return fail(e);
  }
}

export async function commitImportAction(fd: FormData): Promise<Result<{ created: number; updated: number; skipped: number }>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    const result = await commitStaffImport(user, name, buffer, fd.get("skipErrors") === "on");
    revalidatePath("/staff");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}
