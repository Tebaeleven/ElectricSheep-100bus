import { railMoveSchema, railStatusSchema } from "../schemas"
import type {
  DeviceResult,
  HttpDeviceOptions,
  RailAxis,
  RailClient,
  RailCommandAccepted,
  RailMove,
  RailStatus,
} from "../types"
import { railMoveToWire } from "../wire"
import { sendHttpRequest } from "./request"

/** zod のバリデーション失敗を DeviceResult に変換する */
function validationFailure<T>(
  error: unknown,
  startedAt: number
): DeviceResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    latencyMs: Date.now() - startedAt,
  }
}

/**
 * ファームの 202 応答 `{"command_id":"...","status":"accepted"}` を
 * camelCase の `commandId` 付きに整える。元のフィールドはそのまま残す
 */
function withCommandId(
  result: DeviceResult
): DeviceResult<RailCommandAccepted> {
  const data = result.data
  if (!data || typeof data !== "object") {
    return result as DeviceResult<RailCommandAccepted>
  }
  const record = data as Record<string, unknown>
  const commandId = record.command_id
  return {
    ...result,
    data: {
      ...record,
      commandId: typeof commandId === "string" ? commandId : undefined,
    },
  }
}

/**
 * ESP32（レール）の実 HTTP クライアント。
 * 安全要件により move は再送しない。stop はネットワークエラー時に 1 回だけ再試行する
 */
export function createRailClient(options: HttpDeviceOptions): RailClient {
  return {
    async move(
      input: RailMove,
      signal?: AbortSignal
    ): Promise<DeviceResult<RailCommandAccepted>> {
      const startedAt = Date.now()
      let wire
      try {
        // 駆動時間の上限チェックはリクエスト前に行う
        wire = railMoveToWire(railMoveSchema.parse(input))
      } catch (error) {
        return validationFailure(error, startedAt)
      }
      const result = await sendHttpRequest(options, {
        method: "POST",
        path: "/rail/move",
        body: wire,
        signal,
        // 二重移動を避けるため移動命令は絶対に再送しない
        retryOnNetworkError: false,
      })
      return withCommandId(result)
    },

    async stop(
      signal?: AbortSignal,
      axis?: RailAxis
    ): Promise<DeviceResult<RailCommandAccepted>> {
      const result = await sendHttpRequest(options, {
        method: "POST",
        path: "/rail/stop",
        // ファーム rail_dc は JSON ボディ必須。全軸停止は axis:null
        body: { axis: axis ?? null },
        signal,
        // 停止は冪等かつ安全側の操作なので 1 回だけ再試行する
        retryOnNetworkError: true,
      })
      return withCommandId(result)
    },

    async status(signal?: AbortSignal): Promise<DeviceResult<RailStatus>> {
      const result = await sendHttpRequest(options, {
        method: "GET",
        path: "/rail/status",
        signal,
      })
      if (!result.ok) return result as DeviceResult<RailStatus>
      const parsed = railStatusSchema.safeParse(result.data)
      if (!parsed.success) {
        return {
          ok: false,
          status: result.status,
          data: undefined,
          error: `不正な rail/status 応答: ${parsed.error.message}`,
          latencyMs: result.latencyMs,
        }
      }
      return { ...result, data: parsed.data as RailStatus }
    },
  }
}
