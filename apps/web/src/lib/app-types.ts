export type ActiveTool = "select" | "highlight" | "note" | "shape" | "signature" | "redact" | "measure";

export type ZoomPreset = "actual" | "fit-width" | "fit-page";

export type ViewMode = "continuous" | "page";

export type PendingRect = { x: number; y: number; width: number; height: number };

export type PendingNote = { page: number; rect: PendingRect } | null;
