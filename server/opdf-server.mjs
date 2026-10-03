import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createOpdfStorage, assertDocumentId, sanitizeFileName } from "./opdf-storage.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");
const port = Number(process.env.OPDF_PORT || process.env.PORT || 8787);
const dataDir = resolve(process.env.OPDF_DATA_DIR || join(repoRoot, ".opdf-data"));
const webDist = resolve(process.env.OPDF_WEB_DIST || join(repoRoot, "apps", "web", "dist"));
const maxBytes = Number(process.env.OPDF_MAX_UPLOAD_BYTES || 750 * 1024 * 1024);
const storage = createOpdfStorage(dataDir);

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

function parseDocumentRoute(pathname) {
  const match = pathname.match(/^\/api\/opdf\/documents\/([^/]+)(?:\/(annotations))?$/);
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

async function replaceDocumentFromRequest(req, res, record) {
  const tempPath = join(dataDir, "documents", record.id, `save-${Date.now()}.tmp`);
  const size = await streamBodyToPath(req, tempPath);
  await rename(tempPath, record.pdfPath);
  const updated = await storage.finalizeDocument(record.id, size);
  sendJson(res, 200, { filePath: updated.filePath, size: updated.size, updatedAt: updated.updatedAt });
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
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

async function handleApi(req, res, url) {
  if (url.pathname === "/api/opdf/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      runtime: "server",
      maxUploadBytes: maxBytes,
      capabilities: { persistence: true, rangeReads: true, annotations: true, session: true },
    });
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

server.listen(port, "0.0.0.0", () => {
  console.log(`OPDF Server listening on http://0.0.0.0:${port}`);
  console.log(`Data directory: ${dataDir}`);
});
