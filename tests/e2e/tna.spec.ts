import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { createTestTna, deleteTestTnas, giveDemoPassword, giveRole, setJobGrade, setTnaYearSetting } from "./db";
import { choose, DEMO_PASSWORD, signIn } from "./helpers";

// TNA runs in Stamping:
//   10232 Ahmad Zulkifli bin Rosli, an executive: fills in his own
//   10233 Teh Pei Shan, an executive: carries last year's forward
//   10003 Ooi Boon Kiat, given the main clerk role for the run: fills in a job grade's
//   10231 Nor Azlina binti Rosli, the HOD: changes, sends back, approves
// with 10235 and 10236 put on job grade 4 for the run. 10001 (L&D) reopens,
// sees the summary and keeps the option lists; 10002 (main clerk in another
// department) checks who else can see what. Everything made is removed at the end.
const AHMAD = "Ahmad Zulkifli bin Rosli";
const HOD = "Nor Azlina binti Rosli";
const YEAR = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
const ESG_OPTION = "EU BATTERY REGULATION AWARENESS";
const NEW_OPTION = "E2E FORKLIFT REFRESHER";
const IMPORTED_OPTION = "E2E IMPORTED COURSE";

const restore: (() => Promise<void>)[] = [];
let removeRole: () => Promise<void> = async () => {};

test.beforeAll(async () => {
  await deleteTestTnas(["10232", "10233"], "Stamping", [NEW_OPTION, IMPORTED_OPTION]);
  restore.push(await giveDemoPassword("10232", DEMO_PASSWORD), await giveDemoPassword("10233", DEMO_PASSWORD), await setJobGrade(["10235", "10236"], 4));
  removeRole = await giveRole("10003", "MAIN_CLERK");
  restore.push(await setTnaYearSetting(YEAR));
});
test.afterAll(async () => {
  await deleteTestTnas(["10232", "10233"], "Stamping", [NEW_OPTION, IMPORTED_OPTION]);
  await removeRole();
  for (const undo of restore) await undo();
});

/** A signed-in page of its own, so people can take turns. */
async function as(browser: Browser, staffNo: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staffNo);
  return page;
}

const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const nav = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
/** A row of the form: the fieldset named by its heading and number. */
const formRow = (page: Page, heading: string, n = 1) => page.getByRole("group", { name: `${heading}, row ${n}`, exact: true });

/** Fills in every part of a form row but the training. */
async function fillRest(row: Locator, problem: string, target: string, current: string) {
  await row.getByRole("textbox", { name: /^Problem statement/ }).fill(problem);
  await choose(row, "Target skill", target);
  await choose(row, "Current skill", current);
  await choose(row, "How will this be achieved?", "Coaching");
  await choose(row, "When", "Mar");
}

