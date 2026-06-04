function ColorPicker({
  label,
  mode,
  setMode,
  customInput,
  setCustomInput,
}: {
  label: string;
  mode: string;
  setMode: (v: string) => void;
  customInput: string;
  setCustomInput: (v: string) => void;
}) {
  return (
    <>
      <div className="text-[9px] font-semibold text-slate-400">{label}:</div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMode("black")} className={`w-3.5 h-3.5 rounded border ${mode === "black" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-black`} title="Black" />
        <button type="button" onClick={() => setMode("white")} className={`w-3.5 h-3.5 rounded border ${mode === "white" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-white`} title="White" />
        <button type="button" onClick={() => { setMode("custom"); setCustomInput("#d97706"); }} className={`w-3.5 h-3.5 rounded border ${mode === "custom" && customInput === "#d97706" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-amber-600`} title="Golden" />
        <button type="button" onClick={() => { setMode("custom"); setCustomInput("#1e3a8a"); }} className={`w-3.5 h-3.5 rounded border ${mode === "custom" && customInput === "#1e3a8a" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-blue-900`} title="Dark blue" />
        <button type="button" onClick={() => { setMode("custom"); setCustomInput("#ef4444"); }} className={`w-3.5 h-3.5 rounded border ${mode === "custom" && customInput === "#ef4444" ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-red-500`} title="Red" />
        <button type="button" onClick={() => { setMode("custom"); }} className={`w-3.5 h-3.5 rounded border ${mode === "custom" && !["#d97706", "#1e3a8a", "#ef4444"].includes(customInput) ? "border-indigo-650 ring-1 ring-indigo-650" : "border-slate-300"} bg-gradient-to-tr from-yellow-400 via-pink-500 to-indigo-500`} title="Custom color" />
        {mode === "custom" && !["#d97706", "#1e3a8a", "#ef4444"].includes(customInput) && (
          <input type="color" value={customInput} onChange={(e) => setCustomInput(e.target.value)} className="w-4 h-4 p-0 border-0 rounded cursor-pointer" title="Pick color" />
        )}
        {typeof window !== "undefined" && "EyeDropper" in window && (
          <button type="button" onClick={async () => { try { const eyeDropper = new (window as any).EyeDropper(); const result = await eyeDropper.open(); setMode("custom"); setCustomInput(result.sRGBHex); } catch (err) { console.error("Eyedropper failed:", err); } }} className="w-4 h-4 flex items-center justify-center border border-slate-300 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer text-[9px] p-0" title="Pick color from screen">🔍</button>
        )}
      </div>
    </>
  );
}

export function EditTextOverlay({
  editTextState,
  editedInputText,
  setEditedInputText,
  width,
  height,
  patchFontSize,
  patchFontFamily,
  patchFontWeight,
  patchFontStyle,
  patchTextColorMode,
  customTextColorInput,
  maskColor,
  customColorInput,
  onSave,
  onCancel,
  onTranslateAndSave,
  isTranslating,
  setPatchTextColorMode,
  setCustomTextColorInput,
  setPatchFontSize,
  setPatchFontFamily,
  setPatchFontWeight,
  setPatchFontStyle,
  setMaskColor,
  setCustomColorInput,
}: {
  editTextState: { id?: string; text: string; rects: Array<{ x: number; y: number; width: number; height: number }>; matchedItems?: any[] };
  editedInputText: string;
  setEditedInputText: (v: string) => void;
  width: number;
  height: number;
  patchFontSize: number;
  patchFontFamily: string;
  patchFontWeight: string;
  patchFontStyle: string;
  patchTextColorMode: string;
  customTextColorInput: string;
  maskColor: string;
  customColorInput: string;
  onSave: () => void;
  onCancel: () => void;
  onTranslateAndSave: () => void;
  isTranslating: boolean;
  setPatchTextColorMode: (v: string) => void;
  setCustomTextColorInput: (v: string) => void;
  setPatchFontSize: (v: number | ((p: number) => number)) => void;
  setPatchFontFamily: (v: string) => void;
  setPatchFontWeight: (v: string) => void;
  setPatchFontStyle: (v: string) => void;
  setMaskColor: (v: string) => void;
  setCustomColorInput: (v: string) => void;
}) {
  const targetsToCover =
    editTextState.matchedItems && editTextState.matchedItems.length > 0
      ? editTextState.matchedItems
      : editTextState.rects;
  if (targetsToCover.length === 0) return null;

  const minX = Math.min(...targetsToCover.map((r: any) => r.x));
  const minY = Math.min(...targetsToCover.map((r: any) => r.y));
  const maxX = Math.max(...targetsToCover.map((r: any) => r.x + r.width));
  const maxY = Math.max(...targetsToCover.map((r: any) => r.y + r.height));
  const unionW = maxX - minX;
  const unionH = maxY - minY;

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
          fontWeight: patchFontWeight,
          fontStyle: patchFontStyle,
          backgroundColor: maskColor === "custom" ? customColorInput : maskColor,
        }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />

      <div className="flex items-center gap-1.5 mt-1 bg-white border border-slate-200 rounded-lg p-1 shadow-lg w-max select-none z-50 flex-wrap max-w-lg">
        <button
          type="button"
          onClick={onTranslateAndSave}
          disabled={isTranslating}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[10px] font-bold px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
          title="Dịch và mở luồng dịch có sẵn"
        >
          <strong>{isTranslating ? "Đang dịch..." : "Dịch"}</strong>
        </button>
        <button type="button" onClick={onSave} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1">
          <strong>💾 Save</strong>
        </button>
        <button type="button" onClick={onCancel} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded transition-colors cursor-pointer">
          ✕ Cancel
        </button>
        <div className="w-px h-3 bg-slate-200" />

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

        <div className="w-px h-3 bg-slate-200" />
        <div className="text-[9px] font-semibold text-slate-400">Size:</div>
        <div className="flex items-center gap-0.5 border border-slate-200 rounded p-0.5 bg-white">
          <button type="button" onClick={() => setPatchFontSize((prev: number) => Math.max(6, prev - 1))} className="w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold text-slate-500 hover:bg-slate-100 rounded cursor-pointer">-</button>
          <span className="text-[9px] font-bold text-slate-700 px-1 select-none min-w-[12px] text-center">{patchFontSize}</span>
          <button type="button" onClick={() => setPatchFontSize((prev: number) => Math.min(72, prev + 1))} className="w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold text-slate-500 hover:bg-slate-100 rounded cursor-pointer">+</button>
        </div>

        <ColorPicker label="Text" mode={patchTextColorMode} setMode={setPatchTextColorMode} customInput={customTextColorInput} setCustomInput={setCustomTextColorInput} />

        <div className="w-px h-3 bg-slate-200" />
        <ColorPicker label="Mask" mode={maskColor} setMode={setMaskColor} customInput={customColorInput} setCustomInput={setCustomColorInput} />
      </div>
    </div>
  );
}
