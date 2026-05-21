import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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

type DeviceAuthState = {
  deviceId: string;
  appToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  lastError?: string;
  updatedAt?: string;
};

type LiveEditorBlock = {
  id: string;
  type: "paragraph" | "heading" | "list" | "image" | "table";
  content: string;
  html: string;
  style: {
    font: string;
    size: number;
    color: string;
    lineHeight?: number;
  };
};

type LiveEditorPatchRequest = {
  prompt: string;
  selectedBlocks: LiveEditorBlock[];
  allBlocks: LiveEditorBlock[];
  referenceImage: string | null;
};

type LiveEditorPatchResponse = {
  updates: Array<Partial<LiveEditorBlock> & { id: string }>;
};

const DEVICE_AUTH_FILE = join(app.getPath("userData"), "ai-device-auth.json");

let deviceAuthState: DeviceAuthState = {
  deviceId: "",
};

function getAiGatewayBaseUrl(): string {
  const raw = (
    process.env.OPDF_AI_GATEWAY_URL ||
    process.env.OPDF_LIVE_EDITOR_AI_ENDPOINT ||
    aiProviderConfig.difyUrl ||
    ""
  ).trim();
  if (!raw) return "";
  // Accept existing Dify-style /v1 URL and map to host root for unified gateway routes.
  return raw.replace(/\/chat-messages\/?$/i, "").replace(/\/v1\/?$/i, "").replace(/\/+$/, "");
}

function parseExpiryIso(input: unknown): string | undefined {
  if (typeof input === "string" && input.trim()) return input;
  if (typeof input === "number" && Number.isFinite(input)) {
    // Accept both seconds and milliseconds.
    const ms = input > 2_000_000_000 ? input : input * 1000;
    return new Date(ms).toISOString();
  }
  return undefined;
}

function isTokenUsable(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return false;
  // Refresh early 2 minutes before expiry.
  return exp - Date.now() > 120_000;
}

