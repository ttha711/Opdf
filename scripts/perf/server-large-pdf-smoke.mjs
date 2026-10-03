import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PORT = 8793;
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const TARGETS_MB = [100, 250, 500];
const MiB = 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
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

function uploadPdf(filePath, name) {
  return new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    const request = http.request(
      `${BASE}/api/opdf/documents?name=${encodeURIComponent(name)}`,
      { method: "POST", headers: { "content-type": "application/pdf" } },
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

async function assertRange(id, header, expectedLength, expectedTotal, label) {
  const response = await fetch(`${BASE}/api/opdf/documents/${id}`, {
    headers: { Range: header },
  });
  assert(response.status === 206, `${label}: expected HTTP 206, got ${response.status}`);
  const contentRange = response.headers.get("content-range") || "";
  assert(contentRange.endsWith(`/${expectedTotal}`), `${label}: invalid Content-Range ${contentRange}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === expectedLength, `${label}: expected ${expectedLength} bytes, got ${bytes.length}`);
  return bytes;
}

const workDir = await mkdtemp(join(tmpdir(), "opdf-large-server-"));
const dataDir = join(workDir, "data");
const server = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPDF_PORT: String(PORT),
    OPDF_HOST: HOST,
    OPDF_DATA_DIR: dataDir,
    OPDF_MAX_UPLOAD_BYTES: String(600 * MiB),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  const health = await waitForHealth();
  assert(health.runtime === "server", "health runtime must be server");
  assert(health.maxUploadBytes >= 500 * MiB, "server upload limit must accept the 500 MB stress case");

  for (const targetMb of TARGETS_MB) {
    const filePath = join(workDir, `drawing-${targetMb}mb.pdf`);
    await run(process.execPath, [
      "scripts/perf/generate-large-pdf.mjs",
      "--mb", String(targetMb),
      "--pages", "80",
      "--out", filePath,
    ]);

    const info = await stat(filePath);
    assert(info.size >= targetMb * MiB, `${targetMb} MB fixture is smaller than target`);

    const uploaded = await uploadPdf(filePath, `drawing-${targetMb}mb.pdf`);
    assert(uploaded.size === info.size, `${targetMb} MB upload size mismatch`);

    const headLength = 64 * 1024;
    const head = await assertRange(uploaded.id, `bytes=0-${headLength - 1}`, headLength, info.size, `${targetMb} MB head range`);
    assert(head.subarray(0, 5).toString("ascii") === "%PDF-", `${targetMb} MB head does not start with %PDF-`);

    const tailLength = 64 * 1024;
    const tailStart = info.size - tailLength;
    const tail = await assertRange(uploaded.id, `bytes=${tailStart}-${info.size - 1}`, tailLength, info.size, `${targetMb} MB tail range`);
    assert(tail.includes(Buffer.from("startxref")), `${targetMb} MB tail range does not contain startxref`);

    const stored = await fetch(`${BASE}/api/opdf/documents/${uploaded.id}`, { headers: { Range: "bytes=0-4" } });
    assert(stored.status === 206, `${targetMb} MB persisted document is not range-readable`);

    await rm(filePath, { force: true });
    console.log(`PASS ${targetMb} MB: streamed upload + persisted HTTP Range reads`);
  }
} finally {
  server.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    server.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(workDir, { recursive: true, force: true });
}
