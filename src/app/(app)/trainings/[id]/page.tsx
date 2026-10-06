import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Check, Clock, MapPin, MonitorSmartphone, Pencil, Presentation, UserRound } from "lucide-react";
import { CertificatePanel } from "@/components/CertificatePanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Sheet, SheetItem } from "@/components/Sheet";
import { Progress } from "@/components/ui/Progress";
import { Status } from "@/components/ui/Status";
import { formatDate, formatDateRange, formatDateTime, formatHours, formatMoney, formatTime, nowInMalaysia, plural } from "@/lib/format";
import { OJT_METHOD_LABELS, TRAINING_FUNCTION_LABELS, TRAINING_PLATFORM_LABELS, TRAINING_PROGRAM_LABELS, TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { dailyMinutes, dayNumber, trainingDeleteBlock, trainingHours, trainingPhase } from "@/server/rules/training";
import { certificateInfo } from "@/server/services/certificate";
import { listParticipants } from "@/server/services/participant";
import { getTraining, trainingHistory } from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { TRAINING_HISTORY_FIELDS } from "../historyFields";
import { PhaseStatus } from "../PhaseStatus";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { CancelTrainingDialog, DeleteTrainingDialog, RestoreTrainingDialog } from "./TrainingActions";

export const metadata: Metadata = { title: "Training" };

const SAVED: Record<string, string> = { created: "Training added.", updated: "Changes saved." };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;
/** Longer trainings show their date range rather than a line per day. */
const MAX_DAYS_LISTED = 14;

const none = (text = "Not recorded") => <span className="text-ink-3">{text}</span>;

export default async function TrainingPage({ params, searchParams }: PageProps<"/trainings/[id]">) {
  const user = await requirePermission("training.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await getTraining(user, id);
  if (!t) notFound();

  const { saved } = await searchParams;
  const manage = can(user, "training.manage");
  const today = nowInMalaysia();
  const [history, participants, certificate] = await Promise.all([
    manage || can(user, "audit.view") ? trainingHistory(id) : [],
    listParticipants(user, id),
    certificateInfo(user, id, today),
  ]);
  const todayNo = Math.floor(today.getTime() / DAY_MS);
  const cancelled = t.status === "CANCELLED";
  const days = dayNumber(t.endDate)! - dayNumber(t.startDate)! + 1;
  const perDay = dailyMinutes(t.startTime, t.endTime);

  // The schedule as a list of days (or sessions), each marked done, today or to come.
  const schedule = t.sessions.length
    ? t.sessions.map((s) => ({ date: s.date, start: s.startTime, end: s.endTime }))
    : days <= MAX_DAYS_LISTED
      ? Array.from({ length: days }, (_, i) => ({ date: new Date(t.startDate.getTime() + i * DAY_MS), start: t.startTime, end: t.endTime }))
      : [];

  return (
    <div>
      <PageHeader
        module="training"
        context={{ href: "/trainings", label: "Trainings" }}
        title={t.title}
        meta={
          <>
            <span className="num" title="Training code">
              {t.trainingCode}
            </span>
            <span className="tag">{TRAINING_TYPE_LABELS[t.type]}</span>
            <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
            <PhaseStatus phase={trainingPhase(t, today)} />
          </>
        }
        actions={
          manage && (
            <>
              <Link href={`/trainings/${id}/edit`} className="btn">
                <Pencil size={14} aria-hidden /> Edit
              </Link>
              <CancelTrainingDialog id={id} title={t.title} participantCount={t.participantCount} hidden={cancelled} />
              <RestoreTrainingDialog id={id} title={t.title} hidden={!cancelled} />
              {/* Set apart from the everyday actions so it isn't hit by mistake. */}
              <span aria-hidden className="mx-1 hidden h-5 w-px bg-rule sm:block" />
              <DeleteTrainingDialog id={id} title={t.title} blocked={trainingDeleteBlock(t)} />
            </>
          )
        }
      />

      {typeof saved === "string" && SAVED[saved] && (
        <div role="status" className="notice notice-ok mb-5">
          {SAVED[saved]}
        </div>
      )}
      {cancelled && (
        <div className="notice notice-bad mb-5">
          This training was cancelled. It stays on record, but its hours don&apos;t count toward anyone&apos;s total.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* The training at a glance: when, where, who and how, in one strip. */}
        <section aria-label="At a glance" className="card">
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <Fact icon={CalendarDays} label="Dates">
                <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
                <span className="text-ink-3"> · {plural(days, "day")}</span>
              </Fact>
              <Fact icon={Clock} label={t.sessions.length ? "Sessions" : "Daily time"}>
                {t.sessions.length ? (
                  plural(t.sessions.length, "session")
                ) : (
                  <>
                    <span className="num">
                      {formatTime(t.startTime)}–{formatTime(t.endTime)}
                    </span>
                    {perDay !== null && <span className="num text-ink-3"> · {formatHours(Math.round((perDay / 60) * 100) / 100)} a day</span>}
                  </>
                )}
              </Fact>
              <Fact icon={MapPin} label="Venue">
                {t.venue ?? none()}
              </Fact>
              <Fact icon={UserRound} label="Trainer">
                {t.trainerStaff ? (
                  <>
                    {can(user, "staff.view") ? (
                      <Link href={`/staff/${t.trainerStaff.id}`} className="link">
                        {t.trainerStaff.name}
                      </Link>
                    ) : (
                      t.trainerStaff.name
                    )}
                    <span className="text-ink-3">
                      {" "}
                      · internal, <span className="num">{t.trainerStaff.staffNo}</span>
                    </span>
                  </>
                ) : (
                  (t.trainerName ?? none())
                )}
              </Fact>
              <Fact icon={Presentation} label="Program">
                {t.program ? TRAINING_PROGRAM_LABELS[t.program] : none()}
              </Fact>
              <Fact icon={MonitorSmartphone} label="Platform">
                {t.platform ? TRAINING_PLATFORM_LABELS[t.platform] : none()}
              </Fact>
            </dl>
            {t.description && <p className="border-t border-rule pt-4 text-[13.5px] whitespace-pre-line text-ink-2">{t.description}</p>}
          </div>
        </section>

        <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-12">
          <AttendanceCard className="lg:col-span-4" attendance={t.attendance} total={t.participantCount} hours={t.hours} cancelled={cancelled} />
          <div className="min-w-0 lg:col-span-4">
            {/* The rest of the training form's fields, in its order. */}
            <Sheet title="Details">
              <SheetItem label="Type">{TRAINING_TYPE_LABELS[t.type]}</SheetItem>
              {t.type === "OJT" && t.ojtMethod && <SheetItem label="OJT type">{OJT_METHOD_LABELS[t.ojtMethod]}</SheetItem>}
              <SheetItem label="Cost (RM)">{t.cost !== null ? <span className="num">{formatMoney(t.cost)}</span> : none()}</SheetItem>
              <SheetItem label="HRDC">{t.hrdfClaimable ? "Yes" : "No"}</SheetItem>
              <SheetItem label="Function">{t.function ? TRAINING_FUNCTION_LABELS[t.function] : none()}</SheetItem>
            </Sheet>
          </div>
          <div className="flex min-w-0 flex-col gap-3 md:col-span-2 lg:col-span-4">
            <Panel title="Schedule" action={<span className="num font-medium text-ink-2">{formatHours(t.hours)} in total</span>}>
              {schedule.length ? (
                <ol className="relative flex flex-col">
                  {schedule.map((s, i) => {
                    const day = dayNumber(s.date)!;
                    const state = cancelled ? "off" : day < todayNo ? "done" : day === todayNo ? "today" : "next";
                    return (
                      <li key={`${s.date.toISOString()}-${i}`} className="relative flex gap-3.5 pb-4 last:pb-0">
                        {i < schedule.length - 1 && <span aria-hidden className="absolute top-7 bottom-1 left-[11px] w-px bg-rule" />}
                        <span
                          aria-hidden
                          className={`relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            state === "done"
                              ? "bg-accent text-white"
                              : state === "today"
                                ? "bg-accent-soft text-accent-deep ring-2 ring-accent"
                                : "border border-rule-strong bg-surface text-ink-3"
                          }`}
                        >
                          {state === "done" ? <Check size={13} strokeWidth={3} /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="text-[13.5px] font-medium">
                              {t.sessions.length ? `Session ${i + 1}` : `Day ${i + 1}`}
                              {state === "today" && <span className="ml-2 text-xs font-semibold text-accent-deep">Today</span>}
                            </span>
                            <span className="num text-xs text-ink-3">
                              {formatHours(trainingHours({ startDate: s.date, endDate: s.date, startTime: s.start, endTime: s.end }))}
                            </span>
                          </div>
                          <div className="num mt-0.5 text-xs text-ink-3">
                            {WEEKDAYS[s.date.getUTCDay()]}, {formatDate(s.date)} · {formatTime(s.start)}–{formatTime(s.end)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-[13px] text-ink-2">
                  Every day from <span className="num">{formatDate(t.startDate)}</span> to <span className="num">{formatDate(t.endDate)}</span>,{" "}
                  <span className="num">
                    {formatTime(t.startTime)}–{formatTime(t.endTime)}
                  </span>
                  .
                </p>
              )}
            </Panel>
            <div className="flex flex-col gap-0.5 px-1 text-xs text-ink-3">
              <p>
                Added <span className="num">{formatDateTime(t.createdAt)}</span>
                {t.createdBy && <> by {t.createdBy.name}</>}
              </p>
              <p>
                Last changed <span className="num">{formatDateTime(t.lastChange.at)}</span>
                {t.lastChange.by && <> by {t.lastChange.by}</>}
              </p>
            </div>
          </div>
        </div>

        {certificate && <CertificatePanel info={certificate} wide />}

        <ParticipantsPanel
          trainingId={id}
          rows={participants}
          training={{ status: t.status, startDate: t.startDate, endDate: t.endDate }}
          today={today.toISOString()}
          manage={manage}
          canViewStaff={can(user, "staff.view")}
        />

        <HistoryPanel entries={history} fields={TRAINING_HISTORY_FIELDS} />
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-ink-3">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] break-words">{children}</dd>
      </div>
    </div>
  );
}

/** Where attendance stands: completed out of everyone on the list, with the rest broken down. */
function AttendanceCard({
  className,
  attendance,
  total,
  hours,
  cancelled,
}: {
  className: string;
  attendance: { pending: number; completed: number; absent: number };
  total: number;
  hours: number | null;
  cancelled: boolean;
}) {
  return (
    <Panel className={className} title="Attendance">
      {total ? (
        <div className="flex h-full flex-col">
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] leading-none font-semibold tracking-tight">{attendance.completed}</span>
            <span className="text-[15px] text-ink-3">of {total} completed</span>
          </div>
          <Progress className="mt-4" tone="ok" value={attendance.completed} max={total} label="Participants who completed this training" />
          <ul className="mt-4 flex flex-col gap-2 text-[13px]">
            <li className="flex justify-between">
              <Status tone="ok">Completed</Status>
              <span className="num font-medium">{attendance.completed}</span>
            </li>
            <li className="flex justify-between">
              <Status tone="wait">Pending</Status>
              <span className="num font-medium">{attendance.pending}</span>
            </li>
            <li className="flex justify-between">
              <Status tone="na">Absent</Status>
              <span className="num font-medium">{attendance.absent}</span>
            </li>
          </ul>
          <p className="mt-auto border-t border-rule pt-3 text-xs text-ink-3">
            {cancelled ? "Cancelled: no one's hours count." : <>Each completed participant gets {formatHours(hours)}.</>}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">No one is on this training yet, so there is no attendance to show.</p>
      )}
    </Panel>
  );
}
