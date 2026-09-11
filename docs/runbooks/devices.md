# 機器 API 接続 runbook（ESP32 / スタックちゃん / Electron）

> 対象: `@workspace/devices`（`packages/devices`）と、それを使う Next.js Route Handler・Mastra tool。
> 仕様の正本は [`docs/specs/robot-api-requirements.md`](../specs/robot-api-requirements.md)。
> 本書の記述のうち **「（予定）」と明記した項目は、並走レーン（P3-A 実クライアント / P3-B Mastra tools / P3-C Web）の成果が入った時点で有効**になる。契約（型・パス・env 名）は確定済みなので、先に書いてある。

---

## 1. 概要図

```mermaid
flowchart LR
  subgraph Browser["ブラウザ（localhost:3000）"]
    UI["チャット UI / device-panel（予定）"]
    DEV["/dev 開発者ダッシュボード（予定）"]
  end

  subgraph Next["Next.js 16（サーバー側・同一プロセス）"]
    RH["Route Handler<br/>/api/devices/*（予定）"]
    MA["Mastra ghost-agent<br/>devices tools（予定）"]
    LIB["client/web/lib/devices.ts<br/>getDevices() シングルトン（予定）"]
  end

  SDK["@workspace/devices<br/>createDevices(process.env)"]

  subgraph Real["実機（DEVICE_MODE=real）"]
    ESP["ESP32 レール<br/>HTTP /api/v1/rail/*"]
    STK["スタックちゃん<br/>WS /ws/v1/robot"]
    ELE["Electron デスクトップ<br/>HTTP /api/v1/desktop/*"]
  end

  subgraph Mock["モックサーバー（DEVICE_MODE=mock・既定）"]
    MR["rail mock :8791"]
    MD["desktop mock :8792"]
    MS["stackchan mock :8793"]
  end

  UI --> RH
  DEV --> RH
  UI --> MA
  MA --> LIB
  RH --> LIB
  LIB --> SDK
  SDK -->|"DEVICE_MODE=real"| ESP
  SDK -->|"DEVICE_MODE=real"| STK
  SDK -->|"DEVICE_MODE=real"| ELE
  SDK -.->|"DEVICE_MODE=mock<br/>プロセス内モッククライアント"| Mock
  MR -.-> ESP
  MD -.-> ELE
  MS -.-> STK
```

ポイント:

- **ブラウザから機器を直叩きしない**。必ず Next.js のサーバー側（Route Handler か Mastra tool の `execute`）から呼ぶ。理由は §9 のトラブルシュート「Chrome から直接叩けない理由」。
- `DEVICE_MODE=mock`（既定）のとき、`createDevices()` は**プロセス内のモッククライアント**を返す。ポート 8791/8792/8793 のモック**サーバー**は、`DEVICE_MODE=real` + `RAIL_BASE_URL` 等をモックに向けたときの接続先、および `curl` で叩いて挙動を確認するための HTTP/WS エンドポイント。
- 実機とモックサーバーは**同じ API 仕様**なので、`.env.local` の URL を差し替えるだけで切り替わる。

---

## 2. env 一覧

正本は `client/web/.env.local`（テンプレートは `client/web/.env.example`）。`packages/agent/.env` は `client/web/.env.local` への symlink（`pnpm wt setup` が作る）。

| env | 既定値 | 意味 |
| --- | --- | --- |
| `DEVICE_MODE` | `mock` | `mock` \| `real`。`mock` は全機器をプロセス内モックにする。`real` でも URL 未設定の機器はモックのまま |
| `RAIL_BASE_URL` | `http://127.0.0.1:8791` | ESP32（レール）の `http://host:port`。**`/api/v1` は付けない**（SDK が付与） |
| `DESKTOP_BASE_URL` | `http://127.0.0.1:8792` | Electron（デスクトップ）の `http://host:port`。同上 |
| `STACKCHAN_WS_URL` | `ws://127.0.0.1:8793` | スタックちゃんの `ws://host:port`。**`/ws/v1/robot` は付けない**（SDK が付与） |
| `DEVICE_AUTH_TOKEN` | 空 | 認証方式は未確定。設定されていれば全機器に `Authorization: Bearer <token>` を付与する |
| `DEVICE_RAIL_MAX_DURATION_MS` | `3000` | `rail/move` の `durationMs` 上限（安全要件）。`railMoveSchema` の `max()` に効くので、**変更したら dev を再起動**する |

