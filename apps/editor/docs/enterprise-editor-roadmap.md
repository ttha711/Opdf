# Enterprise Document Editor Roadmap

## Short Explanation

The current web app already has a useful foundation: PDF-to-HTML extraction, a Block Office workspace, Word/Excel/PowerPoint modes, AI generation/refinement, Office import/export, PDF import, basic WYSIWYG editing, block editing, undo/redo, and a document Q&A sidebar.

The root gap is that the editing core is still MVP-style. Word editing depends on `contentEditable` plus `document.execCommand`, HTML is parsed back into a custom block schema, and AI edits directly replace selected HTML. This is fast to prototype, but it is fragile for enterprise users because selection state, nested formatting, comments, tracked changes, pagination, table editing, versioning, and multi-user consistency are hard to guarantee.

## Runtime Check

- Verified local web runtime at `http://localhost:3000`.
- Main PDF workspace renders.
- Block Office workspace renders with Word, Excel, PowerPoint tabs.
- Console issue found: `favicon.ico` returns 404 only. This is cosmetic.
- UI copy in runtime looks mostly Vietnamese with accents, but source files contain mojibake strings in many places. This should be cleaned before scaling the product.

## Existing Capabilities

- PDF-to-HTML workspace with upload, rendered page area, right-side AI selection edit, Word export, print, XML view.
- Block Office workspace with:
  - Word mode: rich editor and block/page view.
  - Excel mode: table editing and formulas.
  - PowerPoint mode: slide preview.
  - AI generation/refinement from prompts.
  - Office/PDF import.
  - DOCX/XLSX/PPTX/XML export.
  - Undo/redo for block operations.
  - Sidebar modes: quick edit, AI composer, AI chat, tools.
- Server API already split into route modules:
  - `document.ts`: generate/refine document schema.
  - `office.ts`: convert Office files, export DOCX, analyze Excel.
  - `editing.ts`: edit selected HTML, semantic search, formula generation, slide refinement.
  - `ocr.ts`, `chat.ts`: PDF/OCR and document Q&A flows.

## Enterprise Gaps To Close

### 1. Editor Core

Current issue:
- `contentEditable` and `execCommand` are deprecated/fragile for professional document editing.
- HTML round-tripping into blocks can lose formatting or structure.
- No true transaction model for formatting, insertion, comments, AI edits, and undo history.

Needed:
- Replace or wrap the Word editor core with a structured rich-text engine:
  - Best fit: TipTap/ProseMirror for custom document schema, AI commands, comments, track changes, tables, history, collaboration.
  - Alternative: Lexical if prioritizing React-native extensibility and performance.
  - Alternative: CKEditor 5 if prioritizing enterprise document features out of the box, but licensing and customization must be checked.

Recommended direction:
- Use TipTap/ProseMirror as the main editor model.
- Keep the existing `DocumentBlock` schema as import/export compatibility during migration.
- Add serializers:
  - `DocumentBlock[] -> ProseMirror JSON`
  - `ProseMirror JSON -> DocumentBlock[]`
  - `ProseMirror JSON -> DOCX/HTML/PDF`

### 2. Enterprise Formatting Tools

Current tools are basic: font, bold/italic/underline, color, highlight, alignment, lists, font size presets, line height, page break, callout, draft table, link, margin/orientation/theme, selected-text AI actions.

Needed tools:
- Paragraph styles: Title, Subtitle, Heading 1-6, Normal, Quote, Caption.
- Font size numeric input, not only Small/Medium/Large.
- Indent/outdent, first-line indent, paragraph spacing before/after.
- Ordered list styles: numeric, alphabetic, roman.
- Bullet styles and nested list level controls.
- Find/replace with match case and whole word.
- Format painter.
- Clear formatting.
- Table editor:
  - Add/delete row/column.
  - Merge/split cells.
  - Header row toggle.
  - Cell alignment, border, background.
  - Paste from Excel/Google Sheets.
- Image editor:
  - Upload, resize, crop, align, wrap text.
  - Alt text.
- Page tools:
  - Header/footer.
  - Page numbers.
  - Footnotes/endnotes.
  - Table of contents.
  - Section breaks.
- Document metadata:
  - Title, author, version, tags, status.
  - Template category.

### 3. AI Writing Workflow

Current issue:
- AI edits selected HTML directly.
- No diff, no review before applying, no citation/provenance, no mode separation.

