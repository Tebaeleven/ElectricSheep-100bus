# Runbook: Mastra（おばけエージェント）

会話ロジックは `packages/agent`（`@workspace/agent`）に集約している。Next.js の `POST /api/chat` は `@mastra/ai-sdk` の `handleChatStream` を呼ぶだけで、同一プロセスで Mastra が動く。

```
packages/agent/src/mastra/
├─ index.ts            # export: mastra, ghost, GHOST_AGENT_ID, createStorage
├─ agents/ghost.ts     # おばけロボットの Agent（instructions / model / memory / tools）
├─ storage.ts          # DATABASE_URL の有無で Postgres / LibSQL を分岐
├─ tools/robot.ts      # robotCommand / robotStatus
└─ tools/devices.ts    # railMove / railStop / handSet / cameraCapture / desktopScreenshot / desktopOpenBrowser
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

**`DATABASE_URL` が設定されているのに Supabase を起動していないと、Studio は `MASTRA_STORAGE_PG_INIT_FAILED`（`ECONNREFUSED 127.0.0.1:54322`）で即落ちする。** `pnpm db:start` するか、`.env.local` の `DATABASE_URL` をコメントアウトして in-memory にする。

## tool を追加する

1. `packages/agent/src/mastra/tools/` にファイルを足し、`createTool` で定義する
2. `agents/ghost.ts` の `tools: { ... }` に登録する
3. `pnpm agent:studio` の Tools タブで単体実行して入出力を確認する
4. UI 側では AI SDK の `tool-<toolName>` part として流れてくる（`tool-robotCommand` を「ロボットが動いています」演出に使っている）。**part 名は `ghost.ts` の `tools: { ... }` のキー名**なので、キーを変えると UI の描画が止まる

実装は `packages/agent/src/mastra/tools/robot.ts`。要点は次の 3 つ。

```ts
import { createTool } from "@mastra/core/tools"
import { robotCommandSchema } from "@workspace/robot"
import { z } from "zod"

// (1) LLM に見せるのは「type + 任意フィールド」のフラットな object。
//     正本の robotCommandSchema は discriminatedUnion（JSON Schema では anyOf）で、
//     tool の input_schema はトップレベルが object であることを要求するため直接は渡せない。
export const robotCommandInputSchema = z.object({
  type: z.enum(["move", "stop", "speak", "emote", "raw"]),
  direction: z.enum(["up", "down", "left", "right", "forward", "back"]).optional(),
  durationMs: z.number().int().positive().optional(),
  text: z.string().max(200).optional(),
  emotion: z.enum(["happy", "sad", "surprised", "neutral"]).optional(),
  path: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
  // Gemini の function declaration は任意キーの object を弾くことがあるので JSON 文字列で受ける
  body: z.string().optional(),
})

// (2) フラット入力 → 正本の RobotCommand に変換する。欠けた必須項目はここで zod エラーになる
export function toRobotCommand(input: RobotCommandInput): RobotCommand { /* switch (input.type) */ }

