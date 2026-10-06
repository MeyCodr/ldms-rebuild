import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, FileUp, Plus } from "lucide-react";
import { Avatar, DivisionMark } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Select } from "@/components/ui/Select";
import { StaffStatus } from "@/components/ui/Status";
import { formatDate, plural } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { DESIGNATION_LABELS, DESIGNATIONS } from "@/lib/validation/staff";
import { can, isAdmin, staffViewScope } from "@/server/permissions";
import { departmentOptions } from "@/server/services/org";
import { listStaff, PAGE_SIZE, STAFF_FLAGS, type StaffFilters } from "@/server/services/staff";
import { requirePermission } from "@/server/session";
import { filtersToQuery, parseStaffFilters } from "./filters";
import { withBasePath } from "@/lib/base-path";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const user = await requirePermission("staff.view");
  const f = parseStaffFilters(await searchParams);
  const [{ rows, total, page, pages }, departments] = await Promise.all([listStaff(user, f), departmentOptions()]);

  const filtered = !!(f.q || f.departmentId || f.designation || f.status !== "ACTIVE" || f.flag);
  const showStatus = f.status !== "ACTIVE";
  const scopeNote = isAdmin(user)
    ? null
    : staffViewScope(user) && user.roles.some((r) => r === "CLERK" || r === "MAIN_CLERK")
      ? "Contract staff"
      : "Staff in the departments you approve for";

  return (
    // The page fills the screen and the table scrolls inside it, as on Trainings.
    <div className="page-fit">
      <PageHeader module="staff"
        context="Records"
        title="Staff"
        meta={
          <>
            <span>
              {plural(total, f.status === "RESIGNED" ? "resigned staff member" : f.status === "ALL" ? "staff record" : "active staff member", f.status === "RESIGNED" ? "resigned staff" : f.status === "ALL" ? "staff records" : "active staff")}
              {filtered && " matching"}
            </span>
            {scopeNote && <span className="text-ink-3">Showing: {scopeNote}</span>}
          </>
        }
        actions={
          <>
            <a href={withBasePath(`/staff/export${filtersToQuery(f, { page: undefined })}`)} className="btn">
              <FileDown size={15} aria-hidden /> Export to Excel
            </a>
            {can(user, "staff.import") && (
              <Link href="/staff/import" className="btn">
                <FileUp size={15} aria-hidden /> Import
              </Link>
            )}
            {can(user, "staff.manage") && (
              <Link href="/staff/new" className="btn btn-primary">
                <Plus size={15} aria-hidden /> Add staff
              </Link>
            )}
          </>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-2 card p-3" role="search" aria-label="Filter staff">
        <div className="w-full sm:w-64">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" defaultValue={f.q} className="input" placeholder="Name, staff no., email or position" type="search" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-56">
          <label htmlFor="departmentId" className="sr-only">
            Department
          </label>
          <Select
            id="departmentId"
            name="departmentId"
            defaultValue={f.departmentId ? String(f.departmentId) : ""}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name, group: d.division.name }))]}
          />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-44">
          <label htmlFor="designation" className="sr-only">
            Designation
          </label>
          <Select
            id="designation"
            name="designation"
            defaultValue={f.designation ?? ""}
            options={[{ value: "", label: "All designations" }, ...DESIGNATIONS.map((d) => ({ value: d, label: DESIGNATION_LABELS[d] }))]}
          />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={f.status}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "RESIGNED", label: "Resigned" },
              { value: "ALL", label: "All statuses" },
            ]}
          />
        </div>
        {f.flag && <input type="hidden" name="flag" value={f.flag} />}
        {f.sort !== "staffNo" && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir === "desc" && <input type="hidden" name="dir" value="desc" />}
        <button type="submit" className="btn">
          Apply
        </button>
        {filtered && (
          <Link href="/staff" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {f.flag && (
        <div className="notice notice-wait mt-3">
          <span>
            Showing only: <strong className="font-medium">{STAFF_FLAGS[f.flag]}</strong>
          </span>
          <Link href={`/staff${filtersToQuery(f, { flag: undefined, page: undefined })}`} className="link ml-auto">
            Remove
          </Link>
        </div>
      )}

      <div className="table-scroll card mt-4">
        <table className="table">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <SortTh f={f} col="staffNo" className="w-28">
                Staff no.
              </SortTh>
              <SortTh f={f} col="name">
                Name
              </SortTh>
              <th className="hidden w-32 md:table-cell">Designation</th>
              <SortTh f={f} col="department">
                Department
              </SortTh>
              <SortTh f={f} col="dateJoined" className="hidden w-32 sm:table-cell">
                Joined
              </SortTh>
              {showStatus && <th className="w-28">Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <ClickableRow key={s.id} href={`/staff/${s.id}`}>
                <td className="num muted pt-3 text-right">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="num pt-3">{s.staffNo}</td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} tone={divisionTone(s.department.divisionId)} />
                    <div className="min-w-0">
                      <Link href={`/staff/${s.id}`} className="link font-medium">
                        {s.name}
                      </Link>
                      {s.position && <div className="muted text-xs">{s.position}</div>}
                    </div>
                  </div>
                </td>
                <td className="hidden pt-3 md:table-cell">{DESIGNATION_LABELS[s.designation]}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <DivisionMark tone={divisionTone(s.department.divisionId)} />
                    {s.department.name}
                  </div>
                  {s.section && <div className="muted pl-4 text-xs">{s.section.name}</div>}
                </td>
                <td className="num hidden pt-3 sm:table-cell">{formatDate(s.dateJoined)}</td>
                {showStatus && (
                  <td>
                    <StaffStatus status={s.status} />
                    {s.dateResigned && <div className="num muted text-xs">{formatDate(s.dateResigned)}</div>}
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
                No staff match these filters.{" "}
                <Link href="/staff" className="link">
                  Clear filters
                </Link>
              </>
            ) : (
              "No staff records yet."
            )}
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-3 flex shrink-0 items-center justify-between text-[13px] text-ink-2">
          <span className="num">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className="btn btn-sm" href={`/staff${filtersToQuery(f, { page: page - 1 })}`}>
                Previous
              </Link>
            ) : (
              <span className="btn btn-sm" aria-disabled="true">
                Previous
              </span>
            )}
            {page < pages ? (
              <Link className="btn btn-sm" href={`/staff${filtersToQuery(f, { page: page + 1 })}`}>
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

function SortTh({ f, col, className = "", children }: { f: StaffFilters; col: NonNullable<StaffFilters["sort"]>; className?: string; children: React.ReactNode }) {
  const active = f.sort === col;
  const nextDir = active && f.dir === "asc" ? "desc" : "asc";
  return (
    <th className={className} aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={`/staff${filtersToQuery(f, { sort: col, dir: nextDir, page: 1 })}`} className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}>
        {children}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
          {active && f.dir === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );
}
