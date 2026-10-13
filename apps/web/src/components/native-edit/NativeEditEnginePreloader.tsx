import { useEffect } from "react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { pdfiumRuntimeFontFallback, pdfiumRuntimeWasmUrl } from "../../lib/pdfiumRuntimeAssets";

export type NativeEditEngine = NonNullable<ReturnType<typeof usePdfiumEngine>["engine"]>;

type Props = {
  worker: boolean;
  onEngineReady: (engine: NativeEditEngine | null) => void;
  onError: (error: Error | null) => void;
};

/** Keep the native editor's PDFium worker ready while the user reads the PDF. */
export function NativeEditEnginePreloader({ worker, onEngineReady, onError }: Props) {
  const { engine, error } = usePdfiumEngine({
    worker,
    wasmUrl: pdfiumRuntimeWasmUrl,
    fontFallback: pdfiumRuntimeFontFallback,
  });

  useEffect(() => onEngineReady(engine), [engine, onEngineReady]);
  useEffect(() => onError(error), [error, onError]);

  return null;
}
