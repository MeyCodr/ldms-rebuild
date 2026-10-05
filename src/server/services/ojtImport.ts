import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { OJT_V1 } from "@/lib/forms/feedback";
import { formatDateRange, plural } from "@/lib/format";
import { OJT_TRAINER_PROGRAM } from "@/lib/validation/training";
import { db } from "../db";
import { UserError } from "../errors";
import { isAdmin, type SessionUser } from "../permissions";
import {
  checkOjtImportRow,
  headingKey,
  OJT_IMPORT_COLUMNS,
  ojtEntryAttendance,
  ojtGroupKey,
  ojtStaffBlock,
  type OjtImportColumn,
  type OjtImportRow,
} from "../rules/ojt";
import { recordAudit } from "./audit";
import { ensure } from "./org";
import { newTrainingCode } from "./training";

// The OJT Excel import, laid out like the clerks' template (one row per
// participant; rows describing the same OJT share one training). Nothing is
// imported until every row is right, as the template's instructions say.

const MAX_ROWS = 2000;
/** The columns a file must have; the three answer columns may be left out. */
const REQUIRED: OjtImportColumn[] = OJT_IMPORT_COLUMNS.slice(0, 9);
const DATE_COLUMNS: OjtImportColumn[] = ["Start Date", "End Date"];
const TIME_COLUMNS: OjtImportColumn[] = ["Start Time", "End Time"];

export type OjtImportResultRow = {
  /** The row in the Excel file. */
  row: number;
  staffNo: string;
  /** The staff member's name in LDMS, once found. */
  name: string;
  title: string;
  dates: string;
  /** Which OJT in the file the row belongs to (1, 2, …), when the row is valid. */
  ojt: number | null;
  result: "COMPLETED" | "PENDING" | "error";
  errors: string[];
};

export type OjtImportPreview = {
  fileName: string;
  rows: OjtImportResultRow[];
  counts: { ojt: number; completed: number; pending: number; error: number };
};

const pad = (n: number) => String(n).padStart(2, "0");

/** A cell as text. Dates and times Excel stored as numbers or dates become YYYY-MM-DD and HH:MM. */
function cellText(value: ExcelJS.CellValue, column: OjtImportColumn): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (TIME_COLUMNS.includes(column)) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (TIME_COLUMNS.includes(column) && value >= 0 && value < 1) {
      const minutes = Math.round(value * 1440);
      return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }
    // An Excel serial date (days since 1899-12-30).
    if (DATE_COLUMNS.includes(column) && value > 1) return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
    return String(value);
  }
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText
        .map((r) => r.text)
        .join("")
        .trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue, column);
    return "";
  }
  return String(value).trim();
}

type Parsed = { row: number; raw: Record<OjtImportColumn, string>; value?: OjtImportRow; errors: string[] };

async function readRows(buffer: ArrayBuffer, today: Date): Promise<Parsed[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    throw new UserError("That file could not be read. Save it as an Excel workbook (.xlsx) and try again.");
  }
  // The template's data sheet, or else the first sheet.
  const sheet = wb.getWorksheet("OJT Import") ?? wb.worksheets[0];
  if (!sheet) throw new UserError("The workbook has no sheets.");

  const header = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => header.set(headingKey(cellText(cell.value, "Title")), col));
  const missing = REQUIRED.filter((c) => !header.has(headingKey(c)));
  if (missing.length) throw new UserError(`Row 1 must have these column headings: ${missing.join(", ")}. Download the template to see the layout.`);
  if (sheet.actualRowCount - 1 > MAX_ROWS) throw new UserError(`Import at most ${MAX_ROWS} rows at a time.`);

  const parsed: Parsed[] = [];
  sheet.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = Object.fromEntries(
      OJT_IMPORT_COLUMNS.map((c) => {
        const idx = header.get(headingKey(c));
        return [c, idx ? cellText(r.getCell(idx).value, c) : ""];
      }),
    ) as Record<OjtImportColumn, string>;
    if (Object.values(raw).every((v) => !v)) return;
    const { row, errors } = checkOjtImportRow(raw, today);
    // The template's grey example rows: their staff nos. aren't real, and the clerk is told to delete them.
    if (/^\(EXAMPLE\)/i.test(raw.Title)) errors.unshift("This is one of the template's example rows: delete it before importing");
    parsed.push({ row: rowNumber, raw, value: errors.length ? undefined : row, errors });
  });
  if (!parsed.length) throw new UserError("The sheet has no data rows under the headings.");
  return parsed;
}

