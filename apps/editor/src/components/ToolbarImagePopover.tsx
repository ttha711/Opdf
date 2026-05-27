import React from "react";
import { cn } from "../lib/utils";
import { FileUp } from "lucide-react";

interface ToolbarImagePopoverProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  insertHtmlIntoEditor: (html: string) => void;
}

export default function ToolbarImagePopover({
  isOpen,
  setIsOpen,
  insertHtmlIntoEditor
}: ToolbarImagePopoverProps) {
  const [imageUrlInput, setImageUrlInput] = React.useState("");

  if (!isOpen) return null;

  const handleImageUploadAndInsert = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      insertHtmlIntoEditor(`<img src="${base64}" alt="Ảnh tải lên" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`);
    };
    reader.readAsDataURL(file);
    setIsOpen(false);
  };

  return (
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
              setIsOpen(false);
            }
          }}
          className="w-full bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-1.5 rounded-lg active:scale-95 transition-transform cursor-pointer [content-visibility:auto]"
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
                setIsOpen(false);
              }}
              className="text-[9px] font-bold py-1 px-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded border border-slate-205 cursor-pointer text-center"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
