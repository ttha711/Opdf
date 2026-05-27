import { useState, useEffect } from "react";

type UseResizableSidebarsArgs = {
  initialLeftWidth?: number;
  initialRightWidth?: number;
};

export function useResizableSidebars({
  initialLeftWidth = 240,
  initialRightWidth = 240,
}: UseResizableSidebarsArgs = {}) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [rightWidth, setRightWidth] = useState(initialRightWidth);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(160, Math.min(450, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isDraggingRight) {
        const newWidth = Math.max(180, Math.min(500, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  return {
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isDraggingLeft,
    setIsDraggingLeft,
    isDraggingRight,
    setIsDraggingRight,
  };
}
