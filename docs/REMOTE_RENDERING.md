# Remote PDF rendering for mobile and low-memory clients

This is an **opt-in** server feature (off by default). It never changes the normal
EmbedPDF/PDFium desktop renderer. Enable it only after installing the native
worker dependencies and testing with representative large vector CAD drawings.

## Install (Windows PowerShell)

```powershell
py -m pip install "PyMuPDF>=1.24,<2" "Pillow>=10,<13"
$env:OPDF_REMOTE_RENDER_ENABLED="1"
$env:OPDF_RENDER_WORKERS="1"
$env:OPDF_RENDER_CACHE_MB="64"
$env:OPDF_RENDER_QUEUE_MAX="64"
npm run server-build
npm run server-start
```

The server's `OPDF_PYTHON_PATH` applies to this worker too. `OPDF_RENDER_WORKER_SCRIPT`
overrides the default Python worker path. Install Python and dependencies on
the **server**, not on the phone. With rendering enabled, the application
auto-selects lightweight tile viewing on narrow screens for stored documents.
The floating button can switch between full and lightweight modes.

## Server API

Authenticated and project-scoped:
- `GET /api/opdf/documents/{id}/render/meta` gives page sizes.
- `GET /api/opdf/documents/{id}/render/tile?page=0&level=1&x=0&y=0` gives a clipped WebP tile.
- `GET /api/opdf/documents/{id}/render/text?page=0` gives capped extracted text.

Levels: 0.25, 0.5, 1, 2, 4, 8. Tiles: 512 input pixels per dimension.
Tiles are generated only on demand. Cache is bounded per application instance
and keyed by document path, size, mtime, page and tile parameters. The
existing OPDF authentication and per-project document resolution apply before
any native process can access the file. The browser never receives raw PDF
bytes in lightweight mode.

## Resource controls and limitations

- The Node dispatcher deduplicates identical in-flight render requests and
  limits queued jobs and native Python workers.
- Workers are recycled after a configurable number of jobs. Rendering timeouts
  kill a stuck worker; 429 means the queue is saturated.
- `OPDF_RENDER_WORKERS` (1-3) caps concurrent native render processes;
  `OPDF_RENDER_WORKER_RECYCLE` (default 96) limits task count.
- `OPDF_RENDER_TIMEOUT_MS` (default 45000) bounds stuck work, not an
  OS-level memory limit. Deploy under Windows Job Objects / process memory
  limits or equivalent OS controls for strict RSS caps.
- Dynamic per-request tile generation avoids precomputing enormous A0/A1
  images. Shared memory caches are **per server instance**, not shared
  across separate OPDF server nodes.
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

Rollback: unset `OPDF_REMOTE_RENDER_ENABLED` and restart the server.
