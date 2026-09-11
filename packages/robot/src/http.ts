import type {
  HttpRobotClientOptions,
  RobotClient,
  RobotCommand,
  RobotEndpointMap,
  RobotResult,
} from "./types"

/** 応答が返らないときに諦めるまでの既定時間 */
const DEFAULT_TIMEOUT_MS = 3000

/** ネットワークエラー時の試行回数（初回 + リトライ 1 回） */
const MAX_ATTEMPTS = 2

/** ロボット HTTP API の既定エンドポイント。実機仕様受領後は endpointMap で差し替える */
export const DEFAULT_ENDPOINT_MAP = {
  move: { path: "/move", method: "POST" },
  stop: { path: "/stop", method: "POST" },
  speak: { path: "/speak", method: "POST" },
  emote: { path: "/emote", method: "POST" },
  status: { path: "/status", method: "GET" },
} as const satisfies RobotEndpointMap

interface Endpoint {
  path: string
  method: "GET" | "POST"
}

/** コマンドから送信先と送信ペイロード（type はパスが表すので除く）を決める */
function resolveRequest(
  cmd: RobotCommand,
  endpointMap: RobotEndpointMap,
): { endpoint: Endpoint; payload: unknown } {
  const override = endpointMap[cmd.type]

  if (cmd.type === "raw") {
    return {
      endpoint: override ?? { path: cmd.path, method: cmd.method },
      payload: cmd.body,
    }
  }

  // type はパスが表すので本文からは落とす
  const payload: Record<string, unknown> = { ...cmd }
  delete payload.type

  return {
    endpoint: override ?? DEFAULT_ENDPOINT_MAP[cmd.type],
    payload,
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/** 本文は JSON として読めれば JSON、駄目ならテキストのまま返す */
function parseBody(text: string): unknown {
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * 実機ロボット向けの HTTP クライアント。
 * 例外は投げず、失敗も必ず RobotResult として返す。
 */
export function createHttpRobotClient(options: HttpRobotClientOptions): RobotClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const endpointMap: RobotEndpointMap = { ...DEFAULT_ENDPOINT_MAP, ...options.endpointMap }

  async function request(
    endpoint: Endpoint,
    payload: unknown,
    callerSignal?: AbortSignal,
  ): Promise<RobotResult> {
    const startedAt = Date.now()
    const url = `${baseUrl}${endpoint.path}`
    const hasBody = endpoint.method !== "GET" && payload !== undefined
    const body = hasBody ? JSON.stringify(payload) : undefined

    console.info(`[robot] ${endpoint.method} ${url}${body === undefined ? "" : ` ${body}`}`)

    let lastError = "unknown error"

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      // 呼び出し側が既に中断していれば、リトライせず即返す
      if (callerSignal?.aborted) {
        return {
          ok: false,
          error: describeError(callerSignal.reason ?? new Error("aborted by caller")),
          latencyMs: Date.now() - startedAt,
        }
      }

      const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)]
      if (callerSignal) signals.push(callerSignal)

      try {
        const response = await fetch(url, {
          method: endpoint.method,
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.any(signals),
        })
        const text = await response.text()
        return {
          ok: response.ok,
          status: response.status,
          body: parseBody(text),
          latencyMs: Date.now() - startedAt,
        }
      } catch (error) {
        lastError = describeError(error)
        console.info(`[robot] ${endpoint.method} ${url} failed (${attempt}/${MAX_ATTEMPTS}): ${lastError}`)
        // 呼び出し側の中断はリトライしても無駄なので打ち切る
        if (callerSignal?.aborted) break
      }
    }

    return { ok: false, error: lastError, latencyMs: Date.now() - startedAt }
  }

  return {
    async sendCommand(cmd: RobotCommand, signal?: AbortSignal): Promise<RobotResult> {
      const { endpoint, payload } = resolveRequest(cmd, endpointMap)
      return request(endpoint, payload, signal)
    },
    async getStatus(): Promise<RobotResult> {
      const endpoint = endpointMap.status ?? DEFAULT_ENDPOINT_MAP.status
      return request(endpoint, undefined)
    },
  }
}
