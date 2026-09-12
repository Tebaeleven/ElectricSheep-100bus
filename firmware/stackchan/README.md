<!-- 取り込み情報（ElectricSheep-100bus 側で追記。以下の元 README はそのまま） -->

Source: https://github.com/kazu-1234/Obake_device @ 400f309（2026-09-12 取り込み。以後の正本はこのディレクトリ。元リポと同期する場合は差分を手動で取り込む）

本体は `firmware/`（ESP-IDF / M5Stack CoreS3 の Stack-chan ベース）。おばけ固有の実装は `firmware/main/stackchan/custom/obake/`。PC 側の受け口は `homelab/obake_media/server.py`。

**取り込み時に除外したファイル**: `reference/content.png`（2.1 MB の参考図。1 MB 超のバイナリのためリポジトリに入れていない。必要なら元リポから取得する）。

## 通信 I/F と要件定義書（`/ws/v1/robot`）の差分

現在のファームは **`/ws/v1/robot` を実装していない**。端末は WS サーバーではなく **WS クライアント**として PC の Media サーバーへ外向き接続する（`firmware/main/stackchan/custom/obake/obake_robot_ws.cpp`）。旧・端末待ち受け `ws://<IP>:8765/ws/v1/robot` は元リポで**廃止済み**（`homelab/obake_media/README.md` 末尾、`引き継ぎ.md` §将来案）。

| 観点 | 要件定義書（`docs/specs/robot-api-requirements.md`） | 実装（Obake_device @ 400f309） |
| --- | --- | --- |
| 向き | 端末が WS **サーバー**、Next.js がクライアント | 端末が WS **クライアント**、PC の `homelab/obake_media/server.py` がサーバー |
| URL | `ws://<端末IP>:<port>/ws/v1/robot` | `ws://<PC>:8030/obake/media`（`kMediaWsHost` / `kMediaWsLanIp` / `kMediaWsPort` / `kMediaWsPath`） |
| エンベロープ | JSON `{"type","request_id","data"}` | 上り: **バイナリフレーム** `[type:1][len:4 BE][payload]`（`0x02`=JPEG / `0x20`=PCM）。接続直後にテキスト `{"type":"hello","pcm_rate":<Hz>}` |
| `hand.set` → `ack` | 手を開閉 | **未実装**（手のサーボが無い。あるのは首 yaw/pitch。下り指令は `{"cmd":"set_head","yaw","pitch","speed"}`） |
| `camera.capture` → `camera.frame` | 要求に対し 1 枚返す | **未実装**。要求なしで JPEG を `kMediaJpegIntervalMs`（既定 400 ms）ごとに push。取得は PC の `GET http://<PC>:8030/obake/latest.jpg` |
| `audio.start` / `audio.stop` → `audio.chunk` | 開始／停止で制御 | **未実装**。常時 PCM（16-bit LE モノラル、`hello.pcm_rate`）を `kMediaPcmIntervalMs`（既定 200 ms）ごとに push |
| `request_id` | 要求ごとに一意（`req-<uuid>`） | **無し**（要求応答モデルではない） |
| 認証 | 暫定 `Authorization: Bearer <token>` | **無し**（LAN 前提・平文 ws） |
| 状態取得 | - | `GET http://<PC>:8030/obake/status`（`connected` / `jpeg_count` / `pcm_count` / `last_pcm_rms` 等） |

### この差分をどう埋めるか（未決・要相談）

設計に関わる差分（向きが逆・要求応答が無い・音声/画像がバイナリ push）のため、**SDK（`packages/devices/src/ws/stackchan.ts`）は今回変更していない**。選択肢:

1. **PC 側 Media サーバーをアダプタにする（推奨）**: `homelab/obake_media/server.py` を Next.js 側へ移植し、`/obake/media` で端末を受けつつ、SDK には従来どおり `/ws/v1/robot` 相当の要求応答を見せる。ファーム無改修で済む。
2. ファームに `/ws/v1/robot` の WS サーバーを追加する（`引き継ぎ.md` §153 の将来案）。端末負荷と工数が大きい。
3. SDK を Media プロトコル側に寄せる。`hand.set` が実装不能（手が無い）なので、契約そのものの見直しが必要。

いずれにせよ **`hand.set` は現行ハードでは実現できない**（首 yaw/pitch のみ）。契約側を `head.set` 等に改める判断が要る。

## ビルド・書き込み（元リポの方式）

- 方式: **ESP-IDF**（`firmware/CMakeLists.txt`、`idf.py`）。PlatformIO ではない。Windows 前提の補助スクリプト `scripts/fast_build.ps1`、GUI 書き込み `tools/obake_flash_gui.pyw`
- 対象ボード: **M5Stack CoreS3**（Stack-chan）。周辺は PaHub v2.1 / SSD1306 ×2（目）/ Unit ToF U010
- 依存: `firmware/repos.json` を `firmware/fetch_repos.py` で取得（mooncake / smooth_ui_toolkit / **xiaozhi-esp32 v2.2.4 + パッチ 4 本** / ArduinoJson v7.4.2 / esp-now）。`firmware/patches/*.patch` が前提
- Wi-Fi 設定: Xiaozhi 側の設定 UI（`app_setup`）。Media サーバーの宛先だけは**ファームの定数**（`firmware/main/stackchan/custom/obake/obake_config.h` の `kMediaWsLanIp` 等）なので、PC の IP が変わったら再ビルド・再書き込みが要る
- ライセンス: `firmware/LICENSE` = MIT（Copyright M5Stack Technology CO LTD）。リポジトリのルートに LICENSE は無い。同梱の `BMI270_SensorAPI` / `FTServo_Arduino` / `simplevox` はそれぞれ自前の LICENSE を同梱
- バイナリ: `firmware/main/assets/assets_bin/*.bin`（各 ~84 KB）、`*.ogg`（効果音）、`*.c` のフォント／画像データ。1 MB 超は `reference/content.png` のみで、これは取り込み対象外

