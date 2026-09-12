import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { createStackchanHttpClient } from "./stackchan-http"

/** 受け取ったリクエスト 1 件分の記録 */
interface Received {
  method: string
  url: string
  contentType: string | undefined
  body: string
  at: number
}

let server: Server | undefined
let baseUrl = ""
const received: Received[] = []
/** 同時に処理していたリクエスト数の最大値（直列化の確認に使う） */
let maxConcurrent = 0
let inFlight = 0

afterEach(async () => {
  const current = server
  server = undefined
  received.length = 0
  maxConcurrent = 0
  inFlight = 0
  if (!current) return
  current.closeAllConnections?.()
  await new Promise<void>((resolve) => current.close(() => resolve()))
})

/**
 * テスト用サーバーを立てる。
 * `handle` が未指定なら 200 `ok` を返し、`delayMs` のあいだ応答を遅らせる
 */
async function startServer(options?: {
  delayMs?: number
  /** true なら応答せずソケットを壊す（実機の「未知パスで接続リセット」を模す） */
  resetFirst?: number
  /** 応答を返さない（タイムアウト確認用） */
  silent?: boolean
}): Promise<void> {
  let resetLeft = options?.resetFirst ?? 0

  server = createServer((req, res) => {
    inFlight += 1
    maxConcurrent = Math.max(maxConcurrent, inFlight)
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      received.push({
        method: req.method ?? "?",
        url: req.url ?? "",
        contentType: req.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
        at: Date.now(),
      })
      if (resetLeft > 0) {
        resetLeft -= 1
        inFlight -= 1
        res.socket?.destroy()
        return
      }
      if (options?.silent) {
        // 応答せずに放置してタイムアウトさせる
        return
      }
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" })
        res.end("ok")
        inFlight -= 1
      }, options?.delayMs ?? 0)
    })
  })

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server?.address()
  const port = typeof address === "object" && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
}

describe("createStackchanHttpClient", () => {
  it("hand / led が実機と同じパスへ、ボディも content-type も付けずに POST される", async () => {
    await startServer()
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    expect((await client.handSet("open")).ok).toBe(true)
    expect((await client.handSet("closed")).ok).toBe(true)
    expect((await client.ledSet(true)).ok).toBe(true)
    expect((await client.ledSet(false)).ok).toBe(true)

    expect(received.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /obake/hand_open",
      "POST /obake/hand_close",
      "POST /obake/led_on",
      "POST /obake/led_off",
    ])
    for (const request of received) {
      expect(request.body).toBe("")
      expect(request.contentType).toBeUndefined()
    }
  })

  it("同時に呼んでも直列（同時 1 本）で、送信順も呼び出し順のまま", async () => {
    await startServer({ delayMs: 20 })
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    await Promise.all([
      client.handSet("open"),
      client.ledSet(true),
      client.handSet("closed"),
    ])

    expect(maxConcurrent).toBe(1)
    expect(received.map((r) => r.url)).toEqual([
      "/obake/hand_open",
      "/obake/led_on",
      "/obake/hand_close",
    ])
  })

  it("連続送信のあいだに最低 minIntervalMs 空ける", async () => {
    await startServer()
    const minIntervalMs = 80
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs })

    await client.ledSet(true)
    await client.ledSet(false)
    await client.ledSet(true)

    expect(received).toHaveLength(3)
    for (let i = 1; i < received.length; i += 1) {
      // タイマーの丸め誤差を見て少しだけ緩める
      expect(received[i]!.at - received[i - 1]!.at).toBeGreaterThanOrEqual(
        minIntervalMs - 15
      )
    }
  })

  it("接続リセット（実機の症状）は 1 回だけ再送する", async () => {
    await startServer({ resetFirst: 1 })
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    const result = await client.handSet("closed")

    expect(result.ok).toBe(true)
    expect(received.map((r) => r.url)).toEqual([
      "/obake/hand_close",
      "/obake/hand_close",
    ])
  })

  it("応答が無ければ timeout を返し、再送もしない", async () => {
    await startServer({ silent: true })
    const client = createStackchanHttpClient({
      baseUrl,
      timeoutMs: 60,
      minIntervalMs: 0,
    })

    const result = await client.ledSet(true)

    expect(result.ok).toBe(false)
    expect(result.error).toBe("timeout")
    expect(received).toHaveLength(1)
  })

  it("キューは失敗しても止まらず、次の送信が通る", async () => {
    await startServer({ resetFirst: 2 })
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    const first = await client.handSet("open")
    const second = await client.ledSet(true)

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
  })

  it("health は GET / の 200 と本文の Obake を見る", async () => {
    server = createServer((req, res) => {
      received.push({
        method: req.method ?? "?",
        url: req.url ?? "",
        contentType: req.headers["content-type"],
        body: "",
        at: Date.now(),
      })
      const body =
        req.url === "/"
          ? "<html><head><title>Obake</title></head><body></body></html>"
          : "other"
      res.writeHead(200, { "content-type": "text/html" })
      res.end(body)
    })
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const client = createStackchanHttpClient({
      baseUrl: `http://127.0.0.1:${port}`,
      minIntervalMs: 0,
    })

    const result = await client.health()
    expect(result.ok).toBe(true)
    expect(result.data?.ok).toBe(true)
    expect(received[0]?.method).toBe("GET")
    expect(received[0]?.url).toBe("/")
  })

  it("health は本文に Obake が無ければ ok:false", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" })
      res.end("<html><title>other</title></html>")
    })
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const client = createStackchanHttpClient({
      baseUrl: `http://127.0.0.1:${port}`,
      minIntervalMs: 0,
    })

    const result = await client.health()
    expect(result.ok).toBe(false)
    expect(result.data?.ok).toBe(false)
  })

  it("繋がらない相手には ok:false を返し、例外を投げない", async () => {
    // 何も listen していないポート（実機が電源断のときと同じ状況）
    const client = createStackchanHttpClient({
      baseUrl: "http://127.0.0.1:1",
      minIntervalMs: 0,
    })

    const result = await client.ledSet(false)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
