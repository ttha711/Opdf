import { DocumentBlock } from "../types";

// Automated layout pagination estimation logic for A4 WYSIWYG rendering
export const paginateBlocks = (blocks: DocumentBlock[]): DocumentBlock[][] => {
  const pageHeightLimit = 950; // px safe bounds for printable paper
  const pagesList: DocumentBlock[][] = [[]];
  let currentHeight = 0;

  const estimateBlockHeight = (block: DocumentBlock): number => {
    if (block.type === "page-break") return 9999;
    let h = 0;
    if (block.type === "heading") {
      h = block.meta?.level === 1 ? 70 : 45;
    } else if (block.type === "paragraph") {
      const textLen = block.content.length + (block.meta?.bulletPoints?.join("").length || 0);
      h = 30 + Math.ceil(textLen / 75) * 22;
    } else if (block.type === "table" && block.tableData) {
      h = 45 + block.tableData.length * 40;
    } else if (block.type === "chart") {
      h = 240;
    } else if (block.type === "callout") {
      h = 80 + Math.ceil(block.content.length / 75) * 20;
    } else if (block.type === "slide") {
      h = 180;
    }
    return h + 24; // margin padding
  };

  blocks.forEach((block) => {
    const bh = estimateBlockHeight(block);
    if (block.type === "page-break") {
      if (pagesList[pagesList.length - 1].length > 0) {
        pagesList.push([]);
        currentHeight = 0;
      }
      return;
    }

    const currentPage = pagesList[pagesList.length - 1];
    if (currentHeight + bh > pageHeightLimit && currentPage.length > 0) {
      pagesList.push([block]);
      currentHeight = bh;
    } else {
      currentPage.push(block);
      currentHeight += bh;
    }
  });

  return pagesList;
};
