// Server-side PageIndex integration. The API only accepts tenant-scoped document IDs.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDocumentId } from "./tpdf-storage.mjs";

const scriptPath = fileURLToPath(new URL("./workers/pageindex_worker.py", import.meta.url));
const limitText = (value, length = 250) => String(value || "").slice(0, length);
const configNumber = (key, fallback, min, max) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value >= min ? Math.min(value, max) : fallback;
};

function runPython(python, payload, timeoutMs, script = scriptPath) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, [script], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolveResult(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("PageIndex worker timed out."));
    }, timeoutMs);
    child.on("error", (error) => finish(error));
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) {
        child.kill();
        finish(new Error("PageIndex output is too large."));
      }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4_000); });
    child.on("close", (code) => {
      if (finished) return;
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.ok === false) {
          throw new Error(limitText(result.error || "PageIndex worker failed."));
        }
        finish(null, result);
      } catch (error) {
        finish(new Error(code ? "PageIndex worker failed; check server logs." : error.message));
        if (stderr) console.error("[PageIndex worker]", limitText(stderr, 800));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

async function readState(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeState(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value), "utf8");
  await rename(temp, path);
}

function signature(stats) {
  return { size: stats.size, mtimeMs: stats.mtimeMs };
}

function sameSource(state, source) {
  return state?.source?.size === source.size && state?.source?.mtimeMs === source.mtimeMs;
}

