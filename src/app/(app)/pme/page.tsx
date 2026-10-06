import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Select } from "@/components/ui/Select";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import { formatDate, formatDateRange, nowInMalaysia, plural } from "@/lib/format";
import { isAdmin } from "@/server/permissions";
import { PME_STAGE_LABELS, PME_STAGE_TONE, PME_STAGES, type PmeStage } from "@/server/rules/pme";
import { listPmes, PME_PAGE_SIZE, pmeDepartments, pmeStageCounts } from "@/server/services/pme";
import { requirePermission } from "@/server/session";
import { parsePmeFilters, pmeQuery } from "./filters";
import { formatMark } from "./labels";

export const metadata: Metadata = { title: "PME" };

/** The stages someone has to act on, as shown in the header. */
const WAITING: PmeStage[] = ["TO_EVALUATE", "TO_ACKNOWLEDGE", "TO_VERIFY"];

export default async function PmeListPage({ searchParams }: PageProps<"/pme">) {
  const user = await requirePermission("pme.view");
  const today = nowInMalaysia();
  const f = parsePmeFilters(await searchParams);
  const [{ rows, total, page, pages }, counts, departments] = await Promise.all([listPmes(user, f, today), pmeStageCounts(user, today), pmeDepartments(user)]);
  const filtered = !!(f.q || f.stage || f.departmentId || f.from || f.to);
  const anyAction = rows.some((r) => r.blocked.EVALUATE === null || r.blocked.VERIFY === null);

  return (
    <div className="page-fit">
      <PageHeader
        module="pme"
        context="Team"
        title="PME"
        meta={
          <>
            <span>Performance Monitoring Evaluation{!isAdmin(user) && ", your staff"}</span>
            {WAITING.filter((s) => counts[s] > 0).map((s) => (
              <Link key={s} href={`/pme?stage=${s}`} className="hover:underline">
                <Status tone="wait">
                  {PME_STAGE_LABELS[s]} <span className="num font-semibold text-ink">{counts[s]}</span>
                </Status>
              </Link>
            ))}
          </>
        }
        actions={
          <a href={withBasePath(`/pme/export${pmeQuery(f, { page: undefined })}`)} className="btn">
            <FileDown size={15} aria-hidden /> Export to Excel
          </a>
        }
      />

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Filter PMEs">
        <div className="w-full sm:w-56">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={f.q ?? ""} className="input" placeholder="Staff or training" type="search" />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="stage" className="label">
            Status
          </label>
          <Select
            id="stage"
            name="stage"
            defaultValue={f.stage ?? ""}
            options={[{ value: "", label: "All statuses" }, ...PME_STAGES.map((s) => ({ value: s, label: PME_STAGE_LABELS[s], hint: String(counts[s]) }))]}
          />
        </div>
        {departments.length > 1 && (
          <div className="w-full sm:w-56">
            <label htmlFor="department" className="label">
              Department
            </label>
            <Select
              id="department"
              name="department"
              defaultValue={f.departmentId ? String(f.departmentId) : ""}
              options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
            />
          </div>
        )}
        <DateRangeFilter from={f.from} to={f.to} />
        <button type="submit" className="btn">
          Apply
        </button>
        {/* A full page load, so every field resets, including ones typed in but not applied yet. */}
        <a href={withBasePath("/pme")} className="btn">
          Clear
        </a>
        <span className="num ml-auto self-center text-[13px] text-ink-3">
          {plural(total, "PME")}
          {filtered && " matching"}
        </span>
      </form>

      <div className="table-scroll card mt-4">
        <table className="table min-w-[980px]" aria-label="PMEs">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap">Staff no.</th>
              <th className="min-w-[180px]">Name</th>
              <th className="hidden xl:table-cell">Department</th>
              <th className="min-w-[200px]">Training</th>
              <th className="w-px whitespace-nowrap">Training dates</th>
              <th className="w-px whitespace-nowrap" title="The HOD evaluates after this day">
                Period ends
              </th>
              <th className="w-px whitespace-nowrap">Status</th>
              <th className="w-px text-right whitespace-nowrap" title="Average of the four percentages, out of 100">
                Mark
              </th>
              {anyAction && (
                <th className="hidden w-px lg:table-cell">
                  <span className="sr-only">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ClickableRow key={r.id} href={`/pme/${r.id}`}>
                <td className="num muted text-right">{(page - 1) * PME_PAGE_SIZE + i + 1}</td>
                <td className="num whitespace-nowrap">{r.staff.staffNo}</td>
                <td>
                  <Link href={`/pme/${r.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                    {r.staff.name}
                  </Link>
                  {r.staff.status === "RESIGNED" && <span className="kbd-tag ml-2">Resigned</span>}
                </td>
                <td className="hidden xl:table-cell">{r.staff.department}</td>
                <td>{r.training.title}</td>
                <td className="num whitespace-nowrap">{formatDateRange(r.training.startDate, r.training.endDate)}</td>
                <td className="num whitespace-nowrap">{r.status === "NOT_REQUIRED" ? <span className="muted">–</span> : formatDate(r.periodEnd)}</td>
                <td className="whitespace-nowrap">
                  <Status tone={PME_STAGE_TONE[r.stage]}>{PME_STAGE_LABELS[r.stage]}</Status>
                  {r.stage === "TO_EVALUATE" && !r.evaluator && <div className="muted text-xs">No active HOD</div>}
                  {r.stage === "TO_EVALUATE" && r.returnReason && <div className="muted text-xs">Sent back by L&amp;D</div>}
                </td>
                <td className="num text-right whitespace-nowrap">
                  {r.mark && r.status !== "PENDING" ? <span className="font-medium">{formatMark(r.mark.average)}</span> : <span className="muted">–</span>}
                </td>
                {anyAction && (
                  <td className="hidden text-right lg:table-cell">
                    {r.blocked.EVALUATE === null ? (
                      <Link href={`/pme/${r.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                        Evaluate <ArrowRight size={14} aria-hidden />
                      </Link>
                    ) : r.blocked.VERIFY === null ? (
                      <Link href={`/pme/${r.id}`} className="btn btn-primary btn-sm whitespace-nowrap">
                        Verify <ArrowRight size={14} aria-hidden />
                      </Link>
                    ) : null}
                  </td>
                )}
              </ClickableRow>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-ink-2">
            {filtered ? (
              <>
                No PMEs match these filters.{" "}
                <Link href="/pme" className="link">
                  Clear filters
                </Link>
              </>
            ) : (
              "No PMEs yet. One is made for each executive or manager when they complete a training (not OJT)."
            )}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-[13px] text-ink-2">
          <span className="num">
            {(page - 1) * PME_PAGE_SIZE + 1}–{Math.min(page * PME_PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className="btn btn-sm" href={`/pme${pmeQuery(f, { page: page - 1 })}`}>
                Previous
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" aria-disabled>
                Previous
              </span>
            )}
            {page < pages ? (
              <Link className="btn btn-sm" href={`/pme${pmeQuery(f, { page: page + 1 })}`}>
                Next
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" aria-disabled>
                Next
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
