import { createServer, type Server } from "node:http"
import type { Duplex } from "node:stream"

import { WebSocketServer, type WebSocket } from "ws"

import { createRequestHandler } from "./http"
import {
  BRIDGE_HOST_DEFAULT,
  BRIDGE_PORT_DEFAULT,
  buildSetHeadCommand,
  decodeFrame,
  FRAME_TYPE_JPEG,
  FRAME_TYPE_PCM,
  MAX_MESSAGE_BYTES,
  MEDIA_WS_PATH,
  parseHello,
  PCM_BUFFER_MS_DEFAULT,
  PCM_RATE_DEFAULT,
  pcmBytesToMs,
  STALE_WS_MS,
  type SetHeadCommand,
} from "./protocol"

/** bridge の起動設定 */
export interface BridgeOptions {
  /** 待ち受けポート（既定 8030。0 を渡すと OS が空きポートを選ぶ） */
  port?: number
  /** 待ち受けアドレス（既定 0.0.0.0。機器が LAN から接続するため） */
  host?: string
  /** PCM リングバッファの保持時間（ミリ秒・既定 10000） */
  pcmBufferMs?: number
  /** 1 行ログの出力先（テストでは差し替える） */
  log?: (message: string) => void
}

/** 外から読める bridge の状態（HTTP `/obake/status` の元データ） */
export interface BridgeState {
  connected: boolean
  /** hello で通知されたサンプリングレート（未受信なら既定 24000） */
  pcmRate: number
  /** 最後に JPEG を受けた時刻（epoch ミリ秒。未受信は null） */
  lastFrameAt: number | null
  /** 最後に PCM を受けた時刻（epoch ミリ秒。未受信は null） */
  lastPcmAt: number | null
  /** 受信した JPEG フレーム数 */
  frames: number
  /** 受信した PCM チャンク数 */
  pcmChunks: number
  /** 受信バイト数（JPEG + PCM） */
  bytes: number
  jpegBytes: number
  pcmBytes: number
  /** 実際に待ち受けているポート（start 前は設定値） */
  port: number
}

/** SSE `/obake/events` で配るイベント */
export type BridgeEvent =
  | { type: "connected"; at: number }
  | { type: "disconnected"; at: number }
  | { type: "frame"; at: number; bytes: number }
  | { type: "pcm"; at: number; bytes: number; pcmRate: number }

/** PCM リングバッファの 1 チャンク */
interface PcmChunk {
  at: number
  data: Buffer
}

/** HTTP 層（http.ts）から見た bridge の口 */
export interface BridgeCore {
  readonly state: BridgeState
  /** 最新 JPEG（未受信なら null） */
  latestJpeg(): Buffer | null
  /** 直近 ms ミリ秒ぶんの PCM を連結して返す */
  recentPcm(ms: number): Buffer
  /** 機器へ `set_head` を送る。未接続なら null */
  sendHead(input: {
    yaw?: number
    pitch?: number
    speed?: number
  }): SetHeadCommand | null
  /** イベント購読。購読解除関数を返す */
  subscribe(handler: (event: BridgeEvent) => void): () => void
}

/** createBridge の戻り値 */
export interface Bridge extends BridgeCore {
  /** 待ち受け開始。実際のポートを返す */
  start(): Promise<{ port: number }>
  /** 待ち受け停止（機器の WS も閉じる） */
  stop(): Promise<void>
}

/**
 * スタックちゃん（機器）からの Media WS を受け、HTTP で中身を配る PC 側ブリッジ。
 *
 * プロトコルはメンバー実装 `firmware/stackchan/homelab/obake_media/server.py` と同一。
 * 機器が WS クライアントとして `ws://<PC>:8030/obake/media` に接続してくる。
 */
