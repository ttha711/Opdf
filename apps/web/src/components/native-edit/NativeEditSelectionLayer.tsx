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

/**
 * PDF exporters can emit very flat glyph boxes (1-2 CSS pixels at fit zoom).
 * Keep the actual PDF geometry untouched, but give editable text a minimum
 * 6x8 CSS pixel hit region so pointer selection works without extreme zoom.
 */
function editableTextHitGeometry(
  geometry: NativeObjectGeometry,
  object: PdfContentObject,
  width: number,
  height: number,
): NativeObjectGeometry {
  if (object.kind !== "text" || !nativeEditObjectIsEditable(object)) return geometry;
  const halfWidth = Math.max(geometry.width / 2, 3 * object.pageWidth / Math.max(1, width));
  const halfHeight = Math.max(geometry.height / 2, 4 * object.pageHeight / Math.max(1, height));
  const corner = (uSign: number, vSign: number) => ({
    x: geometry.center.x + geometry.u.x * uSign * halfWidth + geometry.v.x * vSign * halfHeight,
    y: geometry.center.y + geometry.u.y * uSign * halfWidth + geometry.v.y * vSign * halfHeight,
  });
  return {
    ...geometry,
    corners: [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)],
  };
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
  // Keep the stable PDF object order; hit affordances must not reshuffle selectors.

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
      {objects.map((object) => {
        const isSelected = selected?.id === object.id;
        const geometry = isSelected && displayGeometry ? displayGeometry : geometryFor(object);
        const editable = nativeEditObjectIsEditable(object);
        return (
          <polygon
            key={object.id}
            className={[
              "native-edit-object",
              isSelected ? "native-edit-selection" : "",
              isSelected && !editable ? "readonly" : "",
            ].filter(Boolean).join(" ")}
            points={pointsAttribute(editableTextHitGeometry(geometry, object, width, height), object.pageWidth, object.pageHeight, width, height)}
            onPointerDown={(event) => onObjectPointerDown(event, object)}
            onDoubleClick={(event) => onObjectDoubleClick(event, object)}
            data-opdf-canvas-object={object.id}
            data-opdf-canvas-selection={isSelected ? object.id : undefined}
            data-opdf-object-kind={object.kind}
            data-opdf-object-depth={object.depth ?? 0}
          />
        );
      })}

      {selected?.kind === "text" && displayGeometry && nativeEditObjectIsEditable(selected) &&
        displayGeometry.height * height / Math.max(1, selected.pageHeight) < 6 ? (
        <polygon
          className="native-edit-cad-foreground"
          points={pointsAttribute(
            editableTextHitGeometry(displayGeometry, selected, width, height),
            selected.pageWidth, selected.pageHeight, width, height,
          )}
          style={{ fill: "transparent", stroke: "transparent", pointerEvents: "all", cursor: "text" }}
          data-opdf-foreground-hit-target={selected.id}
          onPointerDown={(event) => onObjectPointerDown(event, selected)}
          onDoubleClick={(event) => onObjectDoubleClick(event, selected)}
        />
      ) : null}

      {selected && displayGeometry && nativeEditObjectIsEditable(selected) ? HANDLES.map((handle) => {
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

      {selected && displayGeometry && nativeEditObjectIsEditable(selected) ? (() => {
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
    </svg>
  );
}
