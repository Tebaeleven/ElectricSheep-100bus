import { createServer, type Server } from "node:http"

import { WebSocketServer, type WebSocket as WsSocket } from "ws"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MOCK_PNG_BASE64, STACKCHAN_WS_PATH } from "../constants"
import { startMockStackchanServer } from "../mock-servers"
import type { AudioChunk, StackchanInbound } from "../types"
import { createStackchanClient } from "./stackchan"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

/** モック WS サーバーをポート 0 で起動して ws:// の URL を返す */
async function startMock(): Promise<string> {
  const handle = await startMockStackchanServer(0)
  cleanups.push(() => handle.close())
  return `ws://127.0.0.1:${handle.port}`
}

interface CustomWsServer {
  url: string
  /** 接続中のサーバー側ソケット（切断テスト用） */
  sockets: WsSocket[]
}

/** 任意の応答を返す検証用 WS サーバーをポート 0 で起動する */
async function startCustomWs(
  onMessage?: (socket: WsSocket, msg: Record<string, unknown>) => void
): Promise<CustomWsServer> {
  const server: Server = createServer()
  const wss = new WebSocketServer({ server, path: STACKCHAN_WS_PATH })
  const sockets: WsSocket[] = []

  wss.on("connection", (socket) => {
    sockets.push(socket)
    socket.on("message", (raw: Buffer) => {
      onMessage?.(socket, JSON.parse(raw.toString("utf8")) as Record<string, unknown>)
    })
  })

  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address ? address.port : 0)
    })
  })
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.terminate()
        wss.close(() => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
      })
  )
  return { url: `ws://127.0.0.1:${port}`, sockets }
}

describe("createStackchanClient", () => {
  it("connect / close で接続状態が変わる", async () => {
    const client = createStackchanClient({ url: await startMock() })
    expect(client.connected).toBe(false)
    await client.connect()
    expect(client.connected).toBe(true)
    await client.close()
    expect(client.connected).toBe(false)
  })

  it("未接続でも handSet が自動接続して ack を待つ", async () => {
    const client = createStackchanClient({ url: await startMock() })
    const result = await client.handSet("closed")
    expect(result.ok).toBe(true)
    expect(client.connected).toBe(true)
    await client.close()
  })

  it("cameraCapture は camera.frame を受けて画像を返す", async () => {
    const client = createStackchanClient({ url: await startMock() })
    const result = await client.cameraCapture()
    expect(result.ok).toBe(true)
    expect(result.data?.mimeType).toBe("image/png")
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
    await client.close()
  })

  it("cameraCapture は ack だけでは解決せず camera.frame を待つ", async () => {
    const { url } = await startCustomWs((socket, msg) => {
      if (msg.type !== "camera.capture") return
      // 先に ack、少し遅れて frame を返す
      socket.send(JSON.stringify({ type: "ack", request_id: msg.request_id }))
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            type: "camera.frame",
            request_id: msg.request_id,
            data: { mime_type: "image/jpeg", image_base64: MOCK_PNG_BASE64 },
          })
        )
      }, 50)
    })
    const client = createStackchanClient({ url, timeoutMs: 2000 })
    const result = await client.cameraCapture()
    expect(result.ok).toBe(true)
    expect(result.data?.mimeType).toBe("image/jpeg")
    await client.close()
  })

  it("request_id が一致しない camera.frame でも直近の capture 待ちに対応付ける", async () => {
    const { url } = await startCustomWs((socket, msg) => {
      if (msg.type !== "camera.capture") return
      socket.send(
        JSON.stringify({
          type: "camera.frame",
          request_id: "req-001",
          data: { mime_type: "image/png", image_base64: MOCK_PNG_BASE64 },
        })
      )
    })
    const client = createStackchanClient({ url, timeoutMs: 2000 })
    const result = await client.cameraCapture()
    expect(result.ok).toBe(true)
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
    await client.close()
  })

  it("error 応答は ok:false になる", async () => {
    const client = createStackchanClient({ url: await startMock() })
    await client.connect()
    // モックは未知の state を拒否するため、型を無視して不正値を送る
    const result = await (
      client as unknown as {
        handSet(state: string): Promise<{ ok: boolean; error?: string }>
      }
    ).handSet("half-open")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("state")
    await client.close()
  })

  it("未知の type には error が返る（モックサーバーの挙動）", async () => {
    const url = await startMock()
    const events: StackchanInbound[] = []
    const client = createStackchanClient({ url })
    client.onEvent((msg) => events.push(msg))
    await client.connect()
    // 生の WebSocket で未知の type を送る
    const raw = new WebSocket(`${url}${STACKCHAN_WS_PATH}`)
    const received = await new Promise<StackchanInbound>((resolve) => {
      raw.addEventListener("open", () => {
        raw.send(JSON.stringify({ type: "unknown.op", request_id: "req-x" }))
      })
      raw.addEventListener("message", (event) => {
        resolve(JSON.parse(String(event.data)) as StackchanInbound)
      })
    })
    expect(received.type).toBe("error")
    raw.close()
    await client.close()
  })

  it("audio.start で chunk が届き、audio.stop で止まる", async () => {
    const client = createStackchanClient({ url: await startMock() })
    const chunks: AudioChunk[] = []
    const unsubscribe = client.onAudioChunk((chunk) => chunks.push(chunk))

    expect((await client.audioStart()).ok).toBe(true)
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThanOrEqual(2), {
      timeout: 2000,
    })
    expect(chunks[0]?.audioBase64.length).toBeGreaterThan(0)
    expect(chunks[0]?.receivedAt).toBeGreaterThan(0)

    expect((await client.audioStop()).ok).toBe(true)
    const afterStop = chunks.length
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(chunks.length).toBe(afterStop)

    unsubscribe()
    await client.close()
  })

  it("応答が無ければ timeout を返す", async () => {
    const { url } = await startCustomWs()
    const client = createStackchanClient({ url, timeoutMs: 150 })
    const result = await client.handSet("open")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("timeout")
    await client.close()
  })

  it("reconnect: true なら切断後に再接続し error イベントを通知する", async () => {
    const { url, sockets } = await startCustomWs((socket, msg) => {
      socket.send(JSON.stringify({ type: "ack", request_id: msg.request_id }))
    })
    const events: StackchanInbound[] = []
    const client = createStackchanClient({ url, reconnect: true, timeoutMs: 1000 })
    client.onEvent((msg) => events.push(msg))
    await client.connect()
    expect(client.connected).toBe(true)

    // サーバー側から切断する
    sockets[0]?.close()

    await vi.waitFor(
      () =>
        expect(
          events.some(
            (event) =>
              event.type === "error" && event.data?.code === "disconnected"
          )
        ).toBe(true),
      { timeout: 2000 }
    )
    await vi.waitFor(() => expect(client.connected).toBe(true), {
      timeout: 3000,
    })
    expect((await client.handSet("open")).ok).toBe(true)

    await client.close()
    expect(client.connected).toBe(false)
  })

  it("close 後は再接続しない", async () => {
    const { url, sockets } = await startCustomWs()
    const client = createStackchanClient({ url, reconnect: true })
    await client.connect()
    await client.close()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(client.connected).toBe(false)
    expect(sockets).toHaveLength(1)
  })
})
