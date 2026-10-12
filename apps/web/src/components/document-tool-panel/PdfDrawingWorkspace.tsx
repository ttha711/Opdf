import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { calibrateMmPerPdfPoint, formatMillimeters, presetMmPerPdfPoint } from "../../lib/measurement";
import { extractPdfPathSegments, type Segment, type SnapOptions } from "../../lib/cadVectorSnap";
import { CadSnapOverlay } from "./CadSnapOverlay";

GlobalWorkerOptions.workerSrc = workerSrc;
type Layer = { id: string; name: string; visible: boolean };
type Config = {
  getGroups: () => Record<string, { name?: string; locked?: boolean; visible: boolean }> | null;
  isVisible: (group: {id:string}) => boolean;
  setVisibility: (id:string, visible:boolean, preserveRB?:boolean) => void;
};
const INITIAL: SnapOptions = { endpoint:true, midpoint:true, intersection:true, path:true };
const MAX_PIXELS = 18_000_000;

export function PdfDrawingWorkspace({ getDocumentBytes, fileName, onClose }: {
  getDocumentBytes: () => Promise<Uint8Array|null>; fileName: string; onClose: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy|null>(null);
  const [page, setPage] = useState<PDFPageProxy|null>(null);
  const [index, setIndex] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [config, setConfig] = useState<Config|null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [revision, setRevision] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [geometryMessage, setGeometryMessage] = useState("Reading vector paths…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [snap, setSnap] = useState(false);
  const [options, setOptions] = useState<SnapOptions>(INITIAL);
  const [tolerance, setTolerance] = useState(10);
  const [mode, setMode] = useState<"distance"|"perimeter"|"area">("distance");
  const [drawingScale, setDrawingScale] = useState(1);
  const [unit, setUnit] = useState<"mm"|"cm"|"m">("m");
  const [calibration, setCalibration] = useState<number|null>(null);
  const [lastLength, setLastLength] = useState(0);
  const [knownDistance, setKnownDistance] = useState("");
  const canvas = useRef<HTMLCanvasElement|null>(null);
  const currentViewport = useMemo(() => page?.getViewport({scale:zoom,rotation:(page.rotate+rotation)%360}) ?? null,[page,zoom,rotation]);
  const mmPerPoint = calibration ?? presetMmPerPdfPoint(drawingScale);
  const hidden = layers.some(layer => !layer.visible);
  const snapping = snap && !hidden && segments.length > 0;
  const viewport = currentViewport;
  const displaySegments = useMemo(() => segments,[segments]);

  useEffect(() => {
    let cancelled=false;
    let documentTask: ReturnType<typeof getDocument>|null=null;
    let loaded: PDFDocumentProxy|null=null;
    void (async () => {
      try {
        const source = await getDocumentBytes();
        if (!source) throw new Error("PDF bytes are not available.");
        if (source.byteLength > 96*1024*1024) throw new Error("This drawing exceeds the 96 MB browser workspace limit.");
        documentTask = getDocument({ data:source.slice() });
        loaded = await documentTask.promise;
        if (cancelled) return;
        const ocg = await loaded.getOptionalContentConfig() as Config;
        if (cancelled) return;
        const groups=ocg.getGroups() ?? {};
        setLayers(Object.entries(groups).map(([id,group]) => ({
          id, name:group.name || "Unnamed layer", visible:Boolean(group.visible),
        })));
        setConfig(ocg);
        setPdf(loaded);
        setBusy(false);
      } catch (reason) {
        if (!cancelled) {setError(reason instanceof Error?reason.message:String(reason));setBusy(false);}
      }
    })();
    return () => {cancelled=true; if(loaded)void loaded.destroy();else void documentTask?.destroy();};
  }, [getDocumentBytes]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled=false;
    setPage(null);
    setSegments([]);
    setGeometryMessage("Reading vector paths…");
    void pdf.getPage(index).then(async current => {
      if (cancelled) return;
      setPage(current);
      try {
        const ops=await current.getOperatorList();
        if(cancelled)return;
        const geometry=extractPdfPathSegments(ops as any);
        setSegments(geometry.segments);
        setGeometryMessage(geometry.truncated ? "Vector limit reached (20,000 segments). Snap is partial." :
          geometry.segments.length===0 ? "No straight vector paths detected; raster content cannot snap." :
          geometry.unsupportedCurves ? "Straight vector paths ready; curves are excluded from snap." :
          `${geometry.segments.length} vector segments ready`);
      } catch (reason) {
        if(!cancelled)setGeometryMessage(reason instanceof Error?reason.message:"Vector paths unavailable.");
      }
    }).catch(reason=>{if(!cancelled)setError(String(reason));});
    return () => {cancelled=true;};
  }, [pdf,index]);

  useEffect(() => {
    if (!page || !viewport || !canvas.current) return;
    let cancelled=false;
    let task: ReturnType<PDFPageProxy["render"]>|null=null;
    const target=canvas.current;
    const dpr=Math.min(window.devicePixelRatio || 1,2);
    const width=Math.ceil(viewport.width*dpr), height=Math.ceil(viewport.height*dpr);
    if (width*height>MAX_PIXELS || width>8192 || height>8192) {
      setError("Zoom exceeds the 18 MP canvas limit. Reduce zoom."); return;
    }
    setError("");
    target.width=width;target.height=height;
    target.style.width=viewport.width+"px";target.style.height=viewport.height+"px";
    const ctx=target.getContext("2d",{alpha:false});
    if (!ctx) {setError("Unable to create PDF canvas.");return;}
    task=page.render({canvasContext:ctx,viewport,transform:[dpr,0,0,dpr,0,0],
      optionalContentConfigPromise:config ? Promise.resolve(config as any):undefined});
    void task.promise.catch(reason=>{
      if(!cancelled && reason?.name!=="RenderingCancelledException")setError(reason?.message||"Unable to render PDF.");
    });
    return()=>{cancelled=true;task?.cancel();};
  },[page,viewport,config,revision]);

  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape" && event.target instanceof HTMLElement && event.target.tagName!=="INPUT")onClose();};
    document.addEventListener("keydown",key);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",key);};
  },[onClose]);

  const toggle=(id:string,visible:boolean)=>{
    if(!config)return;
    config.setVisibility(id,visible);
    const groups=config.getGroups()??{};
    setLayers(Object.entries(groups).map(([groupId,group])=>({
      id:groupId,name:group.name||"Unnamed layer",visible:Boolean(group.visible),
    })));
    setRevision(value=>value+1);
  };
  const setAll=(visible:boolean)=>{for(const layer of layers)config?.setVisibility(layer.id,visible);if(config){
    const groups=config.getGroups()??{};
    setLayers(Object.entries(groups).map(([id,group])=>({id,name:group.name||"Unnamed layer",visible:Boolean(group.visible)})));
    setRevision(v=>v+1);
  }};
  const calibrate=()=>{
    const entered=Number(knownDistance), factor=unit==="m"?1000:unit==="cm"?10:1;
    const next=calibrateMmPerPdfPoint(lastLength,entered*factor);
    if(next)setCalibration(next);
  };
  const section="rounded border border-[var(--border-color)] p-2";
  const control="rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1 text-xs";
  return (
    <div role="dialog" aria-modal="true" aria-label="Drawing layers and CAD snap" data-opdf-drawing-workspace="true"
      className="fixed inset-0 z-[9995] flex flex-col bg-[var(--bg-panel)] text-[var(--text-primary)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-2">
        <div><h2 className="text-base font-bold">Drawing layers & CAD snap</h2>
          <p className="max-w-[320px] truncate text-xs text-[var(--text-secondary)]">{fileName}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={control} disabled={index<=1} onClick={()=>setIndex(i=>i-1)}>Previous</button>
          <span className="text-xs">{index} / {pdf?.numPages??"…"}</span>
          <button className={control} disabled={!pdf||index>=pdf.numPages} onClick={()=>setIndex(i=>i+1)}>Next</button>
          <select aria-label="Drawing zoom" className={control} value={zoom} onChange={e=>setZoom(Number(e.target.value))}>
            {[0.5,0.75,1,1.25,1.5,2].map(z=><option key={z} value={z}>{Math.round(z*100)}%</option>)}
          </select>
          <button className={control} onClick={()=>setRotation(r=>(r+90)%360)}>Rotate view 90°</button>
          <button className={control} onClick={onClose}>Return to PDFium viewer</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[35vh] w-full shrink-0 space-y-3 overflow-auto border-b border-[var(--border-color)] p-3 text-xs md:max-h-full md:w-72 md:border-b-0 md:border-r">
          <div className={section}>
            <h3 className="mb-2 font-bold">Live PDF layers ({layers.length})</h3>
            <div className="mb-2 flex gap-2">
              <button className={control} disabled={!layers.length} onClick={()=>setAll(true)}>Show all</button>
              <button className={control} disabled={!layers.length} onClick={()=>setAll(false)}>Hide all</button>
            </div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {layers.map(layer=><label key={layer.id} className="flex items-center gap-2">
                <input type="checkbox" data-opdf-ocg={layer.id} checked={layer.visible}
                  onChange={e=>toggle(layer.id,e.target.checked)}/>
                <span className="min-w-0 break-all">{layer.name}</span>
              </label>)}
              {!layers.length&&<p className="text-[var(--text-secondary)]">This PDF has no optional-content layers.</p>}
            </div>
            <p className="mt-2 text-[var(--text-secondary)]">Layer changes redraw the document but do not modify the PDF file.</p>
          </div>
          <div className={section+" space-y-2"}>
            <h3 className="font-bold">CAD measurement</h3>
            <label className="flex gap-2"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Enable drawing measurement & snap</label>
            <select className={control} value={mode} aria-label="CAD measurement mode" onChange={e=>setMode(e.target.value as typeof mode)}>
              <option value="distance">Distance</option><option value="perimeter">Perimeter</option><option value="area">Area</option>
            </select>
            <p className="text-[var(--text-secondary)]">{geometryMessage}</p>
            {hidden&&snap&&<p role="status">Snap is disabled while layers are hidden to avoid selecting invisible geometry.</p>}
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(INITIAL) as (keyof SnapOptions)[]).map(kind=><label key={kind} className="flex gap-1 capitalize">
                <input type="checkbox" checked={options[kind]} onChange={e=>setOptions(o=>({...o,[kind]:e.target.checked}))}/>{kind}
              </label>)}
            </div>
            <label className="block">Snap radius: {tolerance}px
              <input aria-label="Snap tolerance" type="range" min="3" max="24" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))} className="w-full"/>
            </label>
            <label className="flex items-center gap-2">Drawing scale
              <select className={control} value={drawingScale} onChange={e=>{setDrawingScale(Number(e.target.value));setCalibration(null);}}>
                {[1,20,50,100,200,500].map(n=><option key={n} value={n}>1:{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">Units
              <select className={control} value={unit} onChange={e=>setUnit(e.target.value as typeof unit)}>
                <option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option>
              </select>
            </label>
            <p>Current factor: {mmPerPoint.toFixed(4)} mm / PDF point</p>
            <label>Known distance ({unit})
              <input className={control+" mt-1 w-full"} type="number" min="0" step="any" value={knownDistance} onChange={e=>setKnownDistance(e.target.value)}/>
            </label>
            <button className={control} disabled={!lastLength||!(Number(knownDistance)>0)} onClick={calibrate}>Calibrate from measured line</button>
            <p className="text-[var(--text-secondary)]">Click two points for distance. For perimeter/area: double-click or Enter to finish. Escape clears. Coordinates and lengths are PDF points, independent of zoom and rotation.</p>
          </div>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--ui-muted-bg)] p-6">
          {busy&&<p role="status">Loading drawing layers and vectors…</p>}
          {error&&<p role="alert" className="p-2 text-red-600">{error}</p>}
          {viewport&&<div className="relative mx-auto bg-white shadow-lg" style={{width:viewport.width,height:viewport.height}}>
            <canvas ref={canvas} data-opdf-layer-canvas="true" aria-label="Live layered PDF drawing"/>
            <CadSnapOverlay key={index+"-"+mode} viewport={viewport} segments={displaySegments}
              ready={segments.length>0} active={snap} snapping={snapping} options={options} tolerance={tolerance}
              mode={mode} mmPerPoint={mmPerPoint} unit={unit} onLength={setLastLength}/>
          </div>}
        </main>
      </div>
    </div>
  );
}
