import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFHexString,
  PDFDocument,
  PDFName,
  PDFTextField,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addInternalPageLink,
  addPdfBookmarks,
  addUriLink,
  fillFormFields,
  inspectFormFields,
} from "./pdfAdvanced";

describe("advanced PDF tools", () => {
  it("inspects and fills AcroForm fields", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const form = doc.getForm();
    const name = form.createTextField("name");
    name.addToPage(page, { x: 20, y: 130, width: 160, height: 24 });
    const approved = form.createCheckBox("approved");
    approved.addToPage(page, { x: 20, y: 90, width: 18, height: 18 });
    const source = await doc.save();

    const fields = await inspectFormFields(source);
    expect(fields.map((field) => field.name)).toEqual(["name", "approved"]);

    const filled = await fillFormFields(source, { name: "TPDF", approved: true });
    const loaded = await PDFDocument.load(filled);
    const loadedForm = loaded.getForm();
    expect((loadedForm.getTextField("name") as PDFTextField).getText()).toBe("TPDF");
    expect((loadedForm.getCheckBox("approved") as PDFCheckBox).isChecked()).toBe(true);
  });

  it("embeds nested Unicode bookmark titles without losing accents", async () => {
    const titleOne = String.fromCodePoint(66, 7843, 110, 32, 118, 7869, 32, 107, 105, 7871, 110, 32, 116, 114, 250, 99);
    const titleTwo = String.fromCodePoint(67, 7845, 117, 32, 116, 7841, 111, 32, 109, 243, 110, 103);
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([300, 400]);
    const bytes = await addPdfBookmarks(await doc.save(), [
      { title: titleOne, page: 1 },
      { title: titleTwo, page: 2, parent: 0 },
    ]);
    const loaded = await PDFDocument.load(bytes);
    const root = loaded.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    const first = root.lookup(PDFName.of("First"), PDFDict);
    const text = first.lookup(PDFName.of("Title"), PDFHexString);
    expect(text.decodeText()).toBe(titleOne);
    const nested = first.lookup(PDFName.of("First"), PDFDict);
    expect(nested.lookup(PDFName.of("Title"), PDFHexString).decodeText()).toBe(titleTwo);
  });

  it("adds a URI link annotation", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    const bytes = await addUriLink(await doc.save(), {
      page: 1,
      url: "https://example.com",
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.1,
    });
    const loaded = await PDFDocument.load(bytes);
    const annots = loaded.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    expect(annots?.size()).toBe(1);
  });

  it("adds an internal GoTo link", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    doc.addPage([300, 200]);
    const bytes = await addInternalPageLink(await doc.save(), {
      page: 1,
      destinationPage: 2,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.1,
    });
    const loaded = await PDFDocument.load(bytes);
    const annots = loaded.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    expect(annots?.size()).toBe(1);
    const annotation = loaded.context.lookup(annots!.get(0) as any, PDFDict);
    expect(annotation.has(PDFName.of("Dest"))).toBe(true);
  });

  it("persists hierarchical PDF outline bookmarks", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    doc.addPage([300, 200]);
    doc.addPage([300, 200]);
    const bytes = await addPdfBookmarks(await doc.save(), [
      { title: "Project", page: 1 },
      { title: "Architecture", page: 2, parent: 0 },
      { title: "MEP", page: 3, parent: 0 },
    ]);
    const loaded = await PDFDocument.load(bytes);
    const outlines = loaded.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    expect(outlines).toBeTruthy();
    expect(loaded.catalog.get(PDFName.of("PageMode"))?.toString()).toContain("UseOutlines");
    const firstRef = outlines.get(PDFName.of("First"));
    const first = loaded.context.lookup(firstRef as any, PDFDict);
    expect(first.has(PDFName.of("First"))).toBe(true);
    expect(first.has(PDFName.of("Last"))).toBe(true);
    expect(first.get(PDFName.of("Count"))?.toString()).toContain("2");
  });
});
