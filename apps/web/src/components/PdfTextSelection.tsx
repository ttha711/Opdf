import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RenderedTextItem } from "./PdfViewer.types";
import { normalizeSelectionRects } from "./PdfTextSelection.utils";

type TextSelectionAction = "copy" | "highlight" | "underline" | "strike" | "translate" | "redact" | "edit-text" | "ai-rewrite";

interface PdfTextLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  textItems: RenderedTextItem[];
  selectionEnabled: boolean;
  onAction: (pageNumber: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
  createToolAnnotation?: (kind: "note" | "shape" | "signature" | "redact" | "underline" | "strike" | "image", pageNumber: number, rect: any) => Promise<void>;
  annotations?: any[];
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
}

interface SelectionMenuState {
  text: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  x: number;
  y: number;
  anchor: "selection" | "cursor";
}

// Thuật toán gom nhóm dòng kiểu Stirling-PDF
interface GroupedLine {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  items: RenderedTextItem[];
}

// Gom nhóm các dòng thành đoạn văn để chỉnh sửa khối lớn
interface GroupedParagraph {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lines: GroupedLine[];
}

// Ghép nối các TextItem được bôi đen thành chuỗi văn bản hoàn chỉnh, tự động xuống dòng khi chuyển dòng mới
function joinMatchedItems(items: RenderedTextItem[]): string {
  if (items.length === 0) return "";
  
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 5) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });

  let result = sorted[0].str;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const isSameRow = Math.abs(curr.top - prev.top) <= 6;
    if (isSameRow) {
      result += (result.endsWith(" ") || curr.str.startsWith(" ") ? "" : " ") + curr.str;
    } else {
      result += "\n" + curr.str;
    }
  }
  return result;
}

