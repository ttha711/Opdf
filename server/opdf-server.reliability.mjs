import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const port = 19787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-reliability-"));
const base = `http://127.0.0.1:${port}`;
let child;
let stderr = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function startServer() {
  stderr = "";
  child = spawn(process.execPath, ["server/opdf-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPDF_PORT: String(port),
      OPDF_DATA_DIR: dataDir,
      OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/opdf/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`OPDF server did not become healthy. ${stderr}`);
}

async function stopServer() {
  if (!child) return;
  const current = child;
  child = undefined;
  current.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => current.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

async function createPdf(pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200 + i, 200 + i]);
  return Buffer.from(await doc.save());
}

async function fetchBytes(url) {
  const response = await fetch(url);
  assert(response.ok, `fetch failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

try {
  await startServer();

  const original = await createPdf(1);
  const upload = await fetch(`${base}/api/opdf/documents?name=reliability.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: original,
  });
  assert(upload.status === 201, `upload failed: ${upload.status}`);
  const document = await upload.json();
  const documentDir = join(dataDir, "documents", document.id);

  const annotation = {
    id: "persist-after-restart",
    page: 1,
    kind: "highlight",
    payload: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await fetch(`${base}/api/opdf/documents/${document.id}/annotations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annotations: [annotation] }),
  });
  await fetch(`${base}/api/opdf/session`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activeFilePath: document.filePath,
      openTabs: [document.filePath],
      activeTabIndex: 0,
    }),
  });

  // A rejected save must never replace the last known-good PDF.
  const invalidSave = await fetch(`${base}/api/opdf/documents/${document.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("not-a-pdf"),
  });
  assert(invalidSave.status >= 400, "invalid save must fail");
  assert(
    Buffer.compare(await fetchBytes(`${base}/api/opdf/documents/${document.id}`), original) === 0,
    "failed save corrupted the stored PDF",
  );
  assert(
    !(await readdir(documentDir)).some((name) => name.endsWith(".tmp") || name.endsWith(".bak")),
    "failed save left temporary or backup files behind",
  );

  // Oversized/invalid create requests must be removed completely.
  const badUpload = await fetch(`${base}/api/opdf/documents?name=bad.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("broken"),
  });
  assert(badUpload.status >= 400, "invalid upload must fail");
  const documentDirs = await readdir(join(dataDir, "documents"));
  assert(documentDirs.length === 1 && documentDirs[0] === document.id, "failed upload leaked a document directory");

  // Persisted state must survive a real server process restart.
  await stopServer();
  await startServer();
  assert(
    Buffer.compare(await fetchBytes(`${base}/api/opdf/documents/${document.id}`), original) === 0,
    "PDF did not survive server restart",
  );
  const annotations = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`).then((r) => r.json());
  assert(annotations.length === 1 && annotations[0].id === annotation.id, "annotations did not survive restart");
  const session = await fetch(`${base}/api/opdf/session`).then((r) => r.json());
  assert(session.activeFilePath === document.filePath, "session did not survive restart");
  const recents = await fetch(`${base}/api/opdf/recent`).then((r) => r.json());
  assert(recents.some((item) => item.filePath === document.filePath), "recents did not survive restart");

  // Corrupt non-document JSON should degrade to safe defaults instead of taking down the server.
  await stopServer();
  await writeFile(join(dataDir, "session.json"), "{corrupt", "utf8");
  await writeFile(join(documentDir, "annotations.json"), "{corrupt", "utf8");
  await startServer();
  const fallbackSession = await fetch(`${base}/api/opdf/session`).then((r) => r.json());
  assert(fallbackSession.activeFilePath === null, "corrupt session did not fall back safely");
  const fallbackAnnotations = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`).then((r) => r.json());
  assert(Array.isArray(fallbackAnnotations) && fallbackAnnotations.length === 0, "corrupt annotations did not fall back safely");
  assert(
    Buffer.compare(await readFile(join(documentDir, "document.pdf")), original) === 0,
    "JSON recovery changed document bytes",
  );

  console.log("OPDF server reliability test passed.");
} finally {
  await stopServer();
  await rm(dataDir, { recursive: true, force: true });
}
