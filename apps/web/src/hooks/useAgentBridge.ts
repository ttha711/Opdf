import { useEffect, useMemo, useRef } from "react";
import { LastPdfActionUndo } from "../agent/lastPdfActionUndo";
import {
  AGENT_TOOL_DEFINITIONS,
  createAgentCommandQueue,
  executeAgentCommand,
  getAgentFunctionDeclarations,
  getAgentStateForPrompt,
  type AgentActionContext,
  type AgentCommand,
  type AgentCommandResult,
  type AgentStateSnapshot,
} from "../agent/agentCommands";

export interface TpdfAgentApi {
  version: "1";
  listTools: () => typeof AGENT_TOOL_DEFINITIONS;
  getState: () => ReturnType<typeof getAgentStateForPrompt>;
  getFunctionDeclarations: () => ReturnType<typeof getAgentFunctionDeclarations>;
  execute: (command: AgentCommand) => Promise<AgentCommandResult>;
  executeMany: (commands: AgentCommand[]) => Promise<AgentCommandResult[]>;
}

declare global {
  interface Window {
    tpdfAgent?: TpdfAgentApi;
  }
}

export function useAgentBridge(context: AgentActionContext) {
  const latestContextRef = useRef(context);
  latestContextRef.current = context;

  const undo = useMemo(() => new LastPdfActionUndo(), []);
  const queue = useMemo(
    () => createAgentCommandQueue((command) => {
      const actions = latestContextRef.current.actions;
      if (!actions.captureAgentUndo || !actions.restoreAgentUndo) {
        return executeAgentCommand(command, latestContextRef.current);
      }
      return undo.execute(
        command,
        (item) => executeAgentCommand(item, latestContextRef.current),
        () => latestContextRef.current.actions.captureAgentUndo?.() ?? Promise.resolve(null),
        (snapshot) => latestContextRef.current.actions.restoreAgentUndo!(snapshot),
      );
    }),
    [undo]
  );

  useEffect(() => {
    const api: TpdfAgentApi = {
      version: "1",
      listTools: () => AGENT_TOOL_DEFINITIONS,
      getState: () => getAgentStateForPrompt(latestContextRef.current.state),
      getFunctionDeclarations: () => getAgentFunctionDeclarations(),
      execute: (command) => queue.enqueue(command),
      executeMany: async (commands) => {
        const results: AgentCommandResult[] = [];
        for (const command of commands) {
          results.push(await queue.enqueue(command));
          const last = results[results.length - 1];
          if (last.status === "input_required" || last.status === "confirmation_required" || last.status === "failed") {
            break;
          }
        }
        return results;
      },
    };

    window.tpdfAgent = api;
    return () => {
      if (window.tpdfAgent === api) {
        delete window.tpdfAgent;
      }
    };
  }, [queue]);
}

export function createAgentStateSnapshot(input: AgentStateSnapshot): AgentStateSnapshot {
  return {
    hasDocument: input.hasDocument,
    fileName: input.fileName,
    currentPage: input.currentPage,
    totalPages: input.totalPages,
    activeTool: input.activeTool,
    viewMode: input.viewMode,
    hasDesktopBridge: input.hasDesktopBridge,
  };
}
