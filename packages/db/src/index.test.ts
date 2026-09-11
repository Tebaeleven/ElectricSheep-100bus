import { describe, expect, it, vi } from "vitest"

// server.ts 経由で読み込まれる server-only は Node 実行では例外を投げるため無効化する
vi.mock("server-only", () => ({}))

import { logRobotCommand, type RobotCommandLogEntry } from "./index.js"
import type { ServiceClient } from "./server.js"

const entry: RobotCommandLogEntry = {
  threadId: "thread-1",
  command: { type: "emote", emotion: "happy" },
  result: { ok: true, status: 200, latencyMs: 12 },
}

/** insert の戻り値を差し替えたスタブクライアント */
function createStubClient(insert: () => unknown) {
  const from = vi.fn(() => ({ insert }))
  return { client: { from } as unknown as ServiceClient, from }
}

describe("logRobotCommand", () => {
  it("client が null なら何もせず resolve する", async () => {
    await expect(logRobotCommand(null, entry)).resolves.toBeUndefined()
  })

  it("成功時は robot_commands に 1 行 insert する", async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const { client, from } = createStubClient(insert)

    await logRobotCommand(client, entry)

    expect(from).toHaveBeenCalledWith("robot_commands")
    expect(insert).toHaveBeenCalledWith({
      thread_id: "thread-1",
      command: { type: "emote", emotion: "happy" },
      status: "ok",
      result: { ok: true, status: 200, latencyMs: 12 },
    })
  })

  it("threadId 省略時は thread_id が null になる", async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const { client } = createStubClient(insert)

    await logRobotCommand(client, { command: entry.command, result: entry.result })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ thread_id: null }))
  })

  it("失敗した result は status=error で記録する", async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const { client } = createStubClient(insert)

    await logRobotCommand(client, {
      command: { type: "stop" },
      result: { ok: false, error: "timeout", latencyMs: 3000 },
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }))
  })

  it("insert が error を返しても throw しない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const insert = vi.fn(async () => ({ error: { message: "boom" } }))
    const { client } = createStubClient(insert)

    await expect(logRobotCommand(client, entry)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("insert が throw しても throw しない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const insert = vi.fn(() => {
      throw new Error("network down")
    })
    const { client } = createStubClient(insert)

    await expect(logRobotCommand(client, entry)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
