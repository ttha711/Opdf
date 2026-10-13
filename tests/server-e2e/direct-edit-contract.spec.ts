import { expect, test, type Page } from "@playwright/test";
import zlib from "node:zlib";
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { saveServerDocumentAndWait } from "../helpers/save";

test.setTimeout(120_000);

const LABEL = "DIRECT LABEL";

async function uploadThreePagePdf(request: import("@playwright/test").APIRequestContext) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= 3; index++) {
    pdf.addPage([520, 720]).drawText(`PAGE ${index} ${LABEL}`, { x: 78, y: 525, font, size: 20 });
  }
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const response = await request.post("/api/tpdf/documents?name=direct-edit-contract.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: bytes,
  });
  expect(response.status()).toBe(201);
  const stored = await response.json();
  return { bytes, filePath: stored.filePath as string, id: /server:\/\/([^/]+)\//.exec(stored.filePath)![1] };
}

async function openReader(page: Page, filePath: string) {
  await page.goto("/?open=" + encodeURIComponent(filePath));
  await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("embedpdf-container img").last()).toBeVisible({ timeout: 30_000 });
}

/** The reader page image that is mostly inside the viewport, plus a point on its text label. */
async function visibleLabelPoint(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const viewport = window.innerHeight;
    return [...document.querySelectorAll("embedpdf-container")].some((host) =>
      [...(host.shadowRoot?.querySelectorAll("img") ?? [])].some((img) => {
        const box = img.getBoundingClientRect();
        return box.width > 300 && box.height > 200 && box.bottom > 120 && box.top < viewport - 120;
      }));
  }), { timeout: 15_000 }).toBe(true);
  return page.evaluate(() => {
    const viewport = window.innerHeight;
    const images = [...document.querySelectorAll("embedpdf-container")]
      .flatMap((host) => [...(host.shadowRoot?.querySelectorAll("img") ?? [])])
      .map((img) => ({ box: img.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 300 && box.height > 200 && box.bottom > 120 && box.top < viewport - 120)
      .sort((a, b) => Math.abs(a.box.top) - Math.abs(b.box.top));
    const { box } = images[0];
    return {
      // Label baseline y=525 of 720, text starts x=78 and is ~20pt tall.
      x: box.x + box.width * (100 / 520),
      y: box.y + box.height * ((720 - 535) / 720),
      pageTop: box.top,
    };
  });
}

async function readerScrollTop(page: Page) {
  return page.evaluate(() => {
    let best = 0;
    const walk = (root: Document | ShadowRoot) => root.querySelectorAll("*").forEach((el) => {
      const node = el as HTMLElement;
      if (node.scrollHeight > node.clientHeight + 40 && node.clientHeight > 100 &&
          /auto|scroll/.test(getComputedStyle(node).overflowY)) best = Math.max(best, node.scrollTop);
      if (node.shadowRoot) walk(node.shadowRoot);
    });
    walk(document);
    return best;
  });
}

async function scrollReaderOnce(page: Page, top: number) {
  return page.evaluate((target) => {
    let scrolled = false;
    const walk = (root: Document | ShadowRoot) => root.querySelectorAll("*").forEach((el) => {
      const node = el as HTMLElement;
      if (node.scrollHeight > 1500 && node.clientHeight > 100 &&
          /auto|scroll/.test(getComputedStyle(node).overflowY)) {
        node.scrollTop = target;
        scrolled = Math.abs(node.scrollTop - target) < 2;
      }
      if (node.shadowRoot) walk(node.shadowRoot);
    });
    walk(document);
    return scrolled;
  }, top);
}

/** Scroll the reader until the status bar reports the expected page (the reader can reset an early scroll). */
async function scrollReaderUntil(page: Page, top: number, expected: RegExp) {
  await expect.poll(async () => {
    if (!(await scrollReaderOnce(page, top))) return false;
    await page.waitForTimeout(400);
    return expected.test(await statusText(page));
  }, { timeout: 25_000, intervals: [200] }).toBe(true);
}

const statusText = (page: Page) => page.locator("[data-tpdf-region='status-bar']").innerText();

test("open, click, drag-select and a cancelled direct edit never change the PDF", async ({ page, request }) => {
  const { bytes, filePath, id } = await uploadThreePagePdf(request);
  const writes: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET" && req.method() !== "HEAD" && /\/api\/tpdf\/documents\//.test(req.url())) {
      writes.push(req.method() + " " + new URL(req.url()).pathname);
    }
  });
  await openReader(page, filePath);
  const point = await visibleLabelPoint(page);

  // Single click and drag-selection are reader gestures: they must not open the editor.
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(point.x - 4, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 120, point.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.getByRole("textbox", { name: "Edit PDF text" })).toHaveCount(0);

  // Explicit edit intent opens the editor; cancelling with Escape discards it.
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue(new RegExp(LABEL));
  await input.press("Escape");
  await expect(input).toHaveCount(0);

  // Give autosave more than its debounce window to prove nothing is pending.
  await page.waitForTimeout(4_000);
  expect(writes).toEqual([]);
  await expect(page.locator("[data-tpdf-save-state]").first()).not.toHaveAttribute("data-tpdf-save-state", /saving|dirty|error/);
  const served = await request.get("/api/tpdf/documents/" + id);
  expect(served.ok()).toBe(true);
  expect(Buffer.from(await served.body()).equals(bytes)).toBe(true);
});

