import {
  DEFAULT_TIMEOUT_MS,
  STACKCHAN_BRIDGE_AUDIO_POLL_MS,
  STACKCHAN_BRIDGE_PATHS,
} from "../constants"
import { headSetSchema } from "../schemas"
import type {
  AudioChunk,
  DeviceResult,
  HeadSet,
  ImagePayload,
  StackchanBridgeOptions,
  StackchanBridgeStatus,
  StackchanClient,
  StackchanInbound,
} from "../types"
import { createRequestId, toAudioChunk } from "../wire"

/** SDK 内部で発火するイベントに使う request_id（機器由来ではない） */
const INTERNAL_REQUEST_ID = "internal"

/** audio/recent で 1 回に取りに行く長さ（ポーリング間隔より少し長めに重ねる） */
const AUDIO_FETCH_MARGIN_MS = 200

/** ブリッジ経由のスタックちゃんクライアント（B 方式） */
export interface StackchanBridgeClient extends StackchanClient {
  /** ブリッジの `GET /obake/status` */
  getStatus(signal?: AbortSignal): Promise<DeviceResult<StackchanBridgeStatus>>
}

/** ブリッジ応答（snake_case）の型。未知のフィールドも保持する */
interface BridgeStatusWire {
  connected?: boolean
  pcm_rate?: number
  last_frame_at?: number | null
  last_pcm_at?: number | null
  frames?: number
  bytes?: number
  [key: string]: unknown
}

