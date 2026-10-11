type Layer = { name?: string; visible?: boolean };
type Font = { name?: string; kind?: string; embedded?: boolean; subset?: boolean; encoding?: string };
type Attachment = { name?: string; description?: string; size?: number };

export type PdfInventory = {
  layers?: Layer[];
  fonts?: Font[];
  attachments?: Attachment[];
};

export function PdfStructureInventory({ inventory }: { inventory: PdfInventory }) {
  const layers = inventory.layers ?? [];
  const fonts = inventory.fonts ?? [];
  const attachments = inventory.attachments ?? [];
  return (
    <section data-opdf-document-inventory="true" className="space-y-2">
      <h5 className="font-bold">PDF content inventory</h5>
      <p className="text-[11px] text-[var(--text-secondary)]">
        Read-only information from PdfCraft. Layer visibility reflects the saved document,
        not changes made in the current viewer.
      </p>
      <details className="rounded border border-[var(--border-color)] p-2" open={layers.length > 0}>
        <summary className="cursor-pointer font-semibold">Layers ({layers.length})</summary>
        {layers.length === 0 ? <p className="mt-1 text-[var(--text-secondary)]">No optional content layers detected.</p> :
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {layers.slice(0, 200).map((layer, index) => (
              <li key={index} className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] pt-1">
                <span className="min-w-0 truncate" title={layer.name || ""}>{layer.name || "Unnamed layer"}</span>
                <span className="shrink-0 text-[var(--text-secondary)]">{layer.visible ? "Visible" : "Hidden"}</span>
              </li>
            ))}
            {layers.length > 200 && <li>Showing first 200 of {layers.length} layers</li>}
          </ul>}
      </details>
      <details className="rounded border border-[var(--border-color)] p-2">
        <summary className="cursor-pointer font-semibold">Fonts ({fonts.length})</summary>
        {fonts.length === 0 ? <p className="mt-1 text-[var(--text-secondary)]">No fonts reported.</p> :
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {fonts.slice(0, 200).map((font, index) => (
              <li key={index} className="border-t border-[var(--border-color)] pt-1">
                <span className="break-all">{font.name || "Unknown font"}</span>
                <span className="ml-2 text-[var(--text-secondary)]">
                  {font.kind || "Unclassified"} · {font.embedded ? "Embedded" : "Not embedded"}
                  {font.subset ? " · Subset" : ""}
                </span>
              </li>
            ))}
            {fonts.length > 200 && <li>Showing first 200 of {fonts.length} fonts</li>}
          </ul>}
      </details>
      <details className="rounded border border-[var(--border-color)] p-2">
        <summary className="cursor-pointer font-semibold">Attachments ({attachments.length})</summary>
        {attachments.length === 0 ? <p className="mt-1 text-[var(--text-secondary)]">No embedded attachments detected.</p> :
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {attachments.slice(0, 100).map((file, index) => (
              <li key={index} className="border-t border-[var(--border-color)] pt-1">
                <span className="break-all">{file.name || "Unnamed attachment"}</span>
                {typeof file.size === "number" ? <span className="ml-2 text-[var(--text-secondary)]">
                  {file.size.toLocaleString()} bytes
                </span> : null}
              </li>
            ))}
            {attachments.length > 100 && <li>Showing first 100 of {attachments.length} attachments</li>}
          </ul>}
      </details>
    </section>
  );
}