async function loadDeviceAuthState(): Promise<void> {
  try {
    const raw = await readFile(DEVICE_AUTH_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DeviceAuthState>;
    deviceAuthState = {
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : "",
      appToken: typeof parsed.appToken === "string" ? parsed.appToken : undefined,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : undefined,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    deviceAuthState = { deviceId: "" };
  }
  if (!deviceAuthState.deviceId) {
    deviceAuthState.deviceId = randomUUID();
    await saveDeviceAuthState();
  }
}

async function saveDeviceAuthState(): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  deviceAuthState.updatedAt = new Date().toISOString();
  await writeFile(DEVICE_AUTH_FILE, JSON.stringify(deviceAuthState, null, 2), "utf-8");
}

function parseTokenPayload(raw: unknown): { appToken?: string; refreshToken?: string; expiresAt?: string } {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const appToken = typeof obj.appToken === "string"
    ? obj.appToken
    : typeof obj.token === "string"
      ? obj.token
      : typeof obj.access_token === "string"
        ? obj.access_token
        : undefined;
  const refreshToken = typeof obj.refreshToken === "string"
    ? obj.refreshToken
    : typeof obj.refresh_token === "string"
      ? obj.refresh_token
      : undefined;
  const expiresAt = parseExpiryIso(obj.expiresAt ?? obj.expires_at ?? obj.exp);
  return { appToken, refreshToken, expiresAt };
}

async function requestDeviceToken(path: string, payload: Record<string, unknown>): Promise<{ appToken?: string; refreshToken?: string; expiresAt?: string }> {
  const base = getAiGatewayBaseUrl();
  if (!base) {
    return {};
  }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Device auth failed ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const raw = (await res.json()) as unknown;
  return parseTokenPayload(raw);
}

async function ensureDeviceToken(): Promise<string | null> {
  const base = getAiGatewayBaseUrl();
  if (!base) return null;
  if (!deviceAuthState.deviceId) {
    deviceAuthState.deviceId = randomUUID();
  }
  if (deviceAuthState.appToken && isTokenUsable(deviceAuthState.expiresAt)) {
    return deviceAuthState.appToken;
  }
  try {
    if (deviceAuthState.refreshToken) {
      const refreshed = await requestDeviceToken("/auth/device/refresh", {
        deviceId: deviceAuthState.deviceId,
        refreshToken: deviceAuthState.refreshToken,
      });
      if (refreshed.appToken) {
        deviceAuthState = { ...deviceAuthState, ...refreshed, lastError: undefined };
        await saveDeviceAuthState();
        return refreshed.appToken;
      }
    }
  } catch (err) {
    deviceAuthState.lastError = err instanceof Error ? err.message : String(err);
  }

  try {
    const registered = await requestDeviceToken("/auth/device/register", {
      deviceId: deviceAuthState.deviceId,
      appName: "OPDF Desktop",
      appVersion: app.getVersion(),
      runtime: "electron",
    });
    if (!registered.appToken) {
      throw new Error("Register response does not include token.");
    }
    deviceAuthState = { ...deviceAuthState, ...registered, lastError: undefined };
    await saveDeviceAuthState();
    return registered.appToken;
  } catch (err) {
    deviceAuthState.lastError = err instanceof Error ? err.message : String(err);
    await saveDeviceAuthState();
    throw err;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractTextLoose(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const got = extractTextLoose(item, depth + 1);
      if (got) return got;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = ["html", "content", "answer", "output", "message", "text", "result", "data"];
    for (const key of preferred) {
      const got = extractTextLoose(obj[key], depth + 1);
      if (got) return got;
    }
    for (const key of Object.keys(obj)) {
      const got = extractTextLoose(obj[key], depth + 1);
      if (got) return got;
    }
  }
  return null;
}

function normalizePatchResponse(value: unknown, payload: LiveEditorPatchRequest): LiveEditorPatchResponse {
  try {
    return validatePatchResponse(value);
  } catch {
    const targets = payload.selectedBlocks.length > 0 ? payload.selectedBlocks : payload.allBlocks.slice(0, 1);
    const first = targets[0];
    if (!first) {
      throw new Error("Invalid AI patch payload and no target block to map fallback.");
    }
    const text = extractTextLoose(value);
    if (!text) throw new Error("Invalid AI patch payload: unable to extract text/html fallback.");
    const html = text.includes("<") ? text : `<p>${escapeHtml(text)}</p>`;
    return { updates: [{ id: first.id, html, content: text }] };
  }
}

async function requestOpenRouterPatch(payload: LiveEditorPatchRequest): Promise<LiveEditorPatchResponse | null> {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPDF_OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.OPDF_OPENROUTER_MODEL || "openai/gpt-4o";
  const target = payload.selectedBlocks[0] ?? payload.allBlocks[0];
  if (!target) throw new Error("No target block for AI patch.");
  const instruction = [
    "You rewrite one document block faithfully.",
    "Return only JSON object with keys: html, content.",
    "No markdown, no code fences, no explanation.",
    "Do not return placeholders like 'being rewritten'.",
  ].join(" ");
  const body = {
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instruction },
      {
        role: "user",
        content: JSON.stringify({
          prompt: payload.prompt,
          block: { id: target.id, type: target.type, content: target.content, html: target.html },
          referenceImage: payload.referenceImage,
        }),
      },
    ],
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter failed with ${res.status}.`);
  const raw = (await res.json()) as Record<string, unknown>;
  const content = (((raw.choices as any[])?.[0]?.message?.content) ?? "") as string;
  const parsed: unknown = content ? JSON.parse(content) : raw;
  const normalized = normalizePatchResponse(parsed, payload);
  return {
    updates: normalized.updates.map((u) => ({ ...u, id: target.id })),
  };
}

function validatePatchResponse(value: unknown): LiveEditorPatchResponse {
  if (!value || typeof value !== "object") throw new Error("Invalid AI patch payload.");
  const updates = (value as { updates?: unknown }).updates;
  if (!Array.isArray(updates)) throw new Error("Invalid AI patch payload: updates[] missing.");
  const sanitized = updates
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) throw new Error("Invalid AI patch payload: missing id.");
      const next: Partial<LiveEditorBlock> & { id: string } = { id };
      if (typeof item.type === "string") next.type = item.type as LiveEditorBlock["type"];
      if (typeof item.content === "string") next.content = item.content;
      if (typeof item.html === "string") next.html = item.html;
      if (item.style && typeof item.style === "object") {
        const rawStyle = item.style as Record<string, unknown>;
        next.style = {
          font: typeof rawStyle.font === "string" ? rawStyle.font : "Noto Sans",
          size: typeof rawStyle.size === "number" ? rawStyle.size : 12,
          color: typeof rawStyle.color === "string" ? rawStyle.color : "#111827",
          ...(typeof rawStyle.lineHeight === "number" ? { lineHeight: rawStyle.lineHeight } : {}),
        };
      }
      return next;
    });
  return { updates: sanitized };
}


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

  ipcMain.handle("opdf:ai-patch", async (_event, payload: LiveEditorPatchRequest) => {
    const openRouterPatch = await requestOpenRouterPatch(payload);
    if (openRouterPatch) return openRouterPatch;

    const gatewayBase = getAiGatewayBaseUrl();
    const endpoint = gatewayBase ? `${gatewayBase}/ai/patch` : (process.env.OPDF_LIVE_EDITOR_AI_ENDPOINT || aiProviderConfig.difyUrl);
    const apiKey = process.env.OPDF_LIVE_EDITOR_AI_KEY || aiProviderConfig.difyKey;
    if (!endpoint) {
      throw new Error("AI patch endpoint is not configured in desktop backend.");
    }
    const gatewayToken = gatewayBase ? await ensureDeviceToken() : null;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        selectedBlocks: payload.selectedBlocks,
        allBlocks: payload.allBlocks,
        referenceImage: payload.referenceImage,
        output: "json_patch",
      }),
    });
    if (!res.ok) {
      throw new Error(`AI patch endpoint failed with ${res.status}.`);
    }
    const raw: unknown = await res.json();
    return normalizePatchResponse(raw, payload);
  });

  ipcMain.handle("opdf:ai-config:set", async (_event, cfg: AiProviderConfig) => {
    aiProviderConfig = { ...aiProviderConfig, ...cfg };
    return true;
  });

  ipcMain.handle("opdf:ai-config:get", async () => aiProviderConfig);
  ipcMain.handle("opdf:ai:token:get", async () => ensureDeviceToken());
  ipcMain.handle("opdf:ai:device-status:get", async () => ({
    deviceId: deviceAuthState.deviceId,
    hasToken: Boolean(deviceAuthState.appToken),
    expiresAt: deviceAuthState.expiresAt || null,
    lastError: deviceAuthState.lastError || null,
    gatewayBaseUrl: getAiGatewayBaseUrl() || null,
  }));
}

const remoteDebugPort = (process.env.OPDF_REMOTE_DEBUG_PORT || "").trim();
if (remoteDebugPort) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebugPort);
}

app.whenReady().then(() => {
  void loadDeviceAuthState().finally(() => {
    if (getAiGatewayBaseUrl()) {
      void ensureDeviceToken().catch(() => {
        // Keep app startup resilient; token can still be retried on-demand.
      });
    }
    registerIpcHandlers();
    createMainWindow();
  });

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









