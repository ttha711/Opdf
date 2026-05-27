import React, { useState, useEffect, useRef } from "react";
import { AIParsedDocument, DocumentBlock } from "../types";
import { compileBlocksToHtml, parseHtmlToBlocks } from "../lib/blockOfficeUtils";

interface UseWordEditorProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
}

export function useWordEditor({
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId
}: UseWordEditorProps) {
  const [editorHtml, setEditorHtml] = useState<string>("");
  const [ribbonTab, setRibbonTab] = useState<"home" | "insert" | "layout" | "ai" | "help">("home");
  const [isRefiningAi, setIsRefiningAi] = useState(false);
  const [docMargin, setDocMargin] = useState<"normal" | "narrow" | "wide">("normal");
  const [docLandscape, setDocLandscape] = useState(false);
  const [docTheme, setDocTheme] = useState<"corporate" | "modern" | "warm" | "minimalist">("corporate");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [pendingAiPreviewHtml, setPendingAiPreviewHtml] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const isUserEditingRef = useRef<boolean>(false);
  const syncTimeoutRef = useRef<any>(null);

  const blockIdsStr = currentDoc.blocks.map(b => b.id).join(",");

  // Load editor content first time or when file state is cleanly reloaded
  useEffect(() => {
    if (isUserEditingRef.current) {
      return;
    }
    const clean = compileBlocksToHtml(currentDoc.blocks);
    setEditorHtml(clean);
    if (editorRef.current) {
      editorRef.current.innerHTML = clean;
    }
  }, [blockIdsStr, currentDoc.title]);

  const syncEditorHtmlToBlocks = (html: string) => {
    isUserEditingRef.current = true;
    const wordBlocks = parseHtmlToBlocks(html);
    const pptBlocks = currentDoc.blocks.filter(b => b.type === "slide");
    const mergedBlocks = [...wordBlocks, ...pptBlocks];
    
    setCurrentDoc(prev => ({
      ...prev,
      blocks: mergedBlocks
    }));
    
    setTimeout(() => {
      isUserEditingRef.current = false;
    }, 120);
  };

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    setEditorHtml(html);
    
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      syncEditorHtmlToBlocks(html);
    }, 600);
  };

  const handleEditorBlur = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      syncEditorHtmlToBlocks(html);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        executeFormat("bold");
      } else if (k === "i") {
        e.preventDefault();
        executeFormat("italic");
      } else if (k === "u") {
        e.preventDefault();
        executeFormat("underline");
      } else if (k === "f") {
        e.preventDefault();
        setShowFindReplace(true);
      }
    }
  };

  const executeFormat = (cmd: string, val: string = "") => {
    if (cmd === "lineHeight") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let container = range.commonAncestorContainer as any;
        if (container.nodeType === 3) { // Text node
          container = container.parentNode;
        }
        if (container && container.style) {
          container.style.lineHeight = val;
        }
      }
      if (editorRef.current) {
        const html = editorRef.current.innerHTML;
        setEditorHtml(html);
        syncEditorHtmlToBlocks(html);
      }
      return;
    }

    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      const html = editorRef.current.innerHTML;
      setEditorHtml(html);
      syncEditorHtmlToBlocks(html);
    }
  };

  const insertHtmlAtCursor = (html: string) => {
    const sel = window.getSelection();
    if (sel && sel.getRangeAt && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      
      const el = document.createElement("div");
      el.innerHTML = html;
      
      const frag = document.createDocumentFragment();
      let node;
      while ((node = el.firstChild)) {
        frag.appendChild(node);
      }
      range.insertNode(frag);
      
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    if (editorRef.current) {
      editorRef.current.focus();
      const hStr = editorRef.current.innerHTML;
      setEditorHtml(hStr);
      syncEditorHtmlToBlocks(hStr);
    }
  };

  const handleAiQuickAction = async (promptText: string) => {
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : "";
    if (!selectedText) {
      alert("Vui lòng bôi chọn (highlight) văn bản bất kỳ trước khi chạy Trợ lý AI!");
      return;
    }
    
    const range = sel!.getRangeAt(0);
    setIsRefiningAi(true);
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: selectedText,
          prompt: promptText
        })
      });
      
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data.html) setPendingAiPreviewHtml(data.html);
    } catch {
      alert("AI Trợ lý dịch chỉnh thất bại. Hãy thử lại!");
    } finally {
      setIsRefiningAi(false);
    }
  };

  const applyAiPreview = () => {
    const html = pendingAiPreviewHtml;
    if (!html) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node;
    while ((node = tempDiv.firstChild)) frag.appendChild(node);
    range.insertNode(frag);
    if (editorRef.current) {
      const hStr = editorRef.current.innerHTML;
      setEditorHtml(hStr);
      syncEditorHtmlToBlocks(hStr);
    }
    setPendingAiPreviewHtml(null);
  };

  const rejectAiPreview = () => {
    setPendingAiPreviewHtml(null);
  };

  const findNext = (query: string) => {
    const keyword = query.trim();
    if (!keyword || !editorRef.current) return false;
    editorRef.current.focus();
    const finder = (window as Window & { find?: (...args: any[]) => boolean }).find;
    if (!finder) return false;
    return finder(keyword, false, false, true, false, false, false);
  };

  const replaceOne = (findText: string, replaceText: string) => {
    const keyword = findText.trim();
    if (!keyword || !editorRef.current) return false;
    const found = findNext(keyword);
    if (!found) return false;
    document.execCommand("insertText", false, replaceText);
    const html = editorRef.current.innerHTML;
    setEditorHtml(html);
    syncEditorHtmlToBlocks(html);
    return true;
  };

  const replaceAll = (findText: string, replaceText: string) => {
    const keyword = findText.trim();
    if (!keyword || !editorRef.current) return 0;
    const sourceHtml = editorRef.current.innerHTML;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "g");
    let count = 0;
    const nextHtml = sourceHtml.replace(pattern, () => {
      count += 1;
      return replaceText;
    });
    if (count > 0) {
      editorRef.current.innerHTML = nextHtml;
      setEditorHtml(nextHtml);
      syncEditorHtmlToBlocks(nextHtml);
    }
    return count;
  };

  return {
    editorHtml,
    setEditorHtml,
    ribbonTab,
    setRibbonTab,
    isRefiningAi,
    setIsRefiningAi,
    docMargin,
    setDocMargin,
    docLandscape,
    setDocLandscape,
    docTheme,
    setDocTheme,
    showFindReplace,
    setShowFindReplace,
    pendingAiPreviewHtml,
    setPendingAiPreviewHtml,
    editorRef,
    isUserEditingRef,
    syncTimeoutRef,
    handleEditorInput,
    handleEditorBlur,
    handleEditorKeyDown,
    executeFormat,
    insertHtmlAtCursor,
    handleAiQuickAction,
    findNext,
    replaceOne,
    replaceAll,
    applyAiPreview,
    rejectAiPreview
  };
}
