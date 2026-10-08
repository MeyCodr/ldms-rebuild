import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { createTestTni, deleteTestTnis, giveDemoPassword } from "./db";
import { choose, DEMO_PASSWORD, signIn } from "./helpers";

// TNI is Stamping's list for the year, kept by its HOD:
//   10231 Nor Azlina binti Rosli, the HOD: fills in and changes
//   10001 L&D: sees every department's, and the export
//   10232 an executive, and 10318 the HOD of another department: kept out
// Stamping's TNIs are removed at the end.
const HOD = "Nor Azlina binti Rosli";
const YEAR = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
const restore: (() => Promise<void>)[] = [];

test.beforeAll(async () => {
  await deleteTestTnis("Stamping");
  restore.push(await giveDemoPassword("10232", DEMO_PASSWORD), await giveDemoPassword("10318", DEMO_PASSWORD));
});
test.afterAll(async () => {
  await deleteTestTnis("Stamping");
  for (const undo of restore) await undo();
});

async function as(browser: Browser, staffNo: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staffNo);
  return page;
}

const panel = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const formRow = (page: Page, n: number) => page.getByRole("group", { name: `Row ${n}`, exact: true });
const list = (page: Page) => page.getByRole("table", { name: "TNIs by department" });

async function fillRow(row: Locator, indicator: string, expected: string, actual: string) {
  await row.getByLabel("Performance indicator").fill(indicator);
  await row.getByLabel("Possible causes").fill("No standard work");
  await choose(row, "Expected performance", expected);
  await choose(row, "Actual performance", actual);
  await row.getByLabel("Attitude / Skill / Knowledge").fill("Skill");
  await choose(row, "L&D method", "Coaching");
  await row.getByLabel("Evaluation method").fill("Measured monthly");
}

