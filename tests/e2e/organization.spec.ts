import { expect, test, type Page } from "@playwright/test";
import { choose, signIn } from "./helpers";

// Each test puts the demo org chart back the way it found it.

async function openDepartment(page: Page, name: string) {
  await page.goto("organization");
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(name) })).toBeVisible();
}

test("assigning a HOD gives the department's staff an approver", async ({ page }) => {
  await signIn(page, "10001");
  await openDepartment(page, "Tooling Workshop");
  await expect(page.getByText("No HOD yet")).toBeVisible();

  const firstStaff = page.locator("tbody tr").first().getByRole("link");
  const staffName = (await firstStaff.textContent())!.trim();

  try {
    await page.getByRole("button", { name: "Assign HOD" }).click();
    const dialog = page.getByRole("dialog");
    await choose(dialog, "Staff member", { index: 1 });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/HOD updated/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    // A staff member in the department now shows the HOD as approver (or, if they are the new HOD, no approver).
    await page.getByRole("link", { name: staffName }).first().click();
    await expect(page.getByText(/HOD of the department|HOD, no approver in LDMS/)).toBeVisible();
  } finally {
    // Restore the demo state (no HOD) even if a step above failed, so the
    // other tests still find Tooling Workshop needing a HOD.
    await openDepartment(page, "Tooling Workshop");
    const change = page.getByRole("button", { name: "Change HOD" });
    if (await change.isVisible()) {
      await change.click();
      await choose(page.getByRole("dialog"), "Staff member", "No one (leave empty)");
      await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("dialog").getByText("HOD removed.")).toBeVisible();
    }
  }
});

test("sections can be added and deleted", async ({ page }) => {
  const name = `Kaizen Cell ${Date.now() % 10000}`;
  await signIn(page, "10001");
  await openDepartment(page, "Purchasing");

  await page.getByLabel("New section name").fill(name);
  await page.getByRole("button", { name: "Add section" }).click();
  const row = page.locator("li", { hasText: name });
  await expect(row).toBeVisible();
  await expect(page.getByLabel("New section name")).toHaveValue("");

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete section" }).click();
  // The row, and the dialog inside it, disappear once the section is gone.
  await expect(row).toHaveCount(0);
});

test("transferring staff moves them and back again", async ({ page }) => {
  await signIn(page, "10001");
  await openDepartment(page, "Information Technology");
  const row = page.locator("tbody tr").last();
  const name = (await row.getByRole("link").textContent())!.trim();
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Transfer 1" }).click();
  await choose(page.getByRole("dialog"), "To department", "Purchasing");
  await page.getByRole("dialog").getByRole("button", { name: "Transfer" }).click();
  await expect(page.getByRole("dialog").getByText("Transferred 1 staff.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("tbody").getByRole("link", { name })).toHaveCount(0);

  // Move them back.
  await openDepartment(page, "Purchasing");
  await page.locator("tbody tr", { hasText: name }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Transfer 1" }).click();
  await choose(page.getByRole("dialog"), "To department", "Information Technology");
  await page.getByRole("dialog").getByRole("button", { name: "Transfer" }).click();
  await expect(page.getByRole("dialog").getByText("Transferred 1 staff.")).toBeVisible();
});

test("org chart explains itself and lists departments needing a HOD", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("organization");
  await expect(page.getByText("How the org chart works")).toBeVisible();
  const attention = page.getByRole("region", { name: /Needs attention/ });
  await expect(attention.getByRole("link", { name: "Tooling Workshop" })).toBeVisible();

  // Old ?dept= links still land on the department page.
  await page.goto("organization?dept=1");
  await expect(page).toHaveURL(/\/organization\/departments\/1$/);
});
