// Remote PDF rendering is opt-in. One native worker handles one task at a time.
// The authenticated TPDF router resolves tenant-scoped document paths before this API.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const LEVELS = new Set([0.25, 0.5, 1, 2, 4, 8]);
const TILE = 512;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const numeric = (raw) => raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

export function parseRenderRequest(url) {
  const match = url.pathname.match(/^\/api\/tpdf\/documents\/([0-9a-f-]{36})\/render\/(meta|tile|text)$/i);
  if (!match) return null;
  const [, id, kind] = match;
  if (kind === "meta") return { id, kind };
  const page = numeric(url.searchParams.get("page"));
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw badRequest("Invalid page.");
  if (kind === "text") return { id, kind, page };
  const level = Number(url.searchParams.get("level"));
  const x = numeric(url.searchParams.get("x"));
  const y = numeric(url.searchParams.get("y"));
  if (!LEVELS.has(level) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
    x < 0 || y < 0 || x > 10000 || y > 10000) {
    throw badRequest("Invalid tile parameters.");
  }
  return { id, kind, page, level, x, y };
}

export function createRemoteRenderService(env = process.env) {
  const enabled = env.TPDF_REMOTE_RENDER_ENABLED === "1";
  const workers = clamp(Number(env.TPDF_RENDER_WORKERS) || 1, 1, 3);
  const maxQueued = clamp(Number(env.TPDF_RENDER_QUEUE_MAX) || 64, 8, 256);
  const cacheLimit = clamp(Number(env.TPDF_RENDER_CACHE_MB) || 64, 8, 256) * 1024 * 1024;
  const timeout = clamp(Number(env.TPDF_RENDER_TIMEOUT_MS) || 45000, 5000, 120000);
  const maxTasks = clamp(Number(env.TPDF_RENDER_WORKER_RECYCLE) || 96, 8, 1000);
  const python = env.TPDF_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
  const script = resolve(env.TPDF_RENDER_WORKER_SCRIPT || join(ROOT, "workers", "remote_pdf_worker.py"));
  const queue = [], pool = [], pending = new Map(), cache = new Map();
  let cacheSize = 0, closed = false;
  let workerStatus = enabled ? "checking" : "disabled";

  // Capability is real only after the *same configured* Python executable and
  // worker script can import its native dependencies. Never advertise a broken
  // renderer just because its environment flag is set.
  const readiness = enabled ? new Promise((resolveReady) => {
    const child = spawn(python, ["-u", script, "--probe"], {
      stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    });
    let output = "", done = false;
    const finish = (ready) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      workerStatus = ready ? "ready" : "unavailable";
      resolveReady(ready);
    };
    const timer = setTimeout(() => finish(false), 5000);
    child.stdout.on("data", (part) => {
      output += part.toString();
      if (output.length > 1024) return finish(false);
      const newline = output.indexOf("\\n");
      if (newline === -1) return;
      try { finish(JSON.parse(output.slice(0, newline)).ready === true); }
      catch { finish(false); }
    });
    child.on("error", () => finish(false));
    child.on("exit", () => finish(false));
  }) : Promise.resolve(false);
  const isAvailable = () => readiness;

  function cacheSet(key, value) {
    const bytes = value.kind === "tile" ? value.body.length : JSON.stringify(value).length;
    if (bytes > cacheLimit) return;
    if (cache.has(key)) {
      const old = cache.get(key);
      cacheSize -= old.bytes;
      cache.delete(key);
    }
    cache.set(key, { value, bytes });
    cacheSize += bytes;
    while (cacheSize > cacheLimit) {
      const first = cache.keys().next().value;
      cacheSize -= cache.get(first).bytes;
      cache.delete(first);
    }
  }

  function retire(worker) {
    worker.dead = true;
    if (worker.timer) clearTimeout(worker.timer);
    if (worker.task) {
      worker.task.reject(Object.assign(new Error("Remote render worker exited."), { statusCode: 503 }));
      worker.task = null;
    }
    worker.child?.kill();
    const index = pool.indexOf(worker);
    if (index >= 0) pool.splice(index, 1);
    if (!closed) pump();
  }

  function spawnWorker() {
    const child = spawn(python, ["-u", script], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    const worker = { child, task: null, buffer: "", timer: null, completed: 0, dead: false };
    pool.push(worker);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      worker.buffer += chunk;
      if (worker.buffer.length > 12 * 1024 * 1024) return retire(worker);
      let i;
      while ((i = worker.buffer.indexOf("\n")) !== -1) {
        const line = worker.buffer.slice(0, i);
        worker.buffer = worker.buffer.slice(i + 1);
        const task = worker.task;
        if (!task) continue;
        worker.task = null;
        clearTimeout(worker.timer);
        try {
          const message = JSON.parse(line);
          if (message.error) throw new Error(message.error);
          const result = message.kind === "tile"
            ? { kind: "tile", mime: "image/webp", body: Buffer.from(message.base64, "base64") }
            : message;
          task.resolve(result);
        } catch (error) {
          task.reject(Object.assign(error, { statusCode: 503 }));
        }
        worker.completed += 1;
        if (worker.completed >= maxTasks) return retire(worker);
        pump();
      }
    });
    child.stderr.on("data", () => {}); // Worker errors are propagated through JSON.
    child.on("error", () => retire(worker));
    child.on("exit", () => { if (!worker.dead) retire(worker); });
    return worker;
  }

  function pump() {
    if (closed) return;
    for (;;) {
      let worker = pool.find((entry) => !entry.dead && !entry.task);
      if (!worker && pool.length < workers && queue.length) worker = spawnWorker();
      if (!worker || !queue.length) break;
      const task = queue.shift();
      worker.task = task;
      worker.timer = setTimeout(() => retire(worker), timeout);
      try {
        worker.child.stdin.write(JSON.stringify(task.command) + "\n");
      } catch {
        retire(worker);
      }
    }
  }

  async function render(path, version, request) {
    if (!await isAvailable()) {
      throw Object.assign(new Error("Remote renderer worker is unavailable."), { statusCode: 503 });
    }
    if (closed) throw Object.assign(new Error("Renderer is shutting down."), { statusCode: 503 });
    const key = JSON.stringify([path, version, request.kind, request.page, request.level, request.x, request.y]);
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key); cache.set(key, cached);
      return cached.value;
    }
    if (pending.has(key)) return pending.get(key);
    if (queue.length >= maxQueued) {
      throw Object.assign(new Error("Remote renderer is busy."), { statusCode: 429, retryAfterSeconds: 1 });
    }
    const promise = new Promise((resolveTask, rejectTask) => {
      queue.push({
        command: { ...request, path },
        resolve(value) { cacheSet(key, value); resolveTask(value); },
        reject: rejectTask,
      });
      pump();
    });
    pending.set(key, promise);
    promise.then(() => pending.delete(key), () => pending.delete(key));
    return promise;
  }

  async function handle(req, res, url, { storage, sendJson, sendError, setBaseHeaders }) {
    const request = parseRenderRequest(url);
    if (!request) return false;
    if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");
    if (!await isAvailable()) return sendError(res, 503, "Remote renderer worker is unavailable.");
    const record = await storage.getDocument(request.id);
    if (!record) return sendError(res, 404, "Document not found.");
    if (storage.ensureDocumentFile && !await storage.ensureDocumentFile(request.id)) {
      return sendError(res, 404, "Document bytes are unavailable.");
    }
    const source = await stat(record.pdfPath).catch(() => null);
    if (!source?.isFile()) return sendError(res, 404, "Document bytes are unavailable.");
    const version = `${source.size}:${source.mtimeMs}`;
    const result = await render(record.pdfPath, version, request);
    if (result.kind !== "tile") return sendJson(res, 200, result);
    setBaseHeaders(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Length", String(result.body.length));
    // The server already has a bounded LRU. Avoid uncontrolled browser
    // image-cache growth across hundreds of pages and zoom levels.
    res.setHeader("Cache-Control", "private, no-store");
    res.end(result.body);
  }

  function close() {
    closed = true;
    for (const task of queue.splice(0)) task.reject(new Error("Renderer shutting down."));
    for (const worker of [...pool]) retire(worker);
  }
  return { enabled, isAvailable, handle, close,
    stats: () => ({ enabled, status: workerStatus, workers: pool.length, queued: queue.length, pending: pending.size,
      cachedItems: cache.size, cachedBytes: cacheSize, tileSize: TILE }) };
}
