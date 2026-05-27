export interface FabricPageProps {
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string;
  annotations: import("@opdf/core").Annotation[];
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  measureMode: boolean;
  aiPatchMode: boolean;
  annotationToolDefaults: import("../lib/app-types").AnnotationToolDefaults;
  onAnnotationCreated?: (page: number, kind: string, payload: Record<string, unknown>) => void;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
  /** Called after an ai-patch image overlay is placed — use this to auto-switch back to 'select' mode */
  onPatchApplied?: () => void;
}

export interface SelectedAnnotationState {
  id: string;
  kind: string;
  color: string;
  opacity: number;
  fontSize?: number;
  size?: number;
  anchorX: number;
  anchorY: number;
}
