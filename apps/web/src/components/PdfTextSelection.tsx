import { useCallback } from "react";
import type { PdfTextLayerProps, GroupedParagraph } from "./PdfTextSelection.types";
import { useTextSelection } from "./useTextSelection";
import { useTextActions } from "./useTextActions";
import { useStirlingMode } from "./useStirlingMode";
import { ContextMenu } from "./PdfTextContextMenu";
import { EditTextOverlay } from "./PdfEditTextOverlay";
import { TranslationModal } from "./PdfTranslateModal";
import { RewriteModal } from "./PdfRewriteModal";
import { StirlingControls, StirlingParagraphs, SavedPatches, NormalTextLayer } from "./PdfStirlingLayer";
import { applyEditPatch, applyRewritePatch, applyTranslatePatch } from "./PdfTextSelection.saveHandlers";
import { resolveEditStyleSnapshot as buildEditStyleSnapshot, type EditStyleSnapshot } from "./PdfTextSelection.editStyle";

export function PdfTextLayer({
  pageNumber,
  width,
  height,
  textItems,
  selectionEnabled,
  onAction,
  createToolAnnotation,
  annotations,
  onAnnotationUpdated,
  imageUrl,
}: PdfTextLayerProps) {
  const { menu, clearMenu, layerRef, handleContextMenu, handleMouseDown, findMatchedItems } = useTextSelection(
    selectionEnabled,
    width,
    height,
    textItems,
  );

  const resolveInitialEditStyle = useCallback(
    async (input: {
      pageNumber: number;
      rects: Array<{ x: number; y: number; width: number; height: number }>;
      matchedItems: any[];
      layerEl?: HTMLDivElement | null;
      imageUrl?: string;
      fallbackFontSize?: number;
      fallbackFontFamily?: string;
      fallbackFontWeight?: string;
      fallbackFontStyle?: string;
      fallbackTextColor?: string;
    }): Promise<EditStyleSnapshot> => {
      return buildEditStyleSnapshot({
        ...input,
        pageNumber,
        layerEl: input.layerEl ?? layerRef.current,
        imageUrl: input.imageUrl ?? imageUrl,
      });
    },
    [imageUrl, layerRef, pageNumber],
  );

  const actions = useTextActions(
    menu,
    clearMenu,
    width,
    height,
    textItems,
    pageNumber,
    onAction,
    findMatchedItems,
    resolveInitialEditStyle,
    imageUrl,
  );

  const { stirlingMode, setStirlingMode, stirlingSubMode, setStirlingSubMode, groupedParagraphs } =
    useStirlingMode(textItems);

  const pagePatches = (annotations ?? []).filter(
    (ann) => ann.page === pageNumber && ann.kind === "note" && (ann.payload as any)?.isPatch,
  );

  const handleSaveEdit = async () => {
    if (!actions.editTextState) return;
    await applyEditPatch({
      editTextState: actions.editTextState,
      editedInputText: actions.editedInputText,
      maskColor: actions.maskColor,
      customColorInput: actions.customColorInput,
      patchTextColorMode: actions.patchTextColorMode,
      customTextColorInput: actions.customTextColorInput,
      patchFontSize: actions.patchFontSize,
      patchFontFamily: actions.patchFontFamily,
      patchFontWeight: actions.patchFontWeight,
      patchFontStyle: actions.patchFontStyle,
      width, height, pageNumber,
      createToolAnnotation,
      onAnnotationUpdated,
    });
    actions.setEditTextState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleTranslateFromEdit = async () => {
    await actions.startTranslateFromEdit();
  };

  const handleSaveRewrite = async () => {
    if (!actions.rewriteText) return;
    await applyRewritePatch({
      rewriteText: actions.rewriteText,
      rewriteResult: actions.rewriteResult,
      rewriteRects: actions.rewriteRects,
      rewriteMatchedItems: actions.rewriteMatchedItems,
      maskColor: actions.maskColor,
      customColorInput: actions.customColorInput,
      width, height, pageNumber,
      createToolAnnotation,
      imageUrl,
    });
    actions.setRewriteText(null);
    actions.setRewriteResult("");
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveTranslate = async () => {
    if (!actions.translateText) return;
    const translateOrigin = actions.translateOrigin;
    await applyTranslatePatch({
      translateText: actions.translateText,
      translationResult: actions.translationResult,
      translateRects: actions.translateRects,
      translateMatchedItems: actions.translateMatchedItems,
      maskColor: actions.maskColor,
      customColorInput: actions.customColorInput,
      patchTextColorMode: actions.translateStyleSnapshot?.patchTextColorMode ?? actions.patchTextColorMode,
      customTextColorInput: actions.translateStyleSnapshot?.customTextColorInput ?? actions.customTextColorInput,
      patchFontSize: actions.translateStyleSnapshot?.patchFontSize ?? actions.patchFontSize,
      patchFontFamily: actions.translateStyleSnapshot?.patchFontFamily ?? actions.patchFontFamily,
      patchFontWeight: actions.translateStyleSnapshot?.patchFontWeight ?? actions.patchFontWeight,
      patchFontStyle: actions.translateStyleSnapshot?.patchFontStyle ?? actions.patchFontStyle,
      width, height, pageNumber,
      createToolAnnotation,
      imageUrl,
    });
    actions.setTranslateText(null);
    actions.setTranslationResult("");
    actions.setTranslateOrigin(null);
    if (translateOrigin === "edit") {
      actions.setEditTextState(null);
      window.getSelection()?.removeAllRanges();
    }
    window.getSelection()?.removeAllRanges();
  };

  const handleStirlingParagraphClick = async (para: GroupedParagraph) => {
    const allItems = para.lines.flatMap(line => line.items);
    const paraRects = allItems.map(item => ({
      x: item.left / width,
      y: item.top / height,
      width: item.width / width,
      height: item.height / height,
    }));

    const style = await resolveInitialEditStyle({
      pageNumber,
      rects: paraRects,
      matchedItems: allItems,
      fallbackFontFamily: allItems[0]?.fontName,
      fallbackFontSize: allItems.length > 0 ? Math.max(...allItems.map(item => item.fontSize)) : 14,
      fallbackFontWeight: (allItems[0] as any)?.fontWeight,
      fallbackFontStyle: (allItems[0] as any)?.fontStyle,
    });

    actions.setPatchFontSize(style.patchFontSize);
    actions.setPatchFontFamily(style.patchFontFamily);
    actions.setPatchFontWeight(style.patchFontWeight);
    actions.setPatchFontStyle(style.patchFontStyle);
    actions.setPatchTextColorMode(style.patchTextColorMode);
    actions.setCustomTextColorInput(style.customTextColorInput);
    actions.setMaskColor(style.maskColor);
    actions.setCustomColorInput(style.customColorInput);

    actions.setEditedInputText(para.str);
    actions.setEditTextState({
      text: para.str,
      rects: paraRects,
      matchedItems: allItems.map(item => ({
        x: item.left / width,
        y: item.top / height,
        width: item.width / width,
        height: item.height / height,
        fontSize: item.fontSize,
      })),
    });
  };

  const handlePatchClick = async (patch: any) => {
    const payload = patch.payload as any;
    if (!payload) return;

    const matchedItems = [{ x: payload.x, y: payload.y, width: payload.width, height: payload.height, fontSize: payload.fontSize, fontName: payload.fontFamily }];
    const style = await resolveInitialEditStyle({
      pageNumber,
      rects: [{ x: payload.x, y: payload.y, width: payload.width, height: payload.height }],
      matchedItems,
      fallbackFontSize: payload.fontSize || 14,
      fallbackFontFamily: payload.fontFamily || "Helvetica, Arial, sans-serif",
      fallbackFontWeight: payload.fontWeight || "normal",
      fallbackFontStyle: payload.fontStyle || "normal",
      fallbackTextColor: payload.textColor || "black",
    });

    actions.setPatchFontSize(style.patchFontSize);
    actions.setPatchFontFamily(style.patchFontFamily);
    actions.setPatchFontWeight(style.patchFontWeight);
    actions.setPatchFontStyle(style.patchFontStyle);
    actions.setPatchTextColorMode(style.patchTextColorMode);
    actions.setCustomTextColorInput(style.customTextColorInput);
    actions.setMaskColor(style.maskColor);
    actions.setCustomColorInput(style.customColorInput);

    actions.setEditedInputText(payload.text || "");
    actions.setEditTextState({
      id: patch.id,
      text: payload.text || "",
      rects: [{ x: payload.x, y: payload.y, width: payload.width, height: payload.height }],
      matchedItems,
    });
  };

  return (
    <>
      <div
        ref={layerRef}
        className={`pdf-text-layer ${selectionEnabled ? "" : "disabled"} ${stirlingMode ? "stirling-active" : ""}`}
        data-page={pageNumber}
        style={{ width, height, overflow: actions.editTextState ? "visible" : undefined }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        <StirlingControls
          active={stirlingMode}
          subMode={stirlingSubMode}
          onToggle={() => setStirlingMode(!stirlingMode)}
          onSubModeChange={setStirlingSubMode}
        />

        {stirlingMode && <SavedPatches patches={pagePatches} width={width} height={height} onClick={handlePatchClick} />}

        {stirlingMode && stirlingSubMode === "auto" ? (
          <StirlingParagraphs paragraphs={groupedParagraphs} onParagraphClick={handleStirlingParagraphClick} />
        ) : (
          <NormalTextLayer items={textItems} />
        )}

        {actions.editTextState && (
          <EditTextOverlay
            editTextState={actions.editTextState}
            editedInputText={actions.editedInputText}
            setEditedInputText={actions.setEditedInputText}
            width={width}
            height={height}
            patchFontSize={actions.patchFontSize}
            patchFontFamily={actions.patchFontFamily}
            patchFontWeight={actions.patchFontWeight}
            patchFontStyle={actions.patchFontStyle}
            patchTextColorMode={actions.patchTextColorMode}
            customTextColorInput={actions.customTextColorInput}
            maskColor={actions.maskColor}
            customColorInput={actions.customColorInput}
            onSave={handleSaveEdit}
            onCancel={() => actions.setEditTextState(null)}
            setPatchTextColorMode={actions.setPatchTextColorMode}
            setCustomTextColorInput={actions.setCustomTextColorInput}
            setPatchFontSize={actions.setPatchFontSize}
            setPatchFontFamily={actions.setPatchFontFamily}
            setPatchFontWeight={actions.setPatchFontWeight}
            setPatchFontStyle={actions.setPatchFontStyle}
            setMaskColor={actions.setMaskColor}
            setCustomColorInput={actions.setCustomColorInput}
            onTranslateAndSave={handleTranslateFromEdit}
            isTranslating={actions.isEditTranslating}
          />
        )}
      </div>

      {menu && <ContextMenu menu={menu} onAction={actions.runAction} />}

      {actions.translateText && (
        <TranslationModal
          translateText={actions.translateText}
          translationResult={actions.translationResult}
          setTranslationResult={actions.setTranslationResult}
          isTranslating={actions.isTranslating}
          onSave={handleSaveTranslate}
          onClose={() => {
            actions.setTranslateText(null);
            actions.setTranslateOrigin(null);
          }}
        />
      )}

      {actions.rewriteText && (
        <RewriteModal
          rewriteText={actions.rewriteText}
          rewritePrompt={actions.rewritePrompt}
          setRewritePrompt={actions.setRewritePrompt}
          rewriteResult={actions.rewriteResult}
          setRewriteResult={actions.setRewriteResult}
          isRewriting={actions.isRewriting}
          onRun={actions.handleAiRewrite}
          onSave={handleSaveRewrite}
          onClose={() => actions.setRewriteText(null)}
        />
      )}
    </>
  );
}
