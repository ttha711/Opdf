# OPDF Web Large-PDF Audit

## Target

Refocus OPDF on a **web-first technical drawing PDF viewer/reviewer** that remains usable with architectural and structural drawing sets in the hundreds-of-megabytes range.

Primary workload:
- large vector/raster construction PDFs
- A0/A1/A2 sheets
- many-page drawing sets
- fast pan/zoom/navigation
- calibrated measurement
- annotations/review
- version comparison
- reliable export

This audit intentionally prioritizes large-file behavior over broad Acrobat/Office feature parity.

---

## Executive conclusion

The current codebase has a good PDF.js-based viewer foundation, but the current data model repeatedly treats the full PDF as an in-memory `Uint8Array`. That is the main architectural blocker for 200–500 MB documents.

The highest-risk pattern is:

```text
File
 -> full ArrayBuffer
 -> Uint8Array
 -> copies in tab state
 -> copies in IndexedDB autosave
 -> copies into PDF.js
 -> page canvas
 -> WebP Blob
 -> object URL
 -> Fabric decodes raster again
```

This must be replaced with a source/reference model, bounded page caches, and non-destructive edit recipes.

---

# P0 — must fix before adding more features

## P0.1 Stop storing/copying full PDF bytes in tab state

Current:
- `apps/web/src/lib/web-storage.ts`: `OpdfTab.docBytes`
- `apps/web/src/hooks/useAppState.ts`: `cloneBytes()`
- tab switching copies `Uint8Array`
- active document sync copies bytes back into the tab
- every open tab can hold another complete PDF copy

Impact:
- a 300 MB PDF can become multiple 300 MB allocations
- switching tabs and state synchronization can trigger additional copies
- browser tab can OOM even before rendering

Target:
- tab stores only `documentId/sourceRef`, filename, current page, zoom, annotation reference, edit recipe
- one active document source
- no PDF byte copy during tab/page/navigation state changes

---

## P0.2 Remove full-PDF autosave to IndexedDB

Current:
- `saveTabsList()` clones each tab's `docBytes`
- `useAppEffects.ts` autosaves tab state every ~2 seconds
- `savePdfBytes()` stores another full PDF draft

Impact:
- excessive structured-clone cost
- large IndexedDB writes
- storage quota failures
- UI/main-thread stalls
- unnecessary SSD writes

Target:
Persist only:
- document metadata/reference
- annotations
- bookmarks
- edit recipe
- small thumbnail cache if needed

For local files, use File System Access/OPFS where supported, otherwise ask the user to reselect the file on session restore.

---

## P0.3 Do not hash hundreds of MB during normal UI edits

Current:
- `buildDocumentFingerprint()` scans every byte of `docBytes`
- fingerprint effect reruns when annotation/bookmark/page-rotation state changes
- `computeFileHash()` also hashes the entire PDF and makes a sliced ArrayBuffer

Impact:
- annotation edits can trigger a full 300 MB main-thread scan
- save/open performs another full-file digest

Target:
Use:
- stable document ID generated on open
- lightweight source identity: name/size/lastModified + optional background digest
- content hash only in a worker and only when genuinely needed
- dirty state based on revision counters, not hashing full document bytes

---

## P0.4 Feed PDF.js a source/range reader, not a copied full Uint8Array

Current:
- browser open uses `File.arrayBuffer()`
- `PdfViewer.hooks.ts`: `getDocument({ data: data.slice() })`

Impact:
- full file must be materialized before first page
- `data.slice()` makes another full copy
- defeats range/stream-oriented loading

Target `DocumentSource` abstraction:
- remote: URL + HTTP Range
- local: File/Blob slices or custom range transport
- OPFS/FileSystem handle when available
- PDF.js loads ranges progressively
- first page should display without waiting for optional background work

---

## P0.5 Replace unbounded rendered-page cache with a small LRU window

Current:
- continuous viewer tracks visible pages
- rendered pages remain in `renderedPages` after leaving viewport
- URLs are only cleaned on parameter replacement/unmount

Impact:
RAM grows as the user scrolls through the document.

Target:
- current page ± nearby pages
- e.g. 3–7 rasterized pages in memory
- evict image/canvas/text data when far from viewport
- cancel rendering immediately when page leaves the scheduling window
- keep only lightweight page metadata globally

---