test("direct edit keeps the page, zoom and the text under the pointer in place", async ({ page, request }) => {
  const { filePath } = await uploadThreePagePdf(request);
  await openReader(page, filePath);

  // Scroll so page 2 is the active page, then double-click its label.
  await scrollReaderUntil(page, 760, /Page 2 of 3/);
  const zoomBefore = /(\d+)%/.exec(await statusText(page))?.[1];
  const point = await visibleLabelPoint(page);
  const scrollBefore = await readerScrollTop(page);
  expect(scrollBefore).toBeGreaterThan(300);

  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue(/PAGE 2/);
  await page.waitForTimeout(800);

  const box = await input.boundingBox();
  expect(box).toBeTruthy();
  // The editor opens over the text the user double-clicked, not elsewhere.
  expect(Math.abs((box!.y + box!.height / 2) - point.y)).toBeLessThan(24);
  expect(await statusText(page)).toMatch(/Page 2 of 3/);
  expect(/(\d+)%/.exec(await statusText(page))?.[1]).toBe(zoomBefore);
});

async function nativeViewState(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".native-edit-viewport") as HTMLElement | null;
    const label = document.querySelector("polygon[data-tpdf-object-kind='text']") as SVGElement | null;
    return {
      scrollTop: viewport?.scrollTop ?? -1,
      pageTops: [...document.querySelectorAll(".native-edit-page")].map((node) => Math.round(node.getBoundingClientRect().top)),
      labelTop: label ? Math.round(label.getBoundingClientRect().top) : null,
    };
  });
}

/** Wait until the editor viewport stops moving (initial layout, zoom and anchor restore). */
async function settledViewState(page: Page) {
  let previous = await nativeViewState(page);
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(500);
    const current = await nativeViewState(page);
    if (current.scrollTop === previous.scrollTop && current.scrollTop >= 0) return current;
    previous = current;
  }
  throw new Error("The editor viewport never stopped moving after it opened.");
}

async function openPage2Label(page: Page) {
  const text = page.locator(".native-edit-page svg[data-tpdf-native-edit-page='2'] polygon[data-tpdf-object-kind='text']").first();
  await expect(text).toBeVisible({ timeout: 20_000 });
  await text.dblclick();
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  return input;
}

