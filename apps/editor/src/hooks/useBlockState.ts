import React from "react";
import { AIParsedDocument, DocumentBlock } from "../types";

interface UseBlockStateProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  setSelectedBlockId: (id: string | null) => void;
}

export function useBlockState({
  currentDoc,
  setCurrentDoc,
  setSelectedBlockId
}: UseBlockStateProps) {
  // --- Reactive Undo / Redo Mechanism ---
  const historyRef = React.useRef<AIParsedDocument[]>([]);
  const historyPointerRef = React.useRef<number>(-1);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const isUndoRedoActionRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (isUndoRedoActionRef.current) {
      isUndoRedoActionRef.current = false;
      return;
    }
    if (currentDoc.blocks.length === 0 && !currentDoc.title) return;

    const timer = setTimeout(() => {
      const lastSavedDoc = historyRef.current[historyPointerRef.current];
      if (lastSavedDoc && JSON.stringify(lastSavedDoc) === JSON.stringify(currentDoc)) {
        return;
      }

      const nextHistory = historyRef.current.slice(0, historyPointerRef.current + 1);
      nextHistory.push(JSON.parse(JSON.stringify(currentDoc)));
      
      if (nextHistory.length > 25) {
        nextHistory.shift();
      }

      historyRef.current = nextHistory;
      historyPointerRef.current = nextHistory.length - 1;
      
      setCanUndo(historyPointerRef.current > 0);
      setCanRedo(false);
    }, 450);

    return () => clearTimeout(timer);
  }, [currentDoc]);

  const undo = () => {
    if (historyPointerRef.current > 0) {
      isUndoRedoActionRef.current = true;
      historyPointerRef.current -= 1;
      const prevDoc = historyRef.current[historyPointerRef.current];
      setCurrentDoc(prevDoc);
      setCanUndo(historyPointerRef.current > 0);
      setCanRedo(true);
    }
  };

  const redo = () => {
    if (historyPointerRef.current < historyRef.current.length - 1) {
      isUndoRedoActionRef.current = true;
      historyPointerRef.current += 1;
      const nextDoc = historyRef.current[historyPointerRef.current];
      setCurrentDoc(nextDoc);
      setCanUndo(true);
      setCanRedo(historyPointerRef.current < historyRef.current.length - 1);
    }
  };

  // Manual Document Formatting & Layout Actions
  const moveBlock = (id: string, direction: "up" | "down") => {
    setCurrentDoc(prev => {
      const blocks = [...prev.blocks];
      const idx = blocks.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= blocks.length) return prev;
      const temp = blocks[idx];
      blocks[idx] = blocks[targetIdx];
      blocks[targetIdx] = temp;
      return { ...prev, blocks };
    });
  };

  const duplicateBlock = (id: string) => {
    setCurrentDoc(prev => {
      const blocks = [...prev.blocks];
      const idx = blocks.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const original = blocks[idx];
      const copy: DocumentBlock = {
        ...original,
        id: `b_duped_${Date.now()}`,
        tableData: original.tableData ? JSON.parse(JSON.stringify(original.tableData)) : undefined,
        meta: original.meta ? JSON.parse(JSON.stringify(original.meta)) : undefined
      };
      blocks.splice(idx + 1, 0, copy);
      return { ...prev, blocks };
    });
  };

  const changeBlockType = (id: string, newType: DocumentBlock["type"]) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => {
        if (b.id !== id) return b;
        let copy = { ...b, type: newType };
        if (newType === "heading" && b.type !== "heading") {
          copy.meta = { level: 2 };
        } else if (newType === "callout" && b.type !== "callout") {
          copy.meta = { calloutType: "info" };
        } else if (newType === "slide" && b.type !== "slide") {
          copy.meta = { slideBg: "indigo", bulletPoints: ["Ý chính Slide thiết trình"] };
        } else if (newType === "chart" && b.type !== "chart") {
          copy.meta = { chartType: "bar", chartDataKeys: ["Quý", "Thống kê"] };
        } else if (newType === "table" && b.type !== "table") {
          copy.tableData = [
            [{ value: "Hạng mục" }, { value: "Số lượng" }, { value: "Giá trị" }],
            [{ value: "Dịch vụ mới" }, { value: "1" }, { value: "100" }]
          ];
        }
        return copy;
      })
    }));
  };

  const deleteBlock = (id: string) => {
    setCurrentDoc(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== id)
    }));
    setSelectedBlockId(null);
  };

  const insertNewBlock = (id: string, type: DocumentBlock["type"]) => {
    const newId = `b_added_${Date.now()}`;
    const newBlock: DocumentBlock = {
      id: newId,
      type,
      content: type === "heading" ? "Tiêu đề mới" :
               type === "callout" ? "Thông báo quan trọng mới" :
               type === "slide" ? "Tiêu đề Slide mới" : "Nội dung văn bản mới...",
      meta: type === "heading" ? { level: 2 } :
            type === "chart" ? { chartType: "bar", chartDataKeys: ["Quý", "Thống kê"] } :
            type === "callout" ? { calloutType: "info" } :
            type === "slide" ? { slideBg: "indigo", bulletPoints: ["Luận điểm chính"] } : undefined
    };
    setCurrentDoc(prev => {
      const blocks = [...prev.blocks];
      const idx = blocks.findIndex(b => b.id === id);
      if (idx === -1) {
        return { ...prev, blocks: [...blocks, newBlock] };
      }
      blocks.splice(idx + 1, 0, newBlock);
      return { ...prev, blocks };
    });
    setSelectedBlockId(newId);
  };

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    moveBlock,
    duplicateBlock,
    changeBlockType,
    deleteBlock,
    insertNewBlock
  };
}
