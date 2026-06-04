import React from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PageResult } from "../types";

interface UseFileAppendParams {
  pdfPages: PageResult[];
  setPdfPages: React.Dispatch<React.SetStateAction<PageResult[]>>;
  setActivePdfPageIdx: (idx: number) => void;
}

export function useFileAppend({
  pdfPages,
  setPdfPages,
  setActivePdfPageIdx,
}: UseFileAppendParams) {
  const [isAppendingFiles, setIsAppendingFiles] = React.useState(false);
  const [appendProgress, setAppendProgress] = React.useState({ current: 0, total: 0 });

  const handleAppendIncomingFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsAppendingFiles(true);
    setAppendProgress({ current: 0, total: files.length });

    const currentPagesCount = pdfPages.length;
    const newPages: PageResult[] = [];

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      setAppendProgress((prev) => ({ ...prev, current: fIdx + 1 }));

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pagesCount = pdf.numPages;

          for (let i = 1; i <= pagesCount; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            // @ts-ignore
            await page.render({ canvasContext: ctx, viewport }).promise;
            const b64Img = canvas.toDataURL("image/jpeg", 0.85);

            const unscaledViewport = page.getViewport({ scale: 1.0 });
            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: b64Img,
              pageWidth: unscaledViewport.width,
              pageHeight: unscaledViewport.height,
              status: "pending",
            });
          }
        } catch (err) {
          console.error("Lỗi đọc PDF đính kèm:", err);
          alert(`Không thể nạp tệp PDF: ${file.name}. Có thể tệp bị lỗi hoặc có mật khẩu khóa.`);
        }
      } else if (file.type.startsWith("image/")) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const b64Img = event.target?.result as string;
            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: b64Img,
              pageWidth: 800,
              pageHeight: 1100,
              htmlContent: `<div style="text-align: center; margin: 1.5rem 0;"><img src="${b64Img}" alt="Ảnh được chèn" style="max-width:105%; height:auto; border-radius:12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" /><p style="color: #64748b; font-size: 11px; margin-top: 4px;"><i>Hình ảnh chèn thêm: ${file.name}</i></p></div>`,
              status: "done",
            });
            resolve();
          };
          reader.readAsDataURL(file);
        });
      } else if (
        file.type === "text/plain" ||
        file.type === "text/html" ||
        file.name.endsWith(".html") ||
        file.name.endsWith(".txt")
      ) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const fileContent = event.target?.result as string;
            const isHtml = file.name.endsWith(".html") || file.type === "text/html";
            const htmlVal = isHtml
              ? fileContent
              : fileContent
                  .split("\n\n")
                  .map((para) => `<p style="margin-bottom: 1em;">${para.replace(/\n/g, "<br/>")}</p>`)
                  .join("");
            const emptyPageImg =
              "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800' style='background:%23fafafa'><rect width='100%' height='100%' fill='white' stroke='%23e2e8f0' stroke-width='4'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%236366f1' font-family='sans-serif' font-weight='bold' font-size='14'>Đính Kèm Văn Bản</text></svg>";
            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: emptyPageImg,
              pageWidth: 600,
              pageHeight: 800,
              htmlContent: `<div style="padding: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc; margin-bottom: 1.5rem;"><h3 style="color: #4f46e5; margin-top: 0;">📎 Tệp đính kèm: ${file.name}</h3><hr style="margin: 0.5rem 0; border: 0; border-top: 1px solid #cbd5e1" />${htmlVal}</div>`,
              status: "done",
            });
            resolve();
          };
          reader.readAsText(file);
        });
      }
    }

    if (newPages.length > 0) {
      setPdfPages((prev) => [...prev, ...newPages]);
      setActivePdfPageIdx(currentPagesCount);
    }
    setIsAppendingFiles(false);
  };

  return { isAppendingFiles, appendProgress, handleAppendIncomingFiles };
}