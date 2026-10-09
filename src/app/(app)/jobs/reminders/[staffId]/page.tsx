import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Row } from "@/components/RecordParts";
import { nowInMalaysia, plural } from "@/lib/format";
import { MAIL_MODE_LABELS } from "@/server/rules/mail";
import { mailStatus } from "@/server/services/mail";
import { reminderPreview } from "@/server/services/reminder";
import { requirePermission } from "@/server/session";
import { ReminderCopyDialog } from "../../JobActions";

export const metadata: Metadata = { title: "Reminder email" };

// The preview's frame is a document of its own, so the app's scrollbar
// (globals.css) doesn't reach it. The same rules are added to the previewed
// copy only: the email that is sent carries no such styles.
const SCROLLBAR = `<style>
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:999px;background-color:#b9c3cd;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background-color:#6b7787}
::-webkit-scrollbar-button{display:none}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:#b9c3cd transparent}}
</style>`;
const forPreview = (html: string) => html.replace("</head>", `${SCROLLBAR}</head>`);

/** For L&D: the reminder email one person would get today, as it would arrive. */
export default async function ReminderPreviewPage({ params }: PageProps<"/jobs/reminders/[staffId]">) {
  const user = await requirePermission("jobs.manage");
  const staffId = Number((await params).staffId);
  if (!Number.isInteger(staffId)) notFound();
  const [preview, mail] = await Promise.all([reminderPreview(user, staffId, nowInMalaysia()), mailStatus(user)]);
  if (!preview) notFound();
  const { person, email } = preview;

  return (
    <div>
      <PageHeader
        module="jobs"
        context={{ href: "/jobs/reminders", label: "Who is reminded today" }}
        title={person.name}
        meta={
          <>
            <span className="num">{person.staffNo}</span>
            <span>{person.department}</span>
            <span>{plural(person.items.length, "thing")} waiting</span>
          </>
        }
        actions={<ReminderCopyDialog staffId={person.id} name={person.name} goesTo={mail.testMode.enabled ? mail.testMode.address || null : mail.myEmail} sending={mail.sending} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-4" title="The email" description="What the daily job would write for this person today">
          <dl className="-my-1 flex flex-col text-[13.5px]">
            <Row label="To">{person.email ? <span className="break-all">{person.email}</span> : <span className="muted">No email address on the staff record, so no email is sent.</span>}</Row>
            <Row label="Subject">{email.subject}</Row>
            <Row label="Email mode">
              {MAIL_MODE_LABELS[mail.mode]}
              <div className="mt-0.5 text-[12.5px] text-ink-2">
                {mail.mode === "OFF"
                  ? "It would only be recorded, not sent."
                  : mail.mode === "TEST"
                    ? `It would be sent to ${mail.testMode.address}, with this person named in the subject.`
                    : "It would be sent to this person."}
              </div>
            </Row>
          </dl>
        </Panel>
        <Panel className="lg:col-span-8" title="As it arrives" flush>
          {/* The email's own HTML, shut in a frame that can run nothing and follow no link. */}
          <iframe title={`Reminder email for ${person.name}`} sandbox="" srcDoc={forPreview(email.html)} className="block h-[760px] w-full rounded-b-xl bg-sunken" />
        </Panel>
      </div>
    </div>
  );
}
