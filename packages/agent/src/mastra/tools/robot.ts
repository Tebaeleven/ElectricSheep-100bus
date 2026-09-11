import { createTool } from "@mastra/core/tools"
import { createServiceClient, logRobotCommand } from "@workspace/db"
import { createRobotClient, robotCommandSchema } from "@workspace/robot"
import type { RobotClient, RobotCommand, RobotResult } from "@workspace/robot"
import { z } from "zod"

/**
 * LLM に見せる入力スキーマ。
 * 正本の `robotCommandSchema` は discriminatedUnion（= JSON Schema では anyOf）で、
 * LLM の tool 入力スキーマ（Gemini の function declaration 等）はトップレベルが object であることを要求するため、
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
  // Gemini の function declaration は任意キーの object（JSON Schema の additionalProperties）を
  // SDK 側バリデーションで弾くことがあるため、LLM には JSON 文字列で受け取らせる
  body: z
    .string()
    .optional()
    .describe('raw のときのリクエストボディ（JSON 文字列。例: {"speed":2}）'),
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

/** LLM が渡す JSON 文字列のボディをパースする。壊れていれば文字列のまま渡す */
function parseRawBody(body: string | undefined): unknown {
  if (body === undefined) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

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
        body: parseRawBody(input.body),
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

async function logCommand(entry: {
  threadId?: string
  command: RobotCommand
  result: RobotResult
}): Promise<void> {
  await logRobotCommand(createServiceClient(process.env), entry)
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
