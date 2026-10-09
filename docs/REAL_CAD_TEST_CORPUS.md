# Public CAD reference corpus

The OPDF issue #144 file HCHN-SA-GR 1.pdf (110 MB) has not been located in the repository or at an authenticated public URL. These are independent public reference PDFs, not replacements for that original regression file.

## Selected sources

- `a0-vector-poster`: generated A0 test sheet from `nftomczain/GhostPoster`, MIT-licensed upstream project.
- `va-floor-finish`: public tender finish plan, two sheets, from the U.S. Department of Veterans Affairs via `Kentucky-ai/opentakeoff/demo`.
- `va-site-utilities`: U.S. VA C-300 civil/site plan published in `Kentucky-ai/opentakeoff/evals`.

Upstream repos are MIT and Apache-2.0 respectively, but software licenses **do not necessarily cover third-party project drawings**. Publicly posted VA construction drawings should not be assumed free of all copyrights or security restrictions. Therefore **do not commit or redistribute the VA PDF bytes**. The downloader retrieves them from pinned upstream commits only for tests, locally and in CI.

## Reproduce

Node.js 22 or later. From the OPDF repository root:

1. `npm ci`
2. `node scripts/fixtures/fetch-real-cad-pdfs.mjs`
3. `npx playwright install chromium --with-deps` (Linux; on Windows or macOS use `npx playwright install chromium`)
4. `OPDF_REAL_CAD_FIXTURES_DIR=.opdf-cad-fixtures npx playwright test -c playwright.server.config.ts tests/server-e2e/real-cad-corpus.spec.ts --project=chromium`

On Windows PowerShell, set `$env:OPDF_REAL_CAD_FIXTURES_DIR='.opdf-cad-fixtures'` separately before running Playwright.

The fixture manifest pins the upstream Git commit, each PDF byte count and git blob SHA-1. The fetch script checks all three and the PDF magic bytes; a changed or inaccessible source **fails** instead of silently testing different bytes.

Downloaded PDFs are stored under `.opdf-cad-fixtures/` and ignored by git. The GitHub Actions workflow `Public CAD PDF Corpus` runs when these tests change, manually, and weekly. Playwright traces stay on ephemeral runners and are not uploaded: trace archives can contain PDF request/response bytes. GitHub Actions logs still report test failures and load timings. The CI gate runs all three PDFs **twice with zero retries**, including when the native editing, renderer, or Save code changes, to expose intermittent behavior.

## Coverage and limitations

The three references exercise A0 layout, authentic CAD-style engineering linework, and real PDF labels with inline text editing/Save/reopen. They are not necessarily 110 MB, nor do they guarantee the same embedded fonts, 27,711-vector page, or bug as HCHN-SA-GR 1.pdf. Failures on third-party PDFs should be triaged before merging changes in the editor. Use a scrubbed copy of the original file as a separate private benchmark when possible.
