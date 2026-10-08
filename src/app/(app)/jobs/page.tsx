import type { Metadata } from "next";
import { CalendarClock, Inbox } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Row } from "@/components/RecordParts";
import { EmptyState } from "@/components/ui/EmptyState";
import { Status } from "@/components/ui/Status";
import { formatDateTime, plural } from "@/lib/format";
import { isEmail, jobSummaryText, MAIL_MODE_LABELS, parseJobSummary, RETENTION_DAYS } from "@/server/rules/mail";
import { JOB_LIST_SIZE, jobRuns } from "@/server/services/job";
import { EMAIL_LIST_SIZE, mailStatus, recentEmails } from "@/server/services/mail";
import { requirePermission } from "@/server/session";
import { MailModeDialog, RunJobDialog, TestEmailDialog } from "./JobActions";

export const metadata: Metadata = { title: "Jobs and email" };

const JOB_STATUS = { OK: { tone: "ok", label: "Finished" }, FAILED: { tone: "bad", label: "Failed" }, RUNNING: { tone: "wait", label: "Running" } } as const;
const EMAIL_STATUS = { SENT: { tone: "ok", label: "Sent" }, FAILED: { tone: "bad", label: "Not sent" }, QUEUED: { tone: "wait", label: "Waiting" }, RECORDED: { tone: "na", label: "Recorded only" } } as const;
const MODE = { OFF: { tone: "na", header: "Email off" }, TEST: { tone: "wait", header: "Email in test mode" }, LIVE: { tone: "ok", header: "Email live" } } as const;
const EMAIL_KIND: Record<string, string> = { test: "Test", digest: "Reminder" };

const took = (from: Date, to: Date | null) => {
  if (!to) return "";
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};

/**
 * L&D's screen for what LDMS does by itself: the email mode (off, test or
 * live), each run of the daily job, and every email with where it went.
 */
