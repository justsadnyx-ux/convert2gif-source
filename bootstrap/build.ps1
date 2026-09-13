param([string]$Version = '1.2.0')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
if (-not (Test-Path $bun)) { throw 'bun not found at ' + $bun }

New-Item -ItemType Directory -Path $dist -Force | Out-Null

Write-Host '==> Compiling terminal bootstrapper exe (bun)...'
& $bun build --compile --minify --outfile (Join-Path $dist 'Convert2GIF.exe') (Join-Path $root 'bootstrap\launcher.js')
if (-not (Test-Path (Join-Path $dist 'Convert2GIF.exe'))) { throw 'exe build failed' }

Write-Host '==> Zipping app package (no node_modules)...'
Push-Location (Join-Path $root 'app')
& tar -a -c -f (Join-Path $dist "convert2gif-app-$Version.zip") --exclude node_modules .
Pop-Location

Write-Host '==> Building portable bundle...'
$stg = Join-Path $dist 'portable\Convert2GIF'
if (Test-Path $stg) { Remove-Item -Recurse -Force $stg }
New-Item -ItemType Directory -Path $stg -Force | Out-Null
Copy-Item (Join-Path $dist 'Convert2GIF.exe') $stg
Copy-Item (Join-Path $root 'app') (Join-Path $stg 'app') -Recurse
Remove-Item -Recurse -Force (Join-Path $stg 'app\node_modules') -ErrorAction SilentlyContinue
$readme = @'
Convert2GIF v1.2.0 - portable terminal bootstrapper
====================================================

A single exe that hosts the Convert2GIF Discord bot. Everything is portable:
put this folder anywhere (USB stick fine), everything is stored under data/.

Run
  Double-click Convert2GIF.exe. The first run:
    1. checks for Node.js 22+ (offers to install via winget),
    2. installs the bot's npm dependencies into app\,
    3. asks you for your Discord bot token + Application ID.

Commands after it is running
  /gif  - attach/url an image, get a real static GIF file
  /help - list all commands
  /presence /restart /update /stats /info /uptime (owner/Admin ones work too)

Terminal keys
  [B] start bot   [X] stop   [R] restart   [P] presence   [C] check updates
  [U] update      [Q] quit

Self-management
  app is updated from the GitHub release (auto via /update or [U]).
  If the bot crashes it is restarted; broken deps are re-installed.
  data\config.json  -> { "token": "...", "clientId": "..." }
  data\control.json -> presence / stop / request.restart / request.update
  data\logs\        -> engine.log + bot activity
'@
$envBody = Join-Path $stg 'README.txt'
Set-Content -Path $envBody -Value $readme -Encoding ASCII
& tar -a -c -f (Join-Path $dist "Convert2GIF-v$Version-portable.zip") -C (Join-Path $dist 'portable') Convert2GIF

Write-Host '==> Hashing...'
$hashFile = Join-Path $dist 'SHA256SUMS.txt'
$hashes = Get-ChildItem $dist -Filter '*.zip' | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower() + '  ' + $_.Name }
$hashes += (Get-FileHash (Join-Path $dist 'Convert2GIF.exe') -Algorithm SHA256).Hash.ToLower() + '  Convert2GIF.exe'
$hashes | Set-Content -Path $hashFile -Encoding ASCII

Write-Host ''
Write-Host 'Built:'
Get-ChildItem $dist | Where-Object { -not $_.PSIsContainer } | ForEach-Object { Write-Host ('  ' + $_.Name + '  ' + [math]::Round($_.Length / 1MB, 1) + ' MB') }
Write-Host ('  hash file  ' + $hashFile)