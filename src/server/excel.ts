import "server-only";
import type ExcelJS from "exceljs";

// How every Excel export is laid out: a title, a line saying what it covers,
// the table from row 4 with a filter on its headings, and an optional totals row.

export type Column = { header: string; key: string; width: number; numFmt?: string };
export type Row = Record<string, string | number | Date | null>;

export const HOURS = "0.##";
export const MONEY = "#,##0.00";
export const DATE = "dd/mm/yyyy";

/** Adds a sheet in that layout. Rows are numbered in the `no` column. */
export function sheet(wb: ExcelJS.Workbook, name: string, title: string, covers: string, columns: Column[], rows: Row[], total?: Row) {
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
