import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("sidebar starts open, collapses to icons, and remembers the choice", async ({ page }) => {
  await signIn(page, "10001");
  const sidebar = page.locator("aside[data-collapsed]");

  // Open by default: group labels and item names.
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect(sidebar.getByText("Records")).toBeVisible();

  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar.getByText("Records")).toHaveCount(0);

  // Collapsed rail: icons only, still navigable by name, and it stays collapsed.
  await sidebar.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator("aside[data-collapsed]")).toHaveAttribute("data-collapsed", "true");

  // Put it back so other runs start from the default.
  await page.locator("aside[data-collapsed]").getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator("aside[data-collapsed]")).toHaveAttribute("data-collapsed", "false");
});
