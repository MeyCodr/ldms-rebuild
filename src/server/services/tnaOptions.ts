import "server-only";
import type { Prisma, TnaSection } from "@prisma/client";
import ExcelJS from "exceljs";
import { cleanOptionName, TNA_SECTIONS, tnaSectionLetter, tnaSectionTitle, type TnaSectionKey } from "@/lib/forms/tna";
import { db } from "../db";
import { UserError } from "../errors";
import { can, type SessionUser } from "../permissions";
import { recordAudit } from "./audit";

// The TNA form's "Training required" lists, kept by L&D: options, optionally
// in groups, per section. An option that a saved TNA row uses can be renamed
// (the rows follow) or hidden (they keep it), but not deleted.
//
// Audit entries use entity "TnaTrainingOption" with the option's id, or
// "group:<id>" for a group.

export const OPTIONS_SHEET = "Training Options";
export const OPTIONS_HEADINGS = ["ID", "Section", "Group", "Training Name", "Status"] as const;

function mayManage(user: SessionUser) {
  if (!can(user, "tna.manage")) throw new UserError("Only L&D can change the TNA training options.");
}

function nameOf(raw: string): string {
  const { name, error } = cleanOptionName(raw);
  if (error) throw new UserError("Check the highlighted fields.", { name: [error] });
  return name;
}

const sectionOf = (value: string): TnaSection => {
  if (!(TNA_SECTIONS as readonly string[]).includes(value)) throw new UserError("That section isn't on the form.");
  return value as TnaSection;
};

/** A section's groups and options as L&D manage them, each option with how many saved TNA rows use it. */
export async function tnaOptionList(user: SessionUser, section: TnaSection) {
  mayManage(user);
  const [categories, options, counts] = await Promise.all([
    db.tnaTrainingCategory.findMany({ where: { section }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, _count: { select: { options: true } } } }),
    db.tnaTrainingOption.findMany({
      where: { section },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, active: true, categoryId: true, updatedAt: true, _count: { select: { items: true } } },
    }),
    db.tnaTrainingOption.groupBy({ by: ["section"], _count: { _all: true } }),
  ]);
  return {
    categories,
    /** Ungrouped options first, then each group's. */
    groups: [
      { category: null, options: options.filter((o) => o.categoryId === null) },
      ...categories.map((c) => ({ category: c, options: options.filter((o) => o.categoryId === c.id) })),
    ].filter((g) => g.category !== null || g.options.length > 0),
    total: options.length,
    perSection: Object.fromEntries(TNA_SECTIONS.map((s) => [s, counts.find((c) => c.section === s)?._count._all ?? 0])) as Record<TnaSectionKey, number>,
  };
}

async function categoryIn(tx: Prisma.TransactionClient, section: TnaSection, categoryId: number | null) {
  if (categoryId === null) return null;
  const category = await tx.tnaTrainingCategory.findUnique({ where: { id: categoryId }, select: { id: true, section: true, name: true } });
  if (!category || category.section !== section) throw new UserError("That group isn't in this section any more.", { categoryId: ["Choose another group"] });
  return category;
}

async function taken(tx: Prisma.TransactionClient, section: TnaSection, categoryId: number | null, name: string, exceptId = 0) {
  const found = await tx.tnaTrainingOption.findFirst({ where: { section, categoryId, name, id: { not: exceptId } }, select: { id: true } });
  if (found) throw new UserError("Check the highlighted fields.", { name: ["Already on this list"] });
}

const nextSort = async (tx: Prisma.TransactionClient, table: "option" | "category", section: TnaSection) =>
  ((table === "option"
    ? await tx.tnaTrainingOption.aggregate({ where: { section }, _max: { sortOrder: true } })
    : await tx.tnaTrainingCategory.aggregate({ where: { section }, _max: { sortOrder: true } })
  )._max.sortOrder ?? 0) + 10;

