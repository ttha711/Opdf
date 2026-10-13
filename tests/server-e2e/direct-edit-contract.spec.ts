import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

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
        return box.height > 200 && box.bottom > 120 && box.top < viewport - 120;
      }));
  }), { timeout: 15_000 }).toBe(true);
  return page.evaluate(() => {
    const viewport = window.innerHeight;
    const images = [...document.querySelectorAll("embedpdf-container")]
      .flatMap((host) => [...(host.shadowRoot?.querySelectorAll("img") ?? [])])
      .map((img) => ({ box: img.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 200 && box.bottom > 120 && box.top < viewport - 120)
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

async function scrollReaderTo(page: Page, top: number) {
  // Wait for the scrollable document column (3 pages) before scrolling it.
  await expect.poll(() => page.evaluate((target) => {
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
  }, top), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(400);
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
  await scrollReaderTo(page, 760);
  await expect.poll(() => statusText(page)).toMatch(/Page 2 of 3/);
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
  // The editor opens over the text the user double-clicked, not elsewhere. The
  // reader's toolbar (~35px) is not part of the editor, so allow that much shift.
  expect(Math.abs((box!.y + box!.height / 2) - point.y)).toBeLessThan(60);
  expect(await statusText(page)).toMatch(/Page 2 of 3/);
  expect(/(\d+)%/.exec(await statusText(page))?.[1]).toBe(zoomBefore);
});
