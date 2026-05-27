import React from "react";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  RefreshCw, 
  ChevronRight 
} from "lucide-react";
import { TestResultItem } from "../types";

interface TestResultListProps {
  tests: TestResultItem[];
  activeTestDetails: string | null;
  setActiveTestDetails: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function TestResultList({
  tests,
  activeTestDetails,
  setActiveTestDetails
}: TestResultListProps) {
  return (
    <div className="lg:col-span-8 flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1 select-none">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Danh mục kiểm định đầu ra</span>
        <span className="text-xs text-neutral-500">{tests.filter(t => t.status !== 'idle').length}/{tests.length} Bài test đã chạy</span>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {tests.map((test) => {
          const isSelected = activeTestDetails === test.id;
          return (
            <div 
              key={test.id}
              className={`border rounded-xl transition-all ${
                isSelected ? "bg-neutral-50 border-neutral-400/80 shadow-sm" : "bg-white border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <div 
                onClick={() => {
                  if (test.status !== "idle" && test.details && test.details.length > 0) {
                    setActiveTestDetails(isSelected ? null : test.id);
                  }
                }}
                className={`p-3.5 flex items-start justify-between gap-3 ${
                  test.status !== "idle" && test.details && test.details.length > 0 ? "cursor-pointer select-none" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon status */}
                  <div className="mt-0.5">
                    {test.status === "idle" && <HelpCircle className="w-4 h-4 text-neutral-300" />}
                    {test.status === "running" && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
                    {test.status === "passed" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {test.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    {test.status === "failed" && <XCircle className="w-4 h-4 text-red-600" />}
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-neutral-800 leading-tight flex flex-wrap items-center gap-1.5">
                      {test.name}
                      {test.category === "pdf" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 px-1 py-0.2 rounded border border-red-200">Loopback</span>
                      )}
                      {test.category === "pptx" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-700 px-1 py-0.2 rounded border border-orange-200">Vector</span>
                      )}
                    </h4>
                    <p className="text-[10px] text-neutral-500 leading-snug">{test.description}</p>
                    
                    {test.message && (
                      <p className={`text-[11px] font-medium leading-relaxed mt-1.5 p-2 rounded-lg border ${
                        test.status === "passed" ? "bg-green-50/40 text-green-800 border-green-200/60" :
                        test.status === "warning" ? "bg-amber-50/40 text-amber-800 border-amber-200/60" :
                        "bg-red-50/40 text-red-800 border-red-200/60"
                      }`}>
                        {test.message}
                      </p>
                    )}
                  </div>
                </div>

                {test.details && test.details.length > 0 && (
                  <ChevronRight 
                    className="w-4 h-4 text-neutral-400 mt-0.5 transition-transform"
                    style={{ transform: isSelected ? "rotate(90deg)" : "rotate(0deg)" }}
                  />
                )}
              </div>

              {/* Expandable test logs / steps */}
              {isSelected && test.details && (
                <div className="px-4 pb-4 border-t border-neutral-200/60 pt-3 bg-neutral-900 text-neutral-200 rounded-b-xl font-mono text-[10px] leading-relaxed max-h-52 overflow-y-auto">
                  <div className="flex items-center justify-between pb-1.5 border-b border-neutral-800 mb-2 font-bold text-neutral-400 select-none">
                    <span>Báo cáo tiến trình kiểm thử:</span>
                    <span className="text-[9px] bg-neutral-800 px-1.5 py-0.5 rounded text-indigo-400 animate-pulse">CONSOLE LOGS</span>
                  </div>
                  <div className="space-y-1">
                    {test.details.map((step, idx) => {
                      let styleClass = "text-neutral-300";
                      if (step.includes("[Lỗi]")) styleClass = "text-red-400 font-bold";
                      else if (step.includes("[Cảnh báo]")) styleClass = "text-amber-400 font-medium";
                      else if (step.includes("Thành công") || step.includes("Trùng khớp") || step.includes("đúng mực")) styleClass = "text-green-400";
                      
                      return (
                        <div key={idx} className={styleClass}>
                          {step}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