export async function addTnaOption(user: SessionUser, sectionRaw: string, categoryId: number | null, rawName: string) {
  mayManage(user);
  const section = sectionOf(sectionRaw);
  const name = nameOf(rawName);
  return db.$transaction(async (tx) => {
    const category = await categoryIn(tx, section, categoryId);
    await taken(tx, section, categoryId, name);
    const option = await tx.tnaTrainingOption.create({ data: { section, categoryId, name, sortOrder: await nextSort(tx, "option", section), updatedById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "CREATE",
      entity: "TnaTrainingOption",
      entityId: option.id,
      summary: `Added TNA training option "${name}" to ${tnaSectionTitle(section)}${category ? `, ${category.name}` : ""}`,
    });
  });
}

/** Renames an option or moves it to another group. Saved TNA rows that use it take the new name. */
export async function editTnaOption(user: SessionUser, id: number, categoryId: number | null, rawName: string) {
  mayManage(user);
  const name = nameOf(rawName);
  return db.$transaction(async (tx) => {
    const option = await tx.tnaTrainingOption.findUnique({ where: { id } });
    if (!option) throw new UserError("That option no longer exists.");
    await categoryIn(tx, option.section, categoryId);
    await taken(tx, option.section, categoryId, name, id);
    const moved = option.categoryId !== categoryId;
    await tx.tnaTrainingOption.update({
      where: { id },
      data: { name, categoryId, updatedById: user.id, ...(moved ? { sortOrder: await nextSort(tx, "option", option.section) } : {}) },
    });
    const renamed = name !== option.name ? (await tx.tnaItem.updateMany({ where: { optionId: id }, data: { trainingName: name } })).count : 0;
    if (name !== option.name || moved)
      await recordAudit(tx, {
        actorId: user.id,
        action: "UPDATE",
        entity: "TnaTrainingOption",
        entityId: id,
        summary: `Changed TNA training option "${option.name}"`,
        changes: { ...(name !== option.name ? { name: [option.name, name] as [unknown, unknown] } : {}), ...(moved ? { group: [option.categoryId, categoryId] as [unknown, unknown] } : {}) },
      });
    return { renamed };
  });
}

/** Hides an option from new rows, or shows it again. Rows already saved keep it either way. */
export async function toggleTnaOption(user: SessionUser, id: number) {
  mayManage(user);
  return db.$transaction(async (tx) => {
    const option = await tx.tnaTrainingOption.findUnique({ where: { id } });
    if (!option) throw new UserError("That option no longer exists.");
    await tx.tnaTrainingOption.update({ where: { id }, data: { active: !option.active, updatedById: user.id } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "TnaTrainingOption",
      entityId: id,
      summary: `${option.active ? "Hid" : "Showed"} TNA training option "${option.name}"`,
      changes: { active: [option.active, !option.active] },
    });
    return { active: !option.active };
  });
}

export async function deleteTnaOption(user: SessionUser, id: number) {
  mayManage(user);
  return db.$transaction(async (tx) => {
    const option = await tx.tnaTrainingOption.findUnique({ where: { id }, select: { name: true, _count: { select: { items: true } } } });
    if (!option) throw new UserError("That option no longer exists.");
    if (option._count.items > 0) throw new UserError(`${option._count.items} saved TNA ${option._count.items === 1 ? "row uses" : "rows use"} this option, so it can't be deleted. Hide it instead.`);
    await tx.tnaTrainingOption.delete({ where: { id } });
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "TnaTrainingOption", entityId: id, summary: `Deleted TNA training option "${option.name}"` });
  });
}

export async function addTnaCategory(user: SessionUser, sectionRaw: string, rawName: string) {
  mayManage(user);
  const section = sectionOf(sectionRaw);
  const name = nameOf(rawName);
  return db.$transaction(async (tx) => {
    if (await tx.tnaTrainingCategory.findUnique({ where: { section_name: { section, name } } })) throw new UserError("Check the highlighted fields.", { name: ["This section already has that group"] });
    const category = await tx.tnaTrainingCategory.create({ data: { section, name, sortOrder: await nextSort(tx, "category", section) } });
    await recordAudit(tx, { actorId: user.id, action: "CREATE", entity: "TnaTrainingOption", entityId: `group:${category.id}`, summary: `Added TNA training group "${name}" to ${tnaSectionTitle(section)}` });
  });
}

