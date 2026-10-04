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

## Upload size

Default maximum PDF upload size:

```
750 MiB
```

Override it in bytes:

```powershell
$env:OPDF_MAX_UPLOAD_BYTES="1073741824"
```

The upload path streams directly to disk rather than buffering the entire request in Node memory.

## Build and verification

```powershell
npm ci
npm run server-build
npm run server-smoke
```

The normal GitHub CI also runs `server-smoke` after the workspace build.

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

## Next server phases

The server bridge is designed so native/server workers can be added without changing the main UI. The next logical migrations are:

1. Server OCR job queue with searchable-PDF output.
2. Server-side P12/PFX signing policy and certificate storage.
3. Multi-user authentication, authorization, quotas, and per-user/project storage.
4. S3-compatible object storage for multi-node deployments.


## Office to PDF conversion

Word, Excel, PowerPoint, RTF, and text files can be converted to PDF through the OPDF Server. This path uses LibreOffice in headless mode so the output contains the real source document content rather than a browser-side approximation.

Install LibreOffice on the server and make sure the `soffice` executable is available on `PATH`. On Windows, if it is not on `PATH`, configure the full executable path before starting OPDF Server:

```powershell
$env:OPDF_LIBREOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
npm run server-start
```

If LibreOffice is missing, OPDF returns an explicit conversion error and does not create a placeholder PDF.
