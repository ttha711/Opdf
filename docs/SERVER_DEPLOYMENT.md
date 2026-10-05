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

Use Cloudflare Access in front of OPDF for Internet-facing deployments. OPDF can also enforce application-level token authentication or consume the authenticated Cloudflare Access email identity as described below.

## Data directory

With authentication disabled, the legacy layout remains unchanged:

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

When multi-user authentication is enabled, PDF blobs keep stable UUID paths under `documents/`, while ownership is enforced from `meta.json`. User/project state is isolated under:

```
OPDF_DATA_DIR/
  documents/
    <uuid>/
      document.pdf
      meta.json        # ownerId + projectId
      annotations.json
  tenants/
    <user-id>/
      certificates/
      projects/
        <project-id>/
          recents.json
          session.json
          ocr/
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
npm run server-auth-smoke
```

The normal GitHub CI runs all three server gates after the workspace build. The auth smoke verifies login/session cookies, user and project isolation, quota rejection, and Cloudflare Access identity allowlisting.

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

## Server P12/PFX signing

OPDF Server can use the same detached PKCS#7 signing engine as Desktop. Server signing is disabled until encrypted certificate storage is configured.

Set a strong server-only secret before starting OPDF:

```powershell
$env:OPDF_CERTIFICATE_MASTER_KEY="<at-least-16-characters, preferably a long random secret>"
npm run server-start
```

Certificate handling rules:

- uploaded P12/PFX bytes are inspected before storage;
- certificate bytes are encrypted at rest with AES-256-GCM;
- the encryption key is derived from `OPDF_CERTIFICATE_MASTER_KEY` and is never written under `OPDF_DATA_DIR`;
- the P12/PFX passphrase is used only for inspection/signing and is never stored;
- identical certificate files are deduplicated by SHA-256 fingerprint;
- deleting a stored certificate removes its encrypted envelope and metadata;
- PDF signature inspection remains conservative and does not claim OS trust-chain or revocation validation.

Stored certificate data lives under:

```
OPDF_DATA_DIR/
  certificates/
    <uuid>/
      certificate.json
      meta.json
```

For remote use, keep the same-origin API behind HTTPS and configure reverse proxies not to log the `X-OPDF-Options` header because it carries the transient certificate passphrase during signing.

## Multi-user authentication, projects, and quotas

Authentication is backward compatible and disabled by default:

```powershell
$env:OPDF_AUTH_MODE="disabled"
```

### Token mode

Token mode is suitable for a private family/team deployment where OPDF itself owns the login boundary. Configure a JSON object keyed by long random bearer tokens:

```powershell
$env:OPDF_AUTH_MODE="token"
$env:OPDF_AUTH_TOKENS='{
  "replace-with-a-long-random-token-1": {
    "userId": "alice",
    "displayName": "Alice",
    "quotaBytes": 5368709120,
    "projects": ["default", "home"]
  },
  "replace-with-a-long-random-token-2": {
    "userId": "bob",
    "displayName": "Bob",
    "quotaBytes": 2147483648,
    "projects": ["default"]
  }
}'
npm run server-start
```

The root URL shows the OPDF sign-in page until a valid token is entered. After login, OPDF stores the token in an `HttpOnly; SameSite=Strict` session cookie so PDFium range requests authenticate without exposing the token to application JavaScript. HTTPS deployments also receive the `Secure` cookie flag.

### Cloudflare Access mode

When Cloudflare Access already protects the Tunnel, OPDF can use the authenticated email header as its application identity:

```powershell
$env:OPDF_AUTH_MODE="cloudflare"
$env:OPDF_CLOUDFLARE_ALLOWED_EMAILS="alice@example.com,bob@example.com"
npm run server-start
```

Keep the OPDF origin bound to `127.0.0.1` or otherwise prevent direct bypass of Cloudflare Access. In this mode OPDF trusts the identity header supplied by the Access-protected reverse-proxy boundary.

### Projects and isolation

Each authenticated request resolves exactly one user and one active project. Documents, annotations, Recents, sessions, OCR jobs, and signing certificate storage are scoped so another user or project receives a normal 404 instead of learning that a UUID exists elsewhere.

The header account menu shows:

- signed-in identity;
- active project;
- used storage vs quota;
- available projects;
- project creation/switching;
- Sign out in token mode.

Switching projects reloads the workspace so tabs/Recents/session state are restored from the selected project only.

### Storage quotas

The default authenticated-user quota is 5 GiB:

```powershell
$env:OPDF_DEFAULT_USER_QUOTA_BYTES="5368709120"
```

Token entries can override `quotaBytes` per user. Resumable uploads are rejected before an upload session is created when the declared total would exceed quota. Normal uploads and replacements also check `Content-Length` before accepting the body and re-check the actual final byte count before persistence.

Authentication-disabled legacy mode intentionally bypasses quotas so existing single-user deployments retain their current behavior.

## Next server phase

After OCR, encrypted signing, and multi-user isolation, the remaining production server phase is:

1. S3-compatible object storage for multi-node deployments.


## Office to PDF conversion

Word, Excel, PowerPoint, RTF, and text files can be converted to PDF through the OPDF Server. This path uses LibreOffice in headless mode so the output contains the real source document content rather than a browser-side approximation.

Install LibreOffice on the server and make sure the `soffice` executable is available on `PATH`. On Windows, if it is not on `PATH`, configure the full executable path before starting OPDF Server:

```powershell
$env:OPDF_LIBREOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
npm run server-start
```

If LibreOffice is missing, OPDF returns an explicit conversion error and does not create a placeholder PDF.