補助（任意）:

| env | 既定値 | 意味 |
| --- | --- | --- |
| `DEVICE_TIMEOUT_MS` | `5000`（`DEFAULT_TIMEOUT_MS`） | HTTP / WS 応答待ちのタイムアウト |

`.env.example` へのこれらの追記と `turbo.json` の `globalEnv` 追記は **P3-0/P3-C レーンの所有**（予定）。未反映のうちは `client/web/.env.local` に手で足す。

### `.env.local` の雛形（機器まわりだけ）

```bash
# 機器接続モード: mock | real
DEVICE_MODE=mock

# 実機に向けるときはここを機器チームから聞いた IP:ポートに書き換える
RAIL_BASE_URL=http://127.0.0.1:8791
DESKTOP_BASE_URL=http://127.0.0.1:8792
STACKCHAN_WS_URL=ws://127.0.0.1:8793

# 認証方式未確定。値があれば Authorization: Bearer で全機器に付与される
DEVICE_AUTH_TOKEN=

# レール駆動時間の上限（ミリ秒・安全要件）
DEVICE_RAIL_MAX_DURATION_MS=3000
```

### 実機に向ける手順

やることは **`.env.local` を書き換えて dev を再起動するだけ**。コードは触らない。

1. 機器チームから各機器の IP とポートを聞く（§8 の質問リストを使う）。
2. `client/web/.env.local` を編集する。

   ```bash
   DEVICE_MODE=real
   RAIL_BASE_URL=http://192.168.1.21:8080        # ← 実機の IP:ポート
   DESKTOP_BASE_URL=http://192.168.1.30:8080
   STACKCHAN_WS_URL=ws://192.168.1.22:8080
   DEVICE_AUTH_TOKEN=<配布されたトークン。無ければ空のまま>
   ```

3. dev を再起動する（env はプロセス起動時にしか読まれない）。

   ```bash
   # 起動中の pnpm dev を Ctrl-C してから
   pnpm dev
   ```

4. 疎通確認: まず機器を直接 `curl`（§4）、次に Next 経由（§5）。
5. 機器を 1 台だけ実機にすることもできる。`DEVICE_MODE=real` にして、実機化しない機器の URL を空にすれば、その機器だけモックのまま動く（`createDevices` が URL 未設定の機器をモックにフォールバックする）。
6. 実機の URL が間違っている・機器が落ちている場合でも例外にはならず、各呼び出しが `{ ok: false, error: ... }` の `DeviceResult` を返す。UI と会話は止まらない。

---

## 3. モックサーバーの起動

```bash
# 3 台同時起動（rail 8791 / desktop 8792 / stackchan 8793）
pnpm --filter @workspace/devices mock
```

- 実体は `packages/devices/src/mock-servers.ts`（`startMockRailServer` / `startMockDesktopServer` / `startMockStackchanServer` / `startAllMockServers`）。ポート定数は `packages/devices/src/constants.ts` の `MOCK_RAIL_PORT` / `MOCK_DESKTOP_PORT` / `MOCK_STACKCHAN_PORT`。
- **現状（`feat/devices-contract` 時点）はスタブで全リクエスト 404** を返す。受領仕様どおりの応答を返す実装は **P3-A レーンの所有（予定）**。したがって §4 の `curl` 例の期待レスポンスは P3-A 完了後に有効になる。
- ルート `package.json` に `devices:mock` スクリプトを足す（予定）。それまでは上の `pnpm --filter` 形式で起動する。
- 起動ログ: `[devices:mock] rail listening on http://127.0.0.1:8791` のように出る。ポート衝突時は `EADDRINUSE` で落ちるので、`lsof -i :8791` で掴んでいるプロセスを確認する。

### モックが返す固定値（`constants.ts`）

