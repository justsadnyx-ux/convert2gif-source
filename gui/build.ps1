# Builds the Windows desktop bootstrapper pair.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File gui/build.ps1
# Output: dist/Convert2GIF-Bootstrap.zip  (GUI + c2g-host.exe)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Out = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force -Path $Out | Out-Null

# 1) host engine (bun launcher) -> c2g-host.exe
Write-Host 'Building c2g-host.exe (bun)...'
& bun.cmd build --compile --minify (Join-Path $Root 'bootstrap/launcher.js') --outfile (Join-Path $Out 'c2g-host.exe')
if ($LASTEXITCODE -ne 0) { throw 'bun build failed' }

# 2) desktop GUI -> Convert2GIF-Bootstrap.exe
Write-Host 'Compiling Convert2GIF-Bootstrap.exe (C# WinForms)...'
$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$guiExe = Join-Path $Out 'Convert2GIF-Bootstrap.exe'
$refFF = "$fw\System.Windows.Forms.dll"; $refD = "$fw\System.Drawing.dll"; $refS = "$fw\System.dll"
$srcCs = Join-Path $Root 'gui/MainForm.cs'
& "$fw\csc.exe" /nologo /target:winexe /out:$guiExe /r:$refFF /r:$refD /r:$refS $srcCs
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }

# 3) app package zip (the bot source the host installs into %APPDATA%)
Write-Host 'Zipping app package...'
$appZip = Join-Path $Out 'convert2gif-app.zip'
Compress-Archive -Path (Join-Path $Root 'app/*') -DestinationPath $appZip -Force

# 4) pair them into a single portable zip
$pair = Join-Path $Out 'Convert2GIF-Bootstrap.zip'
if (Test-Path $pair) { Remove-Item $pair -Force }
Compress-Archive -Path (Join-Path $Out 'Convert2GIF-Bootstrap.exe'), (Join-Path $Out 'c2g-host.exe') -DestinationPath $pair -Force
Remove-Item (Join-Path $Out 'c2g-host.exe') -Force
Remove-Item (Join-Path $Out 'Convert2GIF-Bootstrap.exe') -Force

Write-Host "Done: $pair  ($((Get-Item $pair).Length / 1MB) MB) and $appZip"