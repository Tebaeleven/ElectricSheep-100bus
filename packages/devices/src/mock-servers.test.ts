import { afterEach, describe, expect, it } from "vitest"

import { createStackchanHttpClient } from "./http/stackchan-http"
import {
  startMockStackchanHttpServer,
  type MockServerHandle,
} from "./mock-servers"

let handle: MockServerHandle | undefined

afterEach(async () => {
  await handle?.close()
  handle = undefined
})

/** ポート 0 で起動して baseUrl を返す */
async function start(): Promise<string> {
  handle = await startMockStackchanHttpServer(0)
  return `http://127.0.0.1:${handle.port}`
}

describe("startMockStackchanHttpServer", () => {
  it("GET / と /control が Obake の HTML を返す", async () => {
    const baseUrl = await start()

    for (const path of ["/", "/control"]) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      expect(await response.text()).toContain("<title>Obake</title>")
    }
  })

  it("hand / led の 4 パスが 200 ok を返し、状態が HTML に出る", async () => {
    const baseUrl = await start()
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    expect((await client.handSet("closed")).ok).toBe(true)
    expect((await client.ledSet(true)).ok).toBe(true)

    const html = await (await fetch(`${baseUrl}/control`)).text()
    expect(html).toContain("hand=closed")
    expect(html).toContain("led=on")

    expect((await client.handSet("open")).ok).toBe(true)
    expect((await client.ledSet(false)).ok).toBe(true)
    const after = await (await fetch(`${baseUrl}/control`)).text()
    expect(after).toContain("hand=open")
    expect(after).toContain("led=off")
  })

  it("health が通る", async () => {
    const baseUrl = await start()
    const client = createStackchanHttpClient({ baseUrl, minIntervalMs: 0 })

    const result = await client.health()
    expect(result.ok).toBe(true)
    expect(result.data?.ok).toBe(true)
  })

  it("未知パスは 404（実機は接続リセットするが、モックでは 404 で表す）", async () => {
    const baseUrl = await start()

    const response = await fetch(`${baseUrl}/obake/status`, { method: "GET" })
    expect(response.status).toBe(404)
  })
})
