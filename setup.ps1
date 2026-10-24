param([string]$Python = "python")
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Path '.cache\tmp' -Force | Out-Null
$env:TEMP = Join-Path $PSScriptRoot '.cache\tmp'
$env:TMP = $env:TEMP
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    & $Python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment. Use Python 3.12 or later.' }
}
& '.\.venv\Scripts\python.exe' -m pip install -r requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
& npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
Write-Host 'Ready. Run .\start.ps1 to open ECG Workbench.' -ForegroundColor Green
