import ExcelJS from "exceljs";
import { formatDateRange, nowInMalaysia } from "@/lib/format";
import { ATTENDANCE_LABELS } from "@/lib/validation/participant";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { TRAINING_PHASE_LABELS } from "@/server/rules/training";
import { auditReportForExport, departmentHoursReport, staffHoursReport, trainingAttendanceDetail, trainingAttendanceReport } from "@/server/services/report";
import { getCurrentUser } from "@/server/session";
import { parseReportFilters } from "../filters";

type Column = { header: string; key: string; width: number; numFmt?: string };
type Row = Record<string, string | number | Date | null>;

const HOURS = "0.##";
const DATE = "dd/mm/yyyy";
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const periodLine = (p: { from: string; to: string }) => `Trainings that started ${formatDateRange(day(p.from), day(p.to))}`;

/** A sheet with a title, a line saying what it covers, the table from row 4, and an optional totals row. */
function sheet(wb: ExcelJS.Workbook, name: string, title: string, covers: string, columns: Column[], rows: Row[], total?: Row) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = columns.map(({ key, width, numFmt }) => ({ key, width, style: numFmt ? { numFmt } : undefined }));
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = covers;
  const header = ws.getRow(4);
  columns.forEach((c, i) => (header.getCell(i + 1).value = c.header));
  header.font = { bold: true };
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
  rows.forEach((r, i) => ws.addRow({ no: i + 1, ...r }));
  if (total && rows.length) ws.addRow(total).font = { bold: true };
  return ws;
}

