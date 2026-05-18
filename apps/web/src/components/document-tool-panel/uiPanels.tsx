interface PdfToImagePanelProps {
  imgFormat: "png" | "jpg";
  setImgFormat: (value: "png" | "jpg") => void;
  imgQuality: string;
  setImgQuality: (value: string) => void;
  imgOutputOption: "one-per-page" | "all-in-one";
  setImgOutputOption: (value: "one-per-page" | "all-in-one") => void;
  imgZoom: number;
  setImgZoom: (value: number) => void;
  imgColorMode: "color" | "grayscale";
  setImgColorMode: (value: "color" | "grayscale") => void;
  imgIncludeComments: boolean;
  setImgIncludeComments: (value: boolean) => void;
  isProcessing: boolean;
  onConvert: () => void;
}

export function PdfToImagePanel(props: PdfToImagePanelProps) {
  const { imgFormat, setImgFormat, imgQuality, setImgQuality, imgOutputOption, setImgOutputOption, imgZoom, setImgZoom, imgColorMode, setImgColorMode, imgIncludeComments, setImgIncludeComments, isProcessing, onConvert } = props;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Output Format</label>
        <select value={imgFormat} onChange={(e) => setImgFormat(e.target.value as "png" | "jpg")} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option value="png">PNG (Portable Network Graphics)</option>
          <option value="jpg">JPEG (Joint Photographic Experts)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Quality & Resolution</label>
        <select value={imgQuality} onChange={(e) => setImgQuality(e.target.value)} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option>Keep original DPI (High fidelity)</option>
          <option>150 DPI (Balanced resolution)</option>
          <option>300 DPI (Ultra high definition)</option>
          <option>72 DPI (Low quality - web optimized)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Output Option</label>
        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={imgOutputOption === "one-per-page"} onChange={() => setImgOutputOption("one-per-page")} className="accent-[var(--acrobat-blue)]" />One image per page (ZIP archive)</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={imgOutputOption === "all-in-one"} onChange={() => setImgOutputOption("all-in-one")} className="accent-[var(--acrobat-blue)]" />All pages in one single image</label>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center"><label className="text-xs font-semibold">Image Zoom/Scale</label><span className="text-[11px] font-bold text-[var(--acrobat-blue)]">{imgZoom}%</span></div>
        <input type="range" min="50" max="200" value={imgZoom} onChange={(e) => setImgZoom(Number(e.target.value))} className="w-full accent-[var(--acrobat-blue)] cursor-pointer" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Color Mode</label>
        <div className="flex gap-4 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={imgColorMode === "color"} onChange={() => setImgColorMode("color")} className="accent-[var(--acrobat-blue)]" />Full Color</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={imgColorMode === "grayscale"} onChange={() => setImgColorMode("grayscale")} className="accent-[var(--acrobat-blue)]" />Grayscale</label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
        <input type="checkbox" checked={imgIncludeComments} onChange={(e) => setImgIncludeComments(e.target.checked)} className="accent-[var(--acrobat-blue)]" />
        Include comments & highlights
      </label>
      <button onClick={onConvert} disabled={isProcessing} className="w-full h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-3">
        {isProcessing ? "Generating Images..." : `Convert to ${imgFormat.toUpperCase()}`}
      </button>
    </>
  );
}

interface PdfToOfficePanelProps {
  officeLayout: "flow" | "exact";
  setOfficeLayout: (value: "flow" | "exact") => void;
  officeOcrLang: string;
  setOfficeOcrLang: (value: string) => void;
  isProcessing: boolean;
  onExport: () => void;
}

export function PdfToOfficePanel({ officeLayout, setOfficeLayout, officeOcrLang, setOfficeOcrLang, isProcessing, onExport }: PdfToOfficePanelProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Layout Preservation</label>
        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={officeLayout === "flow"} onChange={() => setOfficeLayout("flow")} className="accent-[var(--acrobat-blue)]" />Flowing text (retains paragraphs)</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={officeLayout === "exact"} onChange={() => setOfficeLayout("exact")} className="accent-[var(--acrobat-blue)]" />Exact page layout (textbox matching)</label>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">OCR Document Language</label>
        <select value={officeOcrLang} onChange={(e) => setOfficeOcrLang(e.target.value)} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option>None (Direct digital copy)</option>
          <option>English + Vietnamese</option>
          <option>English only</option>
        </select>
      </div>
      <button onClick={onExport} disabled={isProcessing} className="w-full h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-3">
        {isProcessing ? "Exporting..." : "Export File"}
      </button>
    </>
  );
}

interface OfficeToPdfPanelProps {
  officePageSize: "A4" | "Letter";
  setOfficePageSize: (value: "A4" | "Letter") => void;
  officeOrientation: "auto" | "portrait" | "landscape";
  setOfficeOrientation: (value: "auto" | "portrait" | "landscape") => void;
  officeMargins: "none" | "normal" | "custom";
  setOfficeMargins: (value: "none" | "normal" | "custom") => void;
  isProcessing: boolean;
  onSelectAndConvert: () => void;
}

