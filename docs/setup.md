# セットアップ詳細とトラブルシュート

[README](../README.md) のクイックスタートで動かない場合はここを見る。

## 1. ツールチェーン

| 対象 | 要求 | 確認 |
|---|---|---|
| Node | 22.13 以上（`.nvmrc` = 22、`engines.node: ">=22.13"`） | `node -v` |
| pnpm | 10.x（`packageManager: pnpm@10.34.5`） | `pnpm -v` |
| Docker | 起動していること（Supabase ローカルが使う） | `docker info` |

```bash
# Node を .nvmrc に合わせる
nvm use            # または fnm use / mise use

# pnpm を 10 系の最新に揃える
pnpm self-update 10
```

## 2. 依存インストール

```bash
pnpm install
```

ワークスペースは `client/*`, `packages/*`, `server/*`（`pnpm-workspace.yaml`）。主要な依存はルートの `catalog:` でバージョンを一元管理しているので、個別パッケージで直接バージョンを書かない。

## 3. 環境変数

```bash
cp client/web/.env.example client/web/.env.local
```

`client/web/.env.local` が**唯一の正本**。

### GOOGLE_GENERATIVE_AI_API_KEY

https://aistudio.google.com/apikey で発行して貼る（Google AI Studio）。未設定だと `/api/chat` が 500 とキー未設定の案内文を返す（ロボット操作 API `/api/robot/*` はキー無しでも動く）。

Mastra のモデルルーターは `GOOGLE_GENERATIVE_AI_API_KEY` と `GOOGLE_API_KEY` のどちらでも読む。追加の npm パッケージは要らない。

### SUPABASE_SECRET_KEY

`pnpm db:start` の出力に含まれる。起動後に取り出すには:

```bash
pnpm exec supabase --workdir server status -o env | grep SECRET_KEY
# SECRET_KEY="sb_secret_..."
```

新形式のキー（`sb_secret_...`）を使う。旧形式の JWT（`SERVICE_ROLE_KEY` の `eyJ...`）ではない。

未設定でもアプリは動く（`robot_commands` へのログだけスキップされる。`packages/db/src/server.ts` の `createServiceClient` が `null` を返す）。

### packages/agent/.env は symlink

Mastra CLI（`mastra dev`）は**パッケージ直下の `.env`** を読む。そのためリポジトリでは

```
packages/agent/.env -> ../../client/web/.env.local
```

という symlink を張っている。`pnpm wt setup` が worktree 作成時に自動で作る（`scripts/wt-setup.sh` 末尾）。clone 直後や手動 `git worktree add` の場合は自分で張る。

```bash
ln -sfn ../../client/web/.env.local packages/agent/.env
```

`.env*` は `.gitignore` 対象（`!.env.example` だけ例外）なのでコミットされない。

## 4. 起動

```bash
pnpm db:start      # Supabase（初回は Docker イメージ pull で数分）
pnpm robot:mock    # ロボットモック 8787
pnpm dev           # web 3000
pnpm agent:studio  # Mastra Studio 4111（任意）
```

疎通確認:

```bash
curl -X POST localhost:3000/api/robot/command \
  -H 'content-type: application/json' \
  -d '{"type":"emote","emotion":"happy"}'

curl localhost:3000/api/robot/status
```

---

## トラブルシュート

### Docker が起動していない

`pnpm db:start` が `Cannot connect to the Docker daemon` / `failed to inspect container health` で落ちる。Docker Desktop を起動してから再実行する。

**Docker 無しで開発を続ける回避策**: `.env.local` の `DATABASE_URL` をコメントアウトする。`packages/agent/src/mastra/storage.ts` の `createStorage` が `LibSQLStore({ url: ':memory:' })` にフォールバックし、会話はプロセス内メモリだけで動く（再起動で履歴は消える）。`SUPABASE_SECRET_KEY` も空にしておけば `robot_commands` ログもスキップされる。

### ポートが埋まっている

| ポート | 犯人になりやすいもの | 対処 |
|---|---|---|
| 3000 | 別の Next プロジェクト | `PORT=3001 pnpm dev` |
| 4111 | 別の `mastra dev` | 前のプロセスを止める |
| 8787 | 前回の `pnpm robot:mock` | `ROBOT_MOCK_PORT=8788 pnpm robot:mock`（`ROBOT_BASE_URL` も合わせる） |
| 54321-54323 | 別プロジェクトの Supabase | そちらを `supabase stop` する |

使用中プロセスの確認:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

並列開発中のポート割当は [development.md](development.md) の表に従う。

### リクエスト時に Mastra 関連のエラーで落ちる（`serverExternalPackages` 忘れ）

