# OPDF Native Content Editor

## Product target

OPDF must support editing the **existing PDF page content**, not merely placing annotations over it.

The finished editor must let a user:

- select existing text, images, and vector/page objects;
- edit existing text in place;
- preserve or deliberately substitute fonts;
- change text size/color and object transforms;
- move, resize, rotate, duplicate, and delete objects;
- replace/crop images;
- edit common vector geometry and styling;
- undo/redo all content operations;
- save, close, reopen, and obtain the same edited document;
- keep annotations as a separate feature;
- handle Vietnamese/Unicode text;
- degrade explicitly when a PDF object cannot be edited safely.

## Architecture

The viewer and content editor are separate layers.

1. **Viewer** — EmbedPDF remains responsible for rendering, navigation, selection, annotations, forms, and large-document viewing.
2. **Content editing model** — `PdfContentObject` and `PdfContentPatch` are OPDF-owned contracts. UI code talks only to these contracts.
3. **Native content engine** — an adapter implements page-object inspection and mutation. It must edit PDF page objects/content streams and serialize a valid PDF.
4. **Editor overlay** — uses engine object bounds/matrices to render selection handles and in-place text controls over the viewer.
5. **History** — edits are commands/patches, enabling undo/redo and deterministic tests.
6. **Persistence** — saved bytes go through the existing atomic server storage path.

## Engine requirements

The production engine must expose capabilities equivalent to PDFium page-object APIs:

- enumerate page objects and object types;
- inspect text object text/font/size/matrix/bounds;
- create/remove/transform text objects;
- load/embed fonts and support Unicode;
- inspect/replace/transform image objects;
- inspect/transform common path objects;
- regenerate page content after mutations;
- save the modified document.

Do not implement native-content editing by drawing a white rectangle plus new text. That is a visual patch, not content editing.

## Delivery milestones

Milestones are integration checkpoints, not reduced product scope.

### M1 — engine contract and deterministic fixtures
Object/patch contracts, capability reporting, fixtures covering Latin, Vietnamese, rotated text, embedded/subset fonts, images, vectors, scanned pages, and malformed PDFs.

### M2 — object inspection and hit testing
Enumerate page objects, stable IDs for an editing session, bounds/matrix conversion, click/drag selection, object inspector.

### M3 — native text editing
Replace existing text, create/delete text objects, Unicode font embedding/substitution, font/size/color controls, multiline behavior where technically valid.

### M4 — object transforms and images
Move/resize/rotate/duplicate/delete; image replacement/crop; preserve page coordinates and transforms.

### M5 — vector editing
Select common path objects; move/resize/rotate; fill/stroke editing; safe fallback for unsupported complex graphics.

### M6 — editor UX and history
Acrobat-style Edit mode, selection handles, inline text editor, property panel, keyboard operations, undo/redo, dirty-state integration.

### M7 — persistence and compatibility
Save/reload verification, atomic server persistence, large PDFs, encrypted PDFs where permitted, font edge cases, corrupt input, crash recovery.

### M8 — production quality gate
Real-world engineering PDFs, generated adversarial fixtures, visual diffing, object-level assertions, performance budgets, Windows/macOS/browser/server regression.

## Definition of done

The project is not considered complete merely because Add Text works. Native Edit mode is complete only when existing editable page objects can be changed and the mutations survive serialization/reload without relying on annotation overlays.

## Implementation status

The current branch implements the native editor with direct `@embedpdf/pdfium` page-object mutation:

- text/image/path object inspection with bounds and transforms;
- existing text replacement, font size/color, standard fonts and OPDF Unicode/Vietnamese font embedding;
- move, resize, rotate, duplicate and delete for supported native objects;
- image replacement and bitmap crop;
- path fill/stroke/stroke-width editing;
- path geometry inspection and Move/Line/Bezier point editing;
- page-area hit testing from the active PDF viewer;
- bounded byte-snapshot Undo/Redo;
- native content bytes remain separate from annotation workflows;
- server Save + reload regression coverage for edited and duplicated native text.

The remaining production-quality work is deliberately treated as a gate, not a reduced scope:

- direct canvas selection handles and inline text editing should match the object panel behavior;
- add deterministic image/path persistence fixtures, including crop and Bezier geometry;
- exercise Unicode/subset-font, rotated-object, scanned-page, encrypted-PDF and malformed-PDF fixtures;
- run real engineering PDFs and performance budgets before calling M8 complete.
