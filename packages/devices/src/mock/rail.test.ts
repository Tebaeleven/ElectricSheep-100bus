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
      expect((await rail.status()).data?.state).toBe("moving")

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
      await rail.stop()
      expect((await rail.status()).data?.state).toBe("stopped")
    } finally {
      vi.useRealTimers()
    }
  })
})
