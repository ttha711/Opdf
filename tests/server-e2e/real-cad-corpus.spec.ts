import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { saveServerDocumentAndWait } from '../helpers/save';
import { openClickableCadText } from './cad-text-hit-target';

type Fixture = {
  id: string;
  size: number;
  editable: boolean;
  description: string;
  textObjectId?: string;
  textSample?: string;
};

const fixtureDir = process.env.OPDF_REAL_CAD_FIXTURES_DIR;
const manifest: Fixture[] = JSON.parse(
  readFileSync(resolve('tests/fixtures/real-cad-corpus.json'), 'utf8'),
);

async function logFailureState(page: import('@playwright/test').Page, fixture: string, stage: string) {
  const state = await page.evaluate(() => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-opdf-inline-text-editor]');
    const images = [...document.querySelectorAll<HTMLImageElement | HTMLCanvasElement>(
      '.native-edit-page img, .native-edit-page canvas',
    )];
    const bounds = document.querySelector('.native-edit-viewport')?.getBoundingClientRect();
    return {
      pages: document.querySelectorAll('.native-edit-page').length,
      overlayObjects: document.querySelectorAll('polygon.native-edit-object').length,
      rasterCount: images.length,
      fallbackStage: document.querySelector('[data-opdf-pdfjs-fallback]')?.getAttribute('data-opdf-fallback-stage') ?? null,
      paintedRasters: images.filter((image) => image instanceof HTMLImageElement
        ? image.complete && image.naturalWidth > 0 : image.width > 0 && image.height > 0).length,
      viewportSize: bounds ? [Math.round(bounds.width), Math.round(bounds.height)] : null,
      editorVisible: !!document.querySelector('[data-opdf-native-editor]'),
      inputVisible: !!field,
      inputBusy: field?.getAttribute('aria-busy') ?? null,
      error: document.querySelector('[role="alert"]')?.textContent?.slice(0, 350) ?? null,
      editMessage: document.querySelector('.native-content-editor__message')?.textContent?.slice(0, 350) ?? null,
      saveState: document.querySelector('[data-opdf-region="status-bar"]')?.getAttribute('data-opdf-save-state') ?? null,
      pageChildren: [...document.querySelectorAll('.native-edit-page')].slice(0, 3).map((node) => ({
        rect: [Math.round(node.getBoundingClientRect().width), Math.round(node.getBoundingClientRect().height)],
        children: [...node.children].map((child) => ({
          tag: child.tagName,
          className: child.getAttribute('class')?.slice(0, 80) ?? null,
          count: child.childElementCount,
        })),
      })),
    };
  });
  console.log(JSON.stringify({ fixture, stage, state }));
}

