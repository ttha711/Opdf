import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import pdfplumber
from docx import Document


def normalize_text(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def extract_blocks(pdf_path: Path):
    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(layout=True) or ""
            raw_lines = [normalize_text(ln) for ln in text.splitlines()]
            lines = [ln for ln in raw_lines if ln]
            pages.append({"page": idx, "lines": lines})
    return pages


def heuristic_rewrite_line(line: str, strict: bool) -> str:
    if strict:
        line = re.sub(r"\s*\[\d+\]", "", line)
        line = re.sub(r"\s{2,}", " ", line)
        return line.strip()
    line = re.sub(r"(?<=[A-Za-z])(?=[A-Z][a-z])", " ", line)
    line = re.sub(r"\s*\[\d+\]", "", line)
    line = re.sub(r"\s{2,}", " ", line)
    return line.strip()


def call_dify_rewrite(lines, strict: bool):
    dify_url = os.environ.get("OPDF_DIFY_URL", "").strip().rstrip("/")
    dify_key = os.environ.get("OPDF_DIFY_KEY", "").strip()
    ai_mode = os.environ.get("OPDF_AI_MODE", "local").strip().lower()
    if ai_mode != "dify" or not dify_url or not dify_key:
        return None

    prompt_payload = {
        "task": "ocr_rewrite",
        "strict": strict,
        "return_format": {"lines": "string[]", "same_length_as_input": True},
        "rules": [
            "Keep factual meaning exactly.",
            "Do not invent or summarize.",
            "Fix OCR typos, spacing, broken words.",
            "Return JSON object only: {\"lines\": [...]}"
        ],
        "lines": lines,
    }

    req = urllib.request.Request(
        f"{dify_url}/chat-messages",
        data=json.dumps(
            {
                "inputs": {},
                "query": json.dumps(prompt_payload, ensure_ascii=False),
                "response_mode": "blocking",
                "user": "opdf-desktop-converter",
            }
        ).encode("utf-8"),
        headers={"Authorization": f"Bearer {dify_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    answer = (body.get("answer") or "").strip()
    if not answer:
        return None

    try:
        parsed = json.loads(answer)
        rewritten = parsed.get("lines") if isinstance(parsed, dict) else None
        if isinstance(rewritten, list) and len(rewritten) == len(lines):
            return [str(x).strip() for x in rewritten]
    except Exception:
        pass
    return None


def call_openai_rewrite(lines, strict: bool):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.environ.get("OPDF_REWRITE_MODEL", "gpt-4.1-mini")
    system = (
        "You clean OCR text from PDFs. Preserve facts exactly. Do not add new facts. "
        "Keep original language. Return JSON array of strings with same length as input."
    )
    user = {
        "strict": strict,
        "instructions": "Fix OCR typos, spacing, broken words. Keep meaning and factual content unchanged.",
        "lines": lines,
    }

    payload = {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system}]},
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(user, ensure_ascii=False)}]},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "rewritten_lines",
                "schema": {
                    "type": "object",
                    "properties": {"lines": {"type": "array", "items": {"type": "string"}}},
                    "required": ["lines"],
                    "additionalProperties": False,
                },
            }
        },
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    out_text = body.get("output_text", "")
    if not out_text:
        return None

    parsed = json.loads(out_text)
    rewritten = parsed.get("lines") if isinstance(parsed, dict) else None
    if not isinstance(rewritten, list) or len(rewritten) != len(lines):
        return None
    return [str(x).strip() for x in rewritten]


def rewrite_blocks(pages, mode: str):
    strict = mode == "strict-factual"
    out = []
    rewrite_source = "local"

    for page in pages:
        base_lines = [heuristic_rewrite_line(ln, strict) for ln in page["lines"]]
        base_lines = [ln for ln in base_lines if ln]
        rewritten = None

        if base_lines:
            try:
                rewritten = call_dify_rewrite(base_lines, strict)
                if rewritten:
                    rewrite_source = "dify"
            except Exception:
                rewritten = None

        if not rewritten and base_lines:
            try:
                rewritten = call_openai_rewrite(base_lines, strict)
                if rewritten and rewrite_source != "dify":
                    rewrite_source = "openai"
            except Exception:
                rewritten = None

        final_lines = rewritten if rewritten else base_lines
        out.append({"page": page["page"], "lines": final_lines})

    used_llm = rewrite_source in {"dify", "openai"}
    return out, used_llm, rewrite_source


def compose_docx(pages, out_path: Path, source_name: str):
    doc = Document()
    doc.add_heading(f"Rewritten from PDF: {source_name}", level=1)
    for page in pages:
        if page["page"] > 1:
            doc.add_page_break()
        doc.add_heading(f"Page {page['page']}", level=2)
        buf = []

        def flush_buf():
            nonlocal buf
            if buf:
                doc.add_paragraph(" ".join(buf))
            buf = []

        for line in page["lines"]:
            if len(line) <= 90 and line[:1].isupper() and (line.endswith(":") or line.isupper()):
                flush_buf()
                doc.add_heading(line.rstrip(":"), level=3)
                continue
            if line.startswith(("- ", "* ")):
                flush_buf()
                p = doc.add_paragraph(line[2:].strip())
                p.style = "List Bullet"
                continue
            buf.append(line)
            if len(buf) >= 3:
                flush_buf()
        flush_buf()
    doc.save(str(out_path))


def resolve_soffice():
    explicit = os.environ.get("OPDF_SOFFICE_PATH", "").strip()
    if explicit and Path(explicit).exists():
        return explicit
    which = shutil.which("soffice")
    if which:
        return which
    candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    raise FileNotFoundError("LibreOffice soffice.exe not found. Set OPDF_SOFFICE_PATH.")


def export_pdf_via_libreoffice(docx_path: Path, out_pdf: Path):
    soffice = resolve_soffice()
    out_dir = out_pdf.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(docx_path)]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"ok": False, "error": "Usage: script <input.pdf> <format> <output> [mode]"}))
        sys.exit(2)

    in_path = Path(sys.argv[1]).resolve()
    fmt = sys.argv[2].lower()
    out_path = Path(sys.argv[3]).resolve()
    mode = (sys.argv[4] if len(sys.argv) > 4 else os.environ.get("OPDF_REWRITE_MODE", "strict-factual")).lower()
    if mode not in ["ai-rewrite", "strict-factual"]:
        mode = "strict-factual"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        if fmt != "docx":
            raise ValueError("This pipeline currently supports docx only.")

        pages = extract_blocks(in_path)
        pages, used_llm, rewrite_source = rewrite_blocks(pages, mode)
        compose_docx(pages, out_path, in_path.name)

        pdf_out = out_path.with_suffix(".pdf")
        libre_pdf = {"ok": False, "path": str(pdf_out), "error": "skipped"}
        try:
            export_pdf_via_libreoffice(out_path, pdf_out)
            libre_pdf = {"ok": True, "path": str(pdf_out)}
        except Exception as exc:
            libre_pdf = {"ok": False, "path": str(pdf_out), "error": str(exc)}

        print(
            json.dumps(
                {
                    "ok": True,
                    "output": str(out_path),
                    "mode": mode,
                    "used_llm": used_llm,
                    "rewrite_source": rewrite_source,
                    "libreoffice_pdf": libre_pdf,
                }
            )
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
