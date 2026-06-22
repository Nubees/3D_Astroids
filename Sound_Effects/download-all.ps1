# Sound Effects Download Script for 3D Astroids
# Run this in PowerShell from the project root or extract folder path

$ErrorActionPreference = "Stop"

# === Configuration ===
$BaseDir = "C:\projects\3d_astroids\Sound_Effects\downloaded"
$OrigDir = "$BaseDir\original-sfx"

# Ensure directories exist
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $OrigDir | Out-Null

Write-Host "=== Downloading Sound Effects for 3D Astroids ===" -ForegroundColor Cyan
Write-Host ""

# === 1. Kenney - Space Shooter Remastered (Primary Pick - CC0) ===
Write-Host "[1/4] Downloading Kenney Space Shooter Remastered..." -ForegroundColor Yellow
try {
    $out = "$BaseDir\kenney-space-shooter-remastered.zip"
    Invoke-WebRequest -Uri "https://kenney.nl/assets/space-shooter-remastered/download" `
        -OutFile $out -UseBasicParsing -TimeoutSec 60
    Expand-Archive -Path $out -Destination "$BaseDir\kenney-space-shooter-remastered" -Force
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    Write-Host "   OK — extracted to kenney-space-shooter-remastered/" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# === 2. Kenney - Sci-fi Sounds (CC0) ===
Write-Host "[2/4] Downloading Kenney Sci-fi Sounds..." -ForegroundColor Yellow
try {
    $out = "$BaseDir\kenney-scifi-sounds.zip"
    Invoke-WebRequest -Uri "https://kenney.nl/assets/sci-fi-sounds/download" `
        -OutFile $out -UseBasicParsing -TimeoutSec 60
    Expand-Archive -Path $out -Destination "$BaseDir\kenney-scifi-sounds" -Force
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    Write-Host "   OK — extracted to kenney-scifi-sounds/" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# === 3. Original Asteroids SFX - ClassicGaming.cc (Arcade cabinet recordings) ===
Write-Host "[3/4] Downloading original Asteroids SFX page from ClassicGaming..." -ForegroundColor Yellow
try {
    $out = "$OrigDir\classic-gaming.html"
    Invoke-WebRequest -Uri "http://www.classicgaming.cc/classics/asteroids/sounds" `
        -OutFile $out -UseBasicParsing -TimeoutSec 60
    Write-Host "   OK — saved to original-sfx/classic-gaming.html (open in browser to download individual clips)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
    Write-Host "   → Visit manually: http://www.classicgaming.cc/classics/asteroids/sounds" -ForegroundColor DarkYellow
}

# === 4. Original Asteroids SFX - 101Soundboards (User-submitted arcade recordings) ===
Write-Host "[4/4] Downloading original Asteroids SFX page from 101Soundboards..." -ForegroundColor Yellow
try {
    $out = "$OrigDir\101sb-board.html"
    Invoke-WebRequest -Uri "https://www.101soundboards.com/boards/10414-asteroids-sounds" `
        -OutFile $out -UseBasicParsing -TimeoutSec 60
    Write-Host "   OK — saved to original-sfx/101sb-board.html (open in browser to download individual MP3s)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
    Write-Host "   → Visit manually: https://www.101soundboards.com/boards/10414-asteroids-sounds" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "=== Download Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  Kenney packs: $BaseDir\kenney-* (CC0 public domain, safe for commercial use)" -ForegroundColor Gray
Write-Host "  Original SFX page: $OrigDir\" -ForegroundColor Gray
Write-Host "    → Open .html files in browser to access individual sound recordings" -ForegroundColor DarkGray
Write-Host ""
