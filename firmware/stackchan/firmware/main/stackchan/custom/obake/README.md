# Obake face（CUSTOM 専用）

Port.A → PaHub の両目 OLED・ToF と、CoreS3 口 UI。首サーボは Media WS／API 指令のみ。

| ファイル | 役割 |
|----------|------|
| `obake_config.h` | **人が変える数値**（先頭）＋`kObakeAutoCustom`＋ Media WS ホスト |
| `obake_runtime.*` | init / UI tick / hw タスク |
| `obake_robot_ws.*` | Media WS **クライアント**（`obake.media.stackchan:8030/obake/media`） |
| `obake_servo_api.*` | 首角度キュー（PreUpdate drain） |
| `obake_pahub.*` | I2C port0 (GPIO2/1) + PaHub |
| `obake_eyes.*` | CH0/1 OLED |
| `obake_tof.*` | CH2 VL53L0X |
| `obake_mouth_ui.*` | 白地 ∪/∩ + cm |
| `obake_wake_config.h` | 「おばけちゃん」単一入口 |
| `vl53l0x.*` | Pololu 系ドライバ（ESP-IDF 移植） |

起動条件: `IsCustomSessionActive()` かつ `OnXiaozhiUiReady`。

---

## 調整手順（明るさ・まばたき・きょろきょろ）

数値は **[`obake_config.h`](obake_config.h) の先頭ブロック「人が変える値」だけ** 編集する。`.cpp` 内のリテラルは触らない。

### 手順

1. `firmware/main/stackchan/custom/obake/obake_config.h` を開く
2. 先頭の定数を変更（下表）
3. `scripts/fast_build.ps1` または `firmware/` で `idf.py build` → `idf.py -p COMx flash`
4. `kObakeAutoCustom=1` なら自動で CUSTOM。手動ならランチャーで **CUSTOM** を起動し、目・口・距離を確認

### よく触る定数

| 変えたいこと | 定数 | 目安 |
|--------------|------|------|
| CUSTOM 自動起動 | `kObakeAutoCustom` | `0`=手動 / `1`=自動 |
| Media 送り先 | `kMediaWsHost` / `kMediaWsLanIp` / `Port` / `Path` | 実際の TCP は `kMediaWsLanIp`（詳細は `homelab/obake_media/README.md`） |
| JPEG 画質 | `kMediaJpegQuality` | 既定 `20`（上げる=高画質・重い） |
| 映像送信間隔 | `kMediaJpegIntervalMs` | 既定 `400` ms |
| Media 再接続間隔 | `kMediaReconnectMs` | 既定 `5000` ms |
| JPEG 停滞再接続 | `kMediaJpegStallMs` | 既定 `8000` ms |
| フレーム URL（正） | （PC）`http://127.0.0.1:8030/obake/latest.jpg` | `/obake/view` は latest.jpg へリダイレクト。状態は `/obake/status` |
| 目を明るく／暗く | `kOledContrast` | 上げる=明（0–255）。既定 `0x5A` |
| まばたきを遅く | `kBlinkOpenMinMs` / `kBlinkOpenSpanMs` を大きく | 開眼の待ち = Min + 乱数(Span) |
| まばたきの閉眼を長く | `kBlinkClosedMinMs` / `kBlinkClosedSpanMs` | 閉眼時間 |
| きょろきょろを少なく | `kLookMinMs` / `kLookSpanMs` を大きく | 視線変更の間隔 |
| 視線の振れ幅 | `kLookRangeX` / `kLookRangeY` | 中心からの ± 幅 |
| 口 ∪/∩ の切替を少なく | `kMouthFlipMinMs` / `kMouthFlipSpanMs` | 視線とは独立 |
| ToF 表示の更新間隔 | `kTofUpdateMs` | 既定 1000 ms |
| hw ポーリング周期 | `kHwTickMs` | 既定 40（閉眼最短より短く） |

呼びかけ「おばけちゃん」の検知感度は `sdkconfig.defaults` / `.local` の `CONFIG_CUSTOM_WAKE_WORD_THRESHOLD`（既定 **30**。小さいほど敏感。誤検知なら上げる）。拼音・表示名のメモは `obake_wake_config.h`。

ハード配線（GPIO・PaHub CH・I2C アドレス）は同ファイル後半。普段は触らない。
