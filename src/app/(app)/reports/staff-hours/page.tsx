import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { StaffStatus } from "@/components/ui/Status";
import { formatHours, nowInMalaysia, plural } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can } from "@/server/permissions";
import { reportDepartments, staffHoursReport } from "@/server/services/report";
import { requirePermission } from "@/server/session";
import { parseReportFilters } from "../filters";
import { ExportLink, PeriodLabel, ReportFilterBar, ReportTabs } from "../ReportParts";

export const metadata: Metadata = { title: "Staff hours" };

/** Each staff member's completed trainings and hours in the period. */
export default async function StaffHoursPage({ searchParams }: PageProps<"/reports/staff-hours">) {
  const user = await requirePermission("report.view");
  const f = parseReportFilters(await searchParams);
  const [{ period, rows, total }, departments] = await Promise.all([staffHoursReport(user, f, nowInMalaysia()), reportDepartments(user)]);
  const openStaff = can(user, "staff.view");

  return (
    <div className="page-fit">
      <PageHeader
        module="reports"
        context="Records"
        title="Reports"
        meta={
          <>
            <span>{plural(total.staff, "staff member")}</span>
            <span>{total.trained} with training</span>
            <span className="num">{formatHours(total.hours)}</span>
            <PeriodLabel period={period} />
          </>
        }
        actions={<ExportLink report="staff-hours" f={f} />}
      />
      <ReportTabs current="staff-hours" f={f} />
      <ReportFilterBar report="staff-hours" f={f} period={period} departments={departments} search="Name or staff no." division department show />

      <div className="table-scroll card mt-4">
        <table className="table min-w-[760px]" aria-label="Staff hours">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap">Staff no.</th>
              <th>Name</th>
              <th className="hidden md:table-cell">Designation</th>
              <th>Department</th>
              <th className="w-px text-right whitespace-nowrap" title="Trainings completed that started in the period">
                Trainings completed
              </th>
              <th className="w-px text-right whitespace-nowrap" title="Hours of those trainings">
                Total hours
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ClickableRow key={r.id} href={openStaff ? `/staff/${r.id}` : null}>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num whitespace-nowrap">{r.staffNo}</td>
                <td>
                  {openStaff ? (
                    <Link href={`/staff/${r.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                  {r.status !== "ACTIVE" && (
                    <span className="ml-2 align-middle">
                      <StaffStatus status={r.status} />
                    </span>
                  )}
                </td>
                <td className="hidden md:table-cell">{DESIGNATION_LABELS[r.designation]}</td>
                <td>
                  {r.department.name}
                  {r.section && <div className="muted text-xs">{r.section.name}</div>}
                </td>
                <td className={`num text-right ${r.completed ? "" : "muted"}`}>{r.completed}</td>
                <td className={`num text-right ${r.hours ? "font-medium" : "muted"}`}>{formatHours(r.hours)}</td>
              </ClickableRow>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td colSpan={2}>Total</td>
                <td className="hidden md:table-cell" />
                <td />
                <td className="num text-right">{total.completed}</td>
                <td className="num text-right">{formatHours(total.hours)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No staff match these filters.</div>}
      </div>
    </div>
  );
}
