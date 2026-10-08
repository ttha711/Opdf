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

test.describe('public real-world CAD reference PDFs', () => {
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
      await expect(page.locator('.native-edit-page img, .native-edit-page canvas').first())
        .toBeVisible({ timeout: 90_000 });
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
        await targets.first().dblclick();
        const input = page.getByRole('textbox', { name: 'Edit PDF text' });
        await expect(input).toBeVisible({ timeout: 20_000 });
        const replacement = 'OPDF CAD TEST ' + fixture.id;
        await input.fill(replacement);
        await input.press('Enter');
        await expect(input).toHaveCount(0, { timeout: 120_000 });
        await expect(editor.locator('.native-content-editor__objects button[data-opdf-object-kind="text"]')
          .filter({ hasText: replacement })).toHaveCount(1, { timeout: 90_000 });
        await saveServerDocumentAndWait(page);
        await page.reload();
        await expect(page.locator("[data-opdf-engine='pdfium-wasm']"))
          .toBeVisible({ timeout: 60_000 });
        await page.getByTitle('Edit PDF Content').click();
        await page.locator('[data-opdf-action="expand-right-panel"]').click();
        const reopened = page.locator('.native-content-editor__objects button[data-opdf-object-kind="text"]');
        await expect(reopened.filter({ hasText: replacement })).toHaveCount(1, { timeout: 90_000 });
      }
      expect(pageErrors).toEqual([]);
    });
  }
});
