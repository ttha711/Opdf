import React from "react";
import { PageResult } from "../types";

interface UsePageManipulationParams {
  pdfPages: PageResult[];
  setPdfPages: React.Dispatch<React.SetStateAction<PageResult[]>>;
  activePdfPageIdx: number;
  setActivePdfPageIdx: (idx: number) => void;
}

export function usePageManipulation({
  pdfPages,
  setPdfPages,
  activePdfPageIdx,
  setActivePdfPageIdx,
}: UsePageManipulationParams) {
  const emptyPageImg =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='820' style='background:%23f8fafc'><rect width='100%' height='100%' fill='%23ffffff' stroke='%23e2e8f0' stroke-width='4'/><text x='50%' y='40%' dominant-baseline='middle' text-anchor='middle' fill='%236366f1' font-family='sans-serif' font-weight='bold' font-size='15'>Trang trống</text><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='12'>Trang được tạo thủ công</text></svg>";

  const handleAddEmptyPage = () => {
    const newPageNum = pdfPages.length + 1;
    const newPage: PageResult = {
      pageNumber: newPageNum,
      imageUrl: emptyPageImg,
      pageWidth: 600,
      pageHeight: 820,
      htmlContent: "<p style='color: #64748b;'><i>Nhấp vào đây để thêm nội dung trống của bạn...</i></p>",
      status: "done",
    };
    setPdfPages((prev) => [...prev, newPage]);
    setTimeout(() => {
      setActivePdfPageIdx(pdfPages.length);
    }, 50);
  };

  const handleClonePage = (idx: number) => {
    const pageToClone = pdfPages[idx];
    if (!pageToClone) return;
    const clonedPage: PageResult = {
      ...pageToClone,
      pageNumber: pdfPages.length + 1,
      status: pageToClone.status === "converting" ? "pending" : pageToClone.status,
    };
    const updatedPages = [...pdfPages];
    updatedPages.splice(idx + 1, 0, clonedPage);
    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPdfPages(reindexed);
    setActivePdfPageIdx(idx + 1);
  };

  const handleDeletePage = (idx: number) => {
    if (pdfPages.length <= 1) {
      alert("Tài liệu của bạn phải có ít nhất 1 trang!");
      return;
    }
    if (!window.confirm("Bạn có đồng ý xóa Trang số " + (idx + 1) + " khỏi tài liệu này không?")) {
      return;
    }
    const updatedPages = pdfPages.filter((_, i) => i !== idx);
    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPdfPages(reindexed);
    if (activePdfPageIdx >= reindexed.length) {
      setActivePdfPageIdx(reindexed.length - 1);
    } else if (activePdfPageIdx === idx) {
      setActivePdfPageIdx(Math.max(0, idx - 1));
    }
  };

  const handleMovePage = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === pdfPages.length - 1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const updatedPages = [...pdfPages];
    const temp = updatedPages[idx];
    updatedPages[idx] = updatedPages[targetIdx];
    updatedPages[targetIdx] = temp;
    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPdfPages(reindexed);
    setActivePdfPageIdx(targetIdx);
  };

  return { handleAddEmptyPage, handleClonePage, handleDeletePage, handleMovePage };
}