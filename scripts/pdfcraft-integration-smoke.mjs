// Real-binary smoke: run only with a pinned, locally built PdfCraft CLI.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createPdfcraftDiagnostics } from '../server/tpdf-pdfcraft-adapter.mjs';

const binary = process.env.TPDF_PDFCRAFT_BIN;
assert(binary, 'TPDF_PDFCRAFT_BIN must point to a pinned PdfCraft CLI executable');
const directory = await mkdtemp(join(tmpdir(), 'tpdf-pdfcraft-real-'));
try {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('TPDF read-only diagnostic fixture', { x: 72, y: 700, font, size: 16 });
  const target = join(directory, 'fixture.pdf');
  await writeFile(target, await pdf.save());
  const original = await readFile(target);
  const diagnostic = createPdfcraftDiagnostics({
    TPDF_PDFCRAFT_ENABLED: '1',
    TPDF_PDFCRAFT_BIN: resolve(binary),
    TPDF_PDFCRAFT_TIMEOUT_MS: '60000',
  });
  const start = performance.now();
  const report = await diagnostic.diagnose(target);
  assert.equal(report.ok, true);
  assert.equal(report.engine, 'PdfCraft');
  assert.equal(report.summary?.document?.pages, 1);
  assert(Array.isArray(report.accessibility?.results), 'Accessibility results missing');
  assert(report.pdfa && typeof report.pdfa === 'object', 'PDF/A preflight missing');
  assert(report.revisions && typeof report.revisions === 'object', 'Revision info missing');
  assert.equal(report.summary.document.path, undefined, 'Private diagnostic path leaked');
  assert.equal(report.documentSha256, createHash('sha256').update(original).digest('hex'));
  assert.deepEqual(await readFile(target), original, 'Diagnostic changed source PDF bytes');

  const broken = join(directory, 'broken.pdf');
  await writeFile(broken, 'not a PDF file');
  await assert.rejects(diagnostic.diagnose(broken), 'Malformed input must fail');
  console.log(JSON.stringify({
    passed: true, elapsedMs: Math.round(performance.now() - start),
    bytes: original.length, pages: report.summary.document.pages,
    accessibilityFailed: report.accessibility.failed,
    pdfaIssues: report.pdfa.issues?.length ?? 0,
  }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
