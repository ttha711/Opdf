import React from "react";
import { cn } from "../lib/utils";

interface RibbonLayoutTabProps {
  docMargin: "normal" | "narrow" | "wide";
  setDocMargin: (margin: "normal" | "narrow" | "wide") => void;
  docLandscape: boolean;
  setDocLandscape: (val: boolean) => void;
  docTheme: "corporate" | "minimalist" | "warm" | "modern";
  setDocTheme: (theme: "corporate" | "minimalist" | "warm" | "modern") => void;
}

export default function RibbonLayoutTab({
  docMargin,
  setDocMargin,
  docLandscape,
  setDocLandscape,
  docTheme,
  setDocTheme
}: RibbonLayoutTabProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Margins Selection */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Căn lề trang:</span>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          {[
            { id: "normal", label: "Tiêu chuẩn (Normal)" },
            { id: "narrow", label: "Rất vẹt (Narrow)" },
            { id: "wide", label: "Rộng lề (Wide)" }
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDocMargin(m.id as any)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer",
                docMargin === m.id ? "bg-white text-indigo-700 shadow-3xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              {m.id === "normal" ? "Normal" : m.id === "narrow" ? "Narrow" : "Wide"}
            </button>
          ))}
        </div>
      </div>

      {/* Landscape vs portrait */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Chiều khổ giấy:</span>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setDocLandscape(false)}
            className={cn(
              "px-2.5 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all",
              !docLandscape ? "bg-white text-indigo-700 shadow-3xs" : "text-slate-500"
            )}
          >
            Dọc (A4)
          </button>
          <button
            type="button"
            onClick={() => setDocLandscape(true)}
            className={cn(
              "px-2.5 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all",
              docLandscape ? "bg-white text-indigo-700 shadow-3xs" : "text-slate-500"
            )}
          >
            Ngang (Landscape)
          </button>
        </div>
      </div>

      {/* Typography / Themes */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Bộ phông chủ đề:</span>
        <select
          value={docTheme}
          onChange={(e) => setDocTheme(e.target.value as any)}
          className="bg-white border border-slate-200 rounded-lg p-1.5 px-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-505"
        >
          <option value="corporate">💼 Corporate (Tiêu chuẩn)</option>
          <option value="minimalist">✒️ Minimalist (Nhã nhặn)</option>
          <option value="warm">🍊 Warm Elegant (Ấm áp tinh anh)</option>
          <option value="modern">🚀 Modern Startup (Bứt phá)</option>
        </select>
      </div>
    </div>
  );
}
