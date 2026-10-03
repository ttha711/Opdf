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

1. QPDF compression/encryption worker.
2. LibreOffice/Python document-conversion worker.
3. Server OCR job queue.
4. Server-side P12/PFX signing policy and certificate storage.
5. Multi-user authentication, authorization, quotas, and per-user/project storage.
6. S3-compatible object storage for multi-node deployments.
