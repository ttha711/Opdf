# PageIndex on Tpdf Server

PageIndex is an opt-in **server-side** feature, not an Electron integration. Local index mode stores document indexes on the server but **still requires an LLM provider API key**.

## Windows Server setup (no Docker)

```powershell
py -3.11 -m pip install -r server\requirements-pageindex.txt
$env:TPDF_PAGEINDEX_ENABLED="1"
$env:TPDF_PAGEINDEX_INDEX_MODEL="gpt-4.1-mini"
$env:TPDF_PAGEINDEX_CHAT_MODEL="gpt-4.1-mini"
$env:OPENAI_API_KEY="your-provider-key"
npm run server-start
```

Optionally configure `TPDF_PYTHON_PATH`, `TPDF_PAGEINDEX_CONCURRENCY` (default 1), `TPDF_PAGEINDEX_MAX_QUEUED` (default 32), and `TPDF_PAGEINDEX_AUTO_INDEX=1`. Max indexing timeout defaults to 30 minutes and chat timeout to 3 minutes.

## Authenticated endpoints

- `POST /api/tpdf/ai/index` with `{ "documentId": "uuid" }` starts indexing (or reuses an up-to-date index).
- `GET /api/tpdf/ai/index/:documentId` polls for `queued`, `running`, `completed`, `failed`, `stale`, or `interrupted`.
- `POST /api/tpdf/ai/ask` with `{ "documentId": "uuid", "query": "..." }` asks a question.
- `POST /api/tpdf/ai/search` with the same body searches relevant passages.
- `POST /api/tpdf/ai/summarize` summarizes a document, optionally with a focus query.
- `GET /api/tpdf/ai/outline/:documentId` returns heading tree.

All endpoints use Tpdf Server's existing session and project isolation. Client-provided file paths are never accepted. Stored PDFs are indexed only after upload completion. Indexes are invalidated when the PDF changes.

## Limitations

This is a server API foundation, not a new web chat interface. PageIndex local mode supports text PDFs; OCR of scanned drawings must be done through existing Tpdf OCR before indexing. The response includes PageIndex's cited page references as text but structured citation objects are not yet mapped. PageIndex index artifacts are stored on the local filesystem, including when Tpdf PDF storage uses S3; shared multi-node deployment needs shared index storage or request affinity.
