import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Progress } from "@/components/ui/Progress";
import { Select } from "@/components/ui/Select";
import { formatDateRange, formatHours, nowInMalaysia, plural } from "@/lib/format";
import { TRAINING_TYPE_LABELS, TRAINING_TYPE_SHORT_LABELS, TRAINING_TYPES } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { trainingPhase } from "@/server/rules/training";
import {
  listTrainings,
  TRAINING_PAGE_SIZE,
  TRAINING_SORT_DEFAULT_DIR,
  type TrainingFilters,
  type TrainingSort,
} from "@/server/services/training";
import { requirePermission } from "@/server/session";
import { filtersToQuery, parseTrainingFilters } from "./filters";
import { PhaseStatus } from "./PhaseStatus";
import { withBasePath } from "@/lib/base-path";

export const metadata: Metadata = { title: "Trainings" };

export default async function TrainingsPage({ searchParams }: PageProps<"/trainings">) {
  const user = await requirePermission("training.view");
  const sp = await searchParams;
  const f = parseTrainingFilters(sp);
  const today = nowInMalaysia();
  const { rows, total, page, pages } = await listTrainings(user, f);
  const filtered = !!(f.q || f.type || f.from || f.to || f.status !== "ALL");

  return (
    <div className="page-fit mx-auto max-w-[1700px]">
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
            <a href={withBasePath(`/trainings/export${filtersToQuery(f, { page: undefined })}`)} className="btn">
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

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Filter trainings">
        <div className="w-full sm:w-60">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={f.q} className="input" placeholder="Code, title, trainer or venue" type="search" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <label htmlFor="type" className="label">
            Type
          </label>
          <Select
            id="type"
            name="type"
            defaultValue={f.type ?? ""}
            options={[{ value: "", label: "All types" }, ...TRAINING_TYPES.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] }))]}
          />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <label htmlFor="status" className="label">
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
        <DateRangeFilter from={f.from} to={f.to} />
        {f.sort !== "date" && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir !== TRAINING_SORT_DEFAULT_DIR[f.sort ?? "date"] && <input type="hidden" name="dir" value={f.dir} />}
        <button type="submit" className="btn">
          Apply
        </button>
        {/* A full page load, so every field resets, including ones typed in but not applied yet. Keeps the sort. */}
        <a href={withBasePath(`/trainings${filtersToQuery({ sort: f.sort, dir: f.dir })}`)} className="btn">
          Clear
        </a>
      </form>

      <div className="table-scroll card mt-4">
        <table className="table">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="hidden w-px whitespace-nowrap md:table-cell">Training code</th>
              <SortTh f={f} col="date" className="w-28 sm:w-44">
                Dates
              </SortTh>
              <SortTh f={f} col="title">
                Training
              </SortTh>
              <SortTh f={f} col="type" className="hidden w-28 md:table-cell">
                Type
              </SortTh>
              <th className="hidden w-px text-right whitespace-nowrap sm:table-cell">Total days</th>
              <th className="hidden w-20 text-right sm:table-cell" title="Hours per participant">
                Hours
              </th>
              <SortTh
                f={f}
                col="participants"
                className="hidden w-32 text-right md:table-cell"
                title="Completed / all participants. Sorts by all participants."
              >
                Participants
              </SortTh>
              <th className="hidden w-px text-right whitespace-nowrap md:table-cell" title="Hours × participants who completed it">
                Total man hours
              </th>
              <th className="w-24 sm:w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td className="num muted text-right">{(page - 1) * TRAINING_PAGE_SIZE + i + 1}</td>
                <td className="num hidden whitespace-nowrap md:table-cell">{t.trainingCode}</td>
                <td>
                  <div className="num sm:whitespace-nowrap">{formatDateRange(t.startDate, t.endDate)}</div>
                </td>
                <td>
                  <Link
                    href={`/trainings/${t.id}`}
                    className={`font-medium text-ink hover:text-accent hover:underline ${t.status === "CANCELLED" ? "line-through decoration-ink-3" : ""}`}
                  >
                    {t.title}
                  </Link>
                  {/* The code and type have their own columns from tablet width; on phones they sit under the title. */}
                  <div className="muted mt-0.5 text-xs md:hidden">
                    <span className="num">{t.trainingCode}</span> · {TRAINING_TYPE_SHORT_LABELS[t.type]}
                  </div>
                </td>
                <td className="hidden md:table-cell">
                  <span className="tag">{TRAINING_TYPE_SHORT_LABELS[t.type]}</span>
                </td>
                <td className="num hidden text-right sm:table-cell">{t.days ?? <span className="muted">–</span>}</td>
                <td className="num hidden text-right sm:table-cell">{formatHours(t.hours)}</td>
                <td className="num hidden text-right md:table-cell">
                  {t.participantCount ? (
                    <>
                      {t.completedCount} <span className="muted">/ {t.participantCount}</span>
                      <Progress
                        className="mt-2 ml-auto w-20"
                        size="sm"
                        tone="ok"
                        value={t.completedCount}
                        max={t.participantCount}
                        label={`${t.completedCount} of ${t.participantCount} completed`}
                      />
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </td>
                <td className={`num hidden text-right whitespace-nowrap md:table-cell ${t.manHours ? "" : "muted"}`}>{formatHours(t.manHours)}</td>
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
