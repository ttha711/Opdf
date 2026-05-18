---
name: document-tool-panel
description: "Skill for the Document-tool-panel area of Opdf. 18 symbols across 8 files."
---

# Document-tool-panel

18 symbols | 8 files | Cohesion: 97%

## When to Use

- Working with code in `apps/`
- Understanding how useSplitMergeActions, useConversionActions, DocumentToolPanel work
- Modifying document-tool-panel-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/web/src/components/document-tool-panel/uiPanels.tsx` | PdfToImagePanel, PdfToOfficePanel, OfficeToPdfPanel, CompressPanel, WatermarkPanel (+1) |
| `apps/web/src/components/document-tool-panel/useConversionActions.ts` | useConversionActions, convertBlobToGrayscale, handlePdfToImages |
| `apps/web/src/components/DocumentToolPanel.tsx` | DocumentToolPanel, splitParts, toolName |
| `apps/web/src/components/document-tool-panel/splitParts.ts` | parsePagesInput, buildSplitParts |
| `apps/web/src/components/document-tool-panel/useSplitMergeActions.ts` | useSplitMergeActions |
| `apps/web/src/components/document-tool-panel/SplitToolPanel.tsx` | SplitToolPanel |
| `apps/web/src/components/document-tool-panel/MergeToolPanel.tsx` | MergeToolPanel |
| `apps/web/src/components/document-tool-panel/toolNames.ts` | getDocumentToolName |

## Entry Points

Start here when exploring this area:

- **`useSplitMergeActions`** (Function) — `apps/web/src/components/document-tool-panel/useSplitMergeActions.ts:16`
- **`useConversionActions`** (Function) — `apps/web/src/components/document-tool-panel/useConversionActions.ts:31`
- **`DocumentToolPanel`** (Function) — `apps/web/src/components/DocumentToolPanel.tsx:10`
- **`PdfToImagePanel`** (Function) — `apps/web/src/components/document-tool-panel/uiPanels.tsx:17`
- **`PdfToOfficePanel`** (Function) — `apps/web/src/components/document-tool-panel/uiPanels.tsx:75`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useSplitMergeActions` | Function | `apps/web/src/components/document-tool-panel/useSplitMergeActions.ts` | 16 |
| `useConversionActions` | Function | `apps/web/src/components/document-tool-panel/useConversionActions.ts` | 31 |
| `DocumentToolPanel` | Function | `apps/web/src/components/DocumentToolPanel.tsx` | 10 |
| `PdfToImagePanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 17 |
| `PdfToOfficePanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 75 |
| `OfficeToPdfPanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 111 |
| `CompressPanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 152 |
| `WatermarkPanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 190 |
| `FillFormPanel` | Function | `apps/web/src/components/document-tool-panel/uiPanels.tsx` | 221 |
| `SplitToolPanel` | Function | `apps/web/src/components/document-tool-panel/SplitToolPanel.tsx` | 14 |
| `MergeToolPanel` | Function | `apps/web/src/components/document-tool-panel/MergeToolPanel.tsx` | 12 |
| `buildSplitParts` | Function | `apps/web/src/components/document-tool-panel/splitParts.ts` | 23 |
| `splitParts` | Function | `apps/web/src/components/DocumentToolPanel.tsx` | 75 |
| `convertBlobToGrayscale` | Function | `apps/web/src/components/document-tool-panel/useConversionActions.ts` | 61 |
| `handlePdfToImages` | Function | `apps/web/src/components/document-tool-panel/useConversionActions.ts` | 82 |
| `getDocumentToolName` | Function | `apps/web/src/components/document-tool-panel/toolNames.ts` | 0 |
| `toolName` | Function | `apps/web/src/components/DocumentToolPanel.tsx` | 80 |
| `parsePagesInput` | Function | `apps/web/src/components/document-tool-panel/splitParts.ts` | 2 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SplitParts → ParsePagesInput` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "useSplitMergeActions"})` — see callers and callees
2. `gitnexus_query({query: "document-tool-panel"})` — find related execution flows
3. Read key files listed above for implementation details
