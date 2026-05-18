import { useEffect, useMemo, useRef } from "react";
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

export interface OpdfAgentApi {
  version: "1";
  listTools: () => typeof AGENT_TOOL_DEFINITIONS;
  getState: () => ReturnType<typeof getAgentStateForPrompt>;
  getFunctionDeclarations: () => ReturnType<typeof getAgentFunctionDeclarations>;
  execute: (command: AgentCommand) => Promise<AgentCommandResult>;
  executeMany: (commands: AgentCommand[]) => Promise<AgentCommandResult[]>;
}

declare global {
  interface Window {
    opdfAgent?: OpdfAgentApi;
  }
}

export function useAgentBridge(context: AgentActionContext) {
  const latestContextRef = useRef(context);
  latestContextRef.current = context;

  const queue = useMemo(
    () => createAgentCommandQueue((command) => executeAgentCommand(command, latestContextRef.current)),
    []
  );

  useEffect(() => {
    const api: OpdfAgentApi = {
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

    window.opdfAgent = api;
    return () => {
      if (window.opdfAgent === api) {
        delete window.opdfAgent;
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
