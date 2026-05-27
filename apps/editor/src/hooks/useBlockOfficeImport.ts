import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { AIParsedDocument } from "../types";
import { parseHtmlToBlocks } from "../lib/blockParser";

export function useBlockOfficeImport(
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>,
  setErrorMessage: (msg: string | null) => void
) {
  const [officeImporting, setOfficeImporting] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });

  const handlePDFToBlocksImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Hệ thống chỉ chấp nhận tệp có định dạng PDF.");
      return;
    }

    setPdfImporting(true);
    setErrorMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages });

      let accumulatedHtml = "";

      for (let i = 1; i <= totalPages; i++) {
        setPdfProgress(prev => ({ ...prev, current: i }));
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // @ts-ignore
        await page.render({ canvasContext: ctx, viewport }).promise;
        const b64Img = canvas.toDataURL("image/jpeg", 0.9);

        const res = await fetch("/api/convert-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64Img })
        });
        const data = await res.json();
        if (res.ok && data.html) {
          accumulatedHtml += `\n<!-- PAGE ${i} -->\n` + data.html;
        }
      }

      const blocks = parseHtmlToBlocks(accumulatedHtml);
      setCurrentDoc({
        title: `Phục hồi từ [${file.name.replace(".pdf", "")}]`,
        description: `Bố cục dữ liệu được tự động hóa tái cấu trúc định dạng chuẩn, trích xuất vào lúc ${new Date().toLocaleTimeString("vi-VN")}`,
        theme: "corporate",
        blocks: blocks
      });
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Lỗi đồng bộ PDF sang đa khối tài liệu.");
    } finally {
      setPdfImporting(false);
    }
  };

  const handleOfficeFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOfficeImporting(true);
    setErrorMessage(null);

    if (file.type === "application/json" || file.name.endsWith(".json")) {
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const rawText = event.target?.result as string;
            const parsedData = JSON.parse(rawText);
            if (parsedData && Array.isArray(parsedData.blocks)) {
              setCurrentDoc(parsedData);
              setErrorMessage(null);
            } else {
              setErrorMessage("Tệp tin JSON không đúng cấu trúc tài liệu BlockOffice.");
            }
          } catch (e: any) {
            setErrorMessage("Lỗi phân tích tệp tin JSON.");
          } finally {
            setOfficeImporting(false);
          }
        };
        reader.readAsText(file);
      } catch (err: any) {
        setErrorMessage("Lỗi khi đọc tệp tin JSON.");
        setOfficeImporting(false);
      }
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawResult = reader.result as string;
          const base64Data = rawResult.split(",")[1];
          const mimeType = file.type || "application/octet-stream";

          const res = await fetch("/api/convert-office", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType: mimeType,
              fileName: file.name
            })
          });

          const data = await res.json();
          if (res.ok) {
            if (data && Array.isArray(data.blocks)) {
              setCurrentDoc(data);
              setErrorMessage(null);
            } else {
              setErrorMessage("Hệ thống chuyển đổi từ chối xử lý hoặc định dạng tệp tin không tương thích.");
            }
          } else {
            setErrorMessage(data.error || "Không thể phân tích dữ liệu tệp tin này.");
          }
        } catch (err: any) {
          console.error(err);
          setErrorMessage("Đã xảy ra lỗi trong quá trình xử lý và đồng bộ tài liệu.");
        } finally {
          setOfficeImporting(false);
        }
      };

      reader.onerror = () => {
        setErrorMessage("Lỗi trong quá trình đọc tệp dữ liệu.");
        setOfficeImporting(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Gặp sự cố khi tải tệp văn bản.");
      setOfficeImporting(false);
    }
  };

  return {
    officeImporting,
    pdfImporting,
    pdfProgress,
    handlePDFToBlocksImport,
    handleOfficeFileImport
  };
}
