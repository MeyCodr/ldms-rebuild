import ExcelJS from "exceljs";
import { TNA_METHOD_LABELS, tnaGap } from "@/lib/forms/tna";
import { nowInMalaysia } from "@/lib/format";
import { parseTniYear, seesTnis, tniOpenYear } from "@/server/rules/tni";
import { tniExportRows } from "@/server/services/tni";
import { getCurrentUser } from "@/server/session";

/** A year's TNIs, one row per performance indicator: every department's for L&D, their own for a HOD or division head. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!seesTnis(user)) return new Response("Forbidden", { status: 403 });

  const year = parseTniYear(new URL(request.url).searchParams.get("year") ?? undefined) ?? tniOpenYear(nowInMalaysia());
  const rows = await tniExportRows(user, year);

  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet(`TNI ${year}`, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Department", key: "department", width: 30 },
    { header: "No", key: "no", width: 6 },
    { header: "Performance Indicator", key: "indicator", width: 55 },
    { header: "Expected", key: "expected", width: 10 },
    { header: "Actual", key: "actual", width: 8 },
    { header: "Gap", key: "gap", width: 6 },
    { header: "Possible Causes", key: "causes", width: 45 },
    { header: "Attitude / Skill / Knowledge", key: "ask", width: 26 },
    { header: "L&D Method", key: "method", width: 20 },
    { header: "Evaluation Method", key: "evaluation", width: 35 },
    { header: "Last Saved By", key: "updatedBy", width: 28 },
    { header: "Last Saved On", key: "updatedAt", width: 14, style: { numFmt: "dd/mm/yyyy" } },
  ];
  ws.getRow(1).font = { bold: true };
  for (const { department, no, item, updatedBy, updatedAt } of rows)
    ws.addRow({ department, no, ...item, gap: tnaGap(item.expected, item.actual), method: TNA_METHOD_LABELS[item.method], updatedBy, updatedAt });
  ws.autoFilter = { from: "A1", to: `L${Math.max(2, rows.length + 1)}` };

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS TNI ${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
