import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, ExternalLink, MapPin, Pencil, UserRound } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { AnswerList, Fact, Row } from "@/components/RecordParts";
import { Status } from "@/components/ui/Status";
import { formVersion, type Answers } from "@/lib/forms/feedback";
import { formatDate, formatDateRange, formatDateTime, formatHours, formatTime, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { OJT_METHOD_LABELS, OJT_TRAINER_LABELS, ojtTrainerOf } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { SHORT_OJT_HOURS } from "@/server/rules/ojt";
import { dayNumber } from "@/server/rules/training";
import { getOjtRecord, ojtRecordChangeBlock } from "@/server/services/ojt";
import { requirePermission } from "@/server/session";
import { ojtStatus, SOURCE_LABELS } from "../filters";
import { DeleteOjtEntryDialog } from "./DeleteOjtEntryDialog";

export const metadata: Metadata = { title: "OJT record" };

const none = (text = "Not recorded") => <span className="text-ink-3">{text}</span>;

/** One person's OJT, opened from the OJT list. */
export default async function OjtRecordPage({ params, searchParams }: PageProps<"/ojt/[participantId]">) {
  const user = await requirePermission("ojt.manage");
  const id = Number((await params).participantId);
  if (!Number.isInteger(id)) notFound();
  const [r, blocked, sp] = await Promise.all([getOjtRecord(user, id), ojtRecordChangeBlock(user, id), searchParams]);
  if (!r) notFound();

  const t = r.training;
  const s = ojtStatus(r);
  const days = dayNumber(t.endDate)! - dayNumber(t.startDate)! + 1;
  const trainer = ojtTrainerOf(t.program);
  const form = formVersion("OJT", r.feedbackVersion);
  const answers = (r.feedback ?? null) as Answers | null;

  return (
    <div>
      <PageHeader
        module="ojt"
        context={{ href: "/ojt", label: "OJT" }}
        title={t.title}
        meta={
          <>
            <span className="num" title="Training code">
              {t.trainingCode}
            </span>
            <span className="tag">{t.ojtMethod ? OJT_METHOD_LABELS[t.ojtMethod] : "OJT"}</span>
            <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
            <Status tone={s.tone}>{s.label}</Status>
          </>
        }
        actions={
          <>
            {can(user, "training.view") && (
              <Link href={`/trainings/${t.id}`} className="btn">
                <ExternalLink size={14} aria-hidden /> Open training
              </Link>
            )}
            {!blocked && (
              <>
                <Link href={`/ojt/${r.id}/edit`} className="btn">
                  <Pencil size={14} aria-hidden /> Edit
                </Link>
                <DeleteOjtEntryDialog participantId={r.id} title={t.title} people={r.others.length} />
              </>
            )}
          </>
        }
      />

      {sp.saved === "1" && (
        <div role="status" className="notice notice-ok mb-3">
          OJT updated.
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
              {t.trainerName ?? none()}
              {trainer && <span className="text-ink-3"> · {OJT_TRAINER_LABELS[trainer]}</span>}
            </Fact>
          </dl>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-12">
          <Panel className="lg:col-span-8" title="OJT answers" description="What the staff member learned, and their knowledge before and after.">
            {answers && form ? (
              <AnswerList form={form} answers={answers} />
            ) : (
              <p className="rounded-lg bg-sunken px-4 py-3.5 text-[13.5px] text-ink-2">
                {r.attendance === "COMPLETED"
                  ? r.hours <= SHORT_OJT_HOURS
                    ? `None needed: an OJT of ${SHORT_OJT_HOURS} hours or less is completed without answers.`
                    : "None on record: it was completed without answers."
                  : `Not given yet. ${r.staff.name} gives them on My training, which completes the OJT.`}
              </p>
            )}
          </Panel>

          <Panel className="lg:col-span-4" title="Record">
            <dl className="-my-1 flex flex-col text-[13.5px]">
              <Row label="Staff">
                {can(user, "staff.view") ? (
                  <Link href={`/staff/${r.staff.id}`} className="link font-medium">
                    {r.staff.name}
                  </Link>
                ) : (
                  <span className="font-medium">{r.staff.name}</span>
                )}
                <div className="num text-xs text-ink-3">
                  {r.staff.staffNo} · {DESIGNATION_LABELS[r.staff.designation]}
                </div>
              </Row>
              <Row label="Department">
                {r.staff.department.name}
                {r.staff.section && <div className="text-xs text-ink-3">{r.staff.section.name}</div>}
              </Row>
              <Row label="Status">
                <Status tone={s.tone}>{s.label}</Status>
                {r.attendanceReason && <div className="mt-0.5 text-xs text-ink-3">{r.attendanceReason}</div>}
              </Row>
              <Row label="Hours">{r.counts ? <span className="num font-medium">{formatHours(r.hours)}</span> : none("Count once completed")}</Row>
              <Row label="Recorded by">
                {SOURCE_LABELS[r.source]}
                {r.recorder && (
                  <div className="text-xs text-ink-3">
                    {r.recorder.name} ({r.recorder.staffNo})
                  </div>
                )}
              </Row>
              <Row label="Recorded on">
                <span className="num">{formatDateTime(r.createdAt)}</span>
              </Row>
              {r.submittedAt && (
                <Row label="Answers given">
                  <span className="num">{formatDate(r.submittedAt)}</span>
                </Row>
              )}
              {blocked && (
                <Row label="Changes">
                  <span className="text-ink-2">{blocked}</span>
                </Row>
              )}
            </dl>
          </Panel>
        </div>

        {r.others.length > 1 && (
          <Panel title="On this OJT" description={`${plural(r.others.length, "staff member")} you look after`} flush>
            <ul>
              {r.others.map((o) => {
                const os = ojtStatus({ attendance: o.attendance, training: t });
                const current = o.id === r.id;
                return (
                  <li key={o.id} className="border-b border-rule last:border-b-0">
                    <Link
                      href={`/ojt/${o.id}`}
                      aria-current={current ? "page" : undefined}
                      className={`flex items-center gap-3 px-5 py-2.5 text-[13.5px] hover:bg-sunken ${current ? "bg-accent-soft" : ""}`}
                    >
                      <span className="num w-24 shrink-0 text-ink-3">{o.staff.staffNo}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{o.staff.name}</span>
                      <Status tone={os.tone}>{os.label}</Status>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
