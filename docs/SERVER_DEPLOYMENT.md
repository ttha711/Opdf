# OPDF Server Deployment

OPDF can run as a browser-first PDF workspace while keeping the Electron desktop runtime available.

## Architecture

```
Browser
  -> OPDF Web UI (apps/web)
  -> /api/opdf
  -> OPDF Server (Node 22)
  -> OPDF_DATA_DIR/documents
```

The same React UI selects its runtime bridge automatically:

- Electron: `window.opdf` preload bridge.
- OPDF Server: same-origin HTTP bridge at `/api/opdf`.
- Plain browser development: local/mock bridge.

## What server mode currently persists

- Uploaded PDFs.
- Range-readable PDF storage for large files.
- Save back to the server with Ctrl+S.
- Annotation/review state.
- Recent documents.
- Session metadata.

PDF transforms that already run safely in the browser continue to use the shared web implementation. Desktop-only/native conversions remain desktop-only until they receive dedicated server workers.

## Windows Server without Docker

Requirements:

- Node.js 22 or newer.
- Git.
- Python 3.11+ when PDF-to-DOCX/PPTX/XLSX server conversion is required.
- Optional Cloudflare Tunnel for HTTPS/domain access.

From PowerShell:

```powershell
git clone https://github.com/ttha711/Opdf.git
cd Opdf
npm ci
npm run server-build

$env:OPDF_DATA_DIR="D:\OPDF\data"
$env:OPDF_PORT="8787"
npm run server-start
```

The server binds to `127.0.0.1` by default. This is deliberate and is the recommended mode when using Cloudflare Tunnel.

Open locally:

```
http://127.0.0.1:8787
```

To listen directly on the LAN instead:

```powershell
$env:OPDF_HOST="0.0.0.0"
npm run server-start
```

Only use `0.0.0.0` when the Windows firewall and upstream network controls are configured appropriately.

## Cloudflare Tunnel

For a quick tunnel to the loopback server:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

For a permanent hostname, point the Cloudflare Tunnel service at:

```
http://127.0.0.1:8787
```

Use Cloudflare Access (or another authenticated reverse proxy) in front of OPDF before exposing it to users. The first server-runtime phase intentionally does not implement user accounts or application-level authorization yet.

## Data directory

The server creates:

```
OPDF_DATA_DIR/
  documents/
    <uuid>/
      document.pdf
      meta.json
      annotations.json
  recents.json
  session.json
```

Set `OPDF_DATA_DIR` outside the Git checkout for production so upgrades do not touch user data.

## Server PDF workers

Server mode now routes these operations through the Node backend instead of the browser:

- QPDF compression.
- AES-256 PDF encryption.
- PDF decryption.

These endpoints reuse the same `@opdf/core` `DocumentService` used by Desktop, so the PDF engine is not duplicated.

The operation payload limit defaults to 250 MiB and can be changed independently from the persistent upload limit:

```powershell
$env:OPDF_MAX_OPERATION_BYTES="536870912"
```

Passwords for encryption/decryption are sent only to the same-origin OPDF API in an encoded request header. For remote deployments, keep OPDF behind HTTPS (for example Cloudflare Tunnel + Access) and do not configure proxies to log the `X-OPDF-Options` header.

## PDF to Office server worker

DOCX, PPTX, and XLSX conversion in server runtime is executed by a Python worker on the server. Install its dependencies once:

```powershell
py -m pip install -r server\requirements-office.txt
```

If `python` is not the command used by your installation:

```powershell
$env:OPDF_PYTHON_PATH="C:\Python311\python.exe"
```

The default converter is:

```
apps/desktop/tools/pdf_office_convert.py
```

It can be replaced without changing the web UI:

```powershell
$env:OPDF_OFFICE_CONVERTER_SCRIPT="D:\OPDF\workers\pdf_office_convert.py"
```

The worker receives paths and arguments through `spawn` without a shell. Conversion runs in a temporary directory and the temporary input/output files are removed after each request. Default timeout is 5 minutes; override it with `OPDF_OFFICE_WORKER_TIMEOUT_MS` if very large drawings require more time.

