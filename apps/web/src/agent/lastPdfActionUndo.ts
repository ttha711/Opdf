import type { AgentCommand, AgentCommandResult, AgentToolId } from "./types";

export type PdfUndoSnapshot = {
  fileName: string;
  sourceIdentity: string;
  page: number;
  bytes: Uint8Array;
  annotations: unknown[];
};

type SnapshotReader = () => Promise<PdfUndoSnapshot | null>;
type Restore = (snapshot: PdfUndoSnapshot) => Promise<void>;

const EDITING_TOOLS = new Set<AgentToolId>([
  "replace-text", "compress-pdf", "run-ocr", "ocr-pdf",
  "rotate-all-left", "rotate-all-right", "delete-pages", "insert-pdf",
  "crop-current", "crop-pdf", "encrypt", "decrypt", "protect-pdf",
  "unlock-pdf", "normalize", "page-numbers", "header", "footer",
  "bates", "watermark-pdf",
]);
const MAX_UNDO_BYTES = 80 * 1024 * 1024;

export function isPdfEditingTool(tool: AgentToolId) {
  return EDITING_TOOLS.has(tool);
}

async function digest(snapshot: PdfUndoSnapshot): Promise<string> {
  const bytes = snapshot.bytes;
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}

type UndoEntry = {
  before: PdfUndoSnapshot;
  afterHash: string;
  fileName: string;
};

export class LastPdfActionUndo {
  private entry: UndoEntry | null = null;

  async execute(
    command: AgentCommand,
    run: (command: AgentCommand) => Promise<AgentCommandResult>,
    capture: SnapshotReader,
    restore: Restore,
  ): Promise<AgentCommandResult> {
    if (command.tool === "undo-last-agent-action") {
      return this.undo(capture, restore);
    }
    if (!isPdfEditingTool(command.tool)) return run(command);

    // A preliminary destructive command only asks for approval.
    if (!command.confirmed && ["replace-text", "delete-pages", "crop-current", "encrypt", "decrypt", "protect-pdf", "unlock-pdf", "crop-pdf"].includes(command.tool)) {
      return run(command);
    }

    const before = await capture().catch(() => null);
    const result = await run(command);
    if (result.status !== "completed") return result;

    // A completed editing operation supersedes the preceding undo slot.
    this.entry = null;
    if (!before || before.bytes.byteLength > MAX_UNDO_BYTES) return result;

    // Allow React's document replacement to commit before checking new bytes.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = await capture().catch(() => null);
    if (!after || after.fileName !== before.fileName) return result;

    const [beforeHash, afterHash] = await Promise.all([digest(before), digest(after)]);
    if (beforeHash === afterHash) return result;
    this.entry = {
      before: { ...before, bytes: before.bytes.slice() },
      afterHash,
      fileName: after.fileName,
    };
    return result;
  }

  private async undo(capture: SnapshotReader, restore: Restore): Promise<AgentCommandResult> {
    const tool = "undo-last-agent-action" as const;
    const entry = this.entry;
    if (!entry) return { tool, status: "input_required", message: "No recent PDF-editing command can be undone." };
    const current = await capture().catch(() => null);
    if (!current || current.fileName !== entry.fileName || (await digest(current)) !== entry.afterHash) {
      this.entry = null;
      return {
        tool, status: "failed",
        message: "The document changed since the last AI edit. Undo was not applied to avoid overwriting newer changes.",
      };
    }
    await restore(entry.before);
    this.entry = null;
    return { tool, status: "completed", message: "Reverted only the most recent completed AI PDF-editing command." };
  }
}
