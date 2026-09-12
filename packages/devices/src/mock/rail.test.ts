import { describe, expect, it, vi } from "vitest"

import { createMockRailClient } from "./rail"

describe("createMockRailClient", () => {
  it("move 後は moving、duration_ms 経過で stopped に戻る", async () => {
    vi.useFakeTimers()
    try {
      const rail = createMockRailClient()
      const result = await rail.move({
        axis: "x",
        direction: 1,
        durationMs: 500,
      })
      expect(result.ok).toBe(true)
      // ファーム rail_dc に合わせて 202 + command_id
      expect(result.status).toBe(202)
      expect(result.data?.commandId).toBeTypeOf("string")
      expect(result.data?.status).toBe("accepted")

      const moving = await rail.status()
      expect(moving.data?.state).toBe("moving")
      expect(moving.data?.axes?.find((a) => a.axis === "x")?.active).toBe(true)
      expect(moving.data?.simulated).toBe(true)
      expect(moving.data?.mode).toBe("led_preview")

      vi.advanceTimersByTime(500)
      expect((await rail.status()).data?.state).toBe("stopped")
      expect(rail.moves).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("stop で即座に stopped になる", async () => {
    vi.useFakeTimers()
    try {
      const rail = createMockRailClient()
      await rail.move({ axis: "y", direction: -1, durationMs: 3000 })
      const stopped = await rail.stop()
      expect(stopped.status).toBe(202)
      expect((await rail.status()).data?.state).toBe("stopped")
    } finally {
      vi.useRealTimers()
    }
  })

  it("axis 指定の stop はその軸だけ止める", async () => {
    vi.useFakeTimers()
    try {
      const rail = createMockRailClient()
      await rail.move({ axis: "x", direction: 1, durationMs: 3000 })
      await rail.move({ axis: "z", direction: 1, durationMs: 3000 })
      await rail.stop(undefined, "x")

      const status = await rail.status()
      expect(status.data?.axes?.find((a) => a.axis === "x")?.active).toBe(false)
      expect(status.data?.axes?.find((a) => a.axis === "z")?.active).toBe(true)
      expect(status.data?.state).toBe("moving")
    } finally {
      vi.useRealTimers()
    }
  })
})
