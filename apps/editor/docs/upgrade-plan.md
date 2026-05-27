# Office Hub Pro — Kế hoạch nâng cấp chi tiết

> **Phạm vi:** Thay thế hầu hết MSOffice với AI support  
> **Loại trừ:** Mục #5 (Database/Infrastructure) — sẽ merge với dự án khác sau  
> **Ngày:** 2026-05-24

---

## Phase 1: Stabilize (Ước tính: 1-2 tuần)

### 1.1 Sửa lỗi encoding mojibake
- **Vấn đề:** Source code chứa chuỗi tiếng Việt bị lỗi encoding (mojibake)
- **Cần làm:**
  - Quét tất cả file `.ts`, `.tsx` trong `src/` và `server/` tìm chuỗi lỗi encoding
  - Sửa lại thành tiếng Việt có dấu chuẩn Unicode
  - Đảm bảo file được lưu dưới dạng UTF-8

### 1.2 Input validation cho API routes
- **Vấn đề:** API routes không validate input, dễ bị lỗi runtime hoặc injection
- **Cần làm:**
  - Thêm validation middleware cho tất cả route trong `server/routes/`
  - Validate required fields, types, kích thước payload
  - Sanitize HTML input để chống XSS

### 1.3 Rate limiting
- **Vấn đề:** Không có rate limit, dễ bị abuse API
- **Cần làm:**
  - Thêm rate limiting middleware (express-rate-limit)
  - Cấu hình riêng cho từng route:
    - OCR/convert: 10 req/min
    - AI generate/refine: 20 req/min
    - Chat: 30 req/min
    - Còn lại: 60 req/min

### 1.4 Find/Replace nâng cao
- **Thêm vào Word Editor:**
  - Dialog find/replace với match case, whole word
  - Replace / Replace All
  - Highlight matches
  - Keyboard shortcut Ctrl+F / Ctrl+H

### 1.5 Command Palette (Ctrl+K)
- **Cần làm:**
  - Component `CommandPalette.tsx` hiển thị dạng overlay
  - Danh sách command: Find, Replace, AI Rewrite, AI Summarize, Insert Table, Insert Image, Export, Change Theme, v.v.
  - Tìm kiếm fuzzy command
  - Keyboard shortcut Ctrl+K để mở

### 1.6 Thống nhất error handling
- **Vấn đề:** Mix giữa alert(), toast, và error state
- **Cần làm:**
  - Tất cả error hiển thị qua Toast system
  - API error format thống nhất: `{ error: string, code?: string, details?: any }`
  - Retry button cho transient errors (network, quota)

### 1.7 Sửa favicon 404
- Thêm file favicon.ico hoặc remove reference

---

## Phase 2: Editor Core (Ước tính: 3-4 tuần)

### 2.1 Cài đặt TipTap engine
- **Packages cần thêm:**
  - `@tiptap/react` — React wrapper
  - `@tiptap/starter-kit` — Bộ extension cơ bản
  - `@tiptap/extension-table` — Table cell merge, header
  - `@tiptap/extension-table-row` / `@tiptap/extension-table-cell` / `@tiptap/extension-table-header`
  - `@tiptap/extension-image` — Image resize, caption
  - `@tiptap/extension-link` — Link với preview
  - `@tiptap/extension-task-list` / `@tiptap/extension-task-item`
  - `@tiptap/extension-highlight` — Text highlight
  - `@tiptap/extension-typography` — Smart quotes, dashes
  - `@tiptap/extension-text-style` — Font size, font family
  - `@tiptap/extension-color` — Text color
  - `@tiptap/extension-placeholder`
  - `@tiptap/extension-character-count`

### 2.2 Serializer: DocumentBlock ↔ ProseMirror JSON
- **BlockToProseMirror (blocks → editor):**
  ```
  heading → doc > heading (level meta.level)
  paragraph → doc > paragraph
  table → doc > table > tableRow[] > tableCell[]
  chart → doc > paragraph + custom chart node
  callout → doc > blockquote + custom class
  image → doc > image
  page-break → doc > hardBreak + page-break marker
  slide → (chỉ hiển thị trong slide mode)
  divider → doc > horizontalRule
  ```
- **ProseMirrorToBlock (editor → blocks):**
  ```
  doc > heading → heading block với content = text, meta.level
  doc > paragraph → paragraph block
  doc > table → table block với tableData[][] (parse cell content + formatting)
  doc > image → image block với meta.imageSrc, meta.imageAlt
  doc > blockquote.callout → callout block
  doc > horizontalRule → divider block
  ```

