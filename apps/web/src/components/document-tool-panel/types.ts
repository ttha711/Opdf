export interface DocumentToolPanelProps {
  activeToolId: string;
  fileName: string;
  docBytes: Uint8Array | null;
  totalPages: number;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  annotations: any[];
  onClose: () => void;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  onOpenHtmlEditor?: (html: string) => void;
  setViewerError: (msg: string | null) => void;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  bridge: any;
}

export interface MergeFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  totalPages: number;
  size: number;
}

export interface SplitPart {
  name: string;
  pages: number[];
}
