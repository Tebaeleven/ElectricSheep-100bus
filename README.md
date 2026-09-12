# ElectricSheep-100bus

空中に浮かぶ**おばけロボット**とテキストで会話できる Web アプリ。ブラウザのチャット画面から話しかけると、LLM エージェント（Mastra）が返事を返し、必要に応じてロボットに動作コマンド（移動・停止・感情表現）を送る。すべてローカル環境で完結する構成。

- 会話は**テキストのみ**（音声なし）
- LLM 層は **Mastra v1**（`packages/agent`）。Next.js の Route Handler から同一プロセスで呼ぶ
- ロボットは **HTTP API**。実機仕様が届くまでは**モック**で開発する（`ROBOT_MODE=mock`）
- 会話履歴は **Mastra Memory**（ローカル Supabase の Postgres、`mastra` スキーマ）

## アーキテクチャ

```mermaid
flowchart LR
  Browser["ブラウザ<br/>client/web（React 19 / @ai-sdk/react useChat）"]
  RH["Next.js Route Handler<br/>POST /api/chat, /api/robot/*<br/>runtime = nodejs"]
  Agent["Mastra Agent（ghost-agent）<br/>@workspace/agent"]
  Tools["tools: robotCommand / robotStatus<br/>@workspace/robot の zod 語彙を共用"]
  Robot["ロボット HTTP API<br/>実機 or モックサーバー(8787)"]
  PG[("Supabase Postgres 54322<br/>mastra スキーマ（Memory）<br/>public.robot_commands（ログ）")]

  Browser -->|fetch /api/chat| RH
  RH -->|handleChatStream version v7| Agent
  Agent --> Tools
  Tools -->|HTTP| Robot
  Agent -->|Memory: thread / resource| PG
  Tools -->|logRobotCommand| PG
  RH -->|UIMessageStream| Browser
```

**ロボットへの到達は必ずサーバー側（Route Handler / tool の `execute`）から行う。** ブラウザから LAN のロボットを直叩きしない（Chrome の Local Network Access 制約と CORS を回避するため）。詳細は [`docs/runbooks/robot.md`](docs/runbooks/robot.md)。

## ディレクトリ構成

```
ElectricSheep-100bus/
├─ client/
│  ├─ web/                  # Next.js 16 App Router（チャット UI + Route Handler）
│  │  ├─ app/               # /, /dev, /api/chat, /api/robot/*, /api/devices/*, /api/dev/env
│  │  ├─ components.json    # shadcn add はここを -c で指す
│  │  └─ .env.example       # env の正本は client/web/.env.local
│  └─ desktop/README.md     # 将来の Tauri v2 方針（実装なし）
├─ server/                  # Supabase ローカル（config.toml / migrations / seed）
├─ packages/
│  ├─ agent/                # @workspace/agent  Mastra インスタンス・ghost Agent・tools・storage
│  ├─ robot/                # @workspace/robot  コマンド語彙(zod)・RobotClient・Mock・HTTP・モックサーバー
│  ├─ devices/              # @workspace/devices 機器 API SDK（レール/スタックちゃん/デスクトップ・モック 3 台）
│  ├─ db/                   # @workspace/db     Supabase 生成型・サーバー専用 client・robot_commands ログ
│  ├─ ui/                   # @workspace/ui     shadcn 共有コンポーネント
│  ├─ eslint-config/ , typescript-config/
├─ firmware/                # 実機ファームの正本（メンバー実装を取り込み）
│  ├─ esp32-rail/           # 天井レール ESP32（PlatformIO / firmware/rail_dc が本命・HTTP /api/v1/rail/*）
│  └─ stackchan/            # おばけ本体 M5Stack CoreS3（ESP-IDF / Stack-chan + Xiaozhi）
├─ scripts/wt-setup.sh      # pnpm wt setup <task> [base]
├─ docs/                    # セットアップ・開発ルール・runbook
├─ turbo.json , pnpm-workspace.yaml , .nvmrc , .worktreeinclude
```

## クイックスタート

前提: **Docker Desktop 起動済み** / **Node 22.13 以上**（`.nvmrc` = 22、実機は 26 系でも可） / **pnpm 10.x**（`packageManager: pnpm@10.34.5`）

