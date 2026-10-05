// opdf-file-size-allow: legacy central HTTP router; large-upload logic is delegated to opdf-upload.mjs while router extraction is handled separately.\nimport { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rename, rm, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import http from "node:http";
import { DocumentService } from "@opdf/core";
import { createOpdfStorage, assertDocumentId, sanitizeFileName } from "./opdf-storage.mjs";
import { createChunkUploadApi } from "./opdf-upload.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");
const port = Number(process.env.OPDF_PORT || process.env.PORT || 8787);
const host = process.env.OPDF_HOST || "127.0.0.1";
const dataDir = resolve(process.env.OPDF_DATA_DIR || join(repoRoot, ".opdf-data"));
const webDist = resolve(process.env.OPDF_WEB_DIST || join(repoRoot, "apps", "web", "dist"));
const maxBytes = Number(process.env.OPDF_MAX_UPLOAD_BYTES || 750 * 1024 * 1024);
const maxOperationBytes = Number(process.env.OPDF_MAX_OPERATION_BYTES || 250 * 1024 * 1024);
const uploadChunkBytes = Math.min(
  Number(process.env.OPDF_UPLOAD_CHUNK_BYTES || 8 * 1024 * 1024),
  32 * 1024 * 1024,
);
const storage = createOpdfStorage(dataDir);
const documentService = new DocumentService();
const pythonPath = process.env.OPDF_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
const officeConverterScript = resolve(
  process.env.OPDF_OFFICE_CONVERTER_SCRIPT ||
  join(repoRoot, "apps", "desktop", "tools", "pdf_office_convert.py"),
);
const officeWorkerTimeoutMs = Number(process.env.OPDF_OFFICE_WORKER_TIMEOUT_MS || 5 * 60 * 1000);
const libreOfficePath = process.env.OPDF_LIBREOFFICE_PATH || (process.platform === "win32" ? "soffice.exe" : "soffice");


function setBaseHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, status, value) {
  setBaseHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("JSON body is too large.");
    chunks.push(chunk);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readPdfBody(req, limit = maxOperationBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("PDF operation payload exceeds OPDF_MAX_OPERATION_BYTES.");
    chunks.push(chunk);
  }
  if (total < 5) throw new Error("PDF payload is empty.");
  const buffer = Buffer.concat(chunks);
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Payload is not a PDF.");
  }
  return new Uint8Array(buffer);
}

function sendPdf(res, bytes) {
  setBaseHeaders(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(bytes.byteLength));
  res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

function parseOperationOptions(req) {
  const encoded = req.headers["x-opdf-options"];
  if (!encoded || typeof encoded !== "string") return {};
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid X-OPDF-Options header.");
  }
}

async function handlePdfOperation(req, res, operation) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const input = await readPdfBody(req);
  if (operation === "compress") {
    return sendPdf(res, await documentService.compressPdf(input));
  }
  if (operation === "encrypt") {
    const options = parseOperationOptions(req);
    return sendPdf(res, await documentService.encryptPdf(input, {
      userPassword: typeof options.userPassword === "string" ? options.userPassword : undefined,
      ownerPassword: typeof options.ownerPassword === "string" ? options.ownerPassword : undefined,
      permissions: typeof options.permissions === "number" ? options.permissions : undefined,
    }));
  }
  if (operation === "decrypt") {
    const options = parseOperationOptions(req);
    if (typeof options.password !== "string") throw new Error("Decrypt password is required.");
    return sendPdf(res, await documentService.decryptPdf(input, options.password));
  }
  return sendError(res, 404, "PDF operation not found.");
}

async function streamBodyToPath(req, tempPath) {
  await mkdir(resolve(tempPath, ".."), { recursive: true });
  const handle = await open(tempPath, "wx");
  let total = 0;
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBytes) throw new Error("Upload exceeds OPDF_MAX_UPLOAD_BYTES.");
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();
  if (total < 5) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw new Error("PDF payload is empty.");
  }
  const check = await open(tempPath, "r");
  const signature = Buffer.alloc(5);
  await check.read(signature, 0, 5, 0);
  await check.close();
  if (signature.toString("ascii") !== "%PDF-") {
    await rm(tempPath, { force: true }).catch(() => {});
    throw new Error("Payload is not a PDF.");
  }
  return total;
}