test("a HOD fills in the department's TNI from last year's, changes it; L&D see it, export it and can change it; others are kept out", async ({ browser }) => {
  test.setTimeout(300_000);
  await createTestTni("Stamping", YEAR - 1);
  const hod = await as(browser, "10231");
  let departmentId = 0;

  await test.step("last year's stays on record, view-only, and starts this year's", async () => {
    await expect(hod.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "TNI", exact: true })).toBeVisible();
    await hod.goto("tni");
    await expect(hod.getByRole("heading", { name: "TNI", level: 1 })).toBeVisible();
    const row = list(hod).getByRole("row", { name: /Stamping/ });
    await expect(row).toContainText("Not filled in");
    await row.getByRole("link", { name: "Stamping" }).click();
    await expect(hod.getByText(`No TNI for ${YEAR} yet`)).toBeVisible();
    departmentId = Number(new URL(hod.url()).pathname.split("/").pop());

    await hod.goto(`tni/${departmentId}?year=${YEAR - 1}`);
    await expect(hod.getByText(`${YEAR - 1}'s TNI is closed, so it can only be viewed.`)).toBeVisible();
    await expect(panel(hod, "Mandatory (within the first 3 months in the role)")).toContainText("Test changeover time");
    await expect(hod.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await hod.getByRole("link", { name: `Start ${YEAR}'s from this` }).click();
    await expect(hod.getByText(`Started from the ${YEAR - 1} TNI.`)).toBeVisible();
    await hod.waitForLoadState("networkidle");
    await expect(formRow(hod, 1).getByLabel("Performance indicator")).toHaveValue("Test changeover time");
  });

  await test.step("there are no drafts: an empty list or an unfinished row can't be saved", async () => {
    await hod.getByRole("button", { name: "Add row" }).click();
    await formRow(hod, 2).getByLabel("Performance indicator").fill("Scrap rate");
    await hod.getByRole("button", { name: "Save" }).click();
    await expect(formRow(hod, 2).getByRole("alert")).toHaveText(
      "Fill in the expected performance, the actual performance, the possible causes, attitude, skill or knowledge, the L&D method and the evaluation method.",
    );
    await fillRow(formRow(hod, 2), "Scrap rate", "5", "2");
    // The gap is worked out: expected minus actual.
    await expect(formRow(hod, 2).getByLabel("Gap, row 2: 3")).toBeVisible();
    await hod.getByRole("button", { name: "Save" }).click();
    await expect(hod.getByRole("status").first()).toContainText(`Saved. L&D can now see Stamping's TNI for ${YEAR}.`);
    const table = hod.getByRole("table", { name: "Performance indicators" });
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table.getByRole("row", { name: /Scrap rate/ })).toContainText("Coaching");

    // Removing every row leaves nothing to save.
    await hod.getByRole("link", { name: "Edit" }).click();
    await hod.waitForLoadState("networkidle");
    await hod.getByRole("button", { name: "Remove row 2" }).click();
    await hod.getByRole("button", { name: "Remove row 1" }).click();
    await hod.getByRole("button", { name: "Save" }).click();
    await expect(hod.getByRole("alert").first()).toHaveText("Add at least one performance indicator before saving.");
  });

  await test.step("the HOD changes it for as long as the year lasts", async () => {
    await hod.goto(`tni/${departmentId}/edit`);
    await hod.waitForLoadState("networkidle");
    await formRow(hod, 2).getByLabel("Evaluation method").fill("Scrap below 1.5% for three months");
    await hod.getByRole("button", { name: "Save" }).click();
    await expect(hod.getByRole("table", { name: "Performance indicators" })).toContainText("Scrap below 1.5% for three months");
    await hod.goto("tni");
    await expect(list(hod).getByRole("row", { name: /Stamping/ })).toContainText("Filled in");
  });

  await test.step("L&D see every department's, export it, and can change one on the department's behalf", async () => {
    const ld = await as(browser, "10001");
    await ld.goto("tni");
    const row = list(ld).getByRole("row", { name: /Stamping/ });
    await expect(row).toContainText("Filled in");
    await expect(row).toContainText(HOD);
    expect(await list(ld).getByRole("row").count()).toBeGreaterThan(5);

    const download = ld.waitForEvent("download");
    await ld.getByRole("link", { name: "Export to Excel" }).click();
    const file = test.info().outputPath("tni.xlsx");
    await (await download).saveAs(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(`TNI ${YEAR}`)!;
    const header = Array.from(ws.getRow(1).values as unknown[], (v) => String(v ?? ""));
    const found: unknown[][] = [];
    ws.eachRow((r) => {
      const values = r.values as unknown[];
      if (values[header.indexOf("Department")] === "Stamping") found.push(values);
    });
    expect(found).toHaveLength(2);
    const cell = (r: unknown[], name: string) => r[header.indexOf(name)] ?? "";
    expect(cell(found[1], "Performance Indicator")).toBe("Scrap rate");
    expect(cell(found[1], "Gap")).toBe(3);
    expect(cell(found[1], "L&D Method")).toBe("Coaching");
    expect(cell(found[1], "Last Saved By")).toBe(HOD);

    await row.getByRole("link", { name: "Stamping" }).click();
    await expect(ld.getByRole("table", { name: "Performance indicators" })).toContainText("Scrap rate");
    await ld.getByRole("link", { name: "Edit" }).click();
    await ld.waitForLoadState("networkidle");
    await formRow(ld, 1).getByLabel("Evaluation method").fill("Changeover under 15 minutes");
    await ld.getByRole("button", { name: "Save" }).click();
    await expect(ld.getByRole("table", { name: "Performance indicators" })).toContainText("Changeover under 15 minutes");
    // The record says who saved it last.
    await expect(ld.getByText("Nor Azlina binti Hamid").first()).toBeVisible();
    // Last year's stays closed for L&D too.
    await ld.goto(`tni/${departmentId}?year=${YEAR - 1}`);
    await expect(ld.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await ld.context().close();
  });

  await test.step("another department's HOD doesn't see Stamping's; plain staff have no TNI screen", async () => {
    const other = await as(browser, "10318");
    expect((await other.goto("tni"))?.status()).toBe(200);
    await expect(list(other).getByRole("row", { name: /Stamping/ })).toHaveCount(0);
    expect((await other.goto(`tni/${departmentId}`))?.status()).toBe(404);
    expect((await other.goto(`tni/${departmentId}/edit`))?.status()).toBe(404);
    await other.context().close();

    const staff = await as(browser, "10232");
    await expect(staff.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "TNI", exact: true })).toHaveCount(0);
    expect((await staff.goto("tni"))?.status()).toBe(403);
    expect((await staff.goto(`tni/${departmentId}`))?.status()).toBe(403);
    expect((await staff.request.get(`tni/export?year=${YEAR}`)).status()).toBe(403);
    await staff.context().close();
  });
});
