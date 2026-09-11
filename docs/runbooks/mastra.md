# Runbook: Mastra（おばけエージェント）

会話ロジックは `packages/agent`（`@workspace/agent`）に集約している。Next.js の `POST /api/chat` は `@mastra/ai-sdk` の `handleChatStream` を呼ぶだけで、同一プロセスで Mastra が動く。

```
packages/agent/src/mastra/
├─ index.ts            # export: mastra, ghost, GHOST_AGENT_ID, createStorage
├─ agents/ghost.ts     # おばけロボットの Agent（instructions / model / memory / tools）
├─ storage.ts          # DATABASE_URL の有無で Postgres / LibSQL を分岐
└─ tools/robot.ts      # robotCommand / robotStatus（E レーンで追加予定）
```

## Studio

```bash
pnpm agent:studio     # = pnpm --filter @workspace/agent dev = mastra dev --dir src/mastra
```

- http://localhost:4111 — エージェントとのチャット、tool の単体実行、トレース閲覧
- http://localhost:4111/swagger-ui — 生成された REST API の確認
- `.env` は **パッケージ直下**（`packages/agent/.env` → `client/web/.env.local` の symlink）を読む
- モノレポでの directory import エラー（mastra#6216）を避けるため、必ず `pnpm --filter` 経由で起動する

Studio は `DATABASE_URL` 無しでも動く（in-memory ストレージ）。Postgres への永続化を確認したいときだけ `pnpm db:start` してから起動する。

## tool を追加する

1. `packages/agent/src/mastra/tools/` にファイルを足し、`createTool` で定義する
2. `agents/ghost.ts` の `tools: { ... }` に登録する
3. `pnpm agent:studio` の Tools タブで単体実行して入出力を確認する
4. UI 側では AI SDK の `tool-<toolName>` part として流れてくるので、C レーンが描画する（例: `tool-robotCommand` を「ロボットが動いています」演出に使う）

```ts
import { createTool } from "@mastra/core/tools"
import { robotCommandSchema, createRobotClient } from "@workspace/robot"

export const robotCommand = createTool({
  id: "robotCommand",
  description: "おばけロボットを動かす。移動・停止・発話・感情表現ができる。",
  inputSchema: robotCommandSchema,
  // v1 は (input, context) の 2 引数
  execute: async (input, context) => {
    const client = createRobotClient(process.env)
    return client.sendCommand(input, context.abortSignal)
  },
})
```

**入力スキーマは `@workspace/robot` の `robotCommandSchema` をそのまま使う。** ここで独自に zod を書くと Web / モックと語彙がずれる。

## instructions を変える

おばけの人格は `packages/agent/src/mastra/agents/ghost.ts` の `instructions` 1 箇所だけ。日本語・短文・感情表現を前提に書く。変更したら Studio で 2〜3 往復して口調と tool 呼び出しの頻度を確認する。

モデルは env の `GHOST_MODEL`（既定 `anthropic/claude-sonnet-5`）。**v1 はモデルを文字列で指定する**。使える文字列は https://mastra.ai/models/providers/anthropic を参照。

## Memory

```ts
new Memory({
  options: {
    lastMessages: 20,
    workingMemory: { enabled: false },
    semanticRecall: false,
  },
})
```

- `threadId` = 会話単位。クライアントが localStorage に持つ UUID
- `resourceId` = 来場者単位。同じ人の複数スレッドをまとめる
- **`scope`**: `'thread'` はそのスレッド内だけを参照、`'resource'` は同じ来場者の全スレッドを横断する。展示では来場者ごとに記憶を分離したいので `'thread'` を既定にしている。切り替えると前の来場者の話題を引きずるので注意
- `/api/chat` へは**最新 1 メッセージ + `memory: { thread, resource }`** を送る。全履歴を送らない（履歴は Mastra 側が持つ）

参考: https://mastra.ai/docs/memory/overview

## ストレージ分岐

`packages/agent/src/mastra/storage.ts`:

| `DATABASE_URL` | ストレージ | 挙動 |
|---|---|---|
| 設定あり | `PostgresStore({ schemaName: 'mastra' })` | ローカル Supabase の 54322 に永続化。テーブルは Mastra が自動作成 |
| 未設定 | `LibSQLStore({ url: ':memory:' })` | プロセス内。再起動で履歴消失。Docker 不要 |

並列開発中や Docker が使えないときは `DATABASE_URL` を空にして in-memory で動かす。

## v1 の落とし穴（5 点）

1. **`handleChatStream` の `version` は既定 `'v5'`**。AI SDK 7 を使うこのリポジトリでは `version: 'v7'` を必ず明示する。忘れるとストリームが UI に描画されない。 → https://mastra.ai/reference/ai-sdk/handle-chat-stream
2. **`createTool` の `execute` は `(input, context)` の 2 引数**。0.x の `({ context })` 形式は入力が取れない。`AbortSignal` は `context.abortSignal`。
3. **モデルは文字列**（`'anthropic/claude-sonnet-5'`）。`@ai-sdk/anthropic` のプロバイダ関数を渡す旧形式は使わない。
4. **`.env` はパッケージ直下**。`mastra dev` はリポジトリルートの env を読まない。symlink（`packages/agent/.env`）が壊れていないか確認する。
5. **Next 側で `serverExternalPackages: ['@mastra/*']` が必要**。無いとビルドは通るのにリクエスト時に落ちる。Route Handler は `export const runtime = 'nodejs'`。

## 参考

- Agents: https://mastra.ai/docs/agents/overview
- Tools: https://mastra.ai/docs/tools/overview
- Memory: https://mastra.ai/docs/memory/overview
- `handleChatStream`: https://mastra.ai/reference/ai-sdk/handle-chat-stream
- Anthropic モデル一覧: https://mastra.ai/models/providers/anthropic
