const BYTE_RANGE = new TextEncoder().encode("/ByteRange");

/**
 * True when the PDF carries a digital signature dictionary (/ByteRange).
 * Editing rewrites the file, which invalidates such a signature, so callers
 * warn before the first change.
 */
export function pdfHasDigitalSignature(bytes: Uint8Array): boolean {
  const last = bytes.length - BYTE_RANGE.length;
  outer: for (let index = 0; index <= last; index++) {
    if (bytes[index] !== 0x2f) continue;
    for (let offset = 1; offset < BYTE_RANGE.length; offset++) {
      if (bytes[index + offset] !== BYTE_RANGE[offset]) continue outer;
    }
    return true;
  }
  return false;
}
