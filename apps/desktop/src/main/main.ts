import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
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
    const indexPath = join(app.getAppPath(), "..", "web", "dist", "index.html");
    void win.loadFile(indexPath);
  }

  return win;
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

  ipcMain.handle("opdf:save-as", async (_event, bytes: Uint8Array) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: documentService.createTempName("document"),
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await documentService.save(result.filePath, bytes);
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
