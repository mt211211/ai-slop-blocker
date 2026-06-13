$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw (Join-Path $root "extension\manifest.json") | ConvertFrom-Json
$outputDir = Join-Path $root "outputs"
$outputFile = Join-Path $outputDir "ai-slop-blocker-v$($manifest.version).zip"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path $outputFile) {
  Remove-Item -LiteralPath $outputFile
}

Compress-Archive -Path (Join-Path $root "extension\*") -DestinationPath $outputFile -CompressionLevel Optimal
Write-Output "Created $outputFile"

