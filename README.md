# OPDF

Offline-first PDF desktop app using web-first development workflow.

## Features & Tools

Opdf integrates powerful, Acrobat-like capabilities running entirely offline via WebAssembly and highly-optimized JS libraries.

### Advanced Editing Tools (`@opdf/core`)
- **Compress PDF**: Utilizes `@neslinesli93/qpdf-wasm` (QPDF compiled to WebAssembly) to linearize and optimize images natively without a server.
- **Convert to Images**: Renders PDF pages to high-quality images and packages them instantly into a downloadable `.zip` file using `fflate` WebAssembly.
- **Merge & Split PDFs**: Uses `pdf-lib` to seamlessly combine multiple documents or extract specific pages.
- **Watermark**: Adds dynamic text watermarks recursively across all pages.
- **Redaction (Pseudo-Redact)**: Bakes solid black rectangles into the PDF stream during export to obscure sensitive information visually.

### Interactive View & Annotation (`apps/web`)
- **Canvas Rendering**: Powered by `pdfjs-dist` for pixel-perfect PDF display.
- **Vector Interaction**: Overlay powered by `fabric.js` allows smooth placement of Shapes, Highlights, Signatures, and Note Boxes.
- **Export Flattening**: Annotations created on the UI are irreversibly flattened into the PDF byte-stream upon export via `pdf-lib`.

### AI & Text Parsing
- **Local OCR**: Powered by `tesseract.js` WebWorkers for offline text recognition.

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