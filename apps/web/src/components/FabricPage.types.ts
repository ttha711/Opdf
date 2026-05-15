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
  onAnnotationCreated?: (page: number, kind: string, payload: Record<string, unknown>) => void;
  onAnnotationUpdated?: (id: string, payload: Record<string, unknown>) => void;
  onAnnotationDeleted?: (id: string) => void;
}

export interface SelectedAnnotationState {
  id: string;
  kind: string;
  color: string;
  opacity: number;
  fontSize?: number;
  anchorX: number;
  anchorY: number;
}
