import type {
  P12CertificateInfo,
  P12SignOptions,
  PdfSignatureInspection,
} from "../../types/opdf";

type StoredCertificate = {
  id: string;
  fileName: string;
  fingerprint: string;
  certificate: P12CertificateInfo;
  createdAt: number;
};

function encodeOptions(value: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function jsonOrError<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json() as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    // Keep status fallback.
  }
  throw new Error(message);
}

async function postBinary<T>(
  url: string,
  bytes: Uint8Array,
  options: Record<string, unknown>,
) {
  return jsonOrError<T>(await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-OPDF-Options": encodeOptions(options),
    },
    body: bytes as unknown as BodyInit,
  }));
}

export function createServerSigningClient(baseUrl: string) {
  return {
    async inspectP12Certificate(
      certificateBytes: Uint8Array,
      passphrase: string,
    ): Promise<P12CertificateInfo> {
      return postBinary<P12CertificateInfo>(
        `${baseUrl}/certificates/inspect`,
        certificateBytes,
        { passphrase },
      );
    },

    async inspectPdfSignatures(
      pdfBytes: Uint8Array,
    ): Promise<PdfSignatureInspection[]> {
      return jsonOrError<PdfSignatureInspection[]>(
        await fetch(`${baseUrl}/operations/inspect-signatures`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: pdfBytes as unknown as BodyInit,
        }),
      );
    },

    async signPdfP12(
      pdfBytes: Uint8Array,
      certificateBytes: Uint8Array,
      options: P12SignOptions,
    ): Promise<{ bytes: Uint8Array; certificate: P12CertificateInfo }> {
      const stored = await postBinary<StoredCertificate>(
        `${baseUrl}/certificates`,
        certificateBytes,
        {
          passphrase: options.passphrase,
          fileName: "certificate.p12",
        },
      );

      const response = await fetch(`${baseUrl}/operations/sign-p12`, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-OPDF-Options": encodeOptions({
            certificateId: stored.id,
            ...options,
          }),
        },
        body: pdfBytes as unknown as BodyInit,
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep status fallback.
        }
        throw new Error(message);
      }

      let certificate = stored.certificate;
      const encodedInfo = response.headers.get("x-opdf-certificate-info");
      if (encodedInfo) {
        try {
          const normalized = encodedInfo.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
          certificate = JSON.parse(atob(padded));
        } catch {
          // Stored metadata remains a safe fallback.
        }
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        certificate,
      };
    },
  };
}
