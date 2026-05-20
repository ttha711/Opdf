from __future__ import annotations

from dataclasses import dataclass
from docx.text.paragraph import Paragraph


@dataclass
class SpanStyle:
    bold: bool = False
    italic: bool = False
    underline: bool = False


def add_styled_text(paragraph: Paragraph, text: str, style: SpanStyle) -> None:
    if not text:
        return
    run = paragraph.add_run(text)
    run.bold = style.bold
    run.italic = style.italic
    run.underline = style.underline
