import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach, describe, expect, it } from "vitest"

import { createHttpRobotClient } from "./http"

interface Received {
  method: string
  path: string
  body: string
}

interface TestServer {
  baseUrl: string
  received: Received[]
  close: () => Promise<void>
}

const servers: TestServer[] = []

/** ポート 0 でテスト用サーバーを立てる。handler 省略時は 200 JSON を返す */
async function startServer(
  handler?: (req: IncomingMessage, res: ServerResponse, received: Received[]) => void,
): Promise<TestServer> {
  const received: Received[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        path: req.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      })
      if (handler) {
        handler(req, res, received)
        return
      }
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0

  const testServer: TestServer = {
    baseUrl: `http://127.0.0.1:${port}`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
  servers.push(testServer)
  return testServer
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()))
})

describe("createHttpRobotClient", () => {
  it("既定 endpointMap でコマンドを送り、成功を RobotResult で返す", async () => {
    const server = await startServer()
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.sendCommand({ type: "emote", emotion: "happy" })

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(server.received).toEqual([
      { method: "POST", path: "/emote", body: JSON.stringify({ emotion: "happy" }) },
    ])
  })

  it("getStatus は GET /status を叩く", async () => {
    const server = await startServer()
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.getStatus()

    expect(result.ok).toBe(true)
    expect(server.received[0]?.method).toBe("GET")
    expect(server.received[0]?.path).toBe("/status")
  })

  it("raw コマンドは path と method をそのまま使い、body だけ送る", async () => {
    const server = await startServer()
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.sendCommand({
      type: "raw",
      path: "/custom/endpoint",
      method: "POST",
      body: { hello: "world" },
    })

    expect(result.ok).toBe(true)
    expect(server.received).toEqual([
      { method: "POST", path: "/custom/endpoint", body: JSON.stringify({ hello: "world" }) },
    ])
  })

  it("endpointMap で送信先を差し替えられる", async () => {
    const server = await startServer()
    const client = createHttpRobotClient({
      baseUrl: server.baseUrl,
      timeoutMs: 500,
      endpointMap: { move: { path: "/api/v1/drive", method: "POST" } },
    })

    await client.sendCommand({ type: "move", direction: "up", durationMs: 100 })

    expect(server.received[0]?.path).toBe("/api/v1/drive")
  })

  it("非 200 は ok:false + status + body で返し、リトライしない", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "boom" }))
    })
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.sendCommand({ type: "stop" })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: "boom" })
    expect(server.received).toHaveLength(1)
  })

  it("JSON でない本文はテキストのまま返す", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("OK")
    })
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.sendCommand({ type: "stop" })

    expect(result.body).toBe("OK")
  })

  it("応答が返らないとタイムアウトし、1 回だけリトライする", async () => {
    const server = await startServer(() => {
      // 意図的に応答しない
    })
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 120 })

    const result = await client.sendCommand({ type: "speak", text: "こんにちは" })

    expect(result.ok).toBe(false)
    expect(result.status).toBeUndefined()
    expect(result.error).toMatch(/Timeout|abort/i)
    expect(server.received).toHaveLength(2)
  })

  it("接続できないときも例外を投げず ok:false を返す", async () => {
    const client = createHttpRobotClient({ baseUrl: "http://127.0.0.1:1", timeoutMs: 200 })

    const result = await client.sendCommand({ type: "stop" })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it("呼び出し側が中断済みなら送信せずに返す", async () => {
    const server = await startServer()
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 500 })

    const result = await client.sendCommand({ type: "stop" }, AbortSignal.abort())

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(server.received).toHaveLength(0)
  })

  it("送信中の中断ではリトライせずに返す", async () => {
    const server = await startServer(() => {
      // 応答しないまま中断させる
    })
    const controller = new AbortController()
    const client = createHttpRobotClient({ baseUrl: server.baseUrl, timeoutMs: 5000 })

    const promise = client.sendCommand({ type: "stop" }, controller.signal)
    setTimeout(() => controller.abort(), 50)
    const result = await promise

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/abort/i)
    expect(server.received).toHaveLength(1)
  })
})
