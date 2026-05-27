import React from "react";
import { 
  Undo2, 
  Redo2, 
  Printer, 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  Palette, 
  Highlighter, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  List, 
  ListOrdered, 
  ChevronLeft, 
  ChevronRight, 
  Eraser, 
  Image, 
  FileUp, 
  Clipboard, 
  Code 
} from "lucide-react";
import { cn } from "../lib/utils";

interface PdfToHtmlWysiwygToolbarProps {
  activePdfPageIdx: number;
  rawHtmlText: string;
  setRawHtmlText: (val: string) => void;
  showRawHtml: boolean;
  setShowRawHtml: (val: boolean) => void;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;
  handlePrint: () => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
}

export default function PdfToHtmlWysiwygToolbar({
  activePdfPageIdx,
  rawHtmlText,
  setRawHtmlText,
  showRawHtml,
  setShowRawHtml,
  updatePdfPageHtml,
  handlePrint,
  pageRenderContainerRef
}: PdfToHtmlWysiwygToolbarProps) {
  const [textColorPopoverOpen, setTextColorPopoverOpen] = React.useState(false);
  const [bgColorPopoverOpen, setBgColorPopoverOpen] = React.useState(false);
  const [fontSize, setFontSize] = React.useState(12);

  const [imagePopoverOpen, setImagePopoverOpen] = React.useState(false);
  const [imageUrlInput, setImageUrlInput] = React.useState("");

  const [pastePopoverOpen, setPastePopoverOpen] = React.useState(false);
  const [pasteTextInput, setPasteTextInput] = React.useState("");
  const [pasteFormatMode, setPasteFormatMode] = React.useState<"text" | "html">("text");
  const [pasteInsertMode, setPasteInsertMode] = React.useState<"cursor" | "replace" | "append">("cursor");

  const execFormatting = (command: string, value: string = "") => {
    document.execCommand(command, false, value);
    if (pageRenderContainerRef.current) {
      const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor");
      if (editorDiv) {
        updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
      }
    }
  };

  const insertHtmlIntoEditor = (html: string) => {
    if (pageRenderContainerRef.current) {
      const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
      if (editorDiv) {
        editorDiv.focus();
        try {
          const success = document.execCommand("insertHTML", false, html);
          if (!success) {
            editorDiv.innerHTML += html;
          }
        } catch (e) {
          editorDiv.innerHTML += html;
        }
        updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
      }
    }
  };

  const handlePasteCustom = () => {
    let cleanHtml = "";
    if (pasteFormatMode === "html") {
      cleanHtml = pasteTextInput;
    } else {
      cleanHtml = pasteTextInput
        .split("\n\n")
        .map(p => {
          if (!p.trim()) return "";
          return `<p style="margin-bottom: 0.8em; line-height: 1.6;">${p.replace(/\n/g, "<br/>")}</p>`;
        })
        .join("");
    }

    if (!cleanHtml.trim()) return;

    if (pageRenderContainerRef.current) {
      const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
      if (editorDiv) {
        editorDiv.focus();
        
        switch (pasteInsertMode) {
          case "replace":
            editorDiv.innerHTML = cleanHtml;
            break;
          case "append":
            editorDiv.innerHTML = (editorDiv.innerHTML || "") + cleanHtml;
            break;
          case "cursor":
          default:
            try {
              const success = document.execCommand("insertHTML", false, cleanHtml);
              if (!success) {
                editorDiv.innerHTML += cleanHtml;
              }
            } catch (e) {
              editorDiv.innerHTML += cleanHtml;
            }
            break;
        }
        
        updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
      }
    }

    setPasteTextInput("");
    setPastePopoverOpen(false);
  };

  const handleImageUploadAndInsert = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      insertHtmlIntoEditor(`<img src="${base64}" alt="Ảnh tải lên" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`);
    };
    reader.readAsDataURL(file);
    setImagePopoverOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 select-none print:hidden shadow-xs font-sans text-slate-705">
      
      {/* Group 1: Undo, Redo, Print, Paint Format */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => execFormatting("undo")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer transition-colors"
          title="Hoàn tác (Undo)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("redo")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer transition-colors"
          title="Làm lại (Redo)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            handlePrint();
          }}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-755 cursor-pointer transition-colors"
          title="In nhanh trang này/Tải ảnh gốc PDF"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 2: Style Selector (Heading levels) */}
      <div className="flex items-center font-sans">
        <select
          onChange={(e) => execFormatting("formatBlock", e.target.value)}
          className="bg-white border border-slate-200 rounded-lg text-[11px] px-2 py-1 font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer max-w-[110px]"
          title="Kiểu định dạng dòng"
          defaultValue="<p>"
        >
          <option value="<p>">Văn bản thường</option>
          <option value="<H1>">Tiêu đề 1 lớn</option>
          <option value="<H2>">Tiêu đề 2 vừa</option>
          <option value="<H3>">Tiêu đề 3 nhỏ</option>
          <option value="<blockquote>">Trích dẫn lưu ý</option>
        </select>
      </div>

      {/* Group 3: Font select */}
      <div className="flex items-center ml-1">
        <select
          onChange={(e) => execFormatting("fontName", e.target.value)}
          className="bg-white border border-slate-200 rounded-lg text-[11px] px-2 py-1 font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer max-w-[120px]"
          title="Phông chữ"
          defaultValue="Arial"
        >
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Inter">Inter</option>
          <option value="JetBrains Mono">JetBrains Mono</option>
          <option value="Segoe UI">Segoe UI</option>
        </select>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 4: Font size increase/decrease step */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5">
        <button
          type="button"
          onClick={() => {
            const nextSize = Math.max(1, fontSize - 1);
            setFontSize(nextSize);
            execFormatting("fontSize", nextSize.toString());
          }}
          className="w-4 h-4 rounded-md hover:bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 active:bg-slate-200 cursor-pointer"
          title="Giảm kích thước chữ"
        >
          -
        </button>
        <span className="text-[10px] font-bold px-1 select-none text-slate-700 min-w-[20px] text-center font-mono">
          {fontSize === 1 ? "10" : fontSize === 2 ? "13" : fontSize === 3 ? "16" : fontSize === 4 ? "18" : fontSize === 5 ? "24" : fontSize === 6 ? "32" : "48"}
        </span>
        <button
          type="button"
          onClick={() => {
            const nextSize = Math.min(7, fontSize + 1);
            setFontSize(nextSize);
            execFormatting("fontSize", nextSize.toString());
          }}
          className="w-4 h-4 rounded-md hover:bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 active:bg-slate-205 cursor-pointer"
          title="Tăng kích thước chữ"
        >
          +
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 5: Text styling effects */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => execFormatting("bold")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-850 font-bold text-xs flex items-center justify-center cursor-pointer transition-colors"
          title="Chữ đậm"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("italic")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-850 italic text-xs flex items-center justify-center cursor-pointer transition-colors"
          title="Chữ nghiêng"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("underline")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-850 underline text-xs flex items-center justify-center cursor-pointer transition-colors"
          title="Gạch chân"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("strikeThrough")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-850 text-xs flex items-center justify-center cursor-pointer transition-colors"
          title="Gạch ngang chữ"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 6: Text Color & Highlight Popovers */}
      <div className="flex items-center gap-1.5">
        {/* Text Color Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setTextColorPopoverOpen(!textColorPopoverOpen);
              setBgColorPopoverOpen(false);
            }}
            className="p-1 px-1.5 hover:bg-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
            title="Màu chữ hiển thị"
          >
            <Palette className="w-3.5 h-3.5 text-indigo-650" />
            <div className="w-2.5 h-2.5 rounded-full border border-slate-300 bg-red-500" />
          </button>

          {textColorPopoverOpen && (
            <div className="absolute top-8 left-0 z-50 bg-white border border-slate-250 p-2.5 rounded-xl shadow-xl w-44 grid grid-cols-5 gap-1.5">
              <div className="col-span-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">Màu chữ</div>
              {[
                { label: "Black", code: "#000000" },
                { label: "Gray", code: "#6b7280" },
                { label: "Red", code: "#ef4444" },
                { label: "Orange", code: "#f97316" },
                { label: "Yellow", code: "#eab308" },
                { label: "Green", code: "#22c55e" },
                { label: "Blue", code: "#3b82f6" },
                { label: "Purple", code: "#a855f7" },
                { label: "Pink", code: "#ec4899" },
                { label: "White", code: "#ffffff" }
              ].map(color => (
                <button
                  key={color.code}
                  type="button"
                  onClick={() => {
                    execFormatting("foreColor", color.code);
                    setTextColorPopoverOpen(false);
                  }}
                  className="w-5 h-5 rounded-full border border-slate-200 transition-transform hover:scale-125 cursor-pointer shadow-xs active:scale-95"
                  style={{ backgroundColor: color.code }}
                  title={color.label}
                />
              ))}
            </div>
          )}
        </div>

        {/* Highlight / Background Color Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setBgColorPopoverOpen(!bgColorPopoverOpen);
              setTextColorPopoverOpen(false);
            }}
            className="p-1 px-1.5 hover:bg-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
            title="Màu nền bôi highlight"
          >
            <Highlighter className="w-3.5 h-3.5 text-indigo-650" />
            <div className="w-2.5 h-2.5 rounded-full border border-slate-300 bg-yellow-300" />
          </button>

          {bgColorPopoverOpen && (
            <div className="absolute top-8 left-0 z-50 bg-white border border-slate-250 p-2.5 rounded-xl shadow-xl w-44 grid grid-cols-5 gap-1.5">
              <div className="col-span-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">Màu nền</div>
              {[
                { label: "None", code: "transparent" },
                { label: "Light Red", code: "#fecaca" },
                { label: "Light Orange", code: "#fed7aa" },
                { label: "Light Yellow", code: "#fef08a" },
                { label: "Light Green", code: "#bbf7d0" },
                { label: "Light Blue", code: "#bfdbfe" },
                { label: "Light Purple", code: "#f5d0fe" },
                { label: "White", code: "#ffffff" },
                { label: "Charcoal", code: "#374151" },
                { label: "Amber", code: "#fbbf24" }
              ].map(color => (
                <button
                  key={color.code}
                  type="button"
                  onClick={() => {
                    execFormatting("hiliteColor", color.code);
                    setBgColorPopoverOpen(false);
                  }}
                  className="w-5 h-5 rounded-full border border-slate-200 transition-transform hover:scale-125 cursor-pointer shadow-xs active:scale-95 flex items-center justify-center"
                  style={{ backgroundColor: color.code === "transparent" ? "white" : color.code }}
                  title={color.label}
                >
                  {color.code === "transparent" && <span className="text-[10px] text-red-500 font-bold">✕</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 7: Alignment */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => execFormatting("justifyLeft")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Căn trái"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("justifyCenter")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Căn giữa"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("justifyRight")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Căn phải"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("justifyFull")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Căn đều hai bên"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 8: Lists, Indents & Eraser */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => execFormatting("insertUnorderedList")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Danh sách hình tròn (Bullets)"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("insertOrderedList")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Danh sách đánh số (Numbers)"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("outdent")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Giảm thụt đầu dòng"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => execFormatting("indent")}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-slate-705 cursor-pointer"
          title="Tăng thụt đầu dòng"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            execFormatting("removeFormat");
            execFormatting("foreColor", "#1e293b");
            execFormatting("hiliteColor", "transparent");
          }}
          className="p-1 px-1.5 hover:bg-slate-200 active:bg-slate-305 rounded-lg text-red-650 cursor-pointer transition-colors"
          title="Xóa mọi định dạng (Clear style)"
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1" />

      {/* Group 8.5: Insert Image manually */}
      <div className="relative font-sans">
        <button
          type="button"
          onClick={() => {
            setImagePopoverOpen(!imagePopoverOpen);
            setTextColorPopoverOpen(false);
            setBgColorPopoverOpen(false);
            setPastePopoverOpen(false);
          }}
          className={cn(
            "p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg flex items-center gap-1 cursor-pointer text-slate-707 transition-colors",
            imagePopoverOpen && "bg-slate-200"
          )}
          title="Chèn hình ảnh vào văn bản"
        >
          <Image className="w-3.5 h-3.5 text-indigo-650" />
          <span className="text-[11px] font-semibold hidden md:inline">Chèn ảnh</span>
        </button>

        {imagePopoverOpen && (
          <div className="absolute top-9 left-0 z-50 bg-white border border-slate-250 p-4 rounded-xl shadow-xl w-64 flex flex-col gap-3 text-left">
            <div className="text-xs font-bold text-slate-700">Chọn hình thức chèn ảnh</div>
            
            {/* Direct File Upload */}
            <div>
              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-250 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer transition-all">
                <FileUp className="w-5 h-5 text-indigo-500 mb-1" />
                <span className="text-[10px] font-bold text-slate-600 text-center">Tải lên từ máy tính</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUploadAndInsert} 
                  className="hidden" 
                />
              </label>
            </div>

            <div className="flex items-center gap-2 select-none">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-[9px] text-slate-400 font-bold uppercase">Hoặc dùng Link URL</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            {/* Image URL Input Form */}
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                placeholder="https://example.com/image.jpg"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (imageUrlInput.trim()) {
                    insertHtmlIntoEditor(`<img src="${imageUrlInput.trim()}" alt="Ảnh chèn từ URL" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`);
                    setImageUrlInput("");
                    setImagePopoverOpen(false);
                  }
                }}
                className="w-full bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-1.5 rounded-lg active:scale-95 transition-transform cursor-pointer"
              >
                Chèn LINK URL
              </button>
            </div>

            {/* Curated Beautiful Placeholders / Illustrations */}
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[9px] text-slate-404 font-bold uppercase">Sử dụng ảnh minh họa</span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: "Biểu đồ", url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80" },
                  { label: "Công sở", url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=400&q=80" },
                  { label: "Bút viết", url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80" }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      insertHtmlIntoEditor(`<img src="${item.url}" alt="${item.label}" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`);
                      setImagePopoverOpen(false);
                    }}
                    className="text-[9px] font-bold py-1 px-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded border border-slate-205 cursor-pointer text-center"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Group 8.6: Custom Paste Tool Popover */}
      <div className="relative font-sans">
        <button
          type="button"
          onClick={() => {
            setPastePopoverOpen(!pastePopoverOpen);
            setImagePopoverOpen(false);
            setTextColorPopoverOpen(false);
            setBgColorPopoverOpen(false);
          }}
          className={cn(
            "p-1 px-1.5 hover:bg-slate-200 active:bg-slate-300 rounded-lg flex items-center gap-1 cursor-pointer text-slate-707 transition-colors",
            pastePopoverOpen && "bg-slate-200"
          )}
          title="Bảng dán dữ liệu thủ công nhanh"
        >
          <Clipboard className="w-3.5 h-3.5 text-indigo-155" />
          <span className="text-[11px] font-semibold hidden md:inline">Dán văn bản</span>
        </button>

        {pastePopoverOpen && (
          <div className="absolute top-9 left-0 z-50 bg-white border border-slate-250 p-4 rounded-xl shadow-xl w-64 flex flex-col gap-3 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-105">
              <span className="text-xs font-bold text-slate-705">Dán nội dung ngoài</span>
              <span className="text-[9px] bg-indigo-50 text-indigo-650 px-1.5 py-0.5 rounded font-black">CLIPBOARD</span>
            </div>

            {/* Pasted text value textarea box */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400">NỘI DUNG VĂN BẢN / HTML</label>
              <textarea 
                placeholder="Dán hoặc nhập toàn bộ nội dung bạn muốn chèn..."
                value={pasteTextInput}
                onChange={(e) => setPasteTextInput(e.target.value)}
                className="w-full h-24 text-xs p-2 bg-slate-50 border border-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
              />
            </div>

            {/* Formatting Choice (Plain Text vs Rich HTML) */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400">ĐỊNH DẠNG DÁN</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPasteFormatMode("text")}
                  className={cn(
                    "text-[10px] font-bold py-1 rounded transition-all cursor-pointer",
                    pasteFormatMode === "text" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Văn bản thường
                </button>
                <button
                  type="button"
                  onClick={() => setPasteFormatMode("html")}
                  className={cn(
                    "text-[10px] font-bold py-1 rounded transition-all cursor-pointer",
                    pasteFormatMode === "html" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Mã Raw HTML
                </button>
              </div>
            </div>

            {/* Where to insert (Cursor, replace page, append page) */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400">VỊ TRÍ CHÈN</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg text-center">
                {[
                  { value: "cursor", label: "Con trỏ" },
                  { value: "replace", label: "Ghi đè" },
                  { value: "append", label: "Cuối trang" }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPasteInsertMode(opt.value as any)}
                    className={cn(
                      "text-[9px] font-bold py-1 rounded transition-all cursor-pointer",
                      pasteInsertMode === opt.value ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit quick insert button */}
            <button
              type="button"
              onClick={handlePasteCustom}
              disabled={!pasteTextInput.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs py-2 rounded-lg active:scale-95 transition-transform cursor-pointer"
            >
              Xác nhận Dán ✓
            </button>
          </div>
        )}
      </div>
      
      {/* Group 9: Direct HTML Code switch panel on the right */}
      <button
        type="button"
        onClick={() => {
          if (showRawHtml) {
            updatePdfPageHtml(activePdfPageIdx, rawHtmlText);
          } else {
            // caller handles populating editor Div text manually in side effect or on blur
          }
          setShowRawHtml(!showRawHtml);
        }}
        className={cn(
          "p-1.5 rounded-lg text-xs flex items-center gap-1.5 px-3 cursor-pointer font-bold ml-auto transition-all",
          showRawHtml 
            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs" 
            : "bg-slate-105 hover:bg-slate-200 text-slate-700 border border-slate-200"
        )}
        title="Sửa Code HTML trực tiếp"
      >
        <Code className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{showRawHtml ? "Chế độ Soạn thảo" : "Sửa mã HTML"}</span>
      </button>
    </div>
  );
}
