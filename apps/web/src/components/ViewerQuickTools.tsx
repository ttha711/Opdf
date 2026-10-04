import { useState } from "react";

type ViewerQuickToolsProps = {
  registry: any;
  documentId: string;
};

type QuickTool = {
  id: string;
  label: string;
  command: string;
  icon: React.ReactNode;
};

const iconProps = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const tools: QuickTool[] = [
  {
    id: "highlight",
    label: "Highlight",
    command: "annotation:add-highlight",
    icon: <svg {...iconProps}><path d="m6 15 7.8-7.8 3 3L9 18H6v-3Z" /><path d="M4 20h8" /></svg>,
  },
  {
    id: "note",
    label: "Note",
    command: "annotation:add-note",
    icon: <svg {...iconProps}><path d="M5 4h14v12H9l-4 4V4Z" /><path d="M8 8h8M8 12h5" /></svg>,
  },
  {
    id: "text",
    label: "Text",
    command: "annotation:add-text",
    icon: <svg {...iconProps}><path d="M5 5h14M12 5v14M8 19h8" /></svg>,
  },
  {
    id: "draw",
    label: "Draw",
    command: "annotation:add-ink",
    icon: <svg {...iconProps}><path d="M4 18c3-7 5-9 7-9 2.5 0 1 6 3.5 6 1.4 0 2.2-1.3 5.5-5" /></svg>,
  },
  {
    id: "rectangle",
    label: "Rectangle",
    command: "annotation:add-rectangle",
    icon: <svg {...iconProps}><rect x="5" y="6" width="14" height="12" rx="1" /></svg>,
  },
  {
    id: "signature",
    label: "Signature",
    command: "insert:add-signature",
    icon: <svg {...iconProps}><path d="M4 17c2-5 3.5-8 5-8 1.2 0 .2 5 1.5 5 1 0 2-3 3-3 1.2 0 .4 3 1.8 3 1.1 0 1.7-1 4.7-4" /><path d="M4 20h16" /></svg>,
  },
  {
    id: "redact",
    label: "Redact",
    command: "redaction:redact",
    icon: <svg {...iconProps}><rect x="4" y="7" width="16" height="10" rx="1" /><path d="M7 10h10M7 14h7" /></svg>,
  },
];

export function ViewerQuickTools({ registry, documentId }: ViewerQuickToolsProps) {
  const [active, setActive] = useState<string | null>(null);

  const execute = (tool: QuickTool) => {
    const commands = registry?.getPlugin?.("commands")?.provides?.();
    const scope = commands?.forDocument?.(documentId) ?? commands;
    scope?.execute?.(tool.command, "opdf-quick-tools");
    setActive(tool.id);
  };

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
          className={"viewer-quick-tool" + (active === tool.id ? " active" : "")}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={active === tool.id}
          onClick={() => execute(tool)}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
