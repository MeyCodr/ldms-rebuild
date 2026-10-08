import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import { deliver, MailError, mailSendingBlock, mailSetup } from "../mailer";
import { can, type SessionUser } from "../permissions";
import { isEmail, MAIL_MODE_LABELS, mailMode, mailModeBlock, mailRoute, MAX_ATTEMPTS, parseSending, parseTestMode, type MailMode, type TestMode } from "../rules/mail";
import { recordAudit } from "./audit";

// Email: every message is written down (EmailMessage) before it is sent, with
// who it was meant for and where it really goes, then sent and marked. A
// message's dedupeKey is unique, so asking twice queues once; a failed one is
// tried again by the daily job (MAX_ATTEMPTS in all).
//
// Two settings decide what happens to an email (see rules/mail.ts):
// - Sending (mail.sending): off, an email is only written down ("recorded
//   only") and never sent. It starts off.
// - Test mode (mail.testMode): on, an email goes to the test address instead
//   of the person it is meant for.
// On the screen L&D make one choice that sets both: the email mode, Off, Test
// or Live (setMailMode). Each change is in the audit log under "Setting".

const TEST_MODE = "mail.testMode";
const SENDING = "mail.sending";

type Tx = Prisma.TransactionClient;

const ensureManager = (user: SessionUser) => {
  if (!can(user, "jobs.manage")) throw new UserError("Only L&D manage email and the daily job.");
};

export async function mailTestMode(client: Tx | typeof db = db): Promise<TestMode> {
  const setting = await client.setting.findUnique({ where: { key: TEST_MODE }, select: { value: true } });
  return parseTestMode(setting?.value);
}

export async function mailSending(client: Tx | typeof db = db): Promise<boolean> {
  const setting = await client.setting.findUnique({ where: { key: SENDING }, select: { value: true } });
  return parseSending(setting?.value);
}

/** How email is set up here, for the Jobs and email screen. */
export async function mailStatus(user: SessionUser) {
  ensureManager(user);
  const [sending, testMode, me] = await Promise.all([mailSending(), mailTestMode(), db.staff.findUnique({ where: { id: user.id }, select: { email: true } })]);
  return { mode: mailMode(sending, testMode), sending, setup: mailSetup(sending), sendingBlock: mailSendingBlock(), testMode, myEmail: me?.email ?? null };
}

/**
 * L&D choose the email mode: Off (only recorded), Test (sent to the test
 * address, which is given with it) or Live (sent to staff). The test address
 * is kept through Off and Live for the next time Test is chosen.
 */
export async function setMailMode(user: SessionUser, mode: MailMode, address: string): Promise<{ mode: MailMode; address: string }> {
  ensureManager(user);
  const block = mailModeBlock(mode, address, mailSendingBlock());
  if (block) throw new UserError(block.message, block.field ? { [block.field]: [block.message] } : undefined);
  return db.$transaction(async (tx) => {
    const [sendingBefore, testBefore] = [await mailSending(tx), await mailTestMode(tx)];
    const before = mailMode(sendingBefore, testBefore);
    const sending = mode !== "OFF";
    // Off leaves test mode as it was, so recorded emails are addressed as they would have been sent.
    const testMode: TestMode = mode === "TEST" ? { enabled: true, address } : mode === "LIVE" ? { enabled: false, address: testBefore.address } : testBefore;
    const addressChanged = mode === "TEST" && testBefore.address !== address;
    if (before === mode && !addressChanged) return { mode, address: testMode.address };
    if (sendingBefore !== sending) await tx.setting.upsert({ where: { key: SENDING }, update: { value: sending, updatedById: user.id }, create: { key: SENDING, value: sending, updatedById: user.id } });
    if (testBefore.enabled !== testMode.enabled || testBefore.address !== testMode.address)
      await tx.setting.upsert({ where: { key: TEST_MODE }, update: { value: testMode, updatedById: user.id }, create: { key: TEST_MODE, value: testMode, updatedById: user.id } });
    const changes: Record<string, [unknown, unknown]> = {};
    if (before !== mode) changes.mode = [MAIL_MODE_LABELS[before], MAIL_MODE_LABELS[mode]];
    if (addressChanged) changes.testAddress = [testBefore.address, address];
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "Setting",
      entityId: "mail.mode",
      summary:
        before === mode
          ? `Changed the test email address to ${address}`
          : mode === "OFF"
            ? "Switched email off: emails are only recorded, none is sent"
            : mode === "TEST"
              ? `Switched email to Test: every email is sent to ${address}`
              : "Switched email to Live: emails are sent to staff",
      changes,
    });
    return { mode, address: testMode.address };
  });
}

export type NewEmail = { kind: string; staffId: number | null; intendedTo: string; subject: string; body: string; dedupeKey: string };

