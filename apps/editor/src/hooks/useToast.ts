import { useState, useCallback, useRef } from "react";
import { ToastItem } from "../types";

/** Central toast manager hook. Use at top level and pass showToast down as needed. */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback(
    (
      message: string,
      type: ToastItem["type"] = "info",
      duration = 3500
    ) => {
      const id = `toast_${++counterRef.current}_${Date.now()}`;
      const item: ToastItem = { id, message, type, duration };
      setToasts(prev => [...prev, item]);

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
