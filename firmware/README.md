# firmware — 実機ファームウェア

メンバーが開発した実機ファームの**正本**をこのリポジトリに取り込んだもの。元リポジトリは参照用で、以後の変更はここに入れる（元リポと同期する場合は差分を手動で取り込む）。

| ディレクトリ | 機器 | 由来 |
| --- | --- | --- |
| [`esp32-rail/`](esp32-rail/) | 天井レール（ESP32 DC XYZ） | [furukawa1020/ESPwiredspider](https://github.com/furukawa1020/ESPwiredspider) @ `2c4572d` |
| [`stackchan/`](stackchan/) | おばけ本体（M5Stack CoreS3 / Stack-chan） | [kazu-1234/Obake_device](https://github.com/kazu-1234/Obake_device) @ `400f309` |

## 1. 機器一覧

| 項目 | esp32-rail | stackchan |
| --- | --- | --- |
| ボード | ESP32 DevKitC / Freenove ESP32 WROOM | M5Stack CoreS3（Stack-chan） |
| ビルド方式 | **PlatformIO**（`espressif32@6.12.0` / Arduino framework） | **ESP-IDF**（`idf.py`。依存は `firmware/fetch_repos.py` で取得） |
| 本命のパス | [`esp32-rail/firmware/rail_dc/`](esp32-rail/firmware/rail_dc/) | [`stackchan/firmware/`](stackchan/firmware/)（おばけ固有は `main/stackchan/custom/obake/`） |
| アプリ向け I/F | HTTP `/api/v1/rail/*`（move / stop / status） | WS **クライアント** → PC の `ws://<PC>:8030/obake/media`（要件定義書の `/ws/v1/robot` は未実装） |
| ネットワーク | **SoftAP 常時起動**（`Rail-ESP32-<mac>` / `192.168.4.1`）＋ STA | STA のみ（Xiaozhi の設定 UI で接続） |
| 設定の持ち方 | **NVS**（シリアルから `scripts/configure-dc.py` で書き込み） | Xiaozhi の設定 UI ＋ ファーム定数 `obake_config.h`（Media サーバー宛先） |
| 認証 | HTTP API は**認証なし**（`http_auth_required:false`）。中央サーバー向け WSS だけ Bearer | なし（LAN 前提・平文 ws） |
| ライセンス | 元リポに LICENSE 無し | `stackchan/firmware/LICENSE` = MIT（M5Stack Technology CO LTD） |

`stackchan/` は未着手ではなく**実装済みだが契約が違う**。差分は下の §4 と [`stackchan/README.md`](stackchan/README.md) を参照。

## 2. 書き込み手順

### esp32-rail（macOS）

```bash
cd firmware/esp32-rail/firmware/rail_dc

# ビルドのみ（書き込みしない）
pio run

# 書き込み（USB シリアル接続時。ポートは pio device list で確認）
pio run -t upload
```

NVS 設定（Wi-Fi / 中央サーバー / デバイストークン / ルート CA）はソースに書かず、シリアル経由で流し込む:

```bash
cd firmware/esp32-rail
cp firmware/rail_dc/config.example.json config.local.json   # 値を埋める（.gitignore 済み）
python3 scripts/configure-dc.py --port /dev/tty.usbserial-XXXX \
  --file config.local.json --ca /path/to/root-ca.pem
```

- `config.local.json` と `.pio/` はルートの `.gitignore` で除外済み。**トークン・パスワードをコミットしない**
- Windows 用の `scripts/flash-dc.ps1` / `scripts/build.ps1` は元リポのまま。macOS では上の `pio` コマンドを使う
- `pio` が無い環境ではビルド確認を省略してよい（実機書き込みは人間が行う）

### stackchan

ESP-IDF。手順は [`stackchan/README.md`](stackchan/README.md) と `stackchan/引き継ぎ.md` を参照（Windows 前提の `scripts/fast_build.ps1` / `tools/obake_flash_gui.pyw` が用意されている）。

## 3. SSID・ポート運用

- レールは電源投入のたびに SoftAP `Rail-ESP32-<mac>` を起動する。AP パスワードは初回に生成して NVS に保存される。**USB シリアル 115200bps で `access` と改行**を送ると SSID / パスワードが取れる
- AP 接続後の URL は `http://192.168.4.1`。Wi-Fi 設定済みなら `GET /api/v1/rail/status` の `ip` に出る LAN IP でも到達できる
- 会場ネットワークの構成パターンと当日チェックリストは [`../docs/runbooks/network.md`](../docs/runbooks/network.md)
- ポート割当（モック 8791 / 8792 / 8793 など）の正本は [`../docs/ports.md`](../docs/ports.md)

## 4. API 契約と SDK の差分

契約の正本は [`../docs/specs/robot-api-requirements.md`](../docs/specs/robot-api-requirements.md)。SDK は [`../packages/devices`](../packages/devices)（`@workspace/devices`）。

### 4.1 レール（実装済み・SDK 合わせ込み済み）

| # | 項目 | 要件定義書 | ファーム `rail_dc` | SDK の対応 |
| --- | --- | --- | --- | --- |
| 1 | `POST /rail/stop` の本文 | ボディなし | **JSON ボディ必須**（`{"axis":null}` 全軸 / `{"axis":"x"}` 単軸）。`content-type: application/json` も必須。欠けると 400 | `stop()` が `{"axis":null}` を送る。`stop(signal, axis)` で単軸停止 |
| 2 | `move` / `stop` の応答 | 200 | **202** `{"command_id":"http-...","status":"accepted"}`（受理であって走行完了ではない） | `DeviceResult.data.commandId` に載せる（`command_id` も保持）。ok 判定は 2xx |
| 3 | `GET /rail/status` | `{"state":"moving"\|"stopped"\|"error", ...}` | `state` を返さない。`type,firmware,mode,simulated,ip,ap_ip,ap_ssid,axes[{axis,active,pending,direction,remaining_ms}],...` | `railStatusSchema` を緩め、`state` があれば検証、無ければ `axes[].active` のいずれかが true なら `moving` を導出。元フィールドは全保持（passthrough）＋ `apIp` / `apSsid` を追加 |
| 4 | `duration_ms` の上限 | 3000（クライアント側の安全要件） | **60000**（超過は 422） | SDK は 3000 のまま（安全側）。`DEVICE_RAIL_MAX_DURATION_MS` で変更可 |
| 5 | 実際の駆動 | - | `MOTOR_OUTPUTS_ENABLED = false` の間は**モーター出力を出さず内蔵 WS2812 の LED プレビュー**（X=赤 / Y=緑 / Z=青）。`status.simulated` が `true`、`mode` が `"led_preview"` | モック（`mock-servers.ts` / `mock/rail.ts`）も同じ形を返す |

そのほかファーム側の仕様:

- `move` の不正入力は **422**（`{"error":"invalid axis, direction or duration_ms"}`）、キュー満杯は 503
- 同じ軸は経路（HTTP / WSS）を問わず**最後に受け付けた指令で置き換わる**
- 中央サーバー向けの WebSocket（`/ws/device`、Bearer 認証、NTP 同期必須）は HTTP API とは別経路。今回アプリが叩くのは HTTP のみ

### 4.2 スタックちゃん（契約が未一致・SDK は未変更）

要件定義書の `/ws/v1/robot` は**実装されていない**。端末は WS クライアントとして PC の Media サーバーへ JPEG / PCM をバイナリ push する。全項目の差分表と推奨対応は [`stackchan/README.md`](stackchan/README.md) を参照。要点:

- 向きが逆（端末＝クライアント、PC＝サーバー `ws://<PC>:8030/obake/media`）
- 要求応答（`request_id` / `ack`）が無く、映像・音声は常時 push（`[type:1][len:4 BE][payload]`、`0x02`=JPEG / `0x20`=PCM）
- `hand.set` は**現行ハードで実現不能**（手のサーボが無い。あるのは首 yaw/pitch の `{"cmd":"set_head",...}`）
- 推奨: PC 側 Media サーバーをアダプタとして Next.js に取り込み、SDK には従来の要求応答を見せる

## 5. 注意

- `esp32-rail/src/network.cpp`（旧世代のステッピング用ファーム）に **平文の AP パスワードとトークンが残っている**。元リポで公開済みの値であり、実機では `rail_dc` の NVS 設定を使うのでこの値は使わない。旧 `src/` と `server/` は今回未使用
- ファームのコード（`.cpp` / `.h` / `.ini` / `.py`）は**このリポジトリ側で改変しない**方針。修正が要るときは担当メンバーと合意してから入れる（README への注記は可）
- `stackchan/` 配下には元リポの `.gitignore` がそのまま入っている（`build/` / `xiaozhi-esp32/` / `managed_components/` 等を除外）
