export type AppState = "idle" | "converting" | "done" | "error";

export interface PageResult {
  pageNumber: number;
  imageUrl: string;
  pageWidth?: number;
  pageHeight?: number;
  htmlContent?: string;
  xmlContent?: string; // Semantic XML representation
  status: "pending" | "converting" | "done" | "error";
  error?: string;
}

export type TestStatus = "idle" | "running" | "passed" | "warning" | "failed";

export interface TestResultItem {
  id: string;
  name: string;
  category: "structure" | "table" | "image" | "pdf" | "pptx";
  description: string;
  status: TestStatus;
  message?: string;
  details?: string[];
}

export interface TestSuiteSummary {
  score: number; // 0 to 100
  totalTests: number;
  passedCount: number;
  warningCount: number;
  failedCount: number;
  runAt?: string;
}

// ─────────────────────────────────────────────────────────
// AI-First Web-Native Document Schema
// ─────────────────────────────────────────────────────────

export interface TableCell {
  value: string;
  formula?: string;       // e.g. "=SUM(B1:B5)"
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  bgColor?: string;
  color?: string;
  merged?: boolean;       // cell is merged into previous
  colSpan?: number;
  rowSpan?: number;
}

export interface InlineComment {
  id: string;
  blockId: string;
  anchorText: string;     // snippet of selected text
  comment: string;
  author?: string;
  createdAt: string;      // ISO date string
  resolved?: boolean;
}

export interface DocumentVersion {
  id: string;
  label: string;          // User-given name, e.g. "Draft v2"
  createdAt: string;      // ISO date string
  snapshot: AIParsedDocument;
}

export interface DocumentBlock {
  id: string;
  type:
    | "heading"
    | "paragraph"
    | "table"
    | "chart"
    | "callout"
    | "slide"
    | "page-break"
    | "image"
    | "divider";
  content: string;        // Plain text or HTML representation
  meta?: {
    level?: 1 | 2 | 3;                          // for heading
    style?: string;                              // custom extra inline CSS
    chartType?: "bar" | "line" | "pie" | "area"; // for charts
    chartDataKeys?: string[];                    // column references for chart
    calloutType?: "info" | "warning" | "success" | "danger"; // for callout
    bulletPoints?: string[];                     // for slide/list
    slideBg?: string;                            // slide background color
    layout?: "title" | "bullets" | "two-columns" | "quote" | "image-left" | "image-right" | "blank"; // slide layout
    imageSrc?: string;                           // base64 or URL for image block
    imageAlt?: string;
    imageWidth?: string;                         // e.g. "100%", "400px"
    slideNotes?: string;                         // Presenter notes
    // Table-level formatting
    hasHeaderRow?: boolean;
    frozenHeader?: boolean;
    stripeRows?: boolean;
    tableStyle?: "default" | "blue" | "green" | "orange" | "red" | "minimal";
  };
  tableData?: TableCell[][];                     // 2D matrix for spreadsheet
  grammarErrors?: GrammarError[];               // AI grammar check results
}

export interface GrammarError {
  text: string;
  suggestion: string;
  type: "grammar" | "spelling" | "style";
  start: number;          // char offset in content
  end: number;
}

export interface AIParsedDocument {
  title: string;
  description: string;
  theme: "corporate" | "minimalist" | "warm" | "modern";
  language?: string;      // e.g. "vi", "en"
  blocks: DocumentBlock[];
  comments?: InlineComment[];
}

// ─────────────────────────────────────────────────────────
// UI Helper types
// ─────────────────────────────────────────────────────────

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;      // ms, default 3500
}

export interface AutocompleteResult {
  text: string;           // suggested continuation text
  loading: boolean;
}
