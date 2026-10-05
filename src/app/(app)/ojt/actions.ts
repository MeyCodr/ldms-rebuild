"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { ojtEntrySchema } from "@/lib/validation/ojt";
import { toErrorState, UserError } from "@/server/errors";
import { requireUser } from "@/server/session";
import { deleteOjtEntry, recordOjtForStaff, updateOjtEntry } from "@/server/services/ojt";
import { commitOjtImport, previewOjtImport, type OjtImportPreview } from "@/server/services/ojtImport";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** The list, the overview and the nav count of the staff it was recorded for. */
function refresh() {
  revalidatePath("/", "layout");
}

function parseOjtEntry(fd: FormData) {
  const parsed = ojtEntrySchema.safeParse({
    title: str(fd.get("title")),
    ojtMethod: str(fd.get("ojtMethod")),
    startDate: str(fd.get("startDate")),
    endDate: str(fd.get("endDate")),
    startTime: str(fd.get("startTime")),
    endTime: str(fd.get("endTime")),
    venue: str(fd.get("venue")),
    trainer: str(fd.get("trainer")),
    trainerName: str(fd.get("trainerName")),
    staffIds: fd.getAll("staffIds").map(str),
  });
  if (!parsed.success) throw new UserError("Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  return parsed.data;
}

/** One OJT for the staff picked on the form. */
export async function recordOjtEntryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof recordOjtForStaff>>;
  try {
    const { details, staffIds } = parseOjtEntry(fd);
    result = await recordOjtForStaff(user, details, staffIds, nowInMalaysia());
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(`/ojt?recorded=${result.count}&completed=${result.attendance === "COMPLETED" ? 1 : 0}`);
}

/** Saves the form for the OJT a record belongs to. Back to the record, or to the list when its person was unticked. */
export async function updateOjtEntryAction(participantId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let stillOn: boolean;
  try {
    const { details, staffIds } = parseOjtEntry(fd);
    ({ stillOn } = await updateOjtEntry(user, participantId, details, staffIds, nowInMalaysia()));
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect(stillOn ? `/ojt/${participantId}?saved=1` : "/ojt?updated=1");
}

/** Deletes the OJT a record belongs to, for everyone on it. */
export async function deleteOjtEntryAction(participantId: number, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteOjtEntry(user, participantId);
  } catch (e) {
    return toErrorState(e);
  }
  refresh();
  redirect("/ojt?deleted=1");
}

// ---------- Excel import ----------

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

export async function previewOjtImportAction(fd: FormData): Promise<Result<OjtImportPreview>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    return { ok: true, data: await previewOjtImport(user, name, buffer, nowInMalaysia()) };
  } catch (e) {
    return fail(e);
  }
}

export async function commitOjtImportAction(fd: FormData): Promise<Result<{ ojt: number; people: number }>> {
  const user = await requireUser();
  try {
    const { name, buffer } = await readFile(fd);
    const result = await commitOjtImport(user, name, buffer, nowInMalaysia());
    refresh();
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}
