# Optional Document Health (PdfCraft)

Document Health adds **read-only diagnostics** to TPDF Server. The existing EmbedPDF/PDFium
viewer, editor, save pipeline, OCR, signatures and automation continue to operate unchanged.

Status: **feature-flagged integration**, off by default. A real PdfCraft binary and its
PDF parsing quality must be verified on representative files before production enablement.

## Install the pinned CLI separately

Pin to the PdfCraft commit evaluated in [PDFCRAFT_EVALUATION.md](PDFCRAFT_EVALUATION.md)
(or record a newer tested commit and its binary SHA-256):

~~~shell
git clone https://github.com/storytold/pdfcraft.git
cd pdfcraft
git checkout bbbe60015c571ebfc39708ee07777b89e267122a
cargo build --release -p pdfcraft-cli --no-default-features
~~~

The executable will be at \`target/release/pdfcraft-cli\` (Windows:
\`target\release\pdfcraft-cli.exe\`). Treat it like any other executable with access
to local documents. Do not fetch unverified binaries at TPDF startup. The CLI must
be explicitly installed by the operator on the **same OS/architecture** as TPDF Server.

Set environment variables **on the TPDF Server process**, then restart it:

~~~powershell
$env:TPDF_PDFCRAFT_ENABLED="1"
$env:TPDF_PDFCRAFT_BIN="C:\tools\pdfcraft\pdfcraft-cli.exe"
npm run server-start
~~~

Linux/macOS:

~~~shell
export TPDF_PDFCRAFT_ENABLED=1
export TPDF_PDFCRAFT_BIN=/opt/pdfcraft/bin/pdfcraft-cli
npm run server-start
~~~

Default constraints (adjust only after benchmarking):

| Variable | Default | Meaning |
| --- | --- | --- |
| \`TPDF_PDFCRAFT_ENABLED\` | \`0\` | Off unless explicitly \`1\` |
| \`TPDF_PDFCRAFT_BIN\` | unset | Required absolute CLI binary path (no PATH/shell lookup) |
| \`TPDF_PDFCRAFT_MAX_BYTES\` | 32 MiB | Per-PDF copy size ceiling, clamped 1–256 MiB |
| \`TPDF_PDFCRAFT_TIMEOUT_MS\` | 45000 | Child-process time limit, clamped 5–120 seconds |
| \`TPDF_PDFCRAFT_MAX_OUTPUT_BYTES\` | 2 MiB | Bounded diagnostic JSON, clamped 0.5–8 MiB |
| \`TPDF_PDFCRAFT_CONCURRENCY\` | 1 | Max active jobs, clamped 1–2; overflow returns 429 |

No background queue, remote network connection, unrestricted MCP endpoint, auto-install,
PDF auto-fix, or incremental-write migration is introduced.

## Using the feature

Open a **stored server PDF**, navigate to **All Tools -> Document Health**, and click
**Analyze saved PDF**. The panel shows page metadata, accessibility findings,
preliminary PDF/A-2b issues, saved revision information (in JSON), and SHA-256 of
the examined copy. Edits not yet persisted to TPDF Server are **not included**.
If the feature is off or the CLI is unavailable, TPDF's viewer continues working.

For authenticated clients, the read-only endpoint is:

~~~text
GET /api/tpdf/documents/{documentId}/health
~~~

Documents are resolved with the **same tenant/project boundary** as other stored
documents; no request body, tool name, filesystem path or arbitrary script is accepted.
Error statuses: 401 unauthenticated (where auth is enabled), 404 wrong
user/project/document, 503 disabled/missing executable, 413 above size cap,
429 concurrency exhausted, 504 timeout, 422 unreadable PDF and 502 invalid output.

Only five fixed operations are executed on a private temporary snapshot:
\`doc_open\`, \`doc_info\`, \`doc_revisions\`, \`accessibility_check\`, \`pdfa_verify\`.
There is **no** \`doc_save\`, \`pdfa_convert\`, \`js_run\` or other document mutation.
Successful diagnostic results include a SHA-256 digest for exact-snapshot matching.
The temporary working directory is removed after the job.

## Security limitations

- \`--root\` constrains PdfCraft's tool file access; it is **not** an OS sandbox.
  Run the binary under a restricted OS account/job/container, with memory and disk
  resource ceilings and network deny rules appropriate to the deployment.
- Encrypted PDFs requiring passwords are not supported by this endpoint; do not
  put PDF passwords in shell arguments or request logs.
- Do not trust PDF/A results as a conformance certificate. Compare against
  veraPDF and independent viewers before claiming PDF/A-2b compliance.
- Document Health analyzes the stored, **not necessarily newest unsaved browser**
  version. Save it first and compare SHA-256 if reproducibility matters.
- Keep this feature disabled on public production until the actual CLI has been
  built, independently smoke-tested and benchmarked with local CAD PDF fixtures.
- This does not fix TPDF native PDF editing/performance [issue #151](https://github.com/ttha711/Tpdf/issues/151).

## Tests and acceptance

- Fast isolated Node tests: \`npm run test:cli\` (includes fake CLI behavior and limits).
- Tenant isolation smoke: \`node server/tpdf-server.auth.smoke.mjs\`.
- Start TPDF Server with feature disabled and confirm \`health.capabilities.documentHealth=false\`.
- Build real upstream CLI, run at least one ordinary PDF, one damaged PDF,
  Unicode Vietnamese text, one scanned PDF, and one real CAD drawing.
- Run the regression CAD corpus twice without retries (see
  [REAL_CAD_TEST_CORPUS.md](REAL_CAD_TEST_CORPUS.md)).
- Compare findings with PDFium/QPDF and an independent PDF/A validator. Collect
  peak RSS/elapsed time, text fidelity and crash/hang data **before** enabling
  larger file limits.

Rollback: set \`TPDF_PDFCRAFT_ENABLED=0\`, restart TPDF Server. No migration is required.

Licensing: upstream PdfCraft is MIT OR Apache-2.0, but its embedded dependencies
and branded assets have separate obligations. Do not copy ArtCraft marks.