export async function renameTnaCategory(user: SessionUser, id: number, rawName: string) {
  mayManage(user);
  const name = nameOf(rawName);
  return db.$transaction(async (tx) => {
    const category = await tx.tnaTrainingCategory.findUnique({ where: { id } });
    if (!category) throw new UserError("That group no longer exists.");
    if (name === category.name) return;
    if (await tx.tnaTrainingCategory.findUnique({ where: { section_name: { section: category.section, name } } }))
      throw new UserError("Check the highlighted fields.", { name: ["This section already has that group"] });
    await tx.tnaTrainingCategory.update({ where: { id }, data: { name } });
    await recordAudit(tx, {
      actorId: user.id,
      action: "UPDATE",
      entity: "TnaTrainingOption",
      entityId: `group:${id}`,
      summary: `Renamed TNA training group "${category.name}"`,
      changes: { name: [category.name, name] },
    });
  });
}

export async function deleteTnaCategory(user: SessionUser, id: number) {
  mayManage(user);
  return db.$transaction(async (tx) => {
    const category = await tx.tnaTrainingCategory.findUnique({ where: { id }, select: { name: true, _count: { select: { options: true } } } });
    if (!category) throw new UserError("That group no longer exists.");
    if (category._count.options > 0)
      throw new UserError(`This group still has ${category._count.options} ${category._count.options === 1 ? "option" : "options"}. Move or delete them first.`);
    await tx.tnaTrainingCategory.delete({ where: { id } });
    await recordAudit(tx, { actorId: user.id, action: "DELETE", entity: "TnaTrainingOption", entityId: `group:${id}`, summary: `Deleted TNA training group "${category.name}"` });
  });
}

// ---------- Excel ----------

/** Every option in the order the forms show them: per section, ungrouped first, then each group. */
async function optionsInOrder(client: Prisma.TransactionClient | typeof db = db) {
  const options = await client.tnaTrainingOption.findMany({
    select: { id: true, section: true, categoryId: true, name: true, active: true, sortOrder: true, category: { select: { name: true, sortOrder: true } } },
  });
  return options.sort(
    (a, b) =>
      TNA_SECTIONS.indexOf(a.section) - TNA_SECTIONS.indexOf(b.section) ||
      Number(a.category !== null) - Number(b.category !== null) ||
      (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0) ||
      a.sortOrder - b.sortOrder ||
      a.id - b.id,
  );
}

