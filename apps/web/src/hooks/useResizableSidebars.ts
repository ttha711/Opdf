import { useEffect, useState } from "react";

type UseResizableSidebarsArgs = {
  initialRightWidth?: number;
};

export function useResizableSidebars({
  initialRightWidth = 240,
}: UseResizableSidebarsArgs = {}) {
  const [rightWidth, setRightWidth] = useState(initialRightWidth);
  const isCompactViewport = () => typeof window !== "undefined" && window.innerWidth <= 900;
  const [isRightCollapsed, setIsRightCollapsed] = useState(isCompactViewport);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  useEffect(() => {
    // Mobile keyboard, zoom and browser chrome can emit resize events while a
    // drawer is open. Only auto-collapse on a *desktop -> mobile* transition.
    let wasCompact = window.innerWidth <= 900;
    const handleViewportChange = () => {
      const compact = window.innerWidth <= 900;
      if (compact && !wasCompact) setIsRightCollapsed(true);
      wasCompact = compact;
    };
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, []);

  useEffect(() => {
    if (!isDraggingRight) return;

    const handleMouseMove = (event: MouseEvent) => {
      setRightWidth(Math.max(180, Math.min(500, window.innerWidth - event.clientX)));
    };
    const handleMouseUp = () => setIsDraggingRight(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingRight]);

  return {
    rightWidth,
    setRightWidth,
    isRightCollapsed,
    setIsRightCollapsed,
    isDraggingRight,
    setIsDraggingRight,
  };
}
