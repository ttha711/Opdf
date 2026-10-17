import { runAgentHarness, type HarnessCheckpoint } from "../agent/harness";
import { raceAbort } from "../agent/raceAbort";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";

type MachineBridge = { sendQuery: (query: string, context: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown> };
type AdapterArgs = {
  machineBridge: MachineBridge;
  execute: (command: AgentCommand) => Promise<AgentCommandResult | null>;
  onProgress: (message: string) => void;
  isCancelled?: () => boolean;
};

function bridge() {
  const value = window.tpdfAgent;
  if (!value) throw new Error("TPDF Agent bridge is unavailable.");
  return value;
}

export function createUiAgentHarness({ machineBridge, execute, onProgress, isCancelled }: AdapterArgs) {
  return {
    async run(goal: string, previous?: HarnessCheckpoint, approval?: "approve" | "reject", cancelled?: () => boolean, signal?: AbortSignal) {
      const agent = bridge();
      return runAgentHarness(previous ?? { goal, observations: [] }, {
        model: (prompt) => {
          if (signal?.aborted) return Promise.reject(Object.assign(new Error("Agent task cancelled."), { name: "AbortError" }));
          return raceAbort(machineBridge.sendQuery(prompt, agent.getState() as Record<string, unknown>, signal), signal);
        },
        execute: async (command) => await execute(command) ?? {
          status: "failed", tool: command.tool, message: "TPDF command bridge unavailable.",
        },
        listTools: () => agent.listTools(),
        getState: () => agent.getState(),
        onEvent: ({ action, message }) => onProgress(action + ": " + message),
        isCancelled: cancelled ?? isCancelled,
      }, approval);
    },
  };
}
