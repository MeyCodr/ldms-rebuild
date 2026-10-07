import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ArrowRight, BarChart3, ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Select } from "@/components/ui/Select";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import { nowInMalaysia, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can } from "@/server/permissions";
import { parseTnaYear, seesTeamTnas, TNA_STAGE_LABELS, TNA_STAGE_TONE, TNA_STAGES, tnaOpenYear, tnaStaffScope, tnaYearBlock, type TnaStage } from "@/server/rules/tna";
import { TNA_PAGE_SIZE, tnaDepartments, tnaGradeList, tnaStaffList, tnaStaffStageCounts, tnaYears, type TnaFilters } from "@/server/services/tna";
import { requireUser } from "@/server/session";
import { ApproveTnaDialog } from "./TnaActions";

export const metadata: Metadata = { title: "TNA" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The Team screen: the TNAs of the user's departments for a year, in two
 * lists. Individual: the staff who fill in their own. By job grade: one per
 * grade per department, for everyone else, filled in by the main clerk.
 */
export default async function TnaPage({ searchParams }: PageProps<"/tna">) {
  const user = await requireUser();
  if (!seesTeamTnas(user)) forbidden();
  const today = nowInMalaysia();
  const sp = await searchParams;
  const open = tnaOpenYear(today);
  const year = parseTnaYear(one(sp.year)) ?? open;
  const isOpen = year === open;
  // A main clerk has only the job grades; everyone else has both lists.
  const hasStaffList = tnaStaffScope(user) !== null;
  const view: "staff" | "grade" = !hasStaffList || one(sp.view) === "grade" ? "grade" : "staff";
  const stage = one(sp.stage);
  const department = one(sp.department);
  const page = Number(one(sp.page));
  const f: TnaFilters = {
    q: view === "staff" ? one(sp.q).trim().slice(0, 80) || undefined : undefined,
    stage: (TNA_STAGES as readonly string[]).includes(stage) ? (stage as TnaStage) : undefined,
    departmentId: /^\d{1,9}$/.test(department) && Number(department) > 0 ? Number(department) : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };

  const [staffList, staffCounts, grades, departments, years] = await Promise.all([
    view === "staff" ? tnaStaffList(user, year, f, today) : null,
    view === "staff" ? tnaStaffStageCounts(user, year, f.departmentId) : null,
    view === "grade" ? tnaGradeList(user, year, f, today) : null,
    tnaDepartments(user),
    tnaYears(today),
  ]);
  const counts = staffCounts ?? grades!.counts;
  const total = staffList ? staffList.total : grades!.rows.length;
  const filtered = !!(f.q || f.stage || f.departmentId);
  const manyDepartments = departments.length > 1;
  const offered = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);
  const pending = (staffList ? staffList.rows : grades!.rows).filter((r) => r.canApprove).map((r) => r.tna!.id);
  const query = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const all = {
      view: view === "grade" && hasStaffList ? "grade" : undefined,
      year: isOpen ? undefined : String(year),
      q: f.q,
      stage: f.stage,
      department: f.departmentId ? String(f.departmentId) : undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(all)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="page-fit">
      <PageHeader
        module="tna"
        context="Team"
        title="TNA"
        meta={
          <>
            <span>
              <span className="font-semibold text-ink">{year}</span> <span className="text-ink-3">· Training Need Analysis</span>
            </span>
            {!isOpen && <Status tone="na">Ended: view only</Status>}
            {(["RETURNED", "SUBMITTED"] as const)
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <Link key={s} href={`/tna${query({ stage: s, page: undefined })}`} className="hover:underline">
                  <Status tone={TNA_STAGE_TONE[s]}>
                    {TNA_STAGE_LABELS[s]} <span className="num font-semibold text-ink">{counts[s]}</span>
                  </Status>
                </Link>
              ))}
          </>
        }
        actions={
          <>
            {pending.length > 1 && <ApproveTnaDialog ids={pending} title={`Approve ${pending.length} TNAs`} />}
            {can(user, "tna.manage") && (
              <>
                <Link href={`/tna/summary${isOpen ? "" : `?year=${year}`}`} className="btn">
                  <BarChart3 size={15} aria-hidden /> Summary
                </Link>
                <Link href="/tna/options" className="btn">
                  <ListChecks size={15} aria-hidden /> Training options
                </Link>
              </>
            )}
          </>
        }
      />

      {one(sp.deleted) === "1" && (
        <div role="status" className="notice notice-ok mb-3">
          Draft deleted.
        </div>
      )}
      {!isOpen && <div className="notice notice-wait mb-3">{tnaYearBlock(year, today)}</div>}

      {hasStaffList && (
        <nav aria-label="Kind of TNA" className="mb-3 flex gap-1.5">
          {(
            [
              ["staff", "Individual", "Staff who fill in their own"],
              ["grade", "By job grade", "One per grade per department, for everyone else"],
            ] as const
          ).map(([key, label, hint]) => (
            <Link
              key={key}
              href={`/tna${query({ view: key === "grade" ? "grade" : undefined, q: undefined, stage: undefined, page: undefined })}`}
              aria-current={view === key ? "page" : undefined}
              title={hint}
              className={`btn btn-sm ${view === key ? "btn-primary" : ""}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Filter TNAs">
        {view === "grade" && hasStaffList && <input type="hidden" name="view" value="grade" />}
        <div className="w-full sm:w-40">
          <label htmlFor="year" className="label">
            Year
          </label>
          <Select id="year" name="year" defaultValue={String(year)} options={offered.map((y) => ({ value: String(y), label: String(y), hint: y === open ? "open" : undefined }))} />
        </div>
        {view === "staff" && (
          <div className="w-full sm:w-56">
            <label htmlFor="q" className="label">
              Search
            </label>
            <input id="q" name="q" defaultValue={f.q ?? ""} className="input" placeholder="Name or staff no." type="search" />
          </div>
        )}
        <div className="w-full sm:w-48">
          <label htmlFor="stage" className="label">
            Status
          </label>
          <Select
            id="stage"
            name="stage"
            defaultValue={f.stage ?? ""}
            options={[{ value: "", label: "All statuses" }, ...TNA_STAGES.map((s) => ({ value: s, label: TNA_STAGE_LABELS[s], hint: String(counts[s]) }))]}
          />
        </div>
        {manyDepartments && (
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
        <button type="submit" className="btn">
          Apply
        </button>
        {/* A full page load, so every field resets, including ones typed in but not applied yet. */}
        <a href={withBasePath(`/tna${view === "grade" && hasStaffList ? "?view=grade" : ""}`)} className="btn">
          Clear
        </a>
        <span className="num ml-auto self-center text-[13px] text-ink-3">
          {view === "staff" ? plural(total, "staff member") : plural(total, "job grade")}
          {filtered && " matching"}
        </span>
      </form>

      {staffList && (
        <div className="table-scroll card mt-4">
          <table className="table min-w-[860px]" aria-label="Individual TNAs">
            <thead>
              <tr>
                <th className="w-px text-right whitespace-nowrap">No.</th>
                <th className="w-px whitespace-nowrap">Staff no.</th>
                <th className="min-w-[200px]">Name</th>
                <th className="hidden lg:table-cell">Department</th>
                <th className="hidden w-px whitespace-nowrap md:table-cell">Designation</th>
                <th className="w-px whitespace-nowrap">Status</th>
                <th className="w-px text-right whitespace-nowrap">Rows</th>
                <th className="w-px">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staffList.rows.map((r, i) => {
                const href = r.tna ? `/tna/${r.tna.id}` : r.startBlock === null ? `/tna/new?staff=${r.staff.id}` : null;
                return (
                  <ClickableRow key={r.staff.id} href={href}>
                    <td className="num muted text-right">{(staffList.page - 1) * TNA_PAGE_SIZE + i + 1}</td>
                    <td className="num whitespace-nowrap">{r.staff.staffNo}</td>
                    <td>
                      {href ? (
                        <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                          {r.staff.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.staff.name}</span>
                      )}
                      {r.staff.status === "RESIGNED" && <span className="kbd-tag ml-2">Resigned</span>}
                      {r.staff.position && <div className="muted text-xs">{r.staff.position}</div>}
                    </td>
                    <td className="hidden lg:table-cell">{r.staff.department.name}</td>
                    <td className="hidden whitespace-nowrap md:table-cell">{DESIGNATION_LABELS[r.staff.designation]}</td>
                    <td className="whitespace-nowrap">
                      <Status tone={TNA_STAGE_TONE[r.stage]}>{TNA_STAGE_LABELS[r.stage]}</Status>
                      {r.stage === "RETURNED" && <div className="muted max-w-[220px] truncate text-xs">{r.tna?.returnReason}</div>}
                    </td>
                    <td className="num text-right">{r.tna ? r.tna._count.items : <span className="muted">–</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      <RowAction tna={r.tna} canApprove={r.canApprove} canEdit={r.canEdit} startHref={r.startBlock === null ? `/tna/new?staff=${r.staff.id}` : null} />
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
          {staffList.rows.length === 0 && (
            <Empty filtered={filtered} clearHref={`/tna${isOpen ? "" : `?year=${year}`}`}>
              {isOpen ? "No one in your departments fills in their own TNA." : `No individual TNAs on record for ${year}.`}
            </Empty>
          )}
        </div>
      )}

      {grades && (
        <div className="table-scroll card mt-4">
          <table className="table min-w-[760px]" aria-label="TNAs by job grade">
            <thead>
              <tr>
                <th className="w-px text-right whitespace-nowrap">No.</th>
                <th className="min-w-[200px]">Department</th>
                <th className="w-px whitespace-nowrap">Job grade</th>
                <th className="w-px text-right whitespace-nowrap">Staff covered</th>
                <th className="w-px whitespace-nowrap">Status</th>
                <th className="w-px text-right whitespace-nowrap">Rows</th>
                <th className="hidden lg:table-cell">Filled in by</th>
                <th className="w-px">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grades.rows.map((r, i) => {
                const startHref = r.startBlock === null ? `/tna/new?department=${r.department.id}&grade=${r.jobGrade}` : null;
                const href = r.tna ? `/tna/${r.tna.id}` : startHref;
                return (
                  <ClickableRow key={`${r.department.id}-${r.jobGrade}`} href={href}>
                    <td className="num muted text-right">{i + 1}</td>
                    <td>
                      {href ? (
                        <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                          {r.department.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.department.name}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      Grade <span className="num font-medium">{r.jobGrade}</span>
                    </td>
                    <td className="num text-right">{r.headcount}</td>
                    <td className="whitespace-nowrap">
                      <Status tone={TNA_STAGE_TONE[r.stage]}>{TNA_STAGE_LABELS[r.stage]}</Status>
                      {r.stage === "RETURNED" && <div className="muted max-w-[220px] truncate text-xs">{r.tna?.returnReason}</div>}
                    </td>
                    <td className="num text-right">{r.tna ? r.tna._count.items : <span className="muted">–</span>}</td>
                    <td className="hidden lg:table-cell">{r.tna?.createdBy?.name ?? <span className="muted">–</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      <RowAction tna={r.tna} canApprove={r.canApprove} canEdit={r.canEdit} startHref={startHref} />
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
          {grades.rows.length === 0 && (
            <Empty filtered={filtered} clearHref={`/tna?view=grade${isOpen ? "" : `&year=${year}`}`}>
              {isOpen
                ? "No one here is covered by a job grade's TNA yet. Non-executive and contract staff are covered once L&D set their job grade on the staff record."
                : `No job-grade TNAs on record for ${year}.`}
            </Empty>
          )}
        </div>
      )}

      {staffList && staffList.pages > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-[13px] text-ink-2">
          <span className="num">
            {(staffList.page - 1) * TNA_PAGE_SIZE + 1}–{Math.min(staffList.page * TNA_PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {staffList.page > 1 ? (
              <Link className="btn btn-sm" href={`/tna${query({ page: String(staffList.page - 1) })}`}>
                Previous
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" aria-disabled>
                Previous
              </span>
            )}
            {staffList.page < staffList.pages ? (
              <Link className="btn btn-sm" href={`/tna${query({ page: String(staffList.page + 1) })}`}>
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

/** The one thing this user would do next with the row: start it, carry on with it, or review it. */
function RowAction({ tna, canApprove, canEdit, startHref }: { tna: { id: number } | null; canApprove: boolean; canEdit: boolean; startHref: string | null }) {
  if (!tna)
    return startHref ? (
      <Link href={startHref} className="btn btn-primary btn-sm">
        <Plus size={14} aria-hidden /> Start
      </Link>
    ) : null;
  if (canApprove)
    return (
      <Link href={`/tna/${tna.id}`} className="btn btn-primary btn-sm">
        Review <ArrowRight size={14} aria-hidden />
      </Link>
    );
  if (canEdit)
    return (
      <Link href={`/tna/${tna.id}/edit`} className="btn btn-sm">
        Continue <ArrowRight size={14} aria-hidden />
      </Link>
    );
  return null;
}

function Empty({ filtered, clearHref, children }: { filtered: boolean; clearHref: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-ink-2">
      {filtered ? (
        <>
          Nothing matches these filters.{" "}
          <Link href={clearHref} className="link">
            Clear filters
          </Link>
        </>
      ) : (
        children
      )}
    </div>
  );
}
