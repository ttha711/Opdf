---
name: agent
description: "Skill for the Agent area of Opdf. 14 symbols across 2 files."
---

# Agent

14 symbols | 2 files | Cohesion: 93%

## When to Use

- Working with code in `apps/`
- Understanding how queue, getAgentToolDefinition, executeAgentCommand work
- Modifying agent-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/web/src/agent/agentCommands.ts` | runAgentAction, normalizeDocumentToolOptions, normalizeWatermarkOptions, openPanel, clampPage (+8) |
| `apps/web/src/hooks/useAgentBridge.ts` | queue |

## Entry Points

Start here when exploring this area:

- **`queue`** (Function) — `apps/web/src/hooks/useAgentBridge.ts:32`
- **`getAgentToolDefinition`** (Function) — `apps/web/src/agent/agentCommands.ts:200`
- **`executeAgentCommand`** (Function) — `apps/web/src/agent/agentCommands.ts:245`
- **`createAgentCommandQueue`** (Function) — `apps/web/src/agent/agentCommands.ts:403`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `queue` | Function | `apps/web/src/hooks/useAgentBridge.ts` | 32 |
| `getAgentToolDefinition` | Function | `apps/web/src/agent/agentCommands.ts` | 200 |
| `executeAgentCommand` | Function | `apps/web/src/agent/agentCommands.ts` | 245 |
| `createAgentCommandQueue` | Function | `apps/web/src/agent/agentCommands.ts` | 403 |
| `runAgentAction` | Function | `apps/web/src/agent/agentCommands.ts` | 289 |
| `normalizeDocumentToolOptions` | Function | `apps/web/src/agent/agentCommands.ts` | 342 |
| `normalizeWatermarkOptions` | Function | `apps/web/src/agent/agentCommands.ts` | 352 |
| `openPanel` | Function | `apps/web/src/agent/agentCommands.ts` | 362 |
| `clampPage` | Function | `apps/web/src/agent/agentCommands.ts` | 367 |
| `normalizeViewMode` | Function | `apps/web/src/agent/agentCommands.ts` | 372 |
| `normalizeMarkupOptions` | Function | `apps/web/src/agent/agentCommands.ts` | 376 |
| `normalizePosition` | Function | `apps/web/src/agent/agentCommands.ts` | 392 |
| `numberOption` | Function | `apps/web/src/agent/agentCommands.ts` | 397 |
| `buildConfirmationPrompt` | Function | `apps/web/src/agent/agentCommands.ts` | 280 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Queue → NormalizePosition` | cross_community | 5 |
| `Queue → NumberOption` | cross_community | 5 |
| `Queue → ClampPage` | cross_community | 4 |
| `Queue → NormalizeViewMode` | cross_community | 4 |
| `Queue → OpenPanel` | cross_community | 4 |
| `Queue → GetAgentToolDefinition` | intra_community | 3 |
| `Queue → BuildConfirmationPrompt` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "queue"})` — see callers and callees
2. `gitnexus_query({query: "agent"})` — find related execution flows
3. Read key files listed above for implementation details
