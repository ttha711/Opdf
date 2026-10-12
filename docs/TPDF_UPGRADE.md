# TPDF rename: upgrade existing installations

This repository is now **ttha711/Tpdf**. Renaming a repository or product does **not** automatically migrate a running server, its secrets, storage paths, or connected clients.

## Before upgrading

1. Stop the previous application and take a verified backup of its documents, user database, certificates, and encryption secrets.
2. Update your remote with `git remote set-url origin https://github.com/ttha711/Tpdf.git`, then update to the tested `main` revision and run `npm ci`.
3. Rename environment-variable **keys** from `OPDF_` to `TPDF_`, preserving their exact values. Update Windows services, PowerShell launchers, process supervisors, secret stores and deployment settings, not just the current terminal session.
4. **Keep `TPDF_DATA_DIR` pointing to the previously used storage directory**, even if its physical name is unchanged. If the previous app used the default `.opdf-data` directory, set `TPDF_DATA_DIR` to its absolute path before startup. Otherwise the new default `.tpdf-data` will look empty.
5. For S3-backed storage, preserve the existing bucket, region, credentials **and object prefix** when transferring settings to `TPDF_S3_*`. Changing the prefix makes documents and user records appear absent.
6. Preserve the exact values of authentication and certificate keys when transferring to `TPDF_AUTH_SECRET` and `TPDF_CERTIFICATE_MASTER_KEY`. Changing the authentication secret invalidates existing sessions, and changing the master key may make encrypted certificates inaccessible.
7. Build and restart, then verify existing documents, accounts, signatures, annotations, session restoration, and backups before allowing normal access.

## Updated interfaces

- Web API: `/api/opdf` → `/api/tpdf`.
- Electron renderer bridge: `window.opdf` → `window.tpdf`.
- npm workspaces: `@opdf/*` → `@tpdf/*`.
- Automation selectors: `data-opdf-*` → `data-tpdf-*`.
- CLI: `npm run opdf` → `npm run tpdf`.
- Electron package ID: `com.opdf.desktop` → `com.tpdf.desktop`.

External scripts and integrations using the old API/header/event names must be updated. A newly loaded client registers the renamed service worker, which cleans up old application-shell caches; users with long-lived tabs may need a full reload.

## Desktop settings

Recent documents, annotation state, and session metadata now live in `~/.tpdf/storage.json`. On first start, the desktop runtime copies `~/.opdf/storage.json` into the new location **only if no new settings file exists**. It leaves the old file untouched and does not overwrite existing new settings. Document file paths are not moved. The platform's Electron user-data directory is separate from this file; depending on installation method, users may need to sign in again.

## Validate after deployment

Run `npm run check:branding`, `npm run typecheck`, `npm run test:cli`, `npm run server-smoke`, and the GitHub Actions CI suite. Check the deployed HTTPS hostname and existing documents directly. A passing repository CI run cannot verify the deployed host's secrets or filesystem.
