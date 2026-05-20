import type { AgentStateSnapshot } from "./types";
import { AGENT_TOOL_DEFINITIONS } from "./definitions";

export function getAgentStateForPrompt(state: AgentStateSnapshot) {
  return {
    hasDocument: state.hasDocument,
    fileName: state.fileName,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    activeTool: state.activeTool,
    viewMode: state.viewMode,
    runtime: state.hasDesktopBridge ? "desktop" : "browser",
  };
}

export function getAgentFunctionDeclarations() {
  return [
    {
      name: "execute_opdf_tool",
      description: "Execute one Opdf app tool directly through the internal command layer. If the result asks for input or confirmation, ask the user and call again with the missing args or confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: AGENT_TOOL_DEFINITIONS.map((definition) => definition.id),
            description: "The Opdf tool or app action to run.",
          },
          args: {
            type: "object",
            description: "Tool-specific arguments. Check tool definitions for requiredArgs and optionalArgs.",
            additionalProperties: true,
          },
          confirmed: {
            type: "boolean",
            description: "Set true only after the user confirms a destructive command.",
          },
        },
        required: ["tool"],
      },
    },
  ];
}
