import type { Metadata } from "next";
import Link from "next/link";
import { DivisionMark } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatHours, nowInMalaysia, plural } from "@/lib/format";
import { divisionTone } from "@/lib/tones";
import { departmentHoursReport, reportDepartments } from "@/server/services/report";
import { requirePermission } from "@/server/session";
import { parseReportFilters, reportQuery } from "../filters";
import { ExportLink, PeriodLabel, ReportFilterBar, ReportTabs } from "../ReportParts";

export const metadata: Metadata = { title: "Department hours" };

const average = (a: number | null) => (a === null ? <span className="muted">–</span> : formatHours(a));

/** Each department's headcount, training hours and average hours per head in the period. */
export default async function DepartmentHoursPage({ searchParams }: PageProps<"/reports/department-hours">) {
  const user = await requirePermission("report.view");
  const f = parseReportFilters(await searchParams);
  const [{ period, rows, total }, departments] = await Promise.all([departmentHoursReport(user, f, nowInMalaysia()), reportDepartments(user)]);
  // A department's row opens its staff in the staff hours report, for the same period.
  const staffOf = (departmentId: number) => `/reports/staff-hours${reportQuery({ from: f.from, to: f.to, departmentId })}`;

  return (
    <div className="page-fit">
      <PageHeader
        module="reports"
        context="Records"
        title="Reports"
        meta={
          <>
            <span>{plural(rows.length, "department")}</span>
            <span>headcount {total.headcount}</span>
            <span className="num">{formatHours(total.hours)}</span>
            <PeriodLabel period={period} />
          </>
        }
        actions={<ExportLink report="department-hours" f={f} />}
      />
      <ReportTabs current="department-hours" f={f} />
      <ReportFilterBar report="department-hours" f={f} period={period} departments={departments} division />

      <div className="table-scroll card mt-4">
        <table className="table min-w-[820px]" aria-label="Department hours">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th>Department</th>
              <th className="hidden md:table-cell">Head of department</th>
              <th className="w-px text-right whitespace-nowrap" title="Active staff, not counting trainees">
                Headcount
              </th>
              <th className="w-px text-right whitespace-nowrap" title="Of the headcount, how many completed at least one training">
                Staff trained
              </th>
              <th className="w-px text-right whitespace-nowrap">Trainings completed</th>
              <th className="w-px text-right whitespace-nowrap">Total hours</th>
              <th className="w-px text-right whitespace-nowrap" title="Total hours ÷ headcount">
                Average per head
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ClickableRow key={r.id} href={staffOf(r.id)}>
                <td className="num muted text-right">{i + 1}</td>
                <td>
                  <Link href={staffOf(r.id)} className="inline-flex items-center gap-2 font-medium text-ink hover:text-accent hover:underline">
                    <DivisionMark tone={divisionTone(r.division.id)} />
                    {r.name}
                  </Link>
                  <div className="muted pl-[18px] text-xs">{r.division.name}</div>
                </td>
                <td className="hidden md:table-cell">{r.hod?.name ?? <span className="muted">No HOD</span>}</td>
                <td className="num text-right">{r.headcount}</td>
                <td className="num text-right">
                  {r.trained}
                  {r.headcount > 0 && <span className="muted"> · {Math.round((r.trained / r.headcount) * 100)}%</span>}
                </td>
                <td className={`num text-right ${r.completed ? "" : "muted"}`}>{r.completed}</td>
                <td className={`num text-right ${r.hours ? "" : "muted"}`}>{formatHours(r.hours)}</td>
                <td className="num text-right font-medium">{average(r.average)}</td>
              </ClickableRow>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td>Total</td>
                <td className="hidden md:table-cell" />
                <td className="num text-right">{total.headcount}</td>
                <td className="num text-right">
                  {total.trained}
                  {total.headcount > 0 && <span className="muted"> · {Math.round((total.trained / total.headcount) * 100)}%</span>}
                </td>
                <td className="num text-right">{total.completed}</td>
                <td className="num text-right">{formatHours(total.hours)}</td>
                <td className="num text-right">{average(total.average)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No departments match these filters.</div>}
      </div>
    </div>
  );
}
