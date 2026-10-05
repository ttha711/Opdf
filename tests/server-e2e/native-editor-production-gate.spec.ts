import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { saveServerDocumentAndWait } from "../helpers/save";

test.setTimeout(90_000);

async function uploadAndOpenEditor(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  name: string,
  bytes: Buffer,
) {
  const upload = await request.post(`/api/opdf/documents?name=${encodeURIComponent(name)}`, {
    headers: { "Content-Type": "application/pdf" },
    data: bytes,
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTitle("Edit PDF Content").click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return { document, editor };
}

async function reopenEditor(
  page: import("@playwright/test").Page,
) {
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTitle("Edit PDF Content").click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return editor;
}

async function buildRotatedTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 420]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rotated source text", {
    x: 110,
    y: 170,
    size: 28,
    font,
    rotate: degrees(27),
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function buildScanLikePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await doc.embedPng(png);
  page.drawImage(image, {
    x: 35,
    y: 45,
    width: 525,
    height: 752,
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test("Unicode replacement preserves rotated native text after save and reload", async ({
  page,
  request,
}) => {
  const { editor } = await uploadAndOpenEditor(
    page,
    request,
    "native-unicode-rotated.pdf",
    await buildRotatedTextPdf(),
  );

  const rotated = editor
    .locator("[data-opdf-object-kind='text'][data-opdf-rotated-bounds='true']")
    .filter({ hasText: "Rotated source text" })
    .first();
  await expect(rotated).toBeVisible({ timeout: 20_000 });
  await rotated.click();

  const replacement = "Kỹ thuật Việt Nam – bản vẽ số 01";
  await editor.locator("textarea").fill(replacement);
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({
    timeout: 20_000,
  });

  await saveServerDocumentAndWait(page);
  const reopened = await reopenEditor(page);

  const persisted = reopened
    .locator("[data-opdf-object-kind='text']")
    .filter({ hasText: replacement })
    .first();
  await expect(persisted).toBeVisible({ timeout: 20_000 });
  await expect(persisted).toHaveAttribute("data-opdf-rotated-bounds", "true");
  await persisted.click();
  await expect(reopened.locator("[data-opdf-rotated-selection='true']")).toBeVisible();
});

test("image-only scanned page stays editable and persists native transforms", async ({
  page,
  request,
}) => {
  const { editor } = await uploadAndOpenEditor(
    page,
    request,
    "native-scan-like.pdf",
    await buildScanLikePdf(),
  );

  await expect(editor.locator("[data-opdf-object-kind='text']")).toHaveCount(0);
  const image = editor.locator("[data-opdf-object-kind='image']").first();
  await expect(image).toBeVisible({ timeout: 20_000 });

  const beforeBounds = await image.getAttribute("data-opdf-bounds");
  expect(beforeBounds).toBeTruthy();
  await image.click();
  await editor.getByRole("button", { name: "→" }).click();
  await expect(editor.getByText("Object moved.")).toBeVisible({ timeout: 20_000 });

  const moved = editor.locator("[data-opdf-object-kind='image']").first();
  await expect(moved).not.toHaveAttribute("data-opdf-bounds", beforeBounds ?? "", {
    timeout: 20_000,
  });
  const movedBounds = await moved.getAttribute("data-opdf-bounds");
  expect(movedBounds).toBeTruthy();

  await saveServerDocumentAndWait(page);
  const reopened = await reopenEditor(page);
  await expect(reopened.locator("[data-opdf-object-kind='text']")).toHaveCount(0);
  await expect(reopened.locator("[data-opdf-object-kind='image']").first())
    .toHaveAttribute("data-opdf-bounds", movedBounds ?? "");
});
