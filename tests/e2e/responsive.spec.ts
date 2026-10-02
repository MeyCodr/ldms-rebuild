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

test("phone: training list, record and form fit the screen", async ({ page }) => {
  await signIn(page, "10001");
  for (const path of ["trainings", "trainings/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("trainings?q=Excel+for+Production");
  await page.getByRole("link", { name: "Excel for Production Reporting" }).click();
  await expect(page.getByText("9 h in total")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("phone: My training and its forms fit the screen", async ({ page }) => {
  await signIn(page, "10231");
  for (const path of ["my-training", "my-training/ojt/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // A training with its feedback form.
  await page.goto("my-training");
  await page.getByRole("table", { name: "My trainings" }).locator("tbody tr").first().getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("phone: long dropdown options wrap instead of being cut off", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("trainings/new");
  await page.getByLabel("Program", { exact: true }).click();
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options.nth(2)).toHaveText("Internal training by internal trainer");
  const clipped = await options.evaluateAll(
    (els) => els.filter((el) => [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1)).length,
  );
  expect(clipped).toBe(0);
  const box = await page.getByRole("listbox").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("phone: the calendar fits on screen", async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("trainings/new");
  await page.waitForLoadState("networkidle");
  const startField = page.locator("div", { has: page.getByLabel("Start date") }).last();
  await startField.getByRole("button", { name: "Choose date" }).click();
  const box = await page.getByRole("dialog", { name: "Choose date" }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
