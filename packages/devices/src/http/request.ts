import { DEFAULT_TIMEOUT_MS, HTTP_API_PREFIX } from "../constants"
import type { DeviceResult, HttpDeviceOptions } from "../types"

/** 1 回の HTTP 呼び出しの指定 */
export interface SendOptions {
  method: "GET" | "POST"
  /** `/api/v1` より後ろのパス（例: `/rail/move`） */
  path: string
  /** JSON として送る本文。undefined なら本文なし */
  body?: unknown
  signal?: AbortSignal
  /**
   * ネットワークエラー時に 1 回だけ再試行するか。
   * 安全要件により rail/move は必ず false（二重移動を避ける）
   */
  retryOnNetworkError?: boolean
}

/** 内部用: 再試行の判断に使うネットワークエラー種別を持つ結果 */
interface AttemptResult {
  result: DeviceResult
  /** 応答を受け取れなかった（＝機器に届いたか不明）場合に true */
  networkError: boolean
}

/** baseUrl の末尾スラッシュを落として `/api/v1` + path を付ける */
function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${HTTP_API_PREFIX}${path}`
}

/** タイムアウトと呼び出し側 signal を合成する */
function buildSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([timeout, signal]) : timeout
}

/** 例外を DeviceResult 向けのエラー文字列に落とす */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // AbortSignal.timeout() の中断は TimeoutError として届く
    if (error.name === "TimeoutError") return "timeout"
    if (error.name === "AbortError") return "aborted"
    return error.message
  }
  return String(error)
}

/** content-type を見て JSON かテキストとして本文を読む。空本文は undefined */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("json")) return text
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/** 応答本文からエラーメッセージらしき文字列を拾う */
function extractError(body: unknown, response: Response): string {
  if (typeof body === "string" && body.length > 0) return body
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const key of ["error", "message", "detail"]) {
      const value = record[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }
  return `HTTP ${response.status} ${response.statusText}`.trim()
}

/** 1 回だけ送る */
async function sendOnce(
  options: HttpDeviceOptions,
  send: SendOptions,
  startedAt: number
): Promise<AttemptResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers: Record<string, string> = { ...options.headers }
  if (send.body !== undefined) headers["content-type"] = "application/json"

  try {
    const response = await fetch(buildUrl(options.baseUrl, send.path), {
      method: send.method,
      headers,
      body: send.body === undefined ? undefined : JSON.stringify(send.body),
      signal: buildSignal(timeoutMs, send.signal),
    })
    const body = await readBody(response)
    const latencyMs = Date.now() - startedAt
    return {
      networkError: false,
      result: response.ok
        ? { ok: true, status: response.status, data: body, latencyMs }
        : {
            ok: false,
            status: response.status,
            data: body,
            error: extractError(body, response),
            latencyMs,
          },
    }
  } catch (error) {
    return {
      networkError: true,
      result: {
        ok: false,
        error: toErrorMessage(error),
        latencyMs: Date.now() - startedAt,
      },
    }
  }
}

/**
 * HTTP 機器へリクエストを送る。例外は投げず必ず DeviceResult を返す。
 * `retryOnNetworkError` が true のときだけ、応答を受け取れなかった場合に 1 回再試行する
 */
export async function sendHttpRequest(
  options: HttpDeviceOptions,
  send: SendOptions
): Promise<DeviceResult> {
  const startedAt = Date.now()
  const first = await sendOnce(options, send, startedAt)
  if (!first.networkError || !send.retryOnNetworkError) return first.result
  // タイムアウト・呼び出し側の中断は再試行しても同じ結果になるため除外する
  if (first.result.error === "timeout" || first.result.error === "aborted") {
    return first.result
  }
  if (send.signal?.aborted) return first.result
  const second = await sendOnce(options, send, startedAt)
  return second.result
}
