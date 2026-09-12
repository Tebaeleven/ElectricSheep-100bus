# 空中移動おばけロボット 要件定義書（初期開発版）

> 受領日: 2026-09-11 / 出典: ユーザー提供の要件定義書（初期開発版）を計画書の「受領仕様」から再構成したもの。
> 未確定事項は本書末尾にまとめる。SDK 側の対応は `packages/devices`（`@workspace/devices`）。

## 1. 背景・目的

- 「空中移動おばけロボット」を Next.js アプリから制御する。制御元（オーケストレーター）は Next.js / Mastra エージェントで、機器側は指示を受けて動く実行体とする。
- 初期開発版の目的は、**全 API を Next.js / Mastra からいつでも呼べる状態にすること**。実機の IP・ポート・認証方式が確定していなくても、型付き SDK とモックで開発・検証を進められるようにする。
- LLM は Gemini（Mastra のモデルルーター経由、`google/...`）を使用する。

## 2. システム構成

| 構成要素 | 役割 | プロトコル | 備考 |
| --- | --- | --- | --- |
| Next.js（制御元） | UI・Route Handler・Mastra エージェント | - | 機器へのリクエスト発行元 |
| ESP32（レール） | 空中レール上での X/Y/Z 移動 | HTTP | プレフィックス `/api/v1` |
| スタックちゃん（おばけロボット本体） | 手の開閉・カメラ・マイク | WebSocket | パス `/ws/v1/robot` |
| Electron（デスクトップ） | PC 画面のスクリーンショット・ブラウザ起動 | HTTP | プレフィックス `/api/v1` |

- HTTP 機器の共通プレフィックスは `/api/v1`。ベース URL は `http://<host>:<port>` の形で設定し、プレフィックスは SDK が付与する。
- WebSocket の接続先は `ws://<host>:<port>`。パス `/ws/v1/robot` は SDK が付与する。

## 3. 機能・API 一覧

### 3.1 HTTP（ESP32: レール）

| メソッド | パス | リクエスト | レスポンス | 備考 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/rail/move` | `{"axis":"x\|y\|z","direction":1\|-1,"duration_ms":500}` | 受理結果 | **リトライ禁止**（重複移動を避ける） |
| POST | `/api/v1/rail/stop` | なし | 受理結果 | 冪等。リトライ可 |
| GET | `/api/v1/rail/status` | なし | `{"state":"moving\|stopped\|error", ...}` | 追加フィールドは保持する |

### 3.2 HTTP（Electron: デスクトップ）

| メソッド | パス | リクエスト | レスポンス | 備考 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/desktop/screenshot` | なし | `{"mime_type":"image/png","image_base64":"..."}` | **Data URL 接頭辞なし**の base64 |
| POST | `/api/v1/desktop/browser/open` | `{"url":"https://..."}` | 受理結果 | **http/https のみ**許可 |
| GET | `/api/v1/desktop/status` | なし | `{"state":"running", ...}` | |

### 3.3 WebSocket（スタックちゃん）

接続先パス: `/ws/v1/robot`。全メッセージは共通エンベロープを持つ。

```json
{ "type": "hand.set", "request_id": "req-001", "data": { "state": "open" } }
```

#### Next → 機器（outbound）

| type | data | 期待する応答 |
| --- | --- | --- |
| `hand.set` | `{"state":"open"\|"closed"}` | `ack`（同じ `request_id`） |
| `audio.start` | なし | `ack` の後、停止まで `audio.chunk` が継続 |
| `audio.stop` | なし | `ack` |
| `camera.capture` | なし | `camera.frame`（同じ `request_id`） |

#### 機器 → Next（inbound）

| type | data | 備考 |
| --- | --- | --- |
| `ack` | 任意 | `request_id` で要求と対応付ける |
| `error` | `{"code":"...","message":"..."}` | `request_id` で要求と対応付ける |
| `audio.chunk` | `{"mime_type":"...","audio_base64":"...","seq":1}` | `audio.start`〜`audio.stop` の間、継続的に送られる |
| `camera.frame` | `{"mime_type":"image/png","image_base64":"..."}` | `camera.capture` への応答 |

## 4. データ仕様

- **ワイヤ形式は snake_case**（`duration_ms` / `mime_type` / `image_base64` / `audio_base64` / `request_id`）。アプリ側の公開 API は camelCase（`durationMs` / `mimeType` / `imageBase64` / `audioBase64` / `requestId`）で、変換は SDK 内部で行う。
- 画像・音声の base64 は **Data URL 接頭辞（`data:image/png;base64,`）を含めない**。UI で表示するときにアプリ側が付与する。
- `request_id` は要求ごとに一意。SDK は `req-<uuid>` 形式で採番する（仕様書の例は `req-001`。受信時は形式を問わず非空文字列として扱う）。
- `axis` は `x` / `y` / `z`、`direction` は `1` / `-1` のみ。
- レール状態は `moving` / `stopped` / `error`。機器が追加のフィールドを返しても捨てずに保持する。

