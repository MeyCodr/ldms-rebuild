"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { nowInMalaysia } from "@/lib/format";
import { toErrorState } from "@/server/errors";
import { jobSummaryText, MAIL_MODES, type MailMode } from "@/server/rules/mail";
import { runDailyJobNow } from "@/server/services/job";
import { sendTestEmail, setMailMode } from "@/server/services/mail";
import { REMINDER_KINDS, type ReminderKind } from "@/server/rules/reminder";
import { sendReminderCopy, setReminderSettings } from "@/server/services/reminder";
import { requirePermission } from "@/server/session";

// Email and the daily job, for L&D. Each service checks the permission again
// and writes the audit entry or the run's own record.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function sendTestEmailAction(_prev: ActionState): Promise<ActionState> {
  const user = await requirePermission("jobs.manage");
  try {
    const result = await sendTestEmail(user);
    revalidatePath("/jobs");
    if (result.status === "FAILED") return { status: "error", message: `The test email could not be sent: ${result.error ?? "no reason given"}` };
    if (result.status === "RECORDED") return { status: "ok", message: `Email is off, so the test email to ${result.sentTo} was only recorded. Change the email mode to Test to really send one.` };
    return { status: "ok", message: `Test email sent to ${result.sentTo}.` };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function setMailModeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("jobs.manage");
  const mode = str(fd.get("mode")) as MailMode;
  if (!MAIL_MODES.includes(mode)) return { status: "error", message: "Choose Off, Test or Live." };
  try {
    const saved = await setMailMode(user, mode, str(fd.get("address")));
    revalidatePath("/jobs");
    const says: Record<MailMode, string> = {
      OFF: "Email is off. Emails are only recorded; none is sent.",
      TEST: `Email is in test mode. Every email is sent to ${saved.address}.`,
      LIVE: "Email is live. Emails are sent to staff.",
    };
    return { status: "ok", message: says[saved.mode] };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function setRemindersAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("jobs.manage");
  const on = fd.getAll("kind").filter((k): k is ReminderKind => typeof k === "string" && (REMINDER_KINDS as readonly string[]).includes(k));
  try {
    await setReminderSettings(user, on, str(fd.get("chaseFrom")));
    revalidatePath("/jobs");
    return { status: "ok", message: on.length === REMINDER_KINDS.length ? "Saved. Every kind of reminder is on." : `Saved. ${on.length} of ${REMINDER_KINDS.length} kinds of reminder are on.` };
  } catch (e) {
    return toErrorState(e);
  }
}

/** L&D send themselves a copy of one person's reminder email. */
export async function sendReminderCopyAction(staffId: number, _prev: ActionState): Promise<ActionState> {
  const user = await requirePermission("jobs.manage");
  try {
    const result = await sendReminderCopy(user, staffId, nowInMalaysia());
    revalidatePath("/jobs");
    if (result.status === "FAILED") return { status: "error", message: `The copy could not be sent: ${result.error ?? "no reason given"}` };
    if (result.status === "RECORDED") return { status: "ok", message: `Email is off, so the copy to ${result.sentTo} was only recorded. Change the email mode to Test to really send one.` };
    return { status: "ok", message: `A copy was sent to ${result.sentTo}.` };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function runDailyJobAction(_prev: ActionState): Promise<ActionState> {
  const user = await requirePermission("jobs.manage");
  try {
    const { summary } = await runDailyJobNow(user);
    revalidatePath("/jobs");
    return { status: "ok", message: `The daily job ran: ${jobSummaryText(summary)}.` };
  } catch (e) {
    revalidatePath("/jobs");
    return toErrorState(e);
  }
}
