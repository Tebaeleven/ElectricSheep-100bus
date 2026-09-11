import type { RobotClient, RobotCommand, RobotResult } from "./types.js"

export interface MockRobotClient extends RobotClient {
  /** 受け取ったコマンドの履歴（テスト用） */
  readonly commands: readonly RobotCommand[]
}

/** 実機が無い間に使うモック。受けたコマンドを保持しつつ常に成功を返す */
export function createMockRobotClient(): MockRobotClient {
  const commands: RobotCommand[] = []

  return {
    commands,
    async sendCommand(cmd: RobotCommand): Promise<RobotResult> {
      const startedAt = Date.now()
      commands.push(cmd)
      console.info("[robot:mock] command", JSON.stringify(cmd))
      return { ok: true, status: 200, body: { accepted: true }, latencyMs: Date.now() - startedAt }
    },
    async getStatus(): Promise<RobotResult> {
      const startedAt = Date.now()
      console.info("[robot:mock] status")
      return {
        ok: true,
        status: 200,
        body: { mode: "mock", commandCount: commands.length },
        latencyMs: Date.now() - startedAt,
      }
    },
  }
}
