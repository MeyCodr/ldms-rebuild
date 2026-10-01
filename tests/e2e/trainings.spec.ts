import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { choose, signIn } from "./helpers";

// Each run creates its own training with a unique title and deletes it at the end.
const suffix = String(Date.now()).slice(-6);

test("the form shows the type, then the old system's fields in the same order", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("trainings/new");
  await page.waitForLoadState("networkidle");
  const labels = await page.locator("form label.label").allTextContents();
  expect(labels.map((l) => l.replace(/\s*\*$/, "").trim())).toEqual([
    "Type",
    "Title",
    "Venue",
    "Cost (RM)",
    "HRDC",
    "Platform",
    "Function",
    "Start date",
    "End date",
    "Start time",
    "End time",
    "Program",
    "Trainer",
  ]);
  // Type offers Public / In-house and OJT only.
  await page.getByLabel("Type", { exact: true }).click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Public / In-house", "OJT"]);
  await page.keyboard.press("Escape");
  // Trainer: typed, except for an internal trainer, who is picked from the staff list.
  await expect(page.getByRole("textbox", { name: "Trainer" })).toBeVisible();
  await choose(page, "Program", "Internal training by internal trainer");
  await expect(page.getByRole("textbox", { name: "Trainer" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Trainer" })).toBeVisible();
  await choose(page, "Program", "External public program");
  await expect(page.getByRole("textbox", { name: "Trainer" })).toBeVisible();
});

test("admin creates, edits, cancels, restores and deletes a training", async ({ page }) => {
  const title = `Press Brake Setup ${suffix}`;
  await signIn(page, "10001");
  await page.goto("trainings");
  await page.getByRole("link", { name: "Add training" }).click();
  await expect(page.getByRole("heading", { name: "Add training", level: 1 })).toBeVisible();

  // Nothing filled in: every missing field is flagged at once, not one round at a time.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Choose a type")).toBeVisible();
  await expect(page.getByText("Enter the training title")).toBeVisible();
  await expect(page.getByText("Choose Yes or No", { exact: true })).toBeVisible();
  await expect(page.getByText("Choose the program", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter the start date")).toBeVisible();

  await choose(page, "Type", "Public / In-house");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Venue").fill("Training Room 2");
  await page.getByLabel("Cost (RM)").fill("1,250.50");
  await choose(page, "HRDC", "Yes");
  await choose(page, "Platform", "Online");
  await choose(page, "Function", "Personal effectiveness");
  await page.getByLabel("Start date").fill("2026-11-03");
  // The end date follows the start date, and the default 08:30–17:30 gives 9 hours.
  await expect(page.getByLabel("End date")).toHaveValue("03/11/2026");
  await expect(page.getByTestId("live-hours")).toHaveText("9 h");
  await page.getByLabel("End date").fill("2026-11-05");
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("13:00");
  await expect(page.getByTestId("live-hours")).toHaveText("12 h");
  await choose(page, "Program", "Internal training by external trainer");
  await page.getByRole("textbox", { name: "Trainer" }).fill("Ir. Lim Boon Huat");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Training added." })).toBeVisible();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("12 h in total")).toBeVisible();
  await expect(page.getByText("RM 1,250.50")).toBeVisible();
  await expect(page.getByText("Internal training by external trainer")).toBeVisible();
  await expect(page.getByText("Personal effectiveness")).toBeVisible();
  await expect(page.getByText("Ir. Lim Boon Huat")).toBeVisible();
  const url = page.url();

  // Edit: shorten it to one day.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await page.getByLabel("End date").fill("2026-11-03");
  await expect(page.getByTestId("live-hours")).toHaveText("4 h");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await expect(page.getByText("4 h in total")).toBeVisible();
  await expect(page.getByText(`Updated training ${title}`)).toBeVisible();

  // Cancel, then restore.
  await page.getByRole("button", { name: "Cancel training" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel training" }).click();
  await expect(page.getByRole("dialog").getByText("Training cancelled.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("This training was cancelled.")).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("dialog").getByText("Training restored.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("This training was cancelled.")).toHaveCount(0);

  // It shows in the list, found by its title.
  await page.goto(`trainings?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Delete (no participants, so allowed).
  await page.goto(url);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete training" }).click();
  await expect(page).toHaveURL(/\/trainings\?deleted=1/);
  await expect(page.getByText("Training deleted.")).toBeVisible();
  await page.goto(`trainings?q=${encodeURIComponent(title)}`);
  await expect(page.getByText("No trainings match these filters.")).toBeVisible();
});

test("the list filters by type and year and exports to Excel", async ({ page }, testInfo) => {
  await signIn(page, "10001");
  await page.goto("trainings");
  await choose(page, "Type", "OJT");
  await choose(page, "Year", "2026");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/type=OJT/);
  await expect(page.getByRole("link", { name: "Die Maintenance Basics" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Spot Welding Parameter Setting" })).toHaveCount(0); // 2025

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export to Excel" }).click();
  const file = testInfo.outputPath("trainings.xlsx");
  await (await download).saveAs(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Trainings")!;
  expect(ws.getRow(1).getCell(2).value).toBe("Title");
  const titles = ws.getColumn(2).values.slice(2);
  expect(titles).toContain("Die Maintenance Basics");
  expect(titles.every((t) => t !== "Spot Welding Parameter Setting")).toBe(true);
  // Die Maintenance Basics: 3 days × 3 h.
  const row = ws.getRows(2, ws.rowCount - 1)!.find((r) => r.getCell(2).value === "Die Maintenance Basics")!;
  expect(ws.getRow(1).getCell(14).value).toBe("Hours");
  expect(row.getCell(14).value).toBe(9);
  expect(row.getCell(12).value).toBe("Internal training by internal trainer");
});

test("clerks and plain staff can't open trainings", async ({ page }) => {
  await signIn(page, "10003");
  await expect(page.getByRole("link", { name: "Trainings" })).toHaveCount(0);
  const res = await page.goto("trainings");
  expect(res?.status()).toBe(403);
  const exp = await page.request.get("trainings/export");
  expect(exp.status()).toBe(403);
});

test("column headers sort the list, and the sort survives filters and export", async ({ page }, testInfo) => {
  await signIn(page, "10001");
  await page.goto("trainings?year=2025");
  const titles = () => page.locator("tbody tr td:nth-child(2) a").allTextContents();

  // Default: newest first.
  await expect(page.getByRole("columnheader", { name: /Dates/ })).toHaveAttribute("aria-sort", "descending");
  expect((await titles())[0]).toBe("Spot Welding Parameter Setting");

  // Training: A–Z, then Z–A.
  await page.getByRole("columnheader", { name: /Training/ }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page.getByRole("columnheader", { name: /Training/ })).toHaveAttribute("aria-sort", "ascending");
  const az = await titles();
  expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b)));
  await page.getByRole("columnheader", { name: /Training/ }).getByRole("link").click();
  await expect(page.getByRole("columnheader", { name: /Training/ })).toHaveAttribute("aria-sort", "descending");
  expect(await titles()).toEqual([...az].reverse());

  // Applying a filter keeps the sort.
  await page.getByLabel("Search").fill("Safety");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/sort=title&dir=desc/);
  await expect(page.getByRole("columnheader", { name: /Training/ })).toHaveAttribute("aria-sort", "descending");

  // Dates ascending: oldest first; the export follows the same order.
  await page.goto("trainings?year=2025&sort=date&dir=asc");
  expect((await titles())[0]).toBe("ISO 9001:2015 Internal Auditor");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export to Excel" }).click();
  const file = testInfo.outputPath("sorted.xlsx");
  await (await download).saveAs(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  expect(wb.getWorksheet("Trainings")!.getRow(2).getCell(2).value).toBe("ISO 9001:2015 Internal Auditor");

  // Type and participants headers sort too.
  await page.getByRole("columnheader", { name: /Type/ }).getByRole("link").click();
  await expect(page.getByRole("columnheader", { name: /Type/ })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("columnheader", { name: /Participants/ }).getByRole("link").click();
  await expect(page.getByRole("columnheader", { name: /Participants/ })).toHaveAttribute("aria-sort", "descending");
});

test("internal trainer is picked from executives and managers", async ({ page }) => {
  const title = `Internal trainer check ${suffix}`;
  await signIn(page, "10001");
  await page.goto("trainings/new");
  await page.waitForLoadState("networkidle");

  await choose(page, "Type", "Public / In-house");
  await choose(page, "Program", "Internal training by internal trainer");
  await page.getByLabel("Trainer", { exact: true }).click();
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option", { name: /^Nor Azlina binti Hamid/ })).toBeVisible(); // executive
  await expect(list.getByRole("option", { name: /^Farah Wahida binti Yusof/ })).toHaveCount(0); // non-executive
  await expect(list.getByRole("option", { name: /^Ooi Boon Kiat/ })).toHaveCount(0); // non-executive clerk
  await page.keyboard.press("Escape");

  await page.getByLabel("Title").fill(title);
  await choose(page, "Function", "Leadership");
  await choose(page, "Platform", "Physical");
  await choose(page, "Trainer", "Nor Azlina binti Hamid");
  await page.getByLabel("Start date").fill("2026-12-08");
  await choose(page, "HRDC", "No");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Training added." })).toBeVisible();
  const trainer = page.getByRole("main").getByRole("link", { name: "Nor Azlina binti Hamid", exact: true });
  await expect(trainer).toHaveAttribute("href", /\/staff\/\d+/);
  await expect(page.getByText("internal, 10001")).toBeVisible();

  // Clean up.
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete training" }).click();
  await expect(page).toHaveURL(/deleted=1/);
});

test("an OJT can be added without platform, function or program", async ({ page }) => {
  const title = `OJT check ${suffix}`;
  await signIn(page, "10001");
  await page.goto("trainings/new");
  await page.waitForLoadState("networkidle");
  await choose(page, "Type", "OJT");
  await expect(page.getByText("Platform, function and program are optional for OJT.")).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await choose(page, "HRDC", "No");
  await page.getByLabel("Start date").fill("2026-12-10");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Training added." })).toBeVisible();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByText("OJT", { exact: true }).first()).toBeVisible();

  // Clean up.
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete training" }).click();
  await expect(page).toHaveURL(/deleted=1/);
});
