import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("phone: navigation collapses into a menu and pages do not scroll sideways", async ({ page }) => {
  await signIn(page, "10001");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator("#mobile-nav").getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
