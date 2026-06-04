import React from "react";
import { Sparkles, Compass, Loader2, FileText, Download, RefreshCw } from "lucide-react";
import { PageResult } from "../types";
import PdfToHtmlVisualTab from "./PdfToHtmlVisualTab";
import PdfToHtmlImageEditTab from "./PdfToHtmlImageEditTab";
import PdfToHtmlWysiwygToolbar from "./PdfToHtmlWysiwygToolbar";

interface MidPanelProps {
  pdfPages: PageResult[];
  setPdfPages: React.Dispatch<React.SetStateAction<PageResult[]>>;
  activePdfPageIdx: number;
  showRawHtml: boolean;
  setShowRawHtml: (val: boolean) => void;
  rawHtmlText: string;
  setRawHtmlText: (val: string) => void;
  pdfViewerTab: "visual" | "compare" | "xml" | "image_edit";
  convertSinglePage: (idx: number) => void;
  capturePageSelection: () => void;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;
  handlePrint: () => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
  imageCropBox?: { x: number; y: number; w: number; h: number } | null;
  setImageCropBox?: (val: any) => void;
  setCroppedImageBase64?: (val: string | null) => void;
  isGeneratingXml: boolean;
  generateSemanticXml: (idx: number) => Promise<void>;
  downloadXmlFile: (idx: number) => void;
}