## P0.6 Remove canvas -> WebP -> Blob URL -> Fabric decode loop for on-screen pages

Current:
- PDF.js renders to temporary canvas
- canvas is encoded to WebP
- Blob/object URL is created
- Fabric loads that URL as its canvas background

Impact:
- encode cost
- compressed image allocation
- decode cost
- Fabric backing canvas duplicates raster memory

Target:
Preferred stack:
```text
PDF.js canvas (base layer)
+ HTML/text layer only when needed
+ lightweight SVG/canvas annotation overlay
```

If Fabric remains:
- do not make Fabric own another full page raster
- use transparent annotation canvas only

---

## P0.7 Bound rendering pixels for A0/A1 pages

Current:
- render canvas dimensions scale with viewport * devicePixelRatio
- DPR has no practical pixel-budget clamp

Impact:
large sheets at high zoom can allocate enormous canvases.

Target:
- explicit max canvas pixel budget
- cap initial DPR for large sheets
- coarse preview while zooming
- high-quality rerender after zoom settles
- zoom around cursor
- optionally tile very large views

---

## P0.8 Stop eagerly generating thumbnails for every page

Current:
- all pages rendered in batches of 4 after document load
- every thumbnail Blob + URL retained
- tabs persist thumbnail arrays

Impact:
- delays useful work
- competes with first-page render
- growing memory/storage cost

Target:
- virtualized thumbnail list
- render visible + near-visible thumbnails only
- low resolution
- bounded LRU thumbnail cache
- never persist the full generated thumbnail set by default

---

## P0.9 Stop fetching all page objects in parallel on zoom

Current:
`usePageLayout.ts`:
- `Promise.all(pdf.getPage(...))` for every page
- reruns when scale/rotation/pageRotations change

Target:
- load base dimensions once
- cache per-page metadata
- CSS layout derives scaled dimensions mathematically
- only fetch page metadata lazily where necessary

---

## P0.10 Stop rewriting the entire PDF after every structural action

Current browser/core operations rely heavily on `pdf-lib`:
- rotate
- crop
- delete/insert
- reorder
- watermark
- page numbering
- header/footer
- annotations export

Each operation loads and serializes a whole document.

Target:
Maintain a non-destructive `DocumentEditRecipe`:
```ts
{
  pageOrder,
  deletedPages,
  rotations,
  crops,
  annotations,
  overlays
}
```

Viewer applies the recipe interactively.
Final save/export applies it once in a worker/backend engine.

---

# P0 — correctness and data-integrity issues

## P0.11 Save semantics are misleading

Current web behavior:
- Ctrl+S saves a draft into IndexedDB
- Save As downloads/writes raw PDF bytes
- annotations are not necessarily embedded into that PDF
- Export is the operation that flattens annotations

Risk:
User can believe a downloaded/saved PDF contains review markup when it does not.

Target:
Use explicit actions:
- **Save session/draft**
- **Save original/working file**
- **Export reviewed PDF**
- show whether markup is embedded or app-only

Prefer standard PDF annotations where practical instead of flatten-only storage.

---

## P0.12 Rotation/crop/annotation coordinate model needs one canonical transform

The viewer combines:
- original page rotation
- app page rotation
- global rotation
- normalized annotation coordinates

Export code maps normalized coordinates back using width/height but does not have one explicit canonical transform pipeline.

Risk:
markup can shift after page rotation/crop, especially on landscape technical drawings.

Target:
Create a tested coordinate service:
```text
PDF user space
<-> viewport
<-> CSS
<-> annotation normalized coordinates
```

Unit-test 0/90/180/270 degree rotations and cropped MediaBox/CropBox cases.

---

## P0.13 "Redact" is not secure redaction

README describes current behavior as pseudo-redaction: drawing opaque rectangles.

Risk:
underlying text/vector content may still exist and be selectable/extractable.

Target:
Either:
- rename feature to **Cover/Blackout overlay**, or
- implement genuine content removal using a capable PDF engine and verify with extraction tests

Do not present pseudo-redaction as secure redaction.

---

# P1 — web architecture

## P1.1 Introduce DocumentSource

Suggested contract:

```ts
interface DocumentSource {
  id: string;
  name: string;
  size: number;
  readRange(start: number, end: number): Promise<Uint8Array>;
  stream?(): ReadableStream<Uint8Array>;
}
```