| 定数 | 用途 |
| --- | --- |
| `MOCK_PNG_BASE64` | スクリーンショット / `camera.frame` が返す 1x1 透明 PNG（Data URL 接頭辞なし） |
| `MOCK_AUDIO_CHUNK_BASE64` | `audio.chunk` が返す無音ダミー |
| `MOCK_AUDIO_CHUNK_INTERVAL_MS`（100） | `audio.start` 後にチャンクを送る間隔 |

---

## 4. モック機器を直接叩く（curl / WebSocket）

機器そのものの API（`/api/v1` 付き）を確認するときはこちら。Next を経由しないので、SDK・Route Handler のバグと機器側の問題を切り分けられる。

> いずれも **P3-A のモックサーバー実装後**に期待どおりのレスポンスになる（それまでは 404）。実機に向けるときは `127.0.0.1:879x` を実機の IP:ポートに読み替える。`DEVICE_AUTH_TOKEN` を使う構成なら `-H "Authorization: Bearer $DEVICE_AUTH_TOKEN"` を足す。

### 4.1 レール（ESP32・8791）

```bash
# 移動（x 軸を + 方向に 500ms）※ ワイヤ形式は snake_case
curl -sS -X POST http://127.0.0.1:8791/api/v1/rail/move \
  -H 'content-type: application/json' \
  -d '{"axis":"x","direction":1,"duration_ms":500}'

# 停止（ボディなし・冪等）
curl -sS -X POST http://127.0.0.1:8791/api/v1/rail/stop

# 状態
curl -sS http://127.0.0.1:8791/api/v1/rail/status
# => {"state":"stopped", ...}
```

### 4.2 デスクトップ（Electron・8792）

```bash
# スクリーンショット（POST・ボディなし）→ base64（Data URL 接頭辞なし）
curl -sS -X POST http://127.0.0.1:8792/api/v1/desktop/screenshot
# => {"mime_type":"image/png","image_base64":"iVBORw0KGgo..."}

# base64 を PNG に落として目視する
curl -sS -X POST http://127.0.0.1:8792/api/v1/desktop/screenshot \
  | python3 -c 'import sys,json,base64;d=json.load(sys.stdin);open("/tmp/shot.png","wb").write(base64.b64decode(d["image_base64"]))'
open /tmp/shot.png

# ブラウザで URL を開く（http/https のみ）
curl -sS -X POST http://127.0.0.1:8792/api/v1/desktop/browser/open \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'

# 状態
curl -sS http://127.0.0.1:8792/api/v1/desktop/status
# => {"state":"running", ...}
```

### 4.3 スタックちゃん（WebSocket・8793 / パス `/ws/v1/robot`）

`websocat` があるなら:

```bash
# インストール: brew install websocat
websocat ws://127.0.0.1:8793/ws/v1/robot
# 接続後、1 行ずつ JSON を貼って Enter
{"type":"hand.set","request_id":"req-001","data":{"state":"open"}}
{"type":"camera.capture","request_id":"req-002"}
{"type":"audio.start","request_id":"req-003"}
{"type":"audio.stop","request_id":"req-004"}
```

Node 22+ のグローバル `WebSocket` を使うワンライナー（追加インストール不要）:

```bash
node -e '
const ws = new WebSocket("ws://127.0.0.1:8793/ws/v1/robot");
ws.onopen = () => {
  console.log("open");
  ws.send(JSON.stringify({ type: "hand.set", request_id: "req-001", data: { state: "open" } }));
  ws.send(JSON.stringify({ type: "camera.capture", request_id: "req-002" }));
};
ws.onmessage = (e) => console.log("recv", String(e.data).slice(0, 200));
ws.onerror = (e) => console.error("error", e.message ?? e);
setTimeout(() => ws.close(), 3000);
'
```

期待する受信（`request_id` が送信と一致すること）:

```json
{"type":"ack","request_id":"req-001","data":{}}
{"type":"camera.frame","request_id":"req-002","data":{"mime_type":"image/png","image_base64":"iVBORw0..."}}
```

`audio.start` を送ると `ack` の後、`audio.stop` まで `audio.chunk` が約 100ms 間隔で流れ続ける。

