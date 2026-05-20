export type BlockType = "paragraph" | "heading" | "list" | "image" | "table";

export type BlockStyle = {
  font: string;
  size: number;
  color: string;
  lineHeight?: number;
};

export type EditorBlock = {
  id: string;
  type: BlockType;
  content: string;
  html: string;
  style: BlockStyle;
};

export type LivePatch = {
  updates: Array<Partial<EditorBlock> & { id: string }>;
};
