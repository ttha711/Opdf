import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { ToastItem } from "../types";

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  error: <XCircle className="w-4 h-4 text-red-500" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  info: <Info className="w-4 h-4 text-indigo-500" />,
};

const colors = {
  success: "border-emerald-200 bg-emerald-50",
  error: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-indigo-200 bg-indigo-50",
};

const textColors = {
  success: "text-emerald-800",
  error: "text-red-800",
  warning: "text-amber-800",
  info: "text-indigo-800",
};

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm min-w-[260px] max-w-sm ${colors[toast.type]}`}
          >
            <span className="shrink-0 mt-0.5">{icons[toast.type]}</span>
            <p className={`flex-1 text-xs font-semibold leading-snug ${textColors[toast.type]}`}>
              {toast.message}
            </p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-0.5 hover:opacity-70 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
