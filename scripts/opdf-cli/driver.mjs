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
    this.pageErrors = [];
    this.networkErrors = [];
    this.downloads = [];
  }

  async start() {
    this.browser = await chromium.launch({ headless: !this.options.headed });
    const contextOptions = {
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      extraHTTPHeaders: Object.keys(this.options.headers || {}).length ? this.options.headers : undefined,
    };
    if (this.options.videoDir) {
      await mkdir(resolve(this.options.videoDir), { recursive: true });
      contextOptions.recordVideo = {
        dir: resolve(this.options.videoDir),
        size: { width: 1600, height: 1000 },
      };
    }
    this.context = await this.browser.newContext(contextOptions);
    await this.context.addInitScript(() => {
      try {
        delete window.showSaveFilePicker;
      } catch {}
      try {
        localStorage.setItem("opdf_ai_mode", "local");
      } catch {}
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
    this.page.on("pageerror", (error) => {
      this.pageErrors.push(String(error?.stack || error?.message || error));
    });
    this.page.on("requestfailed", (request) => {
      const method = request.method();
      const error = request.failure()?.errorText ?? "unknown";
      // EmbedPDF can intentionally abort stale server-document reads while a
      // new working copy replaces the active PDF. Blank-surface/page-count
      // assertions still catch genuine document-load failures, so only the
      // OPDF document endpoint's explicit ERR_ABORTED cancellation is benign.
      const requestUrl = request.url();
      const isServerDocumentRead = /\/api\/opdf\/documents\/[^/?#]+(?:[/?#]|$)/.test(requestUrl);
      if (error.includes("ERR_ABORTED") && isServerDocumentRead && (method === "HEAD" || method === "GET")) return;
      this.networkErrors.push({
        type: "requestfailed",
        method,
        url: requestUrl,
        error,
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
    const surfaces = viewer.locator("img, canvas");
    const deadline = Date.now() + this.options.timeout;
    let diagnostics = [];

    while (Date.now() < deadline) {
      diagnostics = await surfaces.evaluateAll((items) => items.map((surface) => {
        const rect = surface.getBoundingClientRect();
        const isCanvas = surface instanceof HTMLCanvasElement;
        return {
          tag: surface.tagName.toLowerCase(),
          width: isCanvas ? surface.width : surface.naturalWidth,
          height: isCanvas ? surface.height : surface.naturalHeight,
          rectWidth: Math.round(rect.width),
          rectHeight: Math.round(rect.height),
        };
      }).filter((item) => item.rectWidth > 0 && item.rectHeight > 0));

      if (diagnostics.some((surface) =>
        surface.width >= 250 &&
        surface.height >= 250 &&
        surface.rectWidth >= 220 &&
        surface.rectHeight >= 220
      )) return diagnostics;

      await this.page.waitForTimeout(200);
    }

    throw new Error(`Main PDF page surface did not render within ${this.options.timeout} ms. Surfaces: ${JSON.stringify(diagnostics)}`);
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
      message: element.getAttribute("data-opdf-message") || "",
    })) : {
      hasDocument: false,
      page: 0,
      totalPages: 0,
      zoom: 0,
      activeTool: "select",
      saveState: "idle",
      message: "",
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

    const dialogs = await this.page.locator("[data-opdf-dialog]").evaluateAll((items) =>
      items.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
      }).map((element) => element.getAttribute("data-opdf-dialog")),
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
        zoomPercent: viewerVisible
          ? Number(await viewer.locator('input[aria-label="Set zoom"]').first().inputValue().catch(() => String(Math.round(attrs.zoom * 100))))
          : Math.round(attrs.zoom * 100),
        renderedSurfaces: surfaces,
      },
      navigation: {
        thumbnailCount: await this.page.locator('[data-opdf-page-action="goto"]').count(),
        opdfThumbnailPanels: await this.page.locator('[data-opdf-panel="pages"]').count(),
        embedPdfSidebarVisible: internalSidebarVisible,
      },
      panels: [...new Set(panels.filter(Boolean))],
      dialogs: [...new Set(dialogs.filter(Boolean))],
      errors: {
        console: [...this.consoleErrors],
        page: [...this.pageErrors],
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

    const deadline = Date.now() + this.options.timeout;
    let current = Number(await input.inputValue().catch(() => "0"));
    while (Date.now() < deadline) {
      current = Number(await input.inputValue().catch(() => "0"));
      if (Number.isFinite(current) && Math.abs(current - numeric) <= 2) break;
      await this.page.waitForTimeout(100);
    }
    if (!Number.isFinite(current) || Math.abs(current - numeric) > 2) {
      throw new Error(`Viewer zoom did not reach ${numeric}% within ${this.options.timeout} ms (current: ${current || "unknown"}%)`);
    }

    return this.inspect();
  }

  async openMenu(name) {
    const key = String(name).trim().toLowerCase();
    const labels = { file: "File", edit: "Edit", view: "View", tools: "Tools" };
    const label = labels[key];
    if (!label) throw new Error('Menu must be one of: File, Edit, View, Tools');
    const trigger = this.page.locator(`[data-opdf-menu-trigger="${label}"]`);
    await trigger.click();
    const menu = this.page.locator(`[data-opdf-menu-surface="${label}"]`);
    await menu.waitFor({ state: "visible" });
    const reachable = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return false;
      const x = Math.min(window.innerWidth - 2, Math.max(1, rect.left + 16));
      const y = Math.min(window.innerHeight - 2, Math.max(1, rect.top + 12));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && element.contains(hit));
    });
    if (!reachable) throw new Error(`${label} menu is clipped or visually occluded`);
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

  async closeDialog() {
    const close = this.page.locator('[data-opdf-action="close-dialog"]').first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await this.page.waitForTimeout(100);
    }
  }

  async waitForDocumentPages(expectedPages) {
    const expected = Number(expectedPages);
    await this.page.locator(`[data-opdf-region="status-bar"][data-opdf-total-pages="${expected}"]`).waitFor({
      state: "visible",
      timeout: this.options.timeout,
    });
    await this.waitForPdfSurface();
    return this.inspect();
  }

  async waitForStatusMessage(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), "i");
    await this.page.waitForFunction(
      ({ source, flags }) => {
        const status = document.querySelector('[data-opdf-region="status-bar"]');
        const message = status?.getAttribute("data-opdf-message") || "";
        return new RegExp(source, flags).test(message);
      },
      { source: regex.source, flags: regex.flags },
      { timeout: this.options.timeout },
    );
    return this.inspect();
  }

  async downloadByClick(locator, targetDir, label) {
    await mkdir(resolve(targetDir), { recursive: true });
    const [download] = await Promise.all([
      this.page.waitForEvent("download", { timeout: this.options.timeout }),
      locator.click(),
    ]);
    const suggestedName = download.suggestedFilename();
    const safeLabel = String(label || "download").replace(/[^a-z0-9._-]+/gi, "-");
    const target = resolve(targetDir, `${safeLabel}-${suggestedName}`);
    await download.saveAs(target);
    const failure = await download.failure();
    if (failure) throw new Error(`Download failed: ${failure}`);
    const info = { path: target, suggestedName, label: safeLabel };
    this.downloads.push(info);
    return info;
  }

  async exportPdf(targetDir, label = "export") {
    await this.openMenu("File");
    const item = this.page.locator('[data-opdf-menu-item="Export PDF..."]');
    if (await item.isDisabled()) throw new Error("Export PDF is disabled");
    return this.downloadByClick(item, targetDir, label);
  }

  async runSplitDownload(targetDir) {
    await this.openTool("split");
    await this.page.locator('[data-opdf-field="split-mode-extract"]').check();
    const field = this.page.locator('[data-opdf-field="split-extract"]');
    await field.fill("1, 3");
    return this.downloadByClick(
      this.page.locator('[data-opdf-action="split-run"]'),
      targetDir,
      "split",
    );
  }

  async runMergeDownload(extraPdfPath, targetDir) {
    await this.openTool("merge");
    await this.page.locator('[data-opdf-file-input="merge-pdf"]').setInputFiles(resolve(extraPdfPath));
    await this.page.waitForFunction(() => document.querySelectorAll("[data-opdf-merge-item]").length >= 2, null, {
      timeout: this.options.timeout,
    });
    return this.downloadByClick(
      this.page.locator('[data-opdf-action="merge-download"]'),
      targetDir,
      "merge",
    );
  }

  async runInsert(extraPdfPath, expectedPages) {
    await this.openTool("insert");
    await this.page.locator('[data-opdf-field="insert-file"]').setInputFiles(resolve(extraPdfPath));
    await this.page.locator('[data-opdf-action="insert-run"]').click();
    return this.waitForDocumentPages(expectedPages);
  }

  async applyWatermark(text) {
    await this.openTool("watermark");
    await this.page.locator('[data-opdf-field="watermark-text"]').fill(String(text));
    await this.page.locator('[data-opdf-action="watermark-run"]').click();
    await this.waitForStatusMessage(/watermark stamped/i);
    await this.waitForPdfSurface();
    return this.inspect();
  }

  async applyMarkup(tool, values = {}) {
    await this.openTool(tool);
    const panel = this.page.locator('[data-opdf-panel="markup"]');
    await panel.waitFor({ state: "visible" });

    if (values.text !== undefined) {
      const input = panel.locator('[data-opdf-field="markup-text"]');
      if (await input.count()) await input.fill(String(values.text));
    }
    if (values.prefix !== undefined) {
      const input = panel.locator('[data-opdf-field="markup-prefix"]');
      if (await input.count()) await input.fill(String(values.prefix));
    }
    if (values.suffix !== undefined) {
      const input = panel.locator('[data-opdf-field="markup-suffix"]');
      if (await input.count()) await input.fill(String(values.suffix));
    }
    if (values.start !== undefined) {
      const input = panel.locator('[data-opdf-field="markup-start"]');
      if (await input.count()) await input.fill(String(values.start));
    }

    await panel.locator('[data-opdf-action="markup-apply"]').click();
    const expected = {
      "page-numbers": /page numbers added/i,
      header: /header added/i,
      footer: /footer added/i,
      bates: /bates numbering added/i,
    }[tool];
    if (expected) await this.waitForStatusMessage(expected);
    await this.waitForPdfSurface();
    return this.inspect();
  }

  async applySecureRedaction(query) {
    await this.openTool("redact");
    const dialog = this.page.locator('[data-opdf-dialog="search-redact"]');
    await dialog.locator('[data-opdf-field="redact-query"]').fill(String(query));
    await dialog.locator('[data-opdf-action="redact-search"]').click();
    const selectAll = dialog.locator('[data-opdf-action="redact-select-all"]');
    await selectAll.waitFor({ state: "visible", timeout: this.options.timeout });
    await selectAll.click();
    const apply = dialog.locator('[data-opdf-action="redact-apply"]');
    await apply.waitFor({ state: "visible" });
    if (await apply.isDisabled()) throw new Error("Secure redaction found no selectable matches");
    await apply.click();
    await dialog.waitFor({ state: "hidden", timeout: this.options.timeout });
    await this.waitForPdfSurface();
    return this.inspect();
  }

  async runOcrDownload(targetDir) {
    await this.openMenu("Tools");
    const item = this.page.locator('[data-opdf-menu-item="Run OCR"]');
    if (await item.isDisabled()) throw new Error("OCR is disabled");
    return this.downloadByClick(item, targetDir, "ocr");
  }

  async createAnnotation() {
    const viewer = this.page.locator('[data-opdf-engine="pdfium-wasm"]');
    const toolbar = viewer;
    const annotate = toolbar.getByRole("button", { name: "Annotate", exact: true });
    await annotate.click();

    const candidates = toolbar.getByRole("button");
    const count = await candidates.count();
    let chosen = null;
    const preferred = [/ink/i, /draw/i, /pencil/i, /highlight/i];
    for (const pattern of preferred) {
      for (let index = 0; index < count; index += 1) {
        const button = candidates.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;
        const label = [
          await button.getAttribute("aria-label"),
          await button.getAttribute("title"),
          await button.textContent(),
        ].filter(Boolean).join(" ");
        if (pattern.test(label)) {
          chosen = { button, label };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      const labels = [];
      for (let index = 0; index < count; index += 1) {
        const button = candidates.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;
        labels.push([
          await button.getAttribute("aria-label"),
          await button.getAttribute("title"),
          await button.textContent(),
        ].filter(Boolean).join(" "));
      }
      throw new Error(`No drawable annotation tool was found. Visible buttons: ${labels.join(" | ")}`);
    }

    await chosen.button.click();
    const surface = viewer.locator("canvas, img").filter({ visible: true }).last();
    const box = await surface.boundingBox();
    if (!box || box.width < 200 || box.height < 200) throw new Error("No usable PDF surface for annotation gesture");

    const startX = box.x + Math.min(180, box.width * 0.25);
    const startY = box.y + Math.min(180, box.height * 0.25);
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + Math.min(160, box.width * 0.25), startY + 35, { steps: 12 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(700);

    return { ok: true, tool: chosen.label, state: await this.inspect() };
  }

  async openAi() {
    const open = this.page.locator('[data-opdf-action="open-ai"]');
    if (await open.isVisible().catch(() => false)) await open.click();
    await this.page.locator('[data-opdf-panel="ai"]').waitFor({ state: "visible" });
    return { ok: true, panel: "ai" };
  }

  async askAi(text) {
    await this.openAi();
    const responses = this.page.locator('[data-opdf-ai-message="assistant"][data-opdf-ai-pending="false"]');
    const before = await responses.count();
    const input = this.page.locator("[data-opdf-ai-input]");
    await input.fill(String(text));
    await this.page.locator("[data-opdf-ai-send]").click();
    await this.page.waitForFunction(
      (count) => document.querySelectorAll('[data-opdf-ai-message="assistant"][data-opdf-ai-pending="false"]').length > count,
      before,
      { timeout: this.options.timeout },
    );
    const response = (await responses.last().innerText()).trim();
    if (!response) throw new Error("AI assistant returned an empty response");
    return { ok: true, submitted: true, text: String(text), response };
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
