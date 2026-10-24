param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { throw 'Run setup.ps1 first.' }
if (-not (Test-Path -LiteralPath 'dist\index.html')) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
$url = "http://127.0.0.1:$Port/"
try {
    $existing = Invoke-RestMethod -Uri ($url + 'api/health') -TimeoutSec 1
    if ($existing.mode -eq 'local') {
        Write-Host "ECG Workbench already running: $url"
        if (-not $NoBrowser) { Start-Process $url }
        return
    }
} catch { }
New-Item -ItemType Directory -Path '.cache\tmp' -Force | Out-Null
$env:TEMP = Join-Path $PSScriptRoot '.cache\tmp'
$env:TMP = $env:TEMP
$server = Start-Process -FilePath (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -ArgumentList @('-m','uvicorn','backend.app:app','--host','127.0.0.1','--port',"$Port") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot '.cache\server.log') -RedirectStandardError (Join-Path $PSScriptRoot '.cache\server-error.log')
try {
    $ready = $false
    for ($i=0; $i -lt 25; $i++) {
        if ($server.HasExited) { throw 'Server failed to start. Read .cache/server-error.log.' }
        try {
            $health = Invoke-RestMethod -Uri ($url + 'api/health') -TimeoutSec 1
            if ($health.mode -eq 'local') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 400
    }
    if (-not $ready) { throw 'Server did not become ready.' }
    Write-Host "ECG Workbench: $url" -ForegroundColor Green
    Write-Host 'Keep this window open. Press Ctrl+C to stop.'
    if (-not $NoBrowser) { Start-Process $url }
    Wait-Process -Id $server.Id
} finally {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id }
}