/** ブリッジへ 1 回 HTTP する。例外は投げず DeviceResult にする */
async function requestBridge(
  options: StackchanBridgeOptions,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal }
): Promise<DeviceResult> {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers: Record<string, string> = { ...options.headers }
  if (init.body !== undefined) headers["content-type"] = "application/json"
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init.signal
    ? AbortSignal.any([timeout, init.signal])
    : timeout

  try {
    const response = await fetch(
      `${options.baseUrl.replace(/\/+$/, "")}${path}`,
      {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
      }
    )
    const text = await response.text()
    let data: unknown = text.length === 0 ? undefined : text
    if (text.length > 0 && (response.headers.get("content-type") ?? "").includes("json")) {
      try {
        data = JSON.parse(text) as unknown
      } catch {
        data = text
      }
    }
    const latencyMs = Date.now() - startedAt
    if (response.ok) return { ok: true, status: response.status, data, latencyMs }
    const record =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {}
    const error =
      typeof record.error === "string"
        ? record.error
        : `HTTP ${response.status} ${response.statusText}`.trim()
    return { ok: false, status: response.status, data, error, latencyMs }
  } catch (error) {
    const name = error instanceof Error ? error.name : ""
    return {
      ok: false,
      error:
        name === "TimeoutError"
          ? "timeout"
          : name === "AbortError"
            ? "aborted"
            : error instanceof Error
              ? error.message
              : String(error),
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * スタックちゃん B 方式のクライアント。
 *
 * 機器は PC 側ブリッジ（`packages/stackchan-bridge`、既定 8030）へ WS で繋いで
 * JPEG / PCM を push し続ける。SDK はそのブリッジの HTTP API 越しに
 * 最新フレーム・直近音声を取り、`POST /obake/head` で首を動かす。
 *
 * - `cameraCapture` は「撮る」のではなく「最新フレームを取る」（`GET /obake/latest.json`）
 * - `audioStart` / `audioStop` はブリッジ側では常時受信なので SDK 内のフラグ管理
 * - `onAudioChunk` は `GET /obake/audio/recent` を既定 500ms でポーリングして差分を配る
 */
export function createStackchanBridgeClient(
  options: StackchanBridgeOptions
): StackchanBridgeClient {
  const pollMs = options.audioPollMs ?? STACKCHAN_BRIDGE_AUDIO_POLL_MS
  const audioHandlers = new Set<(chunk: AudioChunk) => void>()
  const eventHandlers = new Set<(msg: StackchanInbound) => void>()

  let connected = false
  let recording = false
  let timer: ReturnType<typeof setInterval> | undefined
  let seq = 0
  /** 同じ PCM を二度配らないための最終取得時刻 */
  let lastPcmAt: number | null = null

  const emitEvent = (msg: StackchanInbound): void => {
    for (const handler of eventHandlers) handler(msg)
  }

  const toStatus = (raw: unknown): StackchanBridgeStatus => {
    const wire = (raw ?? {}) as BridgeStatusWire
    return {
      ...wire,
      connected: wire.connected === true,
      pcmRate: Number(wire.pcm_rate ?? 0),
      lastFrameAt: wire.last_frame_at ?? null,
      lastPcmAt: wire.last_pcm_at ?? null,
      frames: Number(wire.frames ?? 0),
      bytes: Number(wire.bytes ?? 0),
    }
  }

  const getStatus = async (
    signal?: AbortSignal
  ): Promise<DeviceResult<StackchanBridgeStatus>> => {
    const result = await requestBridge(options, STACKCHAN_BRIDGE_PATHS.status, {
      method: "GET",
      signal,
    })
    if (!result.ok) {
      connected = false
      return result as DeviceResult<StackchanBridgeStatus>
    }
    const status = toStatus(result.data)
    connected = status.connected
    return { ...result, data: status }
  }

  /** 直近の PCM を 1 回取りに行き、新しければ購読者へ配る */
  const pollAudio = async (): Promise<void> => {
    const result = await requestBridge(
      options,
      `${STACKCHAN_BRIDGE_PATHS.audioRecent}?ms=${pollMs + AUDIO_FETCH_MARGIN_MS}`,
      { method: "GET" }
    )
    if (!result.ok) return
    const wire = (result.data ?? {}) as {
      pcm_rate?: number
      mime_type?: string
      audio_base64?: string
      last_pcm_at?: number | null
    }
    const audioBase64 = wire.audio_base64
    if (!audioBase64) return
    // 前回から新しい PCM が来ていなければ配らない
    if (wire.last_pcm_at != null && wire.last_pcm_at === lastPcmAt) return
    lastPcmAt = wire.last_pcm_at ?? null
    seq += 1
    const chunk = toAudioChunk({
      requestId: INTERNAL_REQUEST_ID,
      mimeType: wire.mime_type ?? "audio/pcm",
      audioBase64,
      seq,
    })
    for (const handler of audioHandlers) handler(chunk)
    emitEvent({
      type: "audio.chunk",
      request_id: INTERNAL_REQUEST_ID,
      data: {
        mime_type: chunk.mimeType,
        audio_base64: chunk.audioBase64,
        seq: chunk.seq,
      },
    })
  }

  const stopPolling = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  return {
    get connected() {
      return connected
    },

    async connect(): Promise<void> {
      // ブリッジは常駐サーバーなので、状態を 1 回引いて接続性を確かめるだけ
      await getStatus()
    },

    async close(): Promise<void> {
      stopPolling()
      recording = false
      connected = false
    },

    getStatus,

    async headSet(
      input: HeadSet,
      opts?: { timeoutMs?: number }
    ): Promise<DeviceResult> {
      const startedAt = Date.now()
      const parsed = headSetSchema.safeParse(input)
      if (!parsed.success) {
        return {
          ok: false,
          error: parsed.error.message,
          latencyMs: Date.now() - startedAt,
        }
      }
      const result = await requestBridge(
        opts?.timeoutMs ? { ...options, timeoutMs: opts.timeoutMs } : options,
        STACKCHAN_BRIDGE_PATHS.head,
        { method: "POST", body: parsed.data }
      )
      if (result.ok) {
        emitEvent({
          type: "ack",
          request_id: createRequestId(),
          data: { ...parsed.data },
        })
      }
      return result
    },

    /**
     * @deprecated 現行ハード（Obake_device）に手のサーボは無い
     */
    async handSet(): Promise<DeviceResult> {
      return {
        ok: false,
        error: "unsupported: hand servo not present",
        latencyMs: 0,
      }
    },

    async cameraCapture(opts?: {
      timeoutMs?: number
    }): Promise<DeviceResult<ImagePayload>> {
      const result = await requestBridge(
        opts?.timeoutMs ? { ...options, timeoutMs: opts.timeoutMs } : options,
        STACKCHAN_BRIDGE_PATHS.latestJson,
        { method: "GET" }
      )
      if (!result.ok) return result as DeviceResult<ImagePayload>
      const wire = (result.data ?? {}) as {
        mime_type?: string
        image_base64?: string
      }
      if (!wire.image_base64) {
        return {
          ok: false,
          status: result.status,
          error: "ブリッジがフレームを持っていません（機器未接続の可能性）",
          latencyMs: result.latencyMs,
        }
      }
      const payload: ImagePayload = {
        mimeType: wire.mime_type ?? "image/jpeg",
        imageBase64: wire.image_base64,
      }
      emitEvent({
        type: "camera.frame",
        request_id: INTERNAL_REQUEST_ID,
        data: { mime_type: payload.mimeType, image_base64: payload.imageBase64 },
      })
      return { ...result, data: payload }
    },

    async audioStart(): Promise<DeviceResult> {
      const startedAt = Date.now()
      if (!recording) {
        recording = true
        lastPcmAt = null
        timer = setInterval(() => void pollAudio(), pollMs)
        timer.unref?.()
      }
      return {
        ok: true,
        status: 200,
        data: { recording: true, pollMs },
        latencyMs: Date.now() - startedAt,
      }
    },

    async audioStop(): Promise<DeviceResult> {
      const startedAt = Date.now()
      stopPolling()
      recording = false
      return {
        ok: true,
        status: 200,
        data: { recording: false },
        latencyMs: Date.now() - startedAt,
      }
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
