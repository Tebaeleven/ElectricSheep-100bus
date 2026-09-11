import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"

import { WebSocketServer, type WebSocket as WsSocket } from "ws"

import {
  MOCK_AUDIO_CHUNK_BASE64,
  MOCK_AUDIO_CHUNK_INTERVAL_MS,
  MOCK_DESKTOP_PORT,
  MOCK_PNG_BASE64,
  MOCK_RAIL_PORT,
  MOCK_STACKCHAN_PORT,
  RAIL_MAX_DURATION_MS,
  STACKCHAN_WS_PATH,
} from "./constants"
import { openUrlSchema } from "./schemas"
import type { RailStatus } from "./types"
import { railMoveWireSchema } from "./wire"

/** 起動したモックサーバーのハンドル */
export interface MockServerHandle {
  /** 実際に listen しているポート（テストではポート 0 を指定して受け取る） */
  readonly port: number
  close(): Promise<void>
}

/** 1 行ログ。全受信を記録する */
function log(label: string, message: string): void {
  console.info(`[devices:mock] ${label} ${message}`)
}

/** JSON 本文を読む。壊れていたら null */
async function readJsonBody(req: IncomingMessage): Promise<unknown | null> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString("utf8")
  if (text.length === 0) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** node:http のサーバーを listen して MockServerHandle にする */
function listen(
  label: string,
  server: Server,
  port: number
): Promise<MockServerHandle> {
  return new Promise<MockServerHandle>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      const actualPort = typeof address === "object" && address ? address.port : port
      log(label, `listening on http://127.0.0.1:${actualPort}`)
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.closeAllConnections?.()
            server.close((err) => (err ? rej(err) : res()))
          }),
      })
    })
  })
}

/** JSON を返す小さなヘルパー */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

// --- レール（ESP32）モック -----------------------------------------------

/**
 * レールのモック HTTP サーバー。
 * move を受け付けると duration_ms 経過で自動的に stopped へ戻る
 */
export function startMockRailServer(
  port: number = MOCK_RAIL_PORT
): Promise<MockServerHandle> {
  let state: RailStatus["state"] = "stopped"
  let moveCount = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearMoveTimer = (): void => {
    if (!timer) return
    clearTimeout(timer)
    timer = undefined
  }

  const server = createServer((req, res) => {
    const url = req.url ?? ""
    log("rail", `${req.method ?? "?"} ${url}`)

    void (async () => {
      if (req.method === "POST" && url === "/api/v1/rail/move") {
        const body = await readJsonBody(req)
        const parsed = railMoveWireSchema
          .refine((v) => v.duration_ms <= RAIL_MAX_DURATION_MS, {
            message: `duration_ms は ${RAIL_MAX_DURATION_MS} 以下である必要があります`,
          })
          .safeParse(body)
        if (!parsed.success) {
          sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "invalid" })
          return
        }
        moveCount += 1
        state = "moving"
        clearMoveTimer()
        timer = setTimeout(() => {
          state = "stopped"
          timer = undefined
        }, parsed.data.duration_ms)
        timer.unref?.()
        sendJson(res, 200, { accepted: true, ...parsed.data })
        return
      }

      if (req.method === "POST" && url === "/api/v1/rail/stop") {
        clearMoveTimer()
        state = "stopped"
        sendJson(res, 200, { accepted: true })
        return
      }

      if (req.method === "GET" && url === "/api/v1/rail/status") {
        sendJson(res, 200, { state, move_count: moveCount })
        return
      }

      sendJson(res, 404, { error: "not found" })
    })()
  })

  server.on("close", clearMoveTimer)
  return listen("rail", server, port)
}

// --- デスクトップ（Electron）モック --------------------------------------

/** デスクトップのモック HTTP サーバー */
export function startMockDesktopServer(
  port: number = MOCK_DESKTOP_PORT
): Promise<MockServerHandle> {
  let screenshotCount = 0
  const openedUrls: string[] = []

  const server = createServer((req, res) => {
    const url = req.url ?? ""
    log("desktop", `${req.method ?? "?"} ${url}`)

    void (async () => {
      if (req.method === "POST" && url === "/api/v1/desktop/screenshot") {
        screenshotCount += 1
        sendJson(res, 200, {
          mime_type: "image/png",
          image_base64: MOCK_PNG_BASE64,
        })
        return
      }

      if (req.method === "POST" && url === "/api/v1/desktop/browser/open") {
        const body = await readJsonBody(req)
        const parsed = openUrlSchema.safeParse(body)
        if (!parsed.success) {
          sendJson(res, 400, {
            error: parsed.error.issues[0]?.message ?? "invalid url",
          })
          return
        }
        openedUrls.push(parsed.data.url)
        sendJson(res, 200, { accepted: true, url: parsed.data.url })
        return
      }

      if (req.method === "GET" && url === "/api/v1/desktop/status") {
        sendJson(res, 200, {
          state: "running",
          screenshot_count: screenshotCount,
          opened_url_count: openedUrls.length,
        })
        return
      }

      sendJson(res, 404, { error: "not found" })
    })()
  })

  return listen("desktop", server, port)
}

