import sys
from pathlib import Path

if len(sys.argv) < 4:
    raise SystemExit(2)

input_path = Path(sys.argv[1])
fmt = sys.argv[2].lower()
output_path = Path(sys.argv[3])

if not input_path.read_bytes().startswith(b"%PDF-"):
    raise SystemExit(3)
if fmt not in {"docx", "pptx", "xlsx"}:
    raise SystemExit(4)

output_path.write_bytes(("OPDF-OFFICE-STUB:" + fmt).encode("ascii"))