export default function PdfToHtmlMidPanel({
  pdfPages,
  setPdfPages,
  activePdfPageIdx,
  showRawHtml,
  setShowRawHtml,
  rawHtmlText,
  setRawHtmlText,
  pdfViewerTab,
  convertSinglePage,
  capturePageSelection,
  updatePdfPageHtml,
  handlePrint,
  pageRenderContainerRef,
  imageCropBox,
  setImageCropBox,
  setCroppedImageBase64,
  isGeneratingXml,
  generateSemanticXml,
  downloadXmlFile,
}: MidPanelProps) {
  const page = pdfPages[activePdfPageIdx];

  return (
    <section className="flex-grow flex-1 bg-slate-105/50 border-r border-slate-200 flex flex-col overflow-hidden h-full">
      {pdfViewerTab === "visual" && pdfPages.length > 0 && page?.status === "done" && (
        <PdfToHtmlWysiwygToolbar
          activePdfPageIdx={activePdfPageIdx}
          rawHtmlText={rawHtmlText}
          setRawHtmlText={setRawHtmlText}
          updatePdfPageHtml={updatePdfPageHtml}
          handlePrint={handlePrint}
          pageRenderContainerRef={pageRenderContainerRef}
        />
      )}

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex items-start justify-center">
        {pdfPages.length === 0 ? (
          <div className="max-w-md w-full text-center py-16 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-150 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-800 uppercase tracking-wide">
                Sửa tài liệu bằng AI
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tải tài liệu lên để AI chuẩn bị bản có thể sửa. Khi xử lý xong, bạn chỉnh chữ,
                bảng và bố cục trực tiếp tại đây rồi xuất sang Word, Excel hoặc PowerPoint.
              </p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl text-left space-y-2.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Luồng làm việc:
              </span>
              <ul className="text-xs text-slate-600 space-y-2">
                <li className="flex items-center gap-2">✓ AI chuẩn bị bản có thể chỉnh sửa</li>
                <li className="flex items-center gap-2">✓ Sửa trực tiếp trên trang sau khi xử lý</li>
                <li className="flex items-center gap-2">✓ Bôi đen đoạn bất kỳ để AI viết lại</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-6">
            {pdfViewerTab === "visual" && (
              <PdfToHtmlVisualTab
                pdfPages={pdfPages}
                activePdfPageIdx={activePdfPageIdx}
                showRawHtml={showRawHtml}
                setShowRawHtml={setShowRawHtml}
                rawHtmlText={rawHtmlText}
                setRawHtmlText={setRawHtmlText}
                convertSinglePage={convertSinglePage}
                capturePageSelection={capturePageSelection}
                updatePdfPageHtml={updatePdfPageHtml}
                handlePrint={handlePrint}
                pageRenderContainerRef={pageRenderContainerRef}
              />
            )}

            {pdfViewerTab === "image_edit" && (
              <PdfToHtmlImageEditTab
                page={page}
                imageCropBox={imageCropBox}
                setImageCropBox={setImageCropBox}
                setCroppedImageBase64={setCroppedImageBase64}
              />
            )}

            {pdfViewerTab === "compare" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center bg-slate-200/60 py-1.5 rounded-lg">
                    1. Tài liệu ảnh gốc
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-2 text-center flex items-center justify-center min-h-[400px]">
                    <img
                      src={page?.imageUrl}
                      className="max-w-full h-auto rounded shadow-xs"
                      alt="Page origin"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center bg-slate-200/60 py-1.5 rounded-lg">
                    2. Bản có thể sửa trực tiếp
                  </span>
                  <div className="border border-slate-250 rounded-xl bg-white p-5 max-h-[450px] overflow-y-auto select-all prose text-xs">
                    {page?.htmlContent ? (
                      <div dangerouslySetInnerHTML={{ __html: page.htmlContent || "" }} />
                    ) : (
                      <p className="text-center text-slate-400 py-12">Chưa chuẩn bị bản chỉnh sửa cho trang này.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {pdfViewerTab === "xml" && (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50/70 border border-slate-200/80 rounded-xl flex items-start gap-3 select-none leading-relaxed text-xs">
                  <Sparkles className="w-5 h-5 text-indigo-650 flex-shrink-0 animate-pulse mt-0.5" />
                  <div>
                    <strong className="text-slate-805 text-xs block mb-0.5">
                      Mô hình Ngữ Nghĩa XML Nghiệp Vụ (Semantic XML Schema):
                    </strong>
                    <span className="text-slate-600 text-[11px] leading-loose animate-none">
                      Bản chỉnh sửa trực quan thể hiện phương diện đồ họa và định dạng. Cấu trúc
                      XML lưu trữ ngữ nghĩa dữ liệu chuẩn hóa để lập chỉ mục, trích
                      xuất thực thể, đồng bộ cơ sở dữ liệu doanh nghiệp, và quản lý nghiệp vụ chuẩn
                      xác 100%.
                    </span>
                  </div>
                </div>

                {(() => {
                  if (!page) return null;
                  if (page.status !== "done") {
                    return (
                      <div className="w-full min-h-[350px] bg-white border border-slate-205 rounded-2xl flex flex-col items-center justify-center text-center p-6 select-none">
                        <Compass className="w-10 h-10 text-slate-300 mb-2" />
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Trang chưa được AI chuẩn bị
                        </h4>
                        <p className="text-xs text-slate-505 mt-1 max-w-xs">
                          Bạn cần chuẩn bị trang thành bản có thể sửa trước khi thiết lập cấu trúc
                          dữ liệu nghiệp vụ.
                        </p>
                      </div>
                    );
                  }

                  if (!page.xmlContent) {
                    return (
                      <div className="w-full min-h-[350px] bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-8 select-none space-y-3.5 animate-none">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="space-y-1 animate-none">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Chưa khởi dựng XML ngữ nghĩa
                          </h4>
                          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                            Nhấp chọn nút dưới đây để AI tự động chuyển hóa toàn bộ văn bản và bảng
                            số hành chính của trang thành lược đồ đóng thẻ XML với các thẻ định danh
                            và nhãn nghiệp vụ (VD: &lt;hoaDon&gt;, &lt;tongTien&gt;, &lt;benA&gt;,
                            &lt;hangMuc&gt;...).
                          </p>
                        </div>
                        <button
                          onClick={() => generateSemanticXml(activePdfPageIdx)}
                          disabled={isGeneratingXml}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                        >
                          {isGeneratingXml ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang liên kết AI khởi dựng XML...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Tự động sinh mã XML Ngữ nghĩa</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 select-none shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Lược đồ XML của trang {page.pageNumber}
                          </span>
                          <span className="text-[9px] bg-emerald-50 text-emerald-650 px-1.5 py-0.5 rounded-full border border-emerald-105 font-bold uppercase">
                            XML Hợp lệ
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => generateSemanticXml(activePdfPageIdx)}
                            disabled={isGeneratingXml}
                            className="px-3 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-xs font-semibold text-slate-705 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            title="Đồng bộ dịch lại XML"
                          >
                            {isGeneratingXml ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-slate-500" />}
                            <span>AI Dịch lại</span>
                          </button>
                          <button
                            onClick={() => downloadXmlFile(activePdfPageIdx)}
                            className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg text-xs font-bold text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            title="Tải xuống tệp .xml"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Tải tệp .xml</span>
                          </button>
                        </div>
                      </div>

                      <div className="border border-slate-250 rounded-xl overflow-hidden bg-slate-950 text-emerald-400 block shadow-inner relative max-h-[580px] overflow-y-auto">
                        <pre
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const editedXml = e.currentTarget.textContent || "";
                            setPdfPages((prev) =>
                              prev.map((p, i) =>
                                i === activePdfPageIdx ? { ...p, xmlContent: editedXml } : p
                              )
                            );
                          }}
                          className="p-5 font-mono text-xs leading-relaxed overflow-x-auto text-emerald-400 focus:outline-none min-h-[420px] select-text selection:bg-indigo-850 selection:text-white"
                        >
                          {page.xmlContent}
                        </pre>
                        <div className="absolute bottom-2 right-2 bg-slate-900/90 text-[9px] text-slate-500 font-bold uppercase tracking-widest px-2.5 py-1 rounded select-none pointer-events-none border border-slate-800">
                          Trình biên soạn Live XML (Có thể sửa trực tiếp)
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
