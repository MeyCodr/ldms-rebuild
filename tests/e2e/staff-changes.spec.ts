import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { choose, signIn } from "./helpers";

// Uses fresh staff numbers on every run so the demo data is left as it was.
const suffix = String(Date.now()).slice(-6);

test("admin adds a staff member, marks them resigned and reinstates them", async ({ page }) => {
  const staffNo = `E${suffix}`;
  await signIn(page, "10001");
  await page.goto("/staff/new");
  await page.getByLabel("Staff no.").fill(staffNo);
  await page.getByLabel("Full name").fill("Nurul Izzah binti Othman");
  await choose(page, "Designation", "Executive");
  await choose(page, "Department", "Quality Control");
  await choose(page, "Section", "Final Inspection");
  await page.getByRole("button", { name: "Add staff" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Staff record added." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nurul Izzah binti Othman" })).toBeVisible();
  await expect(page.getByText("HOD of the department")).toBeVisible();

  await page.getByRole("button", { name: "Mark as resigned" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as resigned" }).click();
  await expect(page.getByRole("dialog").getByText("Marked as resigned.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Cannot sign in (resigned)")).toBeVisible();

  await page.getByRole("button", { name: "Reinstate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reinstate" }).click();
  await expect(page.getByRole("dialog").getByText("Reinstated as active.")).toBeVisible();
});

test("clerk imports contract staff; other designations are rejected per row", async ({ page }, testInfo) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Staff");
  ws.addRow(["Staff No", "Name", "Email", "Position", "Designation", "Department", "Section", "Date Joined"]);
  ws.addRow([`C${suffix}`, "Aung Ko Ko", "", "Production Operator", "Contract", "STP", "Press Line A", "01/10/2026"]);
  ws.addRow([`X${suffix}`, "Lee Jun Hao", "", "Engineer", "Executive", "Die Engineering", "", "01/10/2026"]);
  const file = testInfo.outputPath("import.xlsx");
  await wb.xlsx.writeFile(file);

  await signIn(page, "10003");
  await page.goto("/staff/import");
  await page.setInputFiles("#file", file);
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Clerks can import contract staff only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 1 row" })).toBeDisabled();

  await page.getByLabel(/Skip the 1 row with errors/).check();
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(page.getByText("Import finished: 1 added, 0 updated, 1 rows with errors skipped.")).toBeVisible();
});
