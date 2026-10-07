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

Use Cloudflare Access (or another authenticated reverse proxy) as an additional edge layer. OPDF can now enforce its own local multi-user accounts, project isolation, and per-user storage quotas.

## Data directory

With application authentication disabled, OPDF keeps the legacy single-user layout:

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

With multi-user authentication enabled, every user and project receives a separate storage root:

```
OPDF_DATA_DIR/
  auth/
    users.json
  users/
    <user-id>/
      projects/
        default/
          documents/
          ocr/
          certificates/
          recents.json
          session.json
        <project-id>/
          ...
```

A document UUID is resolved only inside the authenticated user's active project. Knowing another user's UUID is therefore not sufficient to access the document.

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

Application authentication is opt-in so existing loopback/single-user installations remain compatible. For production multi-user use, configure all of the following before first start:

```powershell
$env:OPDF_AUTH_MODE="local"
$env:OPDF_AUTH_SECRET="<at-least-32-random-characters>"
$env:OPDF_BOOTSTRAP_EMAIL="admin@example.com"
$env:OPDF_BOOTSTRAP_PASSWORD="<at-least-12-characters>"
$env:OPDF_DEFAULT_USER_QUOTA_BYTES="10737418240"
$env:OPDF_COOKIE_SECURE="1"
npm run server-start
```

On the first authenticated start, OPDF creates the bootstrap administrator. The bootstrap password is converted immediately to a salted scrypt password hash; plaintext passwords are not persisted. Session cookies are HttpOnly and SameSite=Strict. When OPDF is behind HTTPS, set `OPDF_COOKIE_SECURE=1` unless the reverse proxy reliably sends `X-Forwarded-Proto: https`.

Administrators can create users and adjust role/quota through the authenticated `/api/opdf/admin/users` API. User quotas cover the entire user's project tree. Resumable uploads are rejected before upload-session creation when the declared file size would exceed the remaining quota.

The default project is `default`. API clients may select another project with `X-OPDF-Project: <project-id>`. Project identifiers are restricted to letters, digits, underscore, and hyphen.

Run the dedicated isolation gate with:

```powershell
npm run server-auth-smoke
```

This verifies authentication, admin authorization, cross-user UUID isolation, cross-project isolation, and quota rejection.

## S3-compatible shared object storage

For multi-node document storage, configure an S3-compatible endpoint on every OPDF node:

```powershell
$env:OPDF_S3_ENDPOINT="https://s3.example.com"
$env:OPDF_S3_BUCKET="opdf-production"
$env:OPDF_S3_REGION="us-east-1"
$env:OPDF_S3_ACCESS_KEY_ID="<access-key>"
$env:OPDF_S3_SECRET_ACCESS_KEY="<secret-key>"
$env:OPDF_S3_PREFIX="opdf"
$env:OPDF_S3_PATH_STYLE="1"
npm run server-start
```

When these variables are present, S3-compatible storage becomes authoritative for PDF bytes, document metadata, annotations, recents/session state, encrypted certificate envelopes, and the application user database. Each node keeps only a disposable local cache and working files under `OPDF_DATA_DIR`. PDF cache entries are checked against the remote ETag before reuse.

Resumable PDF uploads use S3 multipart upload directly. Parts can therefore arrive through different OPDF nodes and still be resumed/completed safely. OPDF automatically enforces a minimum multipart chunk size of 5 MiB in S3 mode; the default remains 8 MiB.

Per-user quota is calculated from the shared object namespace plus the expected size of open multipart uploads. Pending resumable uploads reserve their declared size immediately, preventing users from opening several sessions that collectively exceed quota.

Run the object-storage gate with:

```powershell
npm run server-s3-smoke
```

The smoke test starts a disposable S3-compatible server, creates two independent OPDF cache roots, verifies cross-node document/annotation/session visibility, resumes a multipart upload on the second node, and reads the completed object back through the first node.

### Multi-node OCR note

Durable document state is shared across nodes, but the OCR execution queue is still process-local. If more than one OPDF application node serves OCR endpoints, route a job's create/run/status/output requests to the same node (sticky ingress), or keep OCR workers behind a single dedicated OPDF worker node. Shared S3 storage does not by itself turn the in-memory OCR scheduler into a distributed queue.

## Production server roadmap status

- M9: server OCR/searchable PDF — implemented.
- M10: encrypted P12/PFX signing — implemented.
- M11: multi-user auth, authorization, quotas, per-user/project storage — implemented and CI-gated.
- M12: S3-compatible shared object storage and cross-node resumable uploads — implemented and CI-gated.

The remaining production work is operational rather than a missing document-storage milestone: deployment secrets, real S3 credentials, HTTPS/Cloudflare configuration, backup/restore policy, representative load testing, and sticky/dedicated routing for process-local OCR jobs.


## Production hardening and operations

For an Internet-facing deployment behind Cloudflare Tunnel or another reverse proxy, set the canonical public origin and enable the proxy/security controls explicitly:

```powershell
$env:OPDF_PUBLIC_ORIGIN="https://pdf.example.com"
$env:OPDF_TRUST_PROXY="1"
$env:OPDF_HSTS="1"
$env:OPDF_LOGIN_RATE_MAX_ATTEMPTS="10"
$env:OPDF_LOGIN_RATE_WINDOW_MS="900000"
```

