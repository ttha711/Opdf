import { useEffect, useMemo, useRef, useState } from "react";
import { generateAiPatch } from "./live-editor/aiPatchService";
import { blocksToHtml, htmlToBlocks } from "./live-editor/transform";
import type { EditorBlock } from "./live-editor/types";

type ChatMsg = { id: string; sender: "user" | "assistant"; text: string };

type BootstrapPayload = {
  fileName?: string;
  docBytes?: Uint8Array | number[];
};

const toContent = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const cloneBytes = (bytes: Uint8Array) => new Uint8Array(bytes);
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatStructuredHtml = (raw: string): { type: EditorBlock["type"]; html: string; content: string } => {
  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length === 0) return { type: "paragraph", html: "<p></p>", content: "" };

  const isBullet = (s: string) => /^([\-*•]\s+|\d+[\.\)]\s+)/.test(s);
  const stripBullet = (s: string) => s.replace(/^([\-*•]\s+|\d+[\.\)]\s+)/, "").trim();
  const isHeading = (s: string) =>
    s.length <= 90 &&
    (/^[A-Z0-9][A-Z0-9\s:().,\-]+$/.test(s) || /^(chapter|section|heading|title)\b/i.test(s));

  if (lines.every(isBullet) && lines.length >= 2) {
    const items = lines.map((line) => `<li>${escapeHtml(stripBullet(line))}</li>`).join("");
    const content = lines.map(stripBullet).join(" ");
    return { type: "list", html: `<ul>${items}</ul>`, content };
  }

  const first = lines[0];
  if (isHeading(first)) {
    const rest = lines.slice(1);
    const heading = `<h3>${escapeHtml(first)}</h3>`;
    if (rest.length === 0) return { type: "heading", html: heading, content: first };
    const body = rest.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    return { type: "heading", html: `${heading}${body}`, content: [first, ...rest].join(" ") };
  }

  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  return { type: "paragraph", html: paragraphs, content: lines.join(" ") };
};

const extractLooseText = (value: unknown, depth = 0): string | null => {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const got = extractLooseText(item, depth + 1);
      if (got) return got;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = ["html", "content", "answer", "output", "message", "text", "result", "data"];
    for (const key of keys) {
      const got = extractLooseText(obj[key], depth + 1);
      if (got) return got;
    }
    for (const key of Object.keys(obj)) {
      const got = extractLooseText(obj[key], depth + 1);
      if (got) return got;
    }
  }
  return null;
};