Needed:
- AI command palette:
  - Rewrite selection.
  - Expand/shorten.
  - Change tone.
  - Translate.
  - Convert to table.
  - Extract action items.
  - Summarize section.
  - Generate outline.
  - Create executive summary.
  - Check consistency of numbers/dates/names.
  - Legal/admin tone cleanup.
- AI suggested changes panel:
  - Show before/after diff.
  - Accept/reject per change.
  - Apply to selection, section, or whole document.
- AI context controls:
  - Use selected text only.
  - Use current section.
  - Use whole document.
  - Use uploaded reference files.
- AI safety:
  - Validate returned editor JSON against schema.
  - Sanitize HTML.
  - Rate limit and cancel long-running requests.
  - Keep failed generations recoverable.

### 4. Collaboration And Review

Needed for enterprise:
- Comments anchored to text ranges.
- Mentions and assignments.
- Resolved/unresolved comment states.
- Track changes:
  - Insertions/deletions.
  - Formatting changes.
  - Accept/reject changes.
- Version history:
  - Named versions.
  - Restore version.
  - Compare versions.
- Autosave with save status and conflict handling.
- Multi-user collaboration:
  - Presence cursors.
  - Real-time editing.
  - Conflict-free updates via Yjs or equivalent.

Recommended stack:
- TipTap Collaboration + Yjs for real-time document state.
- Server persistence with PostgreSQL or MongoDB.
- Use a document transaction log for audit/version history.

### 5. Document Storage And Permissions

Current issue:
- App appears mostly local/session-state driven. Enterprise users need durable documents and permission control.

Needed:
- Document library/dashboard:
  - Recent documents.
  - Folders/projects.
  - Search.
  - Tags/status.
  - Owner/updated time.
- Permissions:
  - Owner, editor, commenter, viewer.
  - Share links with expiry.
  - Organization/team scopes.
- Audit log:
  - Who opened/exported/edited/commented/shared.
- Autosave:
  - Save every meaningful transaction.
  - Offline draft queue if network drops.

### 6. Import/Export Fidelity

Current issue:
- DOCX export uses HTML-to-DOCX. Good for fast output, but not enough for exact Word fidelity.
- Office import extracts text/structure and asks AI to rebuild schema, which may change content.

Needed:
- DOCX import preserving:
  - headings, paragraphs, runs, bold/italic/underline, styles.
  - tables, merged cells, images.
  - headers/footers, page breaks.
  - comments if possible.
- DOCX export preserving editor schema.
- PDF export with print-grade layout.
- HTML export with clean semantic HTML.
- Markdown export/import for AI-friendly drafting.

Recommended libraries/repos:
- `docx` npm package for structured DOCX generation.
- `mammoth` is already present, good for readable DOCX to HTML but not perfect fidelity.
- `PizZip` + `docxtemplater` for template-driven DOCX.
- `pdf-lib` or server-side Playwright print-to-PDF for higher-quality PDF export.
- TipTap/ProseMirror schema as the single source of truth before export.

### 7. Template System

Needed:
- Enterprise template gallery:
  - Contract.
  - Quotation.
  - Proposal.
  - Meeting minutes.
  - Project plan.
  - Report.
  - Financial summary.
  - Government/admin document.
- Template variables:
  - Customer name, address, tax code, dates, prices, signer.
- Template validation:
  - Required fields.
  - Number/date format.
  - Missing signature placeholders.
- AI template fill:
  - Generate from prompt.
  - Fill from uploaded file.
  - Fill from pasted data.

### 8. Data Consistency And Validation

Needed:
- Schema validation for every AI response.
- Formula validation for tables.
- Cross-document consistency checks:
  - Same company name.
  - Same totals in text and table.
  - Dates in chronological order.
  - Currency formatting.
- Export preflight:
  - Broken links.
  - Missing images.
  - Empty required fields.
  - Overflowing pages/tables.

### 9. UX Improvements

Needed:
- Fix mojibake source text and keep all UI copy in proper accented Vietnamese.
- Add a command menu (`Ctrl+K`) for tools and AI actions.
- Add keyboard shortcut map.
- Add context toolbar near text selection.
- Add document outline/nav panel.
- Add zoom controls and page fit modes.
- Add status bar details:
  - Save state.
  - Word count.
  - Page count.
  - Current style.
  - Selection info.
- Add onboarding sample documents, not a marketing landing page.

