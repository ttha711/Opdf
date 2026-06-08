import { useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import type { SelectionMenuState, TextSelectionAction } from "./PdfTextSelection.types";
import { joinMatchedItems } from "./PdfTextSelection.utils";
import type { EditStyleResolutionInput, EditStyleSnapshot } from "./PdfTextSelection.editStyle";

export function useTextActions(
  menu: SelectionMenuState | null,
  clearMenu: () => void,
  width: number,
  height: number,
  textItems: RenderedTextItem[],
  pageNumber: number,
  onAction: (pageNumber: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void,
  findMatchedItems: (rects: Array<{ x: number; y: number; width: number; height: number }>) => RenderedTextItem[],
  resolveEditStyleSnapshot: (input: EditStyleResolutionInput) => Promise<EditStyleSnapshot>,
  imageUrl?: string
) {
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [translationResult, setTranslationResult] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translateRects, setTranslateRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [translateMatchedItems, setTranslateMatchedItems] = useState<any[]>([]);

  const [isEditTranslating, setIsEditTranslating] = useState<boolean>(false);

  const [rewriteText, setRewriteText] = useState<string | null>(null);
  const [rewritePrompt, setRewritePrompt] = useState<string>("Viết lại đoạn văn bản này một cách chuyên nghiệp và trang trọng hơn");
  const [rewriteResult, setRewriteResult] = useState<string>("");
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [rewriteRects, setRewriteRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [rewriteMatchedItems, setRewriteMatchedItems] = useState<any[]>([]);

  const [editTextState, setEditTextState] = useState<{ id?: string; text: string; rects: Array<{ x: number; y: number; width: number; height: number }>; matchedItems?: any[] } | null>(null);
  const [editedInputText, setEditedInputText] = useState("");
  const [maskColor, setMaskColor] = useState<string>("white");
  const [customColorInput, setCustomColorInput] = useState<string>("#ffffff");

  const [patchTextColorMode, setPatchTextColorMode] = useState<string>("black");
  const [customTextColorInput, setCustomTextColorInput] = useState<string>("#000000");
  const [patchFontSize, setPatchFontSize] = useState<number>(14);
  const [patchFontFamily, setPatchFontFamily] = useState<string>("Helvetica, Arial, sans-serif");
  const [patchFontWeight, setPatchFontWeight] = useState<string>("normal");
  const [patchFontStyle, setPatchFontStyle] = useState<string>("normal");
  const [patchTextAlign, setPatchTextAlign] = useState<string>("left");

  const [translateStyleSnapshot, setTranslateStyleSnapshot] = useState<EditStyleSnapshot | null>(null);
  const [translateOrigin, setTranslateOrigin] = useState<"menu" | "edit" | null>(null);

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

  const translateTextForEdit = async (text: string) => {
    const source = text.trim();
    if (!source) return "";

    setIsEditTranslating(true);
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: source,
          prompt: "Translate this selected text into natural Vietnamese if the source text is English, or into natural English if the source text is Vietnamese. Preserve meaning, punctuation, line breaks, and office-document tone. Return only the translated text, with no explanation or markdown."
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi kết nối AI.");
      }

      const raw = String(data.html || data.text || "").trim();
      if (!raw) return "";

      const wrapper = document.createElement("div");
      wrapper.innerHTML = raw;
      return (wrapper.textContent || wrapper.innerText || raw).trim();
    } catch (err: any) {
      throw new Error(err.message || "Lỗi dịch thuật.");
    } finally {
      setIsEditTranslating(false);
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

  const captureStyleSnapshot = async (rects: Array<{ x: number; y: number; width: number; height: number }>, matchedItems: any[]) => {
    return resolveEditStyleSnapshot({
      pageNumber,
      rects,
      matchedItems,
      layerEl: document.querySelector(`[data-page="${pageNumber}"] .pdf-text-layer`) as HTMLDivElement | null,
      imageUrl,
    });
  };

  const startTranslateFlow = async (sourceText: string, rects: Array<{ x: number; y: number; width: number; height: number }>, matchedItems: any[], origin: "menu" | "edit") => {
    setTranslateText(sourceText);
    setTranslationResult("");
    setTranslateRects(rects);
    setTranslateMatchedItems(matchedItems.map((item) => {
      if (typeof item?.left === "number" && typeof item?.top === "number") {
        return {
          x: item.left / width,
          y: item.top / height,
          width: item.width / width,
          height: item.height / height,
          fontSize: item.fontSize,
        };
      }
      return item;
    }));
    setTranslateOrigin(origin);

    const styleSnapshot = await captureStyleSnapshot(rects, matchedItems);
    setTranslateStyleSnapshot(styleSnapshot);

    void handleAiTranslate(sourceText);
  };

  const startTranslateFromEdit = async () => {
    if (!editTextState) return;
    const rects = editTextState.rects;
    const matchedItems = editTextState.matchedItems || [];
    const sourceText = editedInputText.trim() || editTextState.text || "";
    await startTranslateFlow(sourceText, rects, matchedItems, "edit");
  };

  const runAction = async (action: TextSelectionAction) => {
    if (!menu) return;
    if (action === "copy") {
      await navigator.clipboard?.writeText(menu.text);
      clearMenu();
      return;
    }
    if (action === "translate") {
      const matchedItems = findMatchedItems(menu.rects);
      void startTranslateFlow(menu.text, menu.rects, matchedItems, "menu");
      clearMenu();
      return;
    }
    if (action === "ai-rewrite") {
      setRewriteText(menu.text);
      setRewriteResult("");
      setRewriteRects(menu.rects);

      const matchedItems = findMatchedItems(menu.rects);
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
      const matchedItems = findMatchedItems(menu.rects);

      const fullText = matchedItems.length > 0
        ? joinMatchedItems(matchedItems)
        : menu.text;
      const styleSnapshot = await resolveEditStyleSnapshot({
        pageNumber,
        rects: menu.rects,
        matchedItems,
        layerEl: document.querySelector(`[data-page="${pageNumber}"] .pdf-text-layer`) as HTMLDivElement | null,
        imageUrl,
      });

      setPatchFontSize(styleSnapshot.patchFontSize);
      setPatchFontFamily(styleSnapshot.patchFontFamily);
      setPatchFontWeight(styleSnapshot.patchFontWeight);
      setPatchFontStyle(styleSnapshot.patchFontStyle);
      setPatchTextAlign(styleSnapshot.patchTextAlign);
      setPatchTextColorMode(styleSnapshot.patchTextColorMode);
      setCustomTextColorInput(styleSnapshot.customTextColorInput);
      setMaskColor(styleSnapshot.maskColor);
      setCustomColorInput(styleSnapshot.customColorInput);

      setEditedInputText(fullText);
      setEditTextState({
        text: fullText,
        rects: menu.rects,
        matchedItems: matchedItems.map((item: any) => ({
          x: item.left / width,
          y: item.top / height,
          width: item.width / width,
          height: item.height / height,
          fontSize: item.fontSize,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
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

  return {
    translateText, setTranslateText, translationResult, setTranslationResult, isTranslating,
    translateRects, translateMatchedItems,
    translateStyleSnapshot, translateOrigin, setTranslateOrigin,
    rewriteText, setRewriteText, rewritePrompt, setRewritePrompt, rewriteResult, setRewriteResult, isRewriting,
    rewriteRects, rewriteMatchedItems,
    editTextState, setEditTextState, editedInputText, setEditedInputText,
    maskColor, setMaskColor, customColorInput, setCustomColorInput,
    patchTextColorMode, setPatchTextColorMode, customTextColorInput, setCustomTextColorInput,
    patchFontSize, setPatchFontSize, patchFontFamily, setPatchFontFamily, patchFontWeight, setPatchFontWeight, patchFontStyle, setPatchFontStyle, patchTextAlign, setPatchTextAlign,
    isEditTranslating,
    runAction, handleAiTranslate, handleAiRewrite, translateTextForEdit, startTranslateFromEdit,
  };
}
