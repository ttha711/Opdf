import type { AgentCommand } from "../agent/agentCommands";

export interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: Date;
  isPending?: boolean;
  toolLogs?: string;
  confirmation?: AgentCommand;
}

export interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  align?: "left" | "right";
  onOpenLiveEditor?: () => void;
}

export type EngineMode = "local" | "dify" | "iframe";