test("a committed direct edit keeps the viewport; undo, redo, Save and reopen keep the edit", async ({ page, request }) => {
  const { filePath, id, bytes } = await uploadThreePagePdf(request);
  await openReader(page, filePath);
  await scrollReaderUntil(page, 760, /Page 2 of 3/);
  const point = await visibleLabelPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  const before = await settledViewState(page);

  const expectViewportKept = async (label: string) => {
    await expect.poll(async () => Math.abs((await nativeViewState(page)).scrollTop - before.scrollTop), {
      message: label + " must not move the scroll position", timeout: 10_000,
    }).toBeLessThan(24);
    expect(await statusText(page)).toMatch(/Page 2 of 3/);
  };

  await input.fill("EDITED PAGE TWO");
  await input.press("Enter");
  await expect(input).toHaveCount(0, { timeout: 30_000 });
  await expectViewportKept("committing the edit");

  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expectViewportKept("undo");
  let editor = await openPage2Label(page);
  await expect(editor).toHaveValue(/PAGE 2 DIRECT LABEL/);
  await editor.press("Escape");

  await page.getByTitle("Redo (Ctrl+Y)").click();
  await expectViewportKept("redo");
  editor = await openPage2Label(page);
  await expect(editor).toHaveValue(/EDITED PAGE TWO/);
  await editor.press("Escape");

  await saveServerDocumentAndWait(page);
  const served = Buffer.from(await (await request.get("/api/tpdf/documents/" + id)).body());
  expect(served.equals(bytes)).toBe(false);

  // Reopen from the server: the saved edit is what the reader now shows.
  await page.goto("/?open=" + encodeURIComponent(filePath));
  await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("embedpdf-container img").last()).toBeVisible({ timeout: 30_000 });
  await scrollReaderUntil(page, 760, /Page 2 of 3/);
  const reopened = await visibleLabelPoint(page);
  await page.mouse.dblclick(reopened.x, reopened.y);
  await expect(page.getByRole("textbox", { name: "Edit PDF text" })).toHaveValue(/EDITED PAGE TWO/, { timeout: 20_000 });
});

test("direct edit at a higher zoom keeps zoom, page and the text under the pointer", async ({ page, request }) => {
  const { filePath } = await uploadThreePagePdf(request);
  await openReader(page, filePath);
  for (let step = 0; step < 3; step++) {
    await page.getByRole("button", { name: "Zoom In" }).first().click();
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => Number(/(\d+)%/.exec(await statusText(page))?.[1])).toBeGreaterThan(130);
  const zoomBefore = /(\d+)%/.exec(await statusText(page))![1];

  // Page 2 starts after one zoomed page plus its gap.
  await scrollReaderUntil(page, 1130, /Page 2 of 3/);
  const point = await visibleLabelPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue(/PAGE 2/);
  await page.waitForTimeout(800);

  const box = await input.boundingBox();
  expect(box).toBeTruthy();
  expect(Math.abs((box!.y + box!.height / 2) - point.y)).toBeLessThan(24);
  expect(await statusText(page)).toMatch(/Page 2 of 3/);
  expect(/(\d+)%/.exec(await statusText(page))![1]).toBe(zoomBefore);
});

async function uploadSignedPdf(request: import("@playwright/test").APIRequestContext) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const sheet = pdf.addPage([520, 720]);
  sheet.drawText(`SIGNED ${LABEL}`, { x: 78, y: 525, font, size: 20 });
  const context = pdf.context;
  const signature = context.register(context.obj({
    Type: "Sig", Filter: "Adobe.PPKLite", SubFilter: "adbe.pkcs7.detached",
    ByteRange: [0, 0, 0, 0], Contents: PDFHexString.of("00".repeat(16)), M: PDFString.of("D:20260101000000Z"),
  }));
  const field = context.register(context.obj({
    Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("Signature1"), V: signature,
    Rect: [0, 0, 0, 0], F: 132, P: sheet.ref,
  }));
  sheet.node.set(PDFName.of("Annots"), context.obj([field]));
  pdf.catalog.set(PDFName.of("AcroForm"), context.obj({ Fields: [field], SigFlags: 3 }));
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const response = await request.post("/api/tpdf/documents?name=signed-direct-edit.pdf", {
    headers: { "Content-Type": "application/pdf" }, data: bytes,
  });
  expect(response.status()).toBe(201);
  const stored = await response.json();
  return { bytes, filePath: stored.filePath as string, id: /server:\/\/([^/]+)\//.exec(stored.filePath)![1] };
}