/** The options as an Excel file L&D can change and import again. */
export async function tnaOptionsWorkbook(user: SessionUser): Promise<ExcelJS.Workbook> {
  mayManage(user);
  const options = await optionsInOrder();
  const wb = new ExcelJS.Workbook();
  wb.creator = "LDMS";
  const ws = wb.addWorksheet(OPTIONS_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 8 }, { width: 44 }, { width: 46 }, { width: 85 }, { width: 10 }];
  ws.addRow([...OPTIONS_HEADINGS]).font = { bold: true };
  for (const o of options) ws.addRow([o.id, tnaSectionTitle(o.section), o.category?.name ?? "", o.name, o.active ? "Active" : "Hidden"]);
  ws.autoFilter = { from: "A1", to: `E${Math.max(2, options.length + 1)}` };
  const sections = TNA_SECTIONS.map(tnaSectionTitle).join(",");
  for (let row = 2; row <= options.length + 500; row++) {
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F5" } };
    if (sections.length < 250) ws.getCell(row, 2).dataValidation = { type: "list", allowBlank: true, formulae: [`"${sections}"`] };
    ws.getCell(row, 5).dataValidation = { type: "list", allowBlank: true, formulae: ['"Active,Hidden"'] };
  }

  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 26 }, { width: 120 }];
  help.addRow(['How to change the TNA "Training required" lists with this file']).font = { bold: true, size: 13 };
  help.addRow([]);
  for (const [what, how] of [
    ["Add an option", "Add a row. Leave ID blank. Give the Section and the Training Name. Status is Active unless you type Hidden."],
    ["Rename an option", "Change the Training Name on its row and keep the ID. Saved TNA rows that use it take the new name."],
    ["Hide or show an option", "Set Status to Hidden or Active. A hidden option can't be picked for new rows; rows that already use it keep it."],
    ["Move to another group", "Change the Group. A group that the section doesn't have yet is added."],
    ["Change the order", "Move rows up or down. In each section and group, the options follow the order of the rows."],
    ["Remove an option", "Hide it. Deleting a row from this file doesn't delete the option: it is left as it is. An unused option can be deleted on the Training options page."],
    ["Sections", `Type a section as it is written here: ${TNA_SECTIONS.map(tnaSectionTitle).join("; ")}. Its letter alone also works. An option can't move to another section: hide it and add a new row.`],
    ["Rules", "Don't change or copy IDs. Don't add Others: every list has it. Names are saved in capitals. Nothing is saved until you have checked the changes and confirmed, and one row with an error stops the whole import."],
  ] as const) {
    const row = help.addRow([what, how]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
  return wb;
}

export type OptionImportRow = { row: number; section: string; group: string; name: string } & (
  | { action: "create"; hidden: boolean }
  | { action: "update"; changes: string[] }
  | { action: "unchanged" }
  | { action: "error"; errors: string[] }
);
export type OptionImportPreview = {
  fileName: string;
  rows: OptionImportRow[];
  counts: { create: number; update: number; unchanged: number; error: number };
  /** Groups the file adds, as "section › group". */
  newGroups: string[];
  /** TNA rows that will take a new name. */
  renamedRows: number;
};

const text = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v);
};

type Planned = { row: number; id: number | null; section: TnaSection; group: string; name: string; active: boolean };

/**
 * Reads the file and works out what it would change. Used twice with the
 * same file: to show the changes, then to make them against the data as it
 * is at that moment. Rules, as the old system's import:
 *   - blank ID: a new option; an ID: that option, updated in place
 *   - an option never changes section; options not in the file are left alone
 *   - the rows' order becomes the options' order
 *   - one row with an error stops the whole import
 */