```bash
# 1. 依存インストール
pnpm install
pnpm --dir client/desktop install   # Electron を使うとき（client/desktop はルート workspace 外）

# 2. env を作る（正本は client/web/.env.local）
cp client/web/.env.example client/web/.env.local
#    GOOGLE_GENERATIVE_AI_API_KEY を書き込む（下の「環境変数」参照）

# 3. 必要なものを 1 コマンドで全部起動
pnpm run up          # モック構成（Supabase + モック + Web 3000 + Studio 4111）
pnpm run up real     # Electron 実機（Ghost Companion）に繋ぐ構成
pnpm run up demo     # 本番デモ構成（Studio とモックを外し、チャット画面だけ開く）
pnpm run up web      # Web 3000 だけ

# 停止（Ctrl+C だと Supabase と Electron は残る）
pnpm down            # このリポジトリのプロセスを止める
pnpm down --all      # Supabase（Docker）も止める
```

> **`pnpm up` ではなく `pnpm run up`。** `up` は pnpm 自身のコマンド（`pnpm update` の別名）なので、
> `pnpm up` と書くと依存の更新が走ってしまう。`pnpm run up`（または同じものを指す `pnpm start`）と書くこと。
> 停止の `pnpm down` はそのままで問題ない。

`pnpm run up` は起動前に `pnpm ports:check` 相当の確認を行い、**使うポートを別のプロセスが掴んでいたら
起動せずに止まる**（同じ役割のものが既に動いていれば再利用する）。全サービスの readiness を HTTP で確認して
サマリー表を出し、ブラウザで `http://localhost:3000` と `http://localhost:3000/dev` を開く（`--no-open` で抑止）。
**Ctrl+C で自分が起動した子プロセスを全部停止**する（Supabase と Electron は残るので `pnpm down --all`）。

プロファイル表・内部動作・よくある失敗・デモ当日のチェックリストは
[`docs/runbooks/launch.md`](docs/runbooks/launch.md)。

> **`/dev` は認証なし・ローカル専用**。`/dev` と `/api/dev/*`・`/api/devices/*` には認証が無く、開けば誰でも機器を動かせる。`localhost` からのみ使い、`next dev` を `--hostname 0.0.0.0` で公開したり、トンネル（ngrok / Cloudflare Tunnel 等）で外に出したりしないこと。詳細は [`docs/runbooks/dev-dashboard.md`](docs/runbooks/dev-dashboard.md)。

個別に起動したいとき（`pnpm run up` を使わない場合）は次の通り。`pnpm db:start` の表示する
secret key（`sb_secret_...`）を `SUPABASE_SECRET_KEY` に入れておく（再表示: `pnpm db:status`）。

```bash
pnpm db:start       # ローカル Supabase（初回は Docker イメージの pull で数分）
pnpm robot:mock     # ロボットモック 8787
pnpm devices:mock   # 機器モック 3 台 8791 / 8792 / 8793
pnpm dev            # web 3000
pnpm agent:studio   # Mastra Studio 4111
```

`DEVICE_MODE=mock`（既定）は**プロセス内モック**なので `pnpm devices:mock` は不要。8791-8793 のモックサーバーまで
含めて実 HTTP / WebSocket 経路を試すときは env を上書きして起動する（`pnpm run up real` は同じことを
デスクトップだけ Electron 実機 8801 に向けて行う。`.env.local` は書き換えない）。

```bash
DEVICE_MODE=real \
RAIL_BASE_URL=http://127.0.0.1:8791 \
DESKTOP_BASE_URL=http://127.0.0.1:8792 \
STACKCHAN_WS_URL=ws://127.0.0.1:8793 \
PORT=3000 pnpm --filter web dev
```

Supabase を起動したくない場合は `.env.local` の `DATABASE_URL` をコメントアウトすれば、Mastra Memory は in-memory（LibSQL）にフォールバックして起動する。

詳細とトラブルシュートは [`docs/setup.md`](docs/setup.md)。

## 主要コマンド

