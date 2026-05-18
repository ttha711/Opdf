---
name: components
description: "Skill for the Components area of Opdf. 89 symbols across 24 files."
---

# Components

89 symbols | 24 files | Cohesion: 90%

## When to Use

- Working with code in `apps/`
- Understanding how checkAndParseCommand, addMessage, executeCommand work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/web/src/components/AllToolsDashboard.tsx` | AllToolsDashboard, triggerFileInput, convertPdfToImages, downloadZippedImages, convertPdfToOffice (+6) |
| `apps/web/src/components/AiAssistantPanel.hooks.ts` | addMessage, executeCommand, processLocalQuery, processDifyQuery, handleAgentResult (+5) |
| `apps/web/src/components/useFabricDrawing.ts` | clamp, getCanvasPoint, updatePreview, commitDraw, onPointerDown (+5) |
| `apps/web/src/components/TabBar.tsx` | TabBar, handleTabContextMenu, handleGroupBadgeClick, handleOpenGroupInNewWindow, handleCreateNewGroup (+1) |
| `apps/web/src/components/AiAssistantPanel.parts.tsx` | MarkdownMessage, formatInline, SettingsPanel, ChatMessageBubble, SuggestionChips (+1) |
| `apps/web/src/components/MergeModal.tsx` | MergeModal, formatSize, moveUp, moveDown, removeFile (+1) |
| `apps/web/src/components/PdfViewer.hooks.ts` | useContinuousLoading, useThumbnailRefresh, getThumbnailScale, usePdfDataLoader, timeout |
| `apps/web/src/components/ThumbnailPanel.tsx` | ThumbnailImage, ThumbnailPanel, saveBookmarkTitle, deleteBookmark, toggleBookmarkForPage |
| `apps/web/src/components/FabricPage.tsx` | FabricPage, pageAnnotations, computeAnchor, selectFabricObject |
| `apps/web/src/components/PdfViewer.utils.ts` | isRenderingCancelled, canvasToBlob, drawAnnotationsToCanvas, getNormalizedRect |

## Entry Points

Start here when exploring this area:

- **`checkAndParseCommand`** (Function) — `apps/web/src/components/AiAssistantPanel.utils.ts:14`
- **`addMessage`** (Function) — `apps/web/src/components/AiAssistantPanel.hooks.ts:134`
- **`executeCommand`** (Function) — `apps/web/src/components/AiAssistantPanel.hooks.ts:147`
- **`processLocalQuery`** (Function) — `apps/web/src/components/AiAssistantPanel.hooks.ts:167`
- **`processDifyQuery`** (Function) — `apps/web/src/components/AiAssistantPanel.hooks.ts:204`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `checkAndParseCommand` | Function | `apps/web/src/components/AiAssistantPanel.utils.ts` | 14 |
| `addMessage` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 134 |
| `executeCommand` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 147 |
| `processLocalQuery` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 167 |
| `processDifyQuery` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 204 |
| `handleAgentResult` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 322 |
| `handleConfirmInline` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 351 |
| `handleUserQuery` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 378 |
| `handleSubmit` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 407 |
| `handleSuggestionClick` | Function | `apps/web/src/components/AiAssistantPanel.hooks.ts` | 421 |
| `clamp` | Function | `apps/web/src/components/useFabricDrawing.ts` | 45 |
| `getCanvasPoint` | Function | `apps/web/src/components/useFabricDrawing.ts` | 50 |
| `updatePreview` | Function | `apps/web/src/components/useFabricDrawing.ts` | 63 |
| `commitDraw` | Function | `apps/web/src/components/useFabricDrawing.ts` | 109 |
| `onPointerDown` | Function | `apps/web/src/components/useFabricDrawing.ts` | 148 |
| `onPointerMove` | Function | `apps/web/src/components/useFabricDrawing.ts` | 205 |
| `onDocumentPointerMove` | Function | `apps/web/src/components/useFabricDrawing.ts` | 212 |
| `onPointerUp` | Function | `apps/web/src/components/useFabricDrawing.ts` | 218 |
| `onDocumentPointerUp` | Function | `apps/web/src/components/useFabricDrawing.ts` | 226 |
| `ToolIconButton` | Function | `apps/web/src/components/ToolIconButton.tsx` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AiAssistantPanel → FormatInline` | intra_community | 4 |
| `HandleSubmit → AddMessage` | intra_community | 4 |
| `HandleSuggestionClick → AddMessage` | intra_community | 4 |
| `PdfPageStage → ClearMenu` | cross_community | 4 |
| `AllToolsDashboard → RunPdfToOfficeMock` | cross_community | 4 |
| `AllToolsDashboard → TriggerFileInput` | intra_community | 4 |
| `AllToolsDashboard → DownloadZippedImages` | intra_community | 4 |
| `OnPointerUp → Clamp` | intra_community | 3 |
| `HandleConfirmInline → AddMessage` | intra_community | 3 |
| `PdfViewer → GetThumbnailScale` | cross_community | 3 |

## How to Explore

1. `gitnexus_context({name: "checkAndParseCommand"})` — see callers and callees
2. `gitnexus_query({query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
