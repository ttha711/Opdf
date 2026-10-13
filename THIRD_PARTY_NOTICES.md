# Third-Party Notices

TPDF includes and depends on open-source software. This file highlights the primary PDF
viewer/runtime dependencies introduced by the web-first viewer. It is not a replacement
for the license files distributed by npm packages and their transitive dependencies.

## EmbedPDF

- Project: EmbedPDF / embed-pdf-viewer
- Package used by the web application: `@embedpdf/react-pdf-viewer`
- Version pinned by TPDF: `2.15.1`
- License: MIT

The package provides the browser viewer, plugin system, virtualization, and PDFium/WASM
integration used by TPDF.

## PDFium and Chromium third-party code

EmbedPDF's local browser engine uses PDFium compiled to WebAssembly. PDFium itself and
the Chromium third-party components included in a PDFium build carry their own permissive
licenses and notices.

When redistributing TPDF, retain the license/notice files shipped with the installed
EmbedPDF/PDFium packages and all other dependencies. Do not replace the package-provided
notices with this summary.
