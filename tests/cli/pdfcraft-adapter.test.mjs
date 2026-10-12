import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPdfcraftDiagnostics, parseJsonValues } from '../../server/tpdf-pdfcraft-adapter.mjs';

const mock = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'const args = process.argv.slice(2);',
  "if (args[0] !== 'run' || args[1] !== '--script' || args[3] !== '--root') process.exit(4);",
  'const root = args[4];',
  'if (!path.isAbsolute(root) || !args[2].startsWith(root)) process.exit(5);',
  'const steps = JSON.parse(fs.readFileSync(args[2]));',
  "if (steps.some(({tool}) => !['doc_open','doc_info','doc_revisions','accessibility_check','pdfa_verify'].includes(tool))) process.exit(6);",
  "if (fs.readFileSync(path.join(root, 'input.pdf')).subarray(0,5).toString() !== '%PDF-') process.exit(7);",
  'const behavior = process.env.TPDF_FAKE_BEHAVIOR;',
  "if (behavior === 'timeout') setTimeout(() => {}, 120000);",
  "else if (behavior === 'failure') process.exit(3);",
  "else if (behavior === 'badjson') process.stdout.write('{broken');",
  "else if (behavior === 'huge') process.stdout.write('x'.repeat(3 * 1024 * 1024));",
  'else {',
  " const results = [{doc:1}, {document:{pages:1,path:'/sensitive/tmp/input.pdf'},pdf_version:'1.7'}, {revisions:[{number:1}]}, {passed:2,failed:0,manual:0,results:[]}, {issues:[]}];",
  ' for (const value of results) console.log(JSON.stringify(value, null, 2));',
  '}',
].join('\n');

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'tpdf-pdfcraft-test-'));
  const executable = join(dir, 'fake-cli');
  const pdf = join(dir, 'document.pdf');
  await writeFile(executable, mock, { mode: 0o700 });
  await chmod(executable, 0o700);
  await writeFile(pdf, Buffer.from('%PDF-1.7\nmock'));
  try { return await fn({dir, pdf, executable}); }
  finally { await rm(dir, {recursive:true, force:true}); }
}
const config = executable => ({ TPDF_PDFCRAFT_ENABLED: '1', TPDF_PDFCRAFT_BIN: executable });

test('pretty JSON parser handles escaped braces and rejects garbage', () => {
  assert.deepEqual(parseJsonValues('{"x":"a\\"{b"}\n[1,2]',2), [{x:'a"{b'}, [1,2]]);
  assert.throws(() => parseJsonValues('{} {}', 3), /Incomplete/);
  assert.throws(() => parseJsonValues('{}Oops{}',2), /Unexpected/);
});
test('disabled by default even with a binary path', async () => {
  const d = createPdfcraftDiagnostics({ TPDF_PDFCRAFT_BIN: '/bin/echo' });
  assert.equal(d.enabled, false);
  await assert.rejects(d.diagnose('/anything'), { statusCode: 503 });
});
test('requires an absolute executable path', async () => {
  const d = createPdfcraftDiagnostics({ TPDF_PDFCRAFT_ENABLED: '1', TPDF_PDFCRAFT_BIN: 'pdfcraft-cli' });
  await assert.rejects(d.diagnose('/anything'), { statusCode: 503 });
});
test('reports and hash do not change original or expose temporary input path', () => fixture(async ({pdf,executable}) => {
  const before = await readFile(pdf);
  const d = createPdfcraftDiagnostics(config(executable));
  const result = await d.diagnose(pdf);
  assert.equal(result.ok, true);
  assert.equal(result.summary.document.pages, 1);
  assert.equal(result.summary.document.path, undefined);
  assert.equal(result.documentSha256.length, 64);
  assert.deepEqual(result.pdfa, { issues: [] });
  assert.deepEqual(await readFile(pdf), before);
  assert.equal(d.stats().active, 0);
}));
test('non-PDF input is rejected before CLI invocation', () => fixture(async ({pdf,executable}) => {
  await writeFile(pdf,'not pdf');
  await assert.rejects(createPdfcraftDiagnostics(config(executable)).diagnose(pdf), { statusCode: 422 });
}));
test('oversized PDFs rejected before CLI invocation', () => fixture(async ({pdf,executable}) => {
  await writeFile(pdf, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1024 * 1024 + 1)]));
  const d = createPdfcraftDiagnostics({ ...config(executable), TPDF_PDFCRAFT_MAX_BYTES: '1048576' });
  await assert.rejects(d.diagnose(pdf), { statusCode: 413 });
}));
test('CLI failure and invalid JSON fail closed', () => fixture(async ({pdf,executable}) => {
  const d = createPdfcraftDiagnostics(config(executable));
  process.env.TPDF_FAKE_BEHAVIOR = 'failure';
  try {
    await assert.rejects(d.diagnose(pdf), { statusCode: 422 });
    process.env.TPDF_FAKE_BEHAVIOR = 'badjson';
    await assert.rejects(d.diagnose(pdf), { statusCode: 502 });
  } finally { delete process.env.TPDF_FAKE_BEHAVIOR; }
}));
test('timeout kills child and releases busy slot', () => fixture(async ({pdf,executable}) => {
  const d = createPdfcraftDiagnostics({ ...config(executable), TPDF_PDFCRAFT_TIMEOUT_MS: '5000' });
  process.env.TPDF_FAKE_BEHAVIOR = 'timeout';
  try {
    const running = d.diagnose(pdf);
    await new Promise(resolve=>setTimeout(resolve,50));
    await assert.rejects(d.diagnose(pdf), { statusCode: 429 });
    await assert.rejects(running, { statusCode: 504 });
    assert.equal(d.stats().active, 0);
  } finally { delete process.env.TPDF_FAKE_BEHAVIOR; }
}));