export const robotCommand = createTool({
  id: "robot-command",
  description: "おばけロボットの実機を動かす（移動・停止・発話・感情表現）。",
  inputSchema: robotCommandInputSchema,
  outputSchema: robotResultSchema,
  // (3) v1 は (input, context) の 2 引数。threadId は ctx.agent?.threadId から取る
  execute: async (input, ctx) => {
    const command = toRobotCommand(input)
    const result = await getRobotClient().sendCommand(command, ctx?.abortSignal)
    await logRobotCommand(createServiceClient(process.env), {
      threadId: ctx?.agent?.threadId,
      command,
      result,
    })
    return result
  },
})
```

**語彙の正本は `@workspace/robot` の `robotCommandSchema`。** LLM 向けにフラット化したスキーマは「入口の形」でしかなく、実際に送る値は必ず `toRobotCommand`（＝ `robotCommandSchema.parse`）を通す。ここで独自に zod を書くと Web / モックと語彙がずれる。

エージェントが持つ tool を確認するには `await ghost.listTools()`（キーは `robotCommand` / `robotStatus` / `railMove` / `railStop` / `handSet` / `cameraCapture` / `desktopScreenshot` / `desktopOpenBrowser` の 8 件）。

## 機器 devices tools（6 本）

実装は `packages/agent/src/mastra/tools/devices.ts`。機器クライアントは `createDevices(process.env)` を**モジュールスコープでメモ化**した `getDevices()` から取る（毎回作るとモックの履歴が消え、実機では WebSocket 接続が増殖する）。

| tools キー（＝ UI の part 名） | tool id | 入力スキーマ | 出力 | 機器操作 |
|---|---|---|---|---|
| `railMove` | `rail-move` | `{ axis: 'x'\|'y'\|'z', direction: 'plus'\|'minus', durationMs: int 1..RAIL_MAX_DURATION_MS }` | `deviceResultSchema` = `{ ok, status?, error?, latencyMs }` | `POST /api/v1/rail/move` |
| `railStop` | `rail-stop` | `{}`（引数なし） | `deviceResultSchema` | `POST /api/v1/rail/stop` |
| `handSet` | `hand-set` | `{ state: 'open'\|'closed' }` | `deviceResultSchema` | WS `hand.set` → `ack` |
| `cameraCapture` | `camera-capture` | `{}`（引数なし） | `imageResultSchema` = `{ ok, mimeType?, byteLength?, error?, latencyMs }` | WS `camera.capture` → `camera.frame` |
| `desktopScreenshot` | `desktop-screenshot` | `{}`（引数なし） | `imageResultSchema` | `POST /api/v1/desktop/screenshot` |
| `desktopOpenBrowser` | `desktop-open-browser` | `{ url: string }`（`openUrlSchema` で http/https のみ） | `deviceResultSchema` | `POST /api/v1/desktop/browser/open` |

設計上のポイント:

1. **`direction` は LLM には `'plus'` / `'minus'` の文字列で見せる。** 正本の `railMoveSchema` は `direction: 1 | -1` だが、Gemini の function declaration は数値リテラルの union を扱えないことがある。tool 内の `toRailDirection()` で `+1` / `-1` に変換してから `railMoveSchema.safeParse` に通す（スキーマ違反は例外にせず `{ ok:false, error }` で返す）。
2. **画像 base64 は LLM に返さない。** `cameraCapture` / `desktopScreenshot` は `mimeType` と `byteLength` だけを返す（トークンを食い潰さないため）。画像そのものは Route Handler `/api/devices/*`（`data.imageBase64`）経由で UI に表示する。
3. **`DeviceResult.data` も LLM に返さない。** `toLlmResult()` が `ok` / `status` / `error` / `latencyMs` に絞る。
4. **例外を投げない。** `runDeviceCall()` が全ての呼び出しを包み、機器が落ちていても `{ ok:false }` になって会話が止まらない。
5. **移動は必ず `railMove`。** `robotCommand` の `type:'move'` は使わない（instructions に明記）。`robotCommand` は emote / speak / stop 用。

機器側の env・モック起動・curl 例・安全要件は [`docs/runbooks/devices.md`](./devices.md)。

## instructions を変える

おばけの人格は `packages/agent/src/mastra/agents/ghost.ts` の `instructions` 1 箇所だけ。日本語・短文・感情表現を前提に書く。変更したら Studio で 2〜3 往復して口調と tool 呼び出しの頻度を確認する。

モデルは env の `GHOST_MODEL`（既定 `google/gemini-3.8-flash`）。**v1 はモデルを文字列で指定する**（モデルルーター）。使える文字列は https://mastra.ai/models/providers/google を参照。

| 文字列 | 用途 |
|---|---|
| `google/gemini-3.8-flash` | 既定。展示では応答速度が最優先 |
| `google/gemini-2.5-flash` | さらに安い。品質を落としてよいとき |
| `google/gemini-3.1-pro-preview` | 口調や tool 選択の質を上げたいとき（遅い・高い） |

キーは `GOOGLE_GENERATIVE_AI_API_KEY`（`GOOGLE_API_KEY` でも可）。Mastra のモデルルーターに組み込まれているので追加パッケージは不要。

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
- **`MemoryConfig` にトップレベルの `scope` は無い**（v1 で無くなった）。`lastMessages` は常にそのスレッド内だけを見るので、既定で来場者ごとに記憶が分離される。横断させたいときは `workingMemory` / `semanticRecall` を有効にして、その中の `scope: 'resource'` を使う（このリポジトリでは両方 false）
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
3. **モデルは文字列**（`'google/gemini-3.8-flash'`）。`@ai-sdk/google` のプロバイダ関数を渡す旧形式は使わない。
4. **`.env` はパッケージ直下**。`mastra dev` はリポジトリルートの env を読まない。symlink（`packages/agent/.env`）が壊れていないか確認する。
5. **Next 側で `serverExternalPackages: ['@mastra/*']` が必要**。無いとビルドは通るのにリクエスト時に落ちる。Route Handler は `export const runtime = 'nodejs'`。

## 参考

- Agents: https://mastra.ai/docs/agents/overview
- Tools: https://mastra.ai/docs/tools/overview
- Memory: https://mastra.ai/docs/memory/overview
- `handleChatStream`: https://mastra.ai/reference/ai-sdk/handle-chat-stream
- Google（Gemini）モデル一覧: https://mastra.ai/models/providers/google
- Gemini API キーの発行: https://aistudio.google.com/apikey