export default async function JobsPage() {
  const user = await requirePermission("jobs.manage");
  const [mail, runs, emails] = await Promise.all([mailStatus(user), jobRuns(user), recentEmails(user)]);
  const { setup, testMode, sending, mode } = mail;
  const last = runs[0];

  // Where a test email would go, or why it can't be sent.
  const goesTo = testMode.enabled ? testMode.address : mail.myEmail;
  const testBlock =
    sending && mail.sendingBlock
      ? mail.sendingBlock
      : !goesTo || !isEmail(goesTo)
        ? testMode.enabled
          ? "There is no test address. Change the email mode to Test and enter one first."
          : "Your staff record has no email address, so there is nowhere to send it."
        : null;

  return (
    <div>
      <PageHeader
        module="jobs"
        context="Administration"
        title="Jobs and email"
        meta={
          <>
            <Status tone={MODE[mode].tone}>{MODE[mode].header}</Status>
            {last ? <span>Last run {formatDateTime(last.startedAt)}</span> : <span>The daily job hasn&apos;t run yet</span>}
          </>
        }
        actions={<RunJobDialog />}
      />

      {mode === "OFF" && <div className="notice notice-wait mb-4">Email is off: emails are recorded below, but none is really sent. Change the email mode when you are ready.</div>}
      {sending && mail.sendingBlock && <div className="notice notice-bad mb-4">Email is on, but every email fails: {mail.sendingBlock}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-5" title="Email" description="Whether LDMS sends email, and to whom">
          <dl className="-my-1 flex flex-col text-[13.5px]">
            <Row label="Email is">
              <Status tone={MODE[mode].tone}>{MAIL_MODE_LABELS[mode]}</Status>
              <div className="mt-0.5 text-[12.5px] text-ink-2">
                {mode === "OFF" ? (
                  "Emails are only recorded; none is sent."
                ) : mode === "TEST" ? (
                  <>
                    Every email is sent to <span className="font-medium break-all text-ink">{testMode.address}</span>, not to staff.
                  </>
                ) : (
                  "Emails are sent to staff, at the address on their staff record."
                )}
              </div>
            </Row>
            <Row label="Sent through">{setup.host ? <span className="break-all">{setup.host}</span> : <span className="text-bad">Not set up</span>}</Row>
            <Row label="From">{setup.from ? <span className="break-all">{setup.from}</span> : <span className="muted">Not set</span>}</Row>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <MailModeDialog mode={mode} address={testMode.address} serverBlock={mail.sendingBlock} />
            <TestEmailDialog goesTo={goesTo} block={testBlock} sending={sending} />
          </div>
        </Panel>

        <Panel
          className="lg:col-span-7"
          title="Daily job"
          description={`Runs by itself each morning; the last ${JOB_LIST_SIZE} runs. Records older than ${RETENTION_DAYS} days are removed.`}
          flush
        >
          {runs.length === 0 ? (
            <EmptyState compact icon={CalendarClock} title="No runs yet">
              The server&apos;s scheduler starts it each morning. Use Run now to start one yourself.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[560px]" aria-label="Daily job runs">
                <thead>
                  <tr>
                    <th className="w-px text-right whitespace-nowrap">No.</th>
                    <th className="w-px whitespace-nowrap">Started</th>
                    <th className="hidden sm:table-cell">Started by</th>
                    <th className="w-px whitespace-nowrap">Result</th>
                    <th>What it did</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => {
                    const summary = parseJobSummary(r.summary);
                    return (
                      <tr key={r.id}>
                        <td className="num muted text-right">{i + 1}</td>
                        <td className="num whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                        <td className="hidden sm:table-cell">{r.startedBy?.name ?? <span className="muted">The server</span>}</td>
                        <td className="whitespace-nowrap">
                          <Status tone={JOB_STATUS[r.status].tone}>{JOB_STATUS[r.status].label}</Status>
                        </td>
                        <td>
                          {r.status === "FAILED" ? <span className="text-bad">{r.error ?? "No reason recorded."}</span> : summary ? jobSummaryText(summary) : <span className="muted">–</span>}
                          {r.finishedAt && <span className="muted"> · {took(r.startedAt, r.finishedAt)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          className="lg:col-span-12"
          title="Emails"
          description={
            emails.total === 0
              ? "Every email LDMS sends is listed here"
              : `${plural(emails.total, "email")} in the last ${RETENTION_DAYS} days${emails.failed ? `, ${emails.failed} not sent` : ""}${emails.queued ? `, ${emails.queued} waiting` : ""}${emails.total > EMAIL_LIST_SIZE ? `; the latest ${EMAIL_LIST_SIZE}` : ""}`
          }
          flush
        >
          {emails.rows.length === 0 ? (
            <EmptyState compact icon={Inbox} title="No emails yet">
              Send a test email to see that this server can send one.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[820px]" aria-label="Emails">
                <thead>
                  <tr>
                    <th className="w-px text-right whitespace-nowrap">No.</th>
                    <th className="w-px whitespace-nowrap">When</th>
                    <th className="w-px whitespace-nowrap">Kind</th>
                    <th>Meant for</th>
                    <th>Sent to</th>
                    <th className="hidden xl:table-cell">Subject</th>
                    <th className="w-px whitespace-nowrap">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.rows.map((e, i) => (
                    <tr key={e.id}>
                      <td className="num muted text-right">{i + 1}</td>
                      <td className="num whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                      <td className="whitespace-nowrap">{EMAIL_KIND[e.kind] ?? e.kind}</td>
                      <td>
                        {e.staff ? (
                          <>
                            <span className="font-medium text-ink">{e.staff.name}</span>
                            <div className="muted text-xs break-all">{e.intendedTo}</div>
                          </>
                        ) : (
                          <span className="break-all">{e.intendedTo}</span>
                        )}
                      </td>
                      <td>
                        {e.sentTo ? <span className="break-all">{e.sentTo}</span> : <span className="muted">–</span>}
                        {e.sentTo && e.sentTo !== e.intendedTo && <div className="muted text-xs">test address</div>}
                      </td>
                      <td className="hidden xl:table-cell">{e.subject}</td>
                      <td>
                        <Status tone={EMAIL_STATUS[e.status].tone}>{EMAIL_STATUS[e.status].label}</Status>
                        {e.status === "FAILED" && e.error && <div className="mt-0.5 max-w-[320px] text-xs text-bad">{e.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
