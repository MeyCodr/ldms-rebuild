import { type Browser, expect, type Page, test } from "@playwright/test";
import { createTestTna, deleteTestNotifications, deleteTestTnas, giveDemoPassword, setTnaYearSetting } from "./db";
import { DEMO_PASSWORD, signIn } from "./helpers";

// Notifications, through a TNA in Stamping:
//   10233 a Stamping executive: it is their TNA, so they are told
//   10231 Nor Azlina binti Rosli, the HOD: sends it back, then approves it
//   10232 another Stamping executive: can't open someone else's notification
// The TNA and the notifications are removed at the end.
const HOD = "Nor Azlina binti Rosli";
const YEAR = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
const restore: (() => Promise<void>)[] = [];
let tnaId = 0;

test.beforeAll(async () => {
  await deleteTestTnas(["10233"], "Stamping");
  await deleteTestNotifications(["10231", "10232", "10233"]);
  restore.push(await giveDemoPassword("10232", DEMO_PASSWORD), await giveDemoPassword("10233", DEMO_PASSWORD), await setTnaYearSetting(YEAR));
  tnaId = await createTestTna("10233", YEAR, "SUBMITTED");
});
test.afterAll(async () => {
  await deleteTestTnas(["10233"], "Stamping");
  await deleteTestNotifications(["10231", "10232", "10233"]);
  for (const undo of restore) await undo();
});

async function as(browser: Browser, staffNo: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staffNo);
  return page;
}

const dialog = (page: Page) => page.getByRole("dialog");
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Notifications/ });
const list = (page: Page) => page.getByRole("list", { name: "Notifications" });

test("a person is told when their TNA is sent back and when it is approved; opening one marks it read; no one else can open it", async ({ browser }) => {
  test.setTimeout(240_000);
  const staff = await as(browser, "10233");
  const hod = await as(browser, "10231");

  await test.step("nothing yet", async () => {
    await nav(staff).click();
    await expect(staff.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible({ timeout: 30_000 }); // compiled on first visit
    await expect(staff.getByText("No notifications")).toBeVisible();
    await expect(nav(staff)).not.toContainText(/[0-9]/);
  });

  await test.step("the HOD sends the TNA back: the person is told, the HOD isn't", async () => {
    await hod.goto(`tna/${tnaId}`);
    await hod.waitForLoadState("networkidle");
    await hod.getByRole("button", { name: "Send back" }).click();
    await dialog(hod).getByLabel("Reason").fill("Add the month for each course");
    await dialog(hod).getByRole("button", { name: "Send back" }).click();
    await expect(dialog(hod).getByRole("status")).toBeVisible();
    await hod.goto("notifications");
    await expect(hod.getByText("No notifications")).toBeVisible();

    await staff.goto("notifications");
    await expect(nav(staff)).toContainText("1");
    await expect(staff.getByText("1 unread of 1 notification")).toBeVisible();
    await expect(list(staff).getByRole("link")).toHaveCount(1);
    await expect(list(staff).getByRole("link").first()).toContainText(`Unread: ${HOD} sent your TNA for ${YEAR} back to you.`);
  });

  await test.step("opening it goes to the TNA and marks it read", async () => {
    await list(staff).getByRole("link").first().click();
    await expect(staff).toHaveURL(new RegExp(`/my-tna\\?year=${YEAR}$`));
    await expect(staff.getByText("Add the month for each course")).toBeVisible();
    await expect(nav(staff)).not.toContainText(/[0-9]/);
    await staff.goto("notifications");
    await expect(staff.getByText("0 unread of 1 notification")).toBeVisible();
    await expect(list(staff).getByRole("link").first()).not.toContainText("Unread:");
    await expect(staff.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
  });

  await test.step("submitted again and approved: a second one, and Mark all as read clears it", async () => {
    await staff.goto("my-tna/edit");
    await staff.waitForLoadState("networkidle");
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await expect(staff.getByRole("status").first()).toContainText("Submitted.");

    await hod.goto(`tna/${tnaId}`);
    await hod.waitForLoadState("networkidle");
    await hod.getByRole("button", { name: "Approve" }).click();
    await dialog(hod).getByRole("button", { name: "Approve" }).click();
    await expect(dialog(hod).getByRole("status")).toBeVisible();

    await staff.goto("notifications");
    await expect(staff.getByText("1 unread of 2 notifications")).toBeVisible();
    // Newest first.
    await expect(list(staff).getByRole("link").first()).toContainText(`Unread: ${HOD} approved your TNA for ${YEAR}.`);
    await staff.getByRole("button", { name: "Mark all as read" }).click();
    await expect(staff.getByText("0 unread of 2 notifications")).toBeVisible();
    await expect(nav(staff)).not.toContainText(/[0-9]/);
  });

  await test.step("the bell on a phone's top bar carries the count's place", async () => {
    await staff.setViewportSize({ width: 412, height: 800 });
    await staff.goto("");
    await staff.getByRole("link", { name: "Notifications", exact: true }).click();
    await expect(staff.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  });

  await test.step("someone else can't open it, and signed out it asks for sign-in", async () => {
    const href = await list(staff).getByRole("link").first().getAttribute("href");
    expect(href).toMatch(/\/notifications\/\d+\/open$/);
    const other = await as(browser, "10232");
    expect((await other.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
    expect((await other.request.get(href!.replace(/\d+\/open$/, "abc/open"), { maxRedirects: 0 })).status()).toBe(404);
    await other.context().close();
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(href!);
    await expect(anon).toHaveURL(/\/login/);
    await anon.context().close();
  });
});
