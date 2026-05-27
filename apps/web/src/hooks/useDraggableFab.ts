import { useState, useEffect, useRef, useCallback } from "react";

type UseDraggableFabArgs = {
  initialPosition?: { x: number; y: number } | null;
};

export function useDraggableFab({
  initialPosition = null,
}: UseDraggableFabArgs = {}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelAlign, setPanelAlign] = useState<"left" | "right">("right");

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const currentX = position ? position.x : rect.left;
    const currentY = position ? position.y : rect.top;
    
    dragStartOffset.current = {
      x: clientX - currentX,
      y: clientY - currentY,
    };
    dragStartMouse.current = { x: clientX, y: clientY };
    setIsDragging(true);
    hasMovedRef.current = false;
  }, [position]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // Only left click
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
    }
  }, [startDrag]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      moveDrag(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const moveDrag = (clientX: number, clientY: number) => {
      const deltaX = clientX - dragStartMouse.current.x;
      const deltaY = clientY - dragStartMouse.current.y;
      
      if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 5) {
        hasMovedRef.current = true;
      }
      
      let newX = clientX - dragStartOffset.current.x;
      let newY = clientY - dragStartOffset.current.y;

      const btnSize = 48;
      newX = Math.max(10, Math.min(window.innerWidth - btnSize - 10, newX));
      newY = Math.max(10, Math.min(window.innerHeight - btnSize - 10, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const handleTouchEnd = () => {
      endDrag();
    };

    const endDrag = () => {
      setIsDragging(false);
      if (!position) return;

      const btnSize = 48;
      const currentX = position.x;
      const distToLeft = currentX;
      const distToRight = window.innerWidth - (currentX + btnSize);
      
      let finalX = 24;
      let alignSide: "left" | "right" = "left";
      
      if (distToRight < distToLeft) {
        finalX = window.innerWidth - btnSize - 24;
        alignSide = "right";
      }
      
      setPanelAlign(alignSide);
      const finalY = Math.max(50, Math.min(window.innerHeight - btnSize - 50, position.y));
      setPosition({ x: finalX, y: finalY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, position]);

  useEffect(() => {
    const handleResize = () => {
      if (!position) return;
      const btnSize = 48;
      let finalX = 24;
      if (panelAlign === "right") {
        finalX = window.innerWidth - btnSize - 24;
      }
      const finalY = Math.max(50, Math.min(window.innerHeight - btnSize - 50, position.y));
      setPosition({ x: finalX, y: finalY });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position, panelAlign]);

  return {
    position,
    setPosition,
    isDragging,
    setIsDragging,
    buttonRef,
    panelAlign,
    setPanelAlign,
    hasMovedRef,
    handleMouseDown,
    handleTouchStart,
  };
}