/**
 * Writes an email down to be sent. Returns its id, or null when one with the
 * same dedupeKey exists already (it was queued before; nothing to do).
 */
export async function queueEmail(email: NewEmail): Promise<number | null> {
  const route = mailRoute(email.intendedTo, email.subject, await mailTestMode());
  try {
    const row = await db.emailMessage.create({
      data: {
        kind: email.kind,
        staffId: email.staffId,
        intendedTo: email.intendedTo,
        // No usable test address: kept, and it fails with that reason when sent.
        sentTo: route?.sentTo ?? "",
        subject: (route?.subject ?? email.subject).slice(0, 200),
        body: email.body,
        dedupeKey: email.dedupeKey,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") return null;
    throw e;
  }
}

export type SendResult = "SENT" | "RECORDED" | "FAILED";

/**
 * Sends one queued email and records how it went: sent, failed, or only
 * recorded because Sending is off (it is then never sent, even once Sending
 * is switched on). Never throws for a mail failure.
 */
export async function sendEmail(id: number, jobRunId: number | null = null): Promise<SendResult> {
  const email = await db.emailMessage.findUnique({ where: { id }, select: { status: true, sentTo: true, subject: true, body: true } });
  if (!email) return "FAILED";
  if (email.status === "SENT" || email.status === "RECORDED") return email.status;
  let error: string | null = null;
  let result: SendResult = "FAILED";
  try {
    if (!isEmail(email.sentTo)) throw new MailError("Test mode is on but has no test address.");
    result = await deliver({ to: email.sentTo, subject: email.subject, html: email.body }, await mailSending());
  } catch (e) {
    if (!(e instanceof MailError)) console.error(e);
    error = (e instanceof MailError ? e.message : "The email could not be sent.").slice(0, 500);
  }
  await db.emailMessage.update({
    where: { id },
    data: { status: result, error, attempts: { increment: 1 }, sentAt: result === "SENT" ? new Date() : null, ...(jobRunId ? { jobRunId } : {}) },
  });
  return result;
}

/** The daily job's step: sends everything still waiting, and tries failed ones again. */
export async function sendWaitingEmails(jobRunId: number): Promise<{ sent: number; recorded: number; failed: number }> {
  const waiting = await db.emailMessage.findMany({
    where: { OR: [{ status: "QUEUED" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }] },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const count = { SENT: 0, RECORDED: 0, FAILED: 0 };
  for (const { id } of waiting) count[await sendEmail(id, jobRunId)]++;
  return { sent: count.SENT, recorded: count.RECORDED, failed: count.FAILED };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** L&D send themselves an email to see that the server can send one. Follows test mode like any other. */
export async function sendTestEmail(user: SessionUser): Promise<{ status: SendResult; sentTo: string; error: string | null }> {
  ensureManager(user);
  const [testMode, me] = await Promise.all([mailTestMode(), db.staff.findUnique({ where: { id: user.id }, select: { email: true } })]);
  const intended = me?.email?.trim() || (testMode.enabled ? testMode.address : "");
  if (!isEmail(intended)) throw new UserError("Your staff record has no email address, and test mode is off, so there is nowhere to send it. Add your email on your staff record first.");
  const id = await queueEmail({
    kind: "test",
    staffId: user.id,
    intendedTo: intended,
    subject: "LDMS test email",
    body: `<p>This is a test email from LDMS, sent by ${escapeHtml(user.name)}.</p><p>If you can read it, this server can send email.</p><p>--This is an auto-generated email, no reply is needed--</p>`,
    dedupeKey: `test:${user.id}:${Date.now()}`,
  });
  if (!id) throw new UserError("That test email was already sent. Try again.");
  const status = await sendEmail(id);
  const row = await db.emailMessage.findUnique({ where: { id }, select: { sentTo: true, error: true } });
  return { status, sentTo: row?.sentTo ?? "", error: row?.error ?? null };
}

export const EMAIL_LIST_SIZE = 50;

/** The latest emails, for L&D: who each was meant for, where it went and how it ended. Bodies aren't shown. */
export async function recentEmails(user: SessionUser) {
  ensureManager(user);
  const [rows, counts] = await Promise.all([
    db.emailMessage.findMany({
      orderBy: { id: "desc" },
      take: EMAIL_LIST_SIZE,
      select: { id: true, kind: true, intendedTo: true, sentTo: true, subject: true, status: true, attempts: true, error: true, createdAt: true, sentAt: true, staff: { select: { name: true, staffNo: true } } },
    }),
    db.emailMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: "QUEUED" | "SENT" | "FAILED" | "RECORDED") => counts.find((c) => c.status === s)?._count._all ?? 0;
  return { rows, total: count("QUEUED") + count("SENT") + count("FAILED") + count("RECORDED"), failed: count("FAILED"), queued: count("QUEUED") };
}