## 5. 安全・運用要件（案）

1. **駆動時間の上限**: `duration_ms` にはクライアント側でも上限を設ける。既定 3000ms、env（`DEVICE_RAIL_MAX_DURATION_MS`）で変更可能。上限超過はリクエスト前にバリデーションで弾く。
2. **移動命令の自動再送禁止**: 通信エラー時、`rail/move` は**リトライしない**（機器が受理済みの可能性があり二重移動になるため）。`rail/stop` は安全側の操作なのでリトライ可。
3. **URL の制限**: `desktop/browser/open` の URL は http/https のみ許可する（`file:` / `javascript:` などは拒否）。
4. **タイムアウト**: 全リクエストにタイムアウトを設ける（既定 5000ms）。WebSocket の応答待ち（`ack` / `camera.frame`）にもタイムアウトを設ける。
5. **認証**: 方式未確定。暫定として `DEVICE_AUTH_TOKEN` が設定されていれば全機器に `Authorization: Bearer <token>` を付与する。
6. **接続管理**: WebSocket 接続はサーバー側でシングルトン化し、開発時の HMR で接続が増殖しないようにする。
7. **障害時の扱い**: 機器エラーは例外ではなく `DeviceResult`（`ok:false` + `error`）として返し、UI・エージェントが継続できるようにする。

## 6. 完了条件・未確定事項

### 完了条件

- 上記 HTTP / WebSocket の全 API が、型付き SDK（`@workspace/devices`）・モック機器・Next.js の Route Handler・Mastra tool・操作パネル UI から呼べること。
- `DEVICE_MODE=mock` で実機なしに全機能を通しで検証できること。
- 実機接続時は env の URL 差し替えだけで切り替えられること。

### 未確定事項（TODO）

- [ ] 各機器の IP アドレス・ポート番号
- [ ] 認証方式（Bearer トークンか、別方式か）
- [ ] `ack` / `error` の `data` の詳細スキーマ（エラーコード体系）
- [ ] `audio.chunk` の音声フォーマット（コーデック・サンプリングレート・`seq` の採番規則）
- [ ] レール座標系の原点・可動範囲・リミットスイッチの有無
- [ ] `rail/status` / `desktop/status` の追加フィールド
- [ ] 複数クライアントからの同時接続を許すか

## 7. この SDK での対応表（公開 API ⇄ 機器エンドポイント）

| 公開 API（`@workspace/devices`） | 機器エンドポイント / メッセージ | 入力（camelCase） | ワイヤ形式（snake_case） |
| --- | --- | --- | --- |
| `RailClient.move(input)` | `POST /api/v1/rail/move` | `{ axis, direction, durationMs }` | `{ axis, direction, duration_ms }` |
| `RailClient.stop()` | `POST /api/v1/rail/stop` | なし | なし |
| `RailClient.status()` | `GET /api/v1/rail/status` | なし | `{ state, ... }` |
| `DesktopClient.screenshot()` | `POST /api/v1/desktop/screenshot` | なし | `{ mime_type, image_base64 }` → `{ mimeType, imageBase64 }` |
| `DesktopClient.openBrowser(input)` | `POST /api/v1/desktop/browser/open` | `{ url }` | `{ url }` |
| `DesktopClient.status()` | `GET /api/v1/desktop/status` | なし | `{ state, ... }` |
| `StackchanClient.headSet(input)` **（B 方式・現行）** | ブリッジ `POST /obake/head` → 機器へ `{"cmd":"set_head",...}` | `{ yaw, pitch, speed? }` | `{ cmd:"set_head", yaw, pitch, speed }` |
| `StackchanClient.handSet(state)` **（復活・2026-09-12）** | 機器 HTTP `POST /obake/hand_open` / `POST /obake/hand_close`（8765・ボディ無し） | `"open" \| "closed"` | —（ボディ無し） |
| `StackchanClient.ledSet(on)` **（新規・2026-09-12）** | 機器 HTTP `POST /obake/led_on` / `POST /obake/led_off`（8765・ボディ無し） | `boolean` | —（ボディ無し） |
| `StackchanClient.cameraCapture()` | B 方式: ブリッジ `GET /obake/latest.json` ／ 旧契約: WS `camera.capture` → `camera.frame` | なし | `{ mime_type, image_base64 }` → `{ mimeType, imageBase64 }` |
| `StackchanClient.audioStart()` | WS `audio.start` → `ack` | なし | `{ type, request_id }` |
| `StackchanClient.audioStop()` | WS `audio.stop` → `ack` | なし | `{ type, request_id }` |
| `StackchanClient.onAudioChunk(h)` | WS `audio.chunk`（継続受信） | - | `data: { mime_type, audio_base64, seq }` → `{ mimeType, audioBase64, seq, receivedAt }` |
| `StackchanClient.onEvent(h)` | WS inbound 全種 | - | `{ type, request_id, data }`（ワイヤ形式のまま） |

