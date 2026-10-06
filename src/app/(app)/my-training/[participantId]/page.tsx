import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Hourglass, Lock, MapPin, Pencil, UserRound } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CertificatePanel } from "@/components/CertificatePanel";
import { AnswerList, Fact, Row } from "@/components/RecordParts";
import { Panel } from "@/components/Panel";
import { Status } from "@/components/ui/Status";
import { CURRENT_FORM, formVersion, type Answers } from "@/lib/forms/feedback";
import { formatDate, formatDateRange, formatDateTime, formatHours, formatTime, nowInMalaysia, plural } from "@/lib/format";
import { OJT_METHOD_LABELS, OJT_TRAINER_LABELS, ojtTrainerOf, TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { ojtDeleteBlock, ojtDetailsBlock } from "@/server/rules/myTraining";
import { dayNumber } from "@/server/rules/training";
import { certificateInfo } from "@/server/services/certificate";
import { myParticipant, type MyTrainingRow } from "@/server/services/myTraining";
import { requireUser } from "@/server/session";
import { AnswersForm } from "../AnswersForm";
import { DeleteOjtDialog } from "../DeleteOjtDialog";
import { myStatus, ojtRecordedBy } from "../labels";

export const metadata: Metadata = { title: "My training" };

const SAVED: Record<string, string> = {
  submitted: "Thank you. Your answers have been sent and this training is now completed.",
  updated: "Your answers have been updated.",
  recorded: "OJT recorded. Its hours now count toward your total.",
  changed: "Changes saved.",
};

const none = (text = "Not recorded") => <span className="text-ink-3">{text}</span>;

export default async function MyTrainingItemPage({ params, searchParams }: PageProps<"/my-training/[participantId]">) {
  const user = await requireUser();
  const id = Number((await params).participantId);
  if (!Number.isInteger(id)) notFound();
  const today = nowInMalaysia();
  // Only the person's own records: anyone else's id is simply not found.
  const r = await myParticipant(user, id, today);
  if (!r) notFound();
  const certificate = await certificateInfo(user, r.training.id, today);

  const { saved } = await searchParams;
  const t = r.training;
  const s = myStatus(r);
  const days = dayNumber(t.endDate)! - dayNumber(t.startDate)! + 1;
  const recordedBy = ojtRecordedBy(r);
  const ownOjt = r.kind === "OJT" && r.source === "SELF";
  const detailsBlock = r.kind === "OJT" ? ojtDetailsBlock(r, r.others) : null;
  const ojtTrainer = r.kind === "OJT" ? ojtTrainerOf(t.program) : null;
  // A completed OJT is changed in one place: the whole form for their own, the answers only otherwise.
  const editable = r.kind === "OJT" && r.access.mode === "update";
  const editLabel = detailsBlock ? "Edit answers" : "Edit";

  return (
    <div>
      <PageHeader
        module="learning"
        context={{ href: "/my-training", label: "My training" }}
        title={t.title}
        meta={
          <>
            {/* An OJT shows how it was given (OJT, coaching or mentoring) when that was recorded. */}
            <span className="tag">{t.type === "OJT" && t.ojtMethod ? OJT_METHOD_LABELS[t.ojtMethod] : TRAINING_TYPE_LABELS[t.type]}</span>
            <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
            <Status tone={s.tone}>{s.label}</Status>
          </>
        }
        actions={
          (editable || ownOjt) && (
            <>
              {editable && (
                <Link href={`/my-training/${r.id}/edit`} className="btn">
                  <Pencil size={14} aria-hidden /> {editLabel}
                </Link>
              )}
              {ownOjt && <DeleteOjtDialog participantId={r.id} title={t.title} blocked={ojtDeleteBlock(r, r.others)} />}
            </>
          )
        }
      />

      {typeof saved === "string" && SAVED[saved] && (
        <div role="status" className="notice notice-ok mb-5">
          {SAVED[saved]}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <section aria-label="At a glance" className="card p-5 sm:p-6">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={CalendarDays} label="Dates">
              <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
              {days > 1 && <span className="text-ink-3"> · {plural(days, "day")}</span>}
            </Fact>
            <Fact icon={Clock} label={t.sessions.length ? "Sessions" : "Time"}>
              {t.sessions.length ? (
                plural(t.sessions.length, "session")
              ) : (
                <span className="num">
                  {formatTime(t.startTime)}–{formatTime(t.endTime)}
                </span>
              )}
              <span className="num text-ink-3"> · {formatHours(r.hours)}</span>
            </Fact>
            <Fact icon={MapPin} label="Venue">
              {t.venue ?? none()}
            </Fact>
            <Fact icon={UserRound} label="Trainer">
              {/* A named trainer when there is one; for OJT otherwise whether they were external or internal. */}
              {t.trainerName ?? (ojtTrainer ? `${OJT_TRAINER_LABELS[ojtTrainer]} trainer` : none())}
            </Fact>
          </dl>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-12">
          <Panel className="lg:col-span-8" title={r.kind === "OJT" ? "Your OJT answers" : "Feedback"} description={formIntro(r, editLabel)}>
            <FormBody r={r} editLabel={editLabel} />
          </Panel>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
            <Panel title="Your record">
              <dl className="-my-1 flex flex-col text-[13.5px]">
                <Row label="Attendance">
                  <Status tone={s.tone}>{s.label}</Status>
                  {r.attendanceReason && <div className="mt-0.5 text-xs text-ink-3">{r.attendanceReason}</div>}
                </Row>
                <Row label="Hours">
                  {r.counts ? (
                    <span className="num font-medium">{formatHours(r.hours)}</span>
                  ) : (
                    <span className="text-ink-3">
                      {t.status === "CANCELLED" ? "None: cancelled" : r.attendance === "ABSENT" ? "None: absent" : "Count once completed"}
                    </span>
                  )}
                </Row>
                {r.submittedAt && (
                  <Row label={r.kind === "OJT" ? "Answers given" : "Feedback sent"}>
                    <span className="num">{formatDateTime(r.submittedAt)}</span>
                  </Row>
                )}
                {recordedBy && <Row label="Recorded by">{recordedBy[0].toUpperCase() + recordedBy.slice(1)}</Row>}
              </dl>
              {detailsBlock && r.kind === "OJT" && <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{detailsBlock}</p>}
            </Panel>
            {certificate && (
              <CertificatePanel
                info={certificate}
                emptyText={
                  t.status === "CANCELLED"
                    ? "None: this training was cancelled."
                    : "No certificate yet. The L&D unit uploads it when the trainer or provider sends it."
                }
                lockedText={
                  r.attendance === "ABSENT"
                    ? "The certificate is for those who completed the training."
                    : "You can download it once you've completed the training."
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One line under the form's title saying what it's for, or what happened. */
function formIntro(r: MyTrainingRow, editLabel: string): string {
  switch (r.access.mode) {
    case "submit":
      return r.kind === "OJT"
        ? "What you learned, and your knowledge before and after. Sending them completes the OJT."
        : "How did it go? Your answers help the L&D unit plan better training. Sending them completes the training.";
    case "update":
      return `What you told us. Use ${editLabel} to change ${editLabel === "Edit" ? "the OJT or your answers" : "them"}.`;
    case "view":
      return "What you told us. Feedback can't be changed once it's sent.";
    case "closed":
      return "";
  }
}

function FormBody({ r, editLabel }: { r: MyTrainingRow; editLabel: string }) {
  const access = r.access;
  if (access.mode === "closed")
    return (
      <div className="flex items-start gap-3 rounded-lg bg-sunken px-4 py-3.5 text-[13.5px] text-ink-2">
        {r.attendance === "PENDING" ? (
          <Hourglass size={17} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
        ) : (
          <Lock size={17} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
        )}
        <p>{access.reason}</p>
      </div>
    );

  const answers = (r.feedback ?? null) as Answers | null;
  // Given: shown here; a completed OJT's are changed with the Edit button above.
  if (access.mode === "view" || access.mode === "update") {
    const form = formVersion(r.kind, r.feedbackVersion);
    if (answers && form) return <AnswerList form={form} answers={answers} />;
    if (access.mode === "update")
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-4 py-3.5 text-[13.5px] text-ink-2">
          <p>You haven&apos;t given your answers for this OJT yet.</p>
          <Link href={`/my-training/${r.id}/edit`} className="btn btn-primary btn-sm">
            {editLabel === "Edit" ? "Edit" : "Give your answers"}
          </Link>
        </div>
      );
    return (
      <p className="text-[13.5px] text-ink-2">
        Your feedback was sent on <span className="num">{r.submittedAt ? formatDate(r.submittedAt) : "an earlier date"}</span>. The answers themselves
        aren&apos;t on record.
      </p>
    );
  }

  // Waiting for the person: sending the form completes the training.
  return <AnswersForm participantId={r.id} form={CURRENT_FORM[r.kind]} initial={answers} submitLabel={r.kind === "OJT" ? "Send answers" : "Send feedback"} />;
}