test("editing a digitally signed PDF warns first and a declined edit leaves it untouched", async ({ page, request }) => {
  const { bytes, filePath, id } = await uploadSignedPdf(request);
  await openReader(page, filePath);
  const point = await visibleLabelPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-tpdf-signed-note]")).toHaveCount(1);

  await input.fill("SIGNED CHANGED");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: /digitally signed/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  await page.waitForTimeout(4_000);
  const served = Buffer.from(await (await request.get("/api/tpdf/documents/" + id)).body());
  expect(served.equals(bytes)).toBe(true);
});

test("a signed PDF can still be edited after the user accepts the warning", async ({ page, request }) => {
  const { bytes, filePath, id } = await uploadSignedPdf(request);
  await openReader(page, filePath);
  const point = await visibleLabelPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill("SIGNED CHANGED");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: /digitally signed/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Edit anyway" }).click();
  await expect(input).toHaveCount(0, { timeout: 30_000 });
  await saveServerDocumentAndWait(page);
  const served = Buffer.from(await (await request.get("/api/tpdf/documents/" + id)).body());
  expect(served.equals(bytes)).toBe(false);
});

function tinyPng(size = 16) {
  const crc = (buffer: Buffer) => { const out = Buffer.alloc(4); out.writeUInt32BE(zlib.crc32(buffer) >>> 0); return out; };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    return Buffer.concat([length, body, crc(body)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("direct edit on a scanned, image-only page opens safely and changes nothing", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([520, 720]);
  sheet.drawImage(await pdf.embedPng(tinyPng()), { x: 0, y: 0, width: 520, height: 720 });
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const response = await request.post("/api/tpdf/documents?name=scanned-direct-edit.pdf", {
    headers: { "Content-Type": "application/pdf" }, data: bytes,
  });
  expect(response.status()).toBe(201);
  const stored = await response.json();
  const writes: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET" && req.method() !== "HEAD" && /\/api\/tpdf\/documents\//.test(req.url())) writes.push(req.method());
  });
  await openReader(page, stored.filePath);
  const point = await visibleLabelPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator("[data-tpdf-native-editor='true']")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator(".native-edit-page").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);

  // There is no text to edit: no inline editor, no error banner, no write.
  await expect(page.getByRole("textbox", { name: "Edit PDF text" })).toHaveCount(0);
  await expect(page.locator("[role='alert']")).toHaveCount(0);
  expect(writes).toEqual([]);
  const id = /server:\/\/([^/]+)\//.exec(stored.filePath)![1];
  const served = Buffer.from(await (await request.get("/api/tpdf/documents/" + id)).body());
  expect(served.equals(bytes)).toBe(true);
});

test("direct edit deep in a 90-page document stays on that page without flooding fetches", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= 90; index++) {
    pdf.addPage([520, 720]).drawText(`PAGE ${index} ${LABEL}`, { x: 78, y: 525, font, size: 20 });
  }
  const response = await request.post("/api/tpdf/documents?name=direct-edit-90.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: Buffer.from(await pdf.save({ useObjectStreams: false })),
  });
  expect(response.status()).toBe(201);
  const stored = await response.json();
  let documentFetches = 0;
  const pageErrors: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "GET" && new URL(req.url()).pathname.startsWith("/api/tpdf/documents/")) documentFetches++;
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openReader(page, stored.filePath);
  await scrollReaderUntil(page, 44 * 736, /Page 45 of 90/);
  const point = await visibleLabelPoint(page);
  const started = Date.now();
  await page.mouse.dblclick(point.x, point.y);
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveValue(/PAGE 45 /);
  expect(Date.now() - started).toBeLessThan(25_000);
  await page.waitForTimeout(1_000);

  expect(await statusText(page)).toMatch(/Page 45 of 90/);
  expect(await page.locator(".native-edit-page").count()).toBeLessThan(90);
  expect(documentFetches).toBeLessThan(15);
  expect(pageErrors).toEqual([]);
});
