import React from "react";
import { Activity, LayoutGrid, Clock } from "lucide-react";
import { TestSuiteSummary } from "../types";

interface TestRunnerScoreCardProps {
  summary: TestSuiteSummary | null;
}

export default function TestRunnerScoreCard({ summary }: TestRunnerScoreCardProps) {
  return (
    <div className="lg:col-span-4 bg-neutral-50 p-5 rounded-2xl border border-neutral-100 flex flex-col justify-between">
      <div>
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-indigo-505" />
          <span>Thư viện Điểm số Layout QA</span>
        </h3>
        
        {summary ? (
          <div className="text-center py-4 select-none">
            <div className="relative inline-flex items-center justify-center">
              <div className={`w-28 h-28 rounded-full flex flex-col items-center justify-center border-4 ${
                summary.score >= 85 ? "border-green-500 bg-green-50/20" : 
                summary.score >= 60 ? "border-amber-400 bg-amber-50/20" : "border-red-500 bg-red-50/20"
              }`}>
                <span className="text-3xl font-extrabold text-neutral-800">{summary.score}</span>
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Điểm QC</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="bg-white p-2 rounded-xl border border-neutral-200 text-center">
                <div className="font-bold text-sm text-green-600">{summary.passedCount}</div>
                <div className="text-[9px] text-neutral-500 font-medium">Đạt chuẩn</div>
              </div>
              <div className="bg-white p-2 rounded-xl border border-neutral-200 text-center">
                <div className="font-bold text-sm text-amber-600">{summary.warningCount}</div>
                <div className="text-[9px] text-neutral-500 font-medium">Cảnh báo</div>
              </div>
              <div className="bg-white p-2 rounded-xl border border-neutral-200 text-center">
                <div className="font-bold text-sm text-red-600">{summary.failedCount}</div>
                <div className="text-[9px] text-neutral-500 font-medium">Lỗi hỏng</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-neutral-400">
            <LayoutGrid className="w-10 h-10 mx-auto text-neutral-300 mb-2 animate-pulse" />
            <p className="text-xs">Chưa chạy kiểm thử bố cục.</p>
            <p className="text-[10px] text-neutral-400 mt-1">Ấn nút "Bắt đầu QC file" ở góc phải để tạo phản hồi chất lượng.</p>
          </div>
        )}
      </div>

      {summary && (
        <div className="text-[11px] text-neutral-500 border-t border-neutral-200/60 pt-4 flex items-center justify-between font-mono">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-neutral-400" /> Cập nhật lúc:</span>
          <span className="font-bold text-neutral-700">{summary.runAt}</span>
        </div>
      )}
    </div>
  );
}
