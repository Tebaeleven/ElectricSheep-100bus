# Obake 本番ファーム（ESP-IDF）

Stack-chan ファームをベースにした **おばけ専用** の本番ファーム。  
ビルド・書き込みはリポ直下の [引き継ぎ.md](../引き継ぎ.md) §7。

## パス

- 作業ディレクトリ: この `firmware/`
- おばけ実装: `main/stackchan/custom/obake/`
- IDF: **v5.5.4**

## Arduino との関係

ハード確認用スケッチは [`../arduino/obake_pahub_bringup/`](../arduino/obake_pahub_bringup/)。**本番ではない。**

## ビルド前

`xiaozhi-esp32` / `managed_components` は git 外。初回は Stack-chan と同様に依存取得が必要（既存の `Documents/Arduino/Stackchan/firmware` からコピーしてもよい）。

```powershell
$env:IDF_TOOLS_PATH = "C:\Espressif\tools"
. "C:\Espressif\tools\Microsoft.v5.5.4.PowerShell_profile.ps1"
Set-Location "...\Obake_device\firmware"
idf.py build
idf.py -p COM3 flash
```