### 2.3 Thay thế dần contentEditable
- Feature flag `USE_TIPTAP` trong `.env`
- Tạo component `TipTapWordEditor.tsx` chạy song song với editor cũ
- Migrate toolbar: `RibbonHomeTab.tsx` và `PdfToHtmlWysiwygToolbar.tsx` điều khiển TipTap commands thay vì execCommand
- Khi flag ON: dùng TipTap, khi OFF: dùng contentEditable cũ

### 2.4 Migration kế hoạch
- Week 1: Cài packages, tạo TipTapWordEditor cơ bản, BlockToProseMirror serializer
- Week 2: ProseMirrorToBlock, table extension, image extension
- Week 3: Toolbar tích hợp TipTap, test round-trip fidelity
- Week 4: Gỡ feature flag, xóa code contentEditable cũ

---

## Phase 3: AI Enterprise Editing (Ước tính: 3-4 tuần)

### 3.1 AI Command Palette
- **Component `AiCommandPalette.tsx`:**
  - Mở bằng Ctrl+Shift+K hoặc nút AI trên ribbon
  - Các lệnh AI:
    - Rewrite selection
    - Expand / Shorten
    - Change tone: Formal / Casual / Professional / Friendly
    - Translate: EN ↔ VI
    - Convert to table / bullet list / numbered list
    - Extract action items
    - Summarize section
    - Generate outline
    - Create executive summary
    - Check consistency (số liệu, ngày tháng)
    - Fix grammar/spelling (VI + EN)
  - Mỗi lệnh map tới API route tương ứng

### 3.2 AI Diff Preview
- **Component `AiDiffPreview.tsx`:**
  - Trước khi áp dụng AI edit: hiển thị diff (before | after)
  - Dùng thư viện diff (diff-match-patch hoặc jsdiff)
  - 3 nút: Accept / Accept All / Reject
  - Hỗ trợ xem từng thay đổi riêng lẻ
- **API thay đổi:**
  - Route `/api/edit-html` trả về cả `{ original: string, modified: string, changes: DiffItem[] }`

### 3.3 AI Context Control
- **Thêm vào UI trước khi gọi AI:**
  - Radio button: Selection only / Current section / Whole document
  - Upload reference file button
  - Toggle "Use document language/style"

### 3.4 AI Response Validation
- **Schema validation:**
  - Dùng Zod để validate JSON response từ AI
  - Nếu AI response không khớp schema → tự động retry với prompt rõ ràng hơn
  - Fallback: parse thủ công nếu có thể
- **HTML sanitizer:**
  - Dùng DOMPurify (isomorphic) để sanitize HTML từ AI trước khi insert

### 3.5 Consistency Checker
- **Route mới `/api/check-consistency`:**
  - Kiểm tra: tên công ty, ngày tháng, số liệu trong text vs table, đơn vị tiền tệ
  - Trả về danh sách `{ location, issue, suggestion }`
- **UI:**
  - Panel hiển thị các inconsistency tìm thấy
  - Click để jump đến vị trí trong document
  - Quick fix button cho từng issue

---

## Phase 4: Collaboration & Review (Ước tính: 3-5 tuần)

### 4.1 Comments System
- **Data model (đã có `InlineComment` trong types.ts):**
  ```
  id, blockId, anchorText, comment, author, createdAt, resolved
  ```
- **Bổ sung:**
  - Comment thread (nhiều reply trong 1 thread)
  - @mentions (gợi ý từ danh sách user)
  - Resolved/Unresolved filter
  - Comment sidebar panel
  - Highlight text có comment trong editor
- **Storage:** localStorage trước (vì skip database), dùng JSON serialize

### 4.2 Track Changes
- **TipTap extension hoặc custom implementation:**
  - Mark insertions (green underline)
  - Mark deletions (red strikethrough)
  - Mark formatting changes (blue underline)
  - Accept/reject từng change
  - Accept all / Reject all
  - Sidebar hiển thị danh sách changes

### 4.3 Version History nâng cao
- **Nâng cấp từ `useVersionHistory.ts` hiện tại:**
  - Auto-save mỗi 30 giây (thay vì chỉ manual)
  - Compare versions (diff view)
  - Version metadata: ai-generated, manual-edit, import
  - Export version as .docx/.pdf

### 4.4 Share & Permissions (simplified - localStorage)
- **Share links (mô phỏng):**
  - Generate share token (UUID)
  - Set permission: view / comment / edit
  - Set expiry: 1h / 24h / 7d / never
  - Copy link button
- **Note:** Khi merge với dự án khác, thay bằng server-side implementation

---

