import ExcelJS from "exceljs";
import { nowInMalaysia } from "@/lib/format";
import { DESIGNATION_LABELS } from "@/lib/validation/staff";
import {
  parseQuarter,
  quarterLabel,
  quarterMonths,
  seesSkillMatrices,
  SKILL_LEVELS,
  skillLevel,
  skillOpenQuarter,
  type SkillLevel,
} from "@/server/rules/skill";
import { skillChart } from "@/server/services/skill";
import { getCurrentUser } from "@/server/session";

// The old matrix chart's symbols: a circle filled by quarters, full for Highly skilled down to empty.
const SYMBOL: Record<SkillLevel, string> = { 100: "●", 75: "◕", 50: "◑", 25: "◔", 0: "○" };
const thin = { style: "thin", color: { argb: "FFCBD3DB" } } as const;
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F5" } } as const;

/**
 * The matrix chart for one department and quarter, laid out as the old
 * system's chart: one row per person, and a column for each of the five
 * levels holding the topics the person scored at that level (numbered in the
 * order of their matrix, each with its score), then their average.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (user.mustChangePassword) return new Response("Change your password first", { status: 403 });
  if (!seesSkillMatrices(user)) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const quarter = parseQuarter(url.searchParams.get("quarter") ?? undefined) ?? skillOpenQuarter(nowInMalaysia());
  const departmentId = Number(url.searchParams.get("department"));
  const chart = Number.isInteger(departmentId) && departmentId > 0 ? await skillChart(user, departmentId, quarter) : null;
  if (!chart) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet("Matrix chart", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.getCell("A1").value = `Skill matrix chart: ${chart.department.name}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value =
    `${quarterLabel(quarter)} (${quarterMonths(quarter)}) · submitted and approved matrices · each topic is listed under the level it scored`;

  const fixed = ["No", "Staff No", "Name", "Designation / Grade"];
  const levels = SKILL_LEVELS.map((l) => `${SYMBOL[l.level]}  ${l.label} (${l.level}%)${l.hint ? `\n${l.hint}` : ""}`);
  const tail = ["Average", "Status", "Evaluated By", "Approved By"];
  const headings = [...fixed, ...levels, ...tail];
  const firstLevel = fixed.length + 1;
  const lastLevel = fixed.length + levels.length;

  // Row 4: the band over the level columns. Row 5: the headings.
  ws.mergeCells(4, firstLevel, 4, lastLevel);
  ws.getCell(4, firstLevel).value = "Ability description";
  ws.getCell(4, lastLevel + 1).value = "Total";
  const band = ws.getRow(4);
  const head = ws.getRow(5);
  headings.forEach((h, i) => {
    head.getCell(i + 1).value = h;
    for (const cell of [band.getCell(i + 1), head.getCell(i + 1)]) {
      cell.font = { bold: true };
      cell.fill = HEAD_FILL;
      cell.border = BORDER;
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    }
  });
  head.height = 34;
  const widths = [5, 11, 30, 20, ...levels.map(() => 40), 10, 16, 26, 26];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  chart.rows.forEach((r, i) => {
    // The person's rated topics, numbered in the order of their matrix, then sorted into the level each scored.
    const topics = r.scores.flatMap((score, j) => (score === null ? [] : [{ name: chart.columns[j].name, score }])).map((t, n) => ({ ...t, no: n + 1 }));
    const under = (level: SkillLevel) =>
      topics
        .filter((t) => skillLevel(t.score) === level)
        .map((t) => `${t.no}. ${t.name}  ${t.score}%`)
        .join("\n");
    const row = ws.addRow([
      i + 1,
      r.staff.staffNo,
      r.staff.name,
      `${DESIGNATION_LABELS[r.staff.designation]}${r.staff.jobGrade !== null ? ` / ${r.staff.jobGrade}` : ""}`,
      ...SKILL_LEVELS.map((l) => under(l.level)),
      r.average,
      r.status === "APPROVED" ? "Approved" : "Waiting for HOD",
      r.evaluatedBy ?? "",
      r.approvedBy ?? "",
    ]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > headings.length) return;
      cell.border = BORDER;
      cell.alignment = { wrapText: true, vertical: "top", horizontal: col >= firstLevel && col <= lastLevel ? "left" : col === 3 ? "left" : "center" };
    });
    const average = row.getCell(lastLevel + 1);
    average.numFmt = '0"%"';
    average.font = { bold: true };
  });

  const safe = chart.department.name.replace(/[^\w\s()&.-]/g, "").trim() || "department";
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LDMS skill matrix - ${safe} ${quarterLabel(quarter)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
