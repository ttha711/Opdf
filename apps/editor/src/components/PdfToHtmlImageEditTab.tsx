import React from "react";
import { Sparkles } from "lucide-react";
import { PageResult } from "../types";

interface ImageEditTabProps {
  page: PageResult | undefined;
  imageCropBox?: { x: number; y: number; w: number; h: number } | null;
  setImageCropBox?: (val: any) => void;
  setCroppedImageBase64?: (val: string | null) => void;
}

export default function PdfToHtmlImageEditTab({
  page,
  imageCropBox,
  setImageCropBox,
  setCroppedImageBase64,
}: ImageEditTabProps) {
  return (
    <div className="space-y-4 w-full">
      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-750 flex items-start gap-2 select-none font-medium leading-relaxed">
        <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Chế độ Sửa Ảnh AI:</strong> Hãy kéo thả chuột để khoanh vùng (vẽ hình chữ nhật) phần chữ hoặc hình ảnh cần thay thế trực tiếp trên ảnh trang tài liệu dưới đây!
        </span>
      </div>
      {page && (
        <div
          className="relative border border-slate-300 rounded-xl overflow-hidden bg-slate-100 shadow-inner flex items-center justify-center select-none"
          style={{ minHeight: "500px" }}
        >
          <div
            className="relative cursor-crosshair max-w-full"
            style={{ userSelect: "none" }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const startX = ((e.clientX - rect.left) / rect.width) * 100;
              const startY = ((e.clientY - rect.top) / rect.height) * 100;
              // @ts-ignore
              e.currentTarget._selectionStart = { x: startX, y: startY };
              if (setImageCropBox) {
                setImageCropBox({ x: startX, y: startY, w: 0, h: 0 });
              }
            }}
            onMouseMove={(e) => {
              // @ts-ignore
              const start = e.currentTarget._selectionStart;
              if (start && setImageCropBox && imageCropBox) {
                const rect = e.currentTarget.getBoundingClientRect();
                const curX = ((e.clientX - rect.left) / rect.width) * 100;
                const curY = ((e.clientY - rect.top) / rect.height) * 100;
                const x = Math.min(start.x, curX);
                const y = Math.min(start.y, curY);
                const w = Math.abs(start.x - curX);
                const h = Math.abs(start.y - curY);
                setImageCropBox({ x, y, w, h });
              }
            }}
            onMouseUp={(e) => {
              // @ts-ignore
              e.currentTarget._selectionStart = null;
              if (
                imageCropBox &&
                imageCropBox.w > 1 &&
                imageCropBox.h > 1 &&
                setCroppedImageBase64
              ) {
                const img = e.currentTarget.querySelector("img");
                if (img) {
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    const natW = img.naturalWidth;
                    const natH = img.naturalHeight;
                    const cropX = (imageCropBox.x / 100) * natW;
                    const cropY = (imageCropBox.y / 100) * natH;
                    const cropW = (imageCropBox.w / 100) * natW;
                    const cropH = (imageCropBox.h / 100) * natH;
                    canvas.width = cropW;
                    canvas.height = cropH;
                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    setCroppedImageBase64(canvas.toDataURL("image/jpeg", 0.9));
                  }
                }
              }
            }}
          >
            <img
              src={page.imageUrl}
              className="max-w-full h-auto pointer-events-none block"
              alt="Page selection layer"
              referrerPolicy="no-referrer"
            />
            {imageCropBox && (
              <div
                className="absolute border-2 border-dashed border-indigo-650 bg-indigo-500/15 shadow-[0_0_10px_rgba(99,102,241,0.4)] pointer-events-none"
                style={{
                  left: imageCropBox.x + "%",
                  top: imageCropBox.y + "%",
                  width: imageCropBox.w + "%",
                  height: imageCropBox.h + "%",
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
