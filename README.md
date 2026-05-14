# OPDF

Offline-first PDF desktop app using web-first development workflow.

## Workspace

- `apps/web`: React + Vite + PDF.js viewer shell
- `apps/desktop`: Electron runtime with secure preload bridge
- `packages/core`: shared services (`DocumentService`, `AnnotationService`, `OcrService`, `StorageService`)

## Development

```bash
npm install
npm run web-dev
```

In another terminal:

```bash
npm run desktop-dev
```

## Build

```bash
npm run build
npm run desktop-package
```

## Security defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Renderer uses `window.opdf` bridge only