"""Persistent bounded native PDF tile renderer for OPDF Server.

Protocol: one JSON command per stdin line, one JSON response per stdout line.
Only the authenticated Node server supplies absolute paths; never expose this worker.
"""
import base64
import io
import json
import sys

try:
    import fitz
    from PIL import Image
except ImportError as exc:
    sys.stdout.write(json.dumps({"error": "Install PyMuPDF and Pillow: " + str(exc)}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

document = None
document_path = None


def process(command):
    global document, document_path
    path = command["path"]
    if path != document_path:
        if document is not None:
            document.close()
        document = fitz.open(path)
        document_path = path
    if document.needs_pass:
        raise ValueError("Password-protected documents cannot be remotely rendered.")

    kind = command["kind"]
    if kind == "meta":
        pages = []
        for page in document:
            rect = page.rect
            pages.append({"width": round(rect.width, 3), "height": round(rect.height, 3)})
        return {"kind": "meta", "pages": pages, "pageCount": len(pages)}

    index = command["page"]
    if not isinstance(index, int) or index < 0 or index >= len(document):
        raise ValueError("Page is out of range.")
    page = document[index]
    if kind == "text":
        return {"kind": "text", "text": page.get_text("text")[:100000]}
    if kind != "tile":
        raise ValueError("Unknown render command.")

    level = command["level"]
    x, y = command["x"], command["y"]
    if level not in (0.25, 0.5, 1, 2, 4, 8):
        raise ValueError("Unsupported render level.")
    if not all(isinstance(v, int) and 0 <= v <= 10000 for v in (x, y)):
        raise ValueError("Tile index is invalid.")

    page_rect = page.rect
    tile_rect = fitz.Rect(x * 512 / level, y * 512 / level,
                          (x + 1) * 512 / level, (y + 1) * 512 / level)
    clip = tile_rect & page_rect
    if clip.is_empty:
        raise ValueError("Tile is outside the page.")
    # Clip before rendering: never allocate an A0 bitmap at the requested zoom.
    pix = page.get_pixmap(matrix=fitz.Matrix(level, level),
                          clip=clip, colorspace=fitz.csRGB, alpha=False)
    if pix.width > 514 or pix.height > 514:
        raise ValueError("Tile exceeds memory budget.")
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=88, method=4)
    return {"kind": "tile", "mime": "image/webp",
            "width": pix.width, "height": pix.height,
            "base64": base64.b64encode(output.getvalue()).decode("ascii")}


for line in sys.stdin:
    try:
        command = json.loads(line)
        result = process(command)
    except Exception as exc:
        result = {"error": str(exc)[:500]}
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")
    sys.stdout.flush()
