import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page, "10001");
  await page.goto("/trainings/new");
  await page.waitForLoadState("networkidle");
});

test("date field: typed dates are read day first and shown as DD/MM/YYYY", async ({ page }) => {
  const start = page.getByLabel("Start date");
  await start.fill("3/11/2026");
  await start.blur();
  await expect(start).toHaveValue("03/11/2026");
  // The end date follows the start date.
  await expect(page.getByLabel("End date")).toHaveValue("03/11/2026");
  await expect(page.getByTestId("live-hours")).toHaveText("9 h");

  await page.getByLabel("End date").fill("5 Nov 2026");
  await page.getByLabel("End date").blur();
  await expect(page.getByLabel("End date")).toHaveValue("05/11/2026");
  await expect(page.getByTestId("live-hours")).toHaveText("27 h");

  // Not a real date: flagged, and the server says how to write it.
  await start.fill("31/04/2026");
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a date as DD/MM/YYYY")).toBeVisible();
});

test("date field: pick from the calendar with the mouse or the keyboard", async ({ page }) => {
  await page.getByLabel("Start date").fill("03/11/2026");
  const endField = page.locator("div", { has: page.getByLabel("End date") }).last();
  await endField.getByRole("button", { name: "Choose date" }).click();
  const calendar = page.getByRole("dialog", { name: "Choose date" });
  await expect(calendar.getByText("November 2026")).toBeVisible();
  // Days before the start date can't be picked as the end date.
  await expect(calendar.getByRole("button", { name: "2 November 2026", exact: true })).toBeDisabled();
  await calendar.getByRole("button", { name: "Next month" }).click();
  await expect(calendar.getByText("December 2026")).toBeVisible();
  await calendar.getByRole("button", { name: "4 December 2026", exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await expect(page.getByLabel("End date")).toHaveValue("04/12/2026");

  // Keyboard: open, move a day right and a week down, pick.
  await endField.getByRole("button", { name: "Choose date" }).click();
  await expect(page.getByRole("button", { name: "4 December 2026", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("End date")).toHaveValue("12/12/2026");
  // Escape closes the calendar and returns to the field.
  await endField.getByRole("button", { name: "Choose date" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Choose date" })).toHaveCount(0);
  await expect(page.getByLabel("End date")).toBeFocused();
});

test("time field: typed times become 24-hour, and the list steps every 15 minutes", async ({ page }) => {
  await page.getByLabel("Start date").fill("03/11/2026");
  const end = page.getByLabel("End time");
  await end.fill("1.30pm");
  await end.blur();
  await expect(end).toHaveValue("13:30");

  // Pick the start time from the list.
  const startField = page.locator("div", { has: page.getByLabel("Start time") }).last();
  await startField.getByRole("button", { name: "Choose time" }).click();
  const list = page.getByRole("listbox", { name: "Times" });
  await expect(list.getByRole("option", { name: "08:30" })).toHaveAttribute("aria-selected", "true");
  // The list opens scrolled to the current time, not midnight.
  await expect(list.getByRole("option", { name: "08:30" })).toBeInViewport();
  await expect(list.getByRole("option", { name: "00:00" })).not.toBeInViewport();
  await list.getByRole("option", { name: "09:15" }).click();
  await expect(page.getByLabel("Start time")).toHaveValue("09:15");
  await expect(page.getByTestId("live-hours")).toHaveText("4.25 h");

  // Keyboard: ↓ opens the list, ↓ moves 15 minutes, Enter picks.
  await page.getByLabel("Start time").press("ArrowDown");
  await page.getByLabel("Start time").press("ArrowDown");
  await page.getByLabel("Start time").press("Enter");
  await expect(page.getByLabel("Start time")).toHaveValue("09:30");

  await end.fill("25:00");
  await expect(end).toHaveAttribute("aria-invalid", "true");
});