- 変換関数は `src/wire.ts`（`railMoveToWire` / `railMoveFromWire` / `imagePayloadToWire` / `imagePayloadFromWire` / `audioChunkFromWire` / `toAudioChunk`）。
- バリデーションは `src/schemas.ts`（公開 API 用）と `src/wire.ts`（ワイヤ形式・WebSocket エンベロープ用）。

## 8. 実機ファームとの差分（2026-09-12 取り込み時点）

実機ファームをリポジトリに取り込んだ結果（[`firmware/`](../../firmware/README.md)）、本書の仕様と実装に差分があることが分かった。**本文（§1〜§7）は受領した仕様の正本としてそのまま残し**、ここに実装差分だけを記録する。

### 8.1 レール（`firmware/esp32-rail/firmware/rail_dc`）— SDK を実装側に合わせ込み済み

| # | 項目 | 本書 | ファーム実装 | SDK の対応 |
| --- | --- | --- | --- | --- |
| 1 | `POST /rail/stop` の本文 | ボディなし | **JSON ボディ必須**（`{"axis":null}` 全軸 / `{"axis":"x"}` 単軸）。`content-type: application/json` も必須で、欠けると 400 | `RailClient.stop()` が `{"axis":null}` を送る。単軸は `stop(signal, axis)` |
| 2 | `move` / `stop` の応答 | 200 | **202** `{"command_id":"http-...","status":"accepted"}`（キューへの受理であり走行完了ではない） | `DeviceResult.data.commandId`（`command_id` も保持）。ok 判定は 2xx のまま |
| 3 | `GET /rail/status` | `{"state":"moving"\|"stopped"\|"error", ...}` | `state` を返さない。`type,firmware,mode,simulated,ip,ap_ip,ap_ssid,axes[{axis,active,pending,direction,remaining_ms}],...` | `railStatusSchema` を緩め、`state` があれば検証・無ければ `axes[].active` から導出。元フィールドは全保持（passthrough）＋ `apIp` / `apSsid` を追加 |
| 4 | `duration_ms` の上限 | 3000（クライアント側の安全要件） | **60000**（超過は 422） | SDK は 3000 のまま（安全側）。`DEVICE_RAIL_MAX_DURATION_MS` で変更可 |
| 5 | 駆動の有無 | 実駆動 | `MOTOR_OUTPUTS_ENABLED = false` の間は**モーター出力なし**の LED プレビュー（`simulated:true` / `mode:"led_preview"`） | モックも同じ形を返す。実駆動へは配線後にファーム側の定数変更＋再書き込み |

§6 の未確定事項のうち「`rail/status` の追加フィールド」はこれで解消した。認証は HTTP API では**不要**（ファームが `http_auth_required:false` を返す）。

### 8.2 スタックちゃん（`firmware/stackchan`）— **採用: B 方式**（2026-09-12 決定・実装済み）

§3.3 の `/ws/v1/robot` は**実装されていない**（元リポで廃止済み）。端末は WS **クライアント**として PC の Media サーバー `ws://<PC>:8030/obake/media` へ接続し、JPEG / PCM をバイナリフレーム `[type:1][len:4 BE][payload]`（`0x02`=JPEG / `0x20`=PCM）で push する。`request_id` / `ack` の要求応答は無い。

**採用: B 方式（PC 側ブリッジをアダプタにする。ファーム無改修）**。`firmware/stackchan/README.md` の選択肢 1 を採り、メンバー実装 `homelab/obake_media/server.py` と同じプロトコル・同じパスの受け口を `packages/stackchan-bridge`（`@workspace/stackchan-bridge`、`pnpm stackchan:bridge`、ポート 8030）として TypeScript で実装した。

#### 契約の更新