---

## 5. Next 経由の API 一覧（`/api/devices/*`）

**すべて P3-C レーンの所有（予定）**。実装は `client/web/app/api/devices/...`、接続は `client/web/lib/devices.ts` の `getDevices()`（`globalThis` キャッシュのシングルトン。HMR で WebSocket が増殖しないようにする）。

共通仕様:

- `export const dynamic = 'force-dynamic'`（キャッシュさせない）。
- 入力は zod で検証し、不正なら **HTTP 400**。
- 成功・失敗いずれも本文は `DeviceResult` をそのまま JSON 化した形。

```ts
interface DeviceResult<T = unknown> {
  ok: boolean
  status?: number   // 機器から返った HTTP ステータス
  data?: T
  error?: string
  latencyMs: number
}
```

- **公開 API は camelCase**（`durationMs` / `mimeType` / `imageBase64`）。機器側の snake_case への変換は SDK の `src/wire.ts` が行うので、Next のリクエスト/レスポンスに snake_case は出てこない。

| メソッド | パス | 入力 JSON | `data` |
| --- | --- | --- | --- |
| POST | `/api/devices/rail/move` | `{"axis":"x","direction":1,"durationMs":500}` | 受理結果 |
| POST | `/api/devices/rail/stop` | なし | 受理結果 |
| GET | `/api/devices/rail/status` | なし | `{"state":"moving"\|"stopped"\|"error", ...}` |
| POST | `/api/devices/desktop/screenshot` | なし | `{"mimeType":"image/png","imageBase64":"..."}` |
| POST | `/api/devices/desktop/browser/open` | `{"url":"https://example.com"}` | 受理結果 |
| GET | `/api/devices/desktop/status` | なし | `{"state":"running", ...}` |
| POST | `/api/devices/stackchan/hand` | `{"state":"open"}` / `{"state":"closed"}` | `ack` の内容 |
| POST | `/api/devices/stackchan/camera` | なし | `{"mimeType":"image/png","imageBase64":"..."}` |
| POST | `/api/devices/stackchan/audio/start` | なし | 受理結果 |
| POST | `/api/devices/stackchan/audio/stop` | なし | 受理結果 |
| GET | `/api/devices/stackchan/audio/recent` | なし | 直近 N 件の `AudioChunk[]`（メモリのリングバッファ） |
| GET | `/api/devices/stackchan/status` | なし | `{"connected":true\|false}` |

### curl 例（web を `pnpm dev` で 3000 に起動した状態）

```bash
# レール移動
curl -sS -X POST http://localhost:3000/api/devices/rail/move \
  -H 'content-type: application/json' \
  -d '{"axis":"x","direction":1,"durationMs":500}'
# => {"ok":true,"status":200,"data":{"accepted":true},"latencyMs":3}

# 上限超過（DEVICE_RAIL_MAX_DURATION_MS=3000 のとき）→ 400
curl -sS -i -X POST http://localhost:3000/api/devices/rail/move \
  -H 'content-type: application/json' \
  -d '{"axis":"x","direction":1,"durationMs":99999}'

# 停止
curl -sS -X POST http://localhost:3000/api/devices/rail/stop

# 状態
curl -sS http://localhost:3000/api/devices/rail/status

# スクリーンショット（画像は data.imageBase64）
curl -sS -X POST http://localhost:3000/api/devices/desktop/screenshot | head -c 200

# ブラウザで開く（http/https 以外は 400）
curl -sS -X POST http://localhost:3000/api/devices/desktop/browser/open \
  -H 'content-type: application/json' -d '{"url":"https://example.com"}'
curl -sS -i -X POST http://localhost:3000/api/devices/desktop/browser/open \
  -H 'content-type: application/json' -d '{"url":"file:///etc/passwd"}'   # => 400

# 手を開く / 閉じる
curl -sS -X POST http://localhost:3000/api/devices/stackchan/hand \
  -H 'content-type: application/json' -d '{"state":"open"}'

# カメラ撮影
curl -sS -X POST http://localhost:3000/api/devices/stackchan/camera | head -c 200

# 録音開始 → 直近チャンク確認 → 停止
curl -sS -X POST http://localhost:3000/api/devices/stackchan/audio/start
curl -sS http://localhost:3000/api/devices/stackchan/audio/recent | head -c 300
curl -sS -X POST http://localhost:3000/api/devices/stackchan/audio/stop

# WS 接続状態
curl -sS http://localhost:3000/api/devices/stackchan/status
```

