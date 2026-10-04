import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Document, Packer, Paragraph } from "docx";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";
import { PDFDocument } from "pdf-lib";

const port = Number(process.env.OPDF_OFFICE_SMOKE_PORT || 8791);
const origin = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-office-smoke-"));

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/opdf/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("OPDF Server did not become ready.");
}

async function convert(name, bytes) {
  const response = await fetch(
    `${origin}/api/opdf/operations/office-to-pdf?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${name} conversion failed: HTTP ${response.status} ${body}`);
  }
  const output = new Uint8Array(await response.arrayBuffer());
  if (Buffer.from(output.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new Error(`${name} did not return a PDF signature.`);
  }
  const pdf = await PDFDocument.load(output);
  if (pdf.getPageCount() < 1) throw new Error(`${name} returned an empty PDF.`);
  console.log(`PASS ${name} -> PDF (${output.byteLength} bytes, ${pdf.getPageCount()} page(s))`);
}

const child = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  windowsHide: true,
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    OPDF_HOST: "127.0.0.1",
    OPDF_PORT: String(port),
    OPDF_DATA_DIR: dataDir,
  },
});

try {
  await waitForServer();

  const word = new Document({
    sections: [{
      children: [
        new Paragraph("OPDF Word to PDF smoke test"),
        new Paragraph("This content must survive a real LibreOffice conversion."),
      ],
    }],
  });
  await convert("smoke.docx", new Uint8Array(await Packer.toBuffer(word)));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["OPDF Excel to PDF smoke test", "Value"],
    ["Structural beam", 300],
    ["MEP load", 125],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Smoke");
  const xlsx = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await convert("smoke.xlsx", new Uint8Array(xlsx));

  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText("OPDF PowerPoint to PDF smoke test", { x: 0.8, y: 0.8, w: 8, h: 0.8 });
  slide.addText("LibreOffice conversion path", { x: 0.8, y: 2, w: 8, h: 0.6 });
  const pptBuffer = await pptx.write({ outputType: "arraybuffer" });
  if (!(pptBuffer instanceof ArrayBuffer)) throw new Error("Unable to generate PowerPoint smoke input.");
  await convert("smoke.pptx", new Uint8Array(pptBuffer));

  console.log("Office to PDF smoke passed for DOCX, XLSX, and PPTX.");
} finally {
  child.kill();
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
