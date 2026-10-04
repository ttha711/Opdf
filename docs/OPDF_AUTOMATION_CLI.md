# OPDF Automation CLI

`opdf` is the semantic browser-automation interface for OPDF. It is designed for AI agents, local debugging, GitHub Actions, production smoke tests, and repeatable UI audits.

The CLI deliberately avoids brittle CSS coordinates. OPDF exposes stable `data-opdf-*` hooks and the driver falls back to accessible browser controls only where the embedded PDF viewer owns the UI.

## Setup

```bash
npm ci
npx playwright install chromium
```

Run from the repository:

```bash
npm run opdf -- --help
```

After `npm link`, the same command is available as:

```bash
opdf --help
```

The target URL defaults to `http://127.0.0.1:8787`. Set `OPDF_URL` or pass `--url` for a deployed site.

## Core commands

Open/check a deployment without loading a PDF:

```bash
opdf open https://pdf.vivutrade.io.vn/ --json
```

Inspect the current application state:

```bash
opdf inspect --url https://pdf.vivutrade.io.vn/ --json
```

Load a PDF and return viewer state:

```bash
opdf document load ./sample.pdf --url https://pdf.vivutrade.io.vn/ --json
```

Navigate and zoom:

```bash
opdf page goto 3 --pdf ./sample.pdf --url https://pdf.vivutrade.io.vn/
opdf zoom set 125 --pdf ./sample.pdf --url https://pdf.vivutrade.io.vn/
```

Discover supported semantic tool aliases:

```bash
opdf tool list --json
```

Open semantic tools:

```bash
opdf tool open split --pdf ./sample.pdf
opdf tool open merge --pdf ./sample.pdf
opdf tool open page-numbers --pdf ./sample.pdf
opdf tool open watermark --pdf ./sample.pdf
opdf tool open measure --pdf ./sample.pdf
```

Open a top menu:

```bash
opdf menu open Tools --pdf ./sample.pdf
```

AI Copilot:

```bash
opdf ai open --pdf ./sample.pdf
opdf ai ask "summarize this document" --pdf ./sample.pdf
```

Capture diagnostics:

```bash
opdf screenshot ./artifacts/viewer.png --pdf ./sample.pdf
opdf console --pdf ./sample.pdf --json
```

## Inspect output

`opdf inspect --json` returns stable machine-readable state:

```json
{
  "ok": true,
  "document": {
    "hasDocument": true,
    "page": 1,
    "totalPages": 3,
    "zoom": 1,
    "activeTool": "select",
    "saveState": "saved"
  },
  "viewer": {
    "visible": true,
    "width": 1080,
    "height": 820,
    "renderedSurfaces": []
  },
  "navigation": {
    "thumbnailCount": 3,
    "opdfThumbnailPanels": 1,
    "embedPdfSidebarVisible": false
  },
  "panels": ["pages", "document"],
  "errors": {
    "console": [],
    "network": []
  }
}
```

The exact rendered-surface array depends on EmbedPDF/PDFium and can contain image or canvas surfaces.

## Production audits

Smoke audit:

```bash
opdf audit smoke \
  --url https://pdf.vivutrade.io.vn/ \
  --out opdf-cli-artifacts \
  --trace opdf-cli-artifacts/trace.zip
```

Full non-destructive audit:

```bash
opdf audit full \
  --url https://pdf.vivutrade.io.vn/ \
  --out opdf-cli-artifacts \
  --trace opdf-cli-artifacts/trace.zip \
  --json
```

Disposable production E2E:

```bash
opdf audit e2e \
  --url https://pdf.vivutrade.io.vn/ \
  --timeout 120000 \
  --out opdf-cli-artifacts \
  --trace opdf-cli-artifacts/trace.zip \
  --video-dir opdf-cli-artifacts/video \
  --json
```

The `e2e` mode always generates dedicated disposable PDFs. It executes real operations against those test documents only: split download, merge download, page insertion, watermark, page numbers, header, footer, Bates numbering, compression, annotation/export, secure redaction, OCR, and a deterministic local AI Copilot response. Downloaded PDFs are parsed again and validated for page count/content invariants. It never intentionally selects a user document for destructive testing.

If `--pdf` is omitted, the CLI generates a small three-page test PDF automatically. In OPDF Server mode that upload may appear in server recents, so use a staging deployment for high-frequency scheduled audits or periodically clean audit documents.

The smoke audit verifies:

- a PDF loads and page count is available;
- the main PDF surface renders rather than remaining blank;
- exactly one OPDF thumbnail rail is present;
- the internal EmbedPDF sidebar is not visible;
- page navigation works;
- numeric zoom works;
- File and Tools menus open;
- browser console and network failures are empty.

The full audit adds non-destructive checks for docked tools, dialogs, AI Copilot, and theme switching. It opens tool UIs but does not apply destructive document operations.

The e2e audit adds real operations on generated test documents and captures a screenshot after every check. Failures still attempt to save evidence so the artifact bundle remains useful for debugging.

## GitHub Actions

Use **Actions → OPDF Production Audit → Run workflow**.

Inputs:

- target URL (default: `https://pdf.vivutrade.io.vn/`);
- `smoke`, `full`, or `e2e` (default: `e2e`).

If production is behind Cloudflare Access, configure repository Actions secrets `OPDF_CF_ACCESS_CLIENT_ID` and `OPDF_CF_ACCESS_CLIENT_SECRET`. For another authenticated reverse proxy, `OPDF_E2E_HEADERS_JSON` can contain a JSON object of request headers. These values are passed to the browser context and are not written to the report.

On `main`, **OPDF Production E2E** is triggered automatically after the **CI** workflow completes successfully. The web build embeds its Git commit SHA in `<meta name="opdf-build-sha">`. The production audit waits until the live domain reports the exact tested SHA before it starts the browser suite, preventing a fast GitHub runner from accidentally validating an older deployment. Manual runs remain available.

The workflow uploads:

- `report.json`;
- `console.log`;
- a screenshot for every audit check;
- generated disposable PDFs;
- downloaded/exported output PDFs;
- Playwright `trace.zip`;
- Playwright video.

This is intentionally separate from localhost CI. It tests the actual deployed website after deployment.

## Exit codes

- `0`: command/audit completed successfully.
- non-zero: invalid arguments, browser failure, assertion failure, console error, or network failure.

For agents, prefer `--json` and use the process exit code as the primary success signal.