// --- スタックちゃん（WebSocket）モック ------------------------------------

/** 受信した WebSocket メッセージの最小形 */
interface InboundEnvelope {
  type?: unknown
  request_id?: unknown
  data?: unknown
}

/**
 * スタックちゃんのモック WebSocket サーバー。
 * hand.set→ack / camera.capture→camera.frame / audio.start→audio.chunk 連続送信
 */
export function startMockStackchanServer(
  port: number = MOCK_STACKCHAN_PORT
): Promise<MockServerHandle> {
  const server = createServer((_req, res) => {
    sendJson(res, 426, { error: "websocket upgrade required" })
  })
  const wss = new WebSocketServer({ server, path: STACKCHAN_WS_PATH })

  wss.on("connection", (socket: WsSocket) => {
    log("stackchan", "connection")
    let seq = 0
    let audioTimer: ReturnType<typeof setInterval> | undefined

    const send = (payload: unknown): void => {
      if (socket.readyState !== socket.OPEN) return
      socket.send(JSON.stringify(payload))
    }

    const stopAudio = (): void => {
      if (!audioTimer) return
      clearInterval(audioTimer)
      audioTimer = undefined
    }

    socket.on("message", (raw: Buffer | string) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8")
      log("stackchan", `recv ${text}`)

      let msg: InboundEnvelope
      try {
        msg = JSON.parse(text) as InboundEnvelope
      } catch {
        send({
          type: "error",
          request_id: "unknown",
          data: { code: "bad_json", message: "JSON として解釈できません" },
        })
        return
      }
      const requestId =
        typeof msg.request_id === "string" && msg.request_id.length > 0
          ? msg.request_id
          : "unknown"

      switch (msg.type) {
        case "hand.set": {
          const state = (msg.data as { state?: unknown } | undefined)?.state
          if (state !== "open" && state !== "closed") {
            send({
              type: "error",
              request_id: requestId,
              data: { code: "bad_state", message: "state は open|closed です" },
            })
            return
          }
          send({ type: "ack", request_id: requestId, data: { state } })
          return
        }
        case "camera.capture": {
          send({
            type: "camera.frame",
            request_id: requestId,
            data: { mime_type: "image/png", image_base64: MOCK_PNG_BASE64 },
          })
          return
        }
        case "audio.start": {
          send({ type: "ack", request_id: requestId })
          stopAudio()
          audioTimer = setInterval(() => {
            seq += 1
            send({
              type: "audio.chunk",
              request_id: requestId,
              data: {
                mime_type: "audio/pcm",
                audio_base64: MOCK_AUDIO_CHUNK_BASE64,
                seq,
              },
            })
          }, MOCK_AUDIO_CHUNK_INTERVAL_MS)
          audioTimer.unref?.()
          return
        }
        case "audio.stop": {
          stopAudio()
          send({ type: "ack", request_id: requestId })
          return
        }
        default: {
          send({
            type: "error",
            request_id: requestId,
            data: {
              code: "unknown_type",
              message: `未知の type: ${String(msg.type)}`,
            },
          })
          return
        }
      }
    })

    socket.on("close", () => {
      stopAudio()
      log("stackchan", "close")
    })
  })

  return listen("stackchan", server, port).then((handle) => ({
    port: handle.port,
    close: async () => {
      await new Promise<void>((resolve) => {
        wss.close(() => resolve())
      })
      await handle.close()
    },
  }))
}

/** 3 台まとめて起動する */
export async function startAllMockServers(): Promise<MockServerHandle> {
  const handles = await Promise.all([
    startMockRailServer(),
    startMockDesktopServer(),
    startMockStackchanServer(),
  ])
  return {
    port: handles[0].port,
    close: async () => {
      await Promise.all(handles.map((handle) => handle.close()))
    },
  }
}

// 直接実行されたときは 8791/8792/8793 で 3 台起動する
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  void startAllMockServers().then((handle) => {
    const shutdown = (): void => {
      void handle.close().then(() => process.exit(0))
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
  })
}
