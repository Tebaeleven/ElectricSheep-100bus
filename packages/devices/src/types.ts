import type { z } from "zod"

import type {
  audioChunkPayloadSchema,
  desktopStatusSchema,
  handStateSchema,
  headSetSchema,
  imagePayloadSchema,
  openUrlSchema,
  railAxisSchema,
  railAxisStatusSchema,
  railDirectionSchema,
  railMoveSchema,
  railStatusSchema,
} from "./schemas"

export type RailAxis = z.infer<typeof railAxisSchema>
export type RailDirection = z.infer<typeof railDirectionSchema>
export type RailMove = z.infer<typeof railMoveSchema>
export type RailAxisStatus = z.infer<typeof railAxisStatusSchema>
/**
 * レール状態。`state` はファームが返さない場合 `axes[].active` から導出される。
 * `ip` / `apIp` / `apSsid` / `simulated` / `axes` は実機ファーム（rail_dc）が返す任意フィールド
 */
export type RailStatus = z.infer<typeof railStatusSchema> & {
  state: "moving" | "stopped" | "error"
  ip?: string
  apIp?: string
  apSsid?: string
  simulated?: boolean
  axes?: RailAxisStatus[]
  /** 機器が返す未知のフィールドも落とさず保持する */
  [key: string]: unknown
}
export type DesktopStatus = z.infer<typeof desktopStatusSchema> & {
  state: string
}
/** @deprecated 現行ハードに手のサーボは無い。`HeadSet` を使う */
export type HandState = z.infer<typeof handStateSchema>
/** 首の角度（B 方式。yaw ±128 / pitch 0..90 / speed 100..1000） */
export type HeadSet = z.infer<typeof headSetSchema>
export type OpenUrl = z.infer<typeof openUrlSchema>
export type ImagePayload = z.infer<typeof imagePayloadSchema>
export type AudioChunkPayload = z.infer<typeof audioChunkPayloadSchema>

/** 機器への 1 リクエストの結果。失敗も例外にせずこの形で返す */
export interface DeviceResult<T = unknown> {
  ok: boolean
  status?: number
  data?: T
  error?: string
  latencyMs: number
}

/** 受信した音声チャンク（受信時刻付き） */
export interface AudioChunk extends AudioChunkPayload {
  receivedAt: number
}

/** move / stop の受理応答（ファームは 202 + command_id を返す） */
export interface RailCommandAccepted {
  /** ファームが採番した命令 ID（ワイヤ形式 `command_id` の camelCase 版） */
  commandId?: string
  /** ファームが返す受理状態（通常 `"accepted"`） */
  status?: string
  [key: string]: unknown
}

/** ESP32（レール）クライアント */
export interface RailClient {
  move(
    input: RailMove,
    signal?: AbortSignal
  ): Promise<DeviceResult<RailCommandAccepted>>
  /**
   * 停止。`axis` 省略時は全軸停止（ファームへは `{"axis":null}` を送る）。
   * 既存の呼び出し（`stop()` / `stop(signal)`）と互換にするため axis は第 2 引数
   */
  stop(
    signal?: AbortSignal,
    axis?: RailAxis
  ): Promise<DeviceResult<RailCommandAccepted>>
  status(signal?: AbortSignal): Promise<DeviceResult<RailStatus>>
}

/** Electron（デスクトップ）クライアント */
export interface DesktopClient {
  screenshot(signal?: AbortSignal): Promise<DeviceResult<ImagePayload>>
  openBrowser(input: OpenUrl, signal?: AbortSignal): Promise<DeviceResult>
  status(signal?: AbortSignal): Promise<DeviceResult<DesktopStatus>>
}

