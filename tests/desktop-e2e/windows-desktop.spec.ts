import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { resolve } from "node:path";
import { buildOfficeFixtures, buildTestP12 } from "../helpers/server-tool-fixtures";

test("Windows Electron boots and its real IPC PDF/Office/signing engines work", async () => {
  test.skip(process.platform !== "win32", "Desktop gate is intended for the Windows runner.");
  test.setTimeout(180_000);

  const desktopDir = resolve(process.cwd(), "apps/desktop");
  const electronExecutable = resolve(desktopDir, "node_modules/electron/dist/electron.exe");
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [desktopDir],
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPDF_PROJECT_PATH: process.cwd(),
      OPDF_SOFFICE_PATH: process.env.OPDF_SOFFICE_PATH || "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.locator("body")).toBeVisible();
    await expect(window.locator('button[aria-label="Application menu"]')).toBeVisible();

    const bridgeShape = await window.evaluate(() => {
      const bridge = (window as any).opdf;
      return {
        present: Boolean(bridge),
        compress: typeof bridge?.compressPdf === "function",
        encrypt: typeof bridge?.encryptPdf === "function",
        sign: typeof bridge?.signPdfP12 === "function",
        officeToPdf: typeof bridge?.convertOfficeToPdf === "function",
        pdfToOffice: typeof bridge?.convertPdfOffice === "function",
      };
    });
    expect(bridgeShape).toEqual({
      present: true,
      compress: true,
      encrypt: true,
      sign: true,
      officeToPdf: true,
      pdfToOffice: true,
    });

    const sourceDoc = await PDFDocument.create();
    sourceDoc.addPage([400, 300]).drawText("OPDF WINDOWS DESKTOP IPC CHECK", { x: 40, y: 240, size: 14 });
    const source = Buffer.from(await sourceDoc.save({ useObjectStreams: false }));

    const compressed = Buffer.from(await window.evaluate(async (input) => {
      const bytes = await (window as any).opdf.compressPdf(new Uint8Array(input));
      return Array.from(bytes);
    }, Array.from(source)));
    expect(compressed.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect((await PDFDocument.load(compressed)).getPageCount()).toBe(1);

    const encrypted = Buffer.from(await window.evaluate(async (input) => {
      const bytes = await (window as any).opdf.encryptPdf(new Uint8Array(input), {
        userPassword: "desktop-pass",
        ownerPassword: "desktop-pass",
      });
      return Array.from(bytes);
    }, Array.from(source)));
    await expect(PDFDocument.load(encrypted)).rejects.toThrow();

    const decrypted = Buffer.from(await window.evaluate(async ({ input, password }) => {
      const bytes = await (window as any).opdf.decryptPdf(new Uint8Array(input), password);
      return Array.from(bytes);
    }, { input: Array.from(encrypted), password: "desktop-pass" }));
    expect((await PDFDocument.load(decrypted)).getPageCount()).toBe(1);

    const passphrase = "opdf-ci";
    const p12 = buildTestP12(passphrase);
    const signed = await window.evaluate(async ({ pdf, certificate, passphraseValue }) => {
      const result = await (window as any).opdf.signPdfP12(
        new Uint8Array(pdf),
        new Uint8Array(certificate),
        {
          passphrase: passphraseValue,
          page: 1,
          reason: "Windows CI approval",
          location: "GitHub Actions",
          contactInfo: "ci@opdf.local",
          x: 0.55,
          y: 0.72,
          width: 0.35,
          height: 0.14,
        },
      );
      return Array.from(result.bytes);
    }, { pdf: Array.from(source), certificate: Array.from(p12), passphraseValue: passphrase });
    const signedBytes = Buffer.from(signed);
    expect(signedBytes.includes(Buffer.from("/ByteRange"))).toBeTruthy();

    const inspections = await window.evaluate(async (input) => {
      return (window as any).opdf.inspectPdfSignatures(new Uint8Array(input));
    }, Array.from(signedBytes));
    expect(inspections).toHaveLength(1);
    expect(inspections[0].byteRangeWellFormed).toBeTruthy();
    expect(inspections[0].cmsParsed).toBeTruthy();

    const fixtures = await buildOfficeFixtures();
    const officePdf = Buffer.from(await window.evaluate(async ({ input, name }) => {
      const bytes = await (window as any).opdf.convertOfficeToPdf(new Uint8Array(input), name);
      return Array.from(bytes);
    }, { input: Array.from(fixtures.docx.bytes), name: fixtures.docx.name }));
    expect(officePdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect((await PDFDocument.load(officePdf)).getPageCount()).toBeGreaterThan(0);

    const docx = Buffer.from(await window.evaluate(async (input) => {
      const bytes = await (window as any).opdf.convertPdfOffice(new Uint8Array(input), "docx");
      return Array.from(bytes);
    }, Array.from(source)));
    const entries = Object.keys(unzipSync(new Uint8Array(docx)));
    expect(entries).toContain("[Content_Types].xml");
    expect(entries).toContain("word/document.xml");
  } finally {
    await app.close();
  }
});
