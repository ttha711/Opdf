import {
  PDFArray,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
} from "pdf-lib";

export type FormFieldDescriptor = {
  name: string;
  type: "text" | "checkbox" | "dropdown" | "option-list" | "radio" | "unsupported";
  value: string | boolean | string[];
  options?: string[];
};

export type FormFieldValue = string | boolean | string[];

export type PdfBookmarkInput = {
  title: string;
  page: number;
};

export type PdfLinkInput = {
  page: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function inspectFormFields(bytes: Uint8Array): Promise<FormFieldDescriptor[]> {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return form.getFields().map((field) => {
    const name = field.getName();
    if (field instanceof PDFTextField) {
      return { name, type: "text", value: field.getText() ?? "" };
    }
    if (field instanceof PDFCheckBox) {
      return { name, type: "checkbox", value: field.isChecked() };
    }
    if (field instanceof PDFDropdown) {
      return {
        name,
        type: "dropdown",
        value: field.getSelected()[0] ?? "",
        options: field.getOptions(),
      };
    }
    if (field instanceof PDFOptionList) {
      return {
        name,
        type: "option-list",
        value: field.getSelected(),
        options: field.getOptions(),
      };
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        type: "radio",
        value: field.getSelected() ?? "",
        options: field.getOptions(),
      };
    }
    return { name, type: "unsupported", value: "" };
  });
}

export async function fillFormFields(
  bytes: Uint8Array,
  values: Record<string, FormFieldValue>,
  flatten = false,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  for (const field of form.getFields()) {
    if (!(field.getName() in values)) continue;
    const value = values[field.getName()];

    if (field instanceof PDFTextField) {
      field.setText(String(value ?? ""));
    } else if (field instanceof PDFCheckBox) {
      if (Boolean(value)) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown) {
      const next = Array.isArray(value) ? value[0] : String(value ?? "");
      if (next) field.select(next);
    } else if (field instanceof PDFOptionList) {
      const next = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
      field.select(next.filter(Boolean));
    } else if (field instanceof PDFRadioGroup) {
      const next = Array.isArray(value) ? value[0] : String(value ?? "");
      if (next) field.select(next);
    }
  }

  if (flatten) form.flatten();
  return doc.save();
}

function normalizeUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validateExternalUrl(value: string) {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// links are supported.");
  }
  return parsed.toString();
}

export async function addUriLink(bytes: Uint8Array, input: PdfLinkInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > doc.getPageCount()) {
    throw new Error("Invalid link page.");
  }

  const url = validateExternalUrl(input.url);
  const page = doc.getPage(input.page - 1);
  const { width, height } = page.getSize();
  const x = normalizeUnit(input.x) * width;
  const top = normalizeUnit(input.y) * height;
  const boxWidth = Math.max(0.005, normalizeUnit(input.width)) * width;
  const boxHeight = Math.max(0.005, normalizeUnit(input.height)) * height;
  const y = height - top - boxHeight;

  const action = doc.context.obj({
    S: "URI",
    URI: PDFString.of(url),
  });
  const annotation = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + boxWidth, y + boxHeight],
      Border: [0, 0, 0],
      A: action,
    }),
  );

  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) {
    annots.push(annotation);
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([annotation]));
  }

  return doc.save();
}

export async function addPdfBookmarks(
  bytes: Uint8Array,
  bookmarks: PdfBookmarkInput[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const cleaned = bookmarks
    .map((bookmark) => ({
      title: bookmark.title.trim(),
      page: Math.trunc(bookmark.page),
    }))
    .filter((bookmark) => bookmark.title && bookmark.page >= 1 && bookmark.page <= pages.length);

  if (cleaned.length === 0) {
    throw new Error("Add at least one valid bookmark.");
  }

  const context = doc.context;
  const outlinesRef = context.nextRef();
  const itemRefs = cleaned.map(() => context.nextRef());

  cleaned.forEach((bookmark, index) => {
    const destination = context.obj([pages[bookmark.page - 1].ref, PDFName.of("Fit")]);
    const item = context.obj({
      Title: PDFString.of(bookmark.title),
      Parent: outlinesRef,
      Dest: destination,
      ...(index > 0 ? { Prev: itemRefs[index - 1] } : {}),
      ...(index < itemRefs.length - 1 ? { Next: itemRefs[index + 1] } : {}),
    });
    context.assign(itemRefs[index], item);
  });

  const outlines = context.obj({
    Type: PDFName.of("Outlines"),
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: PDFNumber.of(cleaned.length),
  });
  context.assign(outlinesRef, outlines);

  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  return doc.save();
}
