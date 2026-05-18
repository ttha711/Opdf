---
name: services
description: "Skill for the Services area of Opdf. 46 symbols across 5 files."
---

# Services

46 symbols | 5 files | Cohesion: 63%

## When to Use

- Working with code in `packages/`
- Understanding how save, saveAs, merge work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/core/src/services/document-service.ts` | save, saveAs, merge, split, reorder (+17) |
| `packages/core/src/services/annotation-service.ts` | getState, list, replace, create, update (+5) |
| `packages/core/src/services/storage-service.ts` | ensureStorePath, writeStore, pushRecent, writeSession, writeAnnotations (+5) |
| `packages/core/src/services/ocr-service.ts` | enqueue, list, run |
| `apps/desktop/src/main/main.ts` | registerIpcHandlers |

## Entry Points

Start here when exploring this area:

- **`save`** (Method) — `packages/core/src/services/document-service.ts:19`
- **`saveAs`** (Method) — `packages/core/src/services/document-service.ts:24`
- **`merge`** (Method) — `packages/core/src/services/document-service.ts:28`
- **`split`** (Method) — `packages/core/src/services/document-service.ts:41`
- **`reorder`** (Method) — `packages/core/src/services/document-service.ts:56`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `save` | Method | `packages/core/src/services/document-service.ts` | 19 |
| `saveAs` | Method | `packages/core/src/services/document-service.ts` | 24 |
| `merge` | Method | `packages/core/src/services/document-service.ts` | 28 |
| `split` | Method | `packages/core/src/services/document-service.ts` | 41 |
| `reorder` | Method | `packages/core/src/services/document-service.ts` | 56 |
| `exportFlattened` | Method | `packages/core/src/services/document-service.ts` | 65 |
| `watermarkPdf` | Method | `packages/core/src/services/document-service.ts` | 133 |
| `insertPages` | Method | `packages/core/src/services/document-service.ts` | 192 |
| `deletePages` | Method | `packages/core/src/services/document-service.ts` | 206 |
| `cropPage` | Method | `packages/core/src/services/document-service.ts` | 222 |
| `addPageNumbers` | Method | `packages/core/src/services/document-service.ts` | 239 |
| `addHeaderFooter` | Method | `packages/core/src/services/document-service.ts` | 273 |
| `addBatesNumbering` | Method | `packages/core/src/services/document-service.ts` | 311 |
| `rotatePages` | Method | `packages/core/src/services/document-service.ts` | 354 |
| `_parseColor` | Method | `packages/core/src/services/document-service.ts` | 366 |
| `enqueue` | Method | `packages/core/src/services/ocr-service.ts` | 6 |
| `list` | Method | `packages/core/src/services/ocr-service.ts` | 19 |
| `run` | Method | `packages/core/src/services/ocr-service.ts` | 41 |
| `open` | Method | `packages/core/src/services/document-service.ts` | 14 |
| `compressPdf` | Method | `packages/core/src/services/document-service.ts` | 119 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RegisterIpcHandlers → EnsureStorePath` | cross_community | 4 |
| `RegisterIpcHandlers → DefaultStore` | cross_community | 4 |
| `Replace → GetState` | intra_community | 3 |
| `WriteSession → EnsureStorePath` | cross_community | 3 |
| `WriteSession → DefaultStore` | cross_community | 3 |
| `Create → CloneAnnotations` | intra_community | 3 |
| `Update → CloneAnnotations` | intra_community | 3 |
| `Delete → CloneAnnotations` | intra_community | 3 |
| `RestoreSession → EnsureStorePath` | cross_community | 3 |
| `RestoreSession → DefaultStore` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "save"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
