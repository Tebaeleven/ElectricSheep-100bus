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
│  │  ├─ app/               # / と /api/chat, /api/robot/*
│  │  ├─ components.json    # shadcn add はここを -c で指す
│  │  └─ .env.example       # env の正本は client/web/.env.local
│  └─ desktop/README.md     # 将来の Tauri v2 方針（実装なし）
├─ server/                  # Supabase ローカル（config.toml / migrations / seed）
├─ packages/
│  ├─ agent/                # @workspace/agent  Mastra インスタンス・ghost Agent・tools・storage
│  ├─ robot/                # @workspace/robot  コマンド語彙(zod)・RobotClient・Mock・HTTP・モックサーバー
│  ├─ db/                   # @workspace/db     Supabase 生成型・サーバー専用 client・robot_commands ログ
│  ├─ ui/                   # @workspace/ui     shadcn 共有コンポーネント
│  ├─ eslint-config/ , typescript-config/
├─ scripts/wt-setup.sh      # pnpm wt setup <task> [base]
├─ docs/                    # セットアップ・開発ルール・runbook
├─ turbo.json , pnpm-workspace.yaml , .nvmrc , .worktreeinclude
```

## クイックスタート

前提: **Docker Desktop 起動済み** / **Node 22.13 以上**（`.nvmrc` = 22、実機は 26 系でも可） / **pnpm 10.x**（`packageManager: pnpm@10.34.5`）

```bash
# 1. 依存インストール
pnpm install

# 2. env を作る（正本は client/web/.env.local）
cp client/web/.env.example client/web/.env.local
#    GOOGLE_GENERATIVE_AI_API_KEY を書き込む（下の「環境変数」参照）

# 3. ローカル Supabase を起動（初回は Docker イメージの pull で数分かかる）
pnpm db:start
#    表示された secret key（sb_secret_...）を SUPABASE_SECRET_KEY に書き込む
#    再表示: pnpm exec supabase --workdir server status -o env | grep SECRET_KEY

# 4. ロボットのモックサーバー（別ターミナル）
pnpm robot:mock

# 5. Web アプリ
pnpm dev            # http://localhost:3000
```

Supabase を起動したくない場合は `.env.local` の `DATABASE_URL` をコメントアウトすれば、Mastra Memory は in-memory（LibSQL）にフォールバックして起動する。

詳細とトラブルシュートは [`docs/setup.md`](docs/setup.md)。

## 主要コマンド

| コマンド | 内容 |
|---|---|
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
| `pnpm wt setup <task> [base]` | 並列開発用の worktree を作る |

shadcn コンポーネントの追加は **`client/web` を指して**実行する（生成先は `packages/ui/src/components`）。

```bash
pnpm dlx shadcn@latest add button -c client/web
```

## ポート

| ポート | 用途 |
|---|---|
| 3000 | Next.js（`client/web`） |
| 4111 | Mastra Studio（`pnpm agent:studio`） |
| 54321 | Supabase API |
| 54322 | Supabase Postgres（`DATABASE_URL` の接続先） |
| 54323 | Supabase Studio |
| 8787 | ロボットモックサーバー（`ROBOT_MOCK_PORT`） |

並列開発時のポート割当は [`docs/development.md`](docs/development.md) を参照。

## 環境変数

正本は `client/web/.env.local`（`client/web/.env.example` をコピーして作る）。`packages/agent/.env` はそこへの symlink（`pnpm wt setup` が張る）で、`mastra dev` が読む。

| 変数 | 既定 / 例 | 説明 |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | （空） | Google Gemini API キー。https://aistudio.google.com/apikey で発行 |
| `GHOST_MODEL` | `google/gemini-3.8-flash` | 会話モデル。Mastra v1 のモデルルーター文字列 |
| `ROBOT_MODE` | `mock` | `mock` \| `http` |
| `ROBOT_BASE_URL` | `http://127.0.0.1:8787` | `ROBOT_MODE=http` のときの接続先 |
| `ROBOT_MOCK_PORT` | `8787` | モックサーバーの待ち受けポート |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Mastra Memory の保存先。未設定なら in-memory |
| `SUPABASE_URL` | `http://127.0.0.1:54321` | Supabase ローカル API |
| `SUPABASE_SECRET_KEY` | （空） | サーバー専用キー（`sb_secret_...`）。`pnpm exec supabase --workdir server status -o env \| grep SECRET_KEY` で取得。未設定なら `robot_commands` ログをスキップ |

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
| [`docs/runbooks/supabase.md`](docs/runbooks/supabase.md) | DB スキーマ変更・RLS・認証導入 |
| [`docs/runbooks/mastra.md`](docs/runbooks/mastra.md) | Studio・tool 追加・Memory・v1 の落とし穴 |
| [`docs/runbooks/robot.md`](docs/runbooks/robot.md) | 実機ロボット仕様受領後の差し替え手順 |
| [`client/desktop/README.md`](client/desktop/README.md) | 将来の Tauri v2 方針 |
| [`.claude/skills/dev-runbook/SKILL.md`](.claude/skills/dev-runbook/SKILL.md) | エージェント向けの開発手順まとめ |
