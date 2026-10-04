import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createSamplePdf } from "./sample.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function runAudit(driver, mode, options) {
  const outDir = resolve(options.out);
  await mkdir(outDir, { recursive: true });
  const pdfPath = options.pdf ?? await createSamplePdf(outDir, 3);
  const checks = [];
  const screenshots = [];

  const check = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, status: "pass" });
    } catch (error) {
      checks.push({ name, status: "fail", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  await check("load-pdf", async () => {
    const state = await driver.loadPdf(pdfPath);
    assert(state.document.hasDocument, "Document did not enter loaded state");
    assert(state.document.totalPages >= 1, "Page count was not detected");
  });

  await check("main-page-surface", async () => {
    assert(await driver.surfaceIsVisible(), "Main PDF page surface is blank");
  });

  await check("single-thumbnail-rail", async () => {
    const state = await driver.inspect();
    assert(state.navigation.opdfThumbnailPanels === 1, "Expected exactly one OPDF thumbnail rail");
    assert(!state.navigation.embedPdfSidebarVisible, "EmbedPDF internal sidebar is visible");
    assert(state.navigation.thumbnailCount === state.document.totalPages, "Thumbnail count does not match page count");
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
    assert(state.document.zoom > 1.15 && state.document.zoom < 1.35, "Zoom did not reach approximately 125%");
    await driver.setZoom(100);
  });

  await check("menus", async () => {
    await driver.openMenu("File");
    await driver.page.keyboard.press("Escape");
    await driver.openMenu("Tools");
    await driver.page.keyboard.press("Escape");
  });

  const smokeShot = resolve(outDir, "smoke-viewer.png");
  screenshots.push((await driver.screenshot(smokeShot)).path);

  if (mode === "full") {
    for (const tool of ["split", "merge", "page-numbers", "watermark", "compress"]) {
      await check(`tool-${tool}`, async () => {
        await driver.openTool(tool);
        const state = await driver.inspect();
        if (tool !== "compress") {
          assert(state.panels.includes("tool") || tool === "page-numbers", `${tool} did not open its working UI`);
        }
        await driver.closeTool();
        await driver.page.keyboard.press("Escape");
      });
    }

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

    const fullShot = resolve(outDir, "full-viewer.png");
    screenshots.push((await driver.screenshot(fullShot)).path);
  }

  const finalState = await driver.inspect();
  await check("no-console-errors", async () => {
    assert(finalState.errors.console.length === 0, `Console errors: ${finalState.errors.console.join(" | ")}`);
  });
  await check("no-network-failures", async () => {
    assert(finalState.errors.network.length === 0, `Network errors: ${JSON.stringify(finalState.errors.network)}`);
  });

  return {
    ok: checks.every((item) => item.status === "pass"),
    mode,
    url: options.url,
    pdf: pdfPath,
    checks,
    screenshots,
    state: finalState,
  };
}
