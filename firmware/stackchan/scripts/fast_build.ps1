# Obake 増分ビルド（fullclean / reconfigure しない）
# 使い方:
#   powershell -ExecutionPolicy Bypass -File scripts\fast_build.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\fast_build.ps1 -Flash
#   powershell -ExecutionPolicy Bypass -File scripts\fast_build.ps1 -Flash -Monitor
#
# 注意:
# - idf.py fullclean / reconfigure / sdkconfig の大規模変更は 2000+ ステップの再コンパイルになる
# - assets / partitions / 依存コンポーネント触りも再ビルドが重い
param(
    [switch]$Flash,
    [switch]$Monitor,
    [string]$Port = "COM3",
    [int]$Jobs = 0
)

$ErrorActionPreference = "Stop"
$FirmwareRoot = Join-Path $PSScriptRoot "..\firmware" | Resolve-Path

# --- 並列度: 16 論理コア / 15GB RAM 想定。過負荷を避けて既定 8 ---
if ($Jobs -le 0) {
    $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
    if (-not $cpu) { $cpu = 8 }
    $Jobs = [Math]::Max(2, [Math]::Min(8, [int]($cpu * 0.5)))
}

# --- ccache（Espressif 同梱）---
$ccache = "C:\Espressif\tools\ccache\4.12.1\ccache-4.12.1-windows-x86_64\ccache.exe"
if (Test-Path $ccache) {
    $env:IDF_CCACHE_ENABLE = "1"
    $env:CCACHE_DIR = Join-Path $env:USERPROFILE ".ccache-obake"
    New-Item -ItemType Directory -Force -Path $env:CCACHE_DIR | Out-Null
    $ccacheDir = Split-Path $ccache -Parent
    if ($env:PATH -notlike "*$ccacheDir*") {
        $env:PATH = "$ccacheDir;$env:PATH"
    }
    Write-Host "[fast_build] ccache ON  dir=$($env:CCACHE_DIR)  jobs=$Jobs"
} else {
    $env:IDF_CCACHE_ENABLE = "0"
    Write-Host "[fast_build] ccache not found — building without cache  jobs=$Jobs"
}

$env:IDF_TOOLS_PATH = "C:\Espressif\tools"
. "C:\Espressif\tools\Microsoft.v5.5.4.PowerShell_profile.ps1"
$env:PYTHONIOENCODING = "utf-8"
$env:NINJA_STATUS = "[%f/%t %es] "

Set-Location $FirmwareRoot
$sw = [System.Diagnostics.Stopwatch]::StartNew()

# ninja 並列は環境変数で指定（idf.py -j は未対応の環境あり）
$env:CMAKE_BUILD_PARALLEL_LEVEL = "$Jobs"
idf.py build
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
Write-Host ("[fast_build] build OK in {0:N1}s" -f $sw.Elapsed.TotalSeconds)

if ($Flash) {
    idf.py -p $Port flash
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "[fast_build] flash OK"
}

if ($Monitor) {
    idf.py -p $Port monitor
}

exit 0
