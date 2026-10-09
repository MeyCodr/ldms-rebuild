import { type Browser, expect, type Page, test } from "@playwright/test";
import { createTestTna, deleteTestTnas, giveDemoPassword, keepSettings, resetMail, setTnaYearSetting } from "./db";
import { DEMO_PASSWORD, signIn } from "./helpers";

// Reminders, through a TNA in Stamping:
//   10001 L&D: the Reminders panel, who is reminded today, each person's email, the closing date
//   10231 Nor Azlina binti Rosli, Stamping's HOD: has 10233's submitted TNA to approve
//   10233 a Stamping executive: reminded to submit once a closing date is near
// Email is Off for the whole test, so nothing is sent: the daily job's emails
// are only recorded. Settings, emails and the TNA are put back at the end.
const HOD = "Nor Azlina binti Rosli";
const YEAR = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
const restore: (() => Promise<void>)[] = [];

test.beforeAll(async () => {
  await deleteTestTnas(["10233"], "Stamping");
  restore.push(
    await resetMail("10001", { enabled: true, address: "ldms-test@phn.com.my" }),
    await keepSettings(["reminders.kinds", "reminders.chaseFrom", "tna.closingDate"]),
    await giveDemoPassword("10233", DEMO_PASSWORD),
    await setTnaYearSetting(YEAR),
  );
  await createTestTna("10233", YEAR, "SUBMITTED");
});
test.afterAll(async () => {
  await deleteTestTnas(["10233"], "Stamping");
  for (const undo of restore.reverse()) await undo();
});

async function as(browser: Browser, staffNo: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staffNo);
  return page;
}

const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const people = (page: Page) => page.getByRole("table", { name: "People reminded today" });
const email = (page: Page) => page.frameLocator("iframe").locator("body");

