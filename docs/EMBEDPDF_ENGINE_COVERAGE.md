# OPDF engine coverage — EmbedPDF/PDFium 2.15.1

This inventory distinguishes **library primitives**, **existing OPDF adapters**, and **user-facing actions**. A plugin does not automatically mean there should be one dashboard card for every API method.

## Runtime and ownership

- **Embedded PDF engine**: `@embedpdf/react-pdf-viewer` 2.15.1 provides the PDFium-backed viewer and built-in chrome; `apps/web/src/components/PdfViewer.tsx`.
- **Viewer command adapter**: `apps/web/src/lib/viewer-runtime.ts` registers document-scoped zoom, rotation, navigation, undo/redo and command dispatch.
- **PDF mutation and exports**: `apps/web/src/hooks/useOpdfBridge.ts`, `apps/web/src/hooks/document-actions/`, and `apps/web/src/lib/pdfAdvanced.ts` select browser / OPDF Server / Desktop implementations.
- **Unified discoverability**: `apps/web/src/lib/allToolsCatalog.ts` is the dashboard catalogue; `apps/web/src/agent/definitions.ts` defines AI-accessible operations. These are *two related surfaces*, not synonymous lists.

## Verified coverage (from source)

| Area | Viewer plugin/adaptor | Existing OPDF functionality | Next integration priority |
| --- | --- | --- | --- |
| Document display | PDFium, document-manager, render, viewport | Embedded viewer, open/close, page count | Keep existing viewer |
| Navigation | scroll, thumbnail | Page navigation and thumbnails | Keep built-in UI; avoid duplicates |
| Zoom / rotate | zoom, rotate | Fit page/width, zoom, rotate view | Keep adapter and built-in chrome |
| Edit history | history, commands | Undo/redo and command dispatch | Add feature-level tests |
| Annotation | annotation | Highlight, notes, shapes and other native modes | Test save/reload fidelity |
| Forms | form | Fill and export; advanced PDF form operations | Test widgets and flatten flows |
| Redaction | redaction | Viewer redaction and secure-search workflow | Verify exported content is removed |
| Export | export | Save copy and modified document bytes | Test persistence across reload |
| Capture | capture | Area selection used by content editor | Test coordinate alignment |
| Structural edits | OPDF bridge/pdf-lib | Merge, split, insert, delete, extract, crop and rotate pages | Add round-trip tests |
| Text conversion | PDF.js extraction | PDF → TXT/XML/HTML/RTF | Label text-first output; do not promise layout preservation |
| Office conversion | OPDF Server/Desktop bridge | PDF ↔ DOCX/XLSX/PPTX, RTF → PDF | Disable without converter; integration tests |
| PDF/A | OPDF bridge | Only where `capabilities.pdfA === true` | Validate PDF/A output on supported runtime |
| Advanced document features | pdf-lib | Outlines/bookmarks, URL and internal links, form editing | Expose existing advanced modal |
| Measurement | OPDF viewer overlay | Distance/perimeter/area with calibration | Keep custom UX over engine page geometry |

## Follow-up feature candidates — not yet verified as implemented

1. **PDF attachments**: inspect package API surface and decide whether an attachments panel can reliably list, download, add and remove embedded files. Do not show a card until the operation works end to end.
2. **Native printing and presentation/fullscreen**: establish supported EmbedPDF commands, document-scoped API and usable browser printing; do not call `window.print()` as a substitute for printing the PDF pages.
3. **Bookmarks/navigation tree**: determine the native viewer outline API and reconcile it with existing pdf-lib bookmark mutation. Ensure outline selection navigates without replacing the document.
4. **Advanced search**: verify native search plugin support before adding a separate dashboard action.
5. **Signature/export fidelity and complex forms**: add evidence-based browser/server E2E coverage on real files.

## Rules for new tools

1. Define a stable ID, user-facing label, runtime capability and route to an **actual** engine handler.
2. A tool requiring runtime support must be disabled with a specific explanation when support is absent.
3. Prefer the EmbedPDF document-scoped plugin API for changes to viewer state; use the OPDF document bridge for file mutations.
4. Cover one successful execution, one unsupported runtime and save/reload persistence when relevant.
5. Keep the tool catalogue and agent/tool coverage tests synchronized; do not advertise unimplemented functions.
