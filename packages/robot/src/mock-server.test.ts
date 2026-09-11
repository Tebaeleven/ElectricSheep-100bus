import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { startRobotMockServer } from "./mock-server.js"

let baseUrl = ""
let close: () => Promise<void>

beforeAll(async () => {
  const started = await startRobotMockServer(0)
  baseUrl = `http://127.0.0.1:${started.port}`
  close = async () => {
    started.server.closeAllConnections()
    await started.close()
  }
})

afterAll(async () => {
  await close()
})

describe("robot モックサーバー", () => {
  it("既定 endpointMap のパスを受け、type をパスから補って検証する", async () => {
    const res = await fetch(`${baseUrl}/emote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emotion: "happy" }),
    })
    const body = (await res.json()) as { ok: boolean; received: unknown; at: string }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.received).toEqual({ type: "emote", emotion: "happy" })
    expect(new Date(body.at).toISOString()).toBe(body.at)
  })

  it("move / speak / stop も受け付ける", async () => {
    const move = await fetch(`${baseUrl}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction: "forward", durationMs: 500 }),
    })
    const speak = await fetch(`${baseUrl}/speak`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "おばけだぞ" }),
    })
    const stop = await fetch(`${baseUrl}/stop`, { method: "POST" })

    expect([move.status, speak.status, stop.status]).toEqual([200, 200, 200])
  })

  it("語彙に合わない body は 400", async () => {
    const res = await fetch(`${baseUrl}/emote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emotion: "angry" }),
    })
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it("GET /status は 200 を返す", async () => {
    const res = await fetch(`${baseUrl}/status`)
    const body = (await res.json()) as { ok: boolean; commandCount: number }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof body.commandCount).toBe("number")
  })

  it("未知パスは 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/unknown`, { method: "POST" })
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("/unknown")
  })
})
