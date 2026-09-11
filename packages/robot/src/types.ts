import type { z } from "zod"
import type { robotCommandSchema } from "./schema"

export type RobotCommand = z.infer<typeof robotCommandSchema>

/** ロボットへの 1 リクエストの結果。失敗も例外にせずこの形で返す */
export interface RobotResult {
  ok: boolean
  status?: number
  body?: unknown
  error?: string
  latencyMs: number
}

export interface RobotClient {
  sendCommand(cmd: RobotCommand, signal?: AbortSignal): Promise<RobotResult>
  getStatus(): Promise<RobotResult>
}

/** コマンド種別ごとの HTTP エンドポイント割り当て（実機仕様受領後に差し替える） */
export type RobotEndpointMap = Partial<
  Record<RobotCommand["type"] | "status", { path: string; method: "GET" | "POST" }>
>

export interface HttpRobotClientOptions {
  baseUrl: string
  timeoutMs?: number
  endpointMap?: RobotEndpointMap
}
