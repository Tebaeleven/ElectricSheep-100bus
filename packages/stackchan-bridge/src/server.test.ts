import { afterEach, describe, expect, it } from "vitest"
import WebSocket from "ws"

import {
  encodeFrame,
  encodeHello,
  FRAME_TYPE_JPEG,
  FRAME_TYPE_PCM,
  MEDIA_WS_PATH,
} from "./protocol"
import { createBridge, type Bridge } from "./server"
import { TEST_JPEG_FRAMES } from "./test-frames"

const jpeg = Buffer.from(TEST_JPEG_FRAMES[0]!, "base64")

let bridge: Bridge | undefined
let baseUrl = ""
let device: WebSocket | undefined

afterEach(async () => {
  device?.close()
  device = undefined
  await bridge?.stop()
  bridge = undefined
})

/** ポート 0 で bridge を起動する（ログは捨てる） */
async function startBridge(): Promise<void> {
  bridge = createBridge({ port: 0, host: "127.0.0.1", log: () => {} })
  const { port } = await bridge.start()
  baseUrl = `http://127.0.0.1:${port}`
}

/** 偽機器として接続する */
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

/** 条件が満たされるまで待つ（最大 2 秒） */
async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("waitFor: タイムアウトしました")
}

describe("createBridge", () => {
  it("偽機器の hello とフレームを受けて status に反映する", async () => {
    await startBridge()
    const socket = await connectDevice()
    await waitFor(() => bridge!.state.connected)

    socket.send(encodeHello(16000))
    socket.send(encodeFrame(FRAME_TYPE_JPEG, jpeg))
    socket.send(encodeFrame(FRAME_TYPE_PCM, Buffer.alloc(320)))
    await waitFor(() => bridge!.state.frames > 0 && bridge!.state.pcmChunks > 0)

    const status = (await (await fetch(`${baseUrl}/obake/status`)).json()) as {
      connected: boolean
      pcm_rate: number
      frames: number
      bytes: number
      last_frame_at: number | null
    }
    expect(status.connected).toBe(true)
    expect(status.pcm_rate).toBe(16000)
    expect(status.frames).toBe(1)
    expect(status.bytes).toBe(jpeg.length + 320)
    expect(status.last_frame_at).toBeTypeOf("number")
  })

  it("latest.jpg / latest.json が最新フレームを返す", async () => {
    await startBridge()
    // フレーム未受信のうちは 404
    expect((await fetch(`${baseUrl}/obake/latest.jpg`)).status).toBe(404)

    const socket = await connectDevice()
    socket.send(encodeFrame(FRAME_TYPE_JPEG, jpeg))
    await waitFor(() => bridge!.state.frames > 0)

    const response = await fetch(`${baseUrl}/obake/latest.jpg`)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.equals(jpeg)).toBe(true)
    // JPEG の SOI マーカー
    expect(body.subarray(0, 2).toString("hex")).toBe("ffd8")

    const json = (await (await fetch(`${baseUrl}/obake/latest.json`)).json()) as {
      mime_type: string
      image_base64: string
    }
    expect(json.mime_type).toBe("image/jpeg")
    expect(json.image_base64).toBe(jpeg.toString("base64"))
  })

  it("audio/recent が直近の PCM を base64 で返す", async () => {
    await startBridge()
    const socket = await connectDevice()
    socket.send(encodeHello(24000))
    socket.send(encodeFrame(FRAME_TYPE_PCM, Buffer.alloc(480, 1)))
    await waitFor(() => bridge!.state.pcmChunks > 0)

    const audio = (await (
      await fetch(`${baseUrl}/obake/audio/recent?ms=2000`)
    ).json()) as {
      pcm_rate: number
      mime_type: string
      audio_base64: string
      bytes: number
    }
    expect(audio.pcm_rate).toBe(24000)
    expect(audio.mime_type).toBe("audio/pcm")
    expect(audio.bytes).toBe(480)
    expect(Buffer.from(audio.audio_base64, "base64").length).toBe(480)
  })

  it("POST /obake/head が機器へ set_head を送る（未接続なら 503）", async () => {
    await startBridge()
    const before = await fetch(`${baseUrl}/obake/head`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaw: 10, pitch: 0 }),
    })
    expect(before.status).toBe(503)
    expect(((await before.json()) as { sent: boolean }).sent).toBe(false)

    const socket = await connectDevice()
    const received: string[] = []
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) received.push(data.toString("utf8"))
    })
    await waitFor(() => bridge!.state.connected)

    // 範囲外の値はファームと同じ clamp で丸める
    const response = await fetch(`${baseUrl}/obake/head`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaw: 200, pitch: -10, speed: 50 }),
    })
    expect(response.status).toBe(200)
    await waitFor(() => received.length > 0)
    expect(JSON.parse(received[0]!)).toEqual({
      cmd: "set_head",
      yaw: 128,
      pitch: 0,
      speed: 100,
    })
  })

  it("切断を検知して connected が false になる", async () => {
    await startBridge()
    const socket = await connectDevice()
    await waitFor(() => bridge!.state.connected)
    socket.close()
    await waitFor(() => !bridge!.state.connected)
    const status = (await (await fetch(`${baseUrl}/obake/status`)).json()) as {
      connected: boolean
    }
    expect(status.connected).toBe(false)
  })

  it("未知のパスは 404 を返す", async () => {
    await startBridge()
    const response = await fetch(`${baseUrl}/obake/unknown`)
    expect(response.status).toBe(404)
  })
})
