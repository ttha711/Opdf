import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  AnnotationService,
  DocumentService,
  OcrService,
  StorageService,
  type AnnotationCreateInput,
  type CropOptions,
  type HeaderFooterLine,
  type InsertOptions,
  type PageNumbers,
  type PasswordOptions,
  type SessionSnapshot,
} from "@opdf/core";

const documentService = new DocumentService();
const annotationService = new AnnotationService();
const ocrService = new OcrService();
const storageService = new StorageService(join(homedir(), ".opdf"));

type AiProviderConfig = {
  mode: "dify" | "local" | "iframe";
  difyUrl?: string;
  difyKey?: string;
};

let aiProviderConfig: AiProviderConfig = {
  mode: "local",
};


function toNodeBuffer(bytes: unknown): Buffer {
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes);
  }
  if (Array.isArray(bytes)) {
    return Buffer.from(bytes);
  }
  throw new Error("Invalid binary payload: expected Uint8Array or ArrayBuffer");
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServer = process.env.OPDF_DEV_SERVER;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    const basePath = app.getAppPath();
    const candidates = [
      join(basePath, "web", "dist", "index.html"),
      join(basePath, "..", "web", "dist", "index.html"),
      join(process.resourcesPath, "web", "dist", "index.html"),
    ];
    const indexPath = candidates.find((p) => existsSync(p)) || candidates[0];
    void win.loadFile(indexPath);
  }

  return win;
}

function resolveBundledPython(): string {
  const devPython = join(app.getAppPath(), "tools", "python", "runtime", "python.exe");
  if (existsSync(devPython)) return devPython;
  const prodPython = join(process.resourcesPath, "app.asar.unpacked", "tools", "python", "runtime", "python.exe");
  if (existsSync(prodPython)) return prodPython;
  return "python";
}

function resolveConverterScript(): string {
  const devScript = join(app.getAppPath(), "tools", "pdf_office_convert.py");
  if (existsSync(devScript)) return devScript;
  return join(process.resourcesPath, "app.asar.unpacked", "tools", "pdf_office_convert.py");
}

function resolveRewritePipelineScript(): string {
  const devScript = join(app.getAppPath(), "tools", "pdf_office_rewrite_pipeline.py");
  if (existsSync(devScript)) return devScript;
  return join(process.resourcesPath, "app.asar.unpacked", "tools", "pdf_office_rewrite_pipeline.py");
}

function resolveSofficePath(): string {
  const envPath = process.env.OPDF_SOFFICE_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "soffice";
}
function resolvePowershellScript(): string {
  const devScript = join(app.getAppPath(), "tools", "pdf_office_convert.ps1");
  if (existsSync(devScript)) return devScript;
  return join(process.resourcesPath, "app.asar.unpacked", "tools", "pdf_office_convert.ps1");
}

