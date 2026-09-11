# 開発者ダッシュボード `/dev` runbook

> 全 API エンドポイントを**認証なし・手作業で**実行できる開発者用画面。入力と実行のしやすさ最優先。
> 実装済み（`chore/integration3` で develop に統合）。実体は `client/web/app/dev/page.tsx`、`client/web/components/dev/**`、`client/web/lib/dev/**`、`client/web/app/api/dev/env/route.ts`。

---

## 1. 起動

```bash
# 1) 機器モックを 3 台起動（rail 8791 / desktop 8792 / stackchan 8793）
pnpm devices:mock

# 2) 別ターミナルで web を起動
pnpm dev
```

ブラウザで **http://localhost:3000/dev** を開く。トップページ（`/`）のヘッダーにも `/dev` へのリンクがある（`client/web/app/page.tsx`）。

前提の env（`client/web/.env.local`）は [`docs/runbooks/devices.md` §2](./devices.md#2-env-一覧) を参照。既定の `DEVICE_MODE=mock` なら実機なしで全ボタンが動く。

---

## 2. 画面構成

3 ペイン構成。

| 位置 | 内容 |
| --- | --- |
| **ヘッダー（上部固定）** | 現在の `DEVICE_MODE`・各機器 URL・接続状態。`GET /api/dev/env` と `GET /api/devices/*/status` から取得。**緊急停止ボタン（`rail/stop` と `audio/stop`）を常時表示** |
| **左** | 機器グループ別のエンドポイント一覧（`chat` / `robot` / `rail` / `desktop` / `stackchan` / `dev`）。method バッジ（GET / POST）と path を表示 |
| **中央** | 選択中エンドポイントのフォーム（自動生成タブ / JSON 直編集タブ）とプリセット、実行ボタン |
| **右（狭い画面では下）** | レスポンス: HTTP status・latency・JSON ツリー（折りたたみ・コピー）・画像・SSE の逐次表示。下に履歴 |

### 対象エンドポイント

`/api/chat`、`/api/robot/command`、`/api/robot/status`、`/api/devices/rail/move|stop|status`、`/api/devices/desktop/screenshot|browser/open|status`、`/api/devices/stackchan/hand|camera|audio/start|audio/stop|audio/recent|status`、`/api/dev/env` の **16 エントリ**が `client/web/lib/dev/endpoints.ts` に定義済み（id は `chat.send` / `robot.command` / `rail.move` … / `dev.env`）。

---

## 3. 使い方

### プリセット

フォーム上部のボタンを押すと入力が一発で埋まる。代表例:

| グループ | プリセット |
| --- | --- |
| レール | `x+ 500ms` / `y- 300ms` / `z+ 1000ms` |
| ハンド | `open` / `closed` |
| デスクトップ | `https://example.com` を開く |

「とりあえず動かす」はプリセット → 実行の 2 クリックで済む。値を変えたいときだけフォームを触る。

### フォーム（自動生成）

`inputSchema`（zod）から UI を生成する。

| zod 型 | UI |
| --- | --- |
| `z.enum(...)` | Select / セグメントコントロール |
| `z.number()` | スライダー + 数値入力（`durationMs` は**上限 `DEVICE_RAIL_MAX_DURATION_MS` を表示**） |
| `z.boolean()` | Switch |
| `z.string().url()` | Input（http/https のみ許可されることを添える） |

入力は送信前にクライアント側でも zod で検証する。サーバー側（Route Handler）も同じスキーマで検証して 400 を返すので、二重に守られる。

### JSON 直編集タブ

フォームでは表現しづらい値や、機器チームからもらった生 JSON をそのまま試したいときに使う。

- textarea に JSON を直接書く。整形ボタンあり。
- 検証エラーはエラー行を示して表示する。
- フォームタブと JSON タブは同じ入力状態を共有するので、往復できる。

### 実行

- 中央下の**大きな実行ボタン**、またはキーボードショートカット **`Cmd+Enter`（macOS）/ `Ctrl+Enter`（Windows・Linux）**。フォーカスが textarea の中にあっても効く。
- 実行中はスピナーを表示し、二重送信を防ぐためボタンを無効化する。

### 緊急停止

- ヘッダーに **`rail/stop`** と **`audio/stop`** を常時表示のボタンとして固定する。どのエンドポイントを選んでいても、1 クリックで停止を送れる。
- `rail/stop` は冪等なので連打してよい（安全側の操作としてリトライも許可されている）。
- 安全要件との対応は [`docs/runbooks/devices.md` §7](./devices.md#7-安全要件の実装マッピング)。

### レスポンス

- **HTTP status と latency** を最初に表示する。`DeviceResult` の `latencyMs`（機器までの往復）と、ブラウザから Next までの実測を区別して見られる。
- **JSON ツリー**: 折りたたみ可能。全体コピーのボタンあり。
- **`responseKind: 'image'`**（`desktop/screenshot`・`stackchan/camera`）: `data.imageBase64` を `data:<mimeType>;base64,` を付けて `<img>` で描画する。**表示のみでダウンロードはしない**（base64 は Data URL 接頭辞なしで届くので、接頭辞は UI 側で付ける）。
- **`responseKind: 'stream'`**（`/api/chat`）: SSE をそのまま逐次追記表示する。整形せず生のイベントを流すので、AI SDK v7 のストリーム形式のデバッグに使える。

### 履歴 / curl コピー

- 直近 **50 件**（endpoint・入力・status・latency・時刻）を **localStorage** に保持する。ページをリロードしても残る。
- 履歴の行をクリックすると**入力が復元**される。そのまま再実行できる。
- 各行に **curl コマンドのコピー**ボタン。ターミナルでの再現や、他メンバーへの共有に使う。

---

## 4. エンドポイントを追加する手順

エンドポイント定義は **`client/web/lib/dev/endpoints.ts` の 1 か所**に集約されている。Route Handler の実装とは独立に、契約から起こした定義を置く。**追加は 1 エントリ足すだけ**で、左の一覧・フォーム・プリセット・実行・履歴が全部付いてくる。

```ts
// client/web/lib/dev/endpoints.ts
{
  id: 'devices.rail.move',
  group: 'rail',                       // 'chat' | 'robot' | 'rail' | 'desktop' | 'stackchan' | 'dev'
  method: 'POST',
  path: '/api/devices/rail/move',
  description: 'レールを指定軸・方向に指定時間だけ動かす（リトライしない）',
  inputSchema: railMoveSchema,         // @workspace/devices の zod スキーマを再利用する
  defaultInput: { axis: 'x', direction: 1, durationMs: 500 },
  presets: [
    { label: 'x+ 500ms',  input: { axis: 'x', direction: 1,  durationMs: 500 } },
    { label: 'y- 300ms',  input: { axis: 'y', direction: -1, durationMs: 300 } },
    { label: 'z+ 1000ms', input: { axis: 'z', direction: 1,  durationMs: 1000 } },
  ],
  responseKind: 'json',                // 'json' | 'image' | 'stream'
}
```

手順:

1. Route Handler を実装する（`client/web/app/api/...`）。
2. `endpoints.ts` に上の形で 1 エントリ追加する。`inputSchema` は**新しく書かず `@workspace/devices` のスキーマを再利用**する（画面とサーバーで検証がズレないため）。
3. 画像を返すなら `responseKind: 'image'`、SSE なら `'stream'`。
4. よく使う値は `presets` に入れておく。当日の動作確認が速くなる。

UI コンポーネント側は触らなくてよい。

---

## 5. 注意: 認証なし・ローカル限定

- `/dev` と `/api/dev/env` には**認証が無い**。開けば誰でも機器を動かせる。
- **`localhost` からのみ使う**。`next dev` を `--hostname 0.0.0.0` で公開したり、トンネル（ngrok / Cloudflare Tunnel 等）で外に出したりしない。
- 展示・デモ中は `/dev` を開いたタブを来場者の手が届く画面に出さない。誤操作で機器が動く。
- `GET /api/dev/env` は**秘密でない env のみ**返す。`DEVICE_AUTH_TOKEN` や `GOOGLE_GENERATIVE_AI_API_KEY` のようなキー類は値を返さず **「設定済み / 未設定」の真偽値だけ**返す。ここに値を足さないこと。
- 本番相当のデプロイを行う場合は、`/dev` と `/api/dev/*` を**ビルドから外すかミドルウェアで 404 にする**（当面ローカル運用のみなので未対応）。

### `GET /api/dev/env` のレスポンス例

```json
{
  "deviceMode": "mock",
  "railBaseUrl": "http://127.0.0.1:8791",
  "desktopBaseUrl": "http://127.0.0.1:8792",
  "stackchanWsUrl": "ws://127.0.0.1:8793",
  "robotMode": "mock",
  "robotBaseUrl": "http://127.0.0.1:8787",
  "ghostModel": "google/gemini-3.8-flash",
  "secrets": {
    "DATABASE_URL": true,
    "SUPABASE_SECRET_KEY": true,
    "GOOGLE_GENERATIVE_AI_API_KEY": true
  }
}
```

`secrets` は**値を返さず設定済みかどうかの真偽値だけ**。ヘッダーの「キー未設定」表示に使う。

---

## 6. 関連ドキュメント

- 機器 API 接続 runbook: [`docs/runbooks/devices.md`](./devices.md)
- 仕様の正本: [`docs/specs/robot-api-requirements.md`](../specs/robot-api-requirements.md)