export function OfficeToPdfPanel({ officePageSize, setOfficePageSize, officeOrientation, setOfficeOrientation, officeMargins, setOfficeMargins, isProcessing, onSelectAndConvert }: OfficeToPdfPanelProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Target Page Size</label>
        <select value={officePageSize} onChange={(e) => setOfficePageSize(e.target.value as "A4" | "Letter")} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option value="A4">A4 (Standard 210 x 297 mm)</option>
          <option value="Letter">Letter (Standard 8.5 x 11 in)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Orientation</label>
        <select value={officeOrientation} onChange={(e) => setOfficeOrientation(e.target.value as "auto" | "portrait" | "landscape")} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option value="auto">Auto (Match original)</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Margins Setup</label>
        <select value={officeMargins} onChange={(e) => setOfficeMargins(e.target.value as "none" | "normal" | "custom")} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]">
          <option value="normal">Normal (2.54 cm / 1 in)</option>
          <option value="none">No margins (Full widthbleed)</option>
          <option value="custom">Narrow (1.27 cm / 0.5 in)</option>
        </select>
      </div>
      <button onClick={onSelectAndConvert} disabled={isProcessing} className="w-full h-9 rounded-md bg-[#e03131] hover:bg-[#c92a2a] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-3">Select File & Convert</button>
    </>
  );
}

interface CompressPanelProps {
  compressLevel: "high" | "medium" | "low";
  setCompressLevel: (value: "high" | "medium" | "low") => void;
  compressOptimizeImages: boolean;
  setCompressOptimizeImages: (value: boolean) => void;
  isProcessing: boolean;
  hasDoc: boolean;
  onCompress: () => void;
}

export function CompressPanel({ compressLevel, setCompressLevel, compressOptimizeImages, setCompressOptimizeImages, isProcessing, hasDoc, onCompress }: CompressPanelProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Compression Level</label>
        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={compressLevel === "high"} onChange={() => setCompressLevel("high")} className="accent-[var(--acrobat-blue)]" />High compression (Lesser quality, smaller size)</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={compressLevel === "medium"} onChange={() => setCompressLevel("medium")} className="accent-[var(--acrobat-blue)]" />Medium compression (Balanced quality & size)</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={compressLevel === "low"} onChange={() => setCompressLevel("low")} className="accent-[var(--acrobat-blue)]" />Low compression (High resolution, larger size)</label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
        <input type="checkbox" checked={compressOptimizeImages} onChange={(e) => setCompressOptimizeImages(e.target.checked)} className="accent-[var(--acrobat-blue)]" />
        Rescale heavy images inside document
      </label>
      <button onClick={onCompress} disabled={isProcessing || !hasDoc} className="w-full h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-3">
        {isProcessing ? "Optimizing..." : "Compress Document"}
      </button>
    </>
  );
}

interface WatermarkPanelProps {
  watermarkText: string;
  setWatermarkText: (value: string) => void;
  watermarkFontSize: number;
  setWatermarkFontSize: (value: number) => void;
  watermarkColor: string;
  setWatermarkColor: (value: string) => void;
  watermarkOpacity: number;
  setWatermarkOpacity: (value: number) => void;
  watermarkRotation: number;
  setWatermarkRotation: (value: number) => void;
  isProcessing: boolean;
  hasDoc: boolean;
  onApply: () => void;
}

export function WatermarkPanel(props: WatermarkPanelProps) {
  const { watermarkText, setWatermarkText, watermarkFontSize, setWatermarkFontSize, watermarkColor, setWatermarkColor, watermarkOpacity, setWatermarkOpacity, watermarkRotation, setWatermarkRotation, isProcessing, hasDoc, onApply } = props;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">Watermark Text</label>
        <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} className="h-8 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] text-[var(--ui-font-sm)] px-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--acrobat-blue)]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center"><label className="text-xs font-semibold">Font Size</label><span className="text-[11px] font-bold text-[var(--acrobat-blue)]">{watermarkFontSize}px</span></div>
        <input type="range" min="12" max="96" value={watermarkFontSize} onChange={(e) => setWatermarkFontSize(Number(e.target.value))} className="w-full accent-[var(--acrobat-blue)] cursor-pointer" />
      </div>
      <div className="flex items-center justify-between mt-1">
        <label className="text-xs font-semibold">Watermark Color</label>
        <input type="color" value={watermarkColor} onChange={(e) => setWatermarkColor(e.target.value)} className="h-8 w-12 border border-[var(--border-color)] rounded cursor-pointer" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center"><label className="text-xs font-semibold">Opacity</label><span className="text-[11px] font-bold text-[var(--acrobat-blue)]">{watermarkOpacity}%</span></div>
        <input type="range" min="5" max="90" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} className="w-full accent-[var(--acrobat-blue)] cursor-pointer" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center"><label className="text-xs font-semibold">Rotation Angle</label><span className="text-[11px] font-bold text-[var(--acrobat-blue)]">{watermarkRotation}Â°</span></div>
        <input type="range" min="-90" max="90" value={watermarkRotation} onChange={(e) => setWatermarkRotation(Number(e.target.value))} className="w-full accent-[var(--acrobat-blue)] cursor-pointer" />
      </div>
      <button onClick={onApply} disabled={isProcessing || !hasDoc} className="w-full h-9 rounded-md bg-[var(--acrobat-blue)] hover:bg-[var(--acrobat-blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-sm mt-3">
        {isProcessing ? "Stamping..." : "Add Watermark"}
      </button>
    </>
  );
}

export function FillFormPanel() {
  return (
    <div className="rounded-lg bg-[var(--ui-accent-bg)] p-3 text-xs leading-relaxed text-[var(--text-primary)] border border-dashed border-[var(--acrobat-blue)]">
      <h5 className="font-bold text-xs m-0 mb-1 text-[var(--acrobat-blue)]">âœï¸ Interactive Overlay Active</h5>
      <p className="m-0 mb-2">Double-click anywhere on the PDF viewer canvas to spawn text annotation fields directly over your PDF form cells.</p>
      <p className="m-0">Use the **Signature** toolbar tool at the top to overlay cursive signed names onto legal fields seamlessly.</p>
    </div>
  );
}
