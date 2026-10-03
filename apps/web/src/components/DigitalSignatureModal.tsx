import { useMemo, useState } from "react";
import type { P12CertificateInfo } from "../types/opdf";

type PdfSource = Blob | Uint8Array | null;

async function toBytes(source: PdfSource) {
  if (!source) throw new Error("No PDF loaded.");
  return source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
}

function toDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function DigitalSignatureModal({
  isOpen,
  onClose,
  source,
  currentPage,
  totalPages,
  canSign,
  inspectCertificate,
  signDocument,
  onApplied,
}: {
  isOpen: boolean;
  onClose: () => void;
  source: PdfSource;
  currentPage: number;
  totalPages: number;
  canSign: boolean;
  inspectCertificate?: (certificateBytes: Uint8Array, passphrase: string) => Promise<P12CertificateInfo>;
  signDocument?: (
    pdfBytes: Uint8Array,
    certificateBytes: Uint8Array,
    options: {
      passphrase: string;
      page: number;
      reason: string;
      location: string;
      contactInfo: string;
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ) => Promise<{ bytes: Uint8Array; certificate: P12CertificateInfo }>;
  onApplied: (bytes: Uint8Array, certificate: P12CertificateInfo) => void;
}) {
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateBytes, setCertificateBytes] = useState<Uint8Array | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [certificateInfo, setCertificateInfo] = useState<P12CertificateInfo | null>(null);
  const [page, setPage] = useState(currentPage);
  const [reason, setReason] = useState("Document approval");
  const [location, setLocation] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [rect, setRect] = useState({ x: 62, y: 84, width: 32, height: 10 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const certificateLabel = useMemo(() => {
    if (!certificateInfo) return "";
    return certificateInfo.commonName + (certificateInfo.organization ? " · " + certificateInfo.organization : "");
  }, [certificateInfo]);

  if (!isOpen) return null;

  const loadCertificate = async (file: File | null) => {
    setCertificateFile(file);
    setCertificateInfo(null);
    setError(null);
    if (!file) {
      setCertificateBytes(null);
      return;
    }
    setCertificateBytes(new Uint8Array(await file.arrayBuffer()));
  };

  const inspect = async () => {
    if (!certificateBytes || !inspectCertificate) return;
    setBusy(true);
    setError(null);
    try {
      setCertificateInfo(await inspectCertificate(certificateBytes, passphrase));
    } catch (reasonValue) {
      setCertificateInfo(null);
      setError(reasonValue instanceof Error ? reasonValue.message : "Certificate could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!certificateBytes || !signDocument) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signDocument(
        await toBytes(source),
        certificateBytes,
        {
          passphrase,
          page,
          reason,
          location,
          contactInfo,
          x: rect.x / 100,
          y: rect.y / 100,
          width: rect.width / 100,
          height: rect.height / 100,
        },
      );
      onApplied(result.bytes, result.certificate);
      onClose();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Digital signing failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/55 p-4">
      <div className="premium-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="premium-modal-header">
          <div>
            <div className="premium-modal-title">Digital Signature · P12/PFX</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Certificate and password stay in the local desktop process.</div>
          </div>
          <button type="button" className="rounded px-2 py-1 text-sm hover:bg-[var(--ui-hover-bg)]" onClick={onClose}>✕</button>
        </div>

        <div className="premium-modal-body min-h-0 overflow-auto space-y-4">
          {!canSign ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Cryptographic P12/PFX signing is available only in OPDF Desktop. The browser build does not upload certificates to a server.
            </div>
          ) : null}
          {error ? <div className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}

          <div className="rounded border border-[var(--border-color)] p-3">
            <div className="mb-2 text-xs font-bold uppercase text-[var(--text-secondary)]">Certificate</div>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-semibold">
                Choose .p12 / .pfx
                <input type="file" accept=".p12,.pfx,application/x-pkcs12" className="hidden" onChange={(event) => void loadCertificate(event.target.files?.[0] ?? null)} />
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  setCertificateInfo(null);
                }}
                placeholder="Certificate password"
                className="min-w-[220px] flex-1 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm"
              />
              <button type="button" disabled={!canSign || !certificateBytes || busy} onClick={() => void inspect()} className="rounded border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-40">
                Verify certificate
              </button>
            </div>
            {certificateFile ? <div className="mt-2 text-xs text-[var(--text-secondary)]">{certificateFile.name} · {Math.ceil(certificateFile.size / 1024)} KB</div> : null}
            {certificateInfo ? (
              <div className="mt-3 rounded bg-emerald-50 p-3 text-xs text-emerald-900">
                <div className="font-bold">{certificateLabel}</div>
                <div className="mt-1">Serial: {certificateInfo.serialNumber || "—"}</div>
                <div>Valid: {toDate(certificateInfo.validFrom)} → {toDate(certificateInfo.validTo)}</div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold">Page
              <input type="number" min={1} max={Math.max(1, totalPages)} value={page} onChange={(event) => setPage(Number(event.target.value) || 1)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold">Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold">Location
              <input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold">Contact
              <input value={contactInfo} onChange={(event) => setContactInfo(event.target.value)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
            </label>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase text-[var(--text-secondary)]">Visible signature box · page % from top-left</div>
            <div className="grid grid-cols-4 gap-2">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key} className="text-xs font-semibold capitalize">{key}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rect[key]}
                    onChange={(event) => setRect((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))}
                    className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm font-normal"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            The signed PDF uses a detached PKCS#7 signature. Any later change to the signed byte ranges should make PDF readers report that the document was modified after signing.
          </div>
        </div>

        <div className="premium-modal-footer">
          <button type="button" onClick={onClose} className="rounded border border-[var(--border-color)] px-4 py-2 text-sm">Cancel</button>
          <button type="button" disabled={!canSign || !certificateBytes || busy} onClick={() => void sign()} className="rounded bg-[var(--acrobat-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            {busy ? "Signing…" : "Digitally sign PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