export function createBridge(options: BridgeOptions = {}): Bridge {
  const host = options.host ?? BRIDGE_HOST_DEFAULT
  const pcmBufferMs = options.pcmBufferMs ?? PCM_BUFFER_MS_DEFAULT
  const log = options.log ?? ((message: string) => console.info(message))

  const state: BridgeState = {
    connected: false,
    pcmRate: PCM_RATE_DEFAULT,
    lastFrameAt: null,
    lastPcmAt: null,
    frames: 0,
    pcmChunks: 0,
    bytes: 0,
    jpegBytes: 0,
    pcmBytes: 0,
    port: options.port ?? BRIDGE_PORT_DEFAULT,
  }

  let latestJpeg: Buffer | null = null
  let pcmBuffer: PcmChunk[] = []
  let activeSocket: WebSocket | null = null
  let lastAnyAt = 0
  let staleTimer: ReturnType<typeof setInterval> | undefined
  const subscribers = new Set<(event: BridgeEvent) => void>()

  const httpServer: Server = createServer()
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

  const emit = (event: BridgeEvent): void => {
    for (const handler of subscribers) handler(event)
  }

  /** 保持時間を超えた PCM を捨てる */
  const trimPcm = (now: number): void => {
    const deadline = now - pcmBufferMs
    if (pcmBuffer.length > 0 && pcmBuffer[0]!.at >= deadline) return
    pcmBuffer = pcmBuffer.filter((chunk) => chunk.at >= deadline)
  }

  const core: BridgeCore = {
    state,
    latestJpeg: () => latestJpeg,
    recentPcm(ms: number): Buffer {
      const now = Date.now()
      trimPcm(now)
      const deadline = now - Math.max(ms, 0)
      const chunks = pcmBuffer
        .filter((chunk) => chunk.at >= deadline)
        .map((chunk) => chunk.data)
      return chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)
    },
    sendHead(input): SetHeadCommand | null {
      const socket = activeSocket
      if (!socket || socket.readyState !== socket.OPEN) return null
      const command = buildSetHeadCommand(input)
      socket.send(JSON.stringify(command))
      log(
        `[bridge] set_head yaw=${command.yaw} pitch=${command.pitch} speed=${command.speed}`
      )
      return command
    },
    subscribe(handler: (event: BridgeEvent) => void): () => void {
      subscribers.add(handler)
      return () => {
        subscribers.delete(handler)
      }
    },
  }

  /** 機器 1 台ぶんの WS を受け持つ */
  const handleConnection = (socket: WebSocket): void => {
    // server.py と同じく新しい接続を優先し、古いゾンビは切る
    const previous = activeSocket
    if (previous && previous.readyState === previous.OPEN) {
      log("[bridge] replacing previous client")
      previous.close(1001, "replaced")
    }
    activeSocket = socket
    state.connected = true
    lastAnyAt = Date.now()
    log("[bridge] device connected")
    emit({ type: "connected", at: lastAnyAt })

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      const now = Date.now()
      if (!isBinary) {
        const text = data.toString("utf8")
        const hello = parseHello(text)
        if (hello) {
          state.pcmRate = hello.pcmRate
          lastAnyAt = now
          log(`[bridge] hello pcm_rate=${hello.pcmRate}`)
        } else {
          log(`[bridge] text: ${text.slice(0, 200)}`)
        }
        return
      }

      const frame = decodeFrame(data)
      if (!frame) return
      if (frame.type === FRAME_TYPE_JPEG) {
        latestJpeg = frame.payload
        state.frames += 1
        state.jpegBytes += frame.payload.length
        state.bytes += frame.payload.length
        state.lastFrameAt = now
        lastAnyAt = now
        emit({ type: "frame", at: now, bytes: frame.payload.length })
        return
      }
      if (frame.type === FRAME_TYPE_PCM) {
        pcmBuffer.push({ at: now, data: frame.payload })
        trimPcm(now)
        state.pcmChunks += 1
        state.pcmBytes += frame.payload.length
        state.bytes += frame.payload.length
        state.lastPcmAt = now
        lastAnyAt = now
        emit({
          type: "pcm",
          at: now,
          bytes: frame.payload.length,
          pcmRate: state.pcmRate,
        })
        return
      }
      log(
        `[bridge] unknown frame type=0x${frame.type.toString(16)} len=${frame.payload.length}`
      )
    })

    const onGone = (): void => {
      if (activeSocket !== socket) return
      activeSocket = null
      state.connected = false
      log("[bridge] device disconnected")
      emit({ type: "disconnected", at: Date.now() })
    }
    socket.on("close", onGone)
    socket.on("error", (error: Error) => {
      log(`[bridge] ws error: ${error.message}`)
      onGone()
    })
  }

  wss.on("connection", handleConnection)

  httpServer.on("request", createRequestHandler(core))
  httpServer.on("upgrade", (request, socket: Duplex, head: Buffer) => {
    const path = (request.url ?? "").split("?")[0]
    if (path !== MEDIA_WS_PATH) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request)
    })
  })

  /** 上りが止まった半開き接続を閉じる（server.py の stale_watchdog 相当） */
  const startStaleWatchdog = (): void => {
    staleTimer = setInterval(() => {
      const socket = activeSocket
      if (!socket || socket.readyState !== socket.OPEN || !lastAnyAt) return
      const age = Date.now() - lastAnyAt
      if (age < STALE_WS_MS) return
      log(`[bridge] stale ${(age / 1000).toFixed(1)}s without media — closing`)
      socket.close(1001, "stale media")
    }, 2000)
    staleTimer.unref?.()
  }

  return {
    ...core,
    async start(): Promise<{ port: number }> {
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject)
        httpServer.listen(state.port, host, () => {
          httpServer.off("error", reject)
          resolve()
        })
      })
      const address = httpServer.address()
      if (typeof address === "object" && address) state.port = address.port
      startStaleWatchdog()
      return { port: state.port }
    },
    async stop(): Promise<void> {
      if (staleTimer) {
        clearInterval(staleTimer)
        staleTimer = undefined
      }
      activeSocket?.close(1001, "bridge stopping")
      activeSocket = null
      state.connected = false
      subscribers.clear()
      await new Promise<void>((resolve) => {
        wss.close(() => resolve())
      })
      await new Promise<void>((resolve) => {
        httpServer.closeAllConnections()
        httpServer.close(() => resolve())
      })
    },
  }
}