| # | 項目 | 本書（§3.3） | 採用後 |
| --- | --- | --- | --- |
| 1 | 手の開閉 | `hand.set` `{state:"open"\|"closed"}` → `ack` | **機器上の HTTP（8765）に置換して復活**（下の「2026-09-12 追記」参照）。ブリッジ（8030）側には無い |
| 2 | 画像取得 | `camera.capture` → `camera.frame` | 機器が 400ms 間隔で push。取得はブリッジの `GET /obake/latest.json`（`cameraCapture` の実装がこれに変わる） |
| 3 | 音声取得 | `audio.start` / `audio.stop` → `audio.chunk` | 機器は常時 push。`audioStart/Stop` は SDK 内のフラグで、`onAudioChunk` はブリッジの `GET /obake/audio/recent` を 500ms ポーリングして配る |
| 4 | 接続の向き | Next がクライアント | **機器がクライアント**。PC 側（ブリッジ）がサーバー。env は `STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030`（`DEVICE_MODE=real` で `STACKCHAN_WS_URL` より優先） |
| 5 | 機器の宛先設定 | 機器の IP を Next に設定 | **PC の IP を機器に設定**（ファーム定数 `obake_config.h` の `kMediaWsLanIp` / `kMediaWsPort`）。PC の IP が変わったら再ビルド・再書き込みが要る |

#### 首の可動範囲（ファーム実測・`headSetSchema` の正本）

| 項目 | 実測 | 根拠（ファイル:行） |
| --- | --- | --- |
| `yaw` | **-128 〜 128 度**（既定 0） | `firmware/stackchan/firmware/main/stackchan/custom/obake/obake_servo_api.cpp:21-22`、`firmware/stackchan/firmware/main/hal/hal_servo.cpp:340`（`-1280..1280` = 0.1° 単位） |
| `pitch` | **0 〜 90 度**（0 が最も下・90 が最も上・水平はおよそ 45） | `obake_servo_api.cpp:23-24`、`hal_servo.cpp:349`（`30..870` = 3.0°〜87.0°）、`stackchan/motion/motion.h:120`（+ が上） |
| `speed` | **100 〜 1000**（既定 **150**）。deg/s ではなく、ばね剛性・減衰へ写される速さの抽象値 | `obake_servo_api.cpp:25,52-60`、`stackchan/motion/servo.cpp:91`（`map_speed_to_spring_options`） |

単位は度（ファーム内部は 0.1° 単位。`obake_servo_api.cpp:20` の `kDegToInternal = 10`）。
この値は `@workspace/devices` の `headSetSchema`（`packages/devices/src/schemas.ts`）と `HEAD_*` 定数に写してあり、Web・Mastra tool・`/dev` はそこから import する（各所で数値を再定義しない）。

#### 2026-09-12 追記: 手は廃止ではなく「機器上の HTTP（8765）」に移した

実機を当たったところ、機器本体が **HTTP サーバー**（既定 8765）を持っていて、手と LED はそこから動かせることが分かった。
よって §8.2 の当初判断「**hand は廃止**」は**撤回**する。手は使える。ただし系統がブリッジ（8030）とは別で、
**手・LED = 機器 HTTP 8765 / 首・カメラ・音声 = ブリッジ 8030** の二本立てになる。
SDK は `createStackchanCompositeClient` でこの 2 つを 1 つの `StackchanClient` にまとめる。

実測した機器 HTTP の仕様（正本）:

| メソッド | パス | 備考 |
| --- | --- | --- |
| GET | `/` / `/control` | 200 HTML（`<title>Obake</title>`）。**ヘルスチェックはこれ**（`/obake/status` は無い） |
| POST | `/obake/hand_open` / `/obake/hand_close` | **ボディ無し・content-type 無し**。応答はテキスト（2xx なら成功） |
| POST | `/obake/led_on` / `/obake/led_off` | 同上 |

機器の癖（SDK の制約の根拠）:

- 未知パスは 404 ではなく**接続リセット**。連続アクセスで機器が固まる → **表にないパスを叩かない**。
- SDK は 8765 宛てを**直列キュー（同時 1 本）＋最低 600ms 間隔**、タイムアウト 10 秒、再送は冪等な hand / led のみ 1 回まで。
- 固まったら電源の入れ直し。

**契約への追加提案**: 本書 §3.3 の outbound に `led.set` `{on:boolean}` を正式に加える（現状は SDK の `StackchanClient.ledSet(on)` と
Next の `POST /api/devices/stackchan/led` として先行実装済み）。`hand.set` は `{state:"open"|"closed"}` のまま復活とし、
**実体は WS ではなく機器 HTTP 8765** と注記する。env は `STACKCHAN_HTTP_URL`（実機 `http://192.168.77.125:8765` / モック `http://127.0.0.1:8794`）。

旧契約（`/ws/v1/robot` の要求応答）は `createStackchanClient` と 8793 のモックとして残す。全項目の差分表は [`firmware/stackchan/README.md`](../../firmware/stackchan/README.md)、運用手順は [`docs/runbooks/devices.md`](../runbooks/devices.md) §4.3。
