import { AdvancedPdfModal } from "../AdvancedPdfModal";
import { DigitalSignatureModal } from "../DigitalSignatureModal";
import { RevisionCompareModal } from "../RevisionCompareModal";
import { SearchRedactModal } from "../SearchRedactModal";
import type { PdfSource } from "../../lib/documentSource";

type ControllerResult = ReturnType<typeof import("../../hooks/useAppControllers").useAppControllers>;
type AppState = ControllerResult["state"];
type Bridge = ControllerResult["bridge"];
type ReplaceDocumentBytes = ControllerResult["replaceDocumentBytes"];

type AppDocumentDialogsProps = {
  state: AppState;
  bridge: Bridge;
  source: PdfSource;
  replaceDocumentBytes: ReplaceDocumentBytes;
  showRevisionCompare: boolean;
  setShowRevisionCompare: (value: boolean) => void;
  showSearchRedact: boolean;
  setShowSearchRedact: (value: boolean) => void;
  showAdvancedPdf: boolean;
  setShowAdvancedPdf: (value: boolean) => void;
  showDigitalSignature: boolean;
  setShowDigitalSignature: (value: boolean) => void;
  success: (message: string) => void;
};

export function AppDocumentDialogs({
  state,
  bridge,
  source,
  replaceDocumentBytes,
  showRevisionCompare,
  setShowRevisionCompare,
  showSearchRedact,
  setShowSearchRedact,
  showAdvancedPdf,
  setShowAdvancedPdf,
  showDigitalSignature,
  setShowDigitalSignature,
  success,
}: AppDocumentDialogsProps) {
  return (
    <>
      <RevisionCompareModal
        isOpen={showRevisionCompare}
        onClose={() => setShowRevisionCompare(false)}
        baseSource={source}
        baseFileName={state.fileName}
        initialPage={state.page}
      />
      <SearchRedactModal
        isOpen={showSearchRedact}
        onClose={() => setShowSearchRedact(false)}
        source={source}
        fileName={state.fileName}
        onApplied={(bytes) => {
          replaceDocumentBytes(bytes, state.page);
          success("Secure redaction applied. Affected pages were rasterized to remove the underlying text layer.");
        }}
      />
      <AdvancedPdfModal
        isOpen={showAdvancedPdf}
        onClose={() => setShowAdvancedPdf(false)}
        source={source}
        totalPages={state.totalPages}
        currentPage={state.page}
        initialBookmarks={state.bookmarks}
        onApplied={(bytes, message, embeddedBookmarks) => {
          replaceDocumentBytes(bytes, state.page);
          if (embeddedBookmarks) {
            state.setBookmarks(embeddedBookmarks.map((item, index) => ({
              id: "bookmark-" + Date.now() + "-" + index,
              title: item.title,
              page: item.page,
              parent: item.parent,
              createdAt: Date.now(),
            })));
          }
          success(message);
        }}
      />
      <DigitalSignatureModal
        isOpen={showDigitalSignature}
        onClose={() => setShowDigitalSignature(false)}
        source={source}
        currentPage={state.page}
        totalPages={state.totalPages}
        canSign={Boolean(window.opdf?.signPdfP12 && window.opdf?.inspectP12Certificate)}
        inspectCertificate={bridge.inspectP12Certificate}
        inspectSignatures={bridge.inspectPdfSignatures}
        signDocument={bridge.signPdfP12}
        onApplied={(bytes, certificate) => {
          replaceDocumentBytes(bytes, state.page);
          success("Digitally signed by " + certificate.commonName + ". Save the PDF to preserve the signature.");
        }}
      />
    </>
  );
}
