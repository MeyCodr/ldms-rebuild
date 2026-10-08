// Email and the daily job: where an email really goes, how long records are
// kept, and when a run may start. Pure: no database, no clock of its own.
//
// Test mode is on until L&D switch it off. While it is on, every email goes
// to one test address with the real recipient named in the subject, as the
// old system's reminder scripts did. It is kept in the mail.testMode setting.

export type TestMode = { enabled: boolean; address: string };

export const MAX_EMAIL = 160;

/** A plain check that it looks like an address; the mail server has the last word. */
export function isEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The setting as stored, read safely. Anything unreadable counts as test mode on with no address, so nothing reaches staff by accident. */
export function parseTestMode(value: unknown): TestMode {
  if (!value || typeof value !== "object") return { enabled: true, address: "" };
  const v = value as { enabled?: unknown; address?: unknown };
  return { enabled: v.enabled !== false, address: typeof v.address === "string" ? v.address.trim() : "" };
}

/** Why test mode can't be saved like this, or null. */
export function testModeBlock(next: TestMode): string | null {
  if (!next.enabled) return null;
  if (!next.address) return "Enter the address test emails go to.";
  if (!isEmail(next.address)) return "That doesn't look like an email address.";
  return null;
}

/** Where an email goes and under what subject. Null: test mode is on with no usable test address, so it can't be sent. */
export function mailRoute(intendedTo: string, subject: string, testMode: TestMode): { sentTo: string; subject: string } | null {
  if (!testMode.enabled) return { sentTo: intendedTo, subject };
  if (!isEmail(testMode.address)) return null;
  return { sentTo: testMode.address, subject: `[TEST - intended for ${intendedTo}] ${subject}`.slice(0, 200) };
}

/**
 * L&D's Sending switch (the mail.sending setting). Off, emails are written
 * down and marked "recorded only" but none is sent: for a development copy,
 * and for a server whose emails L&D want to read before any goes out. It
 * starts off, and anything unreadable counts as off.
 */
export function parseSending(value: unknown): boolean {
  return value === true;
}

export type MailTransport = "smtp" | "record" | "off";

/**
 * What happens to an email on this server:
 * - record: Sending is switched off
 * - smtp: sent through the mail server in .env (SMTP_HOST)
 * - off: Sending is on but no mail server is set up, so it fails and says why
 */
export function mailTransport(sending: boolean, smtpHost: string | undefined): MailTransport {
  if (!sending) return "record";
  return smtpHost ? "smtp" : "off";
}

/** Why Sending can't be switched on here, or null. */
export function sendingBlock(smtpHost: string | undefined, from: string | undefined): string | null {
  if (!smtpHost) return "No mail server is set up on this server yet. It needs SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM in the server's .env file.";
  if (!from) return "No sender address is set up on this server yet. It needs MAIL_FROM (or SMTP_USER) in the server's .env file.";
  return null;
}

/**
 * The one choice L&D make on the screen, which sets both switches:
 * - OFF: Sending off. Nothing is sent; emails are only recorded.
 * - TEST: Sending on, test mode on. Really sent, all to the test address.
 * - LIVE: Sending on, test mode off. Really sent to staff.
 */
export type MailMode = "OFF" | "TEST" | "LIVE";

export const MAIL_MODES: MailMode[] = ["OFF", "TEST", "LIVE"];
export const MAIL_MODE_LABELS: Record<MailMode, string> = { OFF: "Off", TEST: "Test", LIVE: "Live" };

export function mailMode(sending: boolean, testMode: TestMode): MailMode {
  if (!sending) return "OFF";
  return testMode.enabled ? "TEST" : "LIVE";
}

/**
 * Why email can't be put in this mode, or null. `serverBlock` is why this
 * server can't send at all (sendingBlock), which only matters for the modes
 * that send. A problem with the address is marked as the address field's.
 */
export function mailModeBlock(mode: MailMode, address: string, serverBlock: string | null): { message: string; field?: "address" } | null {
  if (mode === "OFF") return null;
  if (serverBlock) return { message: serverBlock };
  if (mode === "LIVE") return null;
  const problem = testModeBlock({ enabled: true, address });
  return problem ? { message: problem, field: "address" } : null;
}

/** Emails, notifications and job runs older than this are removed by the daily job. */
export const RETENTION_DAYS = 90;

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
}

/** A failed email is tried again by the next runs, this many times in all. */
export const MAX_ATTEMPTS = 3;

/** A run that has shown no sign of finishing for this long is taken to have died. */
export const JOB_STALE_MINUTES = 30;

export function jobIsStale(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > JOB_STALE_MINUTES * 60_000;
}

/** YYYY-MM-DD of a date already shifted to Malaysia time (nowInMalaysia): the day an email belongs to. */
export function dayKey(today: Date): string {
  return today.toISOString().slice(0, 10);
}

export type JobSummary = { emailsSent: number; emailsRecorded: number; emailsFailed: number; removedEmails: number; removedNotifications: number; removedRuns: number };

/** One line saying what a run did. */
export function jobSummaryText(s: JobSummary): string {
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const parts = s.emailsRecorded && !s.emailsSent ? [] : [`${n(s.emailsSent, "email")} sent`];
  if (s.emailsRecorded) parts.push(`${n(s.emailsRecorded, "email")} recorded only (sending is off)`);
  if (s.emailsFailed) parts.push(`${s.emailsFailed} failed`);
  const removed = s.removedEmails + s.removedNotifications + s.removedRuns;
  if (removed) parts.push(`${n(removed, "old record")} removed`);
  return parts.join(", ");
}

export function parseJobSummary(value: unknown): JobSummary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : 0);
  return { emailsSent: num("emailsSent"), emailsRecorded: num("emailsRecorded"), emailsFailed: num("emailsFailed"), removedEmails: num("removedEmails"), removedNotifications: num("removedNotifications"), removedRuns: num("removedRuns") };
}
