#Requires -Version 5.1
<#
.SYNOPSIS
  Clean packaged Android rebuild for Capacitor (no live reload).

.DESCRIPTION
  1. Resolves JAVA_HOME (existing env, or Android Studio bundled JBR on Windows).
  2. npm run build → npx cap sync android → gradlew clean.

  IMPORTANT — Before installing the new APK you MUST uninstall the previous app from the
  device/emulator (Settings → Apps → RebuildApp → Uninstall, or `adb uninstall com.example.rebuildapp`).
  Stale WebView / plugin state often survives incremental installs and skews bridge hydration tests.

.PARAMETER Run
  If set, runs `npx cap run android` after the clean rebuild (packaged install only).

.EXAMPLE
  .\scripts\android-packaged-rebuild.ps1
  .\scripts\android-packaged-rebuild.ps1 -Run

.NOTES
  Capacitor 8 / AGP 8.x / Gradle 8.14.x expect JDK 17+ (this template uses Java 21 from Android Studio JBR).
#>
param(
    [switch]$Run
)

$ErrorActionPreference = 'Stop'

function Find-AndroidStudioJbr {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
        (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr')
        (Join-Path ${env:ProgramFiles(x86)} 'Android\Android Studio\jbr')
        (Join-Path $env:LOCALAPPDATA 'Android Studio\jbr')
    )
    foreach ($root in $candidates) {
        $javaExe = Join-Path $root 'bin\java.exe'
        if (Test-Path -LiteralPath $javaExe) {
            return $root
        }
    }
    $toolboxRoot = Join-Path $env:LOCALAPPDATA 'JetBrains\Toolbox\apps\AndroidStudio'
    if (Test-Path -LiteralPath $toolboxRoot) {
        Get-ChildItem -LiteralPath $toolboxRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $jbr = Join-Path $_.FullName 'jbr'
            $javaExe = Join-Path $jbr 'bin\java.exe'
            if (Test-Path -LiteralPath $javaExe) {
                return $jbr
            }
        }
    }
    return $null
}

function Ensure-JavaHome {
    $existing = $env:JAVA_HOME
    if ($existing -and (Test-Path -LiteralPath (Join-Path $existing 'bin\java.exe'))) {
        Write-Host "[java] Using JAVA_HOME from environment: $existing"
        return
    }
    $jbr = Find-AndroidStudioJbr
    if (-not $jbr) {
        Write-Host ''
        Write-Host 'ERROR: No JDK found. Set JAVA_HOME to a JDK 17+ install (Android Studio: Settings → Build → Gradle uses embedded JDK; copy that path), or install Temurin 21.' -ForegroundColor Red
        Write-Host 'Typical Android Studio JBR: %LOCALAPPDATA%\Programs\Android Studio\jbr' -ForegroundColor Yellow
        exit 1
    }
    $env:JAVA_HOME = $jbr
    $env:PATH = "$(Join-Path $jbr 'bin');$env:PATH"
    Write-Host "[java] Auto-set JAVA_HOME from Android Studio JBR: $jbr"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $repoRoot

Ensure-JavaHome

Write-Host ''
Write-Host '=== JAVA_HOME ===' -ForegroundColor Cyan
Write-Host $env:JAVA_HOME
Write-Host ''
Write-Host '=== java -version ===' -ForegroundColor Cyan
# java -version prints to stderr; with $ErrorActionPreference = 'Stop' that must not abort the script.
$prevEa = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & (Join-Path $env:JAVA_HOME 'bin\java.exe') '-version' 2>&1 | ForEach-Object { Write-Host $_ }
} finally {
    $ErrorActionPreference = $prevEa
}
Write-Host ''

Write-Host @'

================================================================================
 UNINSTALL PREVIOUS APP BEFORE INSTALLING A NEW APK (required for clean bridge tests)
================================================================================
  Emulator/device: Settings -> Apps -> RebuildApp -> Uninstall
  Or (package id from capacitor.config): adb uninstall com.example.rebuildapp
  Then wait for install from this script or: npx cap run android
================================================================================

'@ -ForegroundColor Yellow

Write-Host '=== npm run build ===' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '=== npx cap sync android ===' -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '=== gradlew clean ===' -ForegroundColor Cyan
Push-Location -LiteralPath (Join-Path $repoRoot 'android')
try {
    & .\gradlew.bat clean --no-daemon
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Clean rebuild finished. After uninstalling the old app, install with:' -ForegroundColor Green
Write-Host '  npx cap run android' -ForegroundColor White
Write-Host ''
Write-Host 'After launch, wait 10-15 seconds before NFC tests so Capacitor bridge + plugin hydration can finish.' -ForegroundColor Yellow

if ($Run) {
    Write-Host ''
    Write-Host '=== npx cap run android (-Run) ===' -ForegroundColor Cyan
    npx cap run android
    exit $LASTEXITCODE
}