## Recommended Build Strategy

### Option A: Fast Product Upgrade In Current Repo

Use the current app and replace only the Word editor core first.

Pros:
- Fastest path.
- Reuses existing AI routes, import/export, sidebar, and Office modes.
- Lower rewrite risk.

Cons:
- Need careful migration from `DocumentBlock` to a richer editor schema.
- Existing UI has encoding/copy debt.

Recommendation:
- Best immediate path.

### Option B: Bring In A Mature Editor Repo/Library

Use TipTap or a TipTap-based template as the editor surface, then wire existing AI/import/export around it.

Pros:
- More robust editor behaviors quickly.
- Easier to add comments, collaboration, slash commands, tables, markdown, and AI commands.

Cons:
- Integration cost.
- Must avoid pulling in a demo app that fights the existing architecture.

Recommendation:
- Good if the goal is a serious enterprise editor within weeks rather than patching current `contentEditable`.

### Option C: Full Enterprise Suite Rewrite

Start from a document-collaboration architecture: editor schema, persistence, auth, permissions, versioning, jobs, storage, export service.

Pros:
- Clean long-term architecture.

Cons:
- Slower and not needed before proving the product workflow.

Recommendation:
- Do not start here unless the current app is only a throwaway prototype.

## Suggested Development Phases

### Phase 1: Stabilize Current App

- Fix mojibake Vietnamese strings across `src` and `server`.
- Add missing `favicon.ico` or remove the request issue.
- Add route-level response validation for AI JSON.
- Add better error messages and retry/cancel behavior for AI calls.
- Add a proper document save/load layer, even if localStorage first.
- Add a document command menu and find/replace.

### Phase 2: Replace Word Editing Core

- Add TipTap editor in parallel behind a feature flag.
- Implement block-to-editor and editor-to-block converters.
- Migrate toolbar commands to editor transactions.
- Add table extension, image extension, link extension, task list, highlight, text style, typography.
- Preserve existing DOCX/PDF/export buttons.

### Phase 3: AI Enterprise Editing

- Add AI command palette.
- Add AI diff preview with accept/reject.
- Add section/document context modes.
- Add consistency checker for names, dates, totals, and missing fields.
- Add schema-safe AI response validation.

### Phase 4: Review And Collaboration

- Add comments anchored to document ranges.
- Add track changes.
- Add version history.
- Add autosave and document library.
- Add roles and sharing.
- Add real-time collaboration with Yjs.

### Phase 5: Export And Template Fidelity

- Add template variables and required-field validation.
- Improve DOCX export using structured DOCX generation.
- Add high-quality PDF export.
- Add export preflight report.

## Fast Coding Tasks Worth Doing First

```text
1. Add docs/enterprise-editor-roadmap.md to keep the product direction visible.
2. Fix favicon 404.
3. Normalize Vietnamese text encoding in visible UI files.
4. Add a command menu with quick actions: Find, Replace, AI Rewrite, AI Summarize, Insert Table, Insert Image, Export.
5. Add find/replace for the Word editor.
6. Add local document save/load list.
7. Add AI diff preview instead of immediate replacement.
8. Add a TipTap prototype route/component beside the current editor.
```

## Repo/Library Candidates To Evaluate

```text
TipTap / ProseMirror
- Best fit for custom enterprise document editor.
- Strong extension system.
- Good path for comments, collaboration, tables, AI commands, and schema validation.

Lexical
- Strong React editing engine.
- Good performance and modular commands.
- Needs more custom work for document/page fidelity.

CKEditor 5
- Mature enterprise editor.
- Many business features exist.
- Licensing and customization can be heavier.

OnlyOffice / Collabora
- Best Office fidelity if embedding a full office suite is acceptable.
- Heavier infrastructure and less custom AI-native control.

docx npm package
- Useful for structured DOCX export.

docxtemplater
- Useful for template-driven contracts, quotes, reports.

Yjs
- Standard choice for collaborative editing state.
```

## Simplest Correct Next Step

Do not rewrite the whole app immediately. First, keep the existing product shell, then introduce a real editor engine in parallel. The first enterprise-grade milestone should be:

```text
Current Block Office UI
  -> TipTap editor core
  -> schema-safe AI commands
  -> diff preview
  -> save/load documents
  -> stable DOCX/PDF export
```

This path gives users and AI a reliable document surface without throwing away the useful PDF, Office, AI, and export work already present.
