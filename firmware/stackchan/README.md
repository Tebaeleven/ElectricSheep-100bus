<!-- ElectricSheep-100bus 側の取り込みメモ（このヘッダは monorepo 用。以下の本体 README は Obake 由来） -->

Source: https://github.com/kazu-1234/Obake_device @ `095611b`（2026-09-12 同期。表示版 **v0.5.3**＋ブートループ修正）  
パス正本（チーム共有）: `firmware/stackchan/`（ブランチ `develop`）。個人作業用 private は [kazu-1234/Obake_device](https://github.com/kazu-1234/Obake_device)。以後の ESP／Stack-chan 更新は **このディレクトリへ PR**（`develop` 向け）。

本体は `firmware/`（ESP-IDF / M5Stack CoreS3 の Stack-chan ベース）。おばけ固有の実装は `firmware/main/stackchan/custom/obake/`。

**取り込み時に除外したファイル**: `reference/content.png`（大容量参考図）、`sdkconfig.defaults.local`（秘密・端末固有）、`wifi_credentials.local.h`（パスワード）、`homelab/obake_media/latest.jpg`、`firmware/build_log.txt`、ローカルの `version_history.txt` 差分拡大はしない。`wifi_credentials.local.h.example`（プレースホルダのみ）は同梱。

## 通信 I/F（v0.5.3）と要件定義書の関係

**v0.5.3 既定**: 端末が **WS サーバ**として `ws://<端末STA>:8765/ws/v1/robot`（mDNS `obake.local`）を待ち受ける（`kMediaListenAsServer=1`）。実装は `obake_robot_ws.cpp`（httpd のみ SPIRAM・Wi-Fi 後遅延・最大 3 回リトライ）。`stackchan`/`obake_hw` は内部 DRAM スタック（SPIRAM スタックは flash cache off でブートループ）。

| 観点 | 要件定義書（`docs/specs/robot-api-requirements.md`） | 実装（Obake v0.5.3 @ 095611b） |
| --- | --- | --- |
| 向き | 端末が WS **サーバー**、アプリがクライアント | **一致（既定）**。`STACKCHAN_WS_URL=ws://<端末IP or obake.local>:8765`（パスは SDK が `/ws/v1/robot` を付与） |
| URL | `ws://<端末IP>:<port>/ws/v1/robot` | 同上（ポート `kRobotWsPort=8765`） |
| フォールバック | - | `kMediaListenAsServer=0` で旧 **PC クライアント**（`ws://<PC>:8030/obake/media` + `homelab/obake_media/server.py`） |
| エンベロープ | JSON `{"type","request_id","data"}` | サーバ経路でも JSON 指令＋バイナリ上行あり。詳細は `homelab/obake_media/README.md` / `obake/README.md` |
| `hand.set` | 手を開閉 | **首 yaw open/close**（グリッパではない。`kHandOpenYawDeg` / `kHandCloseYawDeg`） |
| `camera.capture` / `audio.*` | 要求応答 | サーバ経路でクライアントへ配信。JPEG は SPIRAM 寄せ・延期キャプチャ |
| 認証 | Bearer 暫定 | **無し**（LAN 前提・平文 ws） |

### SDK / ブリッジとの関係（本 PR では `packages/` を触らない）

- `packages/devices` の `STACKCHAN_WS_PATH=/ws/v1/robot` は、**端末サーバ既定と向きが合う**。実機検証は `STACKCHAN_WS_URL` を端末へ向けて行う。
- **B 方式**（`STACKCHAN_BRIDGE_URL` → PC `:8030` の Media ブリッジ）は、ファームを `kMediaListenAsServer=0` にしたとき／既存ブリッジ運用向け。本ファーム更新だけでブリッジを壊す意図はないが、**両方を同時に「正」とはしない**。チームで接続プロファイルを決めること。
- 親の `firmware/README.md`（レール含む）に古い「クライアントのみ」記述が残っている場合は、別 PR で文言更新を推奨（本 PR は `firmware/stackchan/` のみ）。

## ビルド・書き込み（元リポの方式）

- 方式: **ESP-IDF**（`firmware/CMakeLists.txt`、`idf.py`）。Windows 補助: `scripts/fast_build.ps1`、`tools/obake_flash_gui.pyw`
- ボード: **M5Stack CoreS3**（Stack-chan）。PaHub v2.1 / SSD1306×2 / Unit ToF U010
- 依存: `firmware/repos.json` → `firmware/fetch_repos.py`（xiaozhi 等）。詳細は [引き継ぎ.md](引き継ぎ.md)
- Wi-Fi: Xiaozhi 設定 UI。サーバ既定時は PC IP 定数は不要（クライアントフォールバック時のみ `obake_config.h` の Media 宛先）
- ライセンス: `firmware/LICENSE` = MIT（M5Stack Technology CO LTD）

---

# Obake_device

白い丸いおばけの本体ハードとファーム。天井移動は他担当。

参考図: [reference/content.png](reference/content.png)（この monorepo には未同梱。必要なら元リポから取得）

表示版: v0.5.3

| パス | 用途 |
|------|------|
| [`firmware/`](firmware/) | 本番 ESP-IDF（Stack-chan ベース・独自改造） |
| [`arduino/obake_pahub_bringup/`](arduino/obake_pahub_bringup/) | ハード確認のみ（本番ではない） |

別 PC へ移すときは [引き継ぎ.md](引き継ぎ.md) を先に読む。

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

本番: [`firmware/`](firmware/) を **ESP-IDF** で build / flash（[引き継ぎ.md](引き継ぎ.md) §6）。  
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