Implementations:
- LocalFileSource
- FileSystemHandleSource
- UrlRangeSource
- OpfsSource

The rest of the app should not care whether the PDF is local or remote.

---

## P1.2 Move expensive work off the React/main thread

Dedicated workers for:
- hashing
- expensive export preparation
- thumbnail scheduling where possible
- document mutations if client-side
- OCR orchestration

UI thread owns interaction and state only.

---

## P1.3 Add a real web API boundary for heavy jobs

Current:
- Vite development proxy sends `/api` to localhost:5175
- editor server accepts JSON with a 50 MB body limit
- some conversion flows send base64 images in JSON

This is unsuitable for production web and hundreds-of-MB documents.

Target:
- separate deployable API service
- multipart/stream uploads
- job IDs + progress + cancellation
- HTTP Range/object storage for source/output
- no base64 PDF/page payloads in JSON
- optional resumable uploads for large files

---

## P1.4 Decide client vs server responsibility explicitly

Client:
- view
- pan/zoom
- text selection
- annotations
- measurement
- lightweight metadata
- revision comparison UI

Worker/server:
- merge/split large documents
- secure redaction
- optimization/compression
- final flattened export
- OCR over many pages
- PDF/A
- Office conversion

For a dependable 300–500 MB target, heavy final document processing should not rely solely on the browser main thread.

---

# P1 — technical drawing UX

## P1.5 Replace generic Acrobat/Office-first layout with drawing-first workflow

Primary toolbar should prioritize:
1. Open
2. sheet navigator
3. fit sheet / fit width
4. pan
5. zoom-to-cursor
6. measure
7. markup
8. compare
9. search
10. export

Move secondary utilities into an overflow/tool drawer.

---

## P1.6 Make Fit Width / Fit Page real

Current values are hard-coded scale constants.

Target:
```text
fitWidth = availableViewerWidth / pageWidth
fitPage  = min(availableWidth/pageWidth, availableHeight/pageHeight)
```

Recalculate on:
- sidebar resize
- browser resize
- page change
- page rotation

---

## P1.7 Add proper pan/navigation for CAD-like review

Required:
- Space + drag hand tool
- middle-mouse drag
- wheel scroll
- Ctrl/Cmd + wheel zoom around cursor
- double-click/shortcut fit behavior
- smooth jump to sheet
- keep viewport position where possible

---

## P1.8 Build real calibrated measurement

Current measurement reports pixels.

Technical-drawing target needs:
- calibration from a known dimension
- presets such as drawing scale 1:50, 1:100, etc.
- mm/cm/m
- linear distance
- polyline
- area/perimeter
- angle
- snap to endpoints/lines where feasible
- visible calibration state

Store measurement geometry in PDF coordinates, not screen pixels.

---

## P1.9 Improve sheet navigation

For large drawing sets:
- virtualized thumbnail sidebar
- page/sheet number
- extracted title/number when possible
- text search
- bookmarks / sheet sets
- filters by discipline/group
- quick jump by page number

---

## P1.10 Add compare/overlay workflow

High-value architecture/structure feature:
- old vs new revision
- side-by-side
- synchronized pan/zoom
- opacity overlay
- difference mode where practical

This is more valuable to the target user than many Office conversion tools.

---

## P1.11 Unify language and visual system

Current UI mixes Vietnamese and English and includes many hard-coded light-mode colors.

Fix:
- choose VI, EN, or proper i18n
- use design tokens throughout
- StatusBar currently hard-codes light background
- AI/translate/rewrite modals contain many hard-coded slate/white colors
- consistent success/warning/error channels

Do not use `viewerError` to display success text.

---

# P1 — remove fake/unsupported product surfaces

## P1.12 Remove fake Office conversion from production UI

`AllToolsDashboard.tsx` contains an "Office Mock PDF generator" that creates a placeholder A4 PDF saying conversion succeeded; it does not convert the Office document.

Action:
- delete production-facing mock path
- keep only behind explicit development flag if still needed for prototyping
- never show fake success to users

---

## P1.13 Hide unsupported capabilities instead of letting them fail

Examples:
- browser compression capability is false and mock returns input unchanged
- encrypt/decrypt are desktop-only in current mock
- PDF/A throws unsupported
- PDF bookmark outline creation throws unsupported

