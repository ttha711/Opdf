# OPDF

Offline-first PDF desktop app with a web-first development workflow. OPDF targets large technical PDFs, drawing review, local document operations, and an Electron desktop runtime with a constrained preload bridge.

## Current capabilities

### PDF viewing and large-document workflow
- Web-first PDFium/WASM rendering through the MIT-licensed EmbedPDF viewer.
- Virtualized continuous scrolling and virtualized thumbnails for large drawing sets.
- Progressive URL loading in the drop-in viewer; OPDF Server documents are passed to the viewer by URL instead of being copied into a full browser Blob first.
- Native viewer zoom, fit-page/fit-width, rotation, search, forms, annotations, redaction, selection, and export are available through the PDFium plugin registry.
- OPDF Save/Export/document tools materialize the current PDFium working copy first so viewer edits are preserved.
- Large-PDF regression and server E2E coverage require the PDFium/WASM viewer for many-sheet technical documents.

### Document operations
- Merge, split, insert, delete, reorder, rotate, crop, watermark, header/footer, and page-number operations.
- QPDF/WASM optimization/compression.
- Export PDF pages to images.
- AcroForm inspection/filling with optional flattening.
- Hierarchical PDF outlines/bookmarks.
- External URI links and internal page GoTo links.

### Review and technical drawings
- Fabric-based annotations and flattened PDF export.
- Compare Revisions V2 with alignment, sensitivity control, change regions, navigation, and report export.
- Calibrated distance, perimeter, and area measurement.
- Review replies, resolve/reopen state, filters, and page navigation.
- Full-document text search and secure raster redaction. Pages containing selected redactions are rasterized after blacking out the selected text regions; unaffected pages remain copied as PDF pages.

### Signatures
- Visible local signatures.
- Desktop P12/PFX cryptographic signing using detached PKCS#7.
- Certificate metadata inspection.
- Existing PDF signature inspection for ByteRange/CMS structure and later revisions.

Signature inspection is intentionally conservative: it reports structure and certificate metadata but does **not** claim operating-system trust-chain or full cryptographic validation.

### OCR and AI/editor components
- Local OCR via Tesseract.js.
- Optional AI/provider integrations are configured separately through environment variables.
- The repository also contains the OPDF editor workspace used by document-editing workflows.

## Workspace

- `apps/web`: React + Vite + PDF.js viewer and review UI.
- `apps/desktop`: Electron runtime, local file operations, signing, and secure preload bridge.
- `apps/editor`: document/editor workspace and supporting server routes.
- `packages/core`: shared PDF, annotation, OCR, and storage services.

## Requirements

- Node.js **22 or newer**.
- npm, using the committed lockfile.
- Platform dependencies required by Electron packaging.
- LibreOffice/Python are optional and only required by conversion paths that explicitly use them.

## Server / browser runtime

OPDF now supports a server runtime in addition to Electron Desktop. The same `apps/web` UI automatically selects an HTTP bridge when served by OPDF Server.

```bash
npm ci
npm run server-build
npm run server-start
```

Default address: `http://127.0.0.1:8787`.

Server mode streams PDF uploads to disk, supports HTTP Range reads for large PDFs, serves WebAssembly with the correct MIME type, persists recents/session metadata, and sends Ctrl+S saves back to server storage. Persisted server PDFs stay URL-backed in the browser until an editing/conversion action explicitly needs complete document bytes. Keep the server on loopback behind Cloudflare Tunnel/Access or another authenticated reverse proxy for remote use.

See `docs/SERVER_DEPLOYMENT.md` for Windows Server, data-directory, Cloudflare Tunnel, upload-limit, and production guidance.

## Development

```bash
npm ci
npm run web-dev
```

In another terminal:

```bash
npm run desktop-dev
```

The desktop development command uses a local web dev server. Do not treat development localhost URLs as production update infrastructure.

## Verification

Run the same main gates used by CI:

```bash
npm ci
npm run typecheck
npm run test -w @opdf/web
npm run build
node apps/desktop/dist/main/pdf-signature.smoke.js
npx playwright test --project=chromium
```

GitHub CI runs these gates before changes are merged. The release workflow re-runs verification before desktop packaging.

## Build and package

```bash
npm run build
npm run desktop-package
```

Electron Builder targets:
- Windows: NSIS
- macOS: DMG
- Linux: AppImage

The GitHub release workflow packages all three platforms. A `vX.Y.Z` tag is configured to publish the resulting artifacts as a GitHub Release.

## Desktop security defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Renderer access to privileged operations is limited to the `window.opdf` preload bridge.
- External renderer navigation is denied; HTTPS links are opened in the operating-system browser.
- Packaged hot-update URLs must use HTTPS.
- Hot-update packages must be same-origin with their manifest, remain within the configured size limit, and match the manifest SHA-256 before extraction.

## Hot-update manifest

Hot updates are **disabled unless** `OPDF_HOT_UPDATE_URL` is explicitly configured.

Expected manifest shape:

```json
{
  "version": "0.1.1",
  "url": "./web.zip",
  "sha256": "<64-character SHA-256 of web.zip>",
  "description": "Bug fixes and improvements."
}
```

Before publishing an update, replace the SHA placeholder with the digest of the exact `web.zip` being served. In packaged builds the manifest and package must be served over HTTPS from the same origin.

## Release state

The repository is release-gated through typecheck, unit tests, production builds, desktop signing smoke coverage, and Playwright E2E. Platform installers should still be validated on representative real machines before broad deployment, especially OS signing/notarization, LibreOffice/Python conversion paths, and organization-specific certificates.


## Web viewer architecture

The primary viewer is browser-only and does not depend on Electron/native rendering:

```
OPDF React shell
  -> EmbedPDF drop-in viewer
  -> PDFium WebAssembly
  -> virtualized page/thumbnail rendering
  -> OPDF Server URL / HTTP Range source
```

The former custom PDF.js page-raster/WebP path is no longer the primary viewer. PDF.js remains available to document-processing features that still need its parsing/text utilities.

For engineering/CAD workloads, validate performance with representative A0/A1 vector-heavy PDFs rather than file size alone. OPDF's E2E suite includes a generated many-sheet technical drawing set, but real 100-500+ MB project files remain the release benchmark.