---

## 6. Mastra tools 一覧

**P3-B レーンの所有（予定）**。実装は `packages/agent/src/mastra/tools/devices.ts`。`createDevices(process.env)` はモジュールスコープでメモ化する。

| tool | 入力 | 返すもの | 対応する機器操作 |
| --- | --- | --- | --- |
| `railMove` | `{ axis: 'x'\|'y'\|'z', direction: 1\|-1, durationMs }` | `DeviceResult` | `POST /rail/move` |
| `railStop` | なし | `DeviceResult` | `POST /rail/stop` |
| `handSet` | `{ state: 'open'\|'closed' }` | `DeviceResult` | WS `hand.set` → `ack` |
| `cameraCapture` | なし | **画像 base64 は返さない**。撮影成否とサイズだけ | WS `camera.capture` → `camera.frame` |
| `desktopScreenshot` | なし | 同上（成否・サイズのみ） | `POST /desktop/screenshot` |
| `desktopOpenBrowser` | `{ url }`（http/https のみ） | `DeviceResult` | `POST /desktop/browser/open` |

> 画像を LLM の文脈に流し込むとトークンを食いつぶすため、`cameraCapture` / `desktopScreenshot` は「撮れた・何バイト」だけをエージェントに返す。**画像そのものは Route Handler（§5）経由で UI に表示する**。

ghost の instructions には「レールで移動できる／手を開閉できる／カメラで見られる／PC の画面を開ける」を追記する（予定）。

### 会話例

| 来場者の発話 | 呼ばれる tool |
| --- | --- |
| 「ちょっと右に動いて」 | `railMove { axis:'x', direction:1, durationMs:500 }` |
| 「止まって！」 | `railStop` |
| 「手を開いてみて」 | `handSet { state:'open' }` |
| 「手を握って」 | `handSet { state:'closed' }` |
| 「今なにが見えてる？」 | `cameraCapture` → 「撮れたよ！画面に出したね」 |
| 「私の PC の画面見て」 | `desktopScreenshot` |
| 「Google 開いて」 | `desktopOpenBrowser { url:'https://www.google.com' }` |

UI では AI SDK の `tool-railMove` 等の part を拾って「ロボットが動いています」を演出する（P3-C 予定）。

---

## 7. 安全要件の実装マッピング

| 安全要件 | 実装箇所 | 挙動 |
| --- | --- | --- |
| **駆動時間の上限** | `packages/devices/src/constants.ts` の `RAIL_MAX_DURATION_MS`（`DEVICE_RAIL_MAX_DURATION_MS ?? 3000`）→ `schemas.ts` の `railMoveSchema.durationMs = z.number().int().min(1).max(RAIL_MAX_DURATION_MS)` | 上限超過は**機器へ送る前に**バリデーションで弾く。Route Handler は 400、Mastra tool は入力スキーマ違反で実行されない |
| **移動命令の自動再送禁止** | `createRailClient().move`（P3-A・予定） | `rail/move` は**リトライしない**（機器が受理済みで二重移動になる危険）。`rail/stop` は冪等なのでリトライ可 |
| **URL の限定** | `schemas.ts` の `openUrlSchema`（`.url()` + `/^https?:\/\//` の `refine`） | `file:` / `javascript:` / `data:` は 400。Route Handler と Mastra tool の両方が同じスキーマを使う |
| **停止の常時受付** | `rail/stop` は冪等・ボディなし・リトライ可。`/dev` ダッシュボードでは `rail/stop` と `audio/stop` を**画面上部に固定した緊急ボタン**として常時表示（P3-E・予定）。device-panel にも停止ボタンを置く（P3-C・予定） | どの画面・どの状態からでも 1 クリックで停止できる |
| **タイムアウト** | `DEFAULT_TIMEOUT_MS`（5000）、HTTP は `AbortSignal.timeout`、WS は `ack` / `camera.frame` の待ち受けにタイマー（P3-A・予定） | 応答が来なくてもハングしない |
| **認証** | `createDevices` の `resolveHeaders`（`DEVICE_AUTH_TOKEN` → `Authorization: Bearer`） | 方式未確定のため暫定。§8 で確認する |
| **障害時の扱い** | 全公開 API が `DeviceResult` を返す。`createDevices` は実クライアント生成に失敗するとモックへフォールバックし警告ログを出す | 機器が落ちていても会話と UI は継続する |
| **接続管理** | `client/web/lib/devices.ts` の `getDevices()`（`globalThis` シングルトン・lazy connect）（P3-C・予定） | dev の HMR で WebSocket が増殖しない |

