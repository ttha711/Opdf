import { useEffect, useState } from "react";
import type { PdfPathCommand } from "@opdf/core";

type PathGeometryEditorProps = {
  commands: PdfPathCommand[];
  disabled?: boolean;
  onApply: (commands: PdfPathCommand[]) => void;
};

function numeric(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function PathGeometryEditor({ commands, disabled, onApply }: PathGeometryEditorProps) {
  const [draft, setDraft] = useState<PdfPathCommand[]>(commands);

  useEffect(() => {
    setDraft(commands);
  }, [commands]);

  const update = (index: number, patch: Partial<PdfPathCommand>) => {
    setDraft((current) => current.map((command, commandIndex) =>
      commandIndex === index ? ({ ...command, ...patch } as PdfPathCommand) : command,
    ));
  };

  const remove = (index: number) => {
    if (index === 0) return;
    setDraft((current) => current.filter((_, commandIndex) => commandIndex !== index));
  };

  const appendLine = () => {
    const last = draft.at(-1);
    const x = last && "x" in last ? last.x + 10 : 10;
    const y = last && "y" in last ? last.y : 10;
    setDraft((current) => [...current, { type: "line", x, y }]);
  };

  if (!draft.length) {
    return <p className="native-content-editor__sub">No editable path segments.</p>;
  }

  return (
    <div className="native-content-editor__path-editor">
      <div className="native-content-editor__meta">
        <strong>Path geometry</strong>
        <span>{draft.length} commands</span>
      </div>

      <div className="native-content-editor__path-commands">
        {draft.map((command, index) => (
          <div className="native-content-editor__path-command" key={index}>
            <div className="native-content-editor__row">
              <strong>{index + 1}. {command.type}</strong>
              {index > 0 ? (
                <button type="button" onClick={() => remove(index)} disabled={disabled}>Remove</button>
              ) : null}
            </div>

            {command.type === "move" || command.type === "line" ? (
              <div className="native-content-editor__row">
                <label>
                  X
                  <input
                    value={command.x}
                    inputMode="decimal"
                    onChange={(event) => update(index, { x: numeric(event.target.value, command.x) })}
                  />
                </label>
                <label>
                  Y
                  <input
                    value={command.y}
                    inputMode="decimal"
                    onChange={(event) => update(index, { y: numeric(event.target.value, command.y) })}
                  />
                </label>
                {command.type === "line" ? (
                  <label>
                    Close
                    <input
                      type="checkbox"
                      checked={Boolean(command.close)}
                      onChange={(event) => update(index, { close: event.target.checked })}
                    />
                  </label>
                ) : null}
              </div>
            ) : (
              <>
                <div className="native-content-editor__row">
                  <label>
                    C1 X
                    <input value={command.x1} inputMode="decimal" onChange={(event) => update(index, { x1: numeric(event.target.value, command.x1) })} />
                  </label>
                  <label>
                    C1 Y
                    <input value={command.y1} inputMode="decimal" onChange={(event) => update(index, { y1: numeric(event.target.value, command.y1) })} />
                  </label>
                </div>
                <div className="native-content-editor__row">
                  <label>
                    C2 X
                    <input value={command.x2} inputMode="decimal" onChange={(event) => update(index, { x2: numeric(event.target.value, command.x2) })} />
                  </label>
                  <label>
                    C2 Y
                    <input value={command.y2} inputMode="decimal" onChange={(event) => update(index, { y2: numeric(event.target.value, command.y2) })} />
                  </label>
                </div>
                <div className="native-content-editor__row">
                  <label>
                    End X
                    <input value={command.x} inputMode="decimal" onChange={(event) => update(index, { x: numeric(event.target.value, command.x) })} />
                  </label>
                  <label>
                    End Y
                    <input value={command.y} inputMode="decimal" onChange={(event) => update(index, { y: numeric(event.target.value, command.y) })} />
                  </label>
                  <label>
                    Close
                    <input type="checkbox" checked={Boolean(command.close)} onChange={(event) => update(index, { close: event.target.checked })} />
                  </label>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="native-content-editor__row">
        <button type="button" onClick={appendLine} disabled={disabled}>Add line point</button>
        <button type="button" className="primary" onClick={() => onApply(draft)} disabled={disabled || draft[0]?.type !== "move"}>
          Apply geometry
        </button>
      </div>
    </div>
  );
}
