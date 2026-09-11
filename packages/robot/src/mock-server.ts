import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { pathToFileURL } from "node:url"

import { DEFAULT_ENDPOINT_MAP } from "./http.js"
import { robotCommandSchema } from "./schema.js"
import type { RobotCommand } from "./types.js"

/** 実機が無い間に叩けるモックサーバーの既定ポート */
export const DEFAULT_MOCK_PORT = 8787

const COLOR = {
  reset: "\u001b[0m",
  gray: "\u001b[90m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
} as const

/** パス → コマンド種別（body に type が無くてもパスから補うため） */
const PATH_TO_TYPE = new Map<string, RobotCommand["type"]>(
  Object.entries(DEFAULT_ENDPOINT_MAP)
    .filter(([key]) => key !== "status")
    .map(([key, endpoint]) => [endpoint.path, key as RobotCommand["type"]]),
)

const STATUS_PATH = DEFAULT_ENDPOINT_MAP.status.path

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function logLine(color: string, label: string, detail: string): void {
  const at = new Date().toISOString()
  console.info(`${COLOR.gray}${at}${COLOR.reset} ${color}${label}${COLOR.reset} ${detail}`)
}

/** ロボット HTTP API のモック。listen はしないので、テストからも使える */
export function createRobotMockServer(): Server {
  let commandCount = 0

  return createServer((req, res) => {
    void (async () => {
      const method = req.method ?? "GET"
      const path = new URL(req.url ?? "/", "http://localhost").pathname

      if (path === STATUS_PATH && method === "GET") {
        logLine(COLOR.cyan, "GET  /status", `commandCount=${commandCount}`)
        sendJson(res, 200, {
          ok: true,
          received: { type: "status" },
          commandCount,
          at: new Date().toISOString(),
        })
        return
      }

      const type = PATH_TO_TYPE.get(path)
      if (!type) {
        logLine(COLOR.red, `${method} ${path}`, "unknown endpoint")
        sendJson(res, 404, { ok: false, error: `unknown endpoint: ${method} ${path}` })
        return
      }

      if (method !== "POST") {
        logLine(COLOR.red, `${method} ${path}`, "method not allowed")
        sendJson(res, 405, { ok: false, error: `method not allowed: ${method} ${path}` })
        return
      }

      const raw = await readBody(req)
      let json: unknown = {}
      if (raw.length > 0) {
        try {
          json = JSON.parse(raw)
        } catch {
          logLine(COLOR.red, `POST ${path}`, `invalid json: ${raw}`)
          sendJson(res, 400, { ok: false, error: "invalid json body" })
          return
        }
      }

      const candidate = { ...(typeof json === "object" && json !== null ? json : {}), type }
      const parsed = robotCommandSchema.safeParse(candidate)
      if (!parsed.success) {
        logLine(COLOR.yellow, `POST ${path}`, `invalid command: ${parsed.error.message}`)
        sendJson(res, 400, { ok: false, error: "invalid command", issues: parsed.error.issues })
        return
      }

      commandCount += 1
      logLine(COLOR.green, `POST ${path}`, JSON.stringify(parsed.data))
      sendJson(res, 200, { ok: true, received: parsed.data, at: new Date().toISOString() })
    })().catch((error: unknown) => {
      logLine(COLOR.red, "ERROR", String(error))
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(error) })
    })
  })
}

/** モックサーバーを起動する。port=0 なら空きポートを OS に選ばせる */
export function startRobotMockServer(
  port: number = DEFAULT_MOCK_PORT,
): Promise<{ server: Server; port: number; close: () => Promise<void> }> {
  const server = createRobotMockServer()

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, () => {
      const address = server.address()
      const actualPort = typeof address === "object" && address !== null ? address.port : port
      resolve({
        server,
        port: actualPort,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()))
          }),
      })
    })
  })
}

/** `pnpm robot:mock` から直接起動されたときだけ listen する */
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const port = Number(process.env.ROBOT_MOCK_PORT ?? DEFAULT_MOCK_PORT)
  const { server, close } = await startRobotMockServer(port)
  logLine(COLOR.cyan, "listening", `http://127.0.0.1:${port}`)

  const shutdown = () => {
    logLine(COLOR.cyan, "shutdown", "SIGINT を受け取ったので終了します")
    server.closeAllConnections()
    void close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
