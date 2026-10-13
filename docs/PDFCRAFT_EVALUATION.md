# PdfCraft -> TPDF: technical evaluation and integration plan

Status: **research / proposal only**. This document does not enable PdfCraft in production.

Evaluated: 2026-10-11
Upstream: [storytold/pdfcraft](https://github.com/storytold/pdfcraft) (main snapshot `bbbe60015c571ebfc39708ee07777b89e267122a`)
TPDF: [ttha711/Tpdf](https://github.com/ttha711/Tpdf) (main snapshot `7e4347b928dfdb58ac9a313b8f11f104f537e2c1`)

## Executive decision

**Keep EmbedPDF / PDFium-WASM as the primary viewer and native-edit engine.** Adopt selected PdfCraft ideas and, only after benchmarks, offer its headless CLI as an **optional, isolated, read-only backend** for document diagnostics. Do not embed the whole Rust engine or replace existing PDFium save paths now.

PdfCraft is an alpha project; the upstream README itself reports weak or missing features (complex text editing, non-Latin OCR, Office conversion, preflight completeness, hostile-file crash/hang hardening, and large-file lazy loading). Its corpus success figures are **upstream self-reports**, not an TPDF compatibility benchmark.

TPDF already has a substantive engine, native edit, PDF viewer virtualization, OCR, QPDF compression, signatures, drawing measurements, visual revision compare, and an AI/browser automation layer. Large-drawing performance issue [#151](https://github.com/ttha711/Tpdf/issues/151) remains independent; switching to PdfCraft is not a supported fix.

## Capability and effort matrix

| Candidate | PdfCraft evidence | Existing TPDF surface | Decision |
| --- | --- | --- | --- |
| Repair log, PDF object/security metadata, revision inspection | `crates/cos/README.md`, `doc_info` | PDFium viewer, core PDF services, signature inspection | **Pilot read-only** diagnostics first |
| Agent-accessible document tools | `crates/automation/README.md`; `pdfcraft-cli mcp --compact --root DIR` | `apps/web/src/agent/*`, `scripts/tpdf-cli.mjs` (Playwright) | Explore **headless backend** alongside, not in place of, browser automation |
| Accessibility checker for **PDF content** | `crates/a11y/README.md`: 31 of 32 checker rules, contrast excluded | UI accessibility work does not provide the same PDF-content report | Read-only candidate; validate on fixtures |
| PDF/A-2b/-3b preflight | `crates/preflight/src/lib.rs`: object-graph checks, partial conversion | `DocumentService.convertToPdfA` explicitly unsupported | Expose as **diagnosis**, not certified PDF/A conversion; validate independently with veraPDF |
| Incremental append, copy-on-write undo | `crates/cos/README.md`, `crates/engine/README.md` | PDFium serialized working bytes + server saves + bounded byte snapshots | **Research only** until independent signing and round-trip tests |
| Text-aware comparison | `crates/compare/src/lib.rs`: word-level Myers diff and rectangles | `apps/web/src/lib/revisionDiff.ts`: drawing-oriented visual compare | Complementary optional text-diff mode |
| Image downsampling/object cleanup | `crates/optimize/src/lib.rs` | `DocumentService.compressPdf`: QPDF/WASM | Benchmark; avoid accidental quality/tag loss |
| Rust renderer / desktop UI | `crates/render`, `crates/ui-egui` | EmbedPDF/PDFium virtualization, Electron, React | **Do not adopt** for main UI/viewer |
| Full Rust document editing | `crates/edit` | Existing PDFium object-edit contracts and Unicode workflows | **Do not migrate**; could regress CAD and Vietnamese editing |

Notes:
- PdfCraft COS currently buffers the entire input document; `ByteSource` streaming is listed as not implemented. TPDF's URL-backed HTTP Range viewer is more appropriate for 100–500+ MB technical PDFs.
- PdfCraft's own [render issue #1060](https://github.com/storytold/pdfcraft/issues/1060) describes multi-second pages for soft-mask gradients. Do not assume rendering speed is better.
- Maintaining two writable representations of the same document creates a conflict: changes made in the PDFium working copy must be materialized before any external file operation, and external writes must reload and invalidate stale object handles/history.

## Proposed architecture — optional read-only adapter

```text
TPDF React shell / Electron
  |
  +-- existing viewer, edit, annotations, Save --> EmbedPDF / PDFium (unchanged)
  |
  +-- authenticated request by document ID only
        |
        +-- TPDF Server / Electron main (feature flag, no arbitrary filesystem paths)
              |
              +-- materialize stable snapshot, if user requested diagnostics
              +-- isolated OS process: pinned pdfcraft-cli run --script ... --root WORKDIR
              +-- allowlist: document open + read-only inspection tools
              +-- bounded output / time / concurrency / memory
              +-- normalized JSON diagnostics + explicit warnings
```

Initial output contract: `{ engine, engineVersion, documentHash, ok, diagnostics, warnings, durationMs }`. Attach a revision/hash to every result; never apply diagnostics generated from stale bytes.

`pdfcraft-cli mcp --compact --root DIR` is useful for **local trusted agent clients** (stdio, no network listener), but it is **not** itself a safe HTTP API. Do not expose the unfiltered MCP tool table or unrestricted local paths to browser users or the AI assistant. An TPDF-hosted agent surface would require independent authentication, explicit allowlists, write confirmation and audit logs.

### Security and packaging rules

- This must be **opt-in**, disabled when the executable is absent, with a normal UI fallback and no viewer failure.
- Never accept a client-supplied local path, shell string or PdfCraft tool name; resolve authenticated TPDF document IDs to internal storage only.
- Spawn with an argument-array API (`execFile`/`spawn`), `shell: false`, a pinned executable and version, and isolated temporary directories. Enforce wall-time, stdout/stderr, PDF size, memory and concurrent-process ceilings; clean up on failure.
- PdfCraft `--root` is path confinement, **not** an OS process sandbox. Apply OS user/ACL isolation and no-network policy where available.
- Never put PDF passwords on command lines, logs or persisted job descriptors. Encrypted-file support is deferred until a credential-safe handoff exists.
- Package and verify trusted CLI binaries **per Windows/macOS/Linux architecture** if this becomes a shipped capability. No automatic downloading of unverified executables in production.
- Do not silently upload local PDF bytes to third parties. Avoid exposing raw PDFs in trace artifacts and logs.

## Implementation gates

### Gate 0 — independent offline feasibility (no application integration)

1. Pin a known PdfCraft commit and build locally: `cargo build --release -p pdfcraft-cli --no-default-features` (or use a separately checksum-verified release binary).
2. Compare `pdfcraft-cli info file.pdf` and supported read-only script tools against PDFium/QPDF findings for deterministic small files, encrypted files, scans, malformed PDFs and real CAD test fixtures.
3. Measure runtime, resident memory, CPU and failure handling on a representative **110 MB** vector PDF and **250 MB / 400+ page** PDF when available. A missing private benchmark cannot be replaced by smaller public CAD fixtures without qualification.
4. Verify **no input mutation**, stable JSON, no hangs, and bounded error handling under malformed input.
5. **Stop** if crash/hang, unacceptable memory cost or unreliable results appear. Do not retrofit production to justify the experiment.

### Gate 1 — read-only document report

Suggested future code surface (not implemented by this PR):
- `server/tpdf-pdfcraft-adapter.mjs`: isolated process/JSON normalization, <=300 lines.
- A narrow authenticated document-ID route in TPDF Server, with a size/time limit and feature flag.
- Shared data types in `packages/core`; an experimental UI report showing source engine and limitations.
- Tests for authorization, path traversal/symlinks, missing CLI, timeouts, output truncation, conflicting snapshot revisions and malformed PDFs.

Acceptance: disabled-by-default, no change to the primary PDFium viewer, no side effects on saved files, no unbounded subprocess/CPU memory, deterministic error reports, and CI runs across Windows/Linux (macOS before shipping desktop).

### Gate 2 — accessibility + PDF/A *validation*, not certification

Expose the PDF accessibility check (with explicit manual/unsupported checks) and the PDF/A-2b/-3b rule findings in a **Document Health** panel. Do not claim standards conformance based solely on PdfCraft checks. Cross-check PDF/A with veraPDF; cross-check tagged PDFs and Unicode form fields with other engines. Avoid converting any document until the missing-font, colour, metadata and signature cases have explicit product behavior.

### Gate 3 — incremental-save proof of concept on disposable copies

Separate research branch only. Compare the byte ranges, xref chains, document revision histories and digest verification before/after edits. Include unsigned PDFs, signed PDFs with allowed/disallowed post-sign edits, form fields, encryption, attachments, optional layers, Vietnamese text and embedded subset fonts.

A valid pre-existing signature cryptographic digest is **not** sufficient to claim document integrity or trusted signature status. DocMDP/FieldMDP permissions and trust/validation policies may still reject later changes. TPDF's current signature-inspection feature is structural, not full trust-chain validation. No switch to incremental writes until independent validators and re-open tests pass.

## Benchmark and release evidence

Use TPDF's own [public CAD corpus](REAL_CAD_TEST_CORPUS.md) and `tests/server-e2e/real-cad-corpus.spec.ts`; run twice with zero retries. Continue to track open issue [#151](https://github.com/ttha711/Tpdf/issues/151) separately. Include page counts, native text extraction, file byte sizes, hash, visible rendering diffs, permissions/signatures and parser round trips.

Decision checklist:
- Regression-free TPDF viewer and native editor, including PDFium Save/reopen.
- Existing release/CI, TypeScript, E2E, security and file-size gates pass.
- Every feature has a **measurable** benefit versus TPDF current engine, not just an upstream feature label.
- An independent parser (`qpdf --check` where available) accepts output; standards claims need specialist validators.
- Rollback is a one-flag disable with no persisted schema dependency.

## Licensing and attribution

PdfCraft's workspace declares **MIT OR Apache-2.0** and includes both license files. Copying or modifying source requires tracking the actual file's licensing and retaining applicable copyright/notice/attribution. The ArtCraft brand/logos are restricted separately; **do not import or reuse their trademarks**. PdfCraft also vendors patched third-party projects: audit dependencies and upstream license notices before distributing a binary. Prefer using the CLI as a separately versioned dependency over copying its vendored code wholesale.

## Immediate TPDF follow-up

1. Keep repairing real-CAD inline edit/save issue #151 using the existing PDFium path.
2. Prototype **read-only PdfCraft document diagnostics** outside TPDF first (Gate 0).
3. If the benchmark passes, implement the gated adapter (Gate 1), followed by Document Health reports (Gate 2).
4. Treat incremental-save as an independent compatibility experiment, not a wholesale engine migration.

### Primary upstream references

- [PdfCraft README](https://github.com/storytold/pdfcraft/blob/main/README.md)
- [COS parser and writing semantics](https://github.com/storytold/pdfcraft/blob/main/crates/cos/README.md)
- [Engine model](https://github.com/storytold/pdfcraft/blob/main/crates/engine/README.md)
- [Automation and MCP](https://github.com/storytold/pdfcraft/blob/main/crates/automation/README.md)
- [PDF accessibility checks](https://github.com/storytold/pdfcraft/blob/main/crates/a11y/README.md)
- [PDF/A preflight implementation](https://github.com/storytold/pdfcraft/blob/main/crates/preflight/src/lib.rs)
- [Optimizer implementation](https://github.com/storytold/pdfcraft/blob/main/crates/optimize/src/lib.rs)
