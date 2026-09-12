# Convert2GIF Mobile (BETA) APK builder — no gradle needed.
# Requires: Android SDK build-tools 34.0.0 + platform android-34, JDK 17.
$ErrorActionPreference = 'Stop'
$SDK  = $env:LOCALAPPDATA + '\Android\Sdk'
$BT   = "$SDK\build-tools\34.0.0"
$PLAT = "$SDK\platforms\android-34\android.jar"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUT  = "$ROOT\out"
$APK  = "$ROOT\Convert2GIF-Mobile-BETA.apk"

foreach ($d in @('obj','dex','assets','staged')) { New-Item -ItemType Directory -Path "$OUT\$d" -Force | Out-Null }

Write-Host '[1/5] linking resources + manifest (aapt2)...'
& "$BT\aapt2.exe" link --manifest "$ROOT\AndroidManifest.xml" -I $PLAT -o "$OUT\staged\base.apk" --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '[2/5] compiling java (javac)...'
& javac -source 8 -target 8 -encoding UTF-8 -classpath $PLAT -d "$OUT\obj" "$ROOT\src\com\convert2gif\boot\MainActivity.java"
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host '[3/5] dexing (d8)...'
$classFiles = Get-ChildItem -Recurse "$OUT\obj" -Filter *.class | Select-Object -ExpandProperty FullName
Push-Location "$OUT\dex"
& "$BT\d8.bat" --release --lib $PLAT --min-api 21 --output . $classFiles
Pop-Location
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '[4/5] assembling apk (dex + assets)...'
Copy-Item "$OUT\staged\base.apk" "$OUT\staged\convert2gif.apk" -Force
Copy-Item "$ROOT\assets\setup.html" "$OUT\assets\setup.html" -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$OUT\staged\convert2gif.apk", 'Update')
try {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$OUT\dex\classes.dex", 'classes.dex') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$OUT\assets\setup.html", 'assets/setup.html') | Out-Null
} finally { $zip.Dispose() }

& "$BT\zipalign.exe" -f 4 "$OUT\staged\convert2gif.apk" "$OUT\convert2gif.aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

Write-Host '[5/5] signing...'
$ks = "$OUT\c2g.keystore"
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -keystore $ks -storepass convert2gif -alias c2g -dname "CN=Convert2GIF Beta, O=Convert2GIF, C=ZA" -keyalg RSA -keysize 2048 -validity 10950 -noprompt
}
& "$BT\apksigner.bat" sign --ks $ks --ks-pass pass:convert2gif --out $APK "$OUT\convert2gif.aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

& "$BT\apksigner.bat" verify --print-certs $APK
$size = (Get-Item $APK).Length
Write-Host "APK OK: $APK ($size bytes)"