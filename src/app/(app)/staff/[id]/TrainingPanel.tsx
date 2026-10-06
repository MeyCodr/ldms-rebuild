import Link from "next/link";
import { Panel } from "@/components/Panel";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Status } from "@/components/ui/Status";
import { formatDateRange, formatHours, plural } from "@/lib/format";
import { ATTENDANCE_LABELS } from "@/lib/validation/participant";
import { TRAINING_TYPE_SHORT_LABELS } from "@/lib/validation/training";
import type { staffTrainingHistory } from "@/server/services/report";

type History = NonNullable<Awaited<ReturnType<typeof staffTrainingHistory>>>;

const TONE = { COMPLETED: "ok", PENDING: "wait", ABSENT: "na" } as const;

/**
 * A staff member's training: hours for each year, then every training they
 * have been on, latest first. Hours count for completed trainings that weren't
 * cancelled, as everywhere else.
 */
export function TrainingPanel({ history, openTrainings }: { history: History; openTrainings: boolean }) {
  const { rows, years, total } = history;
  return (
    <Panel
      title="Training"
      description={rows.length ? `${plural(total.completed, "training")} completed · ${formatHours(total.hours)} in all` : undefined}
      flush
    >
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-3">Not on any training yet.</p>
      ) : (
        <>
          {years.length > 0 && (
            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-rule px-5 py-3.5" aria-label="Hours by year">
              {years.map((y) => (
                <div key={y.year}>
                  <dt className="num text-xs text-ink-3">{y.year}</dt>
                  <dd className="num text-[15px] font-semibold">
                    {formatHours(y.hours)}
                    <span className="ml-1.5 text-xs font-normal text-ink-3">{plural(y.completed, "training")}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {/* A long history scrolls inside the card, under its headings. */}
          <div className="max-h-[420px] overflow-auto">
            <table className="table min-w-[560px]" aria-label="Training history">
              <thead>
                <tr>
                  <th className="w-px pl-5 text-right whitespace-nowrap">No.</th>
                  <th className="w-px whitespace-nowrap">Dates</th>
                  <th>Training</th>
                  <th className="hidden sm:table-cell">Type</th>
                  <th>Attendance</th>
                  <th className="w-px pr-5 text-right whitespace-nowrap">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cancelled = r.training.status === "CANCELLED";
                  return (
                    <ClickableRow key={r.id} href={openTrainings ? `/trainings/${r.training.id}` : null}>
                      <td className="num muted pl-5 text-right">{i + 1}</td>
                      <td className="num whitespace-nowrap">{formatDateRange(r.training.startDate, r.training.endDate)}</td>
                      <td>
                        {openTrainings ? (
                          <Link
                            href={`/trainings/${r.training.id}`}
                            className={`font-medium text-ink hover:text-accent hover:underline ${cancelled ? "line-through decoration-ink-3" : ""}`}
                          >
                            {r.training.title}
                          </Link>
                        ) : (
                          <span className={`font-medium ${cancelled ? "line-through decoration-ink-3" : ""}`}>{r.training.title}</span>
                        )}
                        <div className="num muted text-xs">{r.training.trainingCode}</div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="tag">{TRAINING_TYPE_SHORT_LABELS[r.training.type]}</span>
                      </td>
                      <td>
                        {cancelled ? <Status tone="bad">Cancelled</Status> : <Status tone={TONE[r.attendance]}>{ATTENDANCE_LABELS[r.attendance]}</Status>}
                        {r.attendanceReason && !cancelled && <div className="muted mt-0.5 max-w-[220px] text-xs break-words">{r.attendanceReason}</div>}
                      </td>
                      <td className={`num pr-5 text-right ${r.hours ? "font-medium" : "muted"}`}>{formatHours(r.hours)}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
