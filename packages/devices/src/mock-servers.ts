import { createServer, type Server } from "node:http"

import {
  MOCK_DESKTOP_PORT,
  MOCK_RAIL_PORT,
  MOCK_STACKCHAN_PORT,
} from "./constants"

/** 起動したモックサーバーのハンドル */
export interface MockServerHandle {
  close(): Promise<void>
}

/** 最小の http サーバーを立てる（本実装が入るまでは全て 404） */
function startStubServer(
  label: string,
  port: number
): Promise<MockServerHandle> {
  // TODO(P3-A): 受領仕様どおりのエンドポイントを実装する
  const server: Server = createServer((req, res) => {
    console.info(`[devices:mock] ${label} ${req.method} ${req.url} -> 404`)
    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "not implemented yet" }))
  })

  return new Promise<MockServerHandle>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, () => {
      console.info(
        `[devices:mock] ${label} listening on http://127.0.0.1:${port}`
      )
      resolve({
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          }),
      })
    })
  })
}

/** レール（ESP32）モックサーバー。実装本体は P3-A */
export function startMockRailServer(
  port: number = MOCK_RAIL_PORT
): Promise<MockServerHandle> {
  return startStubServer("rail", port)
}

/** デスクトップ（Electron）モックサーバー。実装本体は P3-A */
export function startMockDesktopServer(
  port: number = MOCK_DESKTOP_PORT
): Promise<MockServerHandle> {
  return startStubServer("desktop", port)
}

/** スタックちゃん（WebSocket）モックサーバー。実装本体は P3-A */
export function startMockStackchanServer(
  port: number = MOCK_STACKCHAN_PORT
): Promise<MockServerHandle> {
  // TODO(P3-A): /ws/v1/robot の WebSocket アップグレードを実装する
  return startStubServer("stackchan", port)
}

/** 3 台まとめて起動する */
export async function startAllMockServers(): Promise<MockServerHandle> {
  const handles = await Promise.all([
    startMockRailServer(),
    startMockDesktopServer(),
    startMockStackchanServer(),
  ])
  return {
    close: async () => {
      await Promise.all(handles.map((handle) => handle.close()))
    },
  }
}

// 直接実行されたときは 8791/8792/8793 で 3 台起動する
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  void startAllMockServers()
}
