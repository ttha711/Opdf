import type { AgentCommand, AgentCommandResult } from "./types";

export function createAgentCommandQueue(
  handler: (command: AgentCommand) => Promise<AgentCommandResult>
) {
  let tail = Promise.resolve();
  return {
    enqueue(command: AgentCommand): Promise<AgentCommandResult> {
      const run = tail.then(() => handler(command));
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}
