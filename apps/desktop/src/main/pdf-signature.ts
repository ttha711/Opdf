import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import forge from "node-forge";

export type P12CertificateInfo = {
  commonName: string;
  organization: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
};

export type P12SignOptions = {
  passphrase?: string;
  page?: number;
  reason?: string;
  location?: string;
  contactInfo?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type PdfSignatureCertificateInfo = P12CertificateInfo & {
  issuerCommonName: string;
  currentlyWithinValidity: boolean;
};

export type PdfSignatureInspection = {
  index: number;
  byteRange: [number, number, number, number];
  byteRangeWellFormed: boolean;
  signedRevisionEnd: number;
  fileLength: number;
  bytesAfterSignedRevision: number;
  hasLaterRevision: boolean;
  cmsParsed: boolean;
  pdfSignerName: string;
  reason: string;
  signingTime: string;
  certificates: PdfSignatureCertificateInfo[];
  verification: "not-verified";
};

function parseP12(p12Bytes: Uint8Array, passphrase = "") {
  const binary = Buffer.from(p12Bytes).toString("binary");
  const asn1 = forge.asn1.fromDer(binary);
  return forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
}

function getSigningCertificate(p12: any) {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const keyBag = keyBags[0] ?? plainKeyBags[0];
  if (!keyBag?.key) throw new Error("No private key found in P12/PFX.");

  const privateKey = keyBag.key as any;
  const cert = certBags
    .map((bag: any) => bag.cert)
    .find((candidate: any) => {
      if (!candidate) return false;
      const publicKey = candidate.publicKey as any;
      return privateKey.n.compareTo(publicKey.n) === 0 && privateKey.e.compareTo(publicKey.e) === 0;
    });

  if (!cert) throw new Error("No certificate matching the private key was found.");
  return cert;
}

function attributeValue(cert: any, shortName: string) {
  const attribute = cert.subject.attributes.find((item: any) => item.shortName === shortName);
  return attribute?.value ? String(attribute.value) : "";
}

function issuerAttributeValue(cert: any, shortName: string) {
  const attribute = cert.issuer?.attributes?.find((item: any) => item.shortName === shortName);
  return attribute?.value ? String(attribute.value) : "";
}

function certificateInfo(cert: any): PdfSignatureCertificateInfo {
  const now = Date.now();
  const validFrom = cert.validity.notBefore.toISOString();
  const validTo = cert.validity.notAfter.toISOString();
  return {
    commonName: attributeValue(cert, "CN") || "Unknown certificate subject",
    organization: attributeValue(cert, "O"),
    issuerCommonName: issuerAttributeValue(cert, "CN"),
    serialNumber: cert.serialNumber || "",
    validFrom,
    validTo,
    currentlyWithinValidity:
      now >= cert.validity.notBefore.getTime() &&
      now <= cert.validity.notAfter.getTime(),
  };
}

function unescapePdfLiteral(value: string) {
  return value
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function extractPdfLiteralMetadata(pdf: Buffer, start: number) {
  const sample = pdf
    .slice(Math.max(0, start), Math.min(pdf.length, start + 32_768))
    .toString("latin1");
  const read = (key: string) => {
    const match = new RegExp("\\/" + key + "\\s*\\(([^)]*(?:\\\\\\)[^)]*)*)\\)").exec(sample);
    return match?.[1] ? unescapePdfLiteral(match[1]) : "";
  };
  return {
    pdfSignerName: read("Name"),
    reason: read("Reason"),
    signingTime: read("M"),
  };
}

export function inspectPdfSignatures(pdfBytes: Uint8Array): PdfSignatureInspection[] {
  const pdf = Buffer.from(pdfBytes);
  const text = pdf.toString("latin1");
  const pattern = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const inspections: PdfSignatureInspection[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const byteRange = match.slice(1, 5).map(Number) as [number, number, number, number];
    const [firstStart, firstLength, secondStart, secondLength] = byteRange;
    const signedRevisionEnd = secondStart + secondLength;
    const gapStart = firstStart + firstLength;
    const byteRangeWellFormed =
      firstStart === 0 &&
      firstLength >= 0 &&
      secondStart > gapStart &&
      secondLength >= 0 &&
      signedRevisionEnd <= pdf.length;

    let cmsParsed = false;
    let certificates: PdfSignatureCertificateInfo[] = [];
    if (byteRangeWellFormed && gapStart + 1 < secondStart) {
      try {
        const rawHex = pdf
          .slice(gapStart + 1, secondStart)
          .toString("latin1")
          .replace(/(?:00|>)+$/g, "")
          .replace(/\s+/g, "");
        if (rawHex && /^[0-9a-f]+$/i.test(rawHex) && rawHex.length % 2 === 0) {
          const cms = Buffer.from(rawHex, "hex");
          const asn1 = forge.asn1.fromDer(cms.toString("binary"));
          const message = forge.pkcs7.messageFromAsn1(asn1) as any;
          certificates = Array.isArray(message.certificates)
            ? message.certificates.map((cert: any) => certificateInfo(cert))
            : [];
          cmsParsed = true;
        }
      } catch {
        cmsParsed = false;
      }
    }

    const metadata = extractPdfLiteralMetadata(pdf, secondStart);
    const bytesAfterSignedRevision = Math.max(0, pdf.length - signedRevisionEnd);
    inspections.push({
      index: inspections.length + 1,
      byteRange,
      byteRangeWellFormed,
      signedRevisionEnd,
      fileLength: pdf.length,
      bytesAfterSignedRevision,
      hasLaterRevision: bytesAfterSignedRevision > 0,
      cmsParsed,
      ...metadata,
      certificates,
      verification: "not-verified",
    });
  }

  return inspections;
}

export function inspectP12Certificate(p12Bytes: Uint8Array, passphrase = ""): P12CertificateInfo {
  const p12 = parseP12(p12Bytes, passphrase);
  const cert = getSigningCertificate(p12);
  return {
    commonName: attributeValue(cert, "CN") || "Unknown signer",
    organization: attributeValue(cert, "O"),
    serialNumber: cert.serialNumber || "",
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
  };
}

function normalized(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

export async function signPdfWithP12(
  pdfBytes: Uint8Array,
  p12Bytes: Uint8Array,
  options: P12SignOptions = {},
): Promise<{ bytes: Uint8Array; certificate: P12CertificateInfo }> {
  if (pdfBytes.length === 0) throw new Error("PDF is empty.");
  if (p12Bytes.length === 0) throw new Error("P12/PFX certificate is empty.");

  const passphrase = options.passphrase ?? "";
  const certificate = inspectP12Certificate(p12Bytes, passphrase);
  const now = new Date();
  if (now < new Date(certificate.validFrom)) throw new Error("Certificate is not valid yet.");
  if (now > new Date(certificate.validTo)) throw new Error("Certificate has expired.");

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error("PDF has no pages.");

  const pageNumber = Math.min(Math.max(1, Math.trunc(options.page ?? 1)), pages.length);
  const page = pages[pageNumber - 1];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const xRatio = normalized(options.x, 0.62);
  const yRatio = normalized(options.y, 0.84);
  const widthRatio = Math.max(0.08, normalized(options.width, 0.32));
  const heightRatio = Math.max(0.03, normalized(options.height, 0.10));
  const boxWidth = Math.min(pageWidth * widthRatio, pageWidth * (1 - xRatio));
  const boxHeight = Math.min(pageHeight * heightRatio, pageHeight * (1 - yRatio));
  const x = pageWidth * xRatio;
  const y = pageHeight - pageHeight * yRatio - boxHeight;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reason = (options.reason || "Document approval").trim();
  const location = (options.location || "").trim();
  const contactInfo = (options.contactInfo || "").trim();

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.25, 0.42, 0.75),
    borderWidth: 1,
  });

  const titleSize = Math.max(7, Math.min(11, boxHeight * 0.18));
  const bodySize = Math.max(6, Math.min(9, boxHeight * 0.14));
  const signer = certificate.commonName || "Digital signer";
  const lines = [
    "Digitally signed",
    signer,
    now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC"),
    reason ? "Reason: " + reason : "",
  ].filter(Boolean);

  let textY = y + boxHeight - titleSize - 5;
  lines.forEach((line, index) => {
    page.drawText(line.slice(0, 100), {
      x: x + 6,
      y: textY,
      size: index === 0 ? titleSize : bodySize,
      font: index === 0 ? bold : font,
      color: rgb(0.08, 0.16, 0.30),
      maxWidth: Math.max(20, boxWidth - 12),
    });
    textY -= (index === 0 ? titleSize : bodySize) + 3;
  });

  pdflibAddPlaceholder({
    pdfDoc,
    pdfPage: page,
    reason,
    contactInfo,
    name: signer,
    location,
    signingTime: now,
    widgetRect: [x, y, x + boxWidth, y + boxHeight],
    appName: "OPDF Desktop",
  });

  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  const signerImpl = new P12Signer(Buffer.from(p12Bytes), { passphrase });
  const signerEngine = new SignPdf();
  const signed = await signerEngine.sign(pdfWithPlaceholder, signerImpl, now);
  return { bytes: new Uint8Array(signed), certificate };
}
