# OPDF Codebase Index

> Fast navigation map for humans and AI agents. This complements GitNexus; use GitNexus for symbol-level call graphs and impact analysis when available.

## Repository areas

| Area | Path | Responsibility |
|---|---|---|
| Web | `apps/web` | React/Vite PDF viewer, annotations, document actions, browser fallback |
| Desktop | `apps/desktop` | Electron runtime, preload bridge, filesystem/native operations |
| Editor | `apps/editor` | Office-style React editor + Express APIs |
| Core | `packages/core` | PDF, annotation, OCR, and storage services |
| Scripts | `scripts` | Supporting conversion/automation utilities |

## Primary entry points

### Web
- `apps/web/src/main.tsx` — React bootstrap
- `apps/web/src/App.tsx` — main application composition
- `apps/web/src/hooks/useAppState.ts` — central application/document state
- `apps/web/src/hooks/useAppControllers.ts` — controller wiring
- `apps/web/src/hooks/useDocumentLifecycle.ts` — open/close/replace document lifecycle
- `apps/web/src/hooks/useDocumentActions.ts` — save/export/OCR/document-tool aggregator
- `apps/web/src/hooks/useOpdfBridge.ts` — Electron bridge or browser mock selection

### Desktop
- `apps/desktop/src/main/main.ts` — Electron main process and IPC handlers
- `apps/desktop/src/preload/preload.ts` — secure `window.opdf` bridge
- `apps/desktop/tools/` — Python/PowerShell PDF and Office pipelines

### Editor
- `apps/editor/src/App.tsx` — editor UI root
- `apps/editor/server.ts` — Express server entry
- `apps/editor/server/routes/index.ts` — route registration
- `apps/editor/server/routes/document.ts` — document APIs
- `apps/editor/server/routes/editing.ts` — editing APIs
- `apps/editor/server/routes/ocr.ts` — OCR APIs
- `apps/editor/server/routes/office.ts` — Office APIs
- `apps/editor/server/routes/chat.ts` — AI/chat APIs
- `apps/editor/server/gemini.ts` — Gemini integration
- `apps/editor/server/officeParser.ts` — Office parsing

### Core
- `packages/core/src/index.ts` — public exports
- `packages/core/src/services/document-service.ts` — document/PDF operations
- `packages/core/src/services/annotation-service.ts` — annotation operations
- `packages/core/src/services/ocr-service.ts` — OCR jobs/services
- `packages/core/src/services/storage-service.ts` — recent/session storage
- `packages/core/src/types/index.ts` — shared types

## Task -> first files to inspect

| Task | Start here | Then |
|---|---|---|
| Open PDF | `useDocumentLifecycle.ts` | `useOpdfBridge.ts` -> `preload.ts` -> `main.ts` |
| Save / Save As / Export | `useDocumentActions.ts` | `document-actions/useExportAction.ts` -> bridge |
| OCR | `document-actions/useOcrAction.ts` | `opdf-bridge/ocrHelpers.ts` -> desktop/core OCR |
| Merge / split / compress / watermark | `document-actions/useCommonActions.ts` | bridge -> `DocumentService` |
| Page/document tools | `document-actions/useDocumentToolsAction.ts` | bridge -> desktop/core |
| Annotations | `useAnnotationActions.ts` | bridge -> `AnnotationService` |
| Browser fallback | `opdf-bridge/mockBridge.ts` | `lib/web-storage.ts` |
| Desktop native behavior | `preload.ts` | matching `opdf:*` handler in `main.ts` |
| Office editing | `apps/editor/src/App.tsx` | relevant component + server route |
| AI editor requests | editor UI | `server/routes/chat.ts` / `server/gemini.ts` |
| PDF -> Office | `preload.ts` `convertPdfOffice` | `main.ts` -> `apps/desktop/tools` |

## Bridge contract

Renderer-facing bridge:
- `apps/web/src/types/opdf.ts`
- `apps/desktop/src/preload/preload.ts`

When changing a bridge method, inspect all three layers:

```text
web caller -> preload contract -> main IPC handler
```

Important IPC families include:
- `opdf:open`, `opdf:save`, `opdf:save-as`
- `opdf:export-flattened`
- `opdf:compress`, `opdf:watermark`, `opdf:merge`, `opdf:split`
- `opdf:ocr:*`
- `opdf:annotation:*`
- `opdf:storage:*`

## Rules before code changes

Read:
- `AGENTS.md`
- `CLAUDE.md`
- `GUIDELINES.md`
- `.github/workflows/ci.yml`

If GitNexus is available, use it for context/impact analysis before modifying symbols.

If GitNexus is unavailable, use this index plus GitHub tree/file tools to narrow the code surface before opening implementation files.

## Verification

```bash
npm run typecheck
npm run build
```

Focused development:

```bash
npm run web-dev
npm run editor-dev
npm run desktop-dev
```

Update this index whenever major entry points, bridge contracts, or module boundaries change.
