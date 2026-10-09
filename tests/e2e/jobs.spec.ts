import { type Browser, expect, type Page, test } from "@playwright/test";
import { giveDemoPassword, resetMail } from "./db";
import { DEMO_PASSWORD, signIn } from "./helpers";

// Jobs and email is L&D's (10001, Nor Azlina binti Hamid). Email is put to
// Off for the whole test (resetMail) and never to Test or Live, so no test
// sends a real email: each one is only recorded. The mode is put back as it
// was at the end.
const LD = "Nor Azlina binti Hamid";
const TEST_ADDRESS = "ldms-test@phn.com.my";
const restore: (() => Promise<void>)[] = [];

test.beforeAll(async () => {
  restore.push(await resetMail("10001", { enabled: true, address: TEST_ADDRESS }), await giveDemoPassword("10232", DEMO_PASSWORD));
});
test.afterAll(async () => {
  for (const undo of restore) await undo();
});

async function as(browser: Browser, staffNo: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staffNo);
  return page;
}

const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const emails = (page: Page) => page.getByRole("table", { name: "Emails" });
const runs = (page: Page) => page.getByRole("table", { name: "Daily job runs" });

async function open(page: Page) {
  await page.goto("jobs");
  await page.waitForLoadState("networkidle");
}

test("with email off, L&D record a test email, see what Test and Live would do, and run the daily job; others are kept out", async ({ browser }) => {
  test.setTimeout(240_000);
  const ld = await as(browser, "10001");

  await test.step("the screen says email is off", async () => {
    await ld.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Jobs and email" }).click();
    await expect(ld.getByRole("heading", { name: "Jobs and email", level: 1 })).toBeVisible({ timeout: 30_000 }); // compiled on first visit
    await expect(ld.getByText("Email off", { exact: true })).toBeVisible();
    await expect(ld.getByText("Email is off: emails are recorded below, but none is really sent.")).toBeVisible();
    await expect(panel(ld, "Email")).toContainText("Emails are only recorded; none is sent.");
    await expect(panel(ld, "Emails")).toContainText("No emails yet");
  });

  await test.step("a test email is recorded for the test address, naming who it was meant for, and not sent", async () => {
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Send a test email" }).click();
    await expect(dialog(ld)).toContainText("is only recorded");
    await dialog(ld).getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText(`Email is off, so the test email to ${TEST_ADDRESS} was only recorded. Change the email mode to Test to really send one.`);
    await open(ld);
    const row = emails(ld).getByRole("row").nth(1);
    await expect(row).toContainText(LD);
    await expect(row).toContainText("nor.azlina@phn.com.my");
    await expect(row).toContainText(TEST_ADDRESS);
    await expect(row).toContainText("[TEST - intended for nor.azlina@phn.com.my] LDMS test email");
    await expect(row).toContainText("Recorded only");
  });

  await test.step("one dialog offers Off, Test and Live, and says what each does", async () => {
    await ld.getByRole("button", { name: "Change email mode" }).click();
    const d = dialog(ld);
    await expect(d.getByRole("radio", { name: /^Off/ })).toBeChecked();
    // Test asks for the address every email goes to, and keeps the last one.
    await expect(d.getByRole("textbox", { name: "Test address" })).toHaveCount(0);
    await d.getByRole("radio", { name: /^Test/ }).check();
    await expect(d.getByRole("textbox", { name: "Test address" })).toHaveValue(TEST_ADDRESS);
    // Live warns that real staff get email, and its button says so. Not pressed: the tests never send.
    await d.getByRole("radio", { name: /^Live/ }).check();
    await expect(d.getByRole("textbox", { name: "Test address" })).toHaveCount(0);
    const live = d.getByRole("button", { name: "Go live" });
    const notSetUp = d.getByText("No mail server is set up on this server yet.");
    // On a copy with no mail server in .env, Test and Live say why they can't be chosen instead.
    await expect(live.or(notSetUp).first()).toBeVisible();
    if (await notSetUp.isVisible()) await expect(live).toBeDisabled();
    else await expect(d).toContainText("real staff receive email from LDMS");
    // Back to Off: nothing changes.
    await d.getByRole("radio", { name: /^Off/ }).check();
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d.getByRole("status")).toHaveText("Email is off. Emails are only recorded; none is sent.");
  });

  await test.step("Run now runs the daily job and lists the run; recorded emails aren't sent by it", async () => {
    await open(ld);
    await ld.getByRole("button", { name: "Run now" }).click();
    await dialog(ld).getByRole("button", { name: "Run now" }).click();
    await expect(dialog(ld).getByRole("status")).toContainText("The daily job ran:", { timeout: 60_000 });
    await open(ld);
    const row = runs(ld).getByRole("row").nth(1);
    await expect(row).toContainText(LD);
    await expect(row).toContainText("Finished");
    // The test email recorded earlier is still only recorded: a run never sends what was recorded.
    await expect(emails(ld).getByRole("row", { name: /LDMS test email/ }).first()).toContainText("Recorded only");
    await ld.context().close();
  });

  await test.step("a HOD and an executive have no such screen", async () => {
    for (const staffNo of ["10231", "10232"]) {
      const other = await as(browser, staffNo);
      await expect(other.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Jobs and email" })).toHaveCount(0);
      expect((await other.goto("jobs"))?.status()).toBe(403);
      await other.context().close();
    }
  });
});