export function PdfTextLayer({ pageNumber, width, height, textItems, selectionEnabled, onAction, createToolAnnotation, annotations, onAnnotationUpdated }: PdfTextLayerProps) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);
  
  // Translation states
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [translationResult, setTranslationResult] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  
  // AI Rewrite states
  const [rewriteText, setRewriteText] = useState<string | null>(null);
  const [rewritePrompt, setRewritePrompt] = useState<string>("Viết lại đoạn văn bản này một cách chuyên nghiệp và trang trọng hơn");
  const [rewriteResult, setRewriteResult] = useState<string>("");
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [rewriteRects, setRewriteRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [rewriteMatchedItems, setRewriteMatchedItems] = useState<any[]>([]);

  // Inline Edit states
  const [editTextState, setEditTextState] = useState<{ id?: string; text: string; rects: Array<{ x: number; y: number; width: number; height: number }>; matchedItems?: any[] } | null>(null);
  const [editedInputText, setEditedInputText] = useState("");
  const [maskColor, setMaskColor] = useState<string>("white"); // Màu che chữ cũ (white, black, custom, v.v.)
  const [customColorInput, setCustomColorInput] = useState<string>("#ffffff");

  // Thuộc tính định dạng chữ cho patch
  const [patchTextColorMode, setPatchTextColorMode] = useState<string>("black");
  const [customTextColorInput, setCustomTextColorInput] = useState<string>("#000000");
  const [patchFontSize, setPatchFontSize] = useState<number>(14);
  const [patchFontFamily, setPatchFontFamily] = useState<string>("Helvetica, Arial, sans-serif");

  // Stirling PDF Edit Mode state
  const [stirlingMode, setStirlingMode] = useState<boolean>(false);
  const [stirlingSubMode, setStirlingSubMode] = useState<"auto" | "manual">("auto");
  const [groupedParagraphs, setGroupedParagraphs] = useState<GroupedParagraph[]>([]);

  // Lọc các annotation patch thuộc trang hiện tại
  const pagePatches = (annotations ?? []).filter(
    (ann) => ann.page === pageNumber && ann.kind === "note" && (ann.payload as any)?.isPatch
  );

  const layerRef = useRef<HTMLDivElement>(null);

  const clearMenu = useCallback(() => setMenu(null), []);

  const updateSelection = useCallback(() => {
    if (!selectionEnabled) {
      clearMenu();
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
    }
  }, [clearMenu, selectionEnabled]);

  // Gom nhóm textItems thành các đoạn văn (paragraphs) theo khoảng cách dòng và căn lề
  const groupTextIntoLines = useCallback(() => {
    if (textItems.length === 0) {
      setGroupedParagraphs([]);
      return;
    }

    // Bước 1: Sắp xếp theo trục Y trước, sau đó theo trục X để phân tích dòng chữ thô
    const sortedItems = [...textItems].sort((a, b) => {
      if (Math.abs(a.top - b.top) > 5) {
        return a.top - b.top;
      }
      return a.left - b.left;
    });

    const lines: GroupedLine[] = [];
    let currentLine: GroupedLine | null = null;

    for (const item of sortedItems) {
      if (!item.str.trim()) continue;
      
      if (!currentLine) {
        currentLine = {
          str: item.str,
          left: item.left,
          top: item.top,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          items: [item]
        };
        continue;
      }

      const sameRow = Math.abs(item.top - currentLine.top) <= 6;
      const prevItem = currentLine.items[currentLine.items.length - 1];
      const spacingX = item.left - (prevItem.left + prevItem.width);
      const isCloseX = spacingX < item.fontSize * 2.0;

      if (sameRow && isCloseX) {
        currentLine.str += (currentLine.str.endsWith(" ") || item.str.startsWith(" ") ? "" : " ") + item.str;
        currentLine.width = (item.left + item.width) - currentLine.left;
        currentLine.height = Math.max(currentLine.height, item.height);
        currentLine.fontSize = Math.max(currentLine.fontSize, item.fontSize);
        currentLine.items.push(item);
      } else {
        lines.push(currentLine);
        currentLine = {
          str: item.str,
          left: item.left,
          top: item.top,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          items: [item]
        };
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Bước 2: Gom nhóm các dòng (lines) thành đoạn văn (paragraphs)
    const paragraphs: GroupedParagraph[] = [];
    let currentParagraph: GroupedParagraph | null = null;

    for (const line of lines) {
      if (!currentParagraph) {
        currentParagraph = {
          str: line.str,
          left: line.left,
          top: line.top,
          width: line.width,
          height: line.height,
          fontSize: line.fontSize,
          lines: [line]
        };
        continue;
      }

      const prevLine = currentParagraph.lines[currentParagraph.lines.length - 1];
      
      // TỐI ƯU: Tính khoảng cách dọc dựa trên tops (baselines) trực tiếp thay vì phụ thuộc chiều cao line.height vốn hay bị sai số trong PDF.js
      const verticalGap = line.top - prevLine.top;

      // Ngưỡng khoảng cách dòng tiêu chuẩn trong đoạn văn (thường từ 1.0x đến 2.5x cỡ chữ)
      const maxGap = prevLine.fontSize * 2.5;

      // Kiểm tra căn lề X tương đối cùng cột (lệch không quá 80px để hỗ trợ cả thụt đầu dòng thụt lề blockquote)
      const alignX = Math.abs(line.left - currentParagraph.left) < 80 || Math.abs(line.left - prevLine.left) < 60;

      // Nếu dòng nằm sát phía dưới và cùng cột lề, coi như thuộc cùng một đoạn văn
      if (verticalGap >= 2 && verticalGap <= maxGap && alignX) {
        currentParagraph.str += "\n" + line.str;
        
        const newLeft = Math.min(currentParagraph.left, line.left);
        const newWidth = Math.max(currentParagraph.left + currentParagraph.width, line.left + line.width) - newLeft;
        
        currentParagraph.left = newLeft;
        currentParagraph.width = newWidth;
        currentParagraph.height = (line.top + line.height) - currentParagraph.top;
        currentParagraph.fontSize = Math.max(currentParagraph.fontSize, line.fontSize);
        currentParagraph.lines.push(line);
      } else {
        paragraphs.push(currentParagraph);
        currentParagraph = {
          str: line.str,
          left: line.left,
          top: line.top,
          width: line.width,
          height: line.height,
          fontSize: line.fontSize,
          lines: [line]
        };
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    setGroupedParagraphs(paragraphs);
  }, [textItems]);

  // Đồng bộ hóa việc gom nhóm dòng khi bật Stirling Mode
  useEffect(() => {
    if (stirlingMode) {
      groupTextIntoLines();
    }
  }, [stirlingMode, groupTextIntoLines]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selectionEnabled || !selection || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    const layer = layerRef.current;
    if (!layer || !selection.anchorNode || !layer.contains(selection.anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    const layerBounds = layer.getBoundingClientRect();
    const rects = normalizeSelectionRects(Array.from(range.getClientRects()), layerBounds, width, height);
    if (rects.length === 0) {
      return;
    }

    e.preventDefault();

    setMenu({
      text: selectedText,
      rects,
      x: e.clientX,
      y: e.clientY + 8,
      anchor: "cursor",
    });
  }, [height, selectionEnabled, width]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    window.addEventListener("scroll", clearMenu, true);
    window.addEventListener("resize", clearMenu);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      window.removeEventListener("scroll", clearMenu, true);
      window.removeEventListener("resize", clearMenu);
    };
  }, [clearMenu, updateSelection]);

  const handleAiTranslate = async (text: string) => {
    setIsTranslating(true);
    setTranslationResult("Đang xử lý dịch thuật qua Gemini AI...");
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: text,
          prompt: `Dịch đoạn văn bản sau sang tiếng Việt (nếu là tiếng Anh) hoặc ngược lại sang tiếng Anh (nếu là tiếng Việt). Dịch tự nhiên, chính xác, chuẩn văn phong tài liệu hành chính. Trả về duy nhất văn bản kết quả dịch, không kèm lời giải thích hay khối code markdown.`
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi kết nối AI.");
      }
      setTranslationResult(data.html || "Không nhận được phản hồi dịch.");
    } catch (err: any) {
      setTranslationResult(`Lỗi dịch thuật: ${err.message || err}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAiRewrite = async () => {
    setIsRewriting(true);
    setRewriteResult("Đang gửi yêu cầu viết lại qua Gemini AI...");
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: rewriteText || "",
          prompt: `${rewritePrompt}. Trả về duy nhất kết quả đã được viết lại, giữ nguyên nghĩa gốc, không thêm bớt thông tin ngoài yêu cầu và không bao gói code markdown.`
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi kết nối AI.");
      }
      setRewriteResult(data.html || "Không nhận được phản hồi viết lại.");
    } catch (err: any) {
      setRewriteResult(`Lỗi viết lại: ${err.message || err}`);
    } finally {
      setIsRewriting(false);
    }
  };

  const runAction = async (action: TextSelectionAction) => {
    if (!menu) return;
    if (action === "copy") {
      await navigator.clipboard?.writeText(menu.text);
      clearMenu();
      return;
    }
    if (action === "translate") {
      setTranslateText(menu.text);
      void handleAiTranslate(menu.text);
      clearMenu();
      return;
    }
    if (action === "ai-rewrite") {
      setRewriteText(menu.text);
      setRewriteResult("");
      setRewriteRects(menu.rects);
      
      // Tìm các text item khớp để tối ưu hóa vị trí
      const matchedItems = textItems.filter(item => {
        return menu.rects.some(r => {
          const pxLeft = r.x * width;
          const pxTop = r.y * height;
          const pxRight = (r.x + r.width) * width;
          const pxBottom = (r.y + r.height) * height;

          const itemLeft = item.left;
          const itemTop = item.top;
          const itemRight = item.left + item.width;
          const itemBottom = item.top + item.height;

          return !(
            pxRight < itemLeft - 3 ||
            pxLeft > itemRight + 3 ||
            pxBottom < itemTop - 3 ||
            pxTop > itemBottom + 3
          );
        });
      });
      setRewriteMatchedItems(matchedItems.map(item => ({
        x: item.left / width,
        y: item.top / height,
        width: item.width / width,
        height: item.height / height,
        fontSize: item.fontSize
      })));

      clearMenu();
      return;
    }
    if (action === "edit-text") {
      const matchedItems = textItems.filter(item => {
        return menu.rects.some(r => {
          const pxLeft = r.x * width;
          const pxTop = r.y * height;
          const pxRight = (r.x + r.width) * width;
          const pxBottom = (r.y + r.height) * height;

          const itemLeft = item.left;
          const itemTop = item.top;
          const itemRight = item.left + item.width;
          const itemBottom = item.top + item.height;

          return !(
            pxRight < itemLeft - 3 ||
            pxLeft > itemRight + 3 ||
            pxBottom < itemTop - 3 ||
            pxTop > itemBottom + 3
          );
        });
      });

      const fullText = matchedItems.length > 0
        ? joinMatchedItems(matchedItems)
        : menu.text;

      const matchedFontSize = matchedItems.length > 0 ? Math.max(...matchedItems.map(item => item.fontSize)) : 0;
      const finalFontSize = matchedFontSize > 8 ? matchedFontSize : 14;
      setPatchFontSize(Math.round(finalFontSize));
      setPatchTextColorMode("black");
      
      const originalFont = matchedItems.length > 0 ? matchedItems[0].fontName : undefined;
      if (originalFont) {
        setPatchFontFamily(originalFont);
      } else {
        setPatchFontFamily("Helvetica, Arial, sans-serif");
      }

      setEditedInputText(fullText);
      setEditTextState({
        text: fullText,
        rects: menu.rects,
        matchedItems: matchedItems.map(item => ({
          x: item.left / width,
          y: item.top / height,
          width: item.width / width,
          height: item.height / height,
          fontSize: item.fontSize
        }))
      });
      clearMenu();
      return;
    }

    const kind = action === "redact" ? "redact" : action;
    menu.rects.forEach((rect) => onAction(pageNumber, kind, rect));
    window.getSelection()?.removeAllRanges();
    clearMenu();
  };

  const handleSaveEdit = async () => {
    if (!editTextState) return;

    if (editTextState.id && onAnnotationUpdated) {
      await onAnnotationUpdated(editTextState.id, {
        text: editedInputText,
        textColor: patchTextColorMode === "custom" ? customTextColorInput : patchTextColorMode,
        fontSize: patchFontSize,
        fontFamily: patchFontFamily
      });
      setEditTextState(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    if (!createToolAnnotation) return;
    const { rects, matchedItems } = editTextState;

    const targetsToCover = (matchedItems && matchedItems.length > 0) ? matchedItems : rects;

    const minX = Math.min(...targetsToCover.map((r: any) => r.x));
    const minY = Math.min(...targetsToCover.map((r: any) => r.y));
    const maxX = Math.max(...targetsToCover.map((r: any) => r.x + r.width));
    const maxY = Math.max(...targetsToCover.map((r: any) => r.y + r.height));
    const unionW = maxX - minX;
    const unionH = maxY - minY;
    
    const matchedFontSize = (matchedItems && matchedItems.length > 0)
      ? Math.max(...matchedItems.map((item: any) => item.fontSize))
      : 0;

    const finalFontSize = matchedFontSize > 8
      ? matchedFontSize
      : Math.round(unionH * height * 0.78) > 8
        ? Math.round(unionH * height * 0.78)
        : 14;

    const finalMaskColor = maskColor === "custom" ? customColorInput : maskColor;

    // 1. Che văn bản cũ với padding mở rộng để xóa sạch hoàn toàn đuôi chữ và phần nhô (ascenders/descenders)
    for (const r of targetsToCover) {
      const itemFontSize = r.fontSize || finalFontSize || 12;
      const normFontSize = itemFontSize / height;
      const normPaddingTop = normFontSize * 0.20; // 20% font size cho phần nhô lên
      const normPaddingBottom = normFontSize * 0.30; // 30% font size cho phần đuôi nhô xuống (g, y, p...)
      const normPaddingX = 4 / width; // 4px đệm ngang để xóa sát mép

      const paddedX = Math.max(0, r.x - normPaddingX);
      const paddedY = Math.max(0, r.y - normPaddingTop);
      const paddedW = Math.min(1 - paddedX, r.width + normPaddingX * 2);
      const paddedH = Math.min(1 - paddedY, r.height + normPaddingTop + normPaddingBottom);

      await createToolAnnotation("redact", pageNumber, {
        x: paddedX,
        y: paddedY,
        width: paddedW,
        height: paddedH,
        color: finalMaskColor,
        opacity: 1
      });
    }

    // 2. Vẽ văn bản mới đè lên
    await createToolAnnotation("note", pageNumber, {
      isPatch: true,
      text: editedInputText,
      color: "transparent",
      textColor: patchTextColorMode === "custom" ? customTextColorInput : patchTextColorMode,
      fontSize: patchFontSize,
      fontFamily: patchFontFamily,
      x: minX,
      y: minY,
      width: unionW,
      height: unionH
    });

    setEditTextState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveRewrite = async () => {
    if (!rewriteText || !createToolAnnotation) return;

    const targetsToCover = (rewriteMatchedItems && rewriteMatchedItems.length > 0) ? rewriteMatchedItems : rewriteRects;

    const minX = Math.min(...targetsToCover.map((r: any) => r.x));
    const minY = Math.min(...targetsToCover.map((r: any) => r.y));
    const maxX = Math.max(...targetsToCover.map((r: any) => r.x + r.width));
    const maxY = Math.max(...targetsToCover.map((r: any) => r.y + r.height));
    const unionW = maxX - minX;
    const unionH = maxY - minY;
    
    const matchedFontSize = (rewriteMatchedItems && rewriteMatchedItems.length > 0)
      ? Math.max(...rewriteMatchedItems.map((item: any) => item.fontSize))
      : 0;

    const finalFontSize = matchedFontSize > 8
      ? matchedFontSize
      : Math.round(unionH * height * 0.78) > 8
        ? Math.round(unionH * height * 0.78)
        : 14;

    // Che văn bản cũ bằng màu nền tự chọn với padding mở rộng để xóa sạch hoàn toàn
    for (const r of targetsToCover) {
      const itemFontSize = r.fontSize || finalFontSize || 12;
      const normFontSize = itemFontSize / height;
      const normPaddingTop = normFontSize * 0.20; // 20% font size cho phần nhô lên
      const normPaddingBottom = normFontSize * 0.30; // 30% font size cho phần đuôi nhô xuống (g, y, p...)
      const normPaddingX = 4 / width; // 4px đệm ngang để xóa sát mép

      const paddedX = Math.max(0, r.x - normPaddingX);
      const paddedY = Math.max(0, r.y - normPaddingTop);
      const paddedW = Math.min(1 - paddedX, r.width + normPaddingX * 2);
      const paddedH = Math.min(1 - paddedY, r.height + normPaddingTop + normPaddingBottom);

      await createToolAnnotation("redact", pageNumber, {
        x: paddedX,
        y: paddedY,
        width: paddedW,
        height: paddedH,
        color: maskColor === "custom" ? customColorInput : maskColor,
        opacity: 1
      });
    }

    // Vẽ văn bản viết lại mới đè lên
    await createToolAnnotation("note", pageNumber, {
      isPatch: true,
      text: rewriteResult,
      color: "transparent",
      textColor: "black",
      fontSize: finalFontSize,
      x: minX,
      y: minY,
      width: unionW,
      height: unionH
    });

    setRewriteText(null);
    setRewriteResult("");
    window.getSelection()?.removeAllRanges();
  };

  // Kích hoạt sửa trực tiếp đoạn văn (Stirling Paragraph Mode) khi nhấp chuột vào khối đoạn văn
  const handleStirlingParagraphClick = (para: GroupedParagraph) => {
    const allItems = para.lines.flatMap(line => line.items);
    const paraRects = allItems.map(item => ({
      x: item.left / width,
      y: item.top / height,
      width: item.width / width,
      height: item.height / height
    }));

    const matchedFontSize = allItems.length > 0 ? Math.max(...allItems.map(item => item.fontSize)) : 0;
    const finalFontSize = matchedFontSize > 8 ? matchedFontSize : 14;
    setPatchFontSize(Math.round(finalFontSize));
    setPatchTextColorMode("black");

    const originalFont = allItems.length > 0 ? allItems[0].fontName : undefined;
    if (originalFont) {
      setPatchFontFamily(originalFont);
    } else {
      setPatchFontFamily("Helvetica, Arial, sans-serif");
    }

    setEditedInputText(para.str);
    setEditTextState({
      text: para.str,
      rects: paraRects,
      matchedItems: allItems.map(item => ({
        x: item.left / width,
        y: item.top / height,
        width: item.width / width,
        height: item.height / height,
        fontSize: item.fontSize
      }))
    });
  };

  return (
    <>
      <div
        ref={layerRef}
        className={`pdf-text-layer ${selectionEnabled ? "" : "disabled"} ${stirlingMode ? "stirling-active" : ""}`}
        data-page={pageNumber}
        style={{ width, height, overflow: editTextState ? "visible" : undefined }}
        onContextMenu={handleContextMenu}
      >
        {/* Render các khung tương tác cho patch đã lưu trong Stirling Mode */}
        {stirlingMode && pagePatches.map((patch) => {
          const payload = patch.payload as any;
          if (!payload) return null;
          
          const patchX = (payload.x ?? 0) * width;
          const patchY = (payload.y ?? 0) * height;
          const patchW = (payload.width ?? 0.1) * width;
          const patchH = (payload.height ?? 0.05) * height;

          return (
            <div
              key={`saved-patch-${patch.id}`}
              onClick={(e) => {
                e.stopPropagation();
                
                const tColor = payload.textColor || "black";
                if (tColor === "black" || tColor === "white") {
                  setPatchTextColorMode(tColor);
                } else {
                  setPatchTextColorMode("custom");
                  setCustomTextColorInput(tColor);
                }
                setPatchFontSize(payload.fontSize || 14);
                setPatchFontFamily(payload.fontFamily || "Helvetica, Arial, sans-serif");

                setEditedInputText(payload.text || "");
                setEditTextState({
                  id: patch.id,
                  text: payload.text || "",
                  rects: [{ x: payload.x, y: payload.y, width: payload.width, height: payload.height }],
                  matchedItems: [{ x: payload.x, y: payload.y, width: payload.width, height: payload.height, fontSize: payload.fontSize }]
                });
              }}
              className="absolute border border-dashed border-indigo-500/60 hover:border-indigo-700 hover:bg-indigo-500/10 cursor-pointer transition-all duration-150 rounded group pointer-events-auto"
              style={{
                left: patchX - 3,
                top: patchY - 3,
                width: patchW + 6,
                height: patchH + 6,
                pointerEvents: "auto"
              }}
              title="Click to edit this paragraph patch again"
            >
              <strong className="hidden group-hover:block absolute -top-4 right-0 bg-indigo-700 text-white text-[8px] font-bold px-1 rounded shadow-xs select-none">
                📝 Edit Patch
              </strong>
            </div>
          );
        })}

        {/* Nút bật tắt Stirling PDF Edit Mode */}
        <div 
          className="absolute top-2 right-2 z-30 select-none pointer-events-auto flex flex-col gap-1.5 items-end"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setStirlingMode(!stirlingMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all duration-200 cursor-pointer shadow-sm ${
              stirlingMode 
                ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700" 
                : "bg-white/90 backdrop-blur-sm border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <strong>✨ Stirling Edit Mode</strong>
            <strong className={`w-1.5 h-1.5 rounded-full ${stirlingMode ? "bg-emerald-400 animate-pulse" : "bg-slate-300"}`} />
          </button>

          {/* Lựa chọn chế độ gom đoạn (Tự động vs Bôi đen thủ công) */}
          {stirlingMode && (
            <div className="flex bg-white/90 backdrop-blur-xs border border-slate-200/80 p-0.5 rounded-lg shadow-sm gap-0.5 text-[10px] pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  setStirlingSubMode("auto");
                }}
                className={`px-2 py-1 font-bold rounded-md cursor-pointer transition-all ${
                  stirlingSubMode === "auto" 
                    ? "bg-indigo-600 text-white shadow-xs" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                🤖 Auto-Group
              </button>
              <button
                type="button"
                onClick={() => setStirlingSubMode("manual")}
                className={`px-2 py-1 font-bold rounded-md cursor-pointer transition-all ${
                  stirlingSubMode === "manual" 
                    ? "bg-indigo-600 text-white shadow-xs" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                🖱️ Drag-Select
              </button>
            </div>
          )}
        </div>

        {stirlingMode && stirlingSubMode === "auto" ? (
          // Stirling-PDF Mode: Hiển thị các khối đoạn văn (paragraphs) để sửa trực tiếp
          groupedParagraphs.map((para, idx) => (
            <div
              key={`stirling-para-${idx}-${para.top}`}
              onClick={(e) => {
                e.stopPropagation();
                handleStirlingParagraphClick(para);
              }}
              className="absolute border border-dashed border-indigo-400/40 hover:border-indigo-600 hover:bg-indigo-500/10 cursor-pointer transition-all duration-150 rounded group pointer-events-auto"
              style={{
                left: para.left - 4,
                top: para.top - 4,
                width: para.width + 8,
                height: para.height + 8,
                pointerEvents: "auto"
              }}
              title="Click to edit this text paragraph directly"
            >
              <strong className="hidden group-hover:block absolute -top-4 left-0 bg-indigo-600 text-white text-[8px] font-bold px-1 rounded shadow-xs select-none">
                Stirling Paragraph Edit
              </strong>
            </div>
          ))
        ) : (
          // Normal Text Layer (for text selection and right-click)
          textItems.map((item, index) => (
            <span
              key={`${index}-${item.left}-${item.top}`}
              style={{
                left: item.left,
                top: item.top,
                width: item.width,
                height: item.height,
                fontSize: item.fontSize,
                transform: item.transform,
              }}
            >
              {item.str}
            </span>
          ))
        )}

        {/* INLINE TEXT EDITOR OVERLAY (PDFgear style) */}
        {editTextState && (
          (() => {
            const targetsToCover = (editTextState.matchedItems && editTextState.matchedItems.length > 0) ? editTextState.matchedItems : editTextState.rects;
            if (targetsToCover.length === 0) return null;

            const minX = Math.min(...targetsToCover.map((r: any) => r.x));
            const minY = Math.min(...targetsToCover.map((r: any) => r.y));
            const maxX = Math.max(...targetsToCover.map((r: any) => r.x + r.width));
            const maxY = Math.max(...targetsToCover.map((r: any) => r.y + r.height));
            const unionW = maxX - minX;
            const unionH = maxY - minY;

            const matchedFontSize = (editTextState.matchedItems && editTextState.matchedItems.length > 0)
              ? Math.max(...editTextState.matchedItems.map((item: any) => item.fontSize))
              : 0;

            const finalFontSize = matchedFontSize > 8
              ? matchedFontSize
              : Math.round(unionH * height * 0.78) > 8
                ? Math.round(unionH * height * 0.78)
                : 14;

            const posX = minX * width;
            const posY = minY * height;
            const posW = unionW * width;
            const posH = unionH * height;

            return (
              <div
                className="absolute z-40 flex flex-col pointer-events-auto select-none"
                style={{
                  left: posX - 4,
                  top: posY - 4,
                  width: Math.max(posW + 8, 220),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Inline Textarea matching the text position and style */}
                <textarea
                  value={editedInputText}
                  onChange={(e) => setEditedInputText(e.target.value)}
                  className="w-full border-2 border-indigo-650 rounded-lg p-1.5 focus:outline-none resize-none shadow-md"
                  style={{
                    height: Math.max(posH + 8, 60),
                    fontSize: `${patchFontSize}px`,
                    lineHeight: `${patchFontSize * 1.2}px`,
                    color: patchTextColorMode === "custom" ? customTextColorInput : patchTextColorMode,
                    fontFamily: patchFontFamily,
                    backgroundColor: maskColor === "custom" ? customColorInput : maskColor,
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditTextState(null);
                    }
                  }}
                />
                
                {/* Floating mini-toolbar underneath */}
                <div className="flex items-center gap-1.5 mt-1 bg-white border border-slate-200 rounded-lg p-1 shadow-lg w-max select-none z-50 flex-wrap max-w-lg">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <strong>💾 Save</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTextState(null)}
                    className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    ✕ Cancel
                  </button>

                  <div className="w-px h-3 bg-slate-200" />

                  {/* Font Family selection */}
                  <div className="text-[9px] font-semibold text-slate-400">Font:</div>
                  <select
                    value={patchFontFamily}
                    onChange={(e) => setPatchFontFamily(e.target.value)}
                    className="text-[9px] font-medium border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-700 outline-none"
                  >
                    {!["Helvetica, Arial, sans-serif", "'Times New Roman', Times, serif", "'Courier New', Courier, monospace"].includes(patchFontFamily) && (
                      <option value={patchFontFamily}>PDF embedded font ({patchFontFamily})</option>
                    )}
                    <option value="Helvetica, Arial, sans-serif">Sans-serif (Arial)</option>
                    <option value="'Times New Roman', Times, serif">Serif (Times)</option>
                    <option value="'Courier New', Courier, monospace">Monospace (Courier)</option>
                  </select>

                  {/* Font Size control */}
                  <div className="w-px h-3 bg-slate-200" />
                  <div className="text-[9px] font-semibold text-slate-400">Size:</div>
                  <div className="flex items-center gap-0.5 border border-slate-200 rounded p-0.5 bg-white">
                    <button
                      type="button"
                      onClick={() => setPatchFontSize(prev => Math.max(6, prev - 1))}
                      className="w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-[9px] font-bold text-slate-700 px-1 select-none min-w-[12px] text-center">
                      {patchFontSize}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPatchFontSize(prev => Math.min(72, prev + 1))}
                      className="w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Text Color picker */}
                  <div className="w-px h-3 bg-slate-200" />
                  <div className="text-[9px] font-semibold text-slate-400">Text:</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPatchTextColorMode("black")}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "black" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-black`}
                      title="Black text"
                    />
                    <button
                      type="button"
                      onClick={() => setPatchTextColorMode("white")}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "white" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-white`}
                      title="White text"
                    />
                    <button
                      type="button"
                      onClick={() => { setPatchTextColorMode("custom"); setCustomTextColorInput("#d97706"); }}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "custom" && customTextColorInput === "#d97706" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-amber-600`}
                      title="Golden text"
                    />
                    <button
                      type="button"
                      onClick={() => { setPatchTextColorMode("custom"); setCustomTextColorInput("#1e3a8a"); }}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "custom" && customTextColorInput === "#1e3a8a" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-blue-900`}
                      title="Dark blue text"
                    />
                    <button
                      type="button"
                      onClick={() => { setPatchTextColorMode("custom"); setCustomTextColorInput("#ef4444"); }}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "custom" && customTextColorInput === "#ef4444" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-red-500`}
                      title="Red text"
                    />
                    <button
                      type="button"
                      onClick={() => { setPatchTextColorMode("custom"); }}
                      className={`w-3.5 h-3.5 rounded border ${patchTextColorMode === "custom" && !["#d97706", "#1e3a8a", "#ef4444"].includes(customTextColorInput) ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-gradient-to-tr from-yellow-400 via-pink-500 to-indigo-500`}
                      title="Custom text color"
                    />
                    {patchTextColorMode === "custom" && !["#d97706", "#1e3a8a", "#ef4444"].includes(customTextColorInput) && (
                      <input
                        type="color"
                        value={customTextColorInput}
                        onChange={(e) => setCustomTextColorInput(e.target.value)}
                        className="w-4 h-4 p-0 border-0 rounded cursor-pointer"
                        title="Pick text color"
                      />
                    )}
                    {typeof window !== "undefined" && "EyeDropper" in window && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const eyeDropper = new (window as any).EyeDropper();
                            const result = await eyeDropper.open();
                            setPatchTextColorMode("custom");
                            setCustomTextColorInput(result.sRGBHex);
                          } catch (err) {
                            console.error("Eyedropper failed:", err);
                          }
                        }}
                        className="w-4 h-4 flex items-center justify-center border border-slate-300 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer text-[9px] p-0"
                        title="Pick text color from screen"
                      >
                        🔍
                      </button>
                    )}
                  </div>

                  <div className="w-px h-3 bg-slate-200" />

                  <div className="text-[9px] font-semibold text-slate-400">Mask:</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMaskColor("white")}
                      className={`w-3.5 h-3.5 rounded border ${maskColor === "white" ? "border-indigo-600 ring-1 ring-indigo-600" : "border-slate-300"} bg-white`}
                      title="White background mask"
                    />
                    <button
                      type="button"
                      onClick={() => setMaskColor("black")}
                      className={`w-3.5 h-3.5 rounded border ${maskColor === "black" ? "border-indigo-600 ring-1 ring-indigo-600" : "border-slate-300"} bg-black`}
                      title="Black background mask"
                    />
                    <button
                      type="button"
                      onClick={() => setMaskColor("custom")}
                      className={`w-3.5 h-3.5 rounded border ${maskColor === "custom" ? "border-indigo-600 ring-1 ring-indigo-600" : "border-slate-300"} bg-gradient-to-tr from-yellow-400 via-pink-500 to-indigo-500`}
                      title="Custom color mask"
                    />
                    {maskColor === "custom" && (
                      <input
                        type="color"
                        value={customColorInput}
                        onChange={(e) => setCustomColorInput(e.target.value)}
                        className="w-4 h-4 p-0 border-0 rounded cursor-pointer"
                        title="Pick background color"
                      />
                    )}
                    {typeof window !== "undefined" && "EyeDropper" in window && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const eyeDropper = new (window as any).EyeDropper();
                            const result = await eyeDropper.open();
                            setMaskColor("custom");
                            setCustomColorInput(result.sRGBHex);
                          } catch (err) {
                            console.error("Eyedropper failed:", err);
                          }
                        }}
                        className="w-4 h-4 flex items-center justify-center border border-slate-300 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer text-[9px] p-0"
                        title="Pick background mask color from screen"
                      >
                        🔍
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* NÂNG CẤP: Premium Context Menu chuột phải */}
      {menu && createPortal(
        <div
          className="fixed z-[9999] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl p-1.5 min-w-[170px] flex flex-col gap-0.5 transition-all duration-150 animate-in fade-in slide-in-from-top-1 pointer-events-auto"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button 
            type="button" 
            onClick={() => runAction("copy")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            📋 Copy Text
          </button>
          <button 
            type="button" 
            onClick={() => runAction("edit-text")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            📝 Edit Text (Che & Sửa)
          </button>
          <button 
            type="button" 
            onClick={() => runAction("ai-rewrite")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            🤖 AI Rewrite (Viết lại)
          </button>
          <button 
            type="button" 
            onClick={() => runAction("translate")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            🗣️ AI Translate (Dịch)
          </button>
          <div className="h-px bg-slate-100 my-1" />
          <button 
            type="button" 
            onClick={() => runAction("highlight")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-yellow-50 hover:text-yellow-600 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            🟨 Highlight
          </button>
          <button 
            type="button" 
            onClick={() => runAction("underline")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            ➖ Underline
          </button>
          <button 
            type="button" 
            onClick={() => runAction("strike")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            ⨉ Strikethrough
          </button>
          <button 
            type="button" 
            onClick={() => runAction("redact")}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-red-650 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-left w-full"
          >
            🧽 Erase Text (Xóa chữ)
          </button>
        </div>,
        document.body
      )}

      {/* NÂNG CẤP: AI Translation Modal với API thực tế */}
      {translateText && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/80 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 animate-in zoom-in-95 pointer-events-auto">
            <div className="flex justify-between items-center bg-slate-50 border-b border-slate-100 px-5 py-4 select-none">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🗣️ AI Dịch Thuật</h3>
              <button 
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" 
                onClick={() => setTranslateText(null)}
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[350px] overflow-y-auto">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Văn bản gốc:</span>
                <p className="text-xs text-slate-600 font-sans italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                  "{translateText}"
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bản dịch AI (Gemini):</span>
                <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100/50 text-xs text-slate-850 font-sans leading-relaxed min-h-[60px] flex items-center justify-start">
                  {isTranslating ? (
                    <div className="flex items-center gap-2 text-indigo-650 font-medium select-none">
                      <svg className="animate-spin h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Đang biên dịch bằng AI...</span>
                    </div>
                  ) : (
                    <p className="margin-0 whitespace-pre-wrap">{translationResult}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex justify-end">
              <button 
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer" 
                onClick={() => setTranslateText(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MỚI: AI Rewrite Modal */}
      {rewriteText && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/80 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 animate-in zoom-in-95 pointer-events-auto">
            <div className="flex justify-between items-center bg-slate-50 border-b border-slate-100 px-5 py-4 select-none">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🤖 AI Rewrite - Viết Lại Văn Bản</h3>
              <button 
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" 
                onClick={() => setRewriteText(null)}
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[380px] overflow-y-auto">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Văn bản gốc:</span>
                <p className="text-xs text-slate-600 font-sans italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  "{rewriteText}"
                </p>
              </div>
              
              <div className="space-y-1.5 select-none">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chọn phong cách viết:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setRewritePrompt("Viết lại đoạn văn bản này một cách trang trọng, chuyên nghiệp và lịch sự hơn")}
                    className={`px-3 py-1.5 text-left text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      rewritePrompt.includes("trang trọng") 
                        ? "border-indigo-500 bg-indigo-50/50 text-indigo-650" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    👔 Trang trọng hơn
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRewritePrompt("Rút gọn đoạn văn bản này một cách ngắn gọn, súc tích và dễ hiểu nhất")}
                    className={`px-3 py-1.5 text-left text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      rewritePrompt.includes("ngắn gọn") 
                        ? "border-indigo-500 bg-indigo-50/50 text-indigo-650" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    📝 Ngắn gọn hơn
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRewritePrompt("Sửa các lỗi chính tả, lỗi ngữ pháp và cách hành văn trong đoạn văn này")}
                    className={`px-3 py-1.5 text-left text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      rewritePrompt.includes("lỗi chính tả") 
                        ? "border-indigo-500 bg-indigo-50/50 text-indigo-650" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    ✏️ Sửa chính tả & ngữ pháp
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRewritePrompt("Viết lại đoạn văn theo phong cách thân thiện, cởi mở và dễ tiếp cận hơn")}
                    className={`px-3 py-1.5 text-left text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      rewritePrompt.includes("thân thiện") 
                        ? "border-indigo-500 bg-indigo-50/50 text-indigo-650" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    🤝 Thân thiện hơn
                  </button>
                </div>
                <input 
                  type="text"
                  value={rewritePrompt}
                  onChange={(e) => setRewritePrompt(e.target.value)}
                  placeholder="Yêu cầu viết lại tùy chỉnh..."
                  className="w-full mt-2 text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleAiRewrite}
                  disabled={isRewriting || !rewritePrompt.trim()}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-650 border border-indigo-100 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isRewriting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Đang viết lại...</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Chạy AI Viết lại</span>
                    </>
                  )}
                </button>
              </div>

              {rewriteResult && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kết quả đề xuất của AI:</span>
                  <textarea
                    value={rewriteResult}
                    onChange={(e) => setRewriteResult(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-950 text-indigo-300 rounded-lg border border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans min-h-[90px] resize-y"
                  />
                </div>
              )}
            </div>
            
            <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex justify-end gap-2">
              <button 
                className="bg-white border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-50 cursor-pointer" 
                onClick={() => setRewriteText(null)}
              >
                Hủy
              </button>
              <button 
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer" 
                onClick={handleSaveRewrite}
                disabled={!rewriteResult || isRewriting}
              >
                Lưu & Thay Thế Chữ
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Nâng cấp: Modal cũ đã được thay thế hoàn chỉnh bằng bộ gõ inline overlay trực tiếp phía trên */}
    </>
  );
}
