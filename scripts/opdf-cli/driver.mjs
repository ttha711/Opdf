import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveTool } from "./tools.mjs";

export class OpdfDriver {
  constructor(options) {
    this.options = options;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.consoleErrors = [];
    this.networkErrors = [];
  }

  async start() {
    this.browser = await chromium.launch({ headless: !this.options.headed });
    this.context = await this.browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });
    if (this.options.trace) {
      await mkdir(dirname(resolve(this.options.trace)), { recursive: true });
      await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    }

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeout);
    this.page.on("console", (message) => {
      if (message.type() === "error") this.consoleErrors.push(message.text());
    });
    this.page.on("requestfailed", (request) => {
      this.networkErrors.push({
        type: "requestfailed",
        method: request.method(),
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown",
      });
    });
    this.page.on("response", (response) => {
      if (response.status() >= 500) {
        this.networkErrors.push({
          type: "http",
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await this.page.goto(this.options.url, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(this.options.wait);
    return this;
  }

  async close() {
    if (this.context && this.options.trace) {
      await this.context.tracing.stop({ path: resolve(this.options.trace) });
    }
    await this.browser?.close();
  }

  async loadPdf(path) {
    const input = this.page.locator('input[type="file"][accept="application/pdf"]').first();
    await input.setInputFiles(resolve(path));
    await this.page.locator('[data-opdf-engine="pdfium-wasm"]').waitFor({ state: "visible" });
    await this.page.locator('[data-opdf-region="status-bar"][data-opdf-has-document="true"]').waitFor({
      state: "visible",
      timeout: this.options.timeout,
    });
    await this.waitForPdfSurface();
    return this.inspect();
  }

  async waitForPdfSurface() {
    const viewer = this.page.locator('[data-opdf-engine="pdfium-wasm"]');
    await viewer.waitFor({ state: "visible" });
    await this.page.waitForFunction(() => {
      const root = document.querySelector('[data-opdf-engine="pdfium-wasm"]');
      if (!root) return false;
      return Array.from(root.querySelectorAll("img, canvas")).some((surface) => {
        const rect = surface.getBoundingClientRect();
        const width = surface instanceof HTMLCanvasElement ? surface.width : surface.naturalWidth;
        const height = surface instanceof HTMLCanvasElement ? surface.height : surface.naturalHeight;
        return width >= 250 && height >= 250 && rect.width >= 220 && rect.height >= 220;
      });
    }, null, { timeout: this.options.timeout });
  }

  async inspect() {
    const status = this.page.locator('[data-opdf-region="status-bar"]');
    const statusExists = await status.count();
    const attrs = statusExists ? await status.evaluate((element) => ({
      hasDocument: element.getAttribute("data-opdf-has-document") === "true",
      page: Number(element.getAttribute("data-opdf-page") || 0),
      totalPages: Number(element.getAttribute("data-opdf-total-pages") || 0),
      zoom: Number(element.getAttribute("data-opdf-zoom") || 0),
      activeTool: element.getAttribute("data-opdf-active-tool") || "select",
      saveState: element.getAttribute("data-opdf-save-state") || "idle",
    })) : {
      hasDocument: false,
      page: 0,
      totalPages: 0,
      zoom: 0,
      activeTool: "select",
      saveState: "idle",
    };

    const viewer = this.page.locator('[data-opdf-engine="pdfium-wasm"]');
    const viewerVisible = await viewer.isVisible().catch(() => false);
    const viewerBox = viewerVisible ? await viewer.boundingBox() : null;
    const surfaces = viewerVisible
      ? await viewer.locator("img, canvas").evaluateAll((items) => items.map((surface) => {
          const rect = surface.getBoundingClientRect();
          const isCanvas = surface instanceof HTMLCanvasElement;
          return {
            tag: surface.tagName.toLowerCase(),
            width: isCanvas ? surface.width : surface.naturalWidth,
            height: isCanvas ? surface.height : surface.naturalHeight,
            rectWidth: Math.round(rect.width),
            rectHeight: Math.round(rect.height),
          };
        }).filter((item) => item.rectWidth > 0 && item.rectHeight > 0))
      : [];

    const panels = await this.page.locator("[data-opdf-panel]").evaluateAll((items) =>
      items.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
      }).map((element) => element.getAttribute("data-opdf-panel")),
    );

    const internalSidebarVisible = await this.page.locator('[data-epdf-cat*="panel-sidebar"]').evaluateAll((items) =>
      items.some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && getComputedStyle(element).display !== "none";
      }),
    );

    return {
      ok: true,
      url: this.page.url(),
      document: attrs,
      viewer: {
        visible: viewerVisible,
        width: Math.round(viewerBox?.width ?? 0),
        height: Math.round(viewerBox?.height ?? 0),
        renderedSurfaces: surfaces,
      },
      navigation: {
        thumbnailCount: await this.page.locator('[data-opdf-page-action="goto"]').count(),
        opdfThumbnailPanels: await this.page.locator('[data-opdf-panel="pages"]').count(),
        embedPdfSidebarVisible: internalSidebarVisible,
      },
      panels: [...new Set(panels.filter(Boolean))],
      errors: {
        console: [...this.consoleErrors],
        network: [...this.networkErrors],
      },
    };
  }

  async gotoPage(pageNumber) {
    const numeric = Number(pageNumber);
    if (!Number.isInteger(numeric) || numeric < 1) throw new Error("Page number must be a positive integer");
    const target = this.page.locator(`[data-opdf-page-action="goto"][data-opdf-page="${numeric}"]`);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await this.page.locator(`[data-opdf-region="status-bar"][data-opdf-page="${numeric}"]`).waitFor({
      state: "visible",
    });
    return this.inspect();
  }

  async setZoom(percent) {
    const numeric = Number(percent);
    if (!Number.isFinite(numeric) || numeric < 5 || numeric > 500) {
      throw new Error("Zoom must be between 5 and 500 percent");
    }
    const input = this.page.locator('[data-opdf-engine="pdfium-wasm"] input[aria-label="Set zoom"]').first();
    await input.fill(String(Math.round(numeric)));
    await input.press("Enter");
    await this.page.waitForTimeout(250);
    return this.inspect();
  }

  async openMenu(name) {
    const key = String(name).trim().toLowerCase();
    const labels = { file: "File", edit: "Edit", view: "View", tools: "Tools" };
    const label = labels[key];
    if (!label) throw new Error('Menu must be one of: File, Edit, View, Tools');
    const trigger = this.page.locator(`[data-opdf-menu-trigger="${label}"]`);
    await trigger.click();
    await this.page.locator(`[data-opdf-menu-surface="${label}"]`).waitFor({ state: "visible" });
    return { ok: true, menu: label };
  }

  async openTool(name) {
    const tool = resolveTool(name);
    if (tool.quick) {
      const quick = this.page.locator(`button[data-opdf-tool="${tool.quick}"]`);
      if (await quick.isVisible().catch(() => false)) {
        await quick.click();
        await this.page.waitForTimeout(200);
        return { ok: true, tool: tool.key, via: "quick-tool", state: await this.inspect() };
      }
    }

    await this.openMenu("Tools");
    const item = this.page.locator(`[data-opdf-menu-item="${tool.menu}"]`);
    if ((await item.count()) === 0) throw new Error(`Tool "${name}" was not found in the Tools menu`);
    if (await item.isDisabled()) throw new Error(`Tool "${name}" is disabled in the current runtime`);
    await item.click();
    await this.page.waitForTimeout(200);
    return { ok: true, tool: tool.key, via: "tools-menu", state: await this.inspect() };
  }

  async closeTool() {
    const close = this.page.locator('[data-opdf-action="close-tool"]').first();
    if (await close.isVisible().catch(() => false)) await close.click();
  }

  async openAi() {
    const open = this.page.locator('[data-opdf-action="open-ai"]');
    if (await open.isVisible().catch(() => false)) await open.click();
    await this.page.locator('[data-opdf-panel="ai"]').waitFor({ state: "visible" });
    return { ok: true, panel: "ai" };
  }

  async askAi(text) {
    await this.openAi();
    const input = this.page.locator("[data-opdf-ai-input]");
    await input.fill(String(text));
    await this.page.locator("[data-opdf-ai-send]").click();
    await this.page.waitForTimeout(350);
    return { ok: true, submitted: true, text: String(text) };
  }

  async screenshot(path) {
    const target = resolve(path);
    await mkdir(dirname(target), { recursive: true });
    await this.page.screenshot({ path: target, fullPage: true });
    return { ok: true, path: target };
  }

  async surfaceIsVisible() {
    const info = await this.inspect();
    return info.viewer.renderedSurfaces.some((surface) =>
      surface.width >= 250 && surface.height >= 250 && surface.rectWidth >= 220 && surface.rectHeight >= 220
    );
  }
}
