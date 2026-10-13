import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRemoteRenderService } from "../../server/tpdf-remote-render.mjs";

const python = process.env.TPDF_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
const id = "123e4567-e89b-12d3-a456-426614174000";

async function until(predicate, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail("Timed out waiting for native render queue state.");
}

function response() {
  const res = new EventEmitter();
  res.destroyed = false;
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.end = (body) => { res.body = body; res.destroyed = true; };
  res.cancel = () => { res.destroyed = true; res.emit("close"); };
  return res;
}

test("disconnects prune queued and active jobs; shared tile retains its subscriber", {
  timeout: 15000,
}, async (t) => {
  if (spawnSync(python, ["--version"], { encoding: "utf8" }).error) {
    t.skip("Python executable unavailable");
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "tpdf-render-cancel-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const pdfPath = join(dir, "synthetic.pdf");
  const script = join(dir, "fake-worker.py");
  await writeFile(pdfPath, "%PDF-1.4\n%%EOF\n");
  // Fake native worker for deterministic cancellation; no production PDFs,
  // network calls, Pillow or PyMuPDF are involved.
  await writeFile(script, [
    "import sys, json, time",
    "if '--probe' in sys.argv:",
    "    print(json.dumps({'ready': True}), flush=True)",
    "    sys.exit(0)",
    "for line in sys.stdin:",
    "    command = json.loads(line)",
    "    time.sleep(0.45)",
    "    print(json.dumps({'kind':'tile','base64':'AA=='}), flush=True)",
  ].join("\n") + "\n");

  const service = createRemoteRenderService({
    TPDF_REMOTE_RENDER_ENABLED: "1",
    TPDF_PYTHON_PATH: python,
    TPDF_RENDER_WORKER_SCRIPT: script,
    TPDF_RENDER_WORKERS: "1",
    TPDF_RENDER_QUEUE_MAX: "8",
  });
  t.after(() => service.close());
  assert.equal(await service.isAvailable(), true);
  const deps = {
    storage: { getDocument: async () => ({ pdfPath }), ensureDocumentFile: async () => true },
    sendJson: (res, code, data) => { res.statusCode = code; res.end(JSON.stringify(data)); },
    sendError: (res, code, reason) => { res.statusCode = code; res.end(reason); },
    setBaseHeaders: () => {},
  };
  const tile = (page) => new URL(
    `http://localhost/api/tpdf/documents/${id}/render/tile?page=${page}&level=1&x=0&y=0`
  );
  const start = (res, page) => service.handle({ method: "GET" }, res, tile(page), deps);
  const active = response();
  const waiting = response();
  const a = start(active, 0);
  await until(() => service.stats().workers === 1 && service.stats().pending === 1);
  const b = start(waiting, 1);
  await until(() => service.stats().queued === 1);
  waiting.cancel();
  await b;
  await until(() => service.stats().queued === 0 && service.stats().pending === 1);
  active.cancel();
  await a;
  await until(() => service.stats().workers === 0 && service.stats().pending === 0);

  const sharedA = response();
  const sharedB = response();
  const c = start(sharedA, 2);
  const d = start(sharedB, 2);
  await until(() => service.stats().pending === 1 && service.stats().workers === 1);
  sharedA.cancel();
  await c;
  assert.equal(service.stats().pending, 1, "other subscriber keeps the render alive");
  await d;
  assert.equal(sharedB.statusCode, 200);
  assert.equal(sharedB.body.length, 1);
  assert.equal(service.stats().pending, 0);
});
