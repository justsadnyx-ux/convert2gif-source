param([string]$Version = '1.0.0')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
if (-not (Test-Path $bun)) { throw 'bun not found at ' + $bun }

New-Item -ItemType Directory -Path $dist -Force | Out-Null

Write-Host '==> Embedding app into bootstrapper...'
$emb = Join-Path $PSScriptRoot 'embedded-app.js'
& node (Join-Path $PSScriptRoot 'gen-embed.mjs') $root $emb
if (-not (Test-Path $emb)) { throw 'embedded app generation failed' }

Write-Host '==> Compiling single-file bootstrapper exe (bun)...'
& $bun build --compile --minify `
  --outfile (Join-Path $dist 'Convert2GIF.exe') `
  --windows-publisher 'Convert2GIF' `
  --windows-title 'Convert2GIF' `
  --windows-version "$Version.0" `
  --windows-description 'Convert2GIF - single-file terminal bootstrapper' `
  --windows-copyright 'Convert2GIF' `
  (Join-Path $root 'bootstrap\launcher.js')
if (-not (Test-Path (Join-Path $dist 'Convert2GIF.exe'))) { throw 'exe build failed' }

Write-Host '==> Hashing...'
$hashFile = Join-Path $dist 'SHA256SUMS.txt'
$h = (Get-FileHash (Join-Path $dist 'Convert2GIF.exe') -Algorithm SHA256).Hash.ToLower() + '  Convert2GIF.exe'
$h | Set-Content -Path $hashFile -Encoding ASCII

Write-Host ''
Write-Host 'Built:'
Get-ChildItem $dist | Where-Object { -not $_.PSIsContainer } | ForEach-Object { Write-Host ('  ' + $_.Name + '  ' + [math]::Round($_.Length / 1MB, 1) + ' MB') }
Write-Host ('  hash file  ' + $hashFile)