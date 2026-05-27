import React, { useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Highlight } from "@tiptap/extension-highlight";
import { Typography } from "@tiptap/extension-typography";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Placeholder } from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extension-character-count";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { FontFamily } from "@tiptap/extension-font-family";
import type { DocumentBlock, AIParsedDocument } from "../types";
import { blocksToProseMirror, proseMirrorToBlocks } from "../lib/tiptapSerializer";

interface Props {
  currentDoc: AIParsedDocument;
  onDocChange: (blocks: DocumentBlock[]) => void;
  selectedBlockId: string | null;
  onBlockSelect: (id: string | null) => void;
  readOnly?: boolean;
}

export default function TipTapWordEditor({
  currentDoc,
  onDocChange,
  readOnly,
}: Props) {
  const initialContent = useMemo(
    () => blocksToProseMirror(currentDoc.blocks),
    [] // Only use initial content on first render
  );

  const handleUpdate = useCallback(
    ({ editor }: any) => {
      const json = editor.getJSON();
      const blocks = proseMirrorToBlocks(json);
      onDocChange(blocks);
    },
    [onDocChange]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Highlight.configure({ multicolor: true }),
      Typography,
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: "Bắt đầu soạn thảo hoặc nhấn Ctrl+K để mở bảng lệnh...",
      }),
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      FontFamily,
    ],
    content: initialContent,
    editable: !readOnly,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none min-h-[400px] px-6 py-4 outline-none text-sm leading-relaxed focus:outline-none",
      },
    },
  });

  // Force-set content when doc changes externally (e.g., AI generation)
  React.useEffect(() => {
    if (editor && currentDoc.blocks.length > 0) {
      const currentJson = editor.getJSON();
      const newJson = blocksToProseMirror(currentDoc.blocks);
      // Avoid infinite loops by comparing
      if (JSON.stringify(currentJson.content) !== JSON.stringify(newJson.content)) {
        editor.commands.setContent(newJson);
      }
    }
  }, [editor, currentDoc.blocks]);

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg m-2">
        <p className="text-sm text-slate-400">Đang khởi tạo trình soạn thảo...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-lg m-1">
      <EditorContent editor={editor} className="h-full" />
      <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50 px-4 py-1.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {editor.storage.characterCount?.characters?.() || 0} ký tự
        </span>
        <span>{editor.isEditable ? "Đang soạn thảo" : "Chỉ xem"}</span>
      </div>
    </div>
  );
}

export { blocksToProseMirror, proseMirrorToBlocks };