| コマンド | 内容 |
|---|---|
| **`pnpm run up [profile]`** | **必要なものを 1 コマンドで起動**（`mock` / `real` / `demo` / `web`。[`docs/runbooks/launch.md`](docs/runbooks/launch.md)）。`pnpm up` は pnpm の update なので `run` を付ける |
| **`pnpm down [--all]`** | 起動したプロセスを停止（`--all` で Supabase も） |
| `pnpm dev` | 全パッケージの dev（web は 3000） |
| `pnpm verify` | `turbo run lint typecheck test build`。**納品ゲート** |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 個別タスク |
| `pnpm format` | Prettier |
| `pnpm db:start` / `pnpm db:stop` | ローカル Supabase の起動 / 停止 |
| `pnpm db:reset` | migrations + seed を当て直す（データは消える） |
| `pnpm db:status` | URL・キー類の再表示 |
| `pnpm db:types` | 生成型を `packages/db/src/database.types.ts` に出力 |
| `pnpm agent:studio` | Mastra Studio（http://localhost:4111） |
| `pnpm robot:mock` | ロボットモックサーバー（既定 8787） |
| `pnpm devices:mock` | 機器モック 3 台（レール 8791 / デスクトップ 8792 / スタックちゃん 8793） |
| `pnpm ports:check` | ポート台帳と実際の LISTEN を突き合わせる（[`docs/ports.md`](docs/ports.md)） |
| `pnpm wt setup <task> [base]` | 並列開発用の worktree を作る |

shadcn コンポーネントの追加は **`client/web` を指して**実行する（生成先は `packages/ui/src/components`）。

```bash
pnpm dlx shadcn@latest add button -c client/web
```

## ポート

割当の**正本は [`scripts/ports.json`](scripts/ports.json)**、人間向けの説明は [`docs/ports.md`](docs/ports.md)。起動前に確認できる。

```bash
pnpm ports:check          # 台帳と実際の LISTEN を突き合わせる（衝突なら終了コード 1）
pnpm ports:free 8792      # そのポートを掴んでいる PID を表示（--kill で停止）
```

| ポート | 用途 |
|---|---|
| 3000 | Next.js（`client/web`。`/dev` は開発者ダッシュボード） |
| 3100 | Next.js（`client/desktop` の Electron 表示用 UI、`DESKTOP_NEXT_PORT`） |
| 4111 | Mastra Studio（`pnpm agent:studio`） |
| 8787 | ロボットモックサーバー（`ROBOT_MOCK_PORT`） |
| 8791-8793 | 機器モック 3 台（`pnpm devices:mock`。レール / デスクトップ / スタックちゃん） |
| **8801** | Desktop API: Electron 実機（`client/desktop`、`DESKTOP_API_PORT`）。**使用中でもずらさず警告して API だけ無効**。8802 以降は将来のローカルブリッジ用に予約 |
| 54321-54323 | Supabase（API / Postgres / Studio） |

モック（8792）と Electron 実機（8801）、`client/web`（3000）と `client/desktop` の Next（3100）はそれぞれ帯が分かれているので**同時に起動できる**。並列開発時のポートずらしは [`docs/development.md`](docs/development.md) を参照。

## 環境変数

正本は `client/web/.env.local`（`client/web/.env.example` をコピーして作る）。`packages/agent/.env` はそこへの symlink（`pnpm wt setup` が張る）で、`mastra dev` が読む。

| 変数 | 既定 / 例 | 説明 |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | （空） | Google Gemini API キー。https://aistudio.google.com/apikey で発行 |
| `GHOST_MODEL` | `google/gemini-3.8-flash` | 会話モデル。Mastra v1 のモデルルーター文字列 |
| `ROBOT_MODE` | `mock` | `mock` \| `http` |
| `ROBOT_BASE_URL` | `http://127.0.0.1:8787` | `ROBOT_MODE=http` のときの接続先 |
| `ROBOT_MOCK_PORT` | `8787` | モックサーバーの待ち受けポート |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Mastra Memory の保存先。既定値は Supabase ローカルのもの（`supabase start` が生成）。未設定なら in-memory |
| `SUPABASE_URL` | `http://127.0.0.1:54321` | Supabase ローカル API |
| `SUPABASE_SECRET_KEY` | （空） | サーバー専用キー（`sb_secret_...`）。`pnpm exec supabase --workdir server status -o env \| grep SECRET_KEY` で取得。未設定なら `robot_commands` ログをスキップ |
| `DEVICE_MODE` | `mock` | `mock` \| `real`。機器 API の接続先。詳細は [`docs/runbooks/devices.md`](docs/runbooks/devices.md) |
| `RAIL_BASE_URL` | `http://127.0.0.1:8791` | ESP32 レールの `http://host:port`（`/api/v1` は付けない） |
| `DESKTOP_BASE_URL` | `http://127.0.0.1:8792` | デスクトップの `http://host:port`。モック = 8792 / Electron 実機 = 8801（[`docs/ports.md`](docs/ports.md)） |
| `STACKCHAN_WS_URL` | `ws://127.0.0.1:8793` | スタックちゃんの `ws://host:port`（`/ws/v1/robot` は付けない） |
| `DEVICE_AUTH_TOKEN` | （空） | 設定時に全機器へ `Authorization: Bearer` を付与（方式未確定） |
| `DEVICE_RAIL_MAX_DURATION_MS` | `3000` | `rail/move` の `durationMs` 上限（安全要件） |
| `DEVICE_TIMEOUT_MS` | `5000` | 機器 HTTP / WS のタイムアウト |

