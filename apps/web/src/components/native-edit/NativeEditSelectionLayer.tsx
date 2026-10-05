import type { RefObject } from "react";
import type { PdfContentObject } from "@opdf/core";
import {
  handlePdfPoint,
  pdfPointToDom,
  type NativeObjectGeometry,
  type NativeResizeHandle,
} from "../../lib/nativeEditGeometry";

const HANDLES: NativeResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function pointsAttribute(
  geometry: NativeObjectGeometry,
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
) {
  return geometry.corners
    .map((point) => pdfPointToDom(point, pageWidth, pageHeight, width, height))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function handleCursor(handle: NativeResizeHandle) {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}

export function nativeEditObjectIsEditable(object: PdfContentObject) {
  return (object.depth ?? 0) <= 1 && object.kind !== "shading";
}

type Props = {
  svgRef: RefObject<SVGSVGElement>;
  pageIndex: number;
  width: number;
  height: number;
  objects: PdfContentObject[];
  selected: PdfContentObject | null;
  displayGeometry: NativeObjectGeometry | null;
  geometryFor: (object: PdfContentObject) => NativeObjectGeometry;
  onEmptyPointerDown: () => void;
  onObjectPointerDown: (event: React.PointerEvent, object: PdfContentObject) => void;
  onObjectDoubleClick: (event: React.MouseEvent, object: PdfContentObject) => void;
  onResizePointerDown: (event: React.PointerEvent, handle: NativeResizeHandle) => void;
  onRotatePointerDown: (event: React.PointerEvent) => void;
};

export function NativeEditSelectionLayer({
  svgRef,
  pageIndex,
  width,
  height,
  objects,
  selected,
  displayGeometry,
  geometryFor,
  onEmptyPointerDown,
  onObjectPointerDown,
  onObjectDoubleClick,
  onResizePointerDown,
  onRotatePointerDown,
}: Props) {
  const rotateOffset = selected ? 28 * selected.pageHeight / Math.max(1, height) : 0;

  return (
    <svg
      ref={svgRef}
      className="native-edit-overlay"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onEmptyPointerDown();
      }}
      data-opdf-native-edit-page={pageIndex + 1}
    >
      {objects.map((object) => (
        <polygon
          key={object.id}
          className="native-edit-object"
          points={pointsAttribute(geometryFor(object), object.pageWidth, object.pageHeight, width, height)}
          onPointerDown={(event) => onObjectPointerDown(event, object)}
          onDoubleClick={(event) => onObjectDoubleClick(event, object)}
          data-opdf-canvas-object={object.id}
        />
      ))}

      {selected && displayGeometry ? (
        <>
          <polygon
            className={`native-edit-selection${nativeEditObjectIsEditable(selected) ? "" : " readonly"}`}
            points={pointsAttribute(displayGeometry, selected.pageWidth, selected.pageHeight, width, height)}
            onPointerDown={(event) => onObjectPointerDown(event, selected)}
            data-opdf-canvas-selection={selected.id}
          />
          {nativeEditObjectIsEditable(selected) ? HANDLES.map((handle) => {
            const dom = pdfPointToDom(
              handlePdfPoint(displayGeometry, handle),
              selected.pageWidth,
              selected.pageHeight,
              width,
              height,
            );
            return (
              <rect
                key={handle}
                className="native-edit-handle"
                x={dom.x - 4}
                y={dom.y - 4}
                width={8}
                height={8}
                style={{ cursor: handleCursor(handle) }}
                onPointerDown={(event) => onResizePointerDown(event, handle)}
                data-opdf-resize-handle={handle}
              />
            );
          }) : null}
          {nativeEditObjectIsEditable(selected) ? (() => {
            const top = handlePdfPoint(displayGeometry, "n");
            const rotate = {
              x: top.x + displayGeometry.v.x * rotateOffset,
              y: top.y + displayGeometry.v.y * rotateOffset,
            };
            const topDom = pdfPointToDom(top, selected.pageWidth, selected.pageHeight, width, height);
            const rotateDom = pdfPointToDom(rotate, selected.pageWidth, selected.pageHeight, width, height);
            return (
              <>
                <line className="native-edit-rotate-line" x1={topDom.x} y1={topDom.y} x2={rotateDom.x} y2={rotateDom.y} />
                <circle
                  className="native-edit-rotate-handle"
                  cx={rotateDom.x}
                  cy={rotateDom.y}
                  r={5}
                  onPointerDown={onRotatePointerDown}
                  data-opdf-rotate-handle="true"
                />
              </>
            );
          })() : null}
        </>
      ) : null}
    </svg>
  );
}