## Phase 5: Export & Template Fidelity (Ước tính: 2-3 tuần)

### 5.1 DOCX Structured Export
- **Thay thế `html-to-docx` bằng `docx` npm package:**
  - Map `DocumentBlock[]` → `docx` Document sections
  - Hỗ trợ: headings, paragraphs, tables (merged cells), images, headers/footers, page numbers
  - Style mapping: theme corporate/minimalist/warm/modern → DOCX styles

### 5.2 PDF Export chất lượng cao
- **Phương án 1 (khuyên dùng):** Server-side Puppeteer/Playwright render HTML → PDF
  - Route `/api/export-pdf` nhận HTML, trả về PDF binary
  - Hỗ trợ: A4 size, margins, page breaks, header/footer
- **Phương án 2:** `pdf-lib` cho cấu trúc chính xác hơn
- Giữ lại jsPDF cho export nhanh client-side (fallback)

### 5.3 Template Variables
- **Syntax:** `{{variableName}}` trong content block
- **Template metadata:**
  ```typescript
  interface TemplateVariable {
    name: string;
    label: string;        // "Tên khách hàng"
    type: "text" | "number" | "date" | "select";
    required: boolean;
    defaultValue?: string;
    options?: string[];   // for select type
  }
  ```
- **UI:**
  - Panel hiển thị các biến cần điền
  - Auto-detect biến từ nội dung template
  - Preview sau khi fill

### 5.4 Markdown Import/Export
- **Import:** Markdown → DocumentBlock[] (dùng marked hoặc remark)
- **Export:** DocumentBlock[] → Markdown (custom serializer)
- **Ứng dụng:** AI thường sinh Markdown → import thẳng vào editor

### 5.5 Export Preflight Report
- **Route `/api/export-preflight`:**
  - Kiểm tra: broken links, missing images, empty required fields, overflow
  - Trả về danh sách warnings và errors
- **UI:** Dialog hiển thị report trước khi export

---

## Phase 6: Cải thiện UI/UX (Liên tục)

### 6.1 Context Toolbar
- Hiển thị floating toolbar gần text selection
- Các nút: Bold, Italic, Link, AI Edit, Comment

### 6.2 Document Outline Panel
- Sidebar hiển thị cấu trúc document (headings)
- Click để jump đến section

### 6.3 Status Bar nâng cao
- Word count, page count, current style, save status, selection info

### 6.4 Keyboard Shortcuts Map
- Dialog hiển thị tất cả shortcuts (Ctrl+/)

### 6.5 Zoom & Page Fit
- Zoom in/out/reset
- Fit to width / Fit to page

---

## Thứ tự triển khai (từng task nhỏ)

```
P1.1 ─ Fix mojibake ──────────────────────── (xong trong session này)
P1.2 ─ Input validation middleware ────────── (xong trong session này)
P1.3 ─ Rate limiting ──────────────────────── (xong trong session này)
P1.4 ─ Find/Replace ───────────────────────── (xong trong session này)
P1.5 ─ Command Palette ────────────────────── (xong trong session này)
P1.6 ─ Error handling thống nhất ──────────── (xong trong session này)
P1.7 ─ Favicon ────────────────────────────── (xong trong session này)
---
P2.1 ─ Cài TipTap packages ────────────────── (session sau)
P2.2 ─ BlockToProseMirror serializer ────────
P2.3 ─ ProseMirrorToBlock serializer ────────
P2.4 ─ TipTapWordEditor component ───────────
P2.5 ─ Table extension ──────────────────────
P2.6 ─ Image extension ──────────────────────
P2.7 ─ Toolbar integration ──────────────────
P2.8 ─ Remove contentEditable cũ ────────────
---
P3.1 ─ AI Command Palette component ─────────
P3.2 ─ AI Diff Preview ─────────────────────
P3.3 ─ AI Context Control UI ───────────────
P3.4 ─ Zod schema validation ───────────────
P3.5 ─ HTML sanitizer (DOMPurify) ──────────
P3.6 ─ Consistency Checker ─────────────────
---
P4.1 ─ Comment system ──────────────────────
P4.2 ─ Track Changes ───────────────────────
P4.3 ─ Version History nâng cao ────────────
P4.4 ─ Share & Permissions ─────────────────
---
P5.1 ─ DOCX structured export ──────────────
P5.2 ─ PDF export server-side ──────────────
P5.3 ─ Template Variables ──────────────────
P5.4 ─ Markdown import/export ──────────────
P5.5 ─ Export Preflight ────────────────────
---
P6.x ─ UI/UX improvements ──────────────────
```
