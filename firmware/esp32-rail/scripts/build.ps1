param(
    [switch]$Upload,
    [string]$Port
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pioCommand = Get-Command platformio, pio -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pioCommand) {
    $pioExecutable = $pioCommand.Source
} else {
    $pioExecutable = Join-Path $env:USERPROFILE '.platformio\penv\Scripts\platformio.exe'
}
if (-not (Test-Path -LiteralPath $pioExecutable)) {
    throw 'PlatformIO Core was not found. Install PlatformIO first.'
}

# The ESP32 GCC toolchain cannot read the Roman numeral in this folder name.
# SUBST supplies an ASCII path without moving or copying the project.
$drive = $null
foreach ($letter in @('Z', 'Y', 'X', 'W', 'V', 'U')) {
    if (-not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue) -and
        -not (Test-Path -LiteralPath "${letter}:\")) {
        $drive = "${letter}:"
        break
    }
}
if (-not $drive) { throw 'No unused drive letter is available for the build.' }

& subst.exe $drive $projectRoot
if ($LASTEXITCODE -ne 0) { throw 'Failed to create the temporary build drive.' }
$result = 1
try {
    $pioArguments = @('run', '--project-dir', "$drive\")
    if ($Upload) {
        $pioArguments += @('--target', 'upload')
        if ($Port) { $pioArguments += @('--upload-port', $Port) }
    }
    & $pioExecutable @pioArguments
    $result = $LASTEXITCODE
} finally {
    & subst.exe $drive /D
}
exit $result