`turbo.json` の `globalEnv` に全件登録済み（値が変わるとキャッシュが無効化される）。

## モデルの切り替え

`GHOST_MODEL` を書き換えるだけでよい。Mastra v1 はモデルを**文字列**で指定する（`provider/model` 形式）。

```bash
GHOST_MODEL=google/gemini-3.8-flash        # 既定（速度重視）
GHOST_MODEL=google/gemini-2.5-flash        # さらに安い
GHOST_MODEL=google/gemini-3.1-pro-preview  # 品質重視（遅い・高い）
```

利用できる文字列の一覧は https://mastra.ai/models/providers/google を参照。キーは `GOOGLE_GENERATIVE_AI_API_KEY`（`GOOGLE_API_KEY` でも可）で、追加パッケージは不要。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [`docs/setup.md`](docs/setup.md) | 詳細セットアップとトラブルシュート |
| [`docs/development.md`](docs/development.md) | 並列開発ルール・ファイル所有権・worktree 運用 |
| [`docs/runbooks/launch.md`](docs/runbooks/launch.md) | `pnpm run up` / `pnpm down` のプロファイル・内部動作・デモ当日チェックリスト |
| [`docs/runbooks/supabase.md`](docs/runbooks/supabase.md) | DB スキーマ変更・RLS・認証導入 |
| [`docs/runbooks/mastra.md`](docs/runbooks/mastra.md) | Studio・tool 追加・Memory・v1 の落とし穴 |
| [`docs/runbooks/robot.md`](docs/runbooks/robot.md) | 実機ロボット仕様受領後の差し替え手順 |
| [`docs/runbooks/devices.md`](docs/runbooks/devices.md) | 機器 API（ESP32 レール / スタックちゃん / Electron）の env・モック起動・curl 例・安全要件 |
| [`docs/runbooks/dev-dashboard.md`](docs/runbooks/dev-dashboard.md) | 開発者ダッシュボード [`/dev`](http://localhost:3000/dev) の使い方・エンドポイント追加手順 |
| [`docs/runbooks/network.md`](docs/runbooks/network.md) | ハッカソン会場の接続手順（推奨構成・決定木・当日チェックリスト・切り分けコマンド） |
| [`docs/reports/network-connectivity.html`](docs/reports/network-connectivity.html) | 会場ネットワーク接続の調査レポート（構成パターン A〜G・ESP32/スタックちゃんの接続可否・IP/ポート・Electron の localhost・クラウド中継） |
| [`docs/specs/robot-api-requirements.md`](docs/specs/robot-api-requirements.md) | 受領した機器 API 要件定義（仕様の正本）。§8 に実機ファームとの差分 |
| [`firmware/README.md`](firmware/README.md) | 実機ファーム（ESP32 レール / スタックちゃん）の機器一覧・書き込み手順・SSID/ポート運用・SDK との差分表 |
| [`docs/diagrams/README.md`](docs/diagrams/README.md) | 資料用ダイアグラム 6 点（ユースケース / コンテキスト / システム・ソフトウェアアーキテクチャ / 依存 / こだわり）と共通スタイルガイド・PNG 再出力手順 |
| [`docs/runbooks/desktop.md`](docs/runbooks/desktop.md) | デスクトップ（Electron / Ghost Companion）の起動・Desktop API・画面収録権限・curl 例 |
| [`client/desktop/README.md`](client/desktop/README.md) | デスクトップアプリ（Next.js + Electron）本体 |
| [`client/desktop/README.tauri-plan.md`](client/desktop/README.tauri-plan.md) | 旧・Tauri v2 化の検討メモ（参考） |
| [`.claude/skills/dev-runbook/SKILL.md`](.claude/skills/dev-runbook/SKILL.md) | エージェント向けの開発手順まとめ |
