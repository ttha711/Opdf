import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 18787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-server-smoke-"));
const child = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPDF_PORT: String(port),
    OPDF_DATA_DIR: dataDir,
    OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const base = `http://127.0.0.1:${port}`;

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/opdf/health`);
      if (response.ok) return response.json();
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`OPDF server did not become healthy. ${stderr}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const health = await waitForHealth();
  assert(health.runtime === "server", "health runtime must be server");

  const sample = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "ascii");
  const upload = await fetch(`${base}/api/opdf/documents?name=smoke.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: sample,
  });
  assert(upload.status === 201, `upload failed: ${upload.status}`);
  const document = await upload.json();
  assert(document.filePath.startsWith("server://"), "upload must return server filePath");

  const full = await fetch(`${base}/api/opdf/documents/${document.id}`);
  assert(full.ok, "full PDF fetch failed");
  assert(Buffer.compare(Buffer.from(await full.arrayBuffer()), sample) === 0, "stored PDF differs");

  const range = await fetch(`${base}/api/opdf/documents/${document.id}`, {
    headers: { Range: "bytes=0-4" },
  });
  assert(range.status === 206, "range request must return 206");
  assert(Buffer.from(await range.arrayBuffer()).toString("ascii") === "%PDF-", "range bytes differ");

  const annotation = {
    id: "smoke-annotation",
    page: 1,
    kind: "highlight",
    payload: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const putAnnotations = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annotations: [annotation] }),
  });
  assert(putAnnotations.ok, "annotation write failed");

  const annotations = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`).then((r) => r.json());
  assert(annotations.length === 1 && annotations[0].id === annotation.id, "annotation round-trip failed");

  const sessionPut = await fetch(`${base}/api/opdf/session`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activeFilePath: document.filePath,
      openTabs: [document.filePath],
      activeTabIndex: 0,
    }),
  });
  assert(sessionPut.ok, "session write failed");
  const session = await fetch(`${base}/api/opdf/session`).then((r) => r.json());
  assert(session.activeFilePath === document.filePath, "session round-trip failed");

  const recent = await fetch(`${base}/api/opdf/recent`).then((r) => r.json());
  assert(recent.some((item) => item.filePath === document.filePath), "recent document missing");

  console.log("OPDF server smoke test passed.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(dataDir, { recursive: true, force: true });
}
