# Remote PDF rendering for mobile and low-memory clients

This is an **opt-in** server feature (off by default). It never changes the normal
EmbedPDF/PDFium desktop renderer. Enable it only after installing the native
worker dependencies and testing with representative large vector CAD drawings.

## Install (Windows PowerShell)

```powershell
py -m pip install "PyMuPDF>=1.24,<2" "Pillow>=10,<13"
$env:TPDF_REMOTE_RENDER_ENABLED="1"
$env:TPDF_RENDER_WORKERS="1"
$env:TPDF_RENDER_CACHE_MB="64"
$env:TPDF_RENDER_QUEUE_MAX="64"
npm run server-build
npm run server-start
```

The server's `TPDF_PYTHON_PATH` applies to this worker too. `TPDF_RENDER_WORKER_SCRIPT`
overrides the default Python worker path. Install Python and dependencies on
the **server**, not on the phone. With rendering enabled, the application
auto-selects lightweight tile viewing on narrow screens for stored documents.
The floating button can switch between full and lightweight modes.

## Server API

Authenticated and project-scoped:
- `GET /api/tpdf/documents/{id}/render/meta` gives page sizes.
- `GET /api/tpdf/documents/{id}/render/tile?page=0&level=1&x=0&y=0` gives a clipped WebP tile.
- `GET /api/tpdf/documents/{id}/render/text?page=0` gives capped extracted text.

Levels: 0.25, 0.5, 1, 2, 4, 8. Tiles: 512 input pixels per dimension.
Tiles are generated only on demand. Cache is bounded per application instance
and keyed by document path, size, mtime, page and tile parameters. The
existing TPDF authentication and per-project document resolution apply before
any native process can access the file. The browser never receives raw PDF
bytes in lightweight mode.

## Resource controls and limitations

- The Node dispatcher deduplicates identical in-flight render requests and
  limits queued jobs and native Python workers.
- Workers are recycled after a configurable number of jobs. Rendering timeouts
  kill a stuck worker; 429 means the queue is saturated.
- `TPDF_RENDER_WORKERS` (1-3) caps concurrent native render processes;
  `TPDF_RENDER_WORKER_RECYCLE` (default 96) limits task count.
- `TPDF_RENDER_TIMEOUT_MS` (default 45000) bounds stuck work, not an
  OS-level memory limit. Deploy under Windows Job Objects / process memory
  limits or equivalent OS controls for strict RSS caps.
- Dynamic per-request tile generation avoids precomputing enormous A0/A1
  images. Shared memory caches are **per server instance**, not shared
  across separate TPDF server nodes.
- Unsupported password-protected PDFs and missing Python dependencies return
  errors instead of changing or exposing the original PDF.
- The lightweight viewer is a read-oriented drawing browser; content edits,
  vector-accurate measurements and annotations still require the full viewer.
  Switching to full viewer retains the unchanged original PDF.
- This is not yet a performance certification for 10-20 concurrent sessions
  or a 200MB phone-memory budget. Test on physical Android/iOS devices,
  representative 100-500MB construction drawings, and under a load generator.

## Regression checklist

1. With remote mode disabled, all existing desktop tests remain unchanged.
2. With remote mode enabled, a user outside the document's project must get 404.
3. Opening the same tile concurrently must share work and respect cache bounds.
4. Replacing the PDF invalidates tiles (size/mtime key).
5. A failed worker returns 503 and server remains responsive.
6. Compare high-zoom tiles with the original PDF; test rotation and crop boxes.
7. Check actual mobile peak memory, pinch gestures, pan performance and
   network reconnection before enabling broadly.

Rollback: unset `TPDF_REMOTE_RENDER_ENABLED` and restart the server.


## Issue #168: progressive large server PDFs (October 2026)

The server's `Accept-Ranges: bytes` support does **not** mean EmbedPDF/PDFium
2.15.1 progressively renders via HTTP Range. Do not use `rangeReads` as the
browser's progressive-rendering capability. The normal EmbedPDF URL engine
can issue a full-file GET; this is a documented fallback, **not** a first-page
performance path.

For server-stored files >=100 MiB, the web UI first performs a HEAD metadata
request and checks `/api/tpdf/health`. It does not mount the full PDFium
viewer while these requests are pending. When `remoteRendering` is true the
web reader uses on-demand 512px tiles with viewport-sized overscan and at most
96 simultaneously mounted images. Moving pages/zooming discards out-of-view
image elements. Explicit editing/full-viewer actions may download the complete
PDF. Local file rendering and edit/save behavior are unchanged.

The renderer remains **off by default**. To enable it on Ubuntu, install Python,
PyMuPDF and Pillow in the **same interpreter used by the service**:

```bash
python3 -m pip install "PyMuPDF>=1.24,<2" "Pillow>=10,<13"
export TPDF_REMOTE_RENDER_ENABLED=1
export TPDF_PYTHON_PATH=python3
export TPDF_RENDER_WORKERS=1
export TPDF_RENDER_CACHE_MB=64
npm run server-build
npm run server-start
```

The worker must pass an independent import probe (`python3 -u
server/workers/remote_pdf_worker.py --probe`) before `remoteRendering` and
`rangePreview` are reported true in health. With the flag off, a missing
Python executable, or missing native dependencies, the capabilities remain
false. A large file without a healthy renderer shows a clear **opt-in** full
download button rather than unexpectedly fetching the entire file. Worker
errors while viewing likewise offer a manual full-viewer fallback. Monitor
renderer worker memory separately from Node cache and enforce OS-level RSS
limits as described above.

### Safe, repeatable Ubuntu acceptance (user-run, no production documents)

```bash
npm ci
npm run typecheck
npm run server-build
node --test tests/cli/remote-render.test.mjs
npm run server-smoke
npm run perf:pdf -- --mb 120 --pages 182 --out /tmp/tpdf-168-fixture.pdf
```

Use your **local** authenticated TPDF server to upload this generated fixture.
Do **two independent cold browser opens**, clearing document cache/network
state between them. Record `performance.now()` at navigation and first visible
tile, total transferred bytes at first tile, requests to document vs
`/render/meta` and `/render/tile`, scrolling to page 150, zoom x4, and
browser/server peak RSS. A 120MB fixture here is mostly PDF comments used to
exercise transfer size; also test a separately generated image-heavy and
vector-heavy corpus to measure actual render CPU/RSS. The acceptance test
must not observe a full GET before page 1, nor any second full download during
scroll/zoom. Confirm unauthenticated and cross-project render endpoints remain
inaccessible; confirm local PDF, text edit, save and reopen.

Check the raw document Range endpoint independently with an authenticated
synthetic fixture: `Range: bytes=0-1023` should return HTTP 206,
`Content-Range: bytes 0-1023/<total>` and exactly 1024 body bytes.
A successful 206 verifies server transport **only**; it does not establish
that PDFium consumes Range. If the render worker is disabled or unhealthy,
health must report `remoteRendering: false` and the UI must require consent
before a large/unknown-size full fetch.

Rollback: set `TPDF_REMOTE_RENDER_ENABLED=0`, restart, and use full viewing
explicitly for large documents.