Action:
- capability registry is the single source of truth
- unsupported actions should not appear enabled
- no feature gating by hostname as a security mechanism

---

## P1.14 Replace all native prompt() paths

Project guidelines prohibit native browser prompts, but current paths still use them for:
- watermark
- delete pages
- crop
- page numbering
- header/footer
- Bates numbering
- passwords

Use existing custom modal/panel infrastructure.

---

# P2 — simplify repository/product boundaries

## P2.1 Separate web PDF product from Office editor

Current repo contains:
- large PDF web app
- Electron shell
- Office/AI editor

This causes product and dependency sprawl.

Recommended:
```text
apps/web-pdf       <- primary product
apps/api           <- heavy web jobs
apps/office-editor <- optional separate product
apps/desktop       <- optional shell
packages/pdf-model
packages/ui
```

Do not let office-editor dependencies enter the large-PDF viewer bundle.

---

## P2.2 Remove or archive dead/prototype code after static reachability check

Strong candidates for verification:
- `PrintModal.tsx` (very large and not referenced by central app paths inspected)
- manual `test_stirling_mode.mjs`
- old duplicate conversion flows
- duplicate modal vs prompt code paths
- prototype AI/live-editor surfaces not part of the target product
- internal test-runner UI if not shipped intentionally

Before deleting:
- build import graph
- run TypeScript/Vite build
- add E2E smoke tests
- delete in small commits

Do not delete `apps/editor` or `apps/desktop` blindly; first decide whether they remain separate products.

---

## P2.3 Reduce dependency/version drift

Current examples:
- web and editor use different PDF.js versions
- different Vite/Tailwind versions
- stale-looking Fabric type package vs Fabric runtime version
- font files duplicated between web public assets and core assets

Action:
- align versions where packages remain related
- remove unused dependencies
- centralize/share font assets where packaging permits
- bundle-analyze web output

---

# CI and performance gates

## CI is currently red

Latest checked CI run:
- typecheck: success
- build: success
- e2e: failure

Reason:
`npx playwright test --project=chromium` runs without a configured `chromium` Playwright project.

Fix CI before major refactoring.

---

## Required large-PDF regression suite

Add generated or artifact-hosted fixtures representing:
- 50 MB mixed PDF
- 250 MB drawing set
- 500 MB stress file
- many-page set
- one very large A0/A1 vector-heavy sheet
- large raster/scanned sheet

Measure:
- time to first page
- time to usable interaction
- peak/steady memory
- memory after scrolling 50/100 pages
- zoom responsiveness
- render cancellation
- thumbnail memory
- export duration
- cancellation/recovery

Suggested acceptance direction:
- first useful page does not require full thumbnail generation
- memory remains bounded as user scrolls
- closing document releases caches
- switching tabs does not duplicate source bytes
- no full-file hash runs during annotation edits

---

# Recommended implementation sequence

## Phase 0 — stabilize
1. fix Playwright CI
2. add large-PDF performance fixtures
3. instrument timing/cache/memory behavior
4. freeze non-core feature additions

## Phase 1 — remove the memory bombs
1. remove `docBytes` from tab persistence
2. remove autosave of full PDFs
3. replace dirty-state whole-file hash
4. remove `data.slice()`
5. implement DocumentSource/range loading
6. bounded page and thumbnail caches

## Phase 2 — viewer rewrite
1. direct PDF.js canvas base layer
2. transparent annotation overlay
3. virtualized page window
4. adaptive resolution / pixel budget
5. lazy text layer
6. real fit-width/fit-page
7. pan/zoom-to-cursor

## Phase 3 — technical drawing workflow
1. calibrated measurement
2. improved sheet navigator/search
3. revision compare/overlay
4. drawing-oriented annotation tools

## Phase 4 — heavy processing
1. non-destructive edit recipe
2. worker/API export pipeline
3. streamed large-file operations
4. secure redaction if required

## Phase 5 — cleanup
1. remove fake Office conversion
2. archive/split Office editor
3. verify/remove dead code
4. align dependencies
5. update README/architecture docs

---

# Keep

The following concepts are worth retaining:
- PDF.js worker-based rendering
- IntersectionObserver idea for visibility
- annotation model separated from raw PDF
- custom modal/toast system
- split document-action hooks
- bridge/capability abstraction concept

They need to be rebuilt around bounded memory and a source-reference model rather than discarded wholesale.
