import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const port = 18787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-server-smoke-"));
const child = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPDF_PORT: String(port),
    OPDF_DATA_DIR: dataDir,
    OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
    OPDF_PYTHON_PATH: process.platform === "win32" ? "python" : "python3",
    OPDF_OFFICE_CONVERTER_SCRIPT: join(process.cwd(), "server", "office-converter-smoke.py"),
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
  assert(health.capabilities?.ocrQueue === true, "health must expose OCR queue support");
  assert(health.capabilities?.searchablePdfOcr === true, "health must expose searchable PDF OCR support");

  const ocrCreate = await fetch(`${base}/api/opdf/ocr/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath: "smoke.pdf", language: "eng" }),
  });
  assert(ocrCreate.status === 201, `OCR job create failed: ${ocrCreate.status}`);
  const ocrJob = await ocrCreate.json();
  assert(ocrJob.status === "queued" && ocrJob.progress === 0, "new OCR job must be queued");

  const ocrJobs = await fetch(`${base}/api/opdf/ocr/jobs`).then((r) => r.json());
  assert(ocrJobs.some((item) => item.id === ocrJob.id), "OCR job list is missing the created job");

  const ocrCancel = await fetch(`${base}/api/opdf/ocr/jobs/${ocrJob.id}/cancel`, { method: "POST" });
  assert(ocrCancel.ok, "OCR cancel failed");
  const cancelledOcr = await ocrCancel.json();
  assert(cancelledOcr.status === "cancelled", "OCR cancel did not update job status");

  const assetNames = await readdir(join(process.cwd(), "apps", "web", "dist", "assets"));
  const pdfWorkerAsset = assetNames.find((name) => name.startsWith("pdf.worker-") && name.endsWith(".mjs"));
  assert(pdfWorkerAsset, "built PDF.js worker asset is missing");
  const workerResponse = await fetch(`${base}/assets/${pdfWorkerAsset}`);
  assert(workerResponse.ok, `PDF.js worker asset failed: ${workerResponse.status}`);
  assert(
    (workerResponse.headers.get("content-type") || "").includes("javascript"),
    "PDF.js .mjs worker must be served with a JavaScript MIME type",
  );
  const missingAsset = await fetch(`${base}/assets/opdf-missing-worker.mjs`);
  assert(missingAsset.status === 404, "missing static assets must not fall back to index.html");

  const sampleDoc = await PDFDocument.create();
  const samplePage = sampleDoc.addPage([200, 200]);
  const sampleFont = await sampleDoc.embedFont("Helvetica");
  samplePage.drawText("OPDF OCR native text smoke", {
    x: 20,
    y: 100,
    size: 12,
    font: sampleFont,
  });
  const sample = Buffer.from(await sampleDoc.save());
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

  const nativeOcrCreate = await fetch(`${base}/api/opdf/ocr/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath: document.filePath, language: "eng+vie" }),
  });
  assert(nativeOcrCreate.status === 201, "native-text OCR job create failed");
  const nativeOcrJob = await nativeOcrCreate.json();
  const nativeOcrRun = await fetch(`${base}/api/opdf/ocr/jobs/${nativeOcrJob.id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: sample,
  });
  assert(nativeOcrRun.status === 202, `native-text OCR run failed: ${nativeOcrRun.status}`);

  let completedOcr = null;
  const ocrDeadline = Date.now() + 20000;
  while (Date.now() < ocrDeadline) {
    completedOcr = await fetch(`${base}/api/opdf/ocr/jobs/${nativeOcrJob.id}`).then((r) => r.json());
    if (completedOcr.status === "done" || completedOcr.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(completedOcr?.status === "done", `native-text OCR did not complete: ${completedOcr?.error || completedOcr?.status}`);
  assert(completedOcr.progress === 100, "completed OCR job must report 100%");
  const nativeOcrOutput = await fetch(`${base}/api/opdf/ocr/jobs/${nativeOcrJob.id}/output`);
  assert(nativeOcrOutput.ok, "OCR output download failed");
  const searchableBytes = new Uint8Array(await nativeOcrOutput.arrayBuffer());
  const searchableDoc = await PDFDocument.load(searchableBytes);
  assert(searchableDoc.getPageCount() === 1, "OCR output changed page count");

  const updatedDoc = await PDFDocument.create();
  updatedDoc.addPage([300, 300]);
  updatedDoc.addPage([200, 200]);
  const updatedSample = Buffer.from(await updatedDoc.save());
  const replace = await fetch(`${base}/api/opdf/documents/${document.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: updatedSample,
  });
  assert(replace.ok, "repeat PDF save failed");
  const replacedBytes = Buffer.from(
    await fetch(`${base}/api/opdf/documents/${document.id}`).then((r) => r.arrayBuffer()),
  );
  assert(Buffer.compare(replacedBytes, updatedSample) === 0, "repeat PDF save did not replace stored bytes");

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

  const annotation2 = { ...annotation, id: "smoke-annotation-2", updatedAt: Date.now() };
  const replaceAnnotations = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annotations: [annotation2] }),
  });
  assert(replaceAnnotations.ok, "repeat annotation write failed");
  const annotations2 = await fetch(`${base}/api/opdf/documents/${document.id}/annotations`).then((r) => r.json());
  assert(annotations2.length === 1 && annotations2[0].id === annotation2.id, "repeat annotation write did not replace state");

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

  const sessionPut2 = await fetch(`${base}/api/opdf/session`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activeFilePath: null,
      openTabs: [],
      activeTabIndex: 0,
    }),
  });
  assert(sessionPut2.ok, "repeat session write failed");
  const session2 = await fetch(`${base}/api/opdf/session`).then((r) => r.json());
  assert(session2.activeFilePath === null, "repeat session write did not replace state");

  const recent = await fetch(`${base}/api/opdf/recent`).then((r) => r.json());
  assert(recent.some((item) => item.filePath === document.filePath), "recent document missing");

  const officeResponse = await fetch(`${base}/api/opdf/operations/convert-office?format=docx`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: updatedSample,
  });
  assert(officeResponse.ok, `Office conversion worker failed: ${officeResponse.status}`);
  const officeBytes = Buffer.from(await officeResponse.arrayBuffer());
  assert(
    officeBytes.toString("ascii") === "OPDF-OFFICE-STUB:docx",
    "Office conversion worker returned unexpected output",
  );

  const compressedResponse = await fetch(`${base}/api/opdf/operations/compress`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: updatedSample,
  });
  assert(compressedResponse.ok, `compress operation failed: ${compressedResponse.status}`);
  const compressed = Buffer.from(await compressedResponse.arrayBuffer());
  assert(compressed.subarray(0, 5).toString("ascii") === "%PDF-", "compressed result is not a PDF");

  const encodeOptions = (value) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  const encryptedResponse = await fetch(`${base}/api/opdf/operations/encrypt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-OPDF-Options": encodeOptions({
        userPassword: "viewer-pass",
        ownerPassword: "owner-pass",
      }),
    },
    body: updatedSample,
  });
  assert(encryptedResponse.ok, `encrypt operation failed: ${encryptedResponse.status}`);
  const encrypted = Buffer.from(await encryptedResponse.arrayBuffer());
  assert(encrypted.subarray(0, 5).toString("ascii") === "%PDF-", "encrypted result is not a PDF");

  const decryptedResponse = await fetch(`${base}/api/opdf/operations/decrypt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-OPDF-Options": encodeOptions({ password: "viewer-pass" }),
    },
    body: encrypted,
  });
  assert(decryptedResponse.ok, `decrypt operation failed: ${decryptedResponse.status}`);
  const decrypted = new Uint8Array(await decryptedResponse.arrayBuffer());
  const decryptedDoc = await PDFDocument.load(decrypted);
  assert(decryptedDoc.getPageCount() === 2, "decrypt operation did not preserve the PDF");

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