const staffSelect = {
  id: true,
  staffNo: true,
  name: true,
  status: true,
  designation: true,
  departmentId: true,
  roles: { select: { role: true } },
  hodOf: { select: { id: true } },
  headOf: { select: { id: true } },
} satisfies Prisma.StaffSelect;

/** Reads the file and works out, row by row, what importing it would do. */
async function plan(user: SessionUser, buffer: ArrayBuffer, today: Date) {
  ensure(user, "ojt.manage");
  const parsed = await readRows(buffer, today);
  const staffNos = [...new Set(parsed.map((p) => p.raw["Participant Staff No"].trim().toUpperCase()).filter(Boolean))];
  const staff = await db.staff.findMany({ where: { staffNo: { in: staffNos } }, select: staffSelect });
  const byNo = new Map(staff.map((s) => [s.staffNo.toUpperCase(), s]));

  // OJT already in LDMS for the same people, so importing a file twice doesn't record it twice.
  const titles = [...new Set(parsed.flatMap((p) => (p.value ? [p.value.title] : [])))];
  const existing = titles.length
    ? await db.participant.findMany({
        where: { staffId: { in: staff.map((s) => s.id) }, training: { type: "OJT", title: { in: titles } } },
        select: { staffId: true, training: { select: { title: true, trainingCode: true, startDate: true, endDate: true } } },
      })
    : [];
  const alreadyKey = (staffId: number, title: string, start: string, end: string) => `${staffId}\u0000${title}\u0000${start}\u0000${end}`;
  const already = new Map(
    existing.map((e) => [
      alreadyKey(e.staffId, e.training.title, e.training.startDate.toISOString().slice(0, 10), e.training.endDate.toISOString().slice(0, 10)),
      e.training.trainingCode,
    ]),
  );

  const groups = new Map<string, number>();
  const seenInGroup = new Map<string, number>();
  return parsed.map((p) => {
    const errors = [...p.errors];
    const staffNo = p.raw["Participant Staff No"].trim().toUpperCase();
    const person = staffNo ? byNo.get(staffNo) : undefined;
    if (staffNo && !person) errors.push(`Staff No ${staffNo} is not in LDMS`);
    if (person) {
      const block = ojtStaffBlock(user, person);
      if (block) errors.push(block);
    }
    let group: number | null = null;
    if (p.value && person) {
      const key = ojtGroupKey(p.value);
      const dupe = seenInGroup.get(`${key}\u0000${person.id}`);
      if (dupe) errors.push(`${person.name} (${person.staffNo}) is already on row ${dupe} for this OJT`);
      else seenInGroup.set(`${key}\u0000${person.id}`, p.row);
      const code = already.get(alreadyKey(person.id, p.value.title, p.value.startDate, p.value.endDate));
      if (code) errors.push(`${person.name} (${person.staffNo}) already has this OJT in LDMS (${code})`);
      if (!errors.length) {
        if (!groups.has(key)) groups.set(key, groups.size + 1);
        group = groups.get(key)!;
      }
    }
    const ok = !errors.length && p.value && person;
    return { parsed: p, person, group, attendance: ok ? ojtEntryAttendance(p.value!.hours, p.value!.answers !== null) : null, errors };
  });
}

function datesOf(raw: Record<OjtImportColumn, string>, value?: OjtImportRow) {
  if (value) return formatDateRange(new Date(`${value.startDate}T00:00:00Z`), new Date(`${value.endDate}T00:00:00Z`));
  return [raw["Start Date"], raw["End Date"]].filter(Boolean).join(" – ");
}

export async function previewOjtImport(user: SessionUser, fileName: string, buffer: ArrayBuffer, today: Date): Promise<OjtImportPreview> {
  const planned = await plan(user, buffer, today);
  const rows: OjtImportResultRow[] = planned.map(({ parsed, person, group, attendance, errors }) => ({
    row: parsed.row,
    staffNo: parsed.raw["Participant Staff No"],
    name: person?.name ?? "",
    title: parsed.raw.Title,
    dates: datesOf(parsed.raw, parsed.value),
    ojt: errors.length ? null : group,
    result: errors.length || !attendance ? "error" : attendance,
    errors,
  }));
  const counts = { ojt: new Set(rows.flatMap((r) => (r.ojt ? [r.ojt] : []))).size, completed: 0, pending: 0, error: 0 };
  for (const r of rows) {
    if (r.result === "COMPLETED") counts.completed++;
    else if (r.result === "PENDING") counts.pending++;
    else counts.error++;
  }
  return { fileName, rows, counts };
}

