import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

// Fallback: if no provider is mounted, fall back to the native confirm so callers never break.
const ConfirmContext = createContext<ConfirmFn>(async (options) => window.confirm(options.message));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

type PendingConfirm = { options: ConfirmOptions; resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        // If a dialog is already open, cancel it before showing the new one.
        prev?.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((prev) => {
      prev?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pending, close]);

  const options = pending?.options;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && options && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.45)",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={options.title || "Xác nhận"}
            style={{
              width: "min(420px, calc(100vw - 32px))",
              borderRadius: "var(--ui-radius-lg)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-toolbar)",
              color: "var(--text-primary)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
              padding: "20px",
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>
              {options.title || "Xác nhận"}
            </h4>
            <p style={{ margin: "0 0 18px", fontSize: "var(--ui-font-sm)", color: "var(--text-secondary)", whiteSpace: "pre-line" }}>
              {options.message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                ref={cancelButtonRef}
                type="button"
                autoFocus
                onClick={() => close(false)}
                style={{
                  cursor: "pointer",
                  padding: "6px 16px",
                  fontSize: "var(--ui-font-sm)",
                  fontWeight: 500,
                  borderRadius: "var(--ui-radius-sm)",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--text-primary)",
                }}
              >
                {options.cancelLabel || "Hủy"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                style={{
                  cursor: "pointer",
                  padding: "6px 16px",
                  fontSize: "var(--ui-font-sm)",
                  fontWeight: 600,
                  borderRadius: "var(--ui-radius-sm)",
                  border: "1px solid transparent",
                  background: options.danger ? "var(--ui-danger)" : "var(--acrobat-blue)",
                  color: "#ffffff",
                }}
              >
                {options.confirmLabel || "Đồng ý"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
