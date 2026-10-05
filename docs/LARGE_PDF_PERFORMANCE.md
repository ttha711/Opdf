# Large PDF Performance Harness

OPDF keeps giant binary fixtures out of Git. Generate stress PDFs locally instead.

## Generate drawing-set stress files

```bash
npm run perf:pdf -- --mb 50 --pages 150
npm run perf:pdf -- --mb 250 --pages 300
npm run perf:pdf -- --mb 500 --pages 500
```

Custom output path:

```bash
npm run perf:pdf -- --mb 250 --pages 300 --out tmp/structural-250mb.pdf
```

The generator creates A1-landscape vector/text drawing pages, then pads the file using legal trailing PDF comments to exercise source-byte handling without storing huge binaries in the repository.

## Manual acceptance checks

For 250 MB and 500 MB files, record:

- time until the first sheet is visible
- time until pan/zoom is responsive
- memory after opening
- memory after navigating through at least 100 sheets
- memory after closing the document
- Ctrl/Cmd+wheel zoom behavior
- Space/middle-mouse pan behavior
- thumbnail responsiveness
- export/large mutation behavior

Expected invariant: scrolling through more sheets must not cause raster/text memory to grow without bound. Rendered rasters are limited to a small LRU window and text items are retained only for the active sheet.

CI also generates a 120-sheet vector drawing set in memory and verifies that the browser can open it and navigate directly to sheet 100.

## Real-world engineering PDF gate

Run the public WSDOT engineering corpus against the server runtime:

```bash
npm run server-build
npx playwright install chromium
npm run perf:real-world
```

The gate currently checks two public engineering documents and records transfer behavior, page count, searchability, and persistence. The browser must remain on the stable EmbedPDF/PDFium viewer shell; large files must not switch back to the legacy range-only viewer.

Current first-page budgets on GitHub-hosted Linux runners:

- WSDOT E-20.20-00 Buried Structure Three-Sided: **60 seconds**
- WSDOT Plans Preparation Manual M22-31: **120 seconds**

The structural mutation case must also complete and persist within **30 seconds**. Results are written into the GitHub Actions job summary.

The deterministic 100/250/500 MB generated stress gate remains separate from this external corpus. The external workflow also runs weekly so upstream document or engine regressions are visible even when application code has not changed.

