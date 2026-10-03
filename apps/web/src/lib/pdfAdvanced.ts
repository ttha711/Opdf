import {
  PDFArray,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFPage,
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
  parent?: number;
};

export type PdfLinkRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfLinkInput = PdfLinkRect & {
  url: string;
};

export type PdfInternalLinkInput = PdfLinkRect & {
  destinationPage: number;
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

function getLinkGeometry(
  doc: PDFDocument,
  input: PdfLinkRect,
) {
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > doc.getPageCount()) {
    throw new Error("Invalid link page.");
  }
  const page = doc.getPage(input.page - 1);
  const { width, height } = page.getSize();
  const x = normalizeUnit(input.x) * width;
  const top = normalizeUnit(input.y) * height;
  const boxWidth = Math.max(0.005, normalizeUnit(input.width)) * width;
  const boxHeight = Math.max(0.005, normalizeUnit(input.height)) * height;
  const y = height - top - boxHeight;
  return { page, x, y, boxWidth, boxHeight };
}

function appendLinkAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  payload: Record<string, unknown>,
  rect: [number, number, number, number],
) {
  const annotation = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      ...payload,
    }),
  );
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(annotation);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([annotation]));
}

export async function addUriLink(bytes: Uint8Array, input: PdfLinkInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const url = validateExternalUrl(input.url);
  const { page, x, y, boxWidth, boxHeight } = getLinkGeometry(doc, input);
  const action = doc.context.obj({
    S: "URI",
    URI: PDFString.of(url),
  });
  appendLinkAnnotation(doc, page, { A: action }, [x, y, x + boxWidth, y + boxHeight]);
  return doc.save();
}

export async function addInternalPageLink(
  bytes: Uint8Array,
  input: PdfInternalLinkInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  if (
    !Number.isInteger(input.destinationPage) ||
    input.destinationPage < 1 ||
    input.destinationPage > doc.getPageCount()
  ) {
    throw new Error("Invalid destination page.");
  }
  const { page, x, y, boxWidth, boxHeight } = getLinkGeometry(doc, input);
  const destination = doc.context.obj([
    doc.getPage(input.destinationPage - 1).ref,
    PDFName.of("Fit"),
  ]);
  appendLinkAnnotation(doc, page, { Dest: destination }, [x, y, x + boxWidth, y + boxHeight]);
  return doc.save();
}

type CleanBookmark = {
  title: string;
  page: number;
  originalIndex: number;
  parent?: number;
};

function cleanBookmarks(bookmarks: PdfBookmarkInput[], pageCount: number): CleanBookmark[] {
  const valid = bookmarks
    .map((bookmark, originalIndex) => ({
      title: bookmark.title.trim(),
      page: Math.trunc(bookmark.page),
      originalIndex,
      parent: Number.isInteger(bookmark.parent) ? bookmark.parent : undefined,
    }))
    .filter((bookmark) => bookmark.title && bookmark.page >= 1 && bookmark.page <= pageCount);

  const originalToClean = new Map<number, number>();
  valid.forEach((bookmark, cleanIndex) => originalToClean.set(bookmark.originalIndex, cleanIndex));

  return valid.map((bookmark, cleanIndex) => {
    const parentOriginal = bookmark.parent;
    const parentClean = parentOriginal === undefined ? undefined : originalToClean.get(parentOriginal);
    const safeParent =
      parentClean !== undefined &&
      parentClean >= 0 &&
      parentClean < cleanIndex
        ? parentClean
        : undefined;
    return {
      title: bookmark.title,
      page: bookmark.page,
      originalIndex: bookmark.originalIndex,
      parent: safeParent,
    };
  });
}

export async function addPdfBookmarks(
  bytes: Uint8Array,
  bookmarks: PdfBookmarkInput[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const cleaned = cleanBookmarks(bookmarks, pages.length);
  if (cleaned.length === 0) throw new Error("Add at least one valid bookmark.");

  const context = doc.context;
  const outlinesRef = context.nextRef();
  const itemRefs = cleaned.map(() => context.nextRef());
  const children = new Map<number, number[]>();
  const rootChildren: number[] = [];

  cleaned.forEach((bookmark, index) => {
    if (bookmark.parent === undefined) {
      rootChildren.push(index);
      return;
    }
    const list = children.get(bookmark.parent) ?? [];
    list.push(index);
    children.set(bookmark.parent, list);
  });

  const siblingList = (bookmarkIndex: number) => {
    const parent = cleaned[bookmarkIndex].parent;
    return parent === undefined ? rootChildren : (children.get(parent) ?? []);
  };

  cleaned.forEach((bookmark, index) => {
    const siblings = siblingList(index);
    const siblingIndex = siblings.indexOf(index);
    const ownChildren = children.get(index) ?? [];
    const destination = context.obj([pages[bookmark.page - 1].ref, PDFName.of("Fit")]);
    const item = context.obj({
      Title: PDFString.of(bookmark.title),
      Parent: bookmark.parent === undefined ? outlinesRef : itemRefs[bookmark.parent],
      Dest: destination,
      ...(siblingIndex > 0 ? { Prev: itemRefs[siblings[siblingIndex - 1]] } : {}),
      ...(siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? { Next: itemRefs[siblings[siblingIndex + 1]] } : {}),
      ...(ownChildren.length > 0
        ? {
            First: itemRefs[ownChildren[0]],
            Last: itemRefs[ownChildren[ownChildren.length - 1]],
            Count: PDFNumber.of(ownChildren.length),
          }
        : {}),
    });
    context.assign(itemRefs[index], item);
  });

  const outlines = context.obj({
    Type: PDFName.of("Outlines"),
    First: itemRefs[rootChildren[0]],
    Last: itemRefs[rootChildren[rootChildren.length - 1]],
    Count: PDFNumber.of(cleaned.length),
  });
  context.assign(outlinesRef, outlines);
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  return doc.save();
}
