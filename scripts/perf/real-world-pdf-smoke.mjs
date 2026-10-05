import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdtemp, rm, stat } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { browserTest, formatMiB, writeSummary } from "./real-world-pdf-browser.mjs";

const HOST = "127.0.0.1";
const PORT = 8797;
const BASE = `http://${HOST}:${PORT}`;
const MiB = 1024 * 1024;

const CASES = [
  {
    name: "WSDOT E-20.20-00 Buried Structure Three-Sided",
    fileName: "wsdot-e20.20-00.pdf",
    url: "https://wsdot.wa.gov/publications/fulltext/Standards/english/PDF/e20.20-00.pdf",
    minimumBytes: 40 * MiB,
    expectedPages: 22,
    searchText: "BURIED STRUCTURE",
    mutateAndSave: true,
    maxFirstPageMs: 60_000,
  },
  {
    name: "WSDOT Plans Preparation Manual M22-31",
    fileName: "wsdot-plans-preparation.pdf",
    url: "https://www.wsdot.wa.gov/publications/manuals/fulltext/M22-31/PlansPreparation.pdf",
    minimumBytes: 200 * MiB,
    expectedPages: null,
    searchText: null,
    mutateAndSave: false,
    maxFirstPageMs: 120_000,
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/opdf/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("OPDF Server did not become healthy.");
}

async function downloadPdf(url, outputPath) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 OPDF real-world benchmark",
      accept: "application/pdf,*/*;q=0.8",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const output = createWriteStream(outputPath);
  await new Promise((resolve, reject) => {
    Readable.fromWeb(response.body).pipe(output);
    output.once("finish", resolve);
    output.once("error", reject);
  });

  const info = await stat(outputPath);
  const header = Buffer.alloc(5);
  const file = await import("node:fs/promises").then((fs) => fs.open(outputPath, "r"));
  try {
    await file.read(header, 0, 5, 0);
  } finally {
    await file.close();
  }
  assert(header.toString("ascii") === "%PDF-", `${basename(outputPath)} is not a PDF`);

  return {
    bytes: info.size,
    ms: Date.now() - startedAt,
    contentType,
    finalUrl: response.url,
  };
}

function uploadPdf(filePath, fileName) {
  return new Promise(async (resolve, reject) => {
    const info = await stat(filePath);
    const input = createReadStream(filePath);
    const request = http.request(
      `${BASE}/api/opdf/documents?name=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "content-length": String(info.size),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`Upload failed HTTP ${response.statusCode}: ${body}`));
            return;
          }
          resolve(JSON.parse(body));
        });
      },
    );
    request.once("error", reject);
    input.once("error", reject);
    input.pipe(request);
  });
}

async function checkRange(id, totalBytes) {
  const response = await fetch(`${BASE}/api/opdf/documents/${id}`, {
    headers: { Range: "bytes=0-65535" },
  });
  assert(response.status === 206, `Expected server HTTP 206, got ${response.status}`);
  assert(response.headers.get("accept-ranges") === "bytes", "Accept-Ranges header missing");
  assert((response.headers.get("content-range") || "").endsWith(`/${totalBytes}`), "Content-Range total mismatch");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === 65_536, `Expected 65536 range bytes, got ${bytes.length}`);
  assert(bytes.subarray(0, 5).toString("ascii") === "%PDF-", "Range response does not start with PDF header");
}

const workDir = await mkdtemp(join(tmpdir(), "opdf-real-world-"));
const dataDir = join(workDir, "server-data");
const server = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPDF_HOST: HOST,
    OPDF_PORT: String(PORT),
    OPDF_DATA_DIR: dataDir,
    OPDF_MAX_UPLOAD_BYTES: String(350 * MiB),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

let browser;
const results = [];
try {
  const health = await waitForHealth();
  assert(health.runtime === "server", "Expected OPDF server runtime");
  browser = await chromium.launch({ headless: true });

  for (const testCase of CASES) {
    console.log(`\n=== ${testCase.name} ===`);
    const localPath = join(workDir, testCase.fileName);
    const downloaded = await downloadPdf(testCase.url, localPath);
    assert(
      downloaded.bytes >= testCase.minimumBytes,
      `${testCase.name}: downloaded file is unexpectedly small (${formatMiB(downloaded.bytes)} MB)`,
    );
    console.log(`Downloaded ${formatMiB(downloaded.bytes)} MB in ${(downloaded.ms / 1000).toFixed(1)}s`);

    const uploadStartedAt = Date.now();
    const stored = await uploadPdf(localPath, testCase.fileName);
    const uploadMs = Date.now() - uploadStartedAt;
    assert(stored.size === downloaded.bytes, `${testCase.name}: stored size mismatch`);
    await checkRange(stored.id, downloaded.bytes);

    const browserResult = await browserTest(browser, testCase, stored, downloaded.bytes, BASE);
    const result = {
      name: testCase.name,
      fileBytes: downloaded.bytes,
      downloadMs: downloaded.ms,
      uploadMs,
      maxFirstPageMs: testCase.maxFirstPageMs,
      ...browserResult,
    };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));

    await rm(localPath, { force: true });
  }

  await writeSummary(results);
  console.log("\nREAL_WORLD_PDF_RESULT=" + JSON.stringify(results));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    server.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(workDir, { recursive: true, force: true });
}
