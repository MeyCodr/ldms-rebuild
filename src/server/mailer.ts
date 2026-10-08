import "server-only";
import nodemailer from "nodemailer";
import { mailTransport, sendingBlock, type MailTransport } from "./rules/mail";

// The one place that talks to a mail server. Everything else queues an
// EmailMessage and asks services/mail.ts to send it, which decides where it
// really goes (test mode) and records what happened.
//
// Set up in .env: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD and
// MAIL_FROM. The password is never in code or in the database. Whether
// anything is sent at all is L&D's Sending switch (see rules/mail.ts).

export type MailSetup = { transport: MailTransport; host: string | null; from: string | null };

export function mailSetup(sending: boolean): MailSetup {
  return {
    transport: mailTransport(sending, process.env.SMTP_HOST),
    host: process.env.SMTP_HOST ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || "587"}` : null,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || null,
  };
}

/** Why Sending can't be switched on here, or null. */
export const mailSendingBlock = () => sendingBlock(process.env.SMTP_HOST, process.env.MAIL_FROM || process.env.SMTP_USER);

/** A failure whose message is safe to keep on the email's record and show L&D. */
export class MailError extends Error {}

let smtp: nodemailer.Transporter | null = null;

function smtpTransport() {
  if (smtp) return smtp;
  const port = Number(process.env.SMTP_PORT || "587");
  smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 587 starts plain and upgrades with STARTTLS
    requireTLS: port !== 465 && port !== 25,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return smtp;
}

/** Sends one email, or only records it while Sending is off. Throws a MailError saying why it couldn't be sent. */
export async function deliver(message: { to: string; subject: string; html: string }, sending: boolean): Promise<"SENT" | "RECORDED"> {
  const setup = mailSetup(sending);
  if (setup.transport === "record") return "RECORDED";
  if (setup.transport === "off") throw new MailError("No mail server is set up on this server (SMTP_HOST in .env).");
  if (!setup.from) throw new MailError("No sender address is set up on this server (MAIL_FROM in .env).");
  try {
    // MAIL_FROM may be a bare address or "Name <address>".
    const from = setup.from.includes("<") ? setup.from : { name: "LDMS", address: setup.from };
    await smtpTransport().sendMail({ from, to: message.to, subject: message.subject, html: message.html });
    return "SENT";
  } catch (e) {
    throw new MailError(e instanceof Error ? e.message : "The mail server refused the email.");
  }
}