export function AiRewriteEditorWindow() {
  const [fileName, setFileName] = useState("Untitled");
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [contextPrompt, setContextPrompt] = useState("");
  const [contextUI, setContextUI] = useState<{ x: number; y: number; blockId: string } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [lastSourceBytesSnapshot, setLastSourceBytesSnapshot] = useState<number[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBlocks = useMemo(() => blocks.filter((b) => b.id === selectedBlockId), [blocks, selectedBlockId]);

  useEffect(() => {
    const bootstrap =
      window.opener?.__opdfAiEditorGetBootstrap?.() ??
      window.opener?.__opdfAiEditorBootstrap ??
      window.__opdfAiEditorBootstrap;
    if (!bootstrap) return;
    setFileName(bootstrap.fileName || "Untitled");
    if (bootstrap.docBytes && bootstrap.docBytes.length > 0) {
      const typed = bootstrap.docBytes instanceof Uint8Array ? bootstrap.docBytes : new Uint8Array(bootstrap.docBytes);
      setLastSourceBytesSnapshot(Array.from(typed));
      void loadPdfToBlocks(typed);
    }
  }, []);

  const parsePdfToBlocks = async (bytes: Uint8Array): Promise<EditorBlock[]> => {
    const pdfjs = await import("pdfjs-dist");
    const pdf = await pdfjs.getDocument({ data: cloneBytes(bytes) }).promise;
    const next: EditorBlock[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = Array.isArray(textContent.items) ? textContent.items : [];
      const positioned = items
        .map((it: any) => ({
          text: String(it?.str || "").trim(),
          x: Number(it?.transform?.[4] ?? 0),
          y: Number(it?.transform?.[5] ?? 0),
        }))
        .filter((it) => it.text.length > 0)
        .sort((a, b) => (Math.abs(b.y - a.y) > 1 ? b.y - a.y : a.x - b.x));
      if (positioned.length === 0) continue;

      const lines: string[] = [];
      let currentY = positioned[0].y;
      let current: string[] = [];
      for (const token of positioned) {
        if (Math.abs(token.y - currentY) > 3) {
          if (current.length > 0) lines.push(current.join(" ").replace(/\s+/g, " ").trim());
          current = [token.text];
          currentY = token.y;
        } else {
          current.push(token.text);
        }
      }
      if (current.length > 0) lines.push(current.join(" ").replace(/\s+/g, " ").trim());

      const paragraphBreak = /^\s*$|^[•\-–]\s+|^\d+[\.\)]\s+/;
      let para: string[] = [];
      const flushPara = () => {
        const text = para.join(" ").replace(/\s+/g, " ").trim();
        para = [];
        if (!text) return;
        const isHeading = text.length < 90 && /^[A-Z0-9][A-Z0-9\s:.\-()]+$/.test(text);
        next.push({
          id: `block_${next.length + 1}`,
          type: isHeading ? "heading" : "paragraph",
          content: text,
          html: isHeading ? `<h3>${text}</h3>` : `<p>${text}</p>`,
          style: { font: "Noto Sans", size: isHeading ? 16 : 12, color: "#111827", lineHeight: 1.5 },
        });
      };

      for (const line of lines) {
        if (!line) {
          flushPara();
          continue;
        }
        if (paragraphBreak.test(line) && para.length > 0) flushPara();
        para.push(line);
      }
      flushPara();
    }
    return next;
  };

  const renderPdfPagesToImages = async (bytes: Uint8Array): Promise<Array<{ page: number; imageDataUrl: string }>> => {
    const pdfjs = await import("pdfjs-dist");
    const pdf = await pdfjs.getDocument({ data: cloneBytes(bytes) }).promise;
    const images: Array<{ page: number; imageDataUrl: string }> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push({ page: i, imageDataUrl: canvas.toDataURL("image/png") });
    }
    return images;
  };

  const loadPdfToBlocks = async (bytes: Uint8Array) => {
    const parsed = await parsePdfToBlocks(bytes);
    setBlocks(parsed);
  };

  const rewriteInBatches = async (source: EditorBlock[]) => {
    setIsConverting(true);
    try {
      const batchSize = 15;
      let working = [...source];
      setBlocks(working);
      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Bắt đầu rewrite ${working.length} block...` }]);
      for (let i = 0; i < working.length; i += batchSize) {
        const selected = working.slice(i, i + batchSize);
        const patch = await generateAiPatch({
          prompt: "Rewrite faithfully into clean HTML. Keep original wording, images, and layout intent. Do not add or remove content.",
          selectedBlocks: selected,
          allBlocks: working,
          referenceImage: null,
        });
        working = working.map((b) => {
          const u = patch.updates.find((x) => x.id === b.id);
          if (!u) return b;
          const sourceText = (u.content ?? toContent(u.html ?? b.html)).trim();
          const structured = formatStructuredHtml(sourceText);
          return { ...b, ...u, type: u.type ?? structured.type, html: u.html ?? structured.html, content: u.content ?? structured.content };
        });
        setBlocks([...working]);
        const done = Math.min(i + batchSize, source.length);
        setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Đang rewrite ${done}/${source.length} block...` }]);
      }
      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Đã rewrite ${working.length} block theo từng đợt.` }]);
    } finally {
      setIsConverting(false);
    }
  };

  const rewriteFromVisionImages = async (images: Array<{ page: number; imageDataUrl: string }>) => {
    setIsConverting(true);
    try {
      const seeded: EditorBlock[] = images.map((item, idx) => ({
        id: `vision_page_${idx + 1}`,
        type: "paragraph",
        content: `Page ${item.page} is being rewritten...`,
        html: `<p>Page ${item.page} is being rewritten...</p>`,
        style: { font: "Noto Sans", size: 12, color: "#111827", lineHeight: 1.5 },
      }));
      let working = [...seeded];
      setBlocks(working);
      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Không có text layer, chuyển sang vision rewrite ${images.length} trang...` }]);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const target = working.find((b) => b.id === `vision_page_${i + 1}`);
        if (!target) continue;
        const patch = await generateAiPatch({
          prompt: "Rewrite this page faithfully into clean HTML. Keep wording and layout intent only. Do not add content.",
          selectedBlocks: [target],
          allBlocks: working,
          referenceImage: img.imageDataUrl,
        });
        if (i < 2) {
          const raw = JSON.stringify(patch.updates[0] ?? {}).slice(0, 180);
          setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Debug page ${img.page}: updates=${patch.updates.length} raw=${raw}` }]);
        }
        const directUpdate = patch.updates.find((u) => u.id === target.id) ?? patch.updates[0];
        working = working.map((b) => {
          const u = b.id === target.id ? directUpdate : patch.updates.find((x) => x.id === b.id);
          if (!u) return b;
          const loose = extractLooseText(u);
          const nextHtml = (typeof u.html === "string" && u.html.trim().length > 0)
            ? u.html
            : (typeof u.content === "string" && u.content.trim().length > 0)
              ? `<p>${escapeHtml(u.content)}</p>`
              : loose
                ? (loose.includes("<") ? loose : `<p>${escapeHtml(loose)}</p>`)
                : b.html;
          const sourceText = (u.content ?? toContent(nextHtml)).trim();
          const structured = formatStructuredHtml(sourceText);
          return { ...b, ...u, type: u.type ?? structured.type, html: (u.html && u.html.trim()) ? u.html : structured.html, content: u.content ?? structured.content };
        });
        if (!directUpdate || (!directUpdate.html && !directUpdate.content)) {
          setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Trang ${img.page}: AI trả response rỗng hoặc sai format, giữ nguyên placeholder.` }]);
        }
        setBlocks([...working]);
        setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Vision rewrite ${i + 1}/${images.length} trang...` }]);
      }

      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: "Hoàn tất vision rewrite." }]);
    } finally {
      setIsConverting(false);
    }
  };

  const onConvertToDocx = async () => {
    try {
      let sourceBlocks = blocks;
      if (sourceBlocks.length === 0) {
        const bootstrap =
          window.opener?.__opdfAiEditorGetBootstrap?.() ??
          window.opener?.__opdfAiEditorBootstrap ??
          window.__opdfAiEditorBootstrap;
        if (bootstrap?.docBytes && bootstrap.docBytes.length > 0) {
          const typed = bootstrap.docBytes instanceof Uint8Array ? bootstrap.docBytes : new Uint8Array(bootstrap.docBytes);
          sourceBlocks = await parsePdfToBlocks(typed);
          setBlocks(sourceBlocks);
        }
        if (sourceBlocks.length === 0 && lastSourceBytesSnapshot) {
          sourceBlocks = await parsePdfToBlocks(new Uint8Array(lastSourceBytesSnapshot));
          setBlocks(sourceBlocks);
        }
      }

      if (sourceBlocks.length > 0 && !sourceBlocks.every((b) => b.id.startsWith("vision_page_"))) {
        await rewriteInBatches(sourceBlocks);
        return;
      }

      if (lastSourceBytesSnapshot) {
        const images = await renderPdfPagesToImages(new Uint8Array(lastSourceBytesSnapshot));
        if (images.length > 0) {
          await rewriteFromVisionImages(images);
          return;
        }
      }
      alert("No content loaded. Please add or drag-drop a PDF/HTML/TXT file first.");
    } catch (error) {
      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Convert failed: ${String(error)}` }]);
      if (lastSourceBytesSnapshot) {
        const images = await renderPdfPagesToImages(new Uint8Array(lastSourceBytesSnapshot));
        if (images.length > 0) {
          await rewriteFromVisionImages(images);
          return;
        }
      }
      alert(`Convert failed: ${String(error)}`);
      return;
    }
    if (lastSourceBytesSnapshot) {
      const images = await renderPdfPagesToImages(new Uint8Array(lastSourceBytesSnapshot));
      if (images.length > 0) {
        await rewriteFromVisionImages(images);
        return;
      }
    }
    alert("Unable to extract content for rewrite.");
  };

  const handleFile = async (file: File) => {
    setIsLoadingFile(true);
    try {
      setFileName(file.name);
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
      setLastSourceBytesSnapshot(Array.from(bytes));
        await loadPdfToBlocks(bytes);
        setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Đã nạp PDF: ${file.name}` }]);
        return;
      }
      if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        setBlocks(htmlToBlocks(await file.text()));
        setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Đã nạp HTML: ${file.name}` }]);
        return;
      }
      if (lower.endsWith(".txt")) {
        const text = await file.text();
        setBlocks(text.split(/\r?\n/).filter(Boolean).map((line, i) => ({
          id: `block_${i + 1}`,
          type: "paragraph",
          content: line,
          html: `<p>${line}</p>`,
          style: { font: "Noto Sans", size: 12, color: "#111827", lineHeight: 1.5 },
        })));
        setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Đã nạp TXT: ${file.name}` }]);
        return;
      }
      alert("Hiện hỗ trợ PDF/HTML/TXT để mở vào AI Editor.");
    } catch (error) {
      setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: `Nạp file thất bại: ${String(error)}` }]);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const runContextEdit = async () => {
    if (!contextUI || !contextPrompt.trim()) return;
    const selected = blocks.filter((b) => b.id === contextUI.blockId);
    const patch = await generateAiPatch({
      prompt: contextPrompt,
      selectedBlocks: selected,
      allBlocks: blocks,
      referenceImage: null,
    });
    setBlocks((prev) => prev.map((b) => {
      const u = patch.updates.find((x) => x.id === b.id);
      if (!u) return b;
      const sourceText = (u.content ?? toContent(u.html ?? b.html)).trim();
      const structured = formatStructuredHtml(sourceText);
      return { ...b, ...u, type: u.type ?? structured.type, html: u.html ?? structured.html, content: u.content ?? structured.content };
    }));
    setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "user", text: contextPrompt }, { id: crypto.randomUUID(), sender: "assistant", text: "Đã áp dụng chỉnh sửa vào đoạn được chọn." }]);
    setContextPrompt("");
    setContextUI(null);
  };

  const sendSidebarChat = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "user", text }]);
    const target = selectedBlocks.length > 0 ? selectedBlocks : blocks.slice(0, 15);
    const patch = await generateAiPatch({ prompt: text, selectedBlocks: target, allBlocks: blocks, referenceImage: null });
    setBlocks((prev) => prev.map((b) => {
      const u = patch.updates.find((x) => x.id === b.id);
      if (!u) return b;
      const sourceText = (u.content ?? toContent(u.html ?? b.html)).trim();
      const structured = formatStructuredHtml(sourceText);
      return { ...b, ...u, type: u.type ?? structured.type, html: u.html ?? structured.html, content: u.content ?? structured.content };
    }));
    setChat((prev) => [...prev, { id: crypto.randomUUID(), sender: "assistant", text: "Đã cập nhật nội dung theo yêu cầu." }]);
  };

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "1fr 330px", background: "#eef2f7" }}>
      <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ display: "flex", gap: 8, alignItems: "center", padding: 12, borderBottom: "1px solid #d6dce7", background: "#fff" }}>
          <strong>AI Editor</strong>
          <span style={{ color: "#64748b", fontSize: 12 }}>{fileName}</span>
          <button onClick={onConvertToDocx} disabled={isConverting || isLoadingFile} type="button" style={{ marginLeft: "auto" }}>
            {isConverting ? "Converting..." : "Convert to DOCX"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isConverting || isLoadingFile}
            style={{ border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: "#fff" }}
          >
            {isLoadingFile ? "Đang nạp..." : "Thêm file"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.html,.htm,.txt"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
          />
        </header>
        <div
          style={{ flex: 1, overflow: "auto", padding: 20, background: dropActive ? "#dbeafe" : undefined, transition: "background 120ms ease" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          {blocks.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #94a3b8", borderRadius: 10, padding: 20, color: "#334155" }}>
              No blocks loaded yet. Click "Thêm file" or drag-drop file here, then press "Convert to DOCX".
            </div>
          ) : null}
          {blocks.map((block) => (
            <article
              key={block.id}
              data-block-id={block.id}
              style={{ background: "#fff", border: block.id === selectedBlockId ? "2px solid #3b82f6" : "1px solid #dbe3ef", borderRadius: 10, padding: 12, marginBottom: 10 }}
              onClick={() => setSelectedBlockId(block.id)}
              onContextMenu={(e) => {
                const selection = window.getSelection()?.toString().trim();
                if (!selection) return;
                e.preventDefault();
                setContextUI({ x: e.clientX, y: e.clientY, blockId: block.id });
              }}
            >
              <div contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: block.html }} onBlur={(e) => {
                const html = e.currentTarget.innerHTML;
                setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, html, content: toContent(html) } : b)));
              }} />
              <details>
                <summary style={{ cursor: "pointer", color: "#64748b", fontSize: 12 }}>HTML</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{block.html}</pre>
              </details>
            </article>
          ))}
        </div>
      </section>
      <aside style={{ borderLeft: "1px solid #d6dce7", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", fontWeight: 700 }}>AI Chat</div>
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {chat.map((m) => (
            <div key={m.id} style={{ alignSelf: m.sender === "user" ? "flex-end" : "flex-start", background: m.sender === "user" ? "#dbeafe" : "#f1f5f9", borderRadius: 10, padding: "8px 10px", maxWidth: "90%" }}>
              {m.text}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Nhập lệnh sửa..." style={{ flex: 1 }} />
          <button type="button" onClick={() => void sendSidebarChat()}>Gửi</button>
        </div>
      </aside>
      {contextUI ? (
        <div style={{ position: "fixed", left: contextUI.x, top: contextUI.y, zIndex: 1000, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, display: "flex", gap: 6 }}>
          <input value={contextPrompt} onChange={(e) => setContextPrompt(e.target.value)} placeholder="Lệnh sửa đoạn bôi đen..." style={{ width: 260 }} />
          <button type="button" onClick={() => void runContextEdit()}>OK</button>
          <button type="button" onClick={() => setContextUI(null)}>×</button>
        </div>
      ) : null}
      <textarea readOnly value={blocksToHtml(blocks)} style={{ display: "none" }} />
    </div>
  );
}
