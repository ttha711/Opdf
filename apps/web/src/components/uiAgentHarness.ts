import { runAgentHarness, type HarnessCheckpoint } from "../agent/harness";
import type { AgentCommand, AgentCommandResult } from "../agent/agentCommands";

type MachineBridge = { sendQuery: (query: string, context: Record<string, unknown>) => Promise<unknown> };
type AdapterArgs = {
  machineBridge: MachineBridge;
  execute: (command: AgentCommand) => Promise<AgentCommandResult | null>;
  onProgress: (message: string) => void;
};

function bridge() {
  const value = window.tpdfAgent;
  if (!value) throw new Error("TPDF Agent bridge is unavailable.");
  return value;
}

export function createUiAgentHarness({ machineBridge, execute, onProgress }: AdapterArgs) {
  return {
    async run(goal: string, previous?: HarnessCheckpoint, approval?: "approve" | "reject") {
      const agent = bridge();
      return runAgentHarness(previous ?? { goal, observations: [] }, {
        model: (prompt) => machineBridge.sendQuery(prompt, agent.getState() as Record<string, unknown>),
        execute: async (command) => await execute(command) ?? {
          status: "failed", tool: command.tool, message: "TPDF command bridge unavailable.",
        },
        listTools: () => agent.listTools(),
        getState: () => agent.getState(),
        onEvent: ({ action, message }) => onProgress(action + ": " + message),
      }, approval);
    },
  };
}