---

## 8. 未確定事項チェックリスト（機器チームへの質問）

回答が得られたら `docs/specs/robot-api-requirements.md` の「未確定事項」と本書を更新する。

- [ ] **IP アドレス**: ESP32 / スタックちゃん / Electron のそれぞれの IP は？ DHCP か固定か（DHCP なら mDNS 名 `xxx.local` はあるか）
- [ ] **ポート番号**: 各機器の待ち受けポートは？（HTTP 2 台と WS 1 台。SDK 既定はモックの 8791/8792/8793）
- [ ] **認証方式**: 認証はあるか。あるなら `Authorization: Bearer <token>` でよいか、別ヘッダ・クエリ・mTLS か。トークンの配布方法と有効期限は？
- [ ] **軸方向**: `axis` の `x` / `y` / `z` はそれぞれ物理的にどの向きか。`direction: 1` はどちら向きか（右/左、前/後、上/下）。原点・可動範囲・リミットスイッチの有無は？
- [ ] **速度**: 速度は固定か指定できるか。`duration_ms` 500 で実際に何 cm 動くか。安全な上限（現在の既定 3000ms）は妥当か
- [ ] **音声形式**: `audio.chunk` のコーデック・サンプリングレート・チャンネル数・1 チャンクの長さ。`seq` の採番規則（0 始まりか 1 始まりか、欠番はあるか）。`audio_base64` は生 PCM か圧縮済みか
- [ ] **対象ディスプレイ**: `desktop/screenshot` はどのディスプレイを撮るか（マルチモニタ時）。指定できるか。解像度・画像形式（PNG 固定か）。`desktop/browser/open` はどのブラウザで開くか、既存ウィンドウを再利用するか
- [ ] **`ack` / `error` の詳細スキーマ**: `error.code` の体系（値の一覧）と `ack.data` に入る内容
- [ ] **`rail/status` / `desktop/status` の追加フィールド**: `state` 以外に何が返るか
- [ ] **同時接続**: WebSocket / HTTP に複数クライアントが同時接続してよいか。排他制御はどちら側の責務か
- [ ] **ネットワーク**: 開発 PC と機器は同一 LAN / 同一 Wi-Fi SSID か。ゲスト Wi-Fi のクライアント分離は無効か

---

## 9. トラブルシュート

### 接続拒否（`ECONNREFUSED` / `fetch failed`）

- モック運用のつもりなら、モックサーバーが起動しているか（`pnpm --filter @workspace/devices mock`）。`lsof -i :8791 -i :8792 -i :8793` で待ち受けを確認。
- `RAIL_BASE_URL` に **`/api/v1` を付けていないか**。付けると `/api/v1/api/v1/rail/move` になって 404 になる。ベース URL は `http://host:port` まで。
- `DEVICE_MODE=real` にしたのに URL が空 → その機器は**モックのまま**動く（これは仕様）。ログの `[devices] ... モックを使用します` を確認。
- 実機の IP が変わった（DHCP）。§8 の IP を再確認。

### タイムアウト（応答が返らない）

