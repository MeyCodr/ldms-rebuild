import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { Status } from "@/components/ui/Status";
import { formatDate, formatDateRange, formatHours, nowInMalaysia, plural } from "@/lib/format";
import { ATTENDANCE_LABELS } from "@/lib/validation/participant";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { can, isAdmin } from "@/server/permissions";
import { PME_STAGE_LABELS, PME_STAGE_TONE } from "@/server/rules/pme";
import { trainingAttendanceDetail } from "@/server/services/report";
import { requirePermission } from "@/server/session";
import { PhaseStatus } from "../../../trainings/PhaseStatus";
import { ATTENDANCE_TONE, parseReportFilters, reportQuery } from "../../filters";
import { ExportLink } from "../../ReportParts";

export const metadata: Metadata = { title: "Training attendance" };

/** One training's participants (the user's staff), with attendance and the hours each got. */
export default async function TrainingAttendanceDetailPage({ params, searchParams }: PageProps<"/reports/attendance/[trainingId]">) {
  const user = await requirePermission("report.view");
  const id = Number((await params).trainingId);
  if (!Number.isInteger(id)) notFound();
  const report = await trainingAttendanceDetail(user, id, nowInMalaysia());
  if (!report) notFound();
  const { training: t, rows, total } = report;
  const f = parseReportFilters(await searchParams);
  const openStaff = can(user, "staff.view");
  // The PME column only when someone listed has one.
  const anyPme = rows.some((r) => r.pme);

  return (
    <div className="page-fit">
      <PageHeader
        module="reports"
        context={{ href: `/reports/attendance${reportQuery(f, { page: undefined })}`, label: "Training attendance" }}
        title={t.title}
        meta={
          <>
            <span className="num" title="Training code">
              {t.trainingCode}
            </span>
            <span className="tag">{TRAINING_TYPE_LABELS[t.type]}</span>
            <span className="num">{formatDateRange(t.startDate, t.endDate)}</span>
            <span className="num">{formatHours(t.hours)} each</span>
            <span>Certificate: {t.hasCertificate ? "yes" : "no"}</span>
            <PhaseStatus phase={t.phase} />
          </>
        }
        actions={
          <>
            {can(user, "training.view") && (
              <Link href={`/trainings/${t.id}`} className="btn">
                <ExternalLink size={14} aria-hidden /> Open training
              </Link>
            )}
            <ExportLink report="attendance" f={{}} training={t.id} />
          </>
        }
      />

      <div className="card flex flex-wrap gap-x-8 gap-y-2 px-5 py-3.5 text-[13.5px]">
        <span>
          <span className="num font-semibold">{total.total}</span> <span className="text-ink-2">{total.total === 1 ? "participant" : "participants"}</span>
          {!isAdmin(user) && <span className="text-ink-3"> from your staff</span>}
        </span>
        <Status tone="ok">
          Completed <span className="num font-semibold">{total.completed}</span>
        </Status>
        <Status tone="wait">
          Pending <span className="num font-semibold">{total.pending}</span>
        </Status>
        <Status tone="na">
          Absent <span className="num font-semibold">{total.absent}</span>
        </Status>
        <span className="text-ink-2">
          Hours given <span className="num font-semibold text-ink">{formatHours(total.hours)}</span>
        </span>
      </div>

      <div className="table-scroll card mt-4">
        <table className={`table ${anyPme ? "min-w-[900px]" : "min-w-[760px]"}`} aria-label="Participants">
          <thead>
            <tr>
              <th className="w-px text-right whitespace-nowrap">No.</th>
              <th className="w-px whitespace-nowrap">Staff no.</th>
              <th>Name</th>
              <th className="hidden md:table-cell">Designation</th>
              <th>Department</th>
              <th>Attendance</th>
              <th className="hidden w-px whitespace-nowrap lg:table-cell">Feedback given</th>
              {anyPme && (
                <th className="w-px whitespace-nowrap" title="Performance Monitoring Evaluation, by the person's HOD">
                  PME
                </th>
              )}
              <th className="w-px text-right whitespace-nowrap" title="The training's hours, for those who completed it">
                Hours
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ClickableRow key={r.id} href={openStaff ? `/staff/${r.staff.id}` : null}>
                <td className="num muted text-right">{i + 1}</td>
                <td className="num whitespace-nowrap">{r.staff.staffNo}</td>
                <td>
                  {openStaff ? (
                    <Link href={`/staff/${r.staff.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {r.staff.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.staff.name}</span>
                  )}
                </td>
                <td className="hidden md:table-cell">{DESIGNATION_LABELS[r.staff.designation]}</td>
                <td>
                  {r.staff.department.name}
                  {r.staff.section && <div className="muted text-xs">{r.staff.section.name}</div>}
                </td>
                <td>
                  <Status tone={ATTENDANCE_TONE[r.attendance]}>{ATTENDANCE_LABELS[r.attendance]}</Status>
                  {r.attendanceReason && <div className="muted mt-0.5 max-w-[260px] text-xs break-words">{r.attendanceReason}</div>}
                </td>
                <td className="num hidden whitespace-nowrap lg:table-cell">{r.submittedAt ? formatDate(r.submittedAt) : <span className="muted">–</span>}</td>
                {anyPme && (
                  <td className="whitespace-nowrap">
                    {r.pme ? (
                      <Link href={`/pme/${r.pme.id}`} className="hover:underline">
                        <Status tone={PME_STAGE_TONE[r.pme.stage]}>{PME_STAGE_LABELS[r.pme.stage]}</Status>
                      </Link>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                )}
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
                <td>
                  {total.completed} of {plural(total.total, "participant")} completed
                </td>
                <td className="hidden lg:table-cell" />
                {anyPme && <td />}
                <td className="num text-right">{formatHours(total.hours)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-2">No one is on this training yet.</div>}
      </div>
    </div>
  );
}
