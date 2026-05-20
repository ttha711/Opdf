import { useEffect, useMemo, useState } from "react";
import { generateAiPatch } from "./live-editor/aiPatchService";
import { blocksToHtml, htmlToBlocks } from "./live-editor/transform";
import type { EditorBlock } from "./live-editor/types";

const DEFAULT_BLOCKS: EditorBlock[] = [
  { id: "block_1", type: "heading", content: "Quarterly Operations Report", html: "<h2>Quarterly Operations Report</h2>", style: { font: "Noto Sans", size: 18, color: "#111827", lineHeight: 1.35 } },
  { id: "block_2", type: "paragraph", content: "This report summarizes staffing, delivery milestones, and budget variance across all active teams.", html: "<p>This report summarizes staffing, delivery milestones, and budget variance across all active teams.</p>", style: { font: "Noto Sans", size: 12, color: "#1f2937", lineHeight: 1.5 } },
  { id: "block_3", type: "list", content: "Highlights:\n- Delivery SLA reached 97.8%\n- Cost variance reduced by 6.4%\n- Incident MTTR improved to 34 minutes", html: "<ul><li>Delivery SLA reached 97.8%</li><li>Cost variance reduced by 6.4%</li><li>Incident MTTR improved to 34 minutes</li></ul>", style: { font: "Noto Sans", size: 11, color: "#111827", lineHeight: 1.5 } },
];

interface LiveHtmlEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialHtml?: string | null;
}

export function LiveHtmlEditor({ isOpen, onClose, initialHtml }: LiveHtmlEditorProps) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(DEFAULT_BLOCKS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDebugHtml, setShowDebugHtml] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const selectedBlocks = useMemo(() => blocks.filter((b) => selectedIds.includes(b.id)), [blocks, selectedIds]);

  useEffect(() => {
    if (!initialHtml) return;
    const parsed = htmlToBlocks(initialHtml);
    if (parsed.length > 0) {
      setBlocks(parsed);
      setSelectedIds([]);
    }
  }, [initialHtml]);

  if (!isOpen) return null;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const updateBlockHtml = (id: string, html: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, html, content: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() } : b)));
  };

  const applyAiPatch = async () => {
    if (!prompt.trim()) return;
    setIsApplying(true);
    try {
      const patch = await generateAiPatch({ prompt, selectedBlocks, allBlocks: blocks, referenceImage });
      setBlocks((prev) =>
        prev.map((b) => {
          const update = patch.updates.find((u) => u.id === b.id);
          if (!update) return b;
          const merged = { ...b, ...update } as EditorBlock;
          return {
            ...merged,
            content: (update.content ?? merged.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
          };
        }),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setIsApplying(false);
    }
  };

  const saveTextFile = async (bytes: Uint8Array, defaultName: string, extensions: string[]) => {
    if (window.opdf?.saveFile) {
      await window.opdf.saveFile(bytes, defaultName, extensions);
      return;
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = defaultName;
    link.click();
  };

  const exportHtml = async () => {
    const html = blocksToHtml(blocks);
    await saveTextFile(new TextEncoder().encode(html), "live-editor-export.html", ["html"]);
  };

  const exportDocx = async () => {
    const { Document, Packer, Paragraph } = await import("docx");
    const children = blocks.map((block) => new Paragraph(block.content || " "));
    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    await saveTextFile(new Uint8Array(await blob.arrayBuffer()), "live-editor-export.docx", ["docx"]);
  };

  const exportPdf = async () => {
    const pdfLib = await import("pdf-lib");
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const block of blocks) {
      const text = block.content || "";
      const fontSize = block.type === "heading" ? 16 : 11;
      page.drawText(text.slice(0, 1600), { x: 50, y, size: fontSize });
      y -= block.type === "heading" ? 28 : 20;
      if (y < 70) break;
    }
    await saveTextFile(await doc.save(), "live-editor-export.pdf", ["pdf"]);
  };

  return (
    <div className="live-editor-overlay">
      <div className="live-editor-modal">
        <div className="live-editor-header">
          <h3>Live HTML Editor</h3>
          <div className="live-editor-actions">
            <button type="button" onClick={() => setShowDebugHtml((v) => !v)}>{showDebugHtml ? "Hide HTML" : "Show HTML"}</button>
            <button type="button" onClick={exportHtml}>Export HTML</button>
            <button type="button" onClick={exportDocx}>Export DOCX</button>
            <button type="button" onClick={exportPdf}>Export PDF</button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="live-editor-body">
          <div className="live-editor-canvas">
            {blocks.map((block) => (
              <article key={block.id} className={`live-editor-block ${selectedIds.includes(block.id) ? "selected" : ""}`} onClick={() => toggleSelected(block.id)}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  className="live-editor-content"
                  style={{ fontFamily: block.style.font, fontSize: `${block.style.size}px`, color: block.style.color, lineHeight: block.style.lineHeight }}
                  dangerouslySetInnerHTML={{ __html: block.html }}
                  onBlur={(e) => updateBlockHtml(block.id, e.currentTarget.innerHTML)}
                />
                {showDebugHtml && (
                  <pre className="live-editor-debug">{block.html}</pre>
                )}
              </article>
            ))}
          </div>

          <aside className="live-editor-sidebar">
            <h4>AI Actions</h4>
            <p>Selected blocks: {selectedBlocks.length || blocks.length}</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ví dụ: đổi thành heading, font Noto Sans, giữ layout bảng, tạo bullet rõ ràng..."
            />
            <label className="live-editor-upload-label">
              Attach reference image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setReferenceImage(typeof reader.result === "string" ? reader.result : null);
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {referenceImage ? <small>Reference image attached.</small> : null}
            <button type="button" onClick={applyAiPatch} disabled={isApplying || !prompt.trim()}>
              {isApplying ? "Applying..." : "Apply AI Patch"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
