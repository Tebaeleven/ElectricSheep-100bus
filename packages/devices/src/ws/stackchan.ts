import { DEFAULT_TIMEOUT_MS, STACKCHAN_WS_PATH } from "../constants"
import type {
  AudioChunk,
  DeviceResult,
  HandState,
  HeadSet,
  ImagePayload,
  StackchanClient,
  StackchanInbound,
  StackchanOptions,
  StackchanOutboundType,
} from "../types"
import {
  audioChunkFromWire,
  createRequestId,
  imagePayloadFromWire,
  parseStackchanInbound,
  toAudioChunk,
} from "../wire"

/** SDK 内部で発火するイベントに使う request_id（機器由来ではない） */
const INTERNAL_REQUEST_ID = "internal"

/** 再接続の最大試行回数 */
const MAX_RECONNECT_ATTEMPTS = 5

/** 再接続バックオフの基準（ミリ秒）。200ms → 400 → 800 → 1600 → 3200 */
const RECONNECT_BASE_DELAY_MS = 200

/** 応答待ちの種別。camera.capture は ack では解決せず camera.frame を待つ */
type PendingKind = "ack" | "frame"

interface PendingRequest {
  kind: PendingKind
  settle(result: DeviceResult<unknown>): void
}

/**
 * Node のグローバル WebSocket（undici 実装）は第 2 引数に
 * `{ headers }` を含む WebSocketInit を受け取れるが型定義に無いため、
 * ここでだけ緩い型で扱う
 */
type WebSocketFactory = new (
  url: string,
  init?: { headers?: Record<string, string> }
) => WebSocket

/**
 * スタックちゃん（WebSocket）の実クライアント。
 *
 * - 送信は `{type, request_id, data}`。応答は request_id で pending と相関する
 * - 機器が request_id を返さない実装に備え、一致しない場合は同種の最古の待ちに割り当てる
 * - 応答が来なければ `{ ok:false, error:'timeout' }`
 * - `reconnect: true` なら切断時に指数バックオフで最大 5 回まで再接続する
 */
