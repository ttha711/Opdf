# CLAUDE.md — PDF to HTML AI Converter (Office Hub Pro)

## Tech Stack

- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Motion (framer-motion), Lucide React
- **Rich text:** TipTap (ProseMirror) with 15+ extensions — preferred over contentEditable
- **Backend:** Express 4, tsx (dev), esbuild (prod bundle)
- **AI:** Google Gemini (`@google/genai`) with Qwen fallback (`dashscope-intl.aliyuncs.com`), Zod validation
- **Office:** mammoth (DOCX→HTML), officeparser (PPTX/DOC), xlsx (SheetJS), html-to-docx, pptxgenjs, jsPDF + html2canvas
- **Testing:** Playwright
- **Runtime:** Node.js, ESM (`"type": "module"`)

## Development

```bash
npm run dev      # Start dev server (tsx server.ts + Vite middleware)
npm run build    # Build frontend + backend to dist/
npm start        # Production start (dist/server.cjs)
npm run lint     # Type check (tsc --noEmit)
npm test         # E2E tests (node scratch/e2e_test.js)
```

Server runs on port 3000 by default. Set `GEMINI_API_KEY` in `.env`.

## Architecture

```
src/
├── App.tsx              # Root: dual-workspace orchestrator (pdf-to-html, block-office)
├── main.tsx             # Entry point
├── types.ts             # All shared TypeScript types
├── components/          # 51 components (see below)
├── hooks/               # 8 custom hooks (no global state manager)
├── data/                # presetTemplates.ts (12 document templates)
└── lib/                 # Utilities (sanitizer, formulaEngine, blockParser, tiptapSerializer, etc.)

server/
├── server.ts            # Express entry: JSON 50MB limit, rate limiting, Vite/static serving
├── gemini.ts            # AI provider: Qwen primary → Gemini fallback with quota retry
├── htmlUtils.ts         # tidyHtml() auto-closes unclosed tags from LLM
├── officeParser.ts      # extractTextFromOfficeFile() — multi-format office parsing
├── routes/
│   ├── index.ts         # Router aggregator with per-route rate limiters
│   ├── ocr.ts           # POST /api/convert-page — AI OCR with semantic HTML
│   ├── document.ts      # POST /api/generate-document, /api/refine-document
│   ├── office.ts        # POST /api/convert-office, /api/export-docx, /api/excel-analyze
│   ├── editing.ts       # POST /api/edit-html, /api/html-to-xml, /api/generate-formula, etc.
│   └── chat.ts          # POST /api/chat-doc — document Q&A
└── middleware/
    ├── rateLimiter.ts   # OCR (10/min), AI (20/min), Chat (30/min), General (100/min)
    ├── validate.ts      # Request validation
    ├── aiValidator.ts   # Zod schema for AI JSON responses
    └── errorHandler.ts  # Global error + 404

vite.config.ts           # Manual chunk splitting: react, pdfjs, xlsx, export-libs, ai-office, ui-libs
```

## Key Patterns

### Dual Workspace Model
Two lazy-loaded workspaces via `React.lazy` + `Suspense`. `App.tsx` owns all shared state through custom hooks, passed as props. No Redux/Zustand/Context.

### Block-based Document Model
Core type is `AIParsedDocument` → ordered `DocumentBlock[]`. Each block has type (heading/paragraph/table/chart/callout/slide/page-break/image/divider), content, and optional meta/tableData. Powers Word, Excel, PowerPoint views from a single data model.

### AI-First Design
Most intelligence (OCR, generation, refinement, editing, search, formulas, slide design) goes through AI. Backend is an AI-as-a-service layer with Qwen primary → Gemini fallback. All AI JSON responses validated with Zod before returning to client.

### Data Flow
- File upload → base64 → `/api/convert-*` → AI → `AIParsedDocument` → blocks state → React render
- Client-side export: xlsx, pptxgenjs, jsPDF + html2canvas
- Server-side export: html-to-docx for DOCX generation

### Undo/Redo
`useBlockState` maintains history stack (25 entries, 450ms debounce). Each action pushes a full document snapshot.

### Vietnamese-first UI
All user-facing strings, error messages, templates, and AI prompts are in Vietnamese.

## Naming Conventions
- Components: PascalCase files matching default export name
- Hooks: `use*` prefix, camelCase
- API routes: kebab-case under `/api/*`
- Types: PascalCase interfaces/types in `types.ts`

## Current State (May 2026)
- TipTap editor being rolled out in Block Office workspace; PDF workspace still uses contentEditable
- `docs/enterprise-editor-roadmap.md` and `docs/upgrade-plan.md` track Phase 1-3 upgrade plans
- Frontend HMR can be disabled via `DISABLE_HMR=true` for AI Studio agent editing
- Vite path alias: `@` maps to project root

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pdf2html** (1604 symbols, 2196 relationships, 37 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pdf2html/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pdf2html/clusters` | All functional areas |
| `gitnexus://repo/pdf2html/processes` | All execution flows |
| `gitnexus://repo/pdf2html/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
