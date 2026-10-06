import type { ActiveTool } from "../lib/app-types";
import { OpdfIcon, type OpdfIconName } from "./OpdfIcon";

type ViewerQuickToolsProps = {
  activeTool: ActiveTool;
  onActiveToolChange: (tool: ActiveTool) => void;
};

type QuickTool = {
  id: ActiveTool;
  label: string;
  icon: OpdfIconName;
};

const tools: QuickTool[] = [
  { id: "highlight", label: "Highlight", icon: "highlight" },
  { id: "note", label: "Note", icon: "note" },
  { id: "text", label: "Text", icon: "text" },
  { id: "draw", label: "Draw", icon: "draw" },
  { id: "shape", label: "Rectangle", icon: "rectangle" },
  { id: "signature", label: "Signature", icon: "signature" },
  { id: "redact", label: "Redact", icon: "redact" },
  { id: "measure", label: "Measure", icon: "measure" },
];

export function ViewerQuickTools({ activeTool, onActiveToolChange }: ViewerQuickToolsProps) {
  return (
    <div
      className="viewer-quick-tools"
      role="toolbar"
      aria-label="Quick PDF tools"
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={"viewer-quick-tool" + (activeTool === tool.id ? " active" : "")}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          onClick={() => onActiveToolChange(tool.id)}
        >
          <OpdfIcon name={tool.icon} size={18} />
        </button>
      ))}
    </div>
  );
}
