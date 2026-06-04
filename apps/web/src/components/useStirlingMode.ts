import { useCallback, useEffect, useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import type { GroupedLine, GroupedParagraph } from "./PdfTextSelection.types";
import { groupTextItemsIntoLines } from "./PdfTextSelection.utils";

export function useStirlingMode(textItems: RenderedTextItem[]) {
  const [stirlingMode, setStirlingMode] = useState<boolean>(false);
  const [stirlingSubMode, setStirlingSubMode] = useState<"auto" | "manual">("auto");
  const [groupedParagraphs, setGroupedParagraphs] = useState<GroupedParagraph[]>([]);

  const groupTextIntoLines = useCallback(() => {
    if (textItems.length === 0) {
      setGroupedParagraphs([]);
      return;
    }
    const lines: GroupedLine[] = groupTextItemsIntoLines(textItems);

    const paragraphs: GroupedParagraph[] = [];
    let currentParagraph: GroupedParagraph | null = null;

    for (const line of lines) {
      if (!currentParagraph) {
        currentParagraph = {
          str: line.str,
          left: line.left,
          top: line.top,
          width: line.width,
          height: line.height,
          fontSize: line.fontSize,
          lines: [line]
        };
        continue;
      }

      const prevLine = currentParagraph.lines[currentParagraph.lines.length - 1];
      const verticalGap = line.top - prevLine.top;
      const maxGap = prevLine.fontSize * 2.5;
      const alignX = Math.abs(line.left - currentParagraph.left) < 80 || Math.abs(line.left - prevLine.left) < 60;

      if (verticalGap >= 2 && verticalGap <= maxGap && alignX) {
        currentParagraph.str += "\n" + line.str;

        const newLeft = Math.min(currentParagraph.left, line.left);
        const newWidth = Math.max(currentParagraph.left + currentParagraph.width, line.left + line.width) - newLeft;

        currentParagraph.left = newLeft;
        currentParagraph.width = newWidth;
        currentParagraph.height = (line.top + line.height) - currentParagraph.top;
        currentParagraph.fontSize = Math.max(currentParagraph.fontSize, line.fontSize);
        currentParagraph.lines.push(line);
      } else {
        paragraphs.push(currentParagraph);
        currentParagraph = {
          str: line.str,
          left: line.left,
          top: line.top,
          width: line.width,
          height: line.height,
          fontSize: line.fontSize,
          lines: [line]
        };
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    setGroupedParagraphs(paragraphs);
  }, [textItems]);

  useEffect(() => {
    if (stirlingMode) {
      groupTextIntoLines();
    }
  }, [stirlingMode, groupTextIntoLines]);

  return { stirlingMode, setStirlingMode, stirlingSubMode, setStirlingSubMode, groupedParagraphs };
}
