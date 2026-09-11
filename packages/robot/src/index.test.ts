import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vitest"

import { createRobotClient } from "./index"

let server: Server | undefined

/** 受け取ったパスを記録するだけのテスト用サーバー */
async function startServer(paths: string[]): Promise<string> {
  server = createServer((req, res) => {
    paths.push(req.url ?? "")
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve) => server?.listen(0, resolve))
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

afterEach(async () => {
  const current = server
  server = undefined
  if (!current) return
  await new Promise<void>((resolve) => {
    current.closeAllConnections()
    current.close(() => resolve())
  })
})

describe("createRobotClient", () => {
  it("ROBOT_MODE 未設定ならモック", async () => {
    const client = createRobotClient({})
    const result = await client.sendCommand({ type: "stop" })

    expect("commands" in client).toBe(true)
    expect(result.body).toEqual({ accepted: true })
  })

  it("ROBOT_MODE=mock ならモック", () => {
    const client = createRobotClient({ ROBOT_MODE: "mock", ROBOT_BASE_URL: "http://127.0.0.1:8787" })

    expect("commands" in client).toBe(true)
  })

  it("ROBOT_MODE=http でも ROBOT_BASE_URL が無ければモック", () => {
    const client = createRobotClient({ ROBOT_MODE: "http" })

    expect("commands" in client).toBe(true)
  })

  it("ROBOT_MODE=http かつ ROBOT_BASE_URL ありなら HTTP クライアント", async () => {
    const paths: string[] = []
    const baseUrl = await startServer(paths)
    const client = createRobotClient({ ROBOT_MODE: "http", ROBOT_BASE_URL: baseUrl })

    expect("commands" in client).toBe(false)

    const result = await client.sendCommand({ type: "emote", emotion: "sad" })

    expect(result.ok).toBe(true)
    expect(paths).toEqual(["/emote"])
  })
})
