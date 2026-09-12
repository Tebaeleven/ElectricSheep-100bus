import { describe, expect, it } from "vitest"

import { createMockStackchanClient } from "../mock/stackchan"
import type { DeviceResult, StackchanBridgeStatus } from "../types"
import type { StackchanBridgeClient } from "./stackchan-bridge"
import { createStackchanCompositeClient } from "./stackchan-composite"
import type { StackchanHttpClient } from "./stackchan-http"

/** 呼ばれたメソッドを記録する偽の HTTP クライアント */
function createFakeHttp(): StackchanHttpClient & { calls: string[] } {
  const calls: string[] = []
  const ok = (): DeviceResult => ({ ok: true, status: 200, latencyMs: 1 })
  return {
    calls,
    async handSet(state) {
      calls.push(`hand:${state}`)
      return ok()
    },
    async ledSet(on) {
      calls.push(`led:${on ? "on" : "off"}`)
      return ok()
    },
    async health() {
      calls.push("health")
      return { ok: true, status: 200, data: { ok: true }, latencyMs: 1 }
    },
  }
}

/** モッククライアントに getStatus を足した偽のブリッジ */
function createFakeBridge(): StackchanBridgeClient & { calls: string[] } {
  const calls: string[] = []
  const mock = createMockStackchanClient()
  const status: StackchanBridgeStatus = {
    connected: true,
    pcmRate: 16000,
    lastFrameAt: 1,
    lastPcmAt: 2,
    frames: 3,
    bytes: 4,
  }
  return {
    ...mock,
    calls,
    get connected() {
      return mock.connected
    },
    async headSet(input) {
      calls.push("headSet")
      return mock.headSet(input)
    },
    async cameraCapture() {
      calls.push("cameraCapture")
      return mock.cameraCapture()
    },
    async audioStart() {
      calls.push("audioStart")
      return mock.audioStart()
    },
    async audioStop() {
      calls.push("audioStop")
      return mock.audioStop()
    },
    onAudioChunk(handler) {
      calls.push("onAudioChunk")
      return mock.onAudioChunk(handler)
    },
    async getStatus() {
      calls.push("getStatus")
      return { ok: true, status: 200, data: status, latencyMs: 1 }
    },
  }
}

describe("createStackchanCompositeClient", () => {
  it("手と LED は HTTP、首・カメラ・音声はブリッジに振り分ける", async () => {
    const http = createFakeHttp()
    const bridge = createFakeBridge()
    const fallback = createMockStackchanClient()
    const client = createStackchanCompositeClient({ http, bridge, fallback })

    await client.handSet("closed")
    await client.ledSet(true)
    await client.headSet({ yaw: 10, pitch: 45 })
    await client.cameraCapture()
    await client.audioStart()
    await client.audioStop()
    client.onAudioChunk(() => {})

    expect(http.calls).toEqual(["hand:closed", "led:on"])
    expect(bridge.calls).toEqual([
      "headSet",
      "cameraCapture",
      "audioStart",
      "audioStop",
      "onAudioChunk",
    ])
    // fallback には何も流れていない
    expect(fallback.handState).toBe("open")
    expect(fallback.headAngles).toBeUndefined()
  })

  it("HTTP が無ければ手と LED は fallback に流れる", async () => {
    const bridge = createFakeBridge()
    const fallback = createMockStackchanClient()
    const client = createStackchanCompositeClient({ bridge, fallback })

    await client.handSet("closed")
    await client.ledSet(true)

    expect(fallback.handState).toBe("closed")
    expect(fallback.ledOn).toBe(true)
  })

  it("ブリッジが無ければ首・カメラ・音声は fallback に流れる", async () => {
    const http = createFakeHttp()
    const fallback = createMockStackchanClient()
    const client = createStackchanCompositeClient({ http, fallback })

    await client.headSet({ yaw: -20, pitch: 30 })
    await client.connect()

    expect(fallback.headAngles).toEqual({ yaw: -20, pitch: 30 })
    expect(client.connected).toBe(true)
  })

  it("getStatus は HTTP とブリッジの状態をまとめて返す", async () => {
    const http = createFakeHttp()
    const bridge = createFakeBridge()
    const client = createStackchanCompositeClient({
      http,
      bridge,
      fallback: createMockStackchanClient(),
    })

    const result = await client.getStatus()

    expect(result.ok).toBe(true)
    expect(result.data?.http).toEqual({ reachable: true, error: undefined })
    expect(result.data?.bridge?.connected).toBe(true)
    expect(result.data?.bridge?.pcmRate).toBe(16000)
  })

  it("HTTP だけのときは getStatus に bridge が入らない", async () => {
    const http = createFakeHttp()
    const client = createStackchanCompositeClient({
      http,
      fallback: createMockStackchanClient(),
    })

    const result = await client.getStatus()

    expect(result.ok).toBe(true)
    expect(result.data?.http?.reachable).toBe(true)
    expect(result.data?.bridge).toBeUndefined()
  })
})
