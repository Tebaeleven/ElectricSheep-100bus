import type { DeviceResult, RailClient, RailMove, RailStatus } from "../types"

export interface MockRailClient extends RailClient {
  /** 受け取った移動命令の履歴（テスト用） */
  readonly moves: readonly RailMove[]
}

/**
 * レール（ESP32）のモック。
 * move 後は duration_ms 経過で自動的に stopped へ戻る
 */
export function createMockRailClient(): MockRailClient {
  const moves: RailMove[] = []
  let state: RailStatus["state"] = "stopped"
  let movingUntil = 0

  /** 経過時間で moving → stopped を解決する */
  const settle = (): void => {
    if (state === "moving" && Date.now() >= movingUntil) state = "stopped"
  }

  return {
    moves,
    async move(input: RailMove): Promise<DeviceResult> {
      const startedAt = Date.now()
      moves.push(input)
      state = "moving"
      movingUntil = startedAt + input.durationMs
      console.info("[devices:mock] rail.move", JSON.stringify(input))
      return {
        ok: true,
        status: 200,
        data: { accepted: true },
        latencyMs: Date.now() - startedAt,
      }
    },
    async stop(): Promise<DeviceResult> {
      const startedAt = Date.now()
      state = "stopped"
      movingUntil = 0
      console.info("[devices:mock] rail.stop")
      return {
        ok: true,
        status: 200,
        data: { accepted: true },
        latencyMs: Date.now() - startedAt,
      }
    },
    async status(): Promise<DeviceResult<RailStatus>> {
      const startedAt = Date.now()
      settle()
      console.info("[devices:mock] rail.status", state)
      return {
        ok: true,
        status: 200,
        data: { state, moveCount: moves.length },
        latencyMs: Date.now() - startedAt,
      }
    },
  }
}
