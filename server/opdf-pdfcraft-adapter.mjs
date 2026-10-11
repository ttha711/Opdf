// Optional, read-only PDF diagnostics. Never exposed as a generic CLI/MCP proxy.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const STEPS = Object.freeze([
  { tool: 'doc_open', args: { path: 'input.pdf' } },
  { tool: 'doc_info', args: { doc: 1 } },
  { tool: 'doc_revisions', args: { doc: 1 } },
  { tool: 'accessibility_check', args: { doc: 1 } },
  { tool: 'pdfa_verify', args: { doc: 1, level: '2b' } },
]);

const limit = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
};
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// PdfCraft emits *multiple*, pretty-printed JSON values for --script.
export function parseJsonValues(output, expected) {
  const values = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < output.length; i++) {
    const ch = output[i];
    if (start < 0) {
      if (/\s/.test(ch)) continue;
      if (ch !== '{' && ch !== '[') throw new Error('Unexpected tool output.');
      start = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (--depth < 0) throw new Error('Unbalanced tool output.');
      if (depth === 0) {
        values.push(JSON.parse(output.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  if (start >= 0 || quoted || values.length !== expected) throw new Error('Incomplete tool output.');
  return values;
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function runProcess(binary, args, cwd, timeoutMs, outputCap) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd, shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', bytes = 0, settled = false, timedOut = false, tooLarge = false;
    const decoder = new StringDecoder('utf8');
    function kill() {
      child.kill('SIGKILL');
    }
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const finish = (error, output) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(output);
    };
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > outputCap) { tooLarge = true; kill(); return; }
      stdout += decoder.write(chunk);
    });
    child.stderr.on('data', () => {}); // Never return internal paths or PDF details in stderr.
    child.once('error', () => finish(fail(503, 'PdfCraft CLI is unavailable.')));
    child.once('close', code => {
      if (timedOut) return finish(fail(504, 'PDF diagnostic timed out.'));
      if (tooLarge) return finish(fail(502, 'PDF diagnostic output is too large.'));
      if (code !== 0) return finish(fail(422, 'PdfCraft could not inspect this PDF.'));
      finish(null, stdout + decoder.end());
    });
  });
}

export function createPdfcraftDiagnostics(env = process.env) {
  const enabled = env.OPDF_PDFCRAFT_ENABLED === '1';
  const binary = String(env.OPDF_PDFCRAFT_BIN || '');
  const timeoutMs = limit(env.OPDF_PDFCRAFT_TIMEOUT_MS, 45_000, 5_000, 120_000);
  const maxBytes = limit(env.OPDF_PDFCRAFT_MAX_BYTES, 32 * 1024 * 1024, 1024 * 1024, 256 * 1024 * 1024);
  const outputCap = limit(env.OPDF_PDFCRAFT_MAX_OUTPUT_BYTES, 2 * 1024 * 1024, 512 * 1024, 8 * 1024 * 1024);
  const maxActive = limit(env.OPDF_PDFCRAFT_CONCURRENCY, 1, 1, 2);
  let active = 0;

  async function diagnose(filePath) {
    if (!enabled) throw fail(503, 'Document Health is disabled.');
    if (!isAbsolute(binary)) throw fail(503, 'Document Health is not configured.');
    if (active >= maxActive) throw fail(429, 'Document Health is busy; retry later.');
    active++;
    const started = Date.now();
    let workDir;
    try {
      const source = await stat(filePath);
      if (!source.isFile()) throw fail(404, 'Document is unavailable.');
      if (source.size > maxBytes) throw fail(413, 'PDF exceeds the configured diagnostic size limit.');
      workDir = await mkdtemp(join(tmpdir(), 'opdf-health-'));
      const snapshot = join(workDir, 'input.pdf');
      await copyFile(filePath, snapshot);
      const copied = await stat(snapshot);
      if (copied.size > maxBytes || copied.size !== source.size) {
        throw fail(409, 'Document changed while preparing diagnostics.');
      }
      const fd = await open(snapshot, 'r');
      const signature = Buffer.alloc(5);
      try { await fd.read(signature, 0, 5, 0); } finally { await fd.close(); }
      if (signature.toString('ascii') !== '%PDF-') throw fail(422, 'Not a PDF document.');
      const hash = await sha256(snapshot);
      const script = join(workDir, 'read-only.json');
      await writeFile(script, JSON.stringify(STEPS), { mode: 0o600 });
      const output = await runProcess(binary, ['run', '--script', script, '--root', workDir], workDir, timeoutMs, outputCap);
      let values;
      try { values = parseJsonValues(output, STEPS.length); }
      catch { throw fail(502, 'PdfCraft returned invalid diagnostic data.'); }
      if (!values[0] || !Number.isInteger(values[0].doc) || values[0].doc !== 1) {
        throw fail(502, 'PdfCraft returned an invalid document handle.');
      }
      // PdfCraft doc_info includes its temporary working path. Never disclose it.
      const summary = { ...values[1], document: { ...values[1]?.document } };
      delete summary.document.path;
      return {
        ok: true, engine: 'PdfCraft', pdfaLevel: '2b', documentSha256: hash,
        summary, revisions: values[2], accessibility: values[3], pdfa: values[4],
        elapsedMs: Date.now() - started,
        warnings: ['Diagnostic only; PDF/A results are not an independent conformance certification.'],
      };
    } finally {
      active--;
      if (workDir) await rm(workDir, { force: true, recursive: true }).catch(() => {});
    }
  }

  return { enabled, diagnose, stats: () => ({ enabled, active, maxBytes, timeoutMs, maxActive }) };
}
