import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { saveServerDocumentAndWait } from '../helpers/save';

type Fixture = {
  id: string;
  size: number;
  editable: boolean;
  description: string;
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
        const targets = page.locator(
          '.native-edit-page polygon[data-opdf-object-kind="text"]:is([data-opdf-object-depth="0"], [data-opdf-object-depth="1"])',
        );
        await expect(targets.first()).toBeVisible({ timeout: 60_000 });
        // CAD generators often split a label into 1-2 px text fragments.
        // A user cannot realistically double-click those at fit-to-page zoom.
        // Select a physically clickable, unobstructed label in the viewport.
        const targetIndex = await targets.evaluateAll((nodes) => {
          const viewport = document.querySelector('.native-edit-viewport')?.getBoundingClientRect();
          if (!viewport) return -1;
          return nodes.findIndex((node) => {
            const rect = node.getBoundingClientRect();
            if (rect.width < 16 || rect.height < 7) return false;
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            if (x < viewport.left + 8 || x > viewport.right - 8 ||
                y < viewport.top + 8 || y > viewport.bottom - 8) return false;
            return document.elementFromPoint(x, y) === node;
          });
        });
        expect(targetIndex, 'A clickable CAD text label must exist in the viewport').toBeGreaterThanOrEqual(0);
        const target = targets.nth(targetIndex);
        await target.dblclick({ timeout: 15_000 });
        const input = page.getByRole('textbox', { name: 'Edit PDF text' });
        await expect(input).toBeVisible({ timeout: 20_000 });
        console.log(JSON.stringify({
          fixture: fixture.id,
          pickedTextObject: await target.getAttribute('data-opdf-canvas-object'),
          pickedDepth: await target.getAttribute('data-opdf-object-depth'),
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
          console.log(JSON.stringify({ fixture: fixture.id, browserErrors: pageErrors }));
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
