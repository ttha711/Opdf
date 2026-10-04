import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createSamplePdf } from "./sample.mjs";
import { inspectPdfFile } from "./pdf-checks.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export async function runAudit(driver, mode, options) {
  const outDir = resolve(options.out);
  const screenshotDir = resolve(outDir, "screenshots");
  const downloadDir = resolve(outDir, "downloads");
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(downloadDir, { recursive: true });

  const e2e = mode === "e2e";
  const pdfPath = e2e
    ? await createSamplePdf(outDir, 3, {
        fileName: "opdf-e2e-primary.pdf",
        title: "OPDF Production E2E Primary",
        marker: "PRIMARY",
      })
    : options.pdf ?? await createSamplePdf(outDir, 3);
  const secondaryPdfPath = e2e
    ? await createSamplePdf(outDir, 2, {
        fileName: "opdf-e2e-secondary.pdf",
        title: "OPDF Production E2E Secondary",
        marker: "SECONDARY",
      })
    : null;

  const checks = [];
  const screenshots = [];
  let sequence = 0;

  const check = async (name, fn) => {
    let status = "pass";
    let error;
    let details;
    try {
      details = await fn();
    } catch (reason) {
      status = "fail";
      error = reason instanceof Error ? reason.message : String(reason);
    }

    sequence += 1;
    const shot = resolve(screenshotDir, `${String(sequence).padStart(2, "0")}-${safeName(name)}.png`);
    try {
      screenshots.push((await driver.screenshot(shot)).path);
    } catch {}

    checks.push({
      name,
      status,
      ...(error ? { error } : {}),
      ...(details !== undefined ? { details } : {}),
    });
  };

  await check("load-pdf", async () => {
    const state = await driver.loadPdf(pdfPath);
    assert(state.document.hasDocument, "Document did not enter loaded state");
    assert(state.document.totalPages >= 1, "Page count was not detected");
    return { pages: state.document.totalPages };
  });

  await check("main-page-surface", async () => {
    assert(await driver.surfaceIsVisible(), "Main PDF page surface is blank");
  });

  await check("single-thumbnail-rail", async () => {
    const state = await driver.inspect();
    assert(state.navigation.opdfThumbnailPanels === 1, "Expected exactly one OPDF thumbnail rail");
    assert(!state.navigation.embedPdfSidebarVisible, "EmbedPDF internal sidebar is visible");
    assert(state.navigation.thumbnailCount === state.document.totalPages, "Thumbnail count does not match page count");
    return state.navigation;
  });

  await check("page-navigation", async () => {
    const state = await driver.inspect();
    if (state.document.totalPages > 1) {
      const target = Math.min(2, state.document.totalPages);
      const moved = await driver.gotoPage(target);
      assert(moved.document.page === target, `Failed to navigate to page ${target}`);
      await driver.gotoPage(1);
    }
  });

  await check("zoom-control", async () => {
    await driver.setZoom(125);
    const state = await driver.inspect();
    assert(Math.abs(state.viewer.zoomPercent - 125) <= 2, `Zoom did not reach 125% (viewer reported ${state.viewer.zoomPercent}%)`);
    await driver.setZoom(100);
  });

  await check("menus", async () => {
    for (const menu of ["File", "Edit", "View", "Tools"]) {
      await driver.openMenu(menu);
      await driver.page.keyboard.press("Escape");
    }
  });

  if (mode === "full" || e2e) {
    const panelTools = [
      ["split", "tool"],
      ["merge", "tool"],
      ["page-numbers", "markup"],
      ["header", "markup"],
      ["footer", "markup"],
      ["bates", "markup"],
      ["watermark", "tool"],
      ["compress", "tool"],
    ];

    for (const [tool, expectedPanel] of panelTools) {
      await check(`tool-${tool}`, async () => {
        await driver.openTool(tool);
        const state = await driver.inspect();
        assert(state.panels.includes(expectedPanel), `${tool} did not open its ${expectedPanel} working UI`);
        await driver.closeTool();
        await driver.page.keyboard.press("Escape");
      });
    }

    await check("tool-insert", async () => {
      await driver.openTool("insert");
      const state = await driver.inspect();
      assert(state.dialogs.includes("insert-pdf"), "Insert PDF dialog did not open");
      await driver.closeDialog();
    });

    await check("tool-measure", async () => {
      await driver.openTool("measure");
      const state = await driver.inspect();
      assert(state.document.activeTool === "measure", "Measure Drawing did not activate the measurement tool");
      const close = driver.page.getByRole("button", { name: "Close measurement tool", exact: true });
      if (await close.isVisible().catch(() => false)) await close.click();
    });

    for (const [tool, expectedDialog] of [
      ["compare", "compare-revisions"],
      ["redact", "search-redact"],
      ["advanced", "advanced-pdf"],
    ]) {
      await check(`tool-${tool}`, async () => {
        await driver.openTool(tool);
        const state = await driver.inspect();
        assert(state.dialogs.includes(expectedDialog), `${tool} did not open the expected dialog`);
        await driver.closeDialog();
      });
    }

    await check("digital-sign-capability", async () => {
      await driver.openMenu("Tools");
      const item = driver.page.locator('[data-opdf-menu-item="Digital Sign..."]');
      assert((await item.count()) === 1, "Digital Sign menu item is missing");
      assert(await item.isDisabled(), "Digital Sign should be disabled in the web/server production audit runtime");
      await driver.page.keyboard.press("Escape");
    });

    await check("ai-panel", async () => {
      await driver.openAi();
      const state = await driver.inspect();
      assert(state.panels.includes("ai"), "AI Copilot did not open in the right sidebar");
      const close = driver.page.locator('[data-opdf-action="close-ai"]');
      await close.click();
    });

    await check("theme-toggle", async () => {
      const toggle = driver.page.locator('[data-opdf-action="toggle-theme"]');
      await toggle.click();
      await driver.page.waitForTimeout(150);
      await toggle.click();
    });
  }

  if (e2e) {
    const primaryInfo = await inspectPdfFile(pdfPath);
    const secondaryInfo = await inspectPdfFile(secondaryPdfPath);

    await check("e2e-split-download", async () => {
      const download = await driver.runSplitDownload(downloadDir);
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 2, `Split output should have 2 pages, got ${output.pageCount}`);
      return { download, output: { pageCount: output.pageCount, byteLength: output.byteLength, sha256: output.sha256 } };
    });

    await check("e2e-merge-download", async () => {
      const download = await driver.runMergeDownload(secondaryPdfPath, downloadDir);
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === primaryInfo.pageCount + secondaryInfo.pageCount, `Merged output should have 5 pages, got ${output.pageCount}`);
      assert(output.text.includes("PRIMARY-PAGE-1"), "Merged output lost primary PDF content");
      assert(output.text.includes("SECONDARY-PAGE-1"), "Merged output lost secondary PDF content");
      return { download, output: { pageCount: output.pageCount, byteLength: output.byteLength, sha256: output.sha256 } };
    });

    await check("e2e-insert-pages", async () => {
      const state = await driver.runInsert(secondaryPdfPath, 5);
      assert(state.document.totalPages === 5, `Inserted document should have 5 pages, got ${state.document.totalPages}`);
      const download = await driver.exportPdf(downloadDir, "insert");
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 5, "Export after insert does not contain 5 pages");
      assert(output.text.includes("SECONDARY-PAGE-1"), "Inserted pages are not present in exported PDF");
      return { download, pageCount: output.pageCount };
    });

    await check("e2e-watermark", async () => {
      const marker = "OPDF-E2E-WATERMARK";
      await driver.applyWatermark(marker);
      const download = await driver.exportPdf(downloadDir, "watermark");
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 5, "Watermark changed document page count");
      assert(output.text.includes(marker), "Watermark text is missing from exported PDF");
      return { download, marker };
    });

    await check("e2e-page-numbers", async () => {
      await driver.applyMarkup("page-numbers", { prefix: "E2E-PAGE-", start: 1, suffix: "" });
      const download = await driver.exportPdf(downloadDir, "page-numbers");
      const output = await inspectPdfFile(download.path);
      assert(output.text.includes("E2E-PAGE-1"), "Page number text is missing from exported PDF");
      return { download };
    });

    await check("e2e-header", async () => {
      await driver.applyMarkup("header", { text: "OPDF-E2E-HEADER" });
      const download = await driver.exportPdf(downloadDir, "header");
      const output = await inspectPdfFile(download.path);
      assert(output.text.includes("OPDF-E2E-HEADER"), "Header text is missing from exported PDF");
      return { download };
    });

    await check("e2e-footer", async () => {
      await driver.applyMarkup("footer", { text: "OPDF-E2E-FOOTER" });
      const download = await driver.exportPdf(downloadDir, "footer");
      const output = await inspectPdfFile(download.path);
      assert(output.text.includes("OPDF-E2E-FOOTER"), "Footer text is missing from exported PDF");
      return { download };
    });

    await check("e2e-bates", async () => {
      await driver.applyMarkup("bates", { prefix: "BATES-E2E-", start: 1, suffix: "-END" });
      const download = await driver.exportPdf(downloadDir, "bates");
      const output = await inspectPdfFile(download.path);
      assert(output.text.includes("BATES-E2E-"), "Bates numbering is missing from exported PDF");
      return { download };
    });

    await check("e2e-compress", async () => {
      await driver.openTool("compress");
      await driver.page.locator('[data-opdf-action="compress-run"]').click();
      await driver.waitForStatusMessage(/optimized successfully/i);
      await driver.waitForPdfSurface();
      const download = await driver.exportPdf(downloadDir, "compressed");
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 5, "Compression changed document page count");
      assert(output.byteLength > 0, "Compressed PDF is empty");
      return { download, byteLength: output.byteLength };
    });

    await check("e2e-annotation-export", async () => {
      const baselineDownload = await driver.exportPdf(downloadDir, "annotation-baseline");
      const baseline = await inspectPdfFile(baselineDownload.path);
      const created = await driver.createAnnotation();
      const annotatedDownload = await driver.exportPdf(downloadDir, "annotation");
      const annotated = await inspectPdfFile(annotatedDownload.path);
      assert(annotated.pageCount === baseline.pageCount, "Annotation export changed page count");
      assert(annotated.sha256 !== baseline.sha256, "Annotation gesture did not change exported PDF bytes");
      return { tool: created.tool, baseline: baseline.sha256, annotated: annotated.sha256, download: annotatedDownload };
    });

    await check("e2e-secure-redaction", async () => {
      const secret = "SECRET-PRIMARY";
      await driver.applySecureRedaction(secret);
      const download = await driver.exportPdf(downloadDir, "redacted");
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 5, "Secure redaction changed page count");
      assert(!output.text.includes(secret), "Secure redaction left the target text searchable in exported PDF");
      return { download, removed: secret };
    });

    await check("e2e-ocr", async () => {
      const download = await driver.runOcrDownload(downloadDir);
      const output = await inspectPdfFile(download.path);
      assert(output.pageCount === 5, `OCR output should preserve 5 pages, got ${output.pageCount}`);
      assert(output.byteLength > 0, "OCR output is empty");
      return { download, pageCount: output.pageCount, textLength: output.text.length };
    });

    await check("e2e-ai-response", async () => {
      const response = await driver.askAi("help");
      assert(response.response.length >= 5, "AI response was unexpectedly short");
      return { response: response.response.slice(0, 500) };
    });
  }

  const finalState = await driver.inspect();
  await check("no-console-errors", async () => {
    assert(finalState.errors.console.length === 0, `Console errors: ${finalState.errors.console.join(" | ")}`);
  });
  await check("no-page-errors", async () => {
    assert(finalState.errors.page.length === 0, `Page errors: ${finalState.errors.page.join(" | ")}`);
  });
  await check("no-network-failures", async () => {
    assert(finalState.errors.network.length === 0, `Network errors: ${JSON.stringify(finalState.errors.network)}`);
  });

  return {
    ok: checks.every((item) => item.status === "pass"),
    mode,
    url: options.url,
    generatedDocuments: {
      primary: pdfPath,
      secondary: secondaryPdfPath,
    },
    checks,
    screenshots,
    downloads: [...driver.downloads],
    videoDir: options.videoDir ? resolve(options.videoDir) : null,
    state: finalState,
  };
}
