import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const manifestPath = new URL('../../tests/fixtures/real-cad-corpus.json', import.meta.url);
const fixtures = JSON.parse(await readFile(manifestPath, 'utf8'));
const root = resolve(process.env.OPDF_REAL_CAD_FIXTURES_DIR || '.opdf-cad-fixtures');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const sha1 = (data) => createHash('sha1')
  .update('blob ' + data.byteLength + '\0').update(data).digest('hex');

async function download(fixture) {
  const target = join(root, fixture.id + '.pdf');
  try {
    const cached = await readFile(target);
    if (cached.byteLength === fixture.size && sha1(cached) === fixture.blobSha) {
      console.log('CACHED ' + fixture.id + ' ' + target);
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const path = fixture.path.split('/').map(encodeURIComponent).join('/');
  const url = 'https://raw.githubusercontent.com/' + fixture.repo + '/' + fixture.commit + '/' + path;
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(fixture.id + ': HTTP ' + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength !== fixture.size || sha1(data) !== fixture.blobSha ||
    data.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(fixture.id + ': untrusted PDF content (size, signature or SHA mismatch)');
  }
  const staging = target + '.' + process.pid + '.tmp';
  try {
    await writeFile(staging, data);
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
  console.log('VERIFIED ' + fixture.id + ' ' + data.length + ' bytes ' + target);
}

await mkdir(root, { recursive: true });
let count = 0;
for (const fixture of fixtures) {
  if (only && fixture.id !== only) continue;
  if (!/^[a-z0-9-]+$/.test(fixture.id) || !/^[0-9a-f]{40}$/.test(fixture.commit) ||
      !/^[0-9a-f]{40}$/.test(fixture.blobSha) || fixture.size > 12_000_000 || fixture.size < 100) {
    throw new Error('Invalid manifest entry: ' + fixture.id);
  }
  await download(fixture);
  count++;
}
if (!count) throw new Error('No CAD fixtures matched the requested filter');
