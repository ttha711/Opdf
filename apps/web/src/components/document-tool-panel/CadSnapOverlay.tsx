import { useMemo, useState, type PointerEvent, type MouseEvent, type KeyboardEvent } from "react";
import { formatMillimeters, formatSquareMillimeters, polylineCanvasDistance, polygonCanvasArea } from "../../lib/measurement";
import { snapToVector, type Point, type Segment, type SnapKind, type SnapOptions } from "../../lib/cadVectorSnap";

export type ViewportMap = {
  width: number; height: number;
  convertToViewportPoint: (x: number,y: number) => number[];
  convertToPdfPoint: (x: number,y: number) => number[];
};

export function CadSnapOverlay({
  viewport, segments, ready, active, snapping, options, tolerance, mode, mmPerPoint, unit, onLength,
}: {
  viewport: ViewportMap; segments: Segment[]; ready: boolean; active: boolean;
  snapping: boolean; options: SnapOptions; tolerance: number;
  mode: "distance" | "perimeter" | "area"; mmPerPoint: number; unit: "mm" | "cm" | "m";
  onLength: (points: number) => void;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [hover, setHover] = useState<{point:Point;kind:SnapKind|null}|null>(null);
  const [finished, setFinished] = useState(false);
  const snapSegments = useMemo(() => segments.map(({a,b}) => {
    const [ax,ay]=viewport.convertToViewportPoint(a.x,a.y);
    const [bx,by]=viewport.convertToViewportPoint(b.x,b.y);
    return {a:{x:ax,y:ay},b:{x:bx,y:by}};
  }), [segments,viewport]);
  const screen = (p:Point):Point => {
    const [x,y]=viewport.convertToViewportPoint(p.x,p.y);
    return {x,y};
  };
  const place = (x:number,y:number):Point => {
    const [px,py]=viewport.convertToPdfPoint(x,y);
    return {x:px,y:py};
  };
  const pointer = (event:PointerEvent<SVGSVGElement>|MouseEvent<SVGSVGElement>) => {
    const r=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-r.left)*viewport.width/Math.max(1,r.width);
    const y=(event.clientY-r.top)*viewport.height/Math.max(1,r.height);
    if (snapping && ready) {
      const match=snapToVector(snapSegments,{x,y},tolerance,options);
      if (match) return {point:place(match.point.x,match.point.y),kind:match.kind};
    }
    return {point:place(x,y),kind:null};
  };
  const move = (event:PointerEvent<SVGSVGElement>) => {if(active) setHover(pointer(event));};
  const add = (event:MouseEvent<SVGSVGElement>) => {
    if (!active || event.detail>1) return;
    const hit=pointer(event);
    setHover(hit);
    setPoints(previous=>{
      const next=finished ? [hit.point] : [...previous,hit.point];
      onLength(next.length===2 && mode==="distance" ? Math.hypot(next[1].x-next[0].x,next[1].y-next[0].y) : 0);
      return next;
    });
    setFinished(mode==="distance" && (finished || points.length===1));
  };
  const stop = () => { if (points.length >= (mode==="area"?3:2)) setFinished(true); };
  const key = (event:KeyboardEvent<SVGSVGElement>) => {
    if(event.key==="Escape"){setPoints([]);setFinished(false);onLength(0);}
    if(event.key==="Backspace"){setPoints(curr=>curr.slice(0,-1));setFinished(false);onLength(0);}
    if(event.key==="Enter")stop();
  };
  const countPoints=points.map(screen);
  const path=countPoints.map(p=>p.x+","+p.y).join(" ");
  const pdfDistance=polylineCanvasDistance(points);
  const pdfArea=polygonCanvasArea(points);
  const measure= mode==="area" ?
    formatSquareMillimeters(pdfArea*mmPerPoint*mmPerPoint,unit) :
    formatMillimeters(pdfDistance*mmPerPoint,unit);
  return (
    <svg data-tpdf-cad-overlay="true" role="application" aria-label="CAD measurement canvas"
      tabIndex={active?0:-1} width={viewport.width} height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      onPointerMove={move} onPointerLeave={()=>setHover(null)}
      onClick={add} onDoubleClick={stop} onKeyDown={key}
      className={`absolute inset-0 h-full w-full ${active?"cursor-crosshair":"pointer-events-none"}`}
      style={{touchAction:active?"none":"auto",overflow:"visible"}}>
      {countPoints.length>1 && <polyline points={path} stroke="#e11d48" strokeWidth="2" fill="none" />}
      {finished && mode==="area" && countPoints.length>2 &&
        <polygon points={path} fill="#e11d4820" stroke="#e11d48" strokeWidth="2"/>}
      {countPoints.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#e11d48" stroke="white" strokeWidth="1.5"/>)}
      {active && hover && !finished && countPoints.length>0 &&
        <line x1={countPoints[countPoints.length-1].x} y1={countPoints[countPoints.length-1].y}
          x2={screen(hover.point).x} y2={screen(hover.point).y}
          stroke="#e11d48" strokeWidth="1.5" strokeDasharray="5 4"/>}
      {active && hover?.kind && <>
        <circle cx={screen(hover.point).x} cy={screen(hover.point).y} r="8"
          fill="none" stroke="#16a34a" strokeWidth="2"/>
        <text x={screen(hover.point).x+10} y={screen(hover.point).y-10}
          fontSize="12" fill="#15803d">{hover.kind}</text>
      </>}
      {countPoints.length>=2 && <g>
        <rect x={countPoints.at(-1)!.x+8} y={countPoints.at(-1)!.y+8}
          width="108" height="25" rx="5" fill="#fff" stroke="#e11d48"/>
        <text x={countPoints.at(-1)!.x+13} y={countPoints.at(-1)!.y+25}
          fontSize="12" fontWeight="600" fill="#881337">{measure}</text>
      </g>}
      {!ready && active && <text x="10" y="24" fontSize="13" fill="#b45309">Vector geometry not ready; free placement only</text>}
    </svg>
  );
}
