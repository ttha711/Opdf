import { appendFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const MiB = 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function browserTest(browser, testCase, stored, fileBytes, baseUrl) {
  const page = await browser.newPage();
  const documentUrlPart = `/api/opdf/documents/${stored.id}`;
  const pdfResponses = [];
  const finishedPdfTransfers = [];
  page.on("response", (response) => {
    if (!response.url().includes(documentUrlPart)) return;
    const headers = response.headers();
    pdfResponses.push({
      method: response.request().method(),
      status: response.status(),
      contentRange: headers["content-range"] || "",
      contentLength: Number(headers["content-length"] || 0),
    });
  });
  page.on("requestfinished", (request) => {
    if (!request.url().includes(documentUrlPart) || request.method() !== "GET") return;
    void request.sizes().then((sizes) => {
      finishedPdfTransfers.push({
        url: request.url(),
        responseBodySize: sizes.responseBodySize,
      });
    }).catch(() => undefined);
  });

  const startedAt = Date.now();
  await page.goto(`${baseUrl}/?open=${encodeURIComponent(stored.filePath)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await viewer.waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("body").getByText(/Page\s+1\s+of\s+\d+/i).first().waitFor({
    state: "visible",
    timeout: 120_000,
  });
  const openMs = Date.now() - startedAt;
  assert(
    openMs <= testCase.maxFirstPageMs,
    `${testCase.name}: first page exceeded ${testCase.maxFirstPageMs} ms budget (${openMs} ms)`,
  );

  await page.waitForTimeout(1500);

  const pageStatus = await page.locator("body").getByText(/Page\s+1\s+of\s+\d+/i).first().textContent();
  const pageMatch = pageStatus?.match(/Page\s+1\s+of\s+(\d+)/i);
  const pageCount = pageMatch ? Number(pageMatch[1]) : null;
  assert(pageCount && pageCount > 0, `Unable to determine page count for ${testCase.name}`);
  if (testCase.expectedPages) {
    assert(pageCount === testCase.expectedPages, `${testCase.name}: expected ${testCase.expectedPages} pages, got ${pageCount}`);
  }

  const getResponses = pdfResponses.filter((item) => item.method === "GET");
  const rangeResponses = getResponses.filter((item) => item.status === 206);
  const fullResponses = getResponses.filter((item) => item.status === 200);
  await page.waitForTimeout(250);
  const bytesObserved = finishedPdfTransfers.reduce((sum, item) => sum + item.responseBodySize, 0);
  const usedRange = rangeResponses.length > 0;
  const viewerEngine = await viewer.getAttribute("data-opdf-engine");
  assert(
    viewerEngine === "pdfium-wasm",
    `${testCase.name}: expected stable EmbedPDF/PDFium viewer, got ${viewerEngine}`,
  );
  for (const group of ["View", "Annotate", "Shapes"]) {
    await viewer.getByRole("button", { name: group, exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
  }

  let searchMatches = null;
  if (testCase.searchText) {
    const header = page.locator("header");
    await header.getByRole("button", { name: "Tools", exact: true }).click();
    await header.getByRole("menuitem", {
      name: "Search & Secure Redact...",
      exact: true,
    }).click();
    const modal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
    await modal.getByPlaceholder("Text to redact…").fill(testCase.searchText);
    await modal.getByRole("button", { name: "Search all pages", exact: true }).click();
    await modal.getByText(/\d+ match\(es\) found/).waitFor({ state: "visible", timeout: 120_000 });
    const text = await modal.getByText(/\d+ match\(es\) found/).textContent();
    searchMatches = Number(text?.match(/(\d+) match/)?.[1] || 0);
    assert(searchMatches > 0, `${testCase.name}: expected searchable engineering text`);
    await modal.locator(".premium-modal-header").getByRole("button").click();
  }

  let savedReloadOk = null;
  let saveMs = null;
  let saveError = null;
  if (testCase.mutateAndSave) {
    // Release the live PDFium document before benchmarking the server mutation.
    // UI routing for Rotate All Pages is covered by deterministic server E2E;
    // this external corpus measures the mutation engine itself without doubling
    // peak memory by keeping a complex engineering drawing open in Chromium.
    await page.goto("about:blank");
    const mutateStartedAt = Date.now();
    try {
      const mutationResponse = await fetch(
        `${baseUrl}/api/opdf/documents/${stored.id}/mutations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "rotate-pages", degrees: 90 }),
          signal: AbortSignal.timeout(90_000),
        },
      );
      assert(mutationResponse.ok, `${testCase.name}: mutation HTTP ${mutationResponse.status}`);
      saveMs = Date.now() - mutateStartedAt;
      assert(saveMs < 90_000, `${testCase.name}: server-side rotate exceeded 90 s budget (${saveMs} ms)`);

      const persisted = await fetch(`${baseUrl}/api/opdf/documents/${stored.id}`);
      assert(persisted.ok, `${testCase.name}: unable to reload mutated PDF`);
      const persistedDoc = await PDFDocument.load(new Uint8Array(await persisted.arrayBuffer()));
      assert(
        persistedDoc.getPage(0).getRotation().angle % 360 === 90,
        `${testCase.name}: server-side rotation was not persisted`,
      );

      await page.goto(`${baseUrl}/?open=${encodeURIComponent(stored.filePath)}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.locator('[data-opdf-engine="pdfium-wasm"]').waitFor({
        state: "visible",
        timeout: 60_000,
      });
      savedReloadOk = true;
    } catch (error) {
      saveMs = Date.now() - mutateStartedAt;
      saveError = error instanceof Error ? error.message.split("\n")[0] : String(error);
      savedReloadOk = false;
      throw error;
    }
  }

  await page.close();
  return {
    openMs,
    pageCount,
    viewerEngine,
    usedRange,
    rangeRequestCount: rangeResponses.length,
    fullRequestCount: fullResponses.length,
    finishedTransferCount: finishedPdfTransfers.length,
    observedTransferBytes: bytesObserved,
    observedTransferPercent: Number(((bytesObserved / fileBytes) * 100).toFixed(2)),
    searchMatches,
    savedReloadOk,
    saveMs,
    saveError,
  };
}

export function formatMiB(bytes) {
  return (bytes / MiB).toFixed(1);
}

export async function writeSummary(results) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = [
    "# OPDF real-world PDF benchmark",
    "",
    "| Document | Size | Download | First page | Budget | Engine | Pages | Range seen | Requests 206/200 | Observed transfer | Search matches | Save/reload | Save time |",
    "|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const result of results) {
    lines.push(
      `| ${result.name} | ${formatMiB(result.fileBytes)} MB | ${(result.downloadMs / 1000).toFixed(1)}s | ${(result.openMs / 1000).toFixed(1)}s | ${(result.maxFirstPageMs / 1000).toFixed(0)}s | ${result.viewerEngine} | ${result.pageCount} | ${result.usedRange ? "yes" : "no"} | ${result.rangeRequestCount}/${result.fullRequestCount} | ${formatMiB(result.observedTransferBytes)} MB (${result.observedTransferPercent}%) | ${result.searchMatches ?? "n/a"} | ${result.savedReloadOk ?? "n/a"} | ${result.saveMs == null ? "n/a" : (result.saveMs / 1000).toFixed(1) + "s"} |`,
    );
  }
  lines.push("");
  lines.push("Sources: Washington State Department of Transportation public engineering PDFs.");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}
