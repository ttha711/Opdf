param(
    [string]$InputPdf,
    [string]$Format,
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

try {
    if ($Format -eq "docx") {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0 # wdAlertsNone

        # Open the PDF. Word handles the PDF to Word Reflow automatically.
        $doc = $word.Documents.Open($InputPdf, $false, $true)
        
        # Save as DOCX (wdFormatDocumentDefault = 16)
        $doc.SaveAs([ref]$OutputPath, [ref]16)
        $doc.Close([ref]0) # wdDoNotSaveChanges = 0
        $word.Quit()
        
        $result = @{
            ok = $true
            output = $OutputPath
        }
        $result | ConvertTo-Json -Compress | Write-Output
    } else {
        # Other formats aren't natively supported by Office PDF reflow
        throw "Unsupported format for MS Office COM conversion: $Format"
    }
} catch {
    $result = @{
        ok = $false
        error = $_.Exception.Message
    }
    $result | ConvertTo-Json -Compress | Write-Output
    exit 1
}
