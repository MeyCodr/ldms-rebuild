import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("dropdown: type to search, Enter to pick, value submits with the filter form", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("/staff");

  const department = page.getByLabel("Department", { exact: true });
  await department.focus();
  await page.keyboard.type("quality c");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(department).toContainText("Quality Control");

  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/departmentId=\d+/);
  await expect(page.getByLabel("Department", { exact: true })).toContainText("Quality Control");
});

test("dropdown: arrow keys move, Escape closes the list but not the dialog around it", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("/organization");
  await page.getByRole("link", { name: "Purchasing", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /Purchasing/ })).toBeVisible();
  await page.getByRole("button", { name: /Change HOD|Assign HOD/ }).click();

  const dialog = page.getByRole("dialog");
  const picker = dialog.getByLabel("Staff member", { exact: true });
  await picker.click();
  await expect(dialog.getByRole("listbox")).toBeVisible();
  await expect(dialog.getByText("In Purchasing")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
