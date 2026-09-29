import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Phase 1 exit criteria, on the seeded demo data:
// staff can sign in, and admin can manage the org chart and staff with the
// approver shown correctly.

test("wrong password shows an error and keeps the staff no.", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Staff no.").fill("10001");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not correct" })).toBeVisible();
  await expect(page.getByLabel("Staff no.")).toHaveValue("10001");
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login\?from=%2Fstaff/);
});

test("admin sees data checks and can open a staff record with its approver", async ({ page }) => {
  await signIn(page, "10001");
  await expect(page.getByRole("heading", { name: "Org and staff data checks" })).toBeVisible();

  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();
  await page.getByPlaceholder("Name, staff no., email or position").fill("10002");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("link", { name: "Farah Wahida binti Yusof" }).click();
  await expect(page.getByText("HOD of the department")).toBeVisible();
});

test("clerk sees contract staff only and cannot open Organization", async ({ page }) => {
  await signIn(page, "10003");
  await page.goto("/staff");
  await expect(page.getByText("Showing: Contract staff")).toBeVisible();
  const designations = await page.locator("tbody tr").count();
  expect(designations).toBeGreaterThan(0);
  const res = await page.goto("/organization");
  expect(res?.status()).toBe(403);
});

test("a validation error keeps what was typed", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("/staff/new");
  await page.getByLabel("Full name").fill("Test Person Without Staff No");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Test Person Without Staff No");
});
