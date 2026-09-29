import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("sidebar starts collapsed, expands, and remembers the choice", async ({ page }) => {
  await signIn(page, "10001");
  const sidebar = page.locator("aside[data-collapsed]");

  // Collapsed rail: icons only, still navigable by name.
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar.getByText("Records")).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();

  await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect(sidebar.getByText("Records")).toBeVisible();

  await page.reload();
  await expect(page.locator("aside[data-collapsed]")).toHaveAttribute("data-collapsed", "false");

  // Put it back so other runs start from the default.
  await page.locator("aside[data-collapsed]").getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator("aside[data-collapsed]")).toHaveAttribute("data-collapsed", "true");
});