## Large PDF upload

Server-runtime file opening is **local-first**. After the browser file picker returns a PDF, OPDF passes the browser `File` directly to the PDFium viewer so the first pages can render immediately. Persistence to OPDF Server runs in the background and does not block viewing, scrolling, or zooming.

Background persistence uses resumable chunk uploads:

- default chunk size: **8 MiB**;
- browser upload concurrency: **4 parallel chunks**;
- each chunk retries independently;
- chunks may reach the server out of order;
- the server assembles the exact byte stream only after every chunk is present;
- a PDF is added to Recents only after assembly succeeds;
- cancelling or failing an upload does not remove the local viewer source.

Default maximum PDF upload size:

```
750 MiB
```

Override it in bytes:

```powershell
$env:OPDF_MAX_UPLOAD_BYTES="1073741824"
```

The server chunk size can also be adjusted. Keep it well below any reverse-proxy request-size limit:

```powershell
$env:OPDF_UPLOAD_CHUNK_BYTES="8388608"
```

For Cloudflare Tunnel and large A0/A1 drawing sets, the default 8 MiB chunks with four browser workers are the recommended starting point. Node only buffers individual chunks, not the full PDF. Temporary chunks are never exposed through Recents; the finalized `document.pdf` is range-readable after assembly.

## Build and verification

```powershell
npm ci
npm run server-build
npm run server-smoke
npm run server-reliability
```

The normal GitHub CI runs both `server-smoke` and `server-reliability` after the workspace build. The reliability audit verifies restart persistence, failed-save isolation, failed-upload cleanup, and safe fallback for corrupt session/annotation JSON.

## Production process

For a simple Windows deployment, run `npm run server-start` under a process supervisor or Windows service wrapper so it restarts after reboot or a crash.

Recommended production boundary:

```
Internet
  -> Cloudflare Access
  -> Cloudflare Tunnel
  -> 127.0.0.1:8787
  -> OPDF Server
```

Do not expose port 8787 directly to the public Internet.

## Server OCR queue

Server runtime now executes searchable-PDF OCR as a background job instead of blocking the browser thread.

The flow is:

```
Browser
  -> create OCR job
  -> upload current PDF to the OCR job
  -> server queue (default concurrency: 1)
  -> PDFium renders only pages that need OCR
  -> Tesseract.js recognizes text
  -> pdf-lib writes a nearly invisible searchable text layer
  -> browser downloads the completed searchable PDF
```

Pages that already contain native PDF text are skipped. This reduces work on mixed documents where only some pages are scanned.

Default OCR language is English + Vietnamese with an English fallback. Tesseract language data may be downloaded on first use, so the server should have outbound Internet access for the first OCR run unless its Tesseract cache is already populated.

The queue runs one job at a time by default to avoid large scan sets exhausting RAM. For a machine with enough memory, increase it to at most two concurrent jobs:

```powershell
$env:OPDF_OCR_CONCURRENCY="2"
npm run server-start
```

The server exposes OCR job progress and cancellation through the same-origin OPDF API. Completed OCR output is stored under `OPDF_DATA_DIR\ocr` while the server is running.

## Next server phases

The server bridge is designed so native/server workers can be added without changing the main UI. After server OCR, the next logical migrations are:

1. Server-side P12/PFX signing policy and certificate storage.
2. Multi-user authentication, authorization, quotas, and per-user/project storage.
3. S3-compatible object storage for multi-node deployments.


## Office to PDF conversion

Word, Excel, PowerPoint, RTF, and text files can be converted to PDF through the OPDF Server. This path uses LibreOffice in headless mode so the output contains the real source document content rather than a browser-side approximation.

Install LibreOffice on the server and make sure the `soffice` executable is available on `PATH`. On Windows, if it is not on `PATH`, configure the full executable path before starting OPDF Server:

```powershell
$env:OPDF_LIBREOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
npm run server-start
```

If LibreOffice is missing, OPDF returns an explicit conversion error and does not create a placeholder PDF.
