import { expect, type Locator, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// Clicking anywhere on a table row opens that row's record, not only its link.

/** Opens a page and waits until it responds to clicks. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** Clicks a cell that isn't a link, so the row itself does the work. */
async function clickRow(row: Locator, cellIndex: number) {
  const cell = row.getByRole("cell").nth(cellIndex);
  await expect(cell.getByRole("link")).toHaveCount(0);
  await cell.click();
}

test("rows open their record: trainings, staff, organization, audit log", async ({ page }) => {
  await signIn(page, "10001");

  // Trainings: the dates cell opens the training.
  await open(page, "trainings?q=Forklift");
  await clickRow(page.locator("tbody tr").first(), 2);
  await expect(page).toHaveURL(/\/trainings\/\d+$/);
  await expect(page.getByRole("heading", { name: "Forklift Operation Licence", level: 1 })).toBeVisible();

  // The training's participants: the attendance cell opens the person's staff record.
  const participant = page.getByRole("region", { name: "Participants" }).getByRole("row", { name: /Rajesh a\/l Krishnan/ });
  await page.waitForLoadState("networkidle");
  await clickRow(participant, 5);
  await expect(page).toHaveURL(/\/staff\/\d+$/);
  await expect(page.getByRole("heading", { name: "Rajesh a/l Krishnan", level: 1 })).toBeVisible();

  // Staff: the staff no. opens the record.
  await open(page, "staff?q=10002");
  await clickRow(page.locator("tbody tr").first(), 1);
  await expect(page).toHaveURL(/\/staff\/\d+$/);
  await expect(page.getByRole("heading", { name: "Farah Wahida binti Yusof", level: 1 })).toBeVisible();

  // Organization: a department's active staff count opens the department.
  await open(page, "organization");
  const finance = page.getByRole("row", { name: /Finance & Accounts/ });
  await clickRow(finance, 4);
  await expect(page).toHaveURL(/\/organization\/departments\/\d+$/);
  await expect(page.getByRole("heading", { name: "Finance & Accounts", level: 1 })).toBeVisible();

  // The department's staff: the section cell opens the person's record.
  await clickRow(page.getByRole("row", { name: /10327/ }), 4);
  await expect(page).toHaveURL(/\/staff\/\d+$/);
  await expect(page.getByRole("heading", { name: "Mohd Rizal bin Othman", level: 1 })).toBeVisible();

  // Audit log: the "when" cell opens what the entry is about.
  await open(page, "audit");
  const linked = page
    .locator("tbody tr")
    .filter({ has: page.locator("td").nth(3).getByRole("link") })
    .first();
  const target = await linked.getByRole("cell").nth(3).getByRole("link").getAttribute("href");
  await clickRow(linked, 0);
  await expect(page).toHaveURL(new RegExp(`${target!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});

test("rows open their record: My training", async ({ page }) => {
  await signIn(page, "10231");
  await open(page, "my-training");
  // The start date cell.
  await clickRow(page.getByRole("table", { name: "My trainings" }).getByRole("row", { name: /Power Press Safety/ }), 2);
  await expect(page).toHaveURL(/\/my-training\/\d+$/);
  await expect(page.getByRole("heading", { name: "Power Press Safety", level: 1 })).toBeVisible();
});
