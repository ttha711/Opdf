export interface DocumentToolPanelProps {
  activeToolId: string;
  fileName: string;
  docBytes: Uint8Array | null;
  sourceBlob?: Blob | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  totalPages: number;
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
  bytes: Uint8Array | null;
  totalPages: number;
  size: number;
  isActiveDocument?: boolean;
}

export interface SplitPart {
  name: string;
  pages: number[];
}
