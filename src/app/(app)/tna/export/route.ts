import ExcelJS from "exceljs";
import { monthLabel, TNA_METHOD_LABELS, tnaGap, tnaSectionTitle } from "@/lib/forms/tna";
import { nowInMalaysia } from "@/lib/format";
import { can } from "@/server/permissions";
import { parseTnaYear, TNA_STAGE_LABELS } from "@/server/rules/tna";
import { tnaExportRows, tnaOpen } from "@/server/services/tna";
import { getCurrentUser } from "@/server/session";

/** Every row of every TNA of a year (individual and by job grade, at any status), one row per training need. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!can(user, "tna.manage")) return new Response("Forbidden", { status: 403 });

  const year = parseTnaYear(new URL(request.url).searchParams.get("year") ?? undefined) ?? (await tnaOpen(nowInMalaysia()));
  const rows = await tnaExportRows(user, year);

  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet(`TNA ${year}`, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Department", key: "department", width: 30 },
    { header: "Kind", key: "kind", width: 13 },
    { header: "Staff No", key: "staffNo", width: 11 },
    { header: "Name", key: "name", width: 32 },
    { header: "Job Grade", key: "grade", width: 10 },
    { header: "Status", key: "status", width: 17 },
    { header: "Heading", key: "section", width: 38 },
    { header: "Problem Statement", key: "problem", width: 60 },
    { header: "Training Required", key: "training", width: 55 },
    { header: "Others (typed in)", key: "others", width: 16 },
    { header: "Target", key: "target", width: 8 },
    { header: "Current", key: "current", width: 8 },
    { header: "Gap", key: "gap", width: 6 },
    { header: "How", key: "method", width: 20 },
    { header: "When", key: "month", width: 8 },
    { header: "Approved By", key: "approvedBy", width: 28 },
    { header: "Approved On", key: "approvedAt", width: 13, style: { numFmt: "dd/mm/yyyy" } },
  ];
  ws.getRow(1).font = { bold: true };
  for (const { tna, department, stage, item } of rows)
    ws.addRow({
      department,
      kind: tna.staff ? "Individual" : "By job grade",
      staffNo: tna.staff?.staffNo ?? "",
      name: tna.staff?.name ?? "",
      grade: tna.jobGrade ?? "",
      status: TNA_STAGE_LABELS[stage],
      section: tnaSectionTitle(item.section),
      problem: item.problem,
      training: item.trainingName,
      others: item.trainingName && item.optionId === null ? "Yes" : "",
      target: item.targetSkill ?? "",
      current: item.currentSkill ?? "",
      gap: tnaGap(item.targetSkill, item.currentSkill) ?? "",
      method: item.method ? TNA_METHOD_LABELS[item.method] : "",
      month: item.month ? monthLabel(item.month) : "",
      approvedBy: tna.approvedBy?.name ?? "",
      approvedAt: tna.approvedAt ?? "",
    });
  ws.autoFilter = { from: "A1", to: `Q${Math.max(2, rows.length + 1)}` };

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS TNA ${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
