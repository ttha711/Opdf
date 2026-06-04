import React from "react";
import { PageResult } from "../types";

interface UseXmlGenerationParams {
  pdfPages: PageResult[];
  setPdfPages: React.Dispatch<React.SetStateAction<PageResult[]>>;
}

export function useXmlGeneration({
  pdfPages,
  setPdfPages,
}: UseXmlGenerationParams) {
  const [isGeneratingXml, setIsGeneratingXml] = React.useState(false);

  const generateSemanticXml = async (idx: number) => {
    const page = pdfPages[idx];
    if (!page || !page.htmlContent) return;
    setIsGeneratingXml(true);
    try {
      const res = await fetch("/api/html-to-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ htmlContent: page.htmlContent }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi tạo cấu trúc XML ngữ nghĩa.");
      }
      setPdfPages((prev) =>
        prev.map((p, i) => (i === idx ? { ...p, xmlContent: data.xml } : p))
      );
    } catch (err: any) {
      alert("Lỗi kết nối bộ sinh XML: " + (err.message || err));
    } finally {
      setIsGeneratingXml(false);
    }
  };

  const downloadXmlFile = (idx: number) => {
    const page = pdfPages[idx];
    if (!page || !page.xmlContent) return;
    const blob = new Blob([page.xmlContent], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trang_${page.pageNumber}_semantic_model.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { isGeneratingXml, generateSemanticXml, downloadXmlFile };
}