/** env から bridge の設定を読む */
export function bridgeOptionsFromEnv(env: NodeJS.ProcessEnv): BridgeOptions {
  const port = Number(env.STACKCHAN_BRIDGE_PORT ?? "")
  const pcmBufferMs = Number(env.STACKCHAN_BRIDGE_PCM_BUFFER_MS ?? "")
  return {
    port: Number.isFinite(port) && port >= 0 ? port : BRIDGE_PORT_DEFAULT,
    host: env.STACKCHAN_BRIDGE_HOST?.trim() || BRIDGE_HOST_DEFAULT,
    pcmBufferMs:
      Number.isFinite(pcmBufferMs) && pcmBufferMs > 0
        ? pcmBufferMs
        : PCM_BUFFER_MS_DEFAULT,
  }
}

/** 状態を server.py 互換の JSON（snake_case）にする */
export function toStatusJson(core: BridgeCore): Record<string, unknown> {
  const now = Date.now()
  const state = core.state
  const jpegAge =
    state.lastFrameAt === null ? null : (now - state.lastFrameAt) / 1000
  const pcmAge =
    state.lastPcmAt === null ? null : (now - state.lastPcmAt) / 1000
  const latest = core.latestJpeg()
  return {
    connected: state.connected,
    pcm_rate: state.pcmRate,
    last_frame_at: state.lastFrameAt,
    last_pcm_at: state.lastPcmAt,
    frames: state.frames,
    bytes: state.bytes,
    // ここから下は server.py 互換のフィールド
    jpeg_count: state.frames,
    pcm_count: state.pcmChunks,
    jpeg_bytes: state.jpegBytes,
    pcm_bytes: state.pcmBytes,
    last_jpeg_age_sec: jpegAge,
    last_pcm_age_sec: pcmAge,
    approx_jpeg_fps:
      jpegAge !== null && jpegAge < 1.5
        ? Math.round((1 / Math.max(jpegAge, 0.05)) * 100) / 100
        : 0,
    latest_jpeg_size: latest?.length ?? 0,
    buffered_pcm_ms: Math.round(
      pcmBytesToMs(core.recentPcm(Number.MAX_SAFE_INTEGER).length, state.pcmRate)
    ),
    primary_frame_url: "/obake/latest.jpg",
  }
}