async function streamAnyBodyToPath(req, tempPath, limit = maxOperationBytes) {
  await mkdir(resolve(tempPath, ".."), { recursive: true });
  const handle = await open(tempPath, "wx");
  let total = 0;
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > limit) throw new Error("Operation payload exceeds OPDF_MAX_OPERATION_BYTES.");
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();
  if (total === 0) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw new Error("Operation payload is empty.");
  }
  return total;
}

function parseDocumentRoute(pathname) {
  const match = pathname.match(/^\/api\/opdf\/documents\/([^/]+)(?:\/(annotations|mutations))?$/);
  if (!match) return null;
  return { id: assertDocumentId(match[1]), child: match[2] || null };
}

async function serveDocument(req, res, record, download) {
  const size = await storage.getDocumentSize(record.id);
  if (size == null) return sendError(res, 404, "Document file not found.");
  const range = req.headers.range;
  setBaseHeaders(res);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${record.fileName.replace(/"/g, "")}"`);

  if (!range) {
    res.statusCode = 200;
    res.setHeader("Content-Length", String(size));
    createReadStream(record.pdfPath).pipe(res);
    return;
  }

  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", String(end - start + 1));
  createReadStream(record.pdfPath, { start, end }).pipe(res);
}

async function createDocumentFromRequest(req, res, url) {
  const name = sanitizeFileName(url.searchParams.get("name") || "document.pdf");
  const record = await storage.createDocument(name);
  try {
    const size = await streamBodyToPath(req, record.tempPath);
    await rename(record.tempPath, record.pdfPath);
    const updated = await storage.finalizeDocument(record.id, size);
    await storage.pushRecent(updated.filePath);
    sendJson(res, 201, {
      id: updated.id,
      fileName: updated.fileName,
      filePath: updated.filePath,
      size: updated.size,
      openedAt: Date.now(),
    });
  } catch (error) {
    await storage.removeDocument(record.id).catch(() => {});
    throw error;
  }
}

async function replaceStoredFile(tempPath, targetPath) {
  const backupPath = `${targetPath}.${Date.now()}.bak`;
  let hadOriginal = false;
  try {
    await rename(targetPath, backupPath);
    hadOriginal = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  try {
    await rename(tempPath, targetPath);
    if (hadOriginal) await rm(backupPath, { force: true });
  } catch (error) {
    if (hadOriginal) {
      await rename(backupPath, targetPath).catch(() => {});
    }
    throw error;
  }
}

async function replaceDocumentFromRequest(req, res, record) {
  const tempPath = join(dataDir, "documents", record.id, `save-${Date.now()}.tmp`);
  const size = await streamBodyToPath(req, tempPath);
  await replaceStoredFile(tempPath, record.pdfPath);
  const updated = await storage.finalizeDocument(record.id, size);
  sendJson(res, 200, { filePath: updated.filePath, size: updated.size, updatedAt: updated.updatedAt });
}

async function mutateStoredDocument(req, res, record) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const body = await readJsonBody(req, 1024 * 1024);
  const input = new Uint8Array(await readFile(record.pdfPath));
  let output;

  if (body.type === "rotate-pages") {
    const pageNumbers = Array.isArray(body.pageNumbers)
      ? body.pageNumbers.filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const degrees = Number(body.degrees);
    if (![90, -90, 180, -180, 270, -270].includes(degrees)) {
      return sendError(res, 400, "degrees must be a 90-degree increment.");
    }
    const { PDFDocument, degrees: pdfDegrees } = await import("pdf-lib");
    const doc = await PDFDocument.load(input, { updateMetadata: false });
    const pages = doc.getPages();
    const targets = pageNumbers.length > 0
      ? pageNumbers
      : Array.from({ length: pages.length }, (_, index) => index + 1);
    for (const pageNumber of targets) {
      if (pageNumber < 1 || pageNumber > pages.length) continue;
      const page = pages[pageNumber - 1];
      page.setRotation(pdfDegrees(page.getRotation().angle + degrees));
    }
    output = new Uint8Array(await doc.save({ useObjectStreams: false, addDefaultPage: false }));
  } else if (body.type === "delete-pages") {
    const pageNumbers = Array.isArray(body.pageNumbers)
      ? body.pageNumbers.filter((value) => Number.isInteger(value) && value > 0)
      : [];
    if (pageNumbers.length === 0) return sendError(res, 400, "pageNumbers is required.");
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(input, { updateMetadata: false });
    const totalPages = source.getPageCount();
    const remove = new Set(pageNumbers.filter((value) => value <= totalPages).map((value) => value - 1));
    const keep = source.getPageIndices().filter((index) => !remove.has(index));
    if (keep.length === 0) return sendError(res, 400, "Cannot delete all pages.");
    const outputDoc = await PDFDocument.create();
    const copied = await outputDoc.copyPages(source, keep);
    copied.forEach((page) => outputDoc.addPage(page));
    output = new Uint8Array(await outputDoc.save({ useObjectStreams: false, addDefaultPage: false }));
  } else if (body.type === "duplicate-pages") {
    const pageNumbers = Array.isArray(body.pageNumbers)
      ? body.pageNumbers.filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(input, { updateMetadata: false });
    const totalPages = source.getPageCount();
    const selected = new Set(pageNumbers.filter((value) => value <= totalPages));
    if (selected.size === 0) return sendError(res, 400, "pageNumbers is required.");
    const order = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      order.push(pageNumber);
      if (selected.has(pageNumber)) order.push(pageNumber);
    }
    const outputDoc = await PDFDocument.create();
    const copied = await outputDoc.copyPages(source, order.map((pageNumber) => pageNumber - 1));
    copied.forEach((page) => outputDoc.addPage(page));
    output = new Uint8Array(await outputDoc.save({ useObjectStreams: false, addDefaultPage: false }));
  } else if (body.type === "reorder-pages") {
    const pageOrder = Array.isArray(body.pageOrder)
      ? body.pageOrder.filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(input, { updateMetadata: false });
    const totalPages = source.getPageCount();
    if (
      pageOrder.length !== totalPages ||
      new Set(pageOrder).size !== totalPages ||
      pageOrder.some((value) => value > totalPages)
    ) {
      return sendError(res, 400, "pageOrder must contain every page exactly once.");
    }
    const outputDoc = await PDFDocument.create();
    const copied = await outputDoc.copyPages(source, pageOrder.map((pageNumber) => pageNumber - 1));
    copied.forEach((page) => outputDoc.addPage(page));
    output = new Uint8Array(await outputDoc.save({ useObjectStreams: false, addDefaultPage: false }));
  } else {
    return sendError(res, 400, "Unsupported stored document mutation.");
  }

  const tempPath = join(dataDir, "documents", record.id, `mutate-${Date.now()}.tmp`);
  await mkdir(resolve(tempPath, ".."), { recursive: true });
  const handle = await open(tempPath, "wx");
  try {
    await handle.write(output);
  } finally {
    await handle.close();
  }
  await replaceStoredFile(tempPath, record.pdfPath);
  const updated = await storage.finalizeDocument(record.id, output.byteLength);
  return sendJson(res, 200, {
    filePath: updated.filePath,
    size: updated.size,
    updatedAt: updated.updatedAt,
    engine: "pdf-lib-server",
  });
}

function officeMimeType(format) {
  return ({
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })[format] || "application/octet-stream";
}

async function runOfficeWorker(inputPath, format, outputPath, mode) {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(
      pythonPath,
      [officeConverterScript, inputPath, format, outputPath, mode],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env },
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 20000) stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 20000) stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill();
      rejectWorker(new Error("Office conversion timed out."));
    }, officeWorkerTimeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      rejectWorker(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveWorker();
      else rejectWorker(new Error(stderr || stdout || `Office converter exited with code ${code}`));
    });
  });
}

async function handleOfficeConversion(req, res, url) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");

  const format = String(url.searchParams.get("format") || "").toLowerCase();
  if (!["docx", "pptx", "xlsx"].includes(format)) {
    return sendError(res, 400, "format must be docx, pptx, or xlsx.");
  }
  const requestedMode = String(url.searchParams.get("mode") || "auto").toLowerCase();
  const mode = /^[a-z0-9-]{1,40}$/.test(requestedMode) ? requestedMode : "auto";

  const workDir = await mkdtemp(join(tmpdir(), "opdf-office-"));
  const inputPath = join(workDir, "input.pdf");
  const outputPath = join(workDir, `output.${format}`);

  try {
    await streamBodyToPath(req, inputPath);
    await runOfficeWorker(inputPath, format, outputPath, mode);
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new Error("Office converter returned an empty file.");

    setBaseHeaders(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", officeMimeType(format));
    res.setHeader("Content-Length", String(output.byteLength));
    res.setHeader("Content-Disposition", `attachment; filename="converted.${format}"`);
    res.end(output);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleOfficeToPdf(req, res, url) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");

  const requestedName = sanitizeFileName(url.searchParams.get("name") || "document.docx");
  const extension = extname(requestedName).toLowerCase();
  const allowed = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf", ".txt"]);
  if (!allowed.has(extension)) {
    return sendError(res, 400, "Unsupported Office input format.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "opdf-office-to-pdf-"));
  const inputPath = join(workDir, "input" + extension);
  const outputPath = join(workDir, "input.pdf");

  try {
    await streamAnyBodyToPath(req, inputPath);
    await new Promise((resolveWorker, rejectWorker) => {
      const child = spawn(
        libreOfficePath,
        ["--headless", "--convert-to", "pdf", "--outdir", workDir, inputPath],
        {
          cwd: workDir,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          env: { ...process.env },
        },
      );

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        if (stdout.length < 20000) stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 20000) stderr += String(chunk);
      });

      const timer = setTimeout(() => {
        child.kill();
        rejectWorker(new Error("Office to PDF conversion timed out."));
      }, officeWorkerTimeoutMs);

      child.once("error", (error) => {
        clearTimeout(timer);
        rejectWorker(
          error?.code === "ENOENT"
            ? new Error("LibreOffice is not installed or OPDF_LIBREOFFICE_PATH is not configured.")
            : error,
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveWorker();
        else rejectWorker(new Error(stderr || stdout || `LibreOffice exited with code ${code}`));
      });
    });

    const output = await readFile(outputPath);
    if (output.byteLength < 5 || output.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("LibreOffice did not produce a valid PDF.");
    }
    sendPdf(res, new Uint8Array(output));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
  })[ext] || "application/octet-stream";
}

async function serveWeb(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalized = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(webDist, normalized);
  if (!filePath.startsWith(webDist)) return sendError(res, 403, "Forbidden.");

  let info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    // Never send the SPA shell for a missing static asset. ES module imports
    // require a real JavaScript response and otherwise fail with misleading
    // "dynamically imported module" errors.
    if (extname(normalized)) {
      return sendError(res, 404, "Static asset not found.");
    }
    filePath = join(webDist, "index.html");
    info = await stat(filePath).catch(() => null);
  }
  if (!info?.isFile()) {
    return sendError(res, 503, "Web build not found. Run npm run server-build first.");
  }

  setBaseHeaders(res);
  if (filePath.endsWith("index.html")) {
    let html = await readFile(filePath, "utf8");
    const runtimeScript = '<script>window.__OPDF_RUNTIME__="server";window.__OPDF_SERVER_BASE__="/api/opdf";</script>';
    html = html.includes("</head>") ? html.replace("</head>", runtimeScript + "</head>") : runtimeScript + html;
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(html);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeFor(filePath));
  res.setHeader("Content-Length", String(info.size));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  createReadStream(filePath).pipe(res);
}

const handleChunkUpload = createChunkUploadApi({
  storage,
  maxBytes,
  chunkBytes: uploadChunkBytes,
  sendJson,
  sendError,
});

async function handleApi(req, res, url) {
  if (url.pathname === "/api/opdf/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      runtime: "server",
      maxUploadBytes: maxBytes,
      uploadChunkBytes,
      maxOperationBytes,
      capabilities: {
        persistence: true,
        rangeReads: true,
        annotations: true,
        session: true,
        compress: true,
        encrypt: true,
        decrypt: true,
        officeConversion: true,
        officeToPdf: true,
        storedMutations: true,
        rangePreview: true,
        resumableUpload: true,
        localFirstUpload: true,
      },
    });
  }

  if (url.pathname === "/api/opdf/uploads" || url.pathname.startsWith("/api/opdf/uploads/")) {
    if (await handleChunkUpload(req, res, url)) return;
  }

  if (url.pathname === "/api/opdf/operations/convert-office") {
    return handleOfficeConversion(req, res, url);
  }

  if (url.pathname === "/api/opdf/operations/office-to-pdf") {
    return handleOfficeToPdf(req, res, url);
  }

  const operationMatch = url.pathname.match(/^\/api\/opdf\/operations\/(compress|encrypt|decrypt)$/);
  if (operationMatch) {
    return handlePdfOperation(req, res, operationMatch[1]);
  }

  if (url.pathname === "/api/opdf/documents" && req.method === "POST") {
    return createDocumentFromRequest(req, res, url);
  }

  if (url.pathname === "/api/opdf/recent") {
    if (req.method === "GET") return sendJson(res, 200, await storage.getRecents());
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (typeof body.filePath !== "string") return sendError(res, 400, "filePath is required.");
      return sendJson(res, 200, await storage.pushRecent(body.filePath));
    }
  }

  if (url.pathname === "/api/opdf/session") {
    if (req.method === "GET") return sendJson(res, 200, await storage.getSession());
    if (req.method === "PUT") return sendJson(res, 200, await storage.putSession(await readJsonBody(req)));
  }

  const route = parseDocumentRoute(url.pathname);
  if (route) {
    const record = await storage.getDocument(route.id);
    if (!record) return sendError(res, 404, "Document not found.");

    if (route.child === "annotations") {
      if (req.method === "GET") return sendJson(res, 200, await storage.getAnnotations(route.id));
      if (req.method === "PUT") {
        const body = await readJsonBody(req, 10 * 1024 * 1024);
        return sendJson(res, 200, await storage.putAnnotations(route.id, body.annotations));
      }
      return sendError(res, 405, "Method not allowed.");
    }
    if (route.child === "mutations") {
      return mutateStoredDocument(req, res, record);
    }

    if (req.method === "HEAD") {
      const size = await storage.getDocumentSize(record.id);
      if (size == null) return sendError(res, 404, "Document file not found.");
      setBaseHeaders(res);
      res.statusCode = 200;
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(size));
      return res.end();
    }
    if (req.method === "GET") return serveDocument(req, res, record, url.searchParams.get("download") === "1");
    if (req.method === "PUT") return replaceDocumentFromRequest(req, res, record);
    return sendError(res, 405, "Method not allowed.");
  }

  return sendError(res, 404, "API route not found.");
}

await storage.ensure();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/opdf/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveWeb(req, res, url.pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /too large|exceeds/i.test(message) ? 413 : /Invalid document id/.test(message) ? 400 : 500;
    sendError(res, status, message);
  }
});

server.listen(port, host, () => {
  console.log(`OPDF Server listening on http://${host}:${port}`);
  console.log(`Data directory: ${dataDir}`);
});
