import { describe, expect, it, vi } from "vitest"

import { MOCK_PNG_BASE64 } from "../constants"
import type { AudioChunk, StackchanInbound } from "../types"
import { createMockStackchanClient } from "./stackchan"

describe("createMockStackchanClient", () => {
  it("connect で connected が true、close で false になる", async () => {
    const stackchan = createMockStackchanClient()
    expect(stackchan.connected).toBe(false)
    await stackchan.connect()
    expect(stackchan.connected).toBe(true)
    await stackchan.close()
    expect(stackchan.connected).toBe(false)
  })

  it("handSet は状態を保持し ack イベントを流す", async () => {
    const stackchan = createMockStackchanClient()
    const events: StackchanInbound[] = []
    const unsubscribe = stackchan.onEvent((msg) => events.push(msg))

    await stackchan.connect()
    const result = await stackchan.handSet("closed")
    expect(result.ok).toBe(true)
    expect(stackchan.handState).toBe("closed")
    expect(events.map((e) => e.type)).toEqual(["ack"])

    unsubscribe()
    await stackchan.handSet("open")
    expect(stackchan.handState).toBe("open")
    expect(events).toHaveLength(1)
    await stackchan.close()
  })

  it("cameraCapture は 1x1 PNG を返す", async () => {
    const stackchan = createMockStackchanClient()
    await stackchan.connect()
    const result = await stackchan.cameraCapture()
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
    await stackchan.close()
  })

  it("audioStart で 100ms ごとにチャンクが流れ、audioStop で止まる", async () => {
    vi.useFakeTimers()
    try {
      const stackchan = createMockStackchanClient()
      const chunks: AudioChunk[] = []
      const unsubscribe = stackchan.onAudioChunk((chunk) => chunks.push(chunk))

      await stackchan.connect()
      await stackchan.audioStart()
      expect(stackchan.recording).toBe(true)

      vi.advanceTimersByTime(300)
      expect(chunks).toHaveLength(3)
      expect(chunks[0]?.audioBase64.length).toBeGreaterThan(0)
      expect(chunks.map((c) => c.seq)).toEqual([1, 2, 3])

      await stackchan.audioStop()
      expect(stackchan.recording).toBe(false)
      vi.advanceTimersByTime(300)
      expect(chunks).toHaveLength(3)

      unsubscribe()
      await stackchan.audioStart()
      vi.advanceTimersByTime(300)
      expect(chunks).toHaveLength(3)
      await stackchan.close()
    } finally {
      vi.useRealTimers()
    }
  })
})
