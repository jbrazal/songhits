$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { Join-Path $env:USERPROFILE '.jdks\jdk-21' }
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (!(Test-Path -LiteralPath (Join-Path $jdk 'bin\java.exe'))) { throw 'Set JAVA_HOME to a Java 21 JDK.' }
if (!(Test-Path -LiteralPath (Join-Path $sdk 'platforms\android-35'))) { throw 'Install Android SDK platform 35 and set ANDROID_HOME.' }
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
"sdk.dir=$($sdk.Replace('\','/'))" | Set-Content -LiteralPath android/local.properties -Encoding ascii

& npm.cmd run site:build -- --output=android/app/src/main/assets/songhits
if ($LASTEXITCODE) { throw 'Offline site build failed.' }

$cachedGradleRoot = Join-Path $env:USERPROFILE '.gradle\wrapper\dists\gradle-8.14.3-all'
$cachedGradle = if (Test-Path -LiteralPath $cachedGradleRoot) {
    Get-ChildItem -LiteralPath $cachedGradleRoot -Recurse -Filter gradle.bat -File |
        Where-Object { $_.FullName -match 'gradle-8\.14\.3\\bin\\gradle\.bat$' } |
        Select-Object -First 1
}
if ($cachedGradle) {
    & $cachedGradle.FullName -p android :app:assembleDebug --console=plain --no-daemon
} else {
    Push-Location android
    try { & .\gradlew.bat :app:assembleDebug --console=plain --no-daemon }
    finally { Pop-Location }
}
if ($LASTEXITCODE) { throw 'Android build failed.' }

$output = Join-Path $projectRoot 'ChatGPT\apk'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$apk = Join-Path $output 'songhits-0.1.0-debug.apk'
Copy-Item -LiteralPath android/app/build/outputs/apk/debug/app-debug.apk -Destination $apk
$stream = [System.IO.File]::OpenRead($apk)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try { $hash = -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) }
finally { $stream.Dispose(); $sha256.Dispose() }
"$hash  songhits-0.1.0-debug.apk" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
Write-Output "APK: $apk"