test.describe('public real-world CAD reference PDFs', () => {
  test.describe.configure({ retries: 0 });
  test.skip(!fixtureDir, 'Download and pin the corpus before running these tests');
  test.setTimeout(240_000);

  for (const fixture of manifest) {
    test(fixture.id + ': raster, bounded overlay, inline save/reopen', async ({ page, request }) => {
      const bytes = readFileSync(join(resolve(fixtureDir!), fixture.id + '.pdf'));
      expect(bytes.length).toBe(fixture.size);
      const upload = await request.post('/api/opdf/documents?name=' + fixture.id + '.pdf', {
        data: bytes,
        headers: { 'Content-Type': 'application/pdf' },
      });
      expect(upload.status()).toBe(201);
      const stored = await upload.json();
      const pageErrors: string[] = [];
      const saveRequests: string[] = [];
      page.on('request', (req) => {
        if (req.method() === 'PUT' && /\/api\/opdf\/documents\/[^/]+$/.test(new URL(req.url()).pathname)) {
          saveRequests.push('PUT requested; content-bytes=' + (req.postDataBuffer()?.byteLength ?? 'unknown'));
        }
      });
      page.on('response', (response) => {
        if (response.request().method() === 'PUT' &&
          /\/api\/opdf\/documents\/[^/]+$/.test(new URL(response.url()).pathname)) {
          saveRequests.push('PUT response ' + response.status());
        }
      });
      page.on('requestfailed', (request) => {
        if (request.method() === 'PUT') saveRequests.push('PUT failed: ' + request.failure()?.errorText);
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error' && message.type() !== 'warning') return;
        if (pageErrors.length < 25) pageErrors.push('console: ' + message.text().slice(0, 500));
      });
      const started = Date.now();
      await page.goto('/?open=' + encodeURIComponent(stored.filePath));
      await expect(page.locator("[data-opdf-engine='pdfium-wasm']"))
        .toBeVisible({ timeout: 60_000 });
      await page.getByTitle('Edit PDF Content').click();
      const expand = page.locator('[data-opdf-action="expand-right-panel"]');
      await expect(expand).toBeVisible({ timeout: 60_000 });
      await expand.click();
      const editor = page.locator('[data-opdf-native-editor="true"]');
      await expect(editor).toBeVisible({ timeout: 60_000 });
      try {
        await expect(page.locator('.native-edit-page img, .native-edit-page canvas').first())
          .toBeVisible({ timeout: 35_000 });
      } catch (error) {
        await logFailureState(page, fixture.id, 'raster');
        console.log(JSON.stringify({ fixture: fixture.id, browserErrors: pageErrors }));
        throw error;
      }
      await expect.poll(() => page.locator('polygon.native-edit-object').count(), {
        timeout: 90_000,
      }).toBeGreaterThan(0);
      const mounted = await page.locator('polygon.native-edit-object').count();
      expect(mounted).toBeLessThanOrEqual(500);
      expect(await editor.locator('.native-content-editor__objects button[data-opdf-object-id]').count())
        .toBeLessThanOrEqual(201);
      console.log(JSON.stringify({ fixture: fixture.id, loadMs: Date.now() - started, svgTargets: mounted }));

      if (fixture.editable) {
        expect(fixture.textObjectId, 'Editable reference needs a pinned text object').toBeTruthy();
        await openClickableCadText(page, fixture.textObjectId!);
        const pickedTextObject = fixture.textObjectId!;
        const input = page.getByRole('textbox', { name: 'Edit PDF text' });
        await expect(input).toBeVisible({ timeout: 20_000 });
        if (fixture.textSample) expect(await input.inputValue()).toContain(fixture.textSample);
        console.log(JSON.stringify({
          fixture: fixture.id,
          pickedTextObject,
          originalText: (await input.inputValue()).slice(0, 90),
        }));
        const replacement = 'OPDF CAD TEST ' + fixture.id;
        await input.fill(replacement);
        await input.press('Enter');
        try {
          await expect(input).toHaveCount(0, { timeout: 35_000 });
        } catch (error) {
          await logFailureState(page, fixture.id, 'inline-apply');
          console.log(JSON.stringify({ fixture: fixture.id, browserErrors: pageErrors }));
          throw error;
        }
        await expect(editor.locator('.native-content-editor__objects button[data-opdf-object-kind="text"]')
          .filter({ hasText: replacement })).toHaveCount(1, { timeout: 90_000 });
        try {
          await saveServerDocumentAndWait(page);
        } catch (error) {
          await logFailureState(page, fixture.id, 'save');
          console.log(JSON.stringify({ fixture: fixture.id, saveRequests, browserErrors: pageErrors }));
          throw error;
        }
        await page.reload();
        await expect(page.locator("[data-opdf-engine='pdfium-wasm']"))
          .toBeVisible({ timeout: 60_000 });
        await page.getByTitle('Edit PDF Content').click();
        await page.locator('[data-opdf-action="expand-right-panel"]').click();
        // The object sidebar intentionally virtualizes large CAD lists to
        // 200 rows. Search the full inspected PDF object list after reload.
        const search = page.getByRole('searchbox', { name: 'Find PDF object' });
        if (await search.count()) await search.fill(replacement);
        const reopened = page.locator('.native-content-editor__objects button[data-opdf-object-kind="text"]');
        await expect(reopened.filter({ hasText: replacement })).toHaveCount(1, { timeout: 90_000 });
      }
      expect(pageErrors).toEqual([]);
    });
  }
});
