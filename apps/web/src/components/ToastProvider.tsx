import { useEffect, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";

type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastPayload = { kind: ToastKind; message: string };

let toastListener: ((payload: ToastPayload) => void) | null = null;
const pendingQueue: ToastPayload[] = [];
let nextToastId = 1;

function emitToast(kind: ToastKind, message: string) {
  if (toastListener) {
    toastListener({ kind, message });
  } else {
    pendingQueue.push({ kind, message });
  }
}

/**
 * Module-level toast API — usable from hooks, components, and plain lib code.
 * Toasts are queued until the ToastProvider mounts.
 */
export const toast = {
  success: (message: string) => emitToast("success", message),
  error: (message: string) => emitToast("error", message),
  info: (message: string) => emitToast("info", message),
};

export function useToast() {
  return toast;
}

const KIND_STYLES: Record<ToastKind, { borderColor: string; background: string; color: string; icon: string }> = {
  success: { borderColor: "#10b981", background: "var(--ui-success-bg)", color: "var(--ui-success-text)", icon: "✓" },
  error: { borderColor: "var(--ui-danger)", background: "var(--ui-error-bg)", color: "var(--ui-error-text)", icon: "✕" },
  info: { borderColor: "var(--acrobat-blue)", background: "var(--bg-toolbar)", color: "var(--text-primary)", icon: "ℹ" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListener = ({ kind, message }) => {
      const id = nextToastId++;
      setItems((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, kind === "error" ? 6000 : 4000);
    };
    const queued = pendingQueue.splice(0, pendingQueue.length);
    queued.forEach((payload) => toastListener?.(payload));
    return () => {
      toastListener = null;
    };
  }, []);

  return (
    <>
      {children}
      <div
        aria-live="polite"
        role="status"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: "min(380px, calc(100vw - 32px))",
          pointerEvents: "none",
        }}
      >
        {items.map((item) => {
          const style = KIND_STYLES[item.kind];
          return (
            <div
              key={item.id}
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 14px",
                borderRadius: "var(--ui-radius-md)",
                border: "1px solid var(--border-color)",
                borderLeft: `4px solid ${style.borderColor}`,
                background: style.background,
                color: style.color,
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                fontSize: "var(--ui-font-sm)",
                lineHeight: 1.4,
                wordBreak: "break-word",
              }}
            >
              <span aria-hidden="true" style={{ fontWeight: 700 }}>{style.icon}</span>
              <span style={{ flex: 1 }}>{item.message}</span>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
                aria-label="Đóng thông báo"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  opacity: 0.6,
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