Mastra は Node ネイティブ依存を持つため、Next のバンドル対象から外す必要がある。`client/web/next.config.ts` に以下が入っていること。

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["@mastra/*"],
  transpilePackages: [
    "@workspace/ui",
    "@workspace/agent",
    "@workspace/robot",
    "@workspace/db",
  ],
}
```

これが無いと、ビルドは通るのに `/api/chat` を叩いた瞬間にモジュール解決エラーになる。Route Handler 側には `export const runtime = 'nodejs'` も必要（Edge では動かない）。

### チャットのストリームが UI に描画されない（`version: 'v7'` 忘れ）

`@mastra/ai-sdk` の `handleChatStream` は **`version` の既定が `'v5'`**。このリポジトリは AI SDK 7（`ai@7.0.x` / `@ai-sdk/react`）なので、明示しないとプロトコル不一致で `useChat` が何も表示しない、または途中で切れる。

```ts
const stream = await handleChatStream({
  mastra,
  agentId: GHOST_AGENT_ID,
  version: "v7",   // ← 必須
  params,
})
return createUIMessageStreamResponse({ stream })
```

参考: https://mastra.ai/reference/ai-sdk/handle-chat-stream

### `createTool` の `execute` が `undefined` を受け取る（v1 のシグネチャ）

Mastra v1 の `createTool` は `execute(input, context)` の **2 引数**。0.x の `execute({ context })` 形式で書くと入力が取れない。

```ts
// v1（正）
execute: async (input, context) => {
  const client = createRobotClient(process.env)
  return client.sendCommand(input, context.abortSignal)
}

// 0.x（誤）
execute: async ({ context }) => { /* ... */ }
```

モデル指定も v1 では**文字列**（`'google/gemini-3.8-flash'`）。`@ai-sdk/google` の `google(...)` を渡す旧形式は使わない。

なお `robotCommand` の `inputSchema` は、正本の `robotCommandSchema`（discriminated union）ではなく**フラット化した object**（`robotCommandInputSchema`）にしている。tool の入力スキーマはトップレベルが object である必要があるため。詳細は [runbooks/mastra.md](runbooks/mastra.md)。

### Memory の履歴が混ざる / 残らない

`Memory` は `threadId`（会話単位）と `resourceId`（来場者単位）で分離する。`MemoryConfig` にトップレベルの `scope` は無く、`lastMessages` は常にそのスレッド内だけを見る。

`/api/chat` に送るボディはこの形（履歴は Mastra Memory が復元するので**最新 1 メッセージだけ**送る）:

```jsonc
{
  "messages": [
    { "id": "...", "role": "user", "parts": [{ "type": "text", "text": "こんにちは" }] }
  ],
  "memory": { "thread": "<localStorage の UUID>", "resource": "<来場者 ID>" }
}
```

これがそのまま `handleChatStream({ mastra, agentId, version: "v7", params })` の `params` になる。詳細は [runbooks/mastra.md](runbooks/mastra.md)。

履歴が再起動で消える場合は `DATABASE_URL` が設定されているか確認する（未設定だと in-memory）。

### `packages/*` の相対 import に `.js` を付けない

`packages/{agent,robot,db}` は**ビルドせず TS ソースのまま** `client/web` から読まれる（`transpilePackages`）。`tsconfig` は `moduleResolution: "Bundler"` なので、相対 import は**拡張子なし**で書く。

```ts
import { createStorage } from "./storage"     // 正
import { createStorage } from "./storage.js"  // 誤: Turbopack が .ts に解決できずビルドが落ちる
```

`tsc` / `vitest` / `mastra dev` はいずれも拡張子なしで解決できる（`mastra dev` の起動も確認済み）。将来 `packages/*` を `dist` にビルドして配る形へ変えるときは、この前提から見直すこと。

### `packages/db` で `server-only` を import しない

`packages/db/src/server.ts` は `server-only` を使わず、`createServiceClient` の中の実行時ガード（`typeof window !== "undefined"` なら throw）でブラウザ実行を止めている。

`server-only` は Next のバンドラ外（`mastra dev` = 素の Node、vitest）で import した瞬間に例外になるため、Studio が起動できず、テストでも `vi.mock("server-only")` が要るようになる。効果（ブラウザに漏らさない）は実行時ガードで十分に得られる。

### pnpm のバージョン不一致

```
Error: This project is configured to use pnpm@10.34.5
```

`packageManager` フィールドと手元の pnpm が食い違っている。`pnpm self-update 10` で 10 系に揃える。Corepack を使っている場合は `corepack enable && corepack prepare pnpm@10.34.5 --activate`。**`packageManager` の値を手元に合わせて書き換えない**（全員の環境に影響する）。

### `mastra dev` がモノレポで directory import エラーになる

既知の問題（mastra#6216）。ルートから直接叩かず、必ず `pnpm --filter` 経由（= `pnpm agent:studio`）で起動する。それでも解決しない場合は Studio を諦め、`/api/chat` 経由の動作確認に切り替える。

### `pnpm db:types` の出力が空 / 壊れる

`pnpm db:start` で Supabase が起動している状態でないと生成できない。`supabase --workdir server gen types typescript --local` がリダイレクトで `packages/db/src/database.types.ts` を上書きするため、失敗すると空ファイルになる。起動を確認してから再実行する。