/** スタックちゃん（WebSocket）クライアント */
export interface StackchanClient {
  connect(): Promise<void>
  close(): Promise<void>
  readonly connected: boolean
  /**
   * 首を向ける（B 方式の本命）。
   * ブリッジ経由なら `POST /obake/head`、旧契約 WS なら `head.set` を送る
   */
  headSet(
    input: HeadSet,
    opts?: { timeoutMs?: number }
  ): Promise<DeviceResult>
  /**
   * @deprecated 現行ハード（Obake_device）に手のサーボは無い。
   * 実機向けクライアントは `{ ok:false, error:"unsupported: hand servo not present" }` を返す
   */
  handSet(
    state: HandState,
    opts?: { timeoutMs?: number }
  ): Promise<DeviceResult>
  /** camera.frame を待つ */
  cameraCapture(opts?: {
    timeoutMs?: number
  }): Promise<DeviceResult<ImagePayload>>
  audioStart(): Promise<DeviceResult>
  audioStop(): Promise<DeviceResult>
  /** 購読解除関数を返す */
  onAudioChunk(handler: (chunk: AudioChunk) => void): () => void
  onEvent(handler: (msg: StackchanInbound) => void): () => void
}

/** HTTP 機器の接続設定。baseUrl は http://host:port（/api/v1 は SDK が付与） */
export interface HttpDeviceOptions {
  baseUrl: string
  timeoutMs?: number
  headers?: Record<string, string>
}

/** ブリッジ（B 方式）の接続設定。baseUrl は http://host:port（/obake/* は SDK が付与） */
export interface StackchanBridgeOptions {
  baseUrl: string
  timeoutMs?: number
  headers?: Record<string, string>
  /** onAudioChunk のポーリング間隔（ミリ秒・既定 500） */
  audioPollMs?: number
}

/** ブリッジの `GET /obake/status` が返す状態（camelCase に変換済み） */
export interface StackchanBridgeStatus {
  connected: boolean
  pcmRate: number
  lastFrameAt: number | null
  lastPcmAt: number | null
  frames: number
  bytes: number
  [key: string]: unknown
}

/** スタックちゃんの接続設定。url は ws://host:port（/ws/v1/robot は SDK が付与） */
export interface StackchanOptions {
  url: string
  timeoutMs?: number
  headers?: Record<string, string>
  reconnect?: boolean
}

/** createDevices が返す 3 機器のクライアント一式 */
export interface Devices {
  rail: RailClient
  desktop: DesktopClient
  stackchan: StackchanClient
}

/** 動作モード。mock（既定）は実機に接続しない */
export type DeviceMode = "mock" | "real"

// --- WebSocket 共通形式（ワイヤ形式・snake_case） -------------------------

/** Next → 機器のメッセージ種別 */
export type StackchanOutboundType =
  | "head.set"
  /** @deprecated 手のサーボが無いため送らない */
  | "hand.set"
  | "audio.start"
  | "audio.stop"
  | "camera.capture"

/** 機器 → Next のメッセージ種別 */
export type StackchanInboundType =
  | "ack"
  | "error"
  | "audio.chunk"
  | "camera.frame"

/** WebSocket 共通エンベロープ（ワイヤ形式） */
export interface StackchanEnvelope<
  TType extends string = string,
  TData = Record<string, unknown>,
> {
  type: TType
  request_id: string
  data?: TData
}

export type StackchanOutbound =
  | StackchanEnvelope<"head.set", HeadSet>
  | StackchanEnvelope<"hand.set", { state: HandState }>
  | StackchanEnvelope<"audio.start", Record<string, never>>
  | StackchanEnvelope<"audio.stop", Record<string, never>>
  | StackchanEnvelope<"camera.capture", Record<string, never>>

/** 機器 → Next の判別可能 union（type で判別する） */
export type StackchanInbound =
  | StackchanEnvelope<"ack", { [k: string]: unknown } | undefined>
  | StackchanEnvelope<"error", { code?: string; message?: string }>
  | StackchanEnvelope<
      "audio.chunk",
      { mime_type?: string; audio_base64: string; seq?: number }
    >
  | StackchanEnvelope<
      "camera.frame",
      { mime_type: string; image_base64: string }
    >
