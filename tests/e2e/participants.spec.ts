import { expect, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { createTestTraining, deleteTestTraining } from "./db";
import { choose, signIn } from "./helpers";

// The flow test creates its own training (already held, so it can be marked
// completed), adds three demo accounts, and removes them and the training at the end.
const suffix = String(Date.now()).slice(-6);

async function createHeldTraining(page: Page, title: string) {
  await page.goto("trainings/new");
  await page.waitForLoadState("networkidle");
  await choose(page, "Type", "OJT");
  await page.getByLabel("Title").fill(title);
  await choose(page, "HRDC", "No");
  await page.getByLabel("Start date").fill("2026-03-03");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

const participants = (page: Page) => page.getByRole("region", { name: "Participants" });
const row = (page: Page, name: RegExp) => participants(page).getByRole("row", { name });
const dialog = (page: Page) => page.getByRole("dialog");

async function closeDialog(page: Page) {
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toBeHidden();
}

test("admin adds participants, records every attendance change, and each is audited", async ({ page }) => {
  const title = `Coil Loading ${suffix}`;
  await signIn(page, "10001");
  await createHeldTraining(page, title);
  await expect(participants(page).getByText("No participants yet.")).toBeVisible();

  // Add three people by searching for their staff no.
  await participants(page).getByRole("button", { name: "Add participants" }).click();
  const add = dialog(page);
  await expect(add.getByText("Loading staff")).toBeHidden();
  for (const no of ["10002", "10003", "10231"]) {
    await add.getByPlaceholder("Search by name or staff no.").fill(no);
    await add.getByRole("list", { name: "Staff" }).getByRole("checkbox").first().check();
  }
  await expect(add.getByText("3 selected")).toBeVisible();
  await add.getByRole("button", { name: "Add 3 participants" }).click();
  await expect(add.getByRole("status")).toHaveText("Added 3 participants.");
  await closeDialog(page);
  await expect(participants(page).getByRole("button", { name: /Pending\s*3/ })).toBeVisible();

  // Someone already on the list can't be picked again.
  await participants(page).getByRole("button", { name: "Add participants" }).click();
  await expect(add.getByText("Loading staff")).toBeHidden();
  await add.getByPlaceholder("Search by name or staff no.").fill("10002");
  await expect(add.getByText("Already added")).toBeVisible();
  await expect(add.getByRole("list", { name: "Staff" }).getByRole("checkbox")).toBeDisabled();
  await add.getByRole("button", { name: "Cancel" }).click();

  // Mark completed on someone's behalf: a reason is required.
  await row(page, /Farah Wahida/).getByRole("button", { name: /^Mark completed/ }).click();
  await dialog(page).getByRole("button", { name: "Mark completed" }).click();
  await expect(dialog(page).getByText("Say why, e.g. they can't use a computer")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("No computer access");
  await dialog(page).getByRole("button", { name: "Mark completed" }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("1 participant marked completed.");
  await closeDialog(page);
  await expect(row(page, /Farah Wahida/)).toContainText("Completed");
  await expect(row(page, /Farah Wahida/)).toContainText("No computer access");

  // Mark absent, with an optional reason.
  await row(page, /Ooi Boon Kiat/).getByRole("button", { name: /^Mark absent/ }).click();
  await dialog(page).getByLabel("Reason").fill("Medical leave");
  await dialog(page).getByRole("button", { name: "Mark absent" }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("1 participant marked absent.");
  await closeDialog(page);
  await expect(row(page, /Ooi Boon Kiat/)).toContainText("Absent");

  // Bulk remove: only the pending row goes; completed and absent stay on record, with the reason given.
  await participants(page).getByRole("checkbox", { name: "Select all shown" }).check();
  await participants(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog(page).getByText("1 participant will change; 2 will be skipped:")).toBeVisible();
  await expect(dialog(page).getByText(/Farah Wahida binti Yusof has completed this training, so they stay on record/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(dialog(page).getByRole("status")).toContainText("1 participant removed.");
  await closeDialog(page);
  await expect(participants(page).getByRole("button", { name: /All\s*2/ })).toBeVisible();

  // A refused change says why instead of doing nothing.
  await participants(page).getByRole("checkbox", { name: "Select all shown" }).check();
  await participants(page).getByRole("button", { name: "Mark completed", exact: true }).click();
  await expect(dialog(page).getByText(/None of the selected participants can be changed this way/)).toBeVisible();
  await closeDialog(page);

  // Undo absent and reopen, then the counts filter the list.
  await row(page, /Ooi Boon Kiat/).getByRole("button", { name: /^Undo absent/ }).click();
  await dialog(page).getByRole("button", { name: "Undo absent" }).click();
  await closeDialog(page);
  await row(page, /Farah Wahida/).getByRole("button", { name: /^Reopen/ }).click();
  await dialog(page).getByLabel("Reason").fill("Marked by mistake");
  await dialog(page).getByRole("button", { name: "Reopen" }).click();
  await closeDialog(page);
  await expect(row(page, /Farah Wahida/)).toContainText("Pending");
  await expect(row(page, /Farah Wahida/)).not.toContainText("No computer access");
  await participants(page).getByRole("button", { name: /Completed\s*0/ }).click();
  await expect(participants(page).getByText("No participants match.")).toBeVisible();
  await participants(page).getByRole("button", { name: /All\s*2/ }).click();

  // Every change is in the training's history, in plain words.
  const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "History", level: 2 }) });
  // Adding several people is one entry naming them all, not one entry each.
  const added = history.getByRole("listitem").filter({ hasText: `Added 3 participants to ${title}` });
  await expect(added).toHaveCount(1);
  for (const no of ["10002", "10003", "10231"]) await expect(added.getByText(/^Staff: /)).toContainText(`(${no})`);
  await expect(history.getByText(/^Added .* \(\d+\) to /)).toHaveCount(0);
  await expect(history.getByText(/Farah Wahida binti Yusof \(10002\) marked completed/)).toBeVisible();
  await expect(history.getByText("Reason: blank → No computer access")).toBeVisible();
  await expect(history.getByText(/Ooi Boon Kiat \(10003\) marked absent/)).toBeVisible();
  await expect(history.getByText(/Removed .* \(10231\) from/)).toBeVisible();
  await expect(history.getByText(/Farah Wahida binti Yusof \(10002\) reopened/)).toBeVisible();

  // Clean up: remove both (now pending) and delete the training.
  await participants(page).getByRole("checkbox", { name: "Select all shown" }).check();
  await participants(page).getByRole("button", { name: "Remove", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Remove: 2" }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("2 participants removed.");
  await closeDialog(page);
  // A bulk action is one entry too.
  const removed = history.getByRole("listitem").filter({ hasText: `Removed 2 participants from ${title}` });
  await expect(removed.getByText(/^Staff: /)).toContainText("(10002)");
  await expect(removed.getByText(/^Staff: /)).toContainText("(10003)");
  await page.getByRole("button", { name: "Delete" }).click();
  await dialog(page).getByRole("button", { name: "Delete training" }).click();
  await expect(page).toHaveURL(/deleted=1/);
});

test("participants of an upcoming training can't be marked completed yet", async ({ page }) => {
  // Its own training, a month from now, so it stays upcoming whatever happens to the demo data.
  const title = `Upcoming check ${suffix}`;
  const id = await createTestTraining(title, [{ staffNo: "10231", attendance: "PENDING" }], new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  try {
    await signIn(page, "10001");
    await page.goto(`trainings/${id}`);
    await participants(page).getByRole("button", { name: /^Mark completed/ }).first().click();
    await expect(dialog(page).getByText(/The training hasn't started yet, so .* can't be marked completed./)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Mark completed" })).toHaveCount(0);
    await closeDialog(page);
  } finally {
    await deleteTestTraining(title);
  }
});

test("a cancelled training's participants can't be changed", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("trainings?q=Industrial+Energy&status=ALL");
  await page.getByRole("link", { name: "Industrial Energy Management" }).click();
  await expect(participants(page).getByText(/The training is cancelled, so participants and attendance can't be changed/)).toBeVisible();
  await expect(participants(page).getByRole("button", { name: "Add participants" })).toHaveCount(0);
  await expect(participants(page).getByRole("checkbox")).toHaveCount(0);
});

test("the participant list exports to Excel", async ({ page }, testInfo) => {
  await signIn(page, "10001");
  await page.goto("trainings?q=ISO+9001");
  await page.getByRole("link", { name: "ISO 9001:2015 Internal Auditor" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), participants(page).getByRole("link", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^LDMS participants - ISO 90012015 Internal Auditor\.xlsx$/);
  const file = testInfo.outputPath("participants.xlsx");
  await download.saveAs(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Participants")!;
  expect(ws.getCell("A1").value).toBe("ISO 9001:2015 Internal Auditor");
  expect(ws.getRow(3).values).toEqual([
    undefined,
    "Staff No",
    "Name",
    "Designation",
    "Department",
    "Section",
    "Attendance",
    "Reason",
    "Feedback Given",
    "Hours",
    "PME",
  ]);
  expect(ws.rowCount).toBeGreaterThan(3);
  // Only completed attendance carries hours (the training is 2 days × 8 h).
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    expect(row.getCell(9).value).toBe(row.getCell(6).value === "Completed" ? 16 : 0);
  }
});