/**
 * The Excel file of a report, as filtered on screen: ?report=staff-hours |
 * department-hours | attendance | audit, plus the page's filters. With
 * ?training=ID, the attendance report gives that training's participants.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "report.view")) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const report = url.searchParams.get("report");
  const f = parseReportFilters(Object.fromEntries(url.searchParams));
  const today = nowInMalaysia();
  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  let name: string;

  if (report === "staff-hours") {
    const { period, rows, total } = await staffHoursReport(user, f, today);
    name = "staff hours";
    sheet(
      wb,
      "Staff hours",
      "Staff hours",
      periodLine(period),
      [
        { header: "No", key: "no", width: 6 },
        { header: "Staff No", key: "staffNo", width: 11 },
        { header: "Name", key: "name", width: 34 },
        { header: "Designation", key: "designation", width: 15 },
        { header: "Status", key: "status", width: 10 },
        { header: "Division", key: "division", width: 24 },
        { header: "Department", key: "department", width: 28 },
        { header: "Section", key: "section", width: 20 },
        { header: "Trainings Completed", key: "completed", width: 19 },
        { header: "Total Hours", key: "hours", width: 12, numFmt: HOURS },
      ],
      rows.map((r) => ({
        staffNo: r.staffNo,
        name: r.name,
        designation: DESIGNATION_LABELS[r.designation],
        status: r.status === "ACTIVE" ? "Active" : "Resigned",
        division: r.department.division.name,
        department: r.department.name,
        section: r.section?.name ?? "",
        completed: r.completed,
        hours: r.hours,
      })),
      { name: "Total", completed: total.completed, hours: total.hours },
    );
  } else if (report === "department-hours") {
    const { period, rows, total } = await departmentHoursReport(user, f, today);
    name = "department hours";
    sheet(
      wb,
      "Department hours",
      "Department hours",
      `${periodLine(period)}. Headcount: active staff, not counting trainees. Average: total hours ÷ headcount.`,
      [
        { header: "No", key: "no", width: 6 },
        { header: "Division", key: "division", width: 24 },
        { header: "Department", key: "department", width: 30 },
        { header: "Head of Department", key: "hod", width: 30 },
        { header: "Headcount", key: "headcount", width: 11 },
        { header: "Staff Trained", key: "trained", width: 13 },
        { header: "Trainings Completed", key: "completed", width: 19 },
        { header: "Total Hours", key: "hours", width: 12, numFmt: HOURS },
        { header: "Average Per Head", key: "average", width: 16, numFmt: HOURS },
      ],
      rows.map((r) => ({
        division: r.division.name,
        department: r.name,
        hod: r.hod?.name ?? "",
        headcount: r.headcount,
        trained: r.trained,
        completed: r.completed,
        hours: r.hours,
        average: r.average,
      })),
      { department: "Total", headcount: total.headcount, trained: total.trained, completed: total.completed, hours: total.hours, average: total.average },
    );
  } else if (report === "attendance" && url.searchParams.has("training")) {
    const id = Number(url.searchParams.get("training"));
    const data = Number.isInteger(id) ? await trainingAttendanceDetail(user, id, today) : null;
    if (!data) return new Response("Not found", { status: 404 });
    const { training: t, rows, total } = data;
    name = `attendance ${t.trainingCode}`;
    sheet(
      wb,
      "Participants",
      `${t.title} (${t.trainingCode})`,
      `${formatDateRange(t.startDate, t.endDate)} · ${TRAINING_PHASE_LABELS[t.phase]} · Certificate: ${t.hasCertificate ? "Yes" : "No"}`,
      [
        { header: "No", key: "no", width: 6 },
        { header: "Staff No", key: "staffNo", width: 11 },
        { header: "Name", key: "name", width: 34 },
        { header: "Designation", key: "designation", width: 15 },
        { header: "Department", key: "department", width: 28 },
        { header: "Section", key: "section", width: 20 },
        { header: "Attendance", key: "attendance", width: 12 },
        { header: "Reason", key: "reason", width: 34 },
        { header: "Feedback Given", key: "feedback", width: 15, numFmt: DATE },
        { header: "Hours", key: "hours", width: 8, numFmt: HOURS },
      ],
      rows.map((r) => ({
        staffNo: r.staff.staffNo,
        name: r.staff.name,
        designation: DESIGNATION_LABELS[r.staff.designation],
        department: r.staff.department.name,
        section: r.staff.section?.name ?? "",
        attendance: ATTENDANCE_LABELS[r.attendance],
        reason: r.attendanceReason ?? "",
        feedback: r.submittedAt,
        hours: r.hours,
      })),
      { name: "Total", attendance: `${total.completed} of ${total.total} completed`, hours: total.hours },
    );
  } else if (report === "attendance") {
    const { period, rows, total } = await trainingAttendanceReport(user, f, today);
    name = "training attendance";
    sheet(
      wb,
      "Training attendance",
      "Training attendance",
      periodLine(period),
      [
        { header: "No", key: "no", width: 6 },
        { header: "Training Code", key: "code", width: 19 },
        { header: "Title", key: "title", width: 44 },
        { header: "Type", key: "type", width: 18 },
        { header: "Start Date", key: "startDate", width: 12, numFmt: DATE },
        { header: "End Date", key: "endDate", width: 12, numFmt: DATE },
        { header: "Hours", key: "hours", width: 8, numFmt: HOURS },
        { header: "Participants", key: "total", width: 13 },
        { header: "Completed", key: "completed", width: 11 },
        { header: "Pending", key: "pending", width: 9 },
        { header: "Absent", key: "absent", width: 9 },
        { header: "Total Man Hours", key: "manHours", width: 16, numFmt: HOURS },
        { header: "Certificate", key: "certificate", width: 12 },
        { header: "Status", key: "status", width: 12 },
      ],
      rows.map((t) => ({
        code: t.trainingCode,
        title: t.title,
        type: TRAINING_TYPE_LABELS[t.type],
        startDate: t.startDate,
        endDate: t.endDate,
        hours: t.hours,
        total: t.total,
        completed: t.completed,
        pending: t.pending,
        absent: t.absent,
        manHours: t.manHours,
        certificate: t.hasCertificate ? "Yes" : "No",
        status: TRAINING_PHASE_LABELS[t.phase],
      })),
      { title: "Total", total: total.total, completed: total.completed, pending: total.pending, absent: total.absent, manHours: total.manHours },
    );
  } else if (report === "audit") {
    const { period, rows } = await auditReportForExport(user, f, today);
    name = "audit report";
    sheet(
      wb,
      "Audit report",
      "Training audit report",
      `${periodLine(period)}. One line per person per training. Hours: the training's hours when completed (none if cancelled).`,
      [
        { header: "No", key: "no", width: 6 },
        { header: "Training Code", key: "code", width: 19 },
        { header: "Title", key: "title", width: 44 },
        { header: "Type", key: "type", width: 18 },
        { header: "Start Date", key: "startDate", width: 12, numFmt: DATE },
        { header: "End Date", key: "endDate", width: 12, numFmt: DATE },
        { header: "Venue", key: "venue", width: 24 },
        { header: "Trainer", key: "trainer", width: 28 },
        { header: "Training Status", key: "status", width: 15 },
        { header: "Staff No", key: "staffNo", width: 11 },
        { header: "Name", key: "name", width: 34 },
        { header: "Designation", key: "designation", width: 15 },
        { header: "Department", key: "department", width: 28 },
        { header: "Attendance", key: "attendance", width: 12 },
        { header: "Reason", key: "reason", width: 34 },
        { header: "Feedback Given", key: "feedback", width: 15, numFmt: DATE },
        { header: "Hours", key: "hours", width: 8, numFmt: HOURS },
        { header: "Certificate", key: "certificate", width: 12 },
      ],
      rows.map((r) => ({
        code: r.training.trainingCode,
        title: r.training.title,
        type: TRAINING_TYPE_LABELS[r.training.type],
        startDate: r.training.startDate,
        endDate: r.training.endDate,
        venue: r.training.venue ?? "",
        trainer: r.training.trainerName ?? "",
        status: TRAINING_PHASE_LABELS[r.training.phase],
        staffNo: r.staff.staffNo,
        name: r.staff.name,
        designation: DESIGNATION_LABELS[r.staff.designation],
        department: r.staff.department.name,
        attendance: ATTENDANCE_LABELS[r.attendance],
        reason: r.attendanceReason ?? "",
        feedback: r.submittedAt,
        hours: r.hours,
        certificate: r.certificate ? "Yes" : "No",
      })),
    );
  } else {
    return new Response("Not found", { status: 404 });
  }

  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS ${name} ${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