async function plan(client: Prisma.TransactionClient | typeof db, fileName: string, buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new UserError("That file couldn't be read as an Excel workbook. Start from Download Excel on the Training options page.");
  }
  const ws = wb.getWorksheet(OPTIONS_SHEET) ?? wb.worksheets[0];
  if (!ws) throw new UserError("The file has no sheets.");
  const headings = OPTIONS_HEADINGS.map((_, i) => text(ws.getCell(1, i + 1).value).trim().toUpperCase());
  if (headings.join("|") !== OPTIONS_HEADINGS.map((h) => h.toUpperCase()).join("|"))
    throw new UserError(`This doesn't look like the training options file. Start from Download Excel on the Training options page (columns: ${OPTIONS_HEADINGS.join(", ")}).`);
  if (ws.rowCount > 5001) throw new UserError("The file has more than 5,000 rows.");

  const sectionByText = new Map<string, TnaSection>();
  for (const s of TNA_SECTIONS) for (const key of [tnaSectionTitle(s), s, tnaSectionLetter(s), `${tnaSectionLetter(s)}.`]) sectionByText.set(key.toLowerCase(), s);

  const current = await optionsInOrder(client);
  const byId = new Map(current.map((o) => [o.id, o]));
  const categories = await client.tnaTrainingCategory.findMany({ select: { id: true, section: true, name: true } });
  const categoryId = (section: TnaSection, group: string) => (group ? (categories.find((c) => c.section === section && c.name === group)?.id ?? -1) : null);

  const rows: OptionImportRow[] = [];
  const planned: Planned[] = [];
  const seenId = new Map<number, number>();
  const seenKey = new Map<string, number>();
  for (let n = 2; n <= ws.rowCount; n++) {
    const [rawId, rawSection, rawGroup, rawName, rawStatus] = OPTIONS_HEADINGS.map((_, i) => text(ws.getCell(n, i + 1).value).trim());
    if (!rawId && !rawSection && !rawGroup && !rawName && !rawStatus) continue;
    const errors: string[] = [];
    let id: number | null = null;
    if (rawId) {
      if (!/^\d+$/.test(rawId)) errors.push(`ID "${rawId}" isn't a number. Leave ID blank for a new option.`);
      else if (!byId.has(Number(rawId))) errors.push(`There is no option with ID ${rawId}. Leave ID blank for a new option.`);
      else if (seenId.has(Number(rawId))) errors.push(`ID ${rawId} is also on row ${seenId.get(Number(rawId))}.`);
      else {
        id = Number(rawId);
        seenId.set(id, n);
      }
    }
    const section = sectionByText.get(rawSection.toLowerCase()) ?? null;
    if (!section) errors.push(rawSection ? `"${rawSection}" isn't a section of the form.` : "Section is missing.");
    else if (id !== null && byId.get(id)!.section !== section) errors.push(`This option is in ${tnaSectionTitle(byId.get(id)!.section)} and can't move to another section. Hide it and add a new row.`);
    let group = "";
    if (rawGroup) {
      const g = cleanOptionName(rawGroup);
      if (g.error) errors.push(`Group: ${g.error.toLowerCase()}.`);
      group = g.name;
    }
    const cleaned = cleanOptionName(rawName);
    if (cleaned.error) errors.push(rawName ? `Training Name: ${cleaned.error.toLowerCase()}.` : "Training Name is missing.");
    const status = rawStatus.toLowerCase();
    if (!["", "active", "hidden"].includes(status)) errors.push(`Status must be Active or Hidden, not "${rawStatus}".`);
    if (!errors.length && section) {
      const key = `${section}|${group}|${cleaned.name}`;
      if (seenKey.has(key)) errors.push(`The same name is on row ${seenKey.get(key)}, in the same section and group.`);
      else seenKey.set(key, n);
    }
    const shown = { row: n, section: section ? tnaSectionTitle(section) : rawSection, group, name: cleaned.name || rawName };
    if (errors.length || !section) {
      rows.push({ ...shown, action: "error", errors });
      continue;
    }
    planned.push({ row: n, id, section, group, name: cleaned.name, active: status !== "hidden" });
    rows.push({ ...shown, action: "unchanged" }); // worked out below
  }
  if (!rows.length) throw new UserError("The file has no option rows.");

  // An option in the file can't take the name of one that isn't in it.
  for (const p of planned) {
    const clash = current.find((o) => !seenId.has(o.id) && o.section === p.section && (o.category?.name ?? "") === p.group && o.name === p.name);
    if (clash) {
      const i = rows.findIndex((r) => r.row === p.row);
      rows[i] = { ...rows[i], action: "error", errors: [`"${p.name}" is already on this list (ID ${clash.id}). Download a fresh copy and make your changes there.`] };
    }
  }
  const valid = planned.filter((p) => rows.find((r) => r.row === p.row)!.action !== "error");

  // The order: within a section and group, the file's order against today's.
  const bucket = (section: string, group: string) => `${section}|${group}`;
  const fileOrder = new Map<string, number[]>();
  for (const p of valid) if (p.id !== null) fileOrder.set(bucket(p.section, p.group), [...(fileOrder.get(bucket(p.section, p.group)) ?? []), p.id]);
  const reordered = new Set<number>();
  for (const [key, ids] of fileOrder) {
    const now = current.filter((o) => ids.includes(o.id) && bucket(o.section, o.category?.name ?? "") === key).map((o) => o.id);
    const staying = ids.filter((id) => now.includes(id));
    staying.forEach((id, i) => id !== now[i] && reordered.add(id));
  }

  const newGroups = new Set<string>();
  let renamedRows = 0;
  for (const p of valid) {
    const i = rows.findIndex((r) => r.row === p.row);
    if (categoryId(p.section, p.group) === -1) newGroups.add(`${tnaSectionTitle(p.section)} › ${p.group}`);
    if (p.id === null) {
      rows[i] = { ...rows[i], action: "create", hidden: !p.active };
      continue;
    }
    const before = byId.get(p.id)!;
    const changes: string[] = [];
    if (before.name !== p.name) {
      changes.push(`renamed from "${before.name}"`);
      renamedRows += await client.tnaItem.count({ where: { optionId: p.id } });
    }
    if ((before.category?.name ?? "") !== p.group) changes.push(p.group ? `moved to ${p.group}` : "taken out of its group");
    if (before.active !== p.active) changes.push(p.active ? "shown again" : "hidden");
    if (reordered.has(p.id)) changes.push("new place in the order");
    if (changes.length) rows[i] = { ...rows[i], action: "update", changes };
  }
  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of rows) counts[r.action]++;
  const preview: OptionImportPreview = { fileName, rows, counts, newGroups: [...newGroups], renamedRows };
  return { preview, valid };
}