Only set `OPDF_TRUST_PROXY=1` when direct access to the OPDF origin is blocked and the trusted proxy is the component setting `X-Forwarded-For`. Otherwise a client could spoof its source address and weaken login throttling.

OPDF rejects browser mutation requests that declare a cross-site `Sec-Fetch-Site`, and when an `Origin` header is present it must match `OPDF_PUBLIC_ORIGIN` (or the request Host when no public origin is configured). Responses include frame-embedding, content-type, referrer, permissions, and optional HSTS guards.

The server exposes two unauthenticated orchestration endpoints:

- `GET /api/opdf/live` — process is alive.
- `GET /api/opdf/ready` — process is accepting traffic; it returns 503 while the server is draining.

When S3-compatible storage is configured, startup performs a write/read/delete probe before the server begins listening. Bad credentials or a read-only bucket therefore fail startup instead of appearing healthy and failing on the first user save.

SIGTERM and SIGINT put the server into draining mode, stop new listener acceptance, and allow existing connections to close before the process exits. Configure the service manager with a shutdown grace period longer than OPDF's 10-second drain deadline.

Run the production security gate with:

```powershell
npm run server-production-smoke
```

It verifies security headers, request IDs, liveness/readiness, authentication protection, cross-site mutation rejection, login throttling, and `Retry-After`.

### Structured request logs

OPDF writes one JSONL request log per UTC day under `OPDF_DATA_DIR\logs` by default.
Each record includes the request ID, HTTP method, route path, status code, duration,
response content length when known, and a bounded error summary for failed requests.
Query strings are intentionally excluded so credentials and operation parameters do not
end up in the request log.

Override the directory and retention period when required:

```powershell
$env:OPDF_LOG_DIR="D:\OPDF\logs"
$env:OPDF_LOG_RETENTION_DAYS="14"
npm run server-start
```

Retention is clamped to 1-90 days. Keep these logs on the server side only; use the
`X-Request-Id` returned to the browser to correlate a user-visible failure with a
specific JSONL entry.

### Automated local backups

For local-storage deployments, OPDF includes a verified backup CLI. Store backups
outside `OPDF_DATA_DIR`:

```powershell
npm run backup:create -- --data-dir "D:\OPDF\data" --backup-root "E:\OPDF-backups" --keep 7
```

Each backup is written to a temporary directory, every copied file is hashed with
SHA-256, a manifest is written, and only then is the backup atomically renamed into
its final timestamped directory. Older backups are pruned only after a successful
backup.

Verify a recovery point independently:

```powershell
npm run backup:verify -- --backup "E:\OPDF-backups\opdf-backup-<timestamp>"
```

Restore only from a verified backup:

```powershell
npm run backup:restore -- --backup "E:\OPDF-backups\opdf-backup-<timestamp>" --target "D:\OPDF\data"
```

If the target already exists, restoration refuses to proceed unless `--force` is
supplied. With `--force`, the existing target is renamed to a timestamped
`.pre-restore-...` directory instead of being deleted, so rollback remains possible.

The built-in backup CLI is for local filesystem mode. In S3-compatible mode, use
bucket versioning/snapshots for the configured prefix and keep application secrets in
a separate secrets manager as described below.

### Backup and restore

For local storage deployments, back up the entire `OPDF_DATA_DIR` as one consistency unit. Quiesce or stop the OPDF process before a filesystem-level copy unless the snapshot mechanism provides atomic volume snapshots.

For S3-compatible deployments:

1. Enable bucket versioning and retain previous object versions for a recovery window appropriate to the deployment.
2. Back up the complete configured `OPDF_S3_PREFIX`, including `auth/users.json`, document metadata/PDFs, annotations, sessions, and encrypted certificate envelopes.
3. Back up `OPDF_AUTH_SECRET` and `OPDF_CERTIFICATE_MASTER_KEY` in a secrets manager separate from the object bucket. Losing the certificate master key makes the encrypted P12/PFX envelopes unrecoverable.
4. Record `OPDF_S3_ENDPOINT`, bucket, region, prefix, and the application version/commit with each recovery point.
5. Test restore into an isolated OPDF instance before relying on the backup policy.

Restore the object prefix first, then restore the matching application secrets, start a single OPDF node, verify `/api/opdf/ready`, sign in, open representative documents, and verify one stored signing certificate before re-enabling multiple application nodes.

### Deployment acceptance gate

Before calling an environment production-ready, require all repository CI gates to be green and then verify the real environment with:

- HTTPS only; direct origin access blocked when a trusted proxy is used.
- `/api/opdf/live` and `/api/opdf/ready` monitored by the service manager.
- Real S3 credentials pass the startup write/read/delete probe when S3 mode is enabled.
- A restore drill has succeeded from the chosen backup mechanism.
- OCR traffic uses sticky routing or a dedicated worker node, because OCR scheduling remains process-local.
- Representative PDFs and expected concurrent-user load have been exercised against the deployed environment.


## Office to PDF conversion

Word, Excel, PowerPoint, RTF, and text files can be converted to PDF through the OPDF Server. This path uses LibreOffice in headless mode so the output contains the real source document content rather than a browser-side approximation.

Install LibreOffice on the server and make sure the `soffice` executable is available on `PATH`. On Windows, if it is not on `PATH`, configure the full executable path before starting OPDF Server:

```powershell
$env:OPDF_LIBREOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
npm run server-start
```

If LibreOffice is missing, OPDF returns an explicit conversion error and does not create a placeholder PDF.
