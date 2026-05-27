import React, { useState, useEffect } from "react";
import { AIParsedDocument, DocumentBlock } from "../types";
import { useBlockOfficeExport } from "./useBlockOfficeExport";
import { useBlockOfficeImport } from "./useBlockOfficeImport";
import { useVersionHistory } from "./useVersionHistory";
import { PRESET_TEMPLATES } from "../data/presetTemplates";

export function useBlockOffice(
  setErrorMessage: (msg: string | null) => void,
  errorMessage: string | null,
  showToast?: (msg: string, type?: "success" | "error" | "info" | "warning") => void
) {
  const [activeTab, setActiveTab] = useState<"word" | "excel" | "powerpoint" | "json">("word");
  const [currentDoc, setCurrentDoc] = useState<AIParsedDocument>(() => {
    try {
      const saved = localStorage.getItem("block_office_current_doc");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.blocks)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Local storage load currentDoc failed:", e);
    }
    return PRESET_TEMPLATES[0];
  });

  const [promptInput, setPromptInput] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  // PPTX Presentation slideshow fullscreen states
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isFullscreenSlide, setIsFullscreenSlide] = useState(false);

  // Auto-save to localStorage
  useEffect(() => {
    if (currentDoc && (currentDoc.blocks.length > 0 || currentDoc.title)) {
      localStorage.setItem("block_office_current_doc", JSON.stringify(currentDoc));
    }
  }, [currentDoc]);

  // Auto-select first block
  useEffect(() => {
    if (currentDoc.blocks.length > 0 && !selectedBlockId) {
      setSelectedBlockId(currentDoc.blocks[0].id);
    }
  }, [currentDoc, selectedBlockId]);

  // ── Version History ──────────────────────────────────
  const { versions, saveVersion, restoreVersion, deleteVersion } = useVersionHistory();

  const handleSaveVersion = (label?: string) => {
    const v = saveVersion(currentDoc, label);
    showToast?.(`💾 Đã lưu phiên bản: "${v.label}"`, "success");
  };

  const handleRestoreVersion = (id: string) => {
    const doc = restoreVersion(id);
    if (doc) {
      setCurrentDoc(doc);
      showToast?.("🔄 Đã khôi phục phiên bản tài liệu.", "info");
    }
  };

  const handleDeleteVersion = (id: string) => {
    deleteVersion(id);
    showToast?.("🗑️ Đã xóa phiên bản.", "info");
  };

  // ── AI HANDLERS ──────────────────────────────────────
  const handleAIGenerate = async (customPrompt?: string) => {
    const activePrompt = customPrompt || promptInput;
    if (!activePrompt.trim()) return;

    setIsGenerating(true);
    setErrorMessage(null);
    showToast?.("🤖 Đang tạo tài liệu bằng AI...", "info");

    try {
      const res = await fetch("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: activePrompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp sự cố khi gọi AI khởi tạo tài liệu.");
      }

      setCurrentDoc(data);
      setPromptInput("");
      showToast?.(`✅ AI đã tạo tài liệu: "${data.title}"`, "success");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Không thể kết nối đến máy chủ AI.");
      showToast?.("❌ " + (err.message || "Không thể kết nối AI."), "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIRefine = async () => {
    if (!refinePrompt.trim()) return;

    setIsRefining(true);
    setErrorMessage(null);
    showToast?.("✨ Đang tinh chỉnh tài liệu...", "info");

    try {
      const res = await fetch("/api/refine-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentSchema: currentDoc,
          instruction: refinePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể tinh chỉnh tài liệu.");
      }

      setCurrentDoc(data);
      setRefinePrompt("");
      showToast?.("✅ Tài liệu đã được tinh chỉnh thành công.", "success");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Gặp lỗi khi gửi yêu cầu chỉnh sửa.");
      showToast?.("❌ " + (err.message || "Không thể tinh chỉnh AI."), "error");
    } finally {
      setIsRefining(false);
    }
  };

  const updateCellValue = (blockId: string, rIdx: number, cIdx: number, value: string, formulaStr?: string) => {
    setCurrentDoc(prev => {
      const updated = { ...prev, blocks: [...prev.blocks] };
      const blockIdx = updated.blocks.findIndex(b => b.id === blockId);
      if (blockIdx < 0) return prev;
      const block = { ...updated.blocks[blockIdx] };
      if (!block.tableData) return prev;
      const tableData = block.tableData.map(r => [...r]);
      tableData[rIdx] = [...tableData[rIdx]];
      tableData[rIdx][cIdx] = {
        ...tableData[rIdx][cIdx],
        value,
        formula: formulaStr || undefined,
      };
      block.tableData = tableData;
      updated.blocks[blockIdx] = block;
      return updated;
    });
  };

  const addNewBlock = (type: DocumentBlock["type"]) => {
    const newBlock: DocumentBlock = {
      id: `b_added_${Date.now()}`,
      type,
      content:
        type === "heading" ? "Tiêu đề mới" :
        type === "callout" ? "Callout thông báo quan trọng" :
        type === "slide" ? "Tiêu đề Slide thuyết trình" :
        type === "divider" ? "" :
        "Vui lòng nhập nội dung...",
      meta:
        type === "heading" ? { level: 2 } :
        type === "chart" ? { chartType: "bar", chartDataKeys: ["Quý", "Thống kê"] } :
        type === "callout" ? { calloutType: "info" } :
        type === "slide" ? { slideBg: "indigo", bulletPoints: ["Luận điểm số 1", "Luận điểm số 2"] } :
        undefined,
      tableData:
        type === "table" ? [
          [{ value: "Hạng mục" }, { value: "Số lượng" }, { value: "Giá trị" }],
          [{ value: "Dịch vụ A" }, { value: "5" }, { value: "1000" }],
          [{ value: "Phí phụ thu" }, { value: "1" }, { value: "200" }],
          [{ value: "Tổng cộng" }, { value: "" }, { value: "", formula: "=SUM(C2:C3)" }],
        ] : undefined,
    };

    setCurrentDoc(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
  };

  const removeBlock = (id: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== id),
    }));
  };

  const handleDragStart = (id: string) => {
    setDraggedBlockId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedBlockId || draggedBlockId === id) return;

    setCurrentDoc(prev => {
      const blocks = [...prev.blocks];
      const dragIdx = blocks.findIndex(b => b.id === draggedBlockId);
      const hoverIdx = blocks.findIndex(b => b.id === id);
      if (dragIdx > -1 && hoverIdx > -1) {
        const [removed] = blocks.splice(dragIdx, 1);
        blocks.splice(hoverIdx, 0, removed);
      }
      return { ...prev, blocks };
    });
  };

  // Delegate import and export functionalities
  const {
    officeImporting,
    pdfImporting,
    pdfProgress,
    handlePDFToBlocksImport,
    handleOfficeFileImport,
  } = useBlockOfficeImport(setCurrentDoc, setErrorMessage);

  const {
    isExporting,
    exportToDOCX,
    exportToXLSX,
    exportToPPTX,
    exportToPDF,
  } = useBlockOfficeExport(currentDoc, undefined, showToast);

  return {
    activeTab,
    setActiveTab,
    currentDoc,
    setCurrentDoc,
    promptInput,
    setPromptInput,
    refinePrompt,
    setRefinePrompt,
    isGenerating,
    isRefining,
    selectedBlockId,
    setSelectedBlockId,
    activeSlideIdx,
    setActiveSlideIdx,
    isFullscreenSlide,
    setIsFullscreenSlide,
    isExporting,
    officeImporting,
    pdfImporting,
    pdfProgress,
    handleAIGenerate,
    handleAIRefine,
    handlePDFToBlocksImport,
    handleOfficeFileImport,
    updateCellValue,
    addNewBlock,
    removeBlock,
    handleDragStart,
    handleDragOver,
    exportToDOCX,
    exportToXLSX,
    exportToPPTX,
    exportToPDF,
    // Version history
    versions,
    handleSaveVersion,
    handleRestoreVersion,
    handleDeleteVersion,
  };
}
