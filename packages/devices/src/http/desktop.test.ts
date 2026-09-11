import { createServer, type RequestListener, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { MOCK_PNG_BASE64 } from "../constants"
import { startMockDesktopServer } from "../mock-servers"
import { createDesktopClient } from "./desktop"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

/** モックサーバーをポート 0 で起動して baseUrl を返す */
async function startDesktop(): Promise<string> {
  const handle = await startMockDesktopServer(0)
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

describe("createDesktopClient", () => {
  it("screenshot がワイヤ形式を camelCase に変換して返す", async () => {
    const desktop = createDesktopClient({ baseUrl: await startDesktop() })
    const result = await desktop.screenshot()
    expect(result.ok).toBe(true)
    expect(result.data?.mimeType).toBe("image/png")
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
  })

  it("Data URL 接頭辞が付いていたら剥がす", async () => {
    const baseUrl = await startCustomServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          mime_type: "image/png",
          image_base64: `data:image/png;base64,${MOCK_PNG_BASE64}`,
        })
      )
    })
    const desktop = createDesktopClient({ baseUrl })
    const result = await desktop.screenshot()
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
  })

  it("openBrowser は http/https を受け付ける", async () => {
    const desktop = createDesktopClient({ baseUrl: await startDesktop() })
    const result = await desktop.openBrowser({ url: "https://example.com" })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  })

  it("openBrowser は http/https 以外を送信前に弾く", async () => {
    let received = 0
    const baseUrl = await startCustomServer((_req, res) => {
      received += 1
      res.writeHead(200).end("{}")
    })
    const desktop = createDesktopClient({ baseUrl })
    const result = await desktop.openBrowser({ url: "file:///etc/passwd" })
    expect(result.ok).toBe(false)
    expect(received).toBe(0)
  })

  it("status が state を返す", async () => {
    const desktop = createDesktopClient({ baseUrl: await startDesktop() })
    const result = await desktop.status()
    expect(result.ok).toBe(true)
    expect(result.data?.state).toBe("running")
  })

  it("想定外の応答形式は ok:false にする", async () => {
    const baseUrl = await startCustomServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ unexpected: true }))
    })
    const desktop = createDesktopClient({ baseUrl })
    const result = await desktop.screenshot()
    expect(result.ok).toBe(false)
    expect(result.error).toContain("desktop/screenshot")
  })

  it("応答が無ければタイムアウトする", async () => {
    const baseUrl = await startCustomServer(() => {
      // 応答を返さない
    })
    const desktop = createDesktopClient({ baseUrl, timeoutMs: 150 })
    const result = await desktop.status()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("timeout")
  })
})
