import ExcelJS from "exceljs";
import { formatDateRange, nowInMalaysia } from "@/lib/format";
import { ATTENDANCE_LABELS } from "@/lib/validation/participant";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import { can } from "@/server/permissions";
import { PME_STAGE_LABELS, pmeStage } from "@/server/rules/pme";
import { participantsForExport } from "@/server/services/participant";
import { getCurrentUser } from "@/server/session";

export async function GET(_request: Request, { params }: RouteContext<"/trainings/[id]/participants/export">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "training.view")) return new Response("Forbidden", { status: 403 });

  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await participantsForExport(user, id) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const { training, rows } = data;
  const today = nowInMalaysia();

  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet("Participants", { views: [{ state: "frozen", ySplit: 3 }] });
  // Which training this is, above the table.
  ws.getCell("A1").value = training.title;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `${formatDateRange(training.startDate, training.endDate)}${training.status === "CANCELLED" ? " · Cancelled: hours don't count" : ""}`;

  const columns = [
    { header: "Staff No", key: "staffNo", width: 11 },
    { header: "Name", key: "name", width: 34 },
    { header: "Designation", key: "designation", width: 15 },
    { header: "Department", key: "department", width: 28 },
    { header: "Section", key: "section", width: 20 },
    { header: "Attendance", key: "attendance", width: 12 },
    { header: "Reason", key: "reason", width: 34 },
    { header: "Feedback Given", key: "feedback", width: 15, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Hours", key: "hours", width: 8, style: { numFmt: "0.##" } },
    { header: "PME", key: "pme", width: 22 },
  ];
  ws.columns = columns.map(({ key, width, style }) => ({ key, width, style }));
  const header = ws.getRow(3);
  columns.forEach((c, i) => (header.getCell(i + 1).value = c.header));
  header.font = { bold: true };
  ws.autoFilter = { from: "A3", to: "J3" };
  for (const p of rows) {
    ws.addRow({
      staffNo: p.staff.staffNo,
      name: p.staff.name,
      designation: DESIGNATION_LABELS[p.staff.designation],
      department: p.staff.department.name,
      section: p.staff.section?.name ?? "",
      attendance: ATTENDANCE_LABELS[p.attendance],
      reason: p.attendanceReason ?? "",
      feedback: p.submittedAt,
      hours: p.hours,
      pme: p.pme ? PME_STAGE_LABELS[pmeStage(p.pme, today)] : "",
    });
  }

  const safeTitle = training.title.replace(/[^\w\s()&.-]/g, "").trim().slice(0, 60) || "training";
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS participants - ${safeTitle}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
