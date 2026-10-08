import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { saveServerDocumentAndWait } from "../helpers/save";

test.setTimeout(120_000);

test("inline text editor stays compact and keeps a raster through commit", async ({ page, request }) => {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  sheet.drawText("43", { x: 90, y: 610, size: 116, font });
  const upload = await request.post("/api/opdf/documents?name=inline-text-ux.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: Buffer.from(await doc.save({ useObjectStreams: false })),
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 45000 });
  await page.getByTitle("Edit PDF Content").click();
  const expand = page.locator('[data-opdf-action="expand-right-panel"]');
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(page.locator("[data-opdf-native-editor='true']")).toBeVisible();

  const text = page.locator(".native-edit-page polygon[data-opdf-object-kind='text']").first();
  await expect(text).toBeVisible({ timeout: 45000 });
  await text.dblclick();
  const textarea = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(textarea).toBeVisible();
  const layout = await textarea.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height, fontSize: parseFloat(getComputedStyle(node).fontSize) };
  });
  expect(layout.width).toBeLessThan(65);
  expect(layout.height).toBeLessThan(52);
  expect(layout.fontSize).toBeLessThanOrEqual(20);

  await page.evaluate(() => {
    const shield = document.querySelector(".native-edit-paint-shield") as HTMLElement;
    (window as Window & { __paintShieldActivated?: boolean }).__paintShieldActivated = false;
    new MutationObserver(() => {
      if (shield.style.display === "block") {
        (window as Window & { __paintShieldActivated?: boolean }).__paintShieldActivated = true;
      }
    }).observe(shield, { attributes: true, attributeFilter: ["style"] });
  });
  await textarea.fill("43 edited");
  await textarea.press("Enter");
  await expect(textarea).toHaveCount(0);
  await expect(page.locator(".native-edit-page img, .native-edit-page canvas").first()).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __paintShieldActivated?: boolean }).__paintShieldActivated ?? false,
  ), { timeout: 30000 }).toBe(true);
  await expect(page.locator(".native-content-editor__objects").getByText("43 edited")).toBeVisible({ timeout: 45000 });
});

test("inline blur persists edits through Save and reopen", async ({ page, request }) => {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([500, 700]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  sheet.drawText("Original label 43", { x: 80, y: 570, size: 21, font });
  const upload = await request.post("/api/opdf/documents?name=inline-blur-save-regression.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: Buffer.from(await doc.save({ useObjectStreams: false })),
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 45000 });
  await page.getByTitle("Edit PDF Content").click();
  const expand = page.locator('[data-opdf-action="expand-right-panel"]');
  await expect(expand).toBeVisible();
  await expand.click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible();

  const object = page.locator(".native-edit-page polygon[data-opdf-object-kind='text']").first();
  await expect(object).toBeVisible({ timeout: 30000 });
  await object.dblclick();
  const draft = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(draft).toBeVisible();
  await draft.fill("Saved after blur 85");
  await page.locator(".native-edit-overlay").first().click({ position: { x: 5, y: 5 } });
  await expect(draft).toHaveCount(0, { timeout: 45000 });
  await expect(editor.locator(".native-content-editor__objects button")
    .filter({ hasText: "Saved after blur 85" })).toBeVisible({ timeout: 45000 });
  await expect(page.locator(".native-edit-paint-shield")).toBeHidden({ timeout: 30000 });

  await saveServerDocumentAndWait(page);
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30000 });
  await page.getByTitle("Edit PDF Content").click();
  const reopen = page.locator('[data-opdf-action="expand-right-panel"]');
  await expect(reopen).toBeVisible();
  await reopen.click();
  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened.locator(".native-content-editor__objects button")
    .filter({ hasText: "Saved after blur 85" })).toBeVisible({ timeout: 45000 });
  await expect(reopened.getByText("Original label 43")).toHaveCount(0);
});

test("repeated inline Enter, blur and object switching persist the latest text", async ({ page, request }) => {
  const document = await PDFDocument.create();
  const sheet = document.addPage([595, 800]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  sheet.drawText("ROOM 01", { x: 80, y: 690, font, size: 23 });
  sheet.drawText("ROOM 02", { x: 80, y: 520, font, size: 23 });
  const upload = await request.post("/api/opdf/documents?name=inline-repeat-commit.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: Buffer.from(await document.save({ useObjectStreams: false })),
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 45000 });
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-opdf-action="expand-right-panel"]').click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible({ timeout: 30000 });
  const first = page.locator(".native-edit-page polygon[data-opdf-object-kind='text']").first();
  const second = page.locator(".native-edit-page polygon[data-opdf-object-kind='text']").nth(1);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  const items = editor.locator(".native-content-editor__objects button[data-opdf-object-kind='text']");

  await first.dblclick();
  await input.fill("KITCHEN 10");
  await input.press("Enter");
  await expect(input).toHaveCount(0, { timeout: 45000 });
  await expect(items.filter({ hasText: "KITCHEN 10" })).toHaveCount(1, { timeout: 45000 });

  await first.dblclick();
  await input.fill("STUDY 11");
  await page.locator(".native-edit-overlay").first().click({ position: { x: 5, y: 5 } });
  await expect(input).toHaveCount(0, { timeout: 45000 });
  await expect(items.filter({ hasText: "STUDY 11" })).toHaveCount(1, { timeout: 45000 });

  await first.dblclick();
  await input.fill("BEDROOM 12");
  // Clicking another text object while one is being edited must save the
  // original object before changing the selected object.
  await second.click();
  await expect(input).toHaveCount(0, { timeout: 45000 });
  await expect(items.filter({ hasText: "BEDROOM 12" })).toHaveCount(1, { timeout: 45000 });
  await expect(items.filter({ hasText: "ROOM 02" })).toHaveCount(1);

  await second.dblclick();
  await input.fill("BATHROOM 13");
  await input.press("Enter");
  await expect(input).toHaveCount(0, { timeout: 45000 });
  await expect(items.filter({ hasText: "BATHROOM 13" })).toHaveCount(1, { timeout: 45000 });

  await saveServerDocumentAndWait(page);
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 45000 });
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-opdf-action="expand-right-panel"]').click();
  const persisted = page.locator("[data-opdf-native-editor='true'] [data-opdf-object-kind='text']");
  await expect(persisted.filter({ hasText: "BEDROOM 12" }).first()).toBeVisible({ timeout: 45000 });
  await expect(persisted.filter({ hasText: "BATHROOM 13" }).first()).toBeVisible({ timeout: 45000 });
});
