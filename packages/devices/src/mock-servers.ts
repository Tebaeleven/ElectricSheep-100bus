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
import type { RailAxis } from "./types"
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
  // ファーム rail_dc は空ボディを 400 にするので、空と壊れた JSON を同じ null で表す
  if (text.length === 0) return null
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
 * レールのモック HTTP サーバー。実機ファーム `firmware/esp32-rail/firmware/rail_dc` 互換。
 * - `move` / `stop` は **202** `{"command_id","status":"accepted"}` を返す
 * - `stop` は **JSON ボディ必須**（`{"axis":null}` で全軸、`{"axis":"x"}` で単軸）
 * - `status` はファームと同じ形（`state` は返さず `axes[]` から導出させる）
 */
export function startMockRailServer(
  port: number = MOCK_RAIL_PORT
): Promise<MockServerHandle> {
  let moveCount = 0
  /** 動作中の軸だけを持つ。value は方向・停止予定時刻・タイマー */
  const running = new Map<
    RailAxis,
    { direction: number; until: number; timer: ReturnType<typeof setTimeout> }
  >()

  const clearAxis = (axis: RailAxis): void => {
    const value = running.get(axis)
    if (!value) return
    clearTimeout(value.timer)
    running.delete(axis)
  }

  const clearAll = (): void => {
    for (const axis of [...running.keys()]) clearAxis(axis)
  }

  /** ファームと同じ命令 ID を採番する */
  const nextCommandId = (): string =>
    `http-${Math.random().toString(16).slice(2, 10)}`

  /** ファームと同じ status JSON を組み立てる */
  const statusJson = (): Record<string, unknown> => {
    const now = Date.now()
    return {
      type: "status",
      firmware: "rail-dc-xyz-1.0",
      mode: "led_preview",
      simulated: true,
      rgb_led_ready: false,
      configured: false,
      wifi_connected: false,
      server_connected: false,
      pwm_duty: 128,
      http_port: 80,
      http_auth_required: false,
      ap_ip: "192.168.4.1",
      ap_ssid: "Rail-ESP32-mock",
      ip: "127.0.0.1",
      // モック独自の補助フィールド（実機ファームには無い）
      move_count: moveCount,
      axes: (["x", "y", "z"] as const).map((axis) => {
        const value = running.get(axis)
        return {
          axis,
          active: value !== undefined,
          pending: false,
          direction: value?.direction ?? 0,
          remaining_ms: value ? Math.max(0, value.until - now) : 0,
        }
      }),
    }
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
          sendJson(res, 400, {
            error: parsed.error.issues[0]?.message ?? "invalid",
          })
          return
        }
        moveCount += 1
        const move = parsed.data
        clearAxis(move.axis)
        const timer = setTimeout(() => {
          running.delete(move.axis)
        }, move.duration_ms)
        timer.unref?.()
        running.set(move.axis, {
          direction: move.direction,
          until: Date.now() + move.duration_ms,
          timer,
        })
        sendJson(res, 202, {
          command_id: nextCommandId(),
          status: "accepted",
        })
        return
      }

      if (req.method === "POST" && url === "/api/v1/rail/stop") {
        // ファームと同じく content-type と JSON ボディを必須にする
        const contentType = req.headers["content-type"] ?? ""
        const body = await readJsonBody(req)
        if (
          !contentType.includes("json") ||
          body === null ||
          typeof body !== "object" ||
          Array.isArray(body)
        ) {
          sendJson(res, 400, { error: "expected JSON object" })
          return
        }
        const axis = (body as { axis?: unknown }).axis
        if (axis === null || axis === undefined) clearAll()
        else if (axis === "x" || axis === "y" || axis === "z") clearAxis(axis)
        else {
          sendJson(res, 422, { error: "invalid axis" })
          return
        }
        sendJson(res, 202, {
          command_id: nextCommandId(),
          status: "accepted",
        })
        return
      }

      if (req.method === "GET" && url === "/api/v1/rail/status") {
        sendJson(res, 200, statusJson())
        return
      }

      sendJson(res, 404, { error: "not found" })
    })()
  })

  server.on("close", clearAll)
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