export async function previewTnaOptionImport(user: SessionUser, fileName: string, buffer: ArrayBuffer): Promise<OptionImportPreview> {
  mayManage(user);
  return (await plan(db, fileName, buffer)).preview;
}

/** Makes the file's changes, all or none. */
export async function commitTnaOptionImport(user: SessionUser, fileName: string, buffer: ArrayBuffer) {
  mayManage(user);
  return db.$transaction(
    async (tx) => {
      const { preview, valid } = await plan(tx, fileName, buffer);
      if (preview.counts.error) throw new UserError(`${preview.counts.error} ${preview.counts.error === 1 ? "row has" : "rows have"} an error, so nothing was imported. Check the file again.`);
      if (preview.counts.create + preview.counts.update === 0) throw new UserError("The file changes nothing.");
      const groupIds = new Map<string, number>();
      for (const c of await tx.tnaTrainingCategory.findMany({ select: { id: true, section: true, name: true, sortOrder: true } })) groupIds.set(`${c.section}|${c.name}`, c.id);
      const position = new Map<TnaSection, number>();
      const listed: number[] = [];
      for (const p of valid) {
        let categoryId: number | null = null;
        if (p.group) {
          const key = `${p.section}|${p.group}`;
          if (!groupIds.has(key)) groupIds.set(key, (await tx.tnaTrainingCategory.create({ data: { section: p.section, name: p.group, sortOrder: await nextSort(tx, "category", p.section) } })).id);
          categoryId = groupIds.get(key)!;
        }
        const sortOrder = (position.get(p.section) ?? 0) + 10;
        position.set(p.section, sortOrder);
        const data = { categoryId, name: p.name, active: p.active, sortOrder, updatedById: user.id };
        if (p.id === null) listed.push((await tx.tnaTrainingOption.create({ data: { section: p.section, ...data }, select: { id: true } })).id);
        else {
          await tx.tnaTrainingOption.update({ where: { id: p.id }, data });
          await tx.tnaItem.updateMany({ where: { optionId: p.id, trainingName: { not: p.name } }, data: { trainingName: p.name } });
          listed.push(p.id);
        }
      }
      // Options the file left out keep their order, after the ones it listed.
      for (const o of await tx.tnaTrainingOption.findMany({ where: { id: { notIn: listed } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, section: true } })) {
        if (!position.has(o.section)) continue;
        const sortOrder = position.get(o.section)! + 10;
        position.set(o.section, sortOrder);
        await tx.tnaTrainingOption.updateMany({ where: { id: o.id }, data: { sortOrder } });
      }
      await recordAudit(tx, {
        actorId: user.id,
        action: "IMPORT",
        entity: "TnaTrainingOption",
        entityId: "import",
        summary: `Imported TNA training options from ${fileName}: ${preview.counts.create} added, ${preview.counts.update} changed`,
      });
      return { created: preview.counts.create, updated: preview.counts.update };
    },
    { timeout: 60_000 },
  );
}
