import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { auditPdfTraffic } from "../helpers/pdfNetworkAudit";

const execFileAsync = promisify(execFile);
const DOCUMENT_SIZE = 112 * 1024 * 1024;
const TILE_SELECTOR = '[data-tpdf-remote-viewer="true"] img[src*="/render/tile"]';

test("two cold large-PDF opens use measured tile GETs, not full-file GETs", async ({
  browser, request,
}, testInfo) => {
  const origin = testInfo.project.use.baseURL;
  if (!origin) throw new Error("Progressive test requires a configured baseURL.");
  const healthResponse = await request.get("/api/tpdf/health");
  expect(healthResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  expect(health.capabilities.rangeReads).toBe(true);
  // This gate must fail, not skip, if Python/PyMuPDF/Pillow is unavailable.
  expect(health.capabilities.remoteRendering).toBe(true);

  const folder = await mkdtemp(join(tmpdir(), "tpdf-issue168-"));
  const fixture = join(folder, "generated-112mib.pdf");
  try {
    await execFileAsync(process.execPath, [
      "scripts/perf/generate-large-pdf.mjs", "--mb", "112",
      "--pages", "182", "--out", fixture,
    ], { timeout: 90_000 });
    const bytes = (await stat(fixture)).size;
    expect(bytes).toBeGreaterThanOrEqual(DOCUMENT_SIZE);

    const documents: Array<{ id: string; filePath: string }> = [];
    // Distinct stored IDs avoid server-side tile-cache hits between cold runs.
    for (let round = 1; round <= 2; round += 1) {
      const upload = await fetch(new URL(`/api/tpdf/documents?name=generated-round-${round}.pdf`, origin), {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes) },
        body: createReadStream(fixture) as unknown as BodyInit,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      expect(upload.status).toBe(201);
      documents.push(await upload.json() as { id: string; filePath: string });
    }

    for (let round = 1; round <= 2; round += 1) {
      const document = documents[round - 1];
      const context = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
      const page = await context.newPage();
      const audit = await auditPdfTraffic(page, document.id);
      try {
        const started = Date.now();
        await page.goto(`/?open=${encodeURIComponent(document.filePath)}`, { waitUntil: "domcontentloaded" });
        const remote = page.locator('[data-tpdf-remote-viewer="true"]');
        await expect(remote).toBeVisible({ timeout: 90_000 });
        await page.waitForFunction((selector) => {
          return [...document.querySelectorAll<HTMLImageElement>(selector)]
            .some((img) => img.complete && img.naturalWidth > 0);
        }, TILE_SELECTOR, { timeout: 90_000 });
        const firstPageMs = Date.now() - started;
        const first = audit.snapshot();

        expect(first.documentGetCount).toBe(0); // Includes both 200 and 206 possibilities.
        expect(first.fullDocumentGetCount).toBe(0);
        expect(first.tileGetCount).toBeGreaterThan(0);
        expect(first.totalPdfGetWireBytes).toBeLessThan(bytes / 8);

        const distantPage = page.locator('[data-tpdf-remote-page-index="149"]');
        await distantPage.scrollIntoViewIfNeeded({ timeout: 30_000 });
        await page.waitForFunction(() => {
          return [...document.querySelectorAll<HTMLImageElement>('[data-tpdf-remote-viewer="true"] img')]
            .some((img) => img.src.includes("/render/tile") &&
              new URL(img.src).searchParams.get("page") === "149" &&
              img.complete && img.naturalWidth > 0);
        }, null, { timeout: 90_000 });

        const previousLevel = audit.snapshot().maxTileLevel;
        for (let i = 0; i < 4; i += 1) {
          await remote.getByRole("button", { name: "Zoom in" }).click();
        }
        await expect.poll(() => audit.snapshot().maxTileLevel, { timeout: 90_000 })
          .toBeGreaterThan(previousLevel);
        const final = audit.snapshot();
        expect(final.documentGetCount).toBe(0);
        expect(final.fullDocumentGetCount).toBe(0);
        expect(final.totalPdfGetWireBytes).toBeLessThan(bytes / 4);
        expect(await remote.locator('img[src*="/render/tile"]').count()).toBeLessThanOrEqual(96);

        const evidence = { round, fixtureBytes: bytes, firstPageMs, firstTileSample: first, afterScrollZoom: final };
        console.log("Progressive PDF synthetic fixture:", JSON.stringify(evidence));
        await testInfo.attach(`progressive-round-${round}.json`, {
          body: JSON.stringify(evidence, null, 2), contentType: "application/json",
        });
      } finally {
        await audit.close();
        await context.close();
      }
    }

    // Make the capability decision deliberately slow: the completed HEAD
    // metadata probe may happen, but no PDF GET may start while health is held.
    const heldDocument = documents[1];
    const gateContext = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
    const gatePage = await gateContext.newPage();
    const gateAudit = await auditPdfTraffic(gatePage, heldDocument.id);
    let releaseHealth!: () => void;
    const healthGate = new Promise<void>((resolve) => { releaseHealth = resolve; });
    try {
      await gatePage.route("**/api/tpdf/health", async (route) => {
        await healthGate;
        await route.continue();
      });
      await gatePage.goto(`/?open=${encodeURIComponent(heldDocument.filePath)}`, { waitUntil: "domcontentloaded" });
      await expect(gatePage.getByRole("status").filter({ hasText: "Checking PDF viewing capabilities" })).toBeVisible();
      await expect.poll(() => gateAudit.snapshot().headCompletedCount).toBeGreaterThan(0);
      const held = gateAudit.snapshot();
      expect(held.documentGetCount).toBe(0);
      expect(held.tileGetCount).toBe(0);
      await testInfo.attach("pending-capability-traffic.json", {
        body: JSON.stringify(held, null, 2), contentType: "application/json",
      });
    } finally {
      releaseHealth();
      await gateAudit.close();
      await gateContext.close();
    }

    // Force a false capability in the *browser only*. The application must
    // clearly ask before doing any full GET, and GET begins only after click.
    const fallbackContext = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
    const fallbackPage = await fallbackContext.newPage();
    const fallbackAudit = await auditPdfTraffic(fallbackPage, heldDocument.id);
    try {
      await fallbackPage.route("**/api/tpdf/health", async (route) => {
        const upstream = await route.fetch();
        const body = await upstream.json();
        await route.fulfill({
          response: upstream,
          json: { ...body, capabilities: { ...body.capabilities, remoteRendering: false } },
        });
      });
      await fallbackPage.goto(`/?open=${encodeURIComponent(heldDocument.filePath)}`, { waitUntil: "domcontentloaded" });
      const consent = fallbackPage.getByRole("button", { name: "Download and open full PDF" });
      await expect(consent).toBeVisible({ timeout: 30_000 });
      expect(fallbackAudit.snapshot().documentGetCount).toBe(0);
      await consent.click();
      await expect.poll(() => fallbackAudit.snapshot().fullDocumentGetCount).toBeGreaterThan(0);
    } finally {
      await fallbackAudit.close();
      await fallbackContext.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