---

# Obake_device

白い丸いおばけの本体ハードとファーム。天井移動は他担当。

参考図: [reference/content.png](reference/content.png)

表示版: v0.5.2

管理リポは **この `Obake_device` のみ**。中で用途ごとに分ける:

| パス | 用途 |
|------|------|
| [`firmware/`](firmware/) | 本番 ESP-IDF（Stack-chan ベース・独自改造） |
| [`arduino/obake_pahub_bringup/`](arduino/obake_pahub_bringup/) | ハード確認のみ（本番ではない） |

別 PC へ移すときは [引き継ぎ.md](引き継ぎ.md) を先に読む。  
**更新のたびにこのリポへ commit & push**（詳細は引き継ぎ §0）。

当面の脳は **Stack-chan の CoreS3**。カメラ・マイク・スピーカも Stack-chan。会話は当面 Xiaozhi（あとで独自に差し替え）。液晶は口。  
免責: 個人の製作・ハッカソン用途。部品・配線の焼損や落下の責任は負わない。

## 方針（現行）

はんだ・3Dプリンタなし。PaHub / ToF は Grove。目の SSD1306 は 2.54 mm ピンなので **Grove–Dupont 変換**。  
主控は当面 Stack-chan。図中の Pi はサイズの目安（外径 110–130 mm）だけ使う。

## 部品（現行）

所持して動かすもの

- Stack-chan（CoreS3）… 脳・給電・I2C
- PaHub v2.1 ×1
- SSD1306 1インチ級 ×2（目）
- Unit ToF U010 ×1（床）

追加で買うもの

- **Grove–Dupont メス変換** ×2（目用。HY2.0-4P 2.0 mm → ピンヘッダ 2.54 mm）
- Grove 20 cm 予備（球内の引き回し。ToF は付属ケーブルで可）

旧買い物リスト（専用 CoreS3・Unit LCD・ToF4M・Catch）は使わない。戻さない。

## 配線（Stack-chan Port.A）

CoreS3 の Grove 5V はファーム側でポート電源を入れる。

Port.A（黒 GND / 赤 5V / 黄 G2 SDA / 白 G1 SCL）→ PaHub v2.1 入力（0x70）。

- PaHub CH0 → 左目 SSD1306（Grove–Dupont。I2C 既定 0x3C）
- PaHub CH1 → 右目 SSD1306（同じ 0x3C でよい。CH が違うので衝突しない）
- PaHub CH2 → Unit ToF U010（I2C 0x29）下向き。Grove 同士なのでそのまま

Grove（HY2.0、ピッチ 2.0 mm）と 1インチ OLED（ピンヘッダ 2.54 mm）は形状が違うので直接刺さらない。変換ケーブルで **色で**つなぐ（ピン位置では合わせない）。

| Grove | OLED 側（基板印刷） |
|-------|---------------------|
| 黒 GND | GND |
| 赤 5V  | VCC（3.3–5V 対応モジュール） |
| 黄 SDA | SDA |
| 白 SCL | SCL |

アドレスをハードで分ける必要はない。分けたいときだけ OLED の ADDR ジャンパで 0x3C / 0x3D。ソフトの 7bit は 0x3C / 0x3D（基板の 0x78 / 0x7A は 8bit 表記）。

## 顔の配置

- 両目: 1インチ SSD1306。隙間約 10 mm
- 底面: ToF U010 を床向き
- 内部: PaHub。脳は Stack-chan（球の外でも可）

## 書き込み

本番: [`firmware/`](firmware/) を **ESP-IDF** で build / flash（[引き継ぎ.md](引き継ぎ.md) 7 節）。  
Flash の退避と戻し: [バックアップと戻し方.md](バックアップと戻し方.md)  
ハード確認用 Arduino のみ: [arduino/obake_pahub_bringup/FLASH.md](arduino/obake_pahub_bringup/FLASH.md)

## これから載せる動き

- 呼びかけ「おばけちゃん」（変更しやすい）。ウェイク LED は Stack-chan のまま
- 口（CoreS3 液晶）。目は OLED
- 会話は当面 Xiaozhi。独自化は後
- 移動マイコンへ「来て」「20 cm 維持」（通信は Wi-Fi or BLE、未定）

## 飛行担当へ渡すもの

- `ALT_CM=` の cm 値
- 重量目安（おばけ側）: PaHub 約 7 g + OLED×2 + ToF 約 4 g ≒ **25 g**＋ケーブル・布。脳は Stack-chan 側
- 外径 110–130 mm
- 5V 共有は先に相談（サーボは未搭載）