export function createPageIndexApi({
  storage, tenantRuntime, readJsonBody, sendJson, sendError,
  pythonPath = process.env.TPDF_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3"),
  worker = runPython,
} = {}) {
  const enabled = process.env.TPDF_PAGEINDEX_ENABLED === "1";
  const autoIndex = enabled && process.env.TPDF_PAGEINDEX_AUTO_INDEX === "1";
  const concurrency = configNumber("TPDF_PAGEINDEX_CONCURRENCY", 1, 1, 3);
  const maxQueued = configNumber("TPDF_PAGEINDEX_MAX_QUEUED", 32, 1, 200);
  const maxQuestions = configNumber("TPDF_PAGEINDEX_MAX_QUERIES", 3, 1, 20);
  const pending = new Map();
  const queue = [];
  let active = 0;

  const payloadConfig = () => ({
    indexModel: process.env.TPDF_PAGEINDEX_INDEX_MODEL || "gpt-4.1-mini",
    chatModel: process.env.TPDF_PAGEINDEX_CHAT_MODEL || "gpt-4.1-mini",
  });

  async function lookup(documentId) {
    const id = assertDocumentId(documentId);
    const record = await storage.getDocument(id);
    if (!record) return null;
    if (storage.ensureDocumentFile && !await storage.ensureDocumentFile(id)) return null;
    const stats = await stat(record.pdfPath);
    const root = join(tenantRuntime.active().tenantRoot, "pageindex", id);
    return { id, record, root, statusPath: join(root, "index.json"), source: signature(stats) };
  }

  async function statusFor(info) {
    const state = await readState(info.statusPath);
    if (!state) return { documentId: info.id, status: "not_indexed" };
    if (!sameSource(state, info.source)) return { documentId: info.id, status: "stale" };
    if (state.status === "running" || state.status === "queued") {
      if (!pending.has(info.root)) return { documentId: info.id, status: "interrupted" };
    }
    return { documentId: info.id, ...state, pageindexDocId: undefined };
  }

  async function queueIndex(documentId) {
    const info = await lookup(documentId);
    if (!info) return null;
    const current = await statusFor(info);
    if (current.status === "completed") return { ...current, reused: true };
    if (pending.has(info.root)) return statusFor(info);
    if (queue.length >= maxQueued) {
      const error = new Error("PageIndex queue is full.");
      error.statusCode = 429;
      throw error;
    }
    const jobId = randomUUID();
    const state = { jobId, status: "queued", source: info.source, updatedAt: Date.now() };
    await writeState(info.statusPath, state);
    const task = { ...info, jobId };
    pending.set(info.root, task);
    queue.push(task);
    void pump();
    return { documentId: info.id, ...state };
  }

  async function pump() {
    while (active < concurrency && queue.length) {
      const task = queue.shift();
      active += 1;
      void (async () => {
        const base = { jobId: task.jobId, source: task.source };
        try {
          await writeState(task.statusPath, { ...base, status: "running", updatedAt: Date.now() });
          const result = await worker(pythonPath, {
            action: "index", pdfPath: task.record.pdfPath, storagePath: join(task.root, "library"),
            ...payloadConfig(),
          }, configNumber("TPDF_PAGEINDEX_INDEX_TIMEOUT_MS", 1_800_000, 1000, 7_200_000));
          const now = signature(await stat(task.record.pdfPath));
          const unchanged = sameSource({ source: task.source }, now);
          await writeState(task.statusPath, {
            ...base, status: unchanged ? "completed" : "stale",
            pageindexDocId: result.docId, updatedAt: Date.now(),
          });
        } catch (error) {
          console.error("[PageIndex index]", limitText(error.message));
          await writeState(task.statusPath, {
            ...base, status: "failed", error: "Indexing failed; check server logs.", updatedAt: Date.now(),
          }).catch(console.error);
        } finally {
          pending.delete(task.root);
          active -= 1;
          void pump();
        }
      })();
    }
  }

  async function completeIndex(body) {
    if (!enabled) return { error: "disabled", statusCode: 503 };
    const info = await lookup(body.documentId);
    if (!info) return { error: "Document not found.", statusCode: 404 };
    const state = await statusFor(info);
    if (state.status !== "completed") return { error: "Index is not ready.", statusCode: 409, index: state };
    const saved = await readState(info.statusPath);
    return { info, docId: saved.pageindexDocId };
  }

  async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/tpdf/ai/")) return false;
    if (!enabled) { sendError(res, 503, "PageIndex is disabled on this server."); return true; }

    const statusMatch = url.pathname.match(/^\/api\/tpdf\/ai\/index\/([0-9a-f-]{36})$/i);
    const outlineMatch = url.pathname.match(/^\/api\/tpdf\/ai\/outline\/([0-9a-f-]{36})$/i);
    if (statusMatch) {
      if (req.method !== "GET") { sendError(res, 405, "Method not allowed."); return true; }
      const info = await lookup(statusMatch[1]);
      sendJson(res, info ? 200 : 404, info ? await statusFor(info) : { error: "Document not found." });
      return true;
    }
    if (url.pathname === "/api/tpdf/ai/index") {
      if (req.method !== "POST") { sendError(res, 405, "Method not allowed."); return true; }
      const body = await readJsonBody(req, 8_192);
      if (!body.documentId) { sendError(res, 400, "documentId is required."); return true; }
      const result = await queueIndex(body.documentId);
      sendJson(res, result ? (result.status === "completed" ? 200 : 202) : 404, result || { error: "Document not found." });
      return true;
    }
    if (outlineMatch) {
      if (req.method !== "GET") { sendError(res, 405, "Method not allowed."); return true; }
      const result = await completeIndex({ documentId: outlineMatch[1] });
      if (result.error) { sendJson(res, result.statusCode, result); return true; }
      const data = await worker(pythonPath, {
        action: "outline", storagePath: join(result.info.root, "library"),
        docId: result.docId, ...payloadConfig(),
      }, 120_000);
      sendJson(res, 200, { documentId: result.info.id, nodes: data.nodes });
      return true;
    }
    const action = {
      "/api/tpdf/ai/ask": "ask",
      "/api/tpdf/ai/search": "search",
      "/api/tpdf/ai/summarize": "summarize",
    }[url.pathname];
    if (!action) { sendError(res, 404, "AI route not found."); return true; }
    if (req.method !== "POST") { sendError(res, 405, "Method not allowed."); return true; }
    const body = await readJsonBody(req, 16_384);
    const query = action === "summarize"
      ? (typeof body.query === "string" && body.query.trim() || "Summarize this document.")
      : body.query;
    if (typeof query !== "string" || !query.trim() || query.length > 8_000) {
      sendError(res, 400, "query must be between 1 and 8000 characters."); return true;
    }
    const result = await completeIndex(body);
    if (result.error) { sendJson(res, result.statusCode, result); return true; }
    const data = await worker(pythonPath, {
      action, query, docId: result.docId,
      storagePath: join(result.info.root, "library"),
      ...payloadConfig(),
    }, configNumber("TPDF_PAGEINDEX_QUERY_TIMEOUT_MS", 180_000, 1000, 600_000));
    sendJson(res, 200, { documentId: result.info.id, answer: data.answer, citations: data.citations || [] });
    return true;
  }

  async function onUploaded(documentId) {
    if (!autoIndex) return;
    try { await queueIndex(documentId); }
    catch (error) { console.error("[PageIndex auto-index]", limitText(error.message)); }
  }

  return { enabled, autoIndex, handle, onUploaded, queueIndex, statusFor, maxQuestions };
}
