import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Sheet, SheetItem } from "@/components/Sheet";
import { Status } from "@/components/ui/Status";
import { formatDate, formatDateRange, formatDateTime, formatHours, formatMoney, formatTime, nowInMalaysia, plural } from "@/lib/format";
import { TRAINING_FUNCTION_LABELS, TRAINING_PLATFORM_LABELS, TRAINING_PROGRAM_LABELS, TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { dailyMinutes, dayNumber, trainingDeleteBlock, trainingHours, trainingPhase } from "@/server/rules/training";
import { getTraining, trainingHistory } from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { TRAINING_HISTORY_FIELDS } from "../historyFields";
import { PhaseStatus } from "../PhaseStatus";
import { CancelTrainingDialog, DeleteTrainingDialog, RestoreTrainingDialog } from "./TrainingActions";

export const metadata: Metadata = { title: "Training" };

const SAVED: Record<string, string> = { created: "Training added.", updated: "Changes saved." };

const none = (text = "Not recorded") => <span className="text-ink-3">{text}</span>;

export default async function TrainingPage({ params, searchParams }: PageProps<"/trainings/[id]">) {
  const user = await requirePermission("training.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await getTraining(user, id);
  if (!t) notFound();

  const { saved } = await searchParams;
  const manage = can(user, "training.manage");
  const history = manage || can(user, "audit.view") ? await trainingHistory(id) : [];
  const cancelled = t.status === "CANCELLED";
  const days = dayNumber(t.endDate)! - dayNumber(t.startDate)! + 1;
  const perDay = dailyMinutes(t.startTime, t.endTime);

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        module="training"
        context={{ href: "/trainings", label: "Trainings" }}
        title={t.title}
        meta={
          <>
            <span>{TRAINING_TYPE_LABELS[t.type]}</span>
            <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
            <span className="num">{formatHours(t.hours)}</span>
            <PhaseStatus phase={trainingPhase(t, nowInMalaysia())} />
          </>
        }
        actions={
          manage && (
            <>
              <Link href={`/trainings/${id}/edit`} className="btn">
                Edit
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
        <div role="status" className="notice notice-ok mb-4">
          {SAVED[saved]}
        </div>
      )}
      {cancelled && (
        <div className="notice notice-bad mb-4">This training was cancelled. It stays on record, but its hours don&apos;t count toward anyone&apos;s total.</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* The fields on the training form, in its order; dates and times are under Schedule. */}
          <Sheet title="Details">
            <SheetItem label="Type">{TRAINING_TYPE_LABELS[t.type]}</SheetItem>
            <SheetItem label="Venue">{t.venue ?? none()}</SheetItem>
            <SheetItem label="Cost (RM)">{t.cost !== null ? <span className="num">{formatMoney(t.cost)}</span> : none()}</SheetItem>
            <SheetItem label="HRDC">{t.hrdfClaimable ? "Yes" : "No"}</SheetItem>
            <SheetItem label="Platform">{t.platform ? TRAINING_PLATFORM_LABELS[t.platform] : none()}</SheetItem>
            <SheetItem label="Function">{t.function ? TRAINING_FUNCTION_LABELS[t.function] : none()}</SheetItem>
            <SheetItem label="Program">{t.program ? TRAINING_PROGRAM_LABELS[t.program] : none()}</SheetItem>
            <SheetItem label="Trainer">
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
            </SheetItem>
          </Sheet>

          <Panel title="Schedule" action={<span className="num text-ink-2">{formatHours(t.hours)} in total</span>} flush={t.sessions.length > 0}>
            {t.sessions.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12">#</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th className="text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {t.sessions.map((s, i) => (
                    <tr key={s.id}>
                      <td className="num muted">{i + 1}</td>
                      <td className="num">{formatDate(s.date)}</td>
                      <td className="num">
                        {formatTime(s.startTime)}–{formatTime(s.endTime)}
                      </td>
                      <td className="num text-right">{formatHours(trainingHours({ startDate: s.date, endDate: s.date, startTime: s.startTime, endTime: s.endTime }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <dl className="-my-2 text-[13.5px]">
                <SheetItem label="Dates">
                  <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
                  <span className="text-ink-3"> · {plural(days, "day")}</span>
                </SheetItem>
                <SheetItem label="Daily time">
                  <span className="num">
                    {formatTime(t.startTime)}–{formatTime(t.endTime)}
                  </span>
                  {perDay !== null && <span className="num text-ink-3"> · {formatHours(Math.round((perDay / 60) * 100) / 100)} a day</span>}
                </SheetItem>
              </dl>
            )}
          </Panel>

          <HistoryPanel entries={history} fields={TRAINING_HISTORY_FIELDS} />
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title="Participants">
            {t.participantCount === 0 ? (
              <p className="text-[13px] text-ink-2">No participants yet.</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Count label="Completed" value={t.attendance.completed} tone="ok" />
                  <Count label="Pending" value={t.attendance.pending} tone="wait" />
                  <Count label="Absent" value={t.attendance.absent} tone="na" />
                </dl>
                <p className="mt-3 text-xs text-ink-3">
                  {plural(t.participantCount, "participant")}.{" "}
                  {cancelled ? "Hours don't count while the training is cancelled." : "Only completed attendance counts toward hours."}
                </p>
              </>
            )}
          </Panel>

          <p className="px-1 text-xs text-ink-3">
            Added <span className="num">{formatDateTime(t.createdAt)}</span>
            {t.createdBy && <> by {t.createdBy.name}</>}. Last changed <span className="num">{formatDateTime(t.updatedAt)}</span>.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "ok" | "wait" | "na" }) {
  return (
    <div className="flex flex-col-reverse rounded-md bg-sunken px-2 py-2.5">
      <dt className="mt-0.5 flex justify-center text-xs text-ink-2">
        <Status tone={tone}>{label}</Status>
      </dt>
      <dd className="num text-xl font-semibold text-ink">{value}</dd>
    </div>
  );
}