function registerIpcHandlers(): void {
  ipcMain.handle("opdf:open-project-folder", async () => {
    const targetPath = process.env.OPDF_PROJECT_PATH || app.getAppPath();
    const result = await shell.openPath(targetPath);
    return result === "";
  });

  ipcMain.handle("opdf:pick-and-open", async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const opened = await documentService.open(filePath);
    await storageService.pushRecent(filePath);
    return opened;
  });

  ipcMain.handle("opdf:open", async (_event, filePath: string) => documentService.open(filePath));
  ipcMain.handle("opdf:save", async (_event, filePath: string, bytes: Uint8Array) => documentService.save(filePath, bytes));
  ipcMain.handle("opdf:export-flattened", async (_event, bytes: Uint8Array, annotations: any[]) => documentService.exportFlattened(bytes, annotations));
  
  // Advanced Tools
  ipcMain.handle("opdf:compress", async (_event, bytes: Uint8Array) => documentService.compressPdf(bytes));
  ipcMain.handle("opdf:watermark", async (_event, bytes: Uint8Array, text: string) => documentService.watermarkPdf(bytes, text));
  ipcMain.handle("opdf:merge", async (_event, bytesList: Uint8Array[]) => documentService.merge(bytesList));
  ipcMain.handle("opdf:split", async (_event, bytes: Uint8Array, pages: number[]) => documentService.split(bytes, pages));
  ipcMain.handle("opdf:encrypt", async (_event, bytes: Uint8Array, opts: PasswordOptions) => documentService.encryptPdf(bytes, opts));
  ipcMain.handle("opdf:decrypt", async (_event, bytes: Uint8Array, password: string) => documentService.decryptPdf(bytes, password));
  ipcMain.handle("opdf:insert-pages", async (_event, bytes: Uint8Array, opts: InsertOptions) => documentService.insertPages(bytes, opts));
  ipcMain.handle("opdf:delete-pages", async (_event, bytes: Uint8Array, pageNumbers: number[]) => documentService.deletePages(bytes, pageNumbers));
  ipcMain.handle("opdf:crop-page", async (_event, bytes: Uint8Array, opts: CropOptions) => documentService.cropPage(bytes, opts));
  ipcMain.handle("opdf:add-page-numbers", async (_event, bytes: Uint8Array, opts: PageNumbers) => documentService.addPageNumbers(bytes, opts));
  ipcMain.handle("opdf:add-header-footer", async (_event, bytes: Uint8Array, lines: HeaderFooterLine[], isHeader: boolean) => documentService.addHeaderFooter(bytes, lines, isHeader));
  ipcMain.handle("opdf:add-bookmarks", async (_event, bytes: Uint8Array, bookmarks: Array<{ title: string; page: number; parent?: number }>) => documentService.addBookmarks(bytes, bookmarks));
  ipcMain.handle("opdf:add-bates-numbering", async (_event, bytes: Uint8Array, prefix: string, startNumber: number, suffix?: string) => documentService.addBatesNumbering(bytes, prefix, startNumber, suffix));
  ipcMain.handle("opdf:convert-to-pdfa", async (_event, bytes: Uint8Array) => documentService.convertToPdfA(bytes));
  ipcMain.handle("opdf:rotate-pages", async (_event, bytes: Uint8Array, pageNumbers: number[], degrees: number) => documentService.rotatePages(bytes, pageNumbers, degrees));
  ipcMain.handle("opdf:convert-pdf-office", async (_event, bytes: Uint8Array, format: "docx" | "pptx" | "xlsx") => {
    const payload = toNodeBuffer(bytes);
    if (payload.byteLength === 0) throw new Error("Cannot convert empty PDF payload.");

    const workDir = await mkdtemp(join(tmpdir(), "opdf-convert-"));
    const inputPath = join(workDir, "input.pdf");
    const outputPath = join(workDir, `output.${format}`);
    await writeFile(inputPath, payload);

    const run = () =>
      new Promise<void>((resolve, reject) => {
        let child;
        if (false) {
        } else {
          const pythonExe = resolveBundledPython();
          const mode = format === "docx" ? (process.env.OPDF_REWRITE_MODE || "strict-factual") : "auto";
          const scriptPath = format === "docx" ? resolveRewritePipelineScript() : resolveConverterScript();
          child = spawn(pythonExe, [scriptPath, inputPath, format, outputPath, mode], {
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, OPDF_SOFFICE_PATH: resolveSofficePath(), OPDF_DIFY_URL: aiProviderConfig.difyUrl || "", OPDF_DIFY_KEY: aiProviderConfig.difyKey || "", OPDF_AI_MODE: aiProviderConfig.mode || "local" },
          });

        }
        let stderr = "";
        child.stderr.on("data", (d) => { stderr += String(d); });
        let stdout = "";
        child.stdout.on("data", (d) => { stdout += String(d); });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr || stdout || `Converter exited with code ${code}`));
        });
      });

    try {
      await run();
      const out = await readFile(outputPath);
      return new Uint8Array(out);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  ipcMain.handle("opdf:save-file", async (_event, bytes: Uint8Array, defaultName: string, extensions: string[]) => {
    const ext = defaultName.split(".").pop() || "bin";
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const payload = toNodeBuffer(bytes);
    if (payload.byteLength === 0) {
      throw new Error("Refusing to write empty file payload.");
    }
    const fs = await import("node:fs/promises");
    await fs.writeFile(result.filePath, payload);
    return result.filePath;
  });

  ipcMain.handle("opdf:save-as", async (_event, bytes: Uint8Array) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: documentService.createTempName("document"),
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const payload = toNodeBuffer(bytes);
    if (payload.byteLength === 0) {
      throw new Error("Refusing to save empty PDF payload.");
    }
    await documentService.save(result.filePath, new Uint8Array(payload));
    return result.filePath;
  });

  ipcMain.handle("opdf:storage:get-recent", async () => storageService.getRecent());
  ipcMain.handle("opdf:storage:push-recent", async (_event, filePath: string) => storageService.pushRecent(filePath));
  ipcMain.handle("opdf:storage:restore-session", async () => storageService.restoreSession());
  ipcMain.handle("opdf:storage:write-session", async (_event, session: SessionSnapshot) => storageService.writeSession(session));

  ipcMain.handle("opdf:annotation:list", async (_event, documentId: string) => {
    const stored = await storageService.listAnnotations(documentId);
    if (stored.length > 0 && annotationService.list(documentId).length === 0) {
      annotationService.replace(documentId, stored);
    }
    return annotationService.list(documentId);
  });
  ipcMain.handle("opdf:annotation:create", async (_event, documentId: string, input: AnnotationCreateInput) => {
    const created = annotationService.create(documentId, input);
    await storageService.writeAnnotations(documentId, annotationService.list(documentId));
    return created;
  });
  ipcMain.handle("opdf:annotation:delete", async (_event, documentId: string, id: string) => {
    const deleted = annotationService.delete(documentId, id);
    await storageService.writeAnnotations(documentId, annotationService.list(documentId));
    return deleted;
  });
  ipcMain.handle("opdf:annotation:update", async (_event, documentId: string, id: string, payload: Record<string, unknown>) => {
    const updated = annotationService.update(documentId, id, payload);
    await storageService.writeAnnotations(documentId, annotationService.list(documentId));
    return updated;
  });
  ipcMain.handle("opdf:annotation:undo", async (_event, documentId: string) => {
    const annotations = annotationService.undo(documentId);
    await storageService.writeAnnotations(documentId, annotations);
    return annotations;
  });
  ipcMain.handle("opdf:annotation:redo", async (_event, documentId: string) => {
    const annotations = annotationService.redo(documentId);
    await storageService.writeAnnotations(documentId, annotations);
    return annotations;
  });

  ipcMain.handle("opdf:ocr:enqueue", async (_event, filePath: string, language?: string) => ocrService.enqueue(filePath, language));
  ipcMain.handle("opdf:ocr:run", async (_event, jobId: string) => ocrService.run(jobId));
  ipcMain.handle("opdf:ocr:list", async () => ocrService.list());

  ipcMain.handle("opdf:ai-config:set", async (_event, cfg: AiProviderConfig) => {
    aiProviderConfig = { ...aiProviderConfig, ...cfg };
    return true;
  });

  ipcMain.handle("opdf:ai-config:get", async () => aiProviderConfig);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});









