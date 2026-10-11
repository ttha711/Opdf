import type { Dispatch, SetStateAction } from "react";

type Rect = { x: number; y: number; width: number; height: number };
type Props = {
  linkMode: "external" | "internal";
  setLinkMode: (value: "external" | "internal") => void;
  linkPage: number;
  setLinkPage: (page: number) => void;
  destinationPage: number;
  setDestinationPage: (page: number) => void;
  linkUrl: string;
  setLinkUrl: (url: string) => void;
  linkRect: Rect;
  setLinkRect: Dispatch<SetStateAction<Rect>>;
  totalPages: number;
};

export function AdvancedLinkEditorPanel({
  linkMode, setLinkMode, linkPage, setLinkPage, destinationPage,
  setDestinationPage, linkUrl, setLinkUrl, linkRect, setLinkRect, totalPages,
}: Props) {
  const inputStyle = "mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm";
  return (
    <div className="space-y-3">
      <p className="rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] p-2 text-xs">
        Link coordinates are percentages from the top-left of the page.
        Link areas are invisible in the exported PDF.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold">Link type
          <select value={linkMode} onChange={e => setLinkMode(e.target.value as "external" | "internal")} className={inputStyle}>
            <option value="external">External URL</option>
            <option value="internal">Internal page</option>
          </select>
        </label>
        <label className="block text-xs font-semibold">Source page
          <input type="number" min={1} max={Math.max(1,totalPages)} value={linkPage}
            onChange={e => setLinkPage(Number(e.target.value) || 1)} className={inputStyle} />
        </label>
      </div>
      {linkMode === "external" ? (
        <label className="block text-xs font-semibold">URL
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputStyle} />
        </label>
      ) : (
        <label className="block text-xs font-semibold">Destination page
          <input type="number" min={1} max={Math.max(1,totalPages)} value={destinationPage}
            onChange={e => setDestinationPage(Number(e.target.value) || 1)} className={inputStyle} />
        </label>
      )}
      <div className="grid grid-cols-4 gap-2">
        {(["x","y","width","height"] as const).map(key => (
          <label key={key} className="text-xs font-semibold capitalize">{key} %
            <input type="number" min={0} max={100} value={linkRect[key]} className={inputStyle}
              onChange={e => setLinkRect(current => ({...current,[key]:Number(e.target.value) || 0}))} />
          </label>
        ))}
      </div>
    </div>
  );
}
