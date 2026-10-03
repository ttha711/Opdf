import {
  PDFArray,
  PDFCheckBox,
  PDFDocument,
  PDFName,
  PDFTextField,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
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

    const filled = await fillFormFields(source, { name: "OPDF", approved: true });
    const loaded = await PDFDocument.load(filled);
    const loadedForm = loaded.getForm();
    expect((loadedForm.getTextField("name") as PDFTextField).getText()).toBe("OPDF");
    expect((loadedForm.getCheckBox("approved") as PDFCheckBox).isChecked()).toBe(true);
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

  it("persists top-level PDF outline bookmarks", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    doc.addPage([300, 200]);
    const bytes = await addPdfBookmarks(await doc.save(), [
      { title: "Cover", page: 1 },
      { title: "Details", page: 2 },
    ]);
    const loaded = await PDFDocument.load(bytes);
    const outlineRef = loaded.catalog.get(PDFName.of("Outlines"));
    expect(outlineRef).toBeTruthy();
    expect(loaded.catalog.get(PDFName.of("PageMode"))?.toString()).toContain("UseOutlines");
  });
});
