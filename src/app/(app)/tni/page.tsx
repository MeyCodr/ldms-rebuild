import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ArrowRight, FileSpreadsheet, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Select } from "@/components/ui/Select";
import { Status } from "@/components/ui/Status";
import { withBasePath } from "@/lib/base-path";
import { formatDateTime, nowInMalaysia, plural } from "@/lib/format";
import { tnaOpenedEarly } from "@/server/rules/tna";
import { parseTniYear, seesTnis, tniYearBlock } from "@/server/rules/tni";
import { tnaOpen } from "@/server/services/tna";
import { tniList, tniYears } from "@/server/services/tni";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "TNI" };

/** The Team screen: each of the user's departments with its Training Need Identification for a year. */
export default async function TniPage({ searchParams }: PageProps<"/tni">) {
  const user = await requireUser();
  if (!seesTnis(user)) forbidden();
  const today = nowInMalaysia();
  const open = await tnaOpen(today);
  const raw = (await searchParams).year;
  const year = parseTniYear(typeof raw === "string" ? raw : undefined) ?? open;
  const isOpen = year === open;
  const [rows, years] = await Promise.all([tniList(user, year, today), tniYears(today)]);
  const offered = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);
  const done = rows.filter((r) => r.tni).length;
  const suffix = isOpen ? "" : `?year=${year}`;

  return (
    <div className="page-fit">
      <PageHeader
        module="tni"
        context="Team"
        title="TNI"
        meta={
          <>
            <span>
              <span className="font-semibold text-ink">{year}</span> <span className="text-ink-3">· Training Need Identification</span>
            </span>
            {isOpen ? tnaOpenedEarly(today, open) && <Status tone="ok">Opened early</Status> : <Status tone="na">Closed: view only</Status>}
            <span>
              <span className="num font-semibold text-ink">{done}</span> of {plural(rows.length, "department")} filled in
            </span>
          </>
        }
        actions={
          <a href={withBasePath(`/tni/export?year=${year}`)} className="btn" download>
            <FileSpreadsheet size={15} aria-hidden /> Export to Excel
          </a>
        }
      />

      {!isOpen && <div className="notice notice-wait mb-3">{tniYearBlock(year, open)}</div>}

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3" role="search" aria-label="Choose a year">
        <div className="w-full sm:w-40">
          <label htmlFor="year" className="label">
            Year
          </label>
          <Select id="year" name="year" defaultValue={String(year)} options={offered.map((y) => ({ value: String(y), label: String(y), hint: y === open ? "open" : undefined }))} />
        </div>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      <div className="table-scroll card mt-4">
        <table className="table min-w-[760px]" aria-label="TNIs by department">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="min-w-[200px]">Department</th>
              <th className="hidden md:table-cell">HOD</th>
              <th className="w-px whitespace-nowrap">Status</th>
              <th className="w-px text-right whitespace-nowrap">Rows</th>
              <th className="hidden w-px whitespace-nowrap lg:table-cell">Last saved</th>
              <th className="w-px">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const href = `/tni/${r.department.id}${suffix}`;
              return (
                <ClickableRow key={r.department.id} href={href}>
                  <td className="num muted text-right">{i + 1}</td>
                  <td>
                    <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                      {r.department.name}
                    </Link>
                    <div className="muted text-xs">{r.department.division.name}</div>
                  </td>
                  <td className="hidden md:table-cell">{r.hod?.name ?? <span className="muted">No active HOD</span>}</td>
                  <td className="whitespace-nowrap">{r.tni ? <Status tone="ok">Filled in</Status> : <Status tone="na">Not filled in</Status>}</td>
                  <td className="num text-right">{r.tni ? r.tni._count.items : <span className="muted">–</span>}</td>
                  <td className="hidden whitespace-nowrap lg:table-cell">
                    {r.tni ? (
                      <>
                        <span className="num">{formatDateTime(r.tni.updatedAt)}</span>
                        {r.tni.updatedBy && <div className="muted text-xs">by {r.tni.updatedBy.name}</div>}
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {r.editBlock === null && !r.tni ? (
                      <Link href={`/tni/${r.department.id}/edit`} className="btn btn-primary btn-sm">
                        <Plus size={14} aria-hidden /> Fill in
                      </Link>
                    ) : r.tni ? (
                      <Link href={href} className="btn btn-sm">
                        Open <ArrowRight size={14} aria-hidden />
                      </Link>
                    ) : null}
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No departments to show.</div>}
      </div>
    </div>
  );
}
