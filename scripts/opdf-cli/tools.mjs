export const TOOL_ALIASES = {
  all: { menu: "All Tools..." },
  insert: { menu: "Insert PDF..." },
  "insert-pdf": { menu: "Insert PDF..." },
  split: { quick: "split-pdf", menu: "Split PDF..." },
  "split-pdf": { quick: "split-pdf", menu: "Split PDF..." },
  merge: { quick: "merge-pdf", menu: "Merge PDFs..." },
  "merge-pdf": { quick: "merge-pdf", menu: "Merge PDFs..." },
  ocr: { quick: "ocr", menu: "Run OCR" },
  number: { quick: "page-numbers", menu: "Page Numbers..." },
  "page-numbers": { quick: "page-numbers", menu: "Page Numbers..." },
  header: { menu: "Header..." },
  footer: { menu: "Footer..." },
  bates: { menu: "Bates Numbering..." },
  watermark: { quick: "watermark-pdf", menu: "Watermark..." },
  "watermark-pdf": { quick: "watermark-pdf", menu: "Watermark..." },
  compress: { quick: "compress-pdf", menu: "Compress PDF" },
  "compress-pdf": { quick: "compress-pdf", menu: "Compress PDF" },
  images: { menu: "Convert to Images" },
  "convert-images": { menu: "Convert to Images" },
  measure: { menu: "Measure Drawing" },
  compare: { menu: "Compare Revisions..." },
  redact: { menu: "Search & Secure Redact..." },
  advanced: { menu: "Advanced PDF..." },
  sign: { menu: "Digital Sign..." },
  "digital-sign": { menu: "Digital Sign..." },
};

export function resolveTool(name) {
  const key = String(name || "").trim().toLowerCase();
  const tool = TOOL_ALIASES[key];
  if (!tool) {
    const supported = Object.keys(TOOL_ALIASES).sort().join(", ");
    throw new Error(`Unknown tool "${name}". Supported: ${supported}`);
  }
  return { key, ...tool };
}

export function listTools() {
  return Object.entries(TOOL_ALIASES)
    .map(([name, config]) => ({ name, ...config }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
