import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatDateRange, formatHours, nowInMalaysia, plural } from "@/lib/format";
import { TRAINING_TYPE_SHORT_LABELS } from "@/lib/validation/training";
import { reportDepartments, trainingAttendanceReport } from "@/server/services/report";
import { requirePermission } from "@/server/session";
import { PhaseStatus } from "../../trainings/PhaseStatus";
import { parseReportFilters, reportQuery } from "../filters";
import { ExportLink, PeriodLabel, ReportFilterBar, ReportTabs } from "../ReportParts";

export const metadata: Metadata = { title: "Training attendance" };

const count = (n: number) => (n ? n : <span className="muted">0</span>);

/** Each training that started in the period, with how its participants did. A row opens its participants. */
export default async function TrainingAttendancePage({ searchParams }: PageProps<"/reports/attendance">) {
  const user = await requirePermission("report.view");
  const f = parseReportFilters(await searchParams);
  const [{ period, rows, total }, departments] = await Promise.all([trainingAttendanceReport(user, f, nowInMalaysia()), reportDepartments(user)]);
  // The participants page keeps the filters, so its Back link returns to this list as filtered.
  const detail = (id: number) => `/reports/attendance/${id}${reportQuery(f, { page: undefined })}`;

  return (
    <div className="page-fit">
      <PageHeader
        module="reports"
        context="Records"
        title="Reports"
        meta={
          <>
            <span>{plural(total.trainings, "training")}</span>
            <span>
              {total.completed} of {total.total} completed
            </span>
            <span className="num">{formatHours(total.manHours)} man hours</span>
            <PeriodLabel period={period} />
          </>
        }
        actions={<ExportLink report="attendance" f={f} />}
      />
      <ReportTabs current="attendance" f={f} />
      <ReportFilterBar report="attendance" f={f} period={period} departments={departments} search="Code or title" type department />

      <div className="table-scroll card mt-4">
        <table className="table min-w-[900px]" aria-label="Training attendance">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="hidden w-px whitespace-nowrap lg:table-cell">Training code</th>
              <th className="w-px whitespace-nowrap">Dates</th>
              <th>Training</th>
              <th className="hidden md:table-cell">Type</th>
              <th className="w-px text-right whitespace-nowrap" title="Hours per participant">
                Hours
              </th>
              <th className="w-px text-right whitespace-nowrap">Participants</th>
              <th className="w-px text-right whitespace-nowrap">Completed</th>
              <th className="w-px text-right whitespace-nowrap">Pending</th>
              <th className="w-px text-right whitespace-nowrap">Absent</th>
              <th className="w-px text-right whitespace-nowrap" title="Hours × participants who completed it">
                Man hours
              </th>
              <th className="hidden w-px whitespace-nowrap lg:table-cell">Certificate</th>
              <th className="w-px whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <ClickableRow key={t.id} href={detail(t.id)}>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num hidden whitespace-nowrap lg:table-cell">{t.trainingCode}</td>
                <td className="num whitespace-nowrap">{formatDateRange(t.startDate, t.endDate)}</td>
                <td>
                  <Link
                    href={detail(t.id)}
                    className={`font-medium text-ink hover:text-accent hover:underline ${t.status === "CANCELLED" ? "line-through decoration-ink-3" : ""}`}
                  >
                    {t.title}
                  </Link>
                </td>
                <td className="hidden md:table-cell">
                  <span className="tag">{TRAINING_TYPE_SHORT_LABELS[t.type]}</span>
                </td>
                <td className="num text-right">{formatHours(t.hours)}</td>
                <td className="num text-right">{count(t.total)}</td>
                <td className="num text-right">{count(t.completed)}</td>
                <td className="num text-right">{count(t.pending)}</td>
                <td className="num text-right">{count(t.absent)}</td>
                <td className={`num text-right whitespace-nowrap ${t.manHours ? "font-medium" : "muted"}`}>{formatHours(t.manHours)}</td>
                <td className="hidden lg:table-cell">
                  {t.hasCertificate ? (
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <FileCheck size={14} aria-hidden className="text-ok" /> Yes
                    </span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td>
                  <PhaseStatus phase={t.phase} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td className="hidden lg:table-cell" />
                <td colSpan={2}>Total</td>
                <td className="hidden md:table-cell" />
                <td />
                <td className="num text-right">{total.total}</td>
                <td className="num text-right">{total.completed}</td>
                <td className="num text-right">{total.pending}</td>
                <td className="num text-right">{total.absent}</td>
                <td className="num text-right whitespace-nowrap">{formatHours(total.manHours)}</td>
                <td className="hidden lg:table-cell" />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No trainings started in this period match these filters.</div>}
      </div>
    </div>
  );
}
