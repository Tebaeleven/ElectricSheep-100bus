import type {
  DeviceResult,
  RailAxis,
  RailAxisStatus,
  RailClient,
  RailCommandAccepted,
  RailMove,
  RailStatus,
} from "../types"

export interface MockRailClient extends RailClient {
  /** 受け取った移動命令の履歴（テスト用） */
  readonly moves: readonly RailMove[]
}

/** 実機ファーム（rail_dc）に合わせた軸の並び */
const AXES: readonly RailAxis[] = ["x", "y", "z"]

/** 1 軸分の内部状態 */
interface AxisRuntime {
  direction: number
  movingUntil: number
}

/** ファームと同じ形式の command_id を採番する */
function createCommandId(): string {
  return `mock-${Math.random().toString(16).slice(2, 10)}`
}

/**
 * レール（ESP32）のモック。
 * ファーム rail_dc に合わせ、move / stop は 202 + command_id を返し、
 * status は `state` を持たない実機と同じ形（`axes[]` 等）を返す。
 * move 後は duration_ms 経過で自動的に停止扱いになる
 */
export function createMockRailClient(): MockRailClient {
  const moves: RailMove[] = []
  const runtime = new Map<RailAxis, AxisRuntime>()

  /** 経過時間で moving → stopped を解決する */
  const settle = (): void => {
    const now = Date.now()
    for (const [axis, value] of runtime) {
      if (now >= value.movingUntil) runtime.delete(axis)
    }
  }

  /** 現在の軸状態をファームと同じ形で組み立てる */
  const axisStatuses = (): RailAxisStatus[] => {
    const now = Date.now()
    return AXES.map((axis) => {
      const value = runtime.get(axis)
      return {
        axis,
        active: value !== undefined,
        pending: false,
        direction: value?.direction ?? 0,
        remaining_ms: value ? Math.max(0, value.movingUntil - now) : 0,
      }
    })
  }

  /** 202 相当の受理応答 */
  const accepted = (startedAt: number): DeviceResult<RailCommandAccepted> => {
    const commandId = createCommandId()
    return {
      ok: true,
      status: 202,
      data: { command_id: commandId, commandId, status: "accepted" },
      latencyMs: Date.now() - startedAt,
    }
  }

  return {
    moves,
    async move(input: RailMove): Promise<DeviceResult<RailCommandAccepted>> {
      const startedAt = Date.now()
      moves.push(input)
      runtime.set(input.axis, {
        direction: input.direction,
        movingUntil: startedAt + input.durationMs,
      })
      console.info("[devices:mock] rail.move", JSON.stringify(input))
      return accepted(startedAt)
    },
    async stop(
      _signal?: AbortSignal,
      axis?: RailAxis
    ): Promise<DeviceResult<RailCommandAccepted>> {
      const startedAt = Date.now()
      if (axis) runtime.delete(axis)
      else runtime.clear()
      console.info("[devices:mock] rail.stop", axis ?? "all")
      return accepted(startedAt)
    },
    async status(): Promise<DeviceResult<RailStatus>> {
      const startedAt = Date.now()
      settle()
      const axes = axisStatuses()
      const moving = axes.some((axis) => axis.active === true)
      console.info("[devices:mock] rail.status", moving ? "moving" : "stopped")
      return {
        ok: true,
        status: 200,
        data: {
          type: "status",
          firmware: "rail-dc-xyz-1.0",
          mode: "led_preview",
          simulated: true,
          ip: "127.0.0.1",
          ap_ip: "192.168.4.1",
          ap_ssid: "Rail-ESP32-mock",
          apIp: "192.168.4.1",
          apSsid: "Rail-ESP32-mock",
          axes,
          move_count: moves.length,
          // ファームは state を返さないが、SDK が導出する値と同じものを入れておく
          state: moving ? "moving" : "stopped",
        },
        latencyMs: Date.now() - startedAt,
      }
    },
  }
}
