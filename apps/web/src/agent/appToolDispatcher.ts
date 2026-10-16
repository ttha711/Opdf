import type { AgentToolId } from "./types";

export type AgentAppToolHandlers = {
  print: () => void;
  compare: () => void;
  redact: () => void;
  sign: () => void;
  advanced: () => void;
};

export function dispatchAgentAppTool(toolId: AgentToolId, handlers: AgentAppToolHandlers) {
  switch (toolId) {
    case "print-pdf": handlers.print(); break;
    case "compare-pdf": handlers.compare(); break;
    case "redact-pdf": handlers.redact(); break;
    case "sign-pdf": handlers.sign(); break;
    case "advanced-pdf": handlers.advanced(); break;
  }
}
