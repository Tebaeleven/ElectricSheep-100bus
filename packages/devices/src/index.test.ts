import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { createDevices } from "./index"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

/** モッククライアントかどうかはテスト用プロパティの有無で判定する */
function isMockRail(rail: object): boolean {
  return "moves" in rail
}
function isMockDesktop(desktop: object): boolean {
  return "openedUrls" in desktop
}
function isMockStackchan(stackchan: object): boolean {
  return "headAngles" in stackchan
}
/** ブリッジ（B 方式）／合成クライアントは getStatus を持つ */
function isBridgeStackchan(stackchan: object): boolean {
  return "getStatus" in stackchan
}

describe("createDevices", () => {
  it("DEVICE_MODE 未設定なら全てモック", () => {
    const devices = createDevices({})
    expect(isMockRail(devices.rail)).toBe(true)
    expect(isMockDesktop(devices.desktop)).toBe(true)
    expect(isMockStackchan(devices.stackchan)).toBe(true)
  })

  it("DEVICE_MODE=mock は URL があってもモック", () => {
    const devices = createDevices({
      DEVICE_MODE: "mock",
      RAIL_BASE_URL: "http://127.0.0.1:8791",
      DESKTOP_BASE_URL: "http://127.0.0.1:8792",
      STACKCHAN_WS_URL: "ws://127.0.0.1:8793",
    })
    expect(isMockRail(devices.rail)).toBe(true)
    expect(isMockDesktop(devices.desktop)).toBe(true)
    expect(isMockStackchan(devices.stackchan)).toBe(true)
  })

  it("DEVICE_MODE=real かつ URL があれば実クライアント", () => {
    const devices = createDevices({
      DEVICE_MODE: "real",
      RAIL_BASE_URL: "http://127.0.0.1:8791",
      DESKTOP_BASE_URL: "http://127.0.0.1:8792",
      STACKCHAN_WS_URL: "ws://127.0.0.1:8793",
    })
    expect(isMockRail(devices.rail)).toBe(false)
    expect(isMockDesktop(devices.desktop)).toBe(false)
    expect(isMockStackchan(devices.stackchan)).toBe(false)
  })

  it("DEVICE_MODE=real でも URL 未設定の機器はモック", () => {
    const devices = createDevices({
      DEVICE_MODE: "real",
      RAIL_BASE_URL: "http://127.0.0.1:8791",
      DESKTOP_BASE_URL: "   ",
    })
    expect(isMockRail(devices.rail)).toBe(false)
    expect(isMockDesktop(devices.desktop)).toBe(true)
    expect(isMockStackchan(devices.stackchan)).toBe(true)
  })

  it("STACKCHAN_BRIDGE_URL があればブリッジ（B 方式）クライアントを使う", () => {
    const devices = createDevices({
      DEVICE_MODE: "real",
      STACKCHAN_BRIDGE_URL: "http://127.0.0.1:8030",
      // 旧契約の WS URL があってもブリッジを優先する
      STACKCHAN_WS_URL: "ws://127.0.0.1:8793",
    })
    expect(isMockStackchan(devices.stackchan)).toBe(false)
    expect(isBridgeStackchan(devices.stackchan)).toBe(true)
  })

  it("STACKCHAN_BRIDGE_URL が無く STACKCHAN_WS_URL だけなら旧契約 WS クライアント", () => {
    const devices = createDevices({
      DEVICE_MODE: "real",
      STACKCHAN_WS_URL: "ws://127.0.0.1:8793",
    })
    expect(isMockStackchan(devices.stackchan)).toBe(false)
    expect(isBridgeStackchan(devices.stackchan)).toBe(false)
  })

  it("STACKCHAN_HTTP_URL があれば合成クライアント（手と LED は HTTP）になる", async () => {
    const requests: string[] = []
    const server: Server = createServer((req, res) => {
      requests.push(`${req.method ?? "?"} ${req.url ?? ""}`)
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
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
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )

    const devices = createDevices({
      DEVICE_MODE: "real",
      STACKCHAN_HTTP_URL: `http://127.0.0.1:${port}`,
    })
    expect(isMockStackchan(devices.stackchan)).toBe(false)
    expect(isBridgeStackchan(devices.stackchan)).toBe(true)

    expect((await devices.stackchan.handSet("closed")).ok).toBe(true)
    expect((await devices.stackchan.ledSet(true)).ok).toBe(true)
    expect(requests).toEqual([
      "POST /obake/hand_close",
      "POST /obake/led_on",
    ])
  })

  it("STACKCHAN_HTTP_URL と STACKCHAN_BRIDGE_URL の両方があれば二本立てになる", () => {
    const devices = createDevices({
      DEVICE_MODE: "real",
      STACKCHAN_HTTP_URL: "http://127.0.0.1:8794",
      STACKCHAN_BRIDGE_URL: "http://127.0.0.1:8030",
    })
    expect(isMockStackchan(devices.stackchan)).toBe(false)
    expect(isBridgeStackchan(devices.stackchan)).toBe(true)
  })

  it("DEVICE_MODE=mock なら STACKCHAN_HTTP_URL があってもモック", () => {
    const devices = createDevices({
      DEVICE_MODE: "mock",
      STACKCHAN_HTTP_URL: "http://127.0.0.1:8794",
    })
    expect(isMockStackchan(devices.stackchan)).toBe(true)
  })

  it("DEVICE_AUTH_TOKEN は Authorization: Bearer として送られる", async () => {
    let authorization: string | undefined
    const server: Server = createServer((req, res) => {
      authorization = req.headers.authorization
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ state: "stopped" }))
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
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )

    const devices = createDevices({
      DEVICE_MODE: "real",
      RAIL_BASE_URL: `http://127.0.0.1:${port}`,
      DEVICE_AUTH_TOKEN: "secret-token",
    })
    const result = await devices.rail.status()
    expect(result.ok).toBe(true)
    expect(authorization).toBe("Bearer secret-token")
  })
})
