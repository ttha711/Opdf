export type MarkupTool = "page-numbers" | "header" | "footer" | "bates";

export type MarkupOptions = {
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  align?: "left" | "center" | "right";
  text?: string;
  prefix?: string;
  suffix?: string;
  startNumber?: number;
  digits?: number;
  fontSize?: number;
  fontColor?: string;
  pageStart?: number;
  pageEnd?: number;
};

export type DocumentToolOptions = {
  pages?: string | number[];
  marginPercent?: number;
  password?: string;
  targetPage?: number;
  position?: "before" | "after";
  bytes?: Uint8Array;
};

export type WatermarkOptions = {
  text: string;
  fontSize?: number;
  color?: string;
  opacity?: number;
  rotation?: number;
};
