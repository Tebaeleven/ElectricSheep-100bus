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
| `StackchanClient.handSet(state)` | WS `hand.set` → `ack` | `"open" \| "closed"` | `{ type, request_id, data: { state } }` |
| `StackchanClient.cameraCapture()` | WS `camera.capture` → `camera.frame` | なし | `data: { mime_type, image_base64 }` → `{ mimeType, imageBase64 }` |
| `StackchanClient.audioStart()` | WS `audio.start` → `ack` | なし | `{ type, request_id }` |
| `StackchanClient.audioStop()` | WS `audio.stop` → `ack` | なし | `{ type, request_id }` |
| `StackchanClient.onAudioChunk(h)` | WS `audio.chunk`（継続受信） | - | `data: { mime_type, audio_base64, seq }` → `{ mimeType, audioBase64, seq, receivedAt }` |
| `StackchanClient.onEvent(h)` | WS inbound 全種 | - | `{ type, request_id, data }`（ワイヤ形式のまま） |

- 変換関数は `src/wire.ts`（`railMoveToWire` / `railMoveFromWire` / `imagePayloadToWire` / `imagePayloadFromWire` / `audioChunkFromWire` / `toAudioChunk`）。
- バリデーションは `src/schemas.ts`（公開 API 用）と `src/wire.ts`（ワイヤ形式・WebSocket エンベロープ用）。
