# ブラウザ用に Windows hosts へ obake.media.stackchan を追加（管理者で実行）
# ESP 端末には効かない。端末はファームの kMediaWsLanIp を使う。
param(
    [string]$Ip = ""
)

$ErrorActionPreference = "Stop"
$HostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$Name = "obake.media.stackchan"

if (-not $Ip) {
    $Ip = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -eq "Wi-Fi" -and $_.IPAddress -notlike "127.*" } |
        Select-Object -First 1 -ExpandProperty IPAddress)
}
if (-not $Ip) {
    throw "LAN IPv4 を検出できません。-Ip で指定してください。"
}

$lines = Get-Content $HostsPath -ErrorAction Stop
$filtered = $lines | Where-Object { $_ -notmatch "\s$([regex]::Escape($Name))\s*$" -and $_ -notmatch "\s$([regex]::Escape($Name))$" }
$filtered += "$Ip  $Name"
# 管理者書き込み
Set-Content -Path $HostsPath -Value $filtered -Encoding ASCII
Write-Host "hosts updated: $Ip  $Name"