/**
 * Re-reads the same file and saves it, all or nothing: one training per OJT
 * in the file, one participant per row.
 */
export async function commitOjtImport(user: SessionUser, fileName: string, buffer: ArrayBuffer, today: Date) {
  const planned = await plan(user, buffer, today);
  const bad = planned.filter((p) => p.errors.length || !p.parsed.value || !p.person || !p.group);
  if (bad.length)
    throw new UserError(
      `${plural(bad.length, "row")} ${bad.length === 1 ? "has" : "have"} problems, so nothing has been imported. Fix them in the file and choose it again.`,
    );

  const byGroup = new Map<number, typeof planned>();
  for (const p of planned) byGroup.set(p.group!, [...(byGroup.get(p.group!) ?? []), p]);
  const now = new Date();
  const source = "IMPORT" as const;

  return db.$transaction(
    async (tx) => {
      let people = 0;
      for (const rows of byGroup.values()) {
        const first = rows[0].parsed.value!;
        const departments = new Set(rows.map((r) => r.person!.departmentId));
        const training = await tx.training.create({
          data: {
            type: "OJT",
            trainingCode: await newTrainingCode(tx, "OJT"),
            // The template has no training type column: an imported OJT is plain OJT (not coaching or mentoring).
            ojtMethod: "OJT",
            title: first.title,
            venue: first.venue,
            startDate: new Date(`${first.startDate}T00:00:00Z`),
            endDate: new Date(`${first.endDate}T00:00:00Z`),
            startTime: new Date(`1970-01-01T${first.startTime}:00Z`),
            endTime: new Date(`1970-01-01T${first.endTime}:00Z`),
            program: OJT_TRAINER_PROGRAM[first.trainer],
            trainerName: first.trainerName,
            departmentId: departments.size === 1 ? rows[0].person!.departmentId : null,
            createdById: user.id,
          },
        });
        for (const r of rows) {
          const answers = r.parsed.value!.answers;
          await tx.participant.create({
            data: {
              trainingId: training.id,
              staffId: r.person!.id,
              attendance: r.attendance!,
              source,
              recordedById: user.id,
              ...(answers ? { feedback: answers as Prisma.InputJsonObject, feedbackVersion: OJT_V1.version, submittedAt: now } : {}),
            },
          });
        }
        const names = rows.map((r) => `${r.person!.name} (${r.person!.staffNo})`);
        await recordAudit(tx, {
          actorId: user.id,
          action: "CREATE",
          entity: "Training",
          entityId: training.id,
          summary: `Imported OJT ${training.title} (${formatDateRange(training.startDate, training.endDate)}) for ${rows.length === 1 ? names[0] : plural(rows.length, "staff member")} from ${fileName}`,
          changes: rows.length === 1 ? undefined : { staff: [null, names.join(", ")] },
        });
        people += rows.length;
      }
      await recordAudit(tx, {
        actorId: user.id,
        action: "IMPORT",
        entity: "Training",
        entityId: "import",
        summary: `Imported ${fileName}: ${plural(byGroup.size, "OJT", "OJT")} for ${plural(people, "staff record")}${isAdmin(user) ? "" : " (clerk)"}`,
      });
      return { ojt: byGroup.size, people };
    },
    { timeout: 60_000 },
  );
}

// ---------- The template ----------

/** The column headings, with the hints the clerks' template shows. */
const TEMPLATE_HEADINGS: Record<OjtImportColumn, string> = {
  Title: "Title",
  Venue: "Venue",
  "Start Date": "Start Date (YYYY-MM-DD)",
  "End Date": "End Date (YYYY-MM-DD)",
  "Start Time": "Start Time (HH:MM)",
  "End Time": "End Time (HH:MM)",
  "Trainer Type": "Trainer Type",
  "Trainer Name": "Trainer Name",
  "Participant Staff No": "Participant Staff No",
  "What Did You Learn": "What Did You Learn (optional)",
  "Skill Before Training 1-5": "Skill Before Training 1-5 (optional)",
  "Skill After Training 1-5": "Skill After Training 1-5 (optional)",
};
const WIDTHS = [41, 18, 28, 25, 22, 19, 15, 16, 24, 42, 43, 42];
const TEMPLATE_ROWS = 500;

