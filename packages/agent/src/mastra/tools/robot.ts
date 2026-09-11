import { createTool } from "@mastra/core/tools"
import { createRobotClient, robotCommandSchema } from "@workspace/robot"
import type { RobotClient, RobotCommand, RobotResult } from "@workspace/robot"
import { z } from "zod"

/**
 * LLM に見せる入力スキーマ。
 * 正本の `robotCommandSchema` は discriminatedUnion（= JSON Schema では anyOf）で、
 * Anthropic の tool input_schema はトップレベルが object であることを要求するため、
 * LLM 向けには「type + 任意フィールド」のフラットな object に落とし、
 * 内部で `robotCommandSchema.parse` に変換して正本の検証を通す。
 */
export const robotCommandInputSchema = z.object({
  type: z
    .enum(["move", "stop", "speak", "emote", "raw"])
    .describe("コマンド種別。move=移動, stop=停止, speak=発話, emote=感情表現, raw=生API呼び出し"),
  direction: z
    .enum(["up", "down", "left", "right", "forward", "back"])
    .optional()
    .describe("move のときの移動方向（move では必須）"),
  durationMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("move のときの移動時間（ミリ秒）"),
  text: z.string().max(200).optional().describe("speak のときに喋る文章（speak では必須）"),
  emotion: z
    .enum(["happy", "sad", "surprised", "neutral"])
    .optional()
    .describe("emote のときの感情（emote では必須）"),
  path: z.string().optional().describe("raw のときに叩くパス（raw では必須）"),
  method: z.enum(["GET", "POST"]).optional().describe("raw のときの HTTP メソッド（既定 POST）"),
  body: z.record(z.string(), z.unknown()).optional().describe("raw のときのリクエストボディ"),
})

export type RobotCommandInput = z.infer<typeof robotCommandInputSchema>

/** ロボットの実行結果（`RobotResult` に対応） */
export const robotResultSchema = z.object({
  ok: z.boolean(),
  status: z.number().optional(),
  body: z.unknown().optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
})

/** フラットな LLM 入力を正本の RobotCommand に変換する。欠けたフィールドはここで zod エラーになる */
export function toRobotCommand(input: RobotCommandInput): RobotCommand {
  switch (input.type) {
    case "move":
      return robotCommandSchema.parse({
        type: "move",
        direction: input.direction,
        durationMs: input.durationMs,
      })
    case "stop":
      return robotCommandSchema.parse({ type: "stop" })
    case "speak":
      return robotCommandSchema.parse({ type: "speak", text: input.text })
    case "emote":
      return robotCommandSchema.parse({ type: "emote", emotion: input.emotion })
    case "raw":
      return robotCommandSchema.parse({
        type: "raw",
        path: input.path,
        method: input.method ?? "POST",
        body: input.body,
      })
  }
}

/**
 * ロボットクライアントはモジュールスコープでメモ化する。
 * モック実装はコマンド履歴を配列で持つため、毎回生成すると履歴が消えてしまう。
 */
let cachedClient: RobotClient | undefined

export function getRobotClient(): RobotClient {
  cachedClient ??= createRobotClient(process.env)
  return cachedClient
}

/**
 * `@workspace/db` は `server-only` を読み込むため、素の Node では import 時に例外になる。
 * 静的 import にすると `mastra dev` が起動時点で落ちるので、動的 import + catch にして
 * 「ログが取れないだけ」で済ませる（Next.js の server 層では react-server 条件で解決され動く）。
 * なお `mastra dev` では動的 import がバンドルされず TS ソースを解決できないため、
 * Studio 経由の実行では常にログがスキップされる（想定どおり）。
 */
type DbModule = typeof import("@workspace/db")
let dbModulePromise: Promise<DbModule | null> | undefined

function loadDb(): Promise<DbModule | null> {
  dbModulePromise ??= import("@workspace/db").catch((cause: unknown) => {
    console.warn("[agent] robot_commands ログを無効化します（@workspace/db を読み込めません）", cause)
    return null
  })
  return dbModulePromise
}

async function logCommand(entry: {
  threadId?: string
  command: RobotCommand
  result: RobotResult
}): Promise<void> {
  const db = await loadDb()
  if (!db) return
  await db.logRobotCommand(db.createServiceClient(process.env), entry)
}

/** おばけロボットの実機を動かす tool */
export const robotCommand = createTool({
  id: "robot-command",
  description:
    "おばけロボットの実機を動かす（移動・停止・発話・感情表現）。感情が動いたとき、来場者に動きを頼まれたときに呼ぶ。",
  inputSchema: robotCommandInputSchema,
  outputSchema: robotResultSchema,
  execute: async (input, ctx) => {
    const command = toRobotCommand(input)
    const result = await getRobotClient().sendCommand(command, ctx?.abortSignal)
    await logCommand({ threadId: ctx?.agent?.threadId, command, result })
    return result
  },
})

/** ロボットの現在状態を問い合わせる tool */
export const robotStatus = createTool({
  id: "robot-status",
  description: "おばけロボットの現在の状態（接続やモード）を確認する。",
  inputSchema: z.object({}),
  outputSchema: robotResultSchema,
  execute: async () => getRobotClient().getStatus(),
})