- 既定 5000ms（`DEFAULT_TIMEOUT_MS` / `DEVICE_TIMEOUT_MS`）。機器が重い処理（スクリーンショット等）をするなら `DEVICE_TIMEOUT_MS` を伸ばす。
- `DeviceResult` は `ok:false` + `error` + `latencyMs` で返る。`latencyMs` がちょうどタイムアウト値ならこちら側で切っている、明らかに短ければ機器が即エラーを返している。
- **`rail/move` はタイムアウトしてもリトライしない**（安全要件）。機器が受理済みかもしれないので、不安なら `rail/stop` を送る。

### WS が `ack` を返さない

- 接続先パスを確認する。`STACKCHAN_WS_URL` は `ws://host:port` まで。`/ws/v1/robot` は SDK が付ける。手で `websocat` を叩くときは**パスを含めて** `ws://127.0.0.1:8793/ws/v1/robot`。
- 送信 JSON のエンベロープが `{ type, request_id, data }` になっているか。`request_id` が欠けていると `stackchanOutboundSchema` で弾かれる。
- SDK が採番する `request_id` は `req-<uuid>`（`createRequestId()`）。機器が `req-001` 形式を返してきても、**受信側は非空文字列まで緩めてある**（`inboundRequestIdSchema`）ので受け取れる。
- `wss://`（TLS）が必要な機器に `ws://` で繋いでいないか。
- 接続はできるが応答が無い場合、機器側が別クライアントに占有されている可能性（§8 の「同時接続」）。

### `request_id` 不一致

- SDK は送信時の `request_id` で応答を相関させる。機器が**別の ID を返す**、あるいは `ack` を返さず `camera.frame` だけ返すと、待ち受けがタイムアウトする。
- 切り分け: `onEvent` で inbound を全部ログに出す（受信生データが見える）か、`websocat` で生のやり取りを観察する。
- 機器側が `request_id` をエコーしない仕様なら、SDK 側の相関方式を変える必要がある → 機器チームに確認（§8）。
- 受信 JSON が壊れている / スキーマに合わない場合、`parseStackchanInbound` は例外にせず `null` を返して無視する。「何も起きていないように見える」ときはここを疑う。

### LAN 到達性

```bash
# 疎通
ping -c 3 192.168.1.21
# ポートが開いているか（macOS 標準の nc）
nc -zv 192.168.1.21 8080
# HTTP が返るか（ヘッダだけ）
curl -sS -i --max-time 3 http://192.168.1.21:8080/api/v1/rail/status
```

- 開発 PC と機器が**同じサブネット**にいるか（`ifconfig | grep 'inet '`）。
- Wi-Fi の**クライアント分離（AP isolation）**が有効だと端末間通信ができない。ゲスト SSID で起きがち。
- macOS のファイアウォールは外向きは基本ブロックしないが、VPN が有効だと LAN 宛が VPN に吸われることがある。切って試す。
- 機器が `127.0.0.1` にだけバインドしていると LAN からは届かない（機器側の設定）。

### Chrome から直接叩けない理由

ブラウザの JS から `http://192.168.1.21:8080/...` を直接 `fetch` してはいけない。

- **CORS**: 機器側が `Access-Control-Allow-Origin` を返さないので、`localhost:3000` 由来のリクエストはブロックされる。
- **Local Network Access**（Chrome 142 以降）: パブリック／ローカル間のリクエストに**事前の許可プロンプト**が必要になり、プリフライトも増える。ハッカソン当日の実機で確実に動く前提にできない。
- **Mixed Content**: ページが https のとき `http://` の機器へは繋げない。
- **認証情報**: `DEVICE_AUTH_TOKEN` をブラウザに配ると漏れる。

したがって**機器への到達は必ずサーバー側**（Route Handler / Mastra tool の `execute`）で行い、ブラウザは `/api/devices/*`（同一オリジン）だけを叩く。`/dev` ダッシュボードも同じ経路を使う。

---

## 10. 関連ドキュメント

- 仕様の正本: [`docs/specs/robot-api-requirements.md`](../specs/robot-api-requirements.md)
- 開発者ダッシュボード: [`docs/runbooks/dev-dashboard.md`](./dev-dashboard.md)
- SDK 実体: `packages/devices/src/{index,constants,schemas,types,wire,mock-servers}.ts`、モッククライアントは `packages/devices/src/mock/`
