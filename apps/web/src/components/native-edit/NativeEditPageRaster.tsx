import { RenderLayer } from "@embedpdf/plugin-render/react";
import { NativeEditFallbackRaster } from "./NativeEditFallbackRaster";
import { NativeEditRemoteRaster } from "./NativeEditRemoteRaster";

type Props = {
  documentId: string;
  pageIndex: number;
  revisionKey: string;
  enabled: boolean;
  width: number;
  height: number;
  disableNativeRender?: boolean;
  previewBase?: string | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
};

export function NativeEditPageRaster({ documentId, previewBase, disableNativeRender, ...page }: Props) {
  return previewBase
    ? <NativeEditRemoteRaster {...page} previewBase={previewBase} />
    : disableNativeRender
    ? <div role="status" className="native-edit-error">Large PDF preview requires the server renderer. Enable it on the server and reopen the editor.</div>
    : <>
      <RenderLayer documentId={documentId} pageIndex={page.pageIndex} />
      <NativeEditFallbackRaster {...page} />
    </>;
}