test("a person's TNA goes from draft to approved: fill in, submit, the HOD sends it back, then changes and approves it; L&D reopen and approve", async ({ browser }) => {
  test.setTimeout(300_000);
  const staff = await as(browser, "10232");
  const hod = await as(browser, "10231");
  let id = 0;

  await test.step("an executive starts their own TNA and saves a draft", async () => {
    await expect(nav(staff, /^My TNA/)).toBeVisible();
    // A plain staff member has My TNA only, not the Team screen.
    await expect(nav(staff, /^TNA/)).toHaveCount(0);
    await staff.goto("my-tna");
    await expect(staff.getByRole("heading", { name: "My TNA", level: 1 })).toBeVisible();
    await expect(staff.getByText(`Your TNA for ${YEAR} hasn't been started`)).toBeVisible();
    await staff.getByRole("link", { name: "Start my TNA" }).click();
    await expect(staff.getByRole("heading", { name: `My TNA for ${YEAR}`, level: 1 })).toBeVisible();
    await staff.waitForLoadState("networkidle");

    // Nothing added: there is nothing to save, even as a draft.
    await staff.getByRole("button", { name: "Save as draft" }).click();
    await expect(staff.getByRole("alert").first()).toHaveText("Add at least one training need before saving.");

    // A row with only its problem statement is enough for a draft ...
    await staff.getByRole("button", { name: "Add a row under a. ESG" }).click();
    const row = formRow(staff, "a. ESG");
    await row.getByRole("textbox", { name: /^Problem statement/ }).fill("Scrap isn't sorted at the line");
    // ... but not to submit.
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await expect(row.getByRole("alert")).toHaveText("Fill in the training required, the target skill, the current skill, how it will be achieved and when.");
    await staff.getByRole("button", { name: "Save as draft" }).click();
    await expect(staff.getByRole("status").first()).toHaveText("Draft saved. Submit it to the HOD when it's complete.");
    await expect(staff).toHaveURL(/\/my-tna\?saved=draft/);
    await expect(panel(staff, "Record")).toContainText("Draft");
    await expect(panel(staff, "a. ESG")).toContainText("Scrap isn't sorted at the line");

    // Submitting the unfinished draft from its page is refused, with what is missing.
    await staff.waitForLoadState("networkidle");
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await dialog(staff).getByRole("button", { name: "Submit" }).click();
    await expect(dialog(staff).getByRole("alert")).toContainText("This TNA isn't complete yet (row 1: Fill in the training required");
    await dialog(staff).getByRole("button", { name: "Cancel" }).click();
  });

  await test.step("they finish it and submit; the HOD hasn't seen it until then", async () => {
    await hod.goto("approvals");
    await expect(panel(hod, "TNAs to approve").getByRole("row", { name: new RegExp(AHMAD) })).toHaveCount(0);

    await staff.getByRole("link", { name: "Edit" }).click();
    await staff.waitForLoadState("networkidle");
    const row = formRow(staff, "a. ESG");
    await expect(row.getByRole("textbox", { name: /^Problem statement/ })).toHaveValue("Scrap isn't sorted at the line");
    await choose(row, "Training required", ESG_OPTION);
    await fillRest(row, "Scrap isn't sorted at the line", "4", "2");
    // The gap is worked out: target minus current.
    await expect(row.getByLabel("Gap, a. ESG, row 1: 2")).toBeVisible();
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await expect(staff.getByRole("status").first()).toHaveText("Submitted. The HOD can now approve it, change it or send it back.");
    await expect(panel(staff, "Record")).toContainText("Waiting for HOD");
    await expect(panel(staff, "a. ESG")).toContainText(ESG_OPTION);
    // With the HOD: they can't change or delete it, and can never approve it.
    await expect(staff.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(staff.getByRole("button", { name: "Delete" })).toBeHidden();
    await expect(staff.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await staff.goto("my-tna/edit");
    await expect(staff.getByText("This TNA is with the HOD for approval. It can be changed only if they send it back.")).toBeVisible();
  });

  await test.step("the HOD sends it back with a reason", async () => {
    await hod.goto("approvals");
    await expect(nav(hod, /^Approvals/)).toContainText(/[1-9]/);
    const waiting = panel(hod, "TNAs to approve").getByRole("row", { name: new RegExp(AHMAD) });
    await expect(waiting).toContainText(String(YEAR));
    await waiting.getByRole("link", { name: "Review" }).click();
    await expect(hod.getByRole("heading", { name: AHMAD, level: 1 })).toBeVisible();
    id = Number(new URL(hod.url()).pathname.split("/").pop());

    await hod.waitForLoadState("networkidle");
    await hod.getByRole("button", { name: "Send back" }).click();
    await dialog(hod).getByRole("button", { name: "Send back" }).click();
    await expect(dialog(hod).getByText("Say what needs changing")).toBeVisible();
    await dialog(hod).getByLabel("Reason").fill("Move the battery course to June");
    await dialog(hod).getByRole("button", { name: "Send back" }).click();
    await expect(dialog(hod).getByRole("status")).toHaveText("Sent back. It can now be changed and submitted again.");
    await dialog(hod).getByRole("button", { name: "Close" }).click();
    await expect(panel(hod, "Record")).toContainText("Sent back");
  });

  await test.step("the person sees why, changes it and submits again; the HOD adds a row and approves in one save, and it is locked", async () => {
    await staff.goto("my-tna");
    await expect(nav(staff, /^My TNA/)).toContainText("1");
    await expect(staff.getByText(`${HOD} sent this back`)).toBeVisible();
    await expect(staff.getByText("Move the battery course to June")).toBeVisible();
    await staff.getByRole("link", { name: "Edit" }).click();
    await staff.waitForLoadState("networkidle");
    await choose(formRow(staff, "a. ESG"), "When", "Jun");
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await expect(staff.getByRole("status").first()).toHaveText("Submitted. The HOD can now approve it, change it or send it back.");
    await expect(panel(staff, "a. ESG")).toContainText("Jun");

    // The HOD's save approves, as the old system's Save & Approve did: there is no saving it and leaving it waiting.
    await hod.goto(`tna/${id}`);
    await hod.getByRole("link", { name: "Edit" }).click();
    await hod.waitForLoadState("networkidle");
    await expect(hod.getByRole("button", { name: "Save as draft" })).toHaveCount(0);
    await expect(hod.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await hod.getByRole("button", { name: "Add a row under g. Special project" }).click();
    const added = formRow(hod, "g. Special project");
    await choose(added, "Training required", "Others");
    await added.getByRole("textbox", { name: /^Name of the training/ }).fill("Die maintenance clinic");
    await fillRest(added, "Dies wait too long for repair", "3", "1");
    await hod.getByRole("button", { name: "Save and approve" }).click();
    await expect(hod.getByRole("status").first()).toHaveText("Saved and approved. It is now locked; L&D can reopen it.");
    await expect(panel(hod, "g. Special project")).toContainText("Die maintenance clinic");
    await expect(panel(hod, "Record")).toContainText("Approved");
    await expect(hod.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(hod.getByRole("button", { name: "Send back" })).toBeHidden();
    // The HOD can't reopen it: that is L&D's.
    await expect(hod.getByRole("button", { name: "Reopen" })).toHaveCount(0);

    await staff.goto("my-tna");
    await expect(staff.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await staff.goto("my-tna/edit");
    await expect(staff.getByText("This TNA is approved, so it can't be changed. L&D can reopen it.")).toBeVisible();
    // Their own TNA has one address: the Team address sends them to My TNA.
    await staff.goto(`tna/${id}`);
    await expect(staff).toHaveURL(/\/my-tna$/);
  });

  await test.step("L&D see it in the list, the summary and the export, and reopen it with a reason", async () => {
    const ld = await as(browser, "10001");
    await ld.goto("tna?q=10232");
    const row = ld.getByRole("table", { name: "Individual TNAs" }).getByRole("row", { name: new RegExp(AHMAD) });
    await expect(row).toContainText("Approved");

    await ld.goto("tna/summary");
    await expect(ld.getByRole("heading", { name: "TNA summary", level: 1 })).toBeVisible();
    const stamping = ld.getByRole("table", { name: "TNAs by department" }).getByRole("row", { name: /Stamping/ });
    await expect(stamping.first()).toBeVisible();
    await expect(panel(ld, "Asked for most")).toContainText(ESG_OPTION);
    await expect(panel(ld, "How it will be achieved")).toContainText("Coaching");

    const download = ld.waitForEvent("download");
    await ld.getByRole("link", { name: "Export to Excel" }).click();
    const file = test.info().outputPath("tna.xlsx");
    await (await download).saveAs(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(`TNA ${YEAR}`)!;
    const header = Array.from(ws.getRow(1).values as unknown[], (v) => String(v ?? ""));
    const found: unknown[][] = [];
    ws.eachRow((r) => {
      const values = r.values as unknown[];
      if (values[header.indexOf("Staff No")] === "10232") found.push(values);
    });
    expect(found).toHaveLength(2);
    const cell = (r: unknown[], name: string) => r[header.indexOf(name)] ?? "";
    expect(cell(found[0], "Training Required")).toBe(ESG_OPTION);
    expect(cell(found[0], "Gap")).toBe(2);
    expect(cell(found[0], "When")).toBe("Jun");
    expect(cell(found[0], "Status")).toBe("Approved");
    expect(cell(found[0], "Approved By")).toBe(HOD);
    expect(cell(found[1], "Heading")).toBe("g. Special project");
    expect(cell(found[1], "Training Required")).toBe("Die maintenance clinic");
    expect(cell(found[1], "Others (typed in)")).toBe("Yes");

    await ld.goto(`tna/${id}`);
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Reopen" }).click();
    await dialog(ld).getByRole("button", { name: "Reopen" }).click();
    await expect(dialog(ld).getByText("Say why it is being reopened")).toBeVisible();
    await dialog(ld).getByLabel("Reason").fill("Budget changed");
    await dialog(ld).getByRole("button", { name: "Reopen" }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Reopened. It can now be changed, and must be submitted and approved again.");
    await dialog(ld).getByRole("button", { name: "Close" }).click();
    await expect(panel(ld, "Record")).toContainText("Sent back");
    await expect(panel(ld, "History")).toContainText("Budget changed");
    await ld.context().close();

    await staff.goto("my-tna");
    await expect(staff.getByText("Budget changed")).toBeVisible();
    await staff.waitForLoadState("networkidle");
    await staff.getByRole("button", { name: "Submit to HOD" }).click();
    await dialog(staff).getByRole("button", { name: "Submit" }).click();
    await expect(dialog(staff).getByRole("status")).toHaveText("Sent to the HOD for approval.");

    // L&D can approve as well as the HOD, as in the old system.
    const again = await as(browser, "10001");
    await again.goto(`tna/${id}`);
    await again.waitForLoadState("networkidle");
    await again.getByRole("button", { name: "Approve" }).click();
    await dialog(again).getByRole("button", { name: "Approve" }).click();
    await expect(dialog(again).getByRole("status")).toHaveText("Approved.");
    await dialog(again).getByRole("button", { name: "Close" }).click();
    await expect(panel(again, "Record")).toContainText("Approved");
    await again.context().close();
  });
});

test("a job grade's TNA, last year's carried forward, who sees what, and L&D's option lists", async ({ browser }) => {
  test.setTimeout(480_000);
  const clerk = await as(browser, "10003");
  const hod = await as(browser, "10231");
  let gradeId = 0;

  await test.step("the department's main clerk fills in the TNA for a job grade", async () => {
    await expect(nav(clerk, /^TNA/)).toBeVisible();
    await clerk.goto("tna");
    // A main clerk has the job grades only: no list of people's own TNAs.
    await expect(clerk.getByRole("navigation", { name: "Kind of TNA" })).toHaveCount(0);
    await expect(clerk.getByRole("table", { name: "Individual TNAs" })).toHaveCount(0);
    const row = clerk.getByRole("table", { name: "TNAs by job grade" }).getByRole("row", { name: /Stamping.*Grade 4/ });
    await expect(row).toContainText("Not started");
    await expect(row.getByRole("cell").nth(3)).toHaveText("2");
    await row.getByRole("link", { name: "Start" }).click();
    await expect(clerk.getByRole("heading", { name: "Job grade 4", level: 1 })).toBeVisible();
    await expect(clerk.getByText("Covers 2 staff members")).toBeVisible();
    await clerk.waitForLoadState("networkidle");
    await clerk.getByRole("button", { name: "Add a row under e. Functional awareness" }).click();
    const form = formRow(clerk, "e. Functional awareness");
    // Functional awareness lists its trainings in groups; searching finds one.
    await form.getByLabel("Training required", { exact: true }).click();
    await form.getByRole("combobox", { name: "Search options" }).fill("predictive");
    await form.getByRole("option", { name: /PREDICTIVE MAINTENANCE USING IOT/ }).click();
    await fillRest(form, "Breakdowns aren't seen coming", "3", "2");
    await clerk.getByRole("button", { name: "Submit to HOD" }).click();
    await expect(clerk.getByRole("status").first()).toHaveText("Submitted. The HOD can now approve it, change it or send it back.");
    await clerk.waitForURL(/\/tna\/\d+\?/);
    gradeId = Number(new URL(clerk.url()).pathname.split("/").pop());
    await expect(panel(clerk, "e. Functional awareness")).toContainText("PREDICTIVE MAINTENANCE USING IOT");
    await expect(clerk.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });

  await test.step("the HOD approves it from Approvals", async () => {
    await hod.goto("approvals");
    const waiting = panel(hod, "TNAs to approve").getByRole("row", { name: /Job grade 4/ });
    await expect(waiting).toContainText("Ooi Boon Kiat");
    await waiting.getByRole("link", { name: "Review" }).click();
    await expect(hod.getByRole("heading", { name: "Job grade 4", level: 1 })).toBeVisible();
    await hod.waitForLoadState("networkidle");
    await hod.getByRole("button", { name: "Approve" }).click();
    await dialog(hod).getByRole("button", { name: "Approve" }).click();
    await expect(dialog(hod).getByRole("status")).toHaveText("Approved.");
    await dialog(hod).getByRole("button", { name: "Close" }).click();
    await hod.goto("tna?view=grade");
    await expect(hod.getByRole("table", { name: "TNAs by job grade" }).getByRole("row", { name: /Stamping.*Grade 4/ })).toContainText("Approved");
  });

  await test.step("an earlier year stays on record, view-only, and is carried forward as a start", async () => {
    await createTestTna("10233", YEAR - 1, "APPROVED");
    const staff = await as(browser, "10233");
    await staff.goto("my-tna");
    await expect(staff.getByText(`Your TNA for ${YEAR} hasn't been started`)).toBeVisible();
    await staff.getByRole("link", { name: String(YEAR - 1), exact: true }).click();
    await expect(panel(staff, "g. Special project")).toContainText("Test kaizen project");
    await expect(panel(staff, "Record")).toContainText("Approved");
    await expect(staff.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await staff.getByRole("link", { name: `Start ${YEAR}'s from this` }).click();
    await expect(staff.getByText(`Started from your ${YEAR - 1} TNA.`)).toBeVisible();
    await staff.waitForLoadState("networkidle");
    const row = formRow(staff, "g. Special project");
    await expect(row.getByRole("textbox", { name: /^Problem statement/ })).toHaveValue("Changeovers take too long");
    await expect(row.getByRole("textbox", { name: /^Name of the training/ })).toHaveValue("Test kaizen project");
    await staff.getByRole("button", { name: "Save as draft" }).click();
    await expect(staff.getByRole("status").first()).toHaveText("Draft saved. Submit it to the HOD when it's complete.");
    // Last year's is still there, unchanged.
    await staff.getByRole("link", { name: String(YEAR - 1), exact: true }).click();
    await expect(panel(staff, "Record")).toContainText("Approved");

    // Someone with only My TNA can't open the Team screens, or anyone else's TNA.
    expect((await staff.goto("tna"))?.status()).toBe(403);
    expect((await staff.goto(`tna/${gradeId}`))?.status()).toBe(403);
    expect((await staff.goto("tna/summary"))?.status()).toBe(403);
    expect((await staff.goto("tna/options"))?.status()).toBe(403);
    expect((await staff.request.get(`tna/export?year=${YEAR}`)).status()).toBe(403);
    expect((await staff.request.get("tna/options/export")).status()).toBe(403);
    await staff.context().close();
  });

  await test.step("another department's main clerk doesn't see Stamping's; without the role, neither does this one", async () => {
    const other = await as(browser, "10002");
    expect((await other.goto("tna"))?.status()).toBe(200);
    await expect(other.getByRole("row", { name: /Stamping/ })).toHaveCount(0);
    expect((await other.goto(`tna/${gradeId}`))?.status()).toBe(404);
    expect((await other.goto("tna/new?department=1&grade=4"))?.status()).toBe(404);
    expect((await other.goto("tna/summary"))?.status()).toBe(403);
    await other.context().close();

    await removeRole();
    removeRole = async () => {};
    expect((await clerk.goto("tna"))?.status()).toBe(403);
    expect((await clerk.goto(`tna/${gradeId}`))?.status()).toBe(403);
    await expect(nav(clerk, /^TNA/)).toHaveCount(0);
  });

  await test.step("L&D add, hide and delete a training option, and download the lists", async () => {
    const ld = await as(browser, "10001");
    await ld.goto("tna");
    await ld.getByRole("link", { name: "Training options" }).click();
    await expect(ld.getByRole("heading", { name: "Training options", level: 1 })).toBeVisible();
    // An option a saved row uses (the job grade's TNA above) can be hidden, not deleted; one that isn't used can be.
    await ld.getByRole("link", { name: /^e. Functional awareness/ }).click();
    const used = ld.getByRole("row", { name: /PREDICTIVE MAINTENANCE USING IOT/ });
    await expect(used.getByRole("cell").nth(3)).toHaveText("1");
    await expect(used.getByRole("button", { name: /^Hide/ })).toBeVisible();
    await expect(used.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
    await expect(ld.getByRole("row", { name: /EV COMPONENT SAFETY STANDARDS/ }).getByRole("button", { name: /^Delete/ })).toBeVisible();

    await ld.getByRole("link", { name: /^g\. Special project/ }).click();
    await expect(ld.getByText("This list is empty")).toBeVisible();
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: "Add option" }).click();
    await dialog(ld).getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog(ld).getByText("Give it a name")).toBeVisible();
    await dialog(ld).getByLabel("Training name").fill("e2e  forklift refresher");
    await dialog(ld).getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Added. It can be picked on the form from now on.");
    await dialog(ld).getByRole("button", { name: "Close" }).click();
    const added = ld.getByRole("row", { name: new RegExp(NEW_OPTION) });
    await expect(added).toContainText("Active");

    const download = ld.waitForEvent("download");
    await ld.getByRole("link", { name: "Download Excel" }).click();
    const file = test.info().outputPath("options.xlsx");
    await (await download).saveAs(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const names: string[] = [];
    wb.getWorksheet("Training Options")!.eachRow((r) => names.push(String(r.getCell(4).value)));
    expect(names[0]).toBe("Training Name");
    expect(names).toContain(NEW_OPTION);
    expect(names).toContain(ESG_OPTION);

    // The same file, with one row added, imports: every change is shown first, and only that row changes.
    const sheet = wb.getWorksheet("Training Options")!;
    sheet.getRow(names.length + 1).values = ["", "g", "", "e2e imported course", ""];
    const changed = test.info().outputPath("options-changed.xlsx");
    await wb.xlsx.writeFile(changed);
    await ld.getByRole("link", { name: "Import from Excel" }).click();
    await expect(ld.getByRole("heading", { name: "Import training options", level: 1 })).toBeVisible();
    await ld.waitForLoadState("networkidle");
    await ld.getByLabel("Excel file (.xlsx)").setInputFiles(changed);
    await ld.getByRole("button", { name: "Check file" }).click();
    const changes = ld.getByRole("table", { name: "Changes in the file" });
    await expect(changes.getByRole("row")).toHaveCount(2);
    await expect(changes.getByRole("row", { name: new RegExp(IMPORTED_OPTION) })).toContainText("New");
    await expect(ld.getByText("0 to change")).toBeVisible();
    await expect(ld.getByText("0 with errors")).toBeVisible();
    await ld.getByRole("button", { name: "Make 1 change" }).click();
    await expect(ld.getByRole("status")).toHaveText("Import finished: 1 added, 0 changed.");
    await ld.getByRole("link", { name: "View the lists" }).click();
    await ld.getByRole("link", { name: /^g. Special project/ }).click();
    await expect(ld.getByRole("row", { name: new RegExp(IMPORTED_OPTION) })).toContainText("Active");
    await ld.waitForLoadState("networkidle");

    await added.getByRole("button", { name: /^Hide/ }).click();
    await expect(added).toContainText("Hidden");
    await added.getByRole("button", { name: /^Delete/ }).click();
    await dialog(ld).getByRole("button", { name: "Delete" }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText("Deleted.");
    await dialog(ld).getByRole("button", { name: "Close" }).click();
    await expect(ld.getByRole("row", { name: new RegExp(NEW_OPTION) })).toHaveCount(0);
    await expect(ld.getByRole("row", { name: new RegExp(IMPORTED_OPTION) })).toBeVisible();
    await ld.context().close();
  });
});

test("L&D open next year's TNAs before January: this year's close, and it can be undone while no one has started", async ({ browser }) => {
  test.setTimeout(240_000);
  const NEXT = YEAR + 1;
  const ld = await as(browser, "10001");
  const staff = await as(browser, "10233");

  await test.step("until then, this year's is the one being filled in", async () => {
    await staff.goto("my-tna");
    await expect(staff.getByText(String(YEAR)).first()).toBeVisible();
    // Only L&D have the switch.
    const hod = await as(browser, "10231");
    await hod.goto("tna");
    await expect(hod.getByRole("button", { name: `Open ${NEXT}` })).toHaveCount(0);
    await hod.context().close();
  });

  await test.step("L&D open next year's", async () => {
    await ld.goto("tna");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: `Open ${NEXT}` }).click();
    await expect(dialog(ld).getByText(`${YEAR}'s TNAs close`)).toBeVisible();
    await dialog(ld).getByRole("button", { name: `Open ${NEXT}` }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText(`${NEXT}'s TNAs and TNIs are now the ones being filled in.`);
    await ld.goto("tna");
    await expect(ld.getByText("Opened early", { exact: true })).toBeVisible();
    await expect(ld.getByRole("heading", { name: "TNA", level: 1 })).toBeVisible();
    // This year's is now closed: view only.
    await ld.goto(`tna?year=${YEAR}`);
    await expect(ld.getByText("Closed: view only")).toBeVisible();
    await expect(ld.getByText(`${YEAR}'s TNAs are closed, so they can only be viewed.`)).toBeVisible();
  });

  await test.step("staff now fill in next year's; this year's can't be started", async () => {
    await staff.goto("my-tna");
    await expect(staff.getByText(`Your TNA for ${NEXT} hasn't been started`)).toBeVisible();
    await staff.getByRole("link", { name: "Start my TNA" }).click();
    await expect(staff.getByRole("heading", { name: `My TNA for ${NEXT}`, level: 1 })).toBeVisible();

    // The same switch moves the TNI: HODs fill in next year's, and this year's is view-only.
    const hod = await as(browser, "10231");
    await hod.goto("tni");
    await expect(hod.getByText("Opened early", { exact: true })).toBeVisible();
    await expect(hod.getByText(String(NEXT)).first()).toBeVisible();
    await hod.goto(`tni?year=${YEAR}`);
    await expect(hod.getByText(`${YEAR}'s TNI is closed, so it can only be viewed.`)).toBeVisible();
    await hod.context().close();
  });

  await test.step("L&D close it again, as no one has started one", async () => {
    await ld.goto("tna");
    await ld.waitForLoadState("networkidle");
    await ld.getByRole("button", { name: `Close ${NEXT} again` }).click();
    await dialog(ld).getByRole("button", { name: `Close ${NEXT}`, exact: true }).click();
    await expect(dialog(ld).getByRole("status")).toHaveText(`${YEAR}'s TNAs and TNIs are now the ones being filled in.`);
    await staff.goto("my-tna/edit");
    await expect(staff.getByRole("heading", { name: `My TNA for ${YEAR}`, level: 1 })).toBeVisible();
  });
});
