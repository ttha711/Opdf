import React, { useState } from "react";
import {
  Sliders,
  Sparkles,
  Search,
  MessageSquare,
  LayoutTemplate,
  History,
} from "lucide-react";
import { cn } from "../lib/utils";
import { AIParsedDocument, DocumentBlock } from "../types";
import SidebarManualComposer from "./SidebarManualComposer";
import SidebarAiComposer from "./SidebarAiComposer";
import SidebarToolsComposer from "./SidebarToolsComposer";
import SidebarAiChat from "./SidebarAiChat";
import SidebarTemplatesPanel from "./SidebarTemplatesPanel";
import SidebarVersionsPanel from "./SidebarVersionsPanel";
import { DocumentVersion } from "../types";

type SidebarMode = "manual" | "ai" | "chat" | "tools" | "templates" | "versions";

interface BlockOfficeSidebarProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;

  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  promptInput: string;
  setPromptInput: (v: string) => void;
  refinePrompt: string;
  setRefinePrompt: (v: string) => void;
  isGenerating: boolean;
  isRefining: boolean;
  errorMessage: string | null;
  officeImporting: boolean;
  pdfImporting: boolean;

  changeBlockType: (id: string, type: DocumentBlock["type"]) => void;
  handleAIGenerate: (customPrompt?: string) => Promise<void> | void;
  handleAIRefine: () => Promise<void> | void;
  handleOfficeFileImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  handlePDFToBlocksImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;

  chatMessages: { role: "user" | "assistant"; content: string }[];
  handleChatSendMessage: (text: string) => Promise<void>;
  isSendingChat: boolean;
  handleClearChat: () => void;

  // Version history
  versions: DocumentVersion[];
  onSaveVersion: (label?: string) => void;
  onRestoreVersion: (id: string) => void;
  onDeleteVersion: (id: string) => void;

  // Block modification actions passed down
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  deleteBlock: (id: string) => void;
  insertNewBlock: (afterId: string, type: DocumentBlock["type"]) => void;
}

const TABS: { id: SidebarMode; icon: React.ReactNode; label: string }[] = [
  { id: "manual", icon: <Sliders className="w-3 h-3" />, label: "Sửa" },
  { id: "ai", icon: <Sparkles className="w-3 h-3 text-indigo-505" />, label: "AI" }, // Note: keeping slate-500 styles
  { id: "chat", icon: <MessageSquare className="w-3 h-3 text-indigo-505" />, label: "Hỏi" },
  { id: "templates", icon: <LayoutTemplate className="w-3 h-3 text-emerald-500" />, label: "Mẫu" },
  { id: "versions", icon: <History className="w-3 h-3 text-amber-500" />, label: "Lịch sử" },
  { id: "tools", icon: <Search className="w-3 h-3 text-indigo-505" />, label: "Công cụ" },
];

export default function BlockOfficeSidebar({
  currentDoc,
  setCurrentDoc,
  selectedBlockId,
  setSelectedBlockId,
  sidebarMode,
  setSidebarMode,
  promptInput,
  setPromptInput,
  refinePrompt,
  setRefinePrompt,
  isGenerating,
  isRefining,
  errorMessage,
  officeImporting,
  pdfImporting,
  changeBlockType,
  handleAIGenerate,
  handleAIRefine,
  handleOfficeFileImport,
  handlePDFToBlocksImport,
  chatMessages,
  handleChatSendMessage,
  isSendingChat,
  handleClearChat,
  versions,
  onSaveVersion,
  onRestoreVersion,
  onDeleteVersion,
  moveBlock,
  duplicateBlock,
  deleteBlock,
  insertNewBlock,
}: BlockOfficeSidebarProps) {
  const selectedBlock = currentDoc.blocks.find(b => b.id === selectedBlockId);

  return (
    <aside className="lg:col-span-3 bg-white border-l border-slate-200 flex flex-col overflow-hidden print:hidden h-full select-none">

      {/* ── Tab Bar ─────────────────────────────────────── */}
      <div className="flex bg-slate-50 border-b border-slate-200 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSidebarMode(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 text-[9px] font-bold cursor-pointer transition-all border-b-2",
              sidebarMode === tab.id
                ? "border-indigo-500 bg-white text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">

        {sidebarMode === "manual" && (
          !selectedBlock ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Sliders className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-600 mb-1">Chưa chọn khối nào</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px] mx-auto">
                  Chọn bất kỳ văn bản, slide hoặc bảng số để chỉnh sửa thuộc tính trực tiếp.
                </p>
              </div>
            </div>
          ) : (
            <SidebarManualComposer
              selectedBlockId={selectedBlockId!}
              selectedBlock={selectedBlock}
              currentDoc={currentDoc}
              setCurrentDoc={setCurrentDoc}
              changeBlockType={changeBlockType}
              moveBlock={moveBlock}
              duplicateBlock={duplicateBlock}
              deleteBlock={deleteBlock}
              insertNewBlock={insertNewBlock}
            />
          )
        )}

        {sidebarMode === "ai" && (
          <SidebarAiComposer
            promptInput={promptInput}
            setPromptInput={setPromptInput}
            refinePrompt={refinePrompt}
            setRefinePrompt={setRefinePrompt}
            isGenerating={isGenerating}
            isRefining={isRefining}
            errorMessage={errorMessage}
            officeImporting={officeImporting}
            pdfImporting={pdfImporting}
            handleAIGenerate={handleAIGenerate}
            handleAIRefine={handleAIRefine}
            handleOfficeFileImport={handleOfficeFileImport}
            handlePDFToBlocksImport={handlePDFToBlocksImport}
          />
        )}

        {sidebarMode === "chat" && (
          <SidebarAiChat
            messages={chatMessages}
            onSendMessage={handleChatSendMessage}
            isSending={isSendingChat}
            onClearChat={handleClearChat}
          />
        )}

        {sidebarMode === "templates" && (
          <SidebarTemplatesPanel
            onLoadTemplate={doc => {
              setCurrentDoc(doc);
              setSidebarMode("manual");
            }}
          />
        )}

        {sidebarMode === "versions" && (
          <SidebarVersionsPanel
            currentDoc={currentDoc}
            versions={versions}
            onSaveVersion={onSaveVersion}
            onRestoreVersion={onRestoreVersion}
            onDeleteVersion={onDeleteVersion}
          />
        )}

        {sidebarMode === "tools" && (
          <SidebarToolsComposer
            currentDoc={currentDoc}
            setCurrentDoc={setCurrentDoc}
            selectedBlockId={selectedBlockId}
            setSelectedBlockId={setSelectedBlockId}
          />
        )}
      </div>
    </aside>
  );
}
