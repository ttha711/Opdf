---
name: hooks
description: "Skill for the Hooks area of Opdf. 67 symbols across 22 files."
---

# Hooks

67 symbols | 22 files | Cohesion: 86%

## When to Use

- Working with code in `apps/`
- Understanding how useViewerControls, usePdfDrop, useOpdfBridge work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/web/src/hooks/useOpdfBridge.ts` | createMockBridge, useOpdfBridge, loadPdfLib, watermarkPdf, mergePdfs (+14) |
| `apps/web/src/lib/web-storage.ts` | getDB, saveTabsList, saveActiveTabId, savePdfBytes, saveWebState (+4) |
| `apps/web/src/hooks/useViewerControls.ts` | useViewerControls, goPrevPage, goNextPage, onViewerWheel |
| `apps/web/src/hooks/useDocumentLifecycle.ts` | useDocumentLifecycle, loadDevFile, loadBrowserFile, onSelectLocalFile |
| `apps/web/src/hooks/useDocumentActions.ts` | useDocumentActions, runDocumentTool, runConfiguredDocumentTool, runConfiguredMarkupTool |
| `apps/web/src/hooks/useAppState.ts` | useAppState, switchTab, closeTab, closeTabGroup |
| `apps/web/src/hooks/useAgentBridge.ts` | useAgentBridge, createAgentStateSnapshot, getState, getFunctionDeclarations |
| `apps/web/src/hooks/useAppEffects.ts` | timeout, useAppEffects, initTabs |
| `apps/web/src/lib/document-tools.ts` | parsePageList, pickBrowserPdfBytes |
| `apps/web/src/agent/agentCommands.ts` | getAgentStateForPrompt, getAgentFunctionDeclarations |

## Entry Points

Start here when exploring this area:

- **`useViewerControls`** (Function) — `apps/web/src/hooks/useViewerControls.ts:3`
- **`usePdfDrop`** (Function) — `apps/web/src/hooks/usePdfDrop.ts:12`
- **`useOpdfBridge`** (Function) — `apps/web/src/hooks/useOpdfBridge.ts:370`
- **`useDocumentLifecycle`** (Function) — `apps/web/src/hooks/useDocumentLifecycle.ts:4`
- **`loadDevFile`** (Function) — `apps/web/src/hooks/useDocumentLifecycle.ts:108`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useViewerControls` | Function | `apps/web/src/hooks/useViewerControls.ts` | 3 |
| `usePdfDrop` | Function | `apps/web/src/hooks/usePdfDrop.ts` | 12 |
| `useOpdfBridge` | Function | `apps/web/src/hooks/useOpdfBridge.ts` | 370 |
| `useDocumentLifecycle` | Function | `apps/web/src/hooks/useDocumentLifecycle.ts` | 4 |
| `loadDevFile` | Function | `apps/web/src/hooks/useDocumentLifecycle.ts` | 108 |
| `useDocumentActions` | Function | `apps/web/src/hooks/useDocumentActions.ts` | 39 |
| `useAppViewModel` | Function | `apps/web/src/hooks/useAppViewModel.ts` | 7 |
| `useAppState` | Function | `apps/web/src/hooks/useAppState.ts` | 6 |
| `useAppMenus` | Function | `apps/web/src/hooks/useAppMenus.ts` | 5 |
| `useAnnotationActions` | Function | `apps/web/src/hooks/useAnnotationActions.ts` | 5 |
| `useAgentBridge` | Function | `apps/web/src/hooks/useAgentBridge.ts` | 28 |
| `createAgentStateSnapshot` | Function | `apps/web/src/hooks/useAgentBridge.ts` | 66 |
| `App` | Function | `apps/web/src/App.tsx` | 29 |
| `StatusBar` | Function | `apps/web/src/components/StatusBar.tsx` | 2 |
| `SplitModal` | Function | `apps/web/src/components/SplitModal.tsx` | 18 |
| `RightInfoPanel` | Function | `apps/web/src/components/RightInfoPanel.tsx` | 2 |
| `OverlayEditors` | Function | `apps/web/src/components/OverlayEditors.tsx` | 2 |
| `IntegratedUploadWorkspace` | Function | `apps/web/src/components/IntegratedUploadWorkspace.tsx` | 7 |
| `FindBar` | Function | `apps/web/src/components/FindBar.tsx` | 10 |
| `DocumentMarkupModal` | Function | `apps/web/src/components/DocumentMarkupModal.tsx` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UseAppEffects → GetDB` | cross_community | 4 |
| `App → CreateMockBridge` | intra_community | 3 |
| `App → LoadDevFile` | intra_community | 3 |
| `Timeout → GetDB` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Components | 6 calls |
| Document-tool-panel | 1 calls |

## How to Explore

1. `gitnexus_context({name: "useViewerControls"})` — see callers and callees
2. `gitnexus_query({query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
