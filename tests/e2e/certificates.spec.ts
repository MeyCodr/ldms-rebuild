import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { CERTIFICATE_DIR, createTestTraining, deleteTestTraining, storedCertificate } from "./db";
import { signIn } from "./helpers";

// A certificate is one file per training. Each test makes its own training
// (unique title) and removes it, with its files, at the end.
const suffix = String(Date.now()).slice(-6);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

/** Opens the certificate's preview from the region; returns the preview dialog. */
async function preview(page: Page, region: Locator) {
  await region.getByRole("button", { name: "View certificate" }).click();
  const dialog = page.getByRole("dialog", { name: "Certificate" });
  await expect(dialog.getByTestId("certificate-preview")).not.toContainText("Loading");
  return dialog;
}

/** Downloads from the preview, closes it, and returns what was downloaded. */
async function download(page: Page, region: Locator) {
  const dialog = await preview(page, region);
  const event = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download" }).click();
  const bytes = await readFile((await (await event).path())!);
  await dialog.getByRole("button", { name: "Close" }).click();
  return bytes;
}

async function switchTo(page: Page, staffNo: string) {
  await page.context().clearCookies();
  await signIn(page, staffNo);
}

test("L&D upload a training's certificate; those who completed it download it, and no one else", async ({ page }) => {
  const title = `Certificate check ${suffix}`;
  const id = await createTestTraining(title, [
    { staffNo: "10231", attendance: "COMPLETED" },
    { staffNo: "10002", attendance: "PENDING" },
  ]);
  try {
    await signIn(page, "10001");
    await page.goto(`trainings/${id}`);
    const panel = page.getByRole("region", { name: "Certificate" });
    const upload = panel.getByRole("button", { name: "Upload certificate" });

    // Too big: stopped in the page. Not really a PDF: refused by the server, whatever it's called.
    await panel.getByLabel("Certificate file").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await upload.click();
    await expect(panel.getByRole("alert")).toContainText("larger than 5 MB");
    await panel.getByLabel("Certificate file").setInputFiles({ name: "certificate.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some text") });
    await upload.click();
    await expect(panel.getByRole("alert")).toContainText("Only PDF, JPG or PNG");

    await panel.getByLabel("Certificate file").setInputFiles({ name: "Class of September.pdf", mimeType: "application/pdf", buffer: PDF });
    await upload.click();
    await expect(panel.getByRole("status")).toHaveText("Certificate uploaded.");
    await expect(panel.getByTestId("certificate-name")).toHaveText("Class of September.pdf");
    const first = (await storedCertificate(id))!;
    expect(existsSync(path.join(CERTIFICATE_DIR, first))).toBe(true);
    // The preview shows the PDF itself, with what L&D can do with it.
    const shown = await preview(page, panel);
    await expect(shown.locator("iframe")).toHaveAttribute("src", /^blob:/);
    await expect(shown.getByRole("button", { name: "Replace" })).toBeVisible();
    await expect(shown.getByRole("button", { name: "Delete" })).toBeVisible();
    await shown.getByRole("button", { name: "Close" }).click();
    expect((await download(page, panel)).equals(PDF)).toBe(true);

    // The list and its export say it has one.
    await page.goto(`trainings?q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("Yes");
    const exported = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export to Excel" }).click();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await (await exported).path())!);
    const ws = wb.getWorksheet("Trainings")!;
    const header = ws.getRow(1).values as string[];
    expect(ws.getRow(2).getCell(header.indexOf("Certificate")).value).toBe("Yes");

    // Someone who completed it downloads it from My training, and can't change it.
    await switchTo(page, "10231");
    await page.goto("my-training");
    await page.getByRole("link", { name: title }).click();
    const mine = page.getByRole("region", { name: "Certificate" });
    const theirs = await preview(page, mine);
    await expect(theirs.getByRole("button", { name: /Replace|Delete/ })).toHaveCount(0);
    await theirs.getByRole("button", { name: "Close" }).click();
    expect((await download(page, mine)).equals(PDF)).toBe(true);

    // Someone still pending sees why not, and the link refuses them.
    await switchTo(page, "10002");
    await page.goto("my-training");
    await page.getByRole("link", { name: title }).click();
    const pending = page.getByRole("region", { name: "Certificate" });
    await expect(pending).toContainText("You can download it once you've completed the training.");
    await expect(pending.getByRole("button")).toHaveCount(0);
    expect((await page.request.get(`certificates/${id}`)).status()).toBe(404);

    // Someone not on it at all.
    await switchTo(page, "10003");
    expect((await page.request.get(`certificates/${id}`)).status()).toBe(404);

    // L&D replace it, then remove it: each time the old file goes.
    await switchTo(page, "10001");
    await page.goto(`trainings/${id}`);
    const replacing = await preview(page, panel);
    await replacing.getByRole("button", { name: "Replace" }).click();
    await replacing.getByLabel("Certificate file").setInputFiles({ name: "scan", mimeType: "image/png", buffer: PNG });
    await replacing.getByRole("button", { name: "Replace certificate" }).click();
    await expect(panel.getByRole("status")).toHaveText("Certificate replaced.");
    await expect(panel.getByTestId("certificate-name")).toHaveText("scan.png");
    const second = (await storedCertificate(id))!;
    expect(second).toMatch(/\.png$/);
    expect(existsSync(path.join(CERTIFICATE_DIR, first))).toBe(false);

    // An image shows as an image.
    const deleting = await preview(page, panel);
    await expect(deleting.getByRole("img", { name: "Certificate: scan.png" })).toBeVisible();
    await deleting.getByRole("button", { name: "Delete" }).click();
    await deleting.getByRole("button", { name: "Delete certificate" }).click();
    await expect(panel.getByRole("status")).toHaveText("Certificate deleted.");
    await expect(panel.getByRole("button", { name: "Upload certificate" })).toBeVisible();
    expect(await storedCertificate(id)).toBeNull();
    expect(existsSync(path.join(CERTIFICATE_DIR, second))).toBe(false);
    // In the training's history.
    await expect(page.getByRole("region", { name: "History" })).toContainText("Removed the certificate");
  } finally {
    await deleteTestTraining(title);
  }
});

test("a clerk uploads the certificate for an OJT they recorded", async ({ page }) => {
  const title = `Certificate OJT ${suffix}`;
  const day = new Date(Date.now() + 8 * 3600_000 - 2 * 86_400_000).toISOString().slice(0, 10);
  try {
    await signIn(page, "10003");
    // Record one through the template.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("OJT Import");
    ws.addRow(["Title", "Venue", "Start Date", "End Date", "Start Time", "End Time", "Trainer Type", "Trainer Name", "Participant Staff No"]);
    ws.addRow([title, "Press Line A", day, day, "08:00", "10:00", "INTERNAL", "Ahmad bin Ali", "C2042"]);
    await page.goto("ojt/import");
    await page
      .getByLabel("Excel file (.xlsx)")
      .setInputFiles({
        name: "ojt.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      });
    await page.getByRole("button", { name: "Check file" }).click();
    await page.getByRole("button", { name: "Import 1 OJT for 1 staff record" }).click();
    await expect(page.getByRole("status")).toHaveText("Import finished: 1 OJT for 1 staff record.");

    await page.goto(`ojt?q=${encodeURIComponent(title)}`);
    await page.getByRole("link", { name: title }).click();
    const panel = page.getByRole("region", { name: "Certificate" });
    await panel.getByLabel("Certificate file").setInputFiles({ name: "ojt-certificate.pdf", mimeType: "application/pdf", buffer: PDF });
    await panel.getByRole("button", { name: "Upload certificate" }).click();
    await expect(panel.getByTestId("certificate-name")).toHaveText("ojt-certificate.pdf");
    expect((await download(page, panel)).equals(PDF)).toBe(true);
  } finally {
    await deleteTestTraining(title);
  }
});