export function createStackchanClient(
  options: StackchanOptions
): StackchanClient {
  const endpoint = `${options.url.replace(/\/+$/, "")}${STACKCHAN_WS_PATH}`
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let socket: WebSocket | undefined
  let connecting: Promise<void> | undefined
  let closedByUser = false
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  const pending = new Map<string, PendingRequest>()
  const audioHandlers = new Set<(chunk: AudioChunk) => void>()
  const eventHandlers = new Set<(msg: StackchanInbound) => void>()

  /** 購読者へイベントを配る。購読者の例外で SDK を壊さない */
  const emitEvent = (msg: StackchanInbound): void => {
    for (const handler of eventHandlers) {
      try {
        handler(msg)
      } catch (error) {
        console.warn("[devices] onEvent ハンドラが例外を投げました:", error)
      }
    }
  }

  /** SDK 内部の異常（切断・接続失敗など）を error イベントとして通知する */
  const emitInternalError = (code: string, message: string): void => {
    emitEvent({
      type: "error",
      request_id: INTERNAL_REQUEST_ID,
      data: { code, message },
    })
  }

  /** request_id で pending を引く。無ければ同種の最古の待ちにフォールバックする */
  const takePending = (
    requestId: string,
    kind: PendingKind
  ): PendingRequest | undefined => {
    const exact = pending.get(requestId)
    if (exact && exact.kind === kind) {
      pending.delete(requestId)
      return exact
    }
    for (const [id, entry] of pending) {
      if (entry.kind !== kind) continue
      pending.delete(id)
      return entry
    }
    return undefined
  }

  /** 種別を問わず request_id で pending を引く。無ければ最古の待ちに割り当てる */
  const takeAnyPending = (requestId: string): PendingRequest | undefined => {
    const exact = pending.get(requestId)
    if (exact) {
      pending.delete(requestId)
      return exact
    }
    for (const [id, entry] of pending) {
      pending.delete(id)
      return entry
    }
    return undefined
  }

  /** 全ての待ちを同じ理由で終わらせる */
  const rejectAllPending = (error: string): void => {
    for (const [id, entry] of pending) {
      pending.delete(id)
      entry.settle({ ok: false, error, latencyMs: 0 })
    }
  }

  const handleMessage = (raw: string): void => {
    const msg = parseStackchanInbound(raw)
    if (!msg) {
      console.warn("[devices] 解釈できない受信メッセージ:", raw.slice(0, 200))
      return
    }
    emitEvent(msg)

    switch (msg.type) {
      case "audio.chunk": {
        const chunk = toAudioChunk(
          audioChunkFromWire(msg.data, msg.request_id)
        )
        for (const handler of audioHandlers) {
          try {
            handler(chunk)
          } catch (error) {
            console.warn(
              "[devices] onAudioChunk ハンドラが例外を投げました:",
              error
            )
          }
        }
        return
      }
      case "camera.frame": {
        const entry = takePending(msg.request_id, "frame")
        entry?.settle({
          ok: true,
          status: 200,
          data: imagePayloadFromWire(msg.data),
          latencyMs: 0,
        })
        return
      }
      case "ack": {
        // camera.capture の待ちは ack では解決しない（frame を待つ）
        const entry = takePending(msg.request_id, "ack")
        entry?.settle({
          ok: true,
          status: 200,
          data: msg.data ?? { requestId: msg.request_id },
          latencyMs: 0,
        })
        return
      }
      case "error": {
        const message = msg.data?.message ?? msg.data?.code ?? "device error"
        const entry = takeAnyPending(msg.request_id)
        entry?.settle({ ok: false, error: message, latencyMs: 0 })
        return
      }
    }
  }

  /** 切断後の再接続を予約する */
  const scheduleReconnect = (): void => {
    if (!options.reconnect || closedByUser) return
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      emitInternalError(
        "reconnect_failed",
        `再接続を ${MAX_RECONNECT_ATTEMPTS} 回試みましたが失敗しました`
      )
      return
    }
    const delay = RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect().catch(() => {
        // connect() 内で通知済み
      })
    }, delay)
    reconnectTimer.unref?.()
  }

  /** WebSocket を開いて open まで待つ */
  const openSocket = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let settled = false
      const Factory = WebSocket as unknown as WebSocketFactory
      const ws = options.headers
        ? new Factory(endpoint, { headers: options.headers })
        : new Factory(endpoint)
      socket = ws

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try {
          ws.close()
        } catch {
          // 失敗しても握りつぶす
        }
        reject(new Error("timeout"))
      }, defaultTimeoutMs)
      timer.unref?.()

      ws.addEventListener("open", () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reconnectAttempts = 0
        console.info(`[devices] stackchan connected: ${endpoint}`)
        resolve()
      })

      ws.addEventListener("message", (event: MessageEvent) => {
        const data: unknown = event.data
        handleMessage(
          typeof data === "string" ? data : String(data as ArrayBuffer)
        )
      })

      ws.addEventListener("error", () => {
        emitInternalError("socket_error", "WebSocket でエラーが発生しました")
      })

      ws.addEventListener("close", (event: CloseEvent) => {
        if (socket === ws) socket = undefined
        rejectAllPending("disconnected")
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(`接続できませんでした (code=${event.code})`))
          if (!closedByUser) {
            emitInternalError("disconnected", `切断されました (${event.code})`)
            scheduleReconnect()
          }
          return
        }
        if (closedByUser) return
        emitInternalError("disconnected", `切断されました (${event.code})`)
        scheduleReconnect()
      })
    })

  /** 接続する。多重呼び出しは同じ Promise を共有する */
  const connect = async (): Promise<void> => {
    if (socket && socket.readyState === WebSocket.OPEN) return
    if (connecting) return connecting
    closedByUser = false
    connecting = openSocket().finally(() => {
      connecting = undefined
    })
    return connecting
  }

  /** 送信して応答を待つ。例外を投げず DeviceResult を返す */
  const request = async <T>(
    type: StackchanOutboundType,
    data: Record<string, unknown> | undefined,
    kind: PendingKind,
    timeoutMs?: number
  ): Promise<DeviceResult<T>> => {
    const startedAt = Date.now()
    try {
      // 未接続なら自動で接続する
      await connect()
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      }
    }

    const ws = socket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return {
        ok: false,
        error: "disconnected",
        latencyMs: Date.now() - startedAt,
      }
    }

    const requestId = createRequestId()
    return new Promise<DeviceResult<T>>((resolve) => {
      let done = false
      const finish = (result: DeviceResult<unknown>): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        pending.delete(requestId)
        resolve({
          ...result,
          data: result.data as T | undefined,
          latencyMs: Date.now() - startedAt,
        })
      }

      const timer = setTimeout(
        () => finish({ ok: false, error: "timeout", latencyMs: 0 }),
        timeoutMs ?? defaultTimeoutMs
      )
      timer.unref?.()

      pending.set(requestId, { kind, settle: finish })

      try {
        ws.send(JSON.stringify({ type, request_id: requestId, data: data ?? {} }))
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: 0,
        })
      }
    })
  }

  return {
    get connected() {
      return socket?.readyState === WebSocket.OPEN
    },

    connect,

    async close(): Promise<void> {
      closedByUser = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      const ws = socket
      socket = undefined
      rejectAllPending("closed")
      if (!ws) return
      if (ws.readyState === WebSocket.CLOSED) return
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000)
        timer.unref?.()
        ws.addEventListener("close", () => {
          clearTimeout(timer)
          resolve()
        })
        try {
          ws.close(1000, "client close")
        } catch {
          clearTimeout(timer)
          resolve()
        }
      })
    },

    headSet(input: HeadSet, opts?: { timeoutMs?: number }): Promise<DeviceResult> {
      return request("head.set", input, "ack", opts?.timeoutMs)
    },

    /**
     * @deprecated 現行ハード（Obake_device）に手のサーボは無い。
     * 送信せずに unsupported を返す（首は headSet）
     */
    async handSet(_state: HandState): Promise<DeviceResult> {
      return {
        ok: false,
        error: "unsupported: hand servo not present",
        latencyMs: 0,
      }
    },

    cameraCapture(opts?: {
      timeoutMs?: number
    }): Promise<DeviceResult<ImagePayload>> {
      return request<ImagePayload>(
        "camera.capture",
        undefined,
        "frame",
        opts?.timeoutMs
      )
    },

    audioStart(): Promise<DeviceResult> {
      return request("audio.start", undefined, "ack")
    },

    audioStop(): Promise<DeviceResult> {
      return request("audio.stop", undefined, "ack")
    },

    onAudioChunk(handler: (chunk: AudioChunk) => void): () => void {
      audioHandlers.add(handler)
      return () => {
        audioHandlers.delete(handler)
      }
    },

    onEvent(handler: (msg: StackchanInbound) => void): () => void {
      eventHandlers.add(handler)
      return () => {
        eventHandlers.delete(handler)
      }
    },
  }
}
