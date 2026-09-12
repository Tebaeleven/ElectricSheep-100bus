param([string]$Port = 'COM11', [switch]$BuildOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pio = Join-Path $env:USERPROFILE '.platformio\penv\Scripts\platformio.exe'
$drive = $null
foreach ($letter in @('Z','Y','X','W','V','U')) {
    if (-not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue) -and -not (Test-Path "${letter}:\")) {
        $drive = "${letter}:"
        break
    }
}
if (-not $drive) { throw 'No unused drive letter is available.' }
& subst.exe $drive $root
if ($LASTEXITCODE -ne 0) { throw 'Failed to map ASCII build path.' }
$result = 1
try {
    $arguments = @('run','--project-dir',"$drive\firmware\rail_dc")
    if (-not $BuildOnly) { $arguments += @('-t','upload','--upload-port',$Port) }
    & $pio @arguments
    $result = $LASTEXITCODE
} finally { & subst.exe $drive /D }
exit $result
