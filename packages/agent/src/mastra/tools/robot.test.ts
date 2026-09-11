import type { RobotResult } from "@workspace/robot"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  getRobotClient,
  robotCommand,
  robotResultSchema,
  robotStatus,
  toRobotCommand,
} from "./robot"

/** 型を絞らずに execute を直接呼ぶためのヘルパー（tool の execute は optional） */
async function run(
  tool: typeof robotCommand | typeof robotStatus,
  input: unknown
): Promise<RobotResult> {
  const execute = tool.execute
  if (!execute) throw new Error("execute が未定義")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (execute as any)(input, {} as any)
  return robotResultSchema.parse(result) as RobotResult
}

describe("robotCommand", () => {
  it("emote コマンドがモッククライアントに届き ok / latencyMs が返る", async () => {
    const result = await run(robotCommand, { type: "emote", emotion: "happy" })

    expect(result.ok).toBe(true)
    expect(typeof result.latencyMs).toBe("number")
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("move コマンドが正本スキーマの形でモックに渡る", async () => {
    await run(robotCommand, { type: "move", direction: "up", durationMs: 500 })

    const client = getRobotClient() as unknown as { commands: unknown[] }
    expect(client.commands.at(-1)).toEqual({ type: "move", direction: "up", durationMs: 500 })
  })

  it("direction の無い move は zod エラーになる", async () => {
    await expect(run(robotCommand, { type: "move" })).rejects.toBeInstanceOf(z.ZodError)
  })

  it("emotion が語彙外なら zod エラーになる", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toRobotCommand({ type: "emote", emotion: "angry" as any })
    ).toThrow(z.ZodError)
  })
})

describe("robotStatus", () => {
  it("モックの状態を返す", async () => {
    const result = await run(robotStatus, {})

    expect(result.ok).toBe(true)
    expect(result.body).toMatchObject({ mode: "mock" })
  })
})
