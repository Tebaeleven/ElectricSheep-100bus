import { createServer, type RequestListener, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { startMockRailServer, type MockServerHandle } from "../mock-servers"
import { createRailClient } from "./rail"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

/** モックサーバーをポート 0 で起動して baseUrl を返す */
async function startRail(): Promise<string> {
  const handle: MockServerHandle = await startMockRailServer(0)
  cleanups.push(() => handle.close())
  return `http://127.0.0.1:${handle.port}`
}

/** 任意のハンドラで動く検証用サーバーをポート 0 で起動する */
async function startCustomServer(
  handler: RequestListener
): Promise<string> {
  const server: Server = createServer(handler)
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address ? address.port : 0)
    })
  })
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  return `http://127.0.0.1:${port}`
}

describe("createRailClient", () => {
  it("move → status → stop が成功する", async () => {
    const rail = createRailClient({ baseUrl: await startRail() })

    const moved = await rail.move({ axis: "x", direction: 1, durationMs: 500 })
    expect(moved.ok).toBe(true)
    expect(moved.status).toBe(200)

    const status = await rail.status()
    expect(status.ok).toBe(true)
    expect(status.data?.state).toBe("moving")
    // 機器が返す追加フィールドは落とさない
    expect(status.data?.move_count).toBe(1)

    const stopped = await rail.stop()
    expect(stopped.ok).toBe(true)
    expect((await rail.status()).data?.state).toBe("stopped")
  })

  it("baseUrl の末尾スラッシュがあっても /api/v1 を正しく付ける", async () => {
    const rail = createRailClient({ baseUrl: `${await startRail()}/` })
    expect((await rail.status()).ok).toBe(true)
  })

  it("duration_ms が上限超過なら送信前に弾く", async () => {
    const rail = createRailClient({ baseUrl: await startRail() })
    const result = await rail.move({
      axis: "z",
      direction: -1,
      durationMs: 999_999,
    })
    expect(result.ok).toBe(false)
    // リクエスト前のバリデーションなので status は付かない
    expect(result.status).toBeUndefined()
  })

  it("サーバーが 400 を返したら ok:false でエラーを載せる", async () => {
    const baseUrl = await startCustomServer((_req, res) => {
      res.writeHead(400, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "axis が不正です" }))
    })
    const rail = createRailClient({ baseUrl })
    const result = await rail.move({ axis: "x", direction: 1, durationMs: 100 })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toBe("axis が不正です")
  })

  it("応答が無ければタイムアウトする", async () => {
    const baseUrl = await startCustomServer(() => {
      // 応答を返さない
    })
    const rail = createRailClient({ baseUrl, timeoutMs: 150 })
    const result = await rail.move({ axis: "y", direction: 1, durationMs: 100 })
    expect(result.ok).toBe(false)
    expect(result.error).toBe("timeout")
  })

  it("move はネットワークエラーでも再送しない（安全要件）", async () => {
    let received = 0
    const baseUrl = await startCustomServer((_req, res) => {
      received += 1
      res.socket?.destroy()
    })
    const rail = createRailClient({ baseUrl, timeoutMs: 1000 })
    const result = await rail.move({ axis: "x", direction: 1, durationMs: 100 })
    expect(result.ok).toBe(false)
    expect(received).toBe(1)
  })

  it("stop はネットワークエラー時に 1 回だけ再試行する", async () => {
    let received = 0
    const baseUrl = await startCustomServer((_req, res) => {
      received += 1
      if (received === 1) {
        res.socket?.destroy()
        return
      }
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ accepted: true }))
    })
    const rail = createRailClient({ baseUrl, timeoutMs: 1000 })
    const result = await rail.stop()
    expect(result.ok).toBe(true)
    expect(received).toBe(2)
  })

  it("headers をマージして送る", async () => {
    let authorization: string | undefined
    const baseUrl = await startCustomServer((req, res) => {
      authorization = req.headers.authorization
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ state: "stopped" }))
    })
    const rail = createRailClient({
      baseUrl,
      headers: { Authorization: "Bearer test-token" },
    })
    await rail.status()
    expect(authorization).toBe("Bearer test-token")
  })

  it("呼び出し側の signal で中断できる", async () => {
    const baseUrl = await startCustomServer(() => {
      // 応答を返さない
    })
    const rail = createRailClient({ baseUrl, timeoutMs: 5000 })
    const controller = new AbortController()
    const promise = rail.status(controller.signal)
    controller.abort()
    const result = await promise
    expect(result.ok).toBe(false)
    expect(result.error).toBe("aborted")
  })
})
