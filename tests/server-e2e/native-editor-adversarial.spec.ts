import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { saveServerDocumentAndWait } from "../helpers/save";
import {
  buildDigitsOnlySubsetPdf,
  buildEncryptedPdf,
  buildMalformedPdf,
  buildSubsetFontPdf,
} from "./native-adversarial-fixtures";

test.setTimeout(90_000);

async function expandAdvancedEditor(page: Page) {
  const expand = page.locator('[data-opdf-action="expand-right-panel"]');
  await expect(expand).toBeVisible({ timeout: 20_000 });
  await expand.click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return editor;
}

async function uploadPdf(
  request: APIRequestContext,
  name: string,
  bytes: Buffer,
) {
  return request.post(`/api/opdf/documents?name=${encodeURIComponent(name)}`, {
    headers: { "Content-Type": "application/pdf" },
    data: bytes,
  });
}

async function expectSafeViewerFailure(
  page: Page,
  request: APIRequestContext,
  name: string,
  bytes: Buffer,
) {
  const upload = await uploadPdf(request, name, bytes);

  if (upload.status() !== 201) {
    expect(upload.status()).toBeGreaterThanOrEqual(400);
    expect(upload.status()).toBeLessThan(500);
    return;
  }

  const document = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("An error occurred while displaying the document"),
  ).toHaveCount(0);

  await expect.poll(
    async () => {
      const statusMessage =
        (await page.getByTestId("status-bar").getAttribute("data-opdf-message")) ?? "";
      if (statusMessage.trim()) return true;

      const text = (await page.locator("body").innerText()).toLowerCase();
      return /password|encrypted|invalid|corrupt|failed|error|unable/.test(text);
    },
    {
      timeout: 30_000,
      message: `${name} should fail explicitly without crashing the application shell`,
    },
  ).toBe(true);

  await expect(
    page.locator("header").getByRole("button", { name: "Application menu", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-opdf-native-editor='true']")).toHaveCount(0);
}

test("real embedded subset font can be replaced and survives save/reload", async ({
  page,
  request,
}) => {
  const upload = await uploadPdf(
    request,
    "native-subset-font.pdf",
    await buildSubsetFontPdf(),
  );
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTitle("Edit PDF Content").click();

  const editor = await expandAdvancedEditor(page);
  const original = editor
    .locator("[data-opdf-object-kind='text']")
    .filter({ hasText: "Subset font source 01" })
    .first();
  await expect(original).toBeVisible({ timeout: 20_000 });
  await original.click();

  const replacement = "Subset edited: Kỹ thuật Việt Nam – kết cấu A1";
  await editor.locator("textarea").fill(replacement);
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({
    timeout: 20_000,
  });

  await saveServerDocumentAndWait(page);
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = await expandAdvancedEditor(page);
  await expect(
    reopened
      .locator("[data-opdf-object-kind='text']")
      .filter({ hasText: replacement })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    reopened.getByText("Subset font source 01", { exact: false }),
  ).toHaveCount(0);
});

test("password-protected PDF degrades explicitly without crashing", async ({
  page,
  request,
}) => {
  await expectSafeViewerFailure(
    page,
    request,
    "encrypted-password-protected.pdf",
    buildEncryptedPdf(),
  );
});

test("truncated malformed PDF degrades explicitly without crashing", async ({
  page,
  request,
}) => {
  await expectSafeViewerFailure(
    page,
    request,
    "malformed-truncated.pdf",
    buildMalformedPdf(),
  );
});

test("ASCII letters replace digits in a subset font and survive save/reload", async ({ page, request }) => {
  const source = await buildDigitsOnlySubsetPdf();
  const upload = await uploadPdf(request, "native-subset-digits.pdf", source);
  expect(upload.status()).toBe(201);
  const document = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();
  const editor = await expandAdvancedEditor(page);
  await expect(editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "12345" })).toBeVisible();

  const hit = page.locator(".native-edit-page polygon[data-opdf-object-kind='text']").first();
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.dblclick();
  const draft = page.getByRole("textbox", { name: "Edit PDF text" });
  await draft.fill("KITCHEN ABC");
  await draft.press("Enter");
  await expect(draft).toHaveCount(0, { timeout: 30000 });
  await expect(editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "KITCHEN ABC" }))
    .toBeVisible({ timeout: 30000 });

  // Embedding a full Unicode font rather than reusing the digits-only subset
  // increases the PDF data size. Text extraction alone can miss invisible glyphs.
  await saveServerDocumentAndWait(page);
  const documentId = /^server:\/\/([0-9a-f-]{36})/i.exec(document.filePath)?.[1];
  expect(documentId).toBeTruthy();
  const response = await request.get("/api/opdf/documents/" + documentId);
  expect(response.ok()).toBe(true);
  const saved = Buffer.from(await response.body());
  expect(saved.byteLength).toBeGreaterThan(source.byteLength + 1000);

  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();
  const reopened = await expandAdvancedEditor(page);
  await expect(reopened.locator("[data-opdf-object-kind='text']").filter({ hasText: "KITCHEN ABC" }))
    .toBeVisible({ timeout: 30_000 });
});