test("L&D see who is reminded and read their email; a kind can be switched off; a closing date starts the TNA reminders; the daily job writes the emails once", async ({ browser }) => {
  test.setTimeout(300_000);
  const ld = await as(browser, "10001");

  await test.step("the panel lists every kind and how many are waiting today", async () => {
    await ld.goto("jobs");
    await expect(panel(ld, "Reminders")).toBeVisible({ timeout: 30_000 });
    const table = ld.getByRole("table", { name: "Reminders" });
    await expect(table.getByRole("row")).toHaveCount(14); // the heading and thirteen kinds
    const tna = table.getByRole("row", { name: /TNA to approve/ });
    await expect(tna).toContainText("The HOD");
    await expect(tna).toContainText("On");
    await expect(table.getByRole("row", { name: /TNA not submitted/ })).toContainText(`No closing date is set for ${YEAR}, so no one is reminded.`);
  });

  let previewUrl = "";
  await test.step("the HOD is on today's list, and their email names the TNA waiting for them", async () => {
    await ld.getByRole("link", { name: "Who is reminded today" }).click();
    await expect(ld.getByRole("heading", { name: "Who is reminded today", level: 1 })).toBeVisible({ timeout: 30_000 });
    const row = people(ld).getByRole("row", { name: new RegExp(HOD) });
    await expect(row).toContainText("TNAs to approve");
    await row.getByRole("link", { name: HOD }).click();
    await expect(ld.getByRole("heading", { name: HOD, level: 1 })).toBeVisible({ timeout: 30_000 });
    previewUrl = ld.url();
    await expect(panel(ld, "The email")).toContainText("things are waiting for you");
    await expect(panel(ld, "The email")).toContainText("It would only be recorded, not sent.");
    await expect(email(ld)).toContainText(`Dear ${HOD},`);
    await expect(email(ld)).toContainText("TNAs to approve (1)");
    // A proper table: who it is about by staff no. and name, what, and how long it has waited.
    await expect(email(ld)).toContainText("Staff no.");
    await expect(email(ld)).toContainText("Days waiting");
    await expect(email(ld)).toContainText("10233");
    await expect(email(ld).getByRole("link", { name: "Open Approvals" }).first()).toHaveAttribute("href", /\/phn-ldms\/approvals$/);

    // L&D can send themselves a copy to see it in their own mail program. Email is off here, so it is only recorded.
    // The button only works once the page's scripts have loaded, so it is pressed until its dialog opens.
    // (Waiting for the network to go quiet doesn't end on this page.)
    await expect(async () => {
      await ld.getByRole("button", { name: "Send this email to me" }).click();
      await expect(dialog(ld)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(dialog(ld)).toContainText(`Nothing is sent to ${HOD}`);
    await dialog(ld).getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog(ld).getByRole("status")).toContainText("Email is off, so the copy to ldms-test@phn.com.my was only recorded.", { timeout: 30_000 });
    await ld.goto("jobs");
    const copy = ld.getByRole("table", { name: "Emails" }).getByRole("row").nth(1);
    await expect(copy).toContainText("Copy for L&D");
    await expect(copy).toContainText(`[Copy of ${HOD}'s reminder]`);
    await expect(copy).toContainText("Recorded only");
    await ld.goto(previewUrl);
  });

  await test.step("what the email lists is what the HOD's Approvals page shows", async () => {
    const hod = await as(browser, "10231");
    await hod.goto("approvals");
    await expect(panel(hod, "TNAs to approve").getByRole("row")).toHaveCount(2); // the heading and the one TNA
    await hod.context().close();
  });

  await test.step("switched off, that kind leaves the email", async () => {
    await ld.goto("jobs");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Change reminders" }).click();
    await dialog(ld).getByRole("checkbox", { name: /^TNA to approve/ }).uncheck();
    await dialog(ld).getByRole("button", { name: "Save" }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Saved. 12 of 13 kinds of reminder are on.");
    await ld.goto("jobs");
    await expect(ld.getByRole("table", { name: "Reminders" }).getByRole("row", { name: /TNA to approve/ })).toContainText("Off");
    await ld.goto(previewUrl);
    // Either the HOD has other things waiting and the email no longer lists TNAs, or nothing is waiting and they are off the list.
    if ((await ld.locator("iframe").count()) > 0) await expect(email(ld)).not.toContainText("TNAs to approve");
    else await expect(ld.getByRole("heading", { level: 1 })).not.toHaveText(HOD);

    await ld.goto("jobs");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Change reminders" }).click();
    await dialog(ld).getByRole("checkbox", { name: /^TNA to approve/ }).check();
    await dialog(ld).getByRole("button", { name: "Save" }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Saved. Every kind of reminder is on.");
  });

  await test.step("a closing date starts the reminders to those who haven't submitted, and they see it on My TNA", async () => {
    // Back to a draft never submitted: the person has started but not sent it.
    await deleteTestTnas(["10233"], "Stamping");
    await createTestTna("10233", YEAR, "DRAFT");
    await ld.goto("jobs/reminders");
    await expect(people(ld).getByRole("row", { name: /10233/ })).toHaveCount(0);

    await ld.goto("tna");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Set closing date" }).click();
    // A week from today (or the year's last day), typed day first.
    const soon = new Date(Math.min(Date.now() + 8 * 3_600_000 + 7 * 86_400_000, Date.UTC(YEAR, 11, 31)));
    const typed = `${String(soon.getUTCDate()).padStart(2, "0")}/${String(soon.getUTCMonth() + 1).padStart(2, "0")}/${soon.getUTCFullYear()}`;
    const field = dialog(ld).getByLabel("Closing date");
    await field.fill(typed);
    await field.press("Tab");
    await dialog(ld).getByRole("button", { name: "Save" }).click();
    await expect(dialog(ld).getByRole("status")).toContainText(`Saved. ${YEAR}'s TNAs and TNIs close on`);
    await ld.goto("tna");
    await expect(ld.getByText(/^Closing date \d{2} \w{3} \d{4}$/)).toBeVisible();
    await expect(ld.getByRole("button", { name: "Change closing date" })).toBeVisible();

    await ld.goto("jobs/reminders");
    const row = people(ld).getByRole("row", { name: /10233/ });
    await expect(row).toContainText("Your TNA is not submitted yet");
    await row.getByRole("link").first().click();
    await expect(email(ld)).toContainText("Your TNA is not submitted yet (1)");
    await expect(email(ld)).toContainText("Closes on");

    const staff = await as(browser, "10233");
    await staff.goto("my-tna");
    await expect(staff.getByText(/^Submit by \d{2} \w{3} \d{4}$/)).toBeVisible();
    await staff.context().close();
  });

  await test.step("Run now writes one email per person with an address; a second run writes none", async () => {
    await ld.goto("jobs");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Run now" }).click();
    await dialog(ld).getByRole("button", { name: "Run now" }).click();
    await expect(dialog(ld).getByRole("status")).toContainText(/The daily job ran: \d+ people with something waiting, \d+ emails recorded only \(sending is off\)/, { timeout: 60_000 });
    await ld.goto("jobs");
    const emails = ld.getByRole("table", { name: "Emails" });
    const first = emails.getByRole("row").nth(1);
    await expect(first).toContainText("Reminder");
    await expect(first).toContainText("Recorded only");
    await expect(panel(ld, "Emails")).toContainText(/\d+ emails? in the last 90 days/);
    const before = await panel(ld, "Emails").getByText(/\d+ emails? in the last 90 days/).textContent();

    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Run now" }).click();
    await dialog(ld).getByRole("button", { name: "Run now" }).click();
    // No one gets today's twice: nothing new is written, so nothing is sent or recorded.
    await expect(dialog(ld).getByRole("status")).toContainText(/The daily job ran: \d+ people with something waiting, 0 emails sent/, { timeout: 60_000 });
    await ld.goto("jobs");
    await expect(panel(ld, "Emails").getByText(/\d+ emails? in the last 90 days/)).toHaveText(before!);
  });

  await test.step("the closing date can be removed again", async () => {
    await ld.goto("tna");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Change closing date" }).click();
    await dialog(ld).getByRole("button", { name: "Remove the closing date" }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Removed. No one is reminded to start their TNA or TNI.");
    await ld.goto("jobs/reminders");
    await expect(people(ld).getByRole("row", { name: /10233/ })).toHaveCount(0);
  });

  await test.step("only L&D have these screens", async () => {
    const hod = await as(browser, "10231");
    expect((await hod.goto("jobs/reminders"))?.status()).toBe(403);
    expect((await hod.goto(previewUrl))?.status()).toBe(403);
    await hod.goto("tna");
    await expect(hod.getByRole("button", { name: /closing date/ })).toHaveCount(0);
    await hod.context().close();
  });
});

