import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/ui/Select";
import { formatDateRange, formatHours, formatTime, nowInMalaysia, plural } from "@/lib/format";
import { TRAINING_TYPE_LABELS, TRAINING_TYPE_SHORT_LABELS, TRAINING_TYPES } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { trainingPhase } from "@/server/rules/training";
import { listTrainings, TRAINING_PAGE_SIZE, TRAINING_SORT_DEFAULT_DIR, trainingYears, type TrainingFilters, type TrainingSort } from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { filtersToQuery, parseTrainingFilters } from "./filters";
import { PhaseStatus } from "./PhaseStatus";

export const metadata: Metadata = { title: "Trainings" };

export default async function TrainingsPage({ searchParams }: PageProps<"/trainings">) {
  const user = await requirePermission("training.view");
  const sp = await searchParams;
  const f = parseTrainingFilters(sp);
  const today = nowInMalaysia();
  const [{ rows, total, page, pages }, years] = await Promise.all([listTrainings(user, f), trainingYears(today.getUTCFullYear())]);
  const filtered = !!(f.q || f.type || f.year || f.status !== "ALL");

  return (
    <div className="page-fit mx-auto max-w-[1280px]">
      <PageHeader
        module="training"
        context="Training"
        title="Trainings"
        meta={
          <span>
            {plural(total, "training")}
            {filtered && " matching"}
          </span>
        }
        actions={
          <>
            <a href={`/trainings/export${filtersToQuery(f, { page: undefined })}`} className="btn">
              Export to Excel
            </a>
            {can(user, "training.manage") && (
              <Link href="/trainings/new" className="btn btn-primary">
                Add training
              </Link>
            )}
          </>
        }
      />

      {sp.deleted === "1" && (
        <div role="status" className="notice notice-ok mb-3">
          Training deleted.
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-rule bg-surface p-3" role="search" aria-label="Filter trainings">
        <div className="w-full sm:w-72">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" defaultValue={f.q} className="input" placeholder="Title, trainer or venue" type="search" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <label htmlFor="type" className="sr-only">
            Type
          </label>
          <Select
            id="type"
            name="type"
            defaultValue={f.type ?? ""}
            options={[{ value: "", label: "All types" }, ...TRAINING_TYPES.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] }))]}
          />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-32">
          <label htmlFor="year" className="sr-only">
            Year
          </label>
          <Select
            id="year"
            name="year"
            defaultValue={f.year ? String(f.year) : ""}
            options={[{ value: "", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={f.status}
            options={[
              { value: "ALL", label: "All statuses" },
              { value: "SCHEDULED", label: "Not cancelled" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </div>
        {f.sort !== "date" && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir !== TRAINING_SORT_DEFAULT_DIR[f.sort ?? "date"] && <input type="hidden" name="dir" value={f.dir} />}
        <button type="submit" className="btn">
          Apply
        </button>
        {filtered && (
          <Link href="/trainings" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="table-scroll mt-4 rounded-lg border border-rule bg-surface">
        <table className="table">
          <thead>
            <tr>
              <SortTh f={f} col="date" className="w-28 sm:w-44">
                Dates
              </SortTh>
              <SortTh f={f} col="title">
                Training
              </SortTh>
              <SortTh f={f} col="type" className="hidden w-28 md:table-cell">
                Type
              </SortTh>
              <th className="hidden w-20 text-right sm:table-cell">Hours</th>
              <SortTh f={f} col="participants" className="hidden w-28 text-right md:table-cell" title="Completed / all participants. Sorts by all participants.">
                Participants
              </SortTh>
              <th className="w-24 sm:w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="num sm:whitespace-nowrap">{formatDateRange(t.startDate, t.endDate)}</div>
                  <div className="num muted text-xs">
                    {t.sessions.length ? plural(t.sessions.length, "session") : `${formatTime(t.startTime)}–${formatTime(t.endTime)}`}
                  </div>
                </td>
                <td>
                  <Link href={`/trainings/${t.id}`} className={`link font-medium ${t.status === "CANCELLED" ? "line-through decoration-ink-3" : ""}`}>
                    {t.title}
                  </Link>
                  <div className="muted text-xs">
                    {[t.trainerName, t.venue].filter(Boolean).join(" · ")}
                    <span className="md:hidden">
                      {(t.trainerName || t.venue) && " · "}
                      {TRAINING_TYPE_SHORT_LABELS[t.type]}
                    </span>
                  </div>
                </td>
                <td className="hidden md:table-cell">{TRAINING_TYPE_SHORT_LABELS[t.type]}</td>
                <td className="num hidden text-right sm:table-cell">{formatHours(t.hours)}</td>
                <td className="num hidden text-right md:table-cell">
                  {t.participantCount ? (
                    <>
                      {t.completedCount} <span className="muted">/ {t.participantCount}</span>
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </td>
                <td>
                  <PhaseStatus phase={trainingPhase(t, today)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-ink-2">
            {filtered ? (
              <>
                No trainings match these filters.{" "}
                <Link href="/trainings" className="link">
                  Clear filters
                </Link>
              </>
            ) : (
              "No trainings yet."
            )}
          </div>
        )}
      </div>

      {total > TRAINING_PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-3 flex shrink-0 items-center justify-between text-[13px] text-ink-2">
          <span className="num">
            {(page - 1) * TRAINING_PAGE_SIZE + 1}–{Math.min(page * TRAINING_PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className="btn btn-sm" href={`/trainings${filtersToQuery(f, { page: page - 1 })}`}>
                Previous
              </Link>
            ) : (
              <span className="btn btn-sm" aria-disabled="true">
                Previous
              </span>
            )}
            {page < pages ? (
              <Link className="btn btn-sm" href={`/trainings${filtersToQuery(f, { page: page + 1 })}`}>
                Next
              </Link>
            ) : (
              <span className="btn btn-sm" aria-disabled="true">
                Next
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function SortTh({
  f,
  col,
  className = "",
  title,
  children,
}: {
  f: TrainingFilters;
  col: TrainingSort;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const active = f.sort === col;
  // First click uses the column's natural direction; clicking again reverses it.
  const nextDir = active ? (f.dir === "asc" ? "desc" : "asc") : TRAINING_SORT_DEFAULT_DIR[col];
  const right = className.includes("text-right");
  return (
    <th className={className} title={title} aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link
        href={`/trainings${filtersToQuery(f, { sort: col, dir: nextDir, page: 1 })}`}
        className={`inline-flex items-center gap-1 hover:text-ink ${right ? "flex-row-reverse" : ""} ${active ? "text-ink" : ""}`}
      >
        {children}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
          {active && f.dir === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );
}
