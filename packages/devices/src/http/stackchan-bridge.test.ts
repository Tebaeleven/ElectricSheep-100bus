import {
  createBridge,
  encodeFrame,
  encodeHello,
  FRAME_TYPE_JPEG,
  FRAME_TYPE_PCM,
  MEDIA_WS_PATH,
  type Bridge,
} from "@workspace/stackchan-bridge"
import { afterEach, describe, expect, it, vi } from "vitest"
import WebSocket from "ws"

import type { AudioChunk } from "../types"
import { createStackchanBridgeClient } from "./stackchan-bridge"

let bridge: Bridge | undefined
let device: WebSocket | undefined
let baseUrl = ""

afterEach(async () => {
  device?.close()
  device = undefined
  await bridge?.stop()
  bridge = undefined
})

/** テスト内でブリッジをポート 0 起動する */
async function startBridge(): Promise<void> {
  bridge = createBridge({ port: 0, host: "127.0.0.1", log: () => {} })
  const { port } = await bridge.start()
  baseUrl = `http://127.0.0.1:${port}`
}

/** 偽機器としてブリッジへ接続する */
async function connectDevice(): Promise<WebSocket> {
  const socket = new WebSocket(
    `${baseUrl.replace("http://", "ws://")}${MEDIA_WS_PATH}`
  )
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve)
    socket.once("error", reject)
  })
  device = socket
  return socket
}

/** 1x1 相当のダミー JPEG（SOI + EOI だけでも中身の授受は確認できる） */
const jpeg = Buffer.from("ffd8ffdb0000ffd9", "hex")

describe("createStackchanBridgeClient", () => {
  it("getStatus / connect がブリッジの接続状態を反映する", async () => {
    await startBridge()
    const client = createStackchanBridgeClient({ baseUrl })

    const before = await client.getStatus()
    expect(before.ok).toBe(true)
    expect(before.data?.connected).toBe(false)
    expect(client.connected).toBe(false)

    const socket = await connectDevice()
    socket.send(encodeHello(16000))
    await vi.waitFor(async () => {
      const status = await client.getStatus()
      expect(status.data?.connected).toBe(true)
      expect(status.data?.pcmRate).toBe(16000)
    })
    await client.connect()
    expect(client.connected).toBe(true)
    await client.close()
  })

  it("cameraCapture が最新フレームを返す（未受信なら ok:false）", async () => {
    await startBridge()
    const client = createStackchanBridgeClient({ baseUrl })
    expect((await client.cameraCapture()).ok).toBe(false)

    const socket = await connectDevice()
    socket.send(encodeFrame(FRAME_TYPE_JPEG, jpeg))
    await vi.waitFor(async () => {
      const result = await client.cameraCapture()
      expect(result.ok).toBe(true)
      expect(result.data?.mimeType).toBe("image/jpeg")
      expect(result.data?.imageBase64).toBe(jpeg.toString("base64"))
    })
    await client.close()
  })

  it("headSet がブリッジ経由で機器へ set_head を送る", async () => {
    await startBridge()
    const client = createStackchanBridgeClient({ baseUrl })
    // 機器未接続なら ok:false（ブリッジが 503）
    expect((await client.headSet({ yaw: 0, pitch: 0 })).ok).toBe(false)

    const socket = await connectDevice()
    const received: string[] = []
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) received.push(data.toString("utf8"))
    })

    const result = await client.headSet({ yaw: 20, pitch: 10, speed: 200 })
    expect(result.ok).toBe(true)
    await vi.waitFor(() => expect(received.length).toBe(1))
    expect(JSON.parse(received[0]!)).toEqual({
      cmd: "set_head",
      yaw: 20,
      pitch: 10,
      speed: 200,
    })
    await client.close()
  })

  it("範囲外の角度はリクエスト前に弾く", async () => {
    await startBridge()
    const client = createStackchanBridgeClient({ baseUrl })
    const result = await client.headSet({ yaw: 999, pitch: 0 })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("yaw")
    await client.close()
  })

  it("handSet は unsupported を返す", async () => {
    await startBridge()
    const client = createStackchanBridgeClient({ baseUrl })
    const result = await client.handSet("open")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("unsupported: hand servo not present")
    await client.close()
  })

  it("audioStart で audio/recent のポーリングが始まり audioStop で止まる", async () => {
    await startBridge()
    const socket = await connectDevice()
    socket.send(encodeHello(24000))
    const client = createStackchanBridgeClient({ baseUrl, audioPollMs: 50 })
    const chunks: AudioChunk[] = []
    const unsubscribe = client.onAudioChunk((chunk) => chunks.push(chunk))

    expect((await client.audioStart()).ok).toBe(true)
    socket.send(encodeFrame(FRAME_TYPE_PCM, Buffer.alloc(480, 3)))
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThanOrEqual(1), {
      timeout: 2000,
    })
    expect(chunks[0]?.mimeType).toBe("audio/pcm")
    expect(Buffer.from(chunks[0]!.audioBase64, "base64").length).toBe(480)

    expect((await client.audioStop()).ok).toBe(true)
    const afterStop = chunks.length
    socket.send(encodeFrame(FRAME_TYPE_PCM, Buffer.alloc(480, 4)))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(chunks.length).toBe(afterStop)

    unsubscribe()
    await client.close()
  })

  it("ブリッジが落ちていても例外にせず ok:false", async () => {
    const client = createStackchanBridgeClient({
      // 誰も listen していないポート
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 300,
    })
    const result = await client.getStatus()
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