const INSTRUCTIONS = [
  "HOW TO FILL THIS TEMPLATE",
  "",
  "1. One row = one participant, not one training.",
  "   To add a training with several participants, repeat the SAME Title, Venue, Start Date, End Date,",
  "   Start Time, End Time, Trainer Type and Trainer Name on one row per participant - only the",
  "   Participant Staff No changes between those rows. See the two grey example rows on the",
  '   "OJT Import" sheet: they are the SAME training with two different participants.',
  "",
  "2. Title must be entered exactly the same (same spelling/case) on every row that belongs to the",
  "   same training, or the rows will be imported as separate trainings.",
  "",
  "3. Start Date / End Date: format YYYY-MM-DD, e.g. 2026-01-05. The OJT must have ended by the day you import it.",
  "",
  "4. Start Time / End Time: 24-hour format HH:MM, e.g. 08:00 or 17:30.",
  "",
  '5. Trainer Type: choose INTERNAL or EXTERNAL from the dropdown on the "OJT Import" sheet.',
  "",
  "6. Trainer Name: the trainer's name as text (used for both INTERNAL and EXTERNAL trainers).",
  "",
  "7. Participant Staff No must match an existing Staff No already in the system exactly.",
  "   Clerks can import OJT for contract staff only. Any row with a problem (a Staff No that cannot",
  "   be found, a missing value, a wrong date) is shown when you check the file, and nothing in the",
  "   file is imported until every row is fixed - fix the reported rows and re-upload the whole file.",
  "",
  "8. What Did You Learn / Skill Before Training / Skill After Training (columns J-L) are OPTIONAL.",
  "   Leave all three blank if the participant has not done the OJT feedback yet - the OJT will show",
  '   as "Answers due" in their own My Training list, and giving the answers there completes it.',
  "   Fill in all three to import that participant as already COMPLETED, with their feedback recorded -",
  "   this is meant for OJT that already happened and was recorded on paper/elsewhere beforehand.",
  "   Skill Before/After must each be a whole number 1-5 (1 = Poor, 5 = Excellent). You must fill in",
  "   all three columns together or leave all three blank - filling only one or two is rejected.",
  "   OJT of 4 HOURS OR LESS in total (number of days x hours per day): every participant is imported",
  "   as COMPLETED even with J-L left blank - no feedback is needed for a short OJT.",
  "",
  '9. Delete the two grey example rows before uploading. Rows whose Title starts with "(EXAMPLE)"',
  "   are rejected.",
];

/** The clerks' OJT template: the data sheet with two example rows, the Trainer Type options, and instructions. */
export async function buildOjtTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet("OJT Import", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = OJT_IMPORT_COLUMNS.map((c, i) => ({ header: TEMPLATE_HEADINGS[c], width: WIDTHS[i] }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E8FF" } }));
  // Dates and times are typed as text, so Excel doesn't turn them into something else.
  for (const col of [3, 4, 5, 6]) ws.getColumn(col).numFmt = "@";
  const example = ["(EXAMPLE) SAFETY BRIEFING - LINE 1", "ASSEMBLY LINE 1", "2026-01-05", "2026-01-05", "08:00", "13:00", "INTERNAL", "AHMAD BIN ALI"];
  ws.addRow([...example, "A0001", "Lockout-tagout procedure for Line 1", "2", "4"]);
  ws.addRow([...example, "A0002"]);
  for (const r of [2, 3]) ws.getRow(r).font = { italic: true, color: { argb: "FF808080" } };
  for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
    ws.getCell(`G${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ["'Options'!$A$2:$A$3"],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Invalid Value",
      error: "Please select INTERNAL or EXTERNAL from the dropdown list.",
    };
    for (const col of ["K", "L"])
      ws.getCell(`${col}${r}`).dataValidation = {
        type: "whole",
        operator: "between",
        allowBlank: true,
        formulae: [1, 5],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Invalid Value",
        error: "Enter a whole number from 1 to 5, or leave blank.",
      };
  }

  const options = wb.addWorksheet("Options");
  options.getColumn(1).width = 15;
  ["Trainer Type", "INTERNAL", "EXTERNAL"].forEach((v) => options.addRow([v]));
  options.getRow(1).font = { bold: true };

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  INSTRUCTIONS.forEach((line) => notes.addRow([line]));
  notes.getRow(1).font = { bold: true, size: 13 };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
