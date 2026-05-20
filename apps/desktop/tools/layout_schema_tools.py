from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import re


@dataclass
class Block:
    type: str
    level: int | None = None
    text: str | None = None
    items: list[str] | None = None
    rows: list[list[str]] | None = None
    spans: list[dict[str, Any]] | None = None


def normalize_text(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def sanitize_schema(schema: dict[str, Any]) -> list[Block]:
    blocks_raw = schema.get("blocks") if isinstance(schema, dict) else None
    if not isinstance(blocks_raw, list):
        return []

    blocks: list[Block] = []
    for b in blocks_raw:
        if not isinstance(b, dict):
            continue
        btype = normalize_text(str(b.get("type", "")).lower())
        if btype not in {"heading", "paragraph", "list", "table"}:
            continue

        if btype == "heading":
            text = normalize_text(str(b.get("text", "")))
            if not text:
                continue
            level = b.get("level")
            level = int(level) if isinstance(level, int) else 2
            level = 2 if level < 2 or level > 3 else level
            blocks.append(Block(type="heading", level=level, text=text))

        elif btype == "paragraph":
            text = normalize_text(str(b.get("text", "")))
            spans = b.get("spans")
            if isinstance(spans, list):
                cleaned_spans = []
                for s in spans:
                    if not isinstance(s, dict):
                        continue
                    st = normalize_text(str(s.get("text", "")))
                    if not st:
                        continue
                    cleaned_spans.append(
                        {
                            "text": st,
                            "bold": bool(s.get("bold", False)),
                            "italic": bool(s.get("italic", False)),
                            "underline": bool(s.get("underline", False)),
                        }
                    )
                if cleaned_spans:
                    blocks.append(Block(type="paragraph", text=text, spans=cleaned_spans))
                    continue
            if text:
                blocks.append(Block(type="paragraph", text=text))

        elif btype == "list":
            items = b.get("items")
            if isinstance(items, list):
                cleaned = [normalize_text(str(x)) for x in items if normalize_text(str(x))]
                if cleaned:
                    blocks.append(Block(type="list", items=cleaned))

        elif btype == "table":
            rows = b.get("rows")
            if isinstance(rows, list):
                cleaned_rows: list[list[str]] = []
                for row in rows:
                    if not isinstance(row, list):
                        continue
                    cols = [normalize_text(str(c)) for c in row if normalize_text(str(c))]
                    if cols:
                        cleaned_rows.append(cols)
                if cleaned_rows:
                    blocks.append(Block(type="table", rows=cleaned_rows))

    return blocks


def schema_to_html(schema: dict[str, Any], page_no: int) -> str:
    blocks = sanitize_schema(schema)
    html = [f"<h2>Page {page_no}</h2>"]
    for b in blocks:
        if b.type == "heading":
            html.append(f"<h{b.level}>{escape_html(b.text or '')}</h{b.level}>")
        elif b.type == "paragraph":
            if b.spans:
                html.append("<p>")
                for s in b.spans:
                    txt = escape_html(str(s.get("text", "")))
                    if s.get("bold"):
                        txt = f"<b>{txt}</b>"
                    if s.get("italic"):
                        txt = f"<i>{txt}</i>"
                    if s.get("underline"):
                        txt = f"<u>{txt}</u>"
                    html.append(txt)
                html.append("</p>")
            else:
                html.append(f"<p>{escape_html(b.text or '')}</p>")
        elif b.type == "list":
            html.append("<ul>")
            for item in b.items or []:
                html.append(f"<li>{escape_html(item)}</li>")
            html.append("</ul>")
        elif b.type == "table":
            html.append("<table>")
            for row in b.rows or []:
                html.append("<tr>" + "".join(f"<td>{escape_html(c)}</td>" for c in row) + "</tr>")
            html.append("</table>")
    return "\n".join(html)


def escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
