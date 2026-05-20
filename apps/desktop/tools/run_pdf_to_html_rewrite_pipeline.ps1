$ErrorActionPreference = 'Stop'

$Py = Join-Path $PSScriptRoot 'python\runtime\python.exe'
if (-not (Test-Path -LiteralPath $Py)) {
  throw "Python runtime not found: $Py"
}

$Pdf = 'C:\Users\ttha\Downloads\pdf mock.pdf'
$OutDocx = Join-Path $PSScriptRoot '.tmp-html-3p.docx'
$OutJson = Join-Path $PSScriptRoot '.tmp-html-3p.json'

& $Py (Join-Path $PSScriptRoot 'pdf_to_html_rewrite_pipeline.py') $Pdf --max-pages 3 --out-docx $OutDocx --out-json $OutJson
