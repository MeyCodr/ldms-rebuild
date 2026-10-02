import ExcelJS from "exceljs";
import { formatTime } from "@/lib/format";
import { TRAINING_FUNCTION_LABELS, TRAINING_PLATFORM_LABELS, TRAINING_PROGRAM_LABELS, TRAINING_TYPE_LABELS } from "@/lib/validation/training";
import { can } from "@/server/permissions";
import { listTrainingsForExport } from "@/server/services/training";
import { getCurrentUser } from "@/server/session";
import { parseTrainingFilters } from "../filters";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "training.view")) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const filters = parseTrainingFilters(Object.fromEntries(url.searchParams));
  const rows = await listTrainingsForExport(user, filters);

  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet("Trainings", { views: [{ state: "frozen", ySplit: 1 }] });
  // The training code, the fields on the training form in its order, then the figures LDMS works out.
  ws.columns = [
    { header: "Training Code", key: "code", width: 19 },
    { header: "Type", key: "type", width: 18 },
    { header: "Title", key: "title", width: 44 },
    { header: "Venue", key: "venue", width: 24 },
    { header: "Cost (RM)", key: "cost", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "HRDC", key: "hrdf", width: 8 },
    { header: "Platform", key: "platform", width: 11 },
    { header: "Function", key: "function", width: 22 },
    { header: "Start Date", key: "startDate", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "End Date", key: "endDate", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Start Time", key: "startTime", width: 11 },
    { header: "End Time", key: "endTime", width: 11 },
    { header: "Program", key: "program", width: 36 },
    { header: "Trainer", key: "trainer", width: 28 },
    { header: "Total Days", key: "days", width: 10 },
    { header: "Hours", key: "hours", width: 9, style: { numFmt: "0.##" } },
    { header: "Participants", key: "participants", width: 13 },
    { header: "Completed", key: "completed", width: 11 },
    { header: "Total Man Hours", key: "manHours", width: 16, style: { numFmt: "0.##" } },
    { header: "Status", key: "status", width: 11 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: "A1", to: "T1" };
  for (const t of rows) {
    ws.addRow({
      code: t.trainingCode,
      type: TRAINING_TYPE_LABELS[t.type],
      title: t.title,
      venue: t.venue ?? "",
      cost: t.cost === null ? null : Number(t.cost.toString()),
      hrdf: t.hrdfClaimable ? "Yes" : "No",
      platform: t.platform ? TRAINING_PLATFORM_LABELS[t.platform] : "",
      function: t.function ? TRAINING_FUNCTION_LABELS[t.function] : "",
      startDate: t.startDate,
      endDate: t.endDate,
      startTime: formatTime(t.startTime),
      endTime: formatTime(t.endTime),
      program: t.program ? TRAINING_PROGRAM_LABELS[t.program] : "",
      trainer: t.trainerName ?? "",
      days: t.days,
      hours: t.hours,
      participants: t.participantCount,
      completed: t.completedCount,
      manHours: t.manHours,
      status: t.status === "CANCELLED" ? "Cancelled" : "Scheduled",
    });
  }

  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS trainings ${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
