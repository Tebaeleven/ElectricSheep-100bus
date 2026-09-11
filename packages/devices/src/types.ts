import type { z } from "zod"

import type {
  audioChunkPayloadSchema,
  desktopStatusSchema,
  handStateSchema,
  imagePayloadSchema,
  openUrlSchema,
  railAxisSchema,
  railDirectionSchema,
  railMoveSchema,
  railStatusSchema,
} from "./schemas"

export type RailAxis = z.infer<typeof railAxisSchema>
export type RailDirection = z.infer<typeof railDirectionSchema>
export type RailMove = z.infer<typeof railMoveSchema>
export type RailStatus = z.infer<typeof railStatusSchema> & {
  state: "moving" | "stopped" | "error"
}
export type DesktopStatus = z.infer<typeof desktopStatusSchema> & {
  state: string
}
export type HandState = z.infer<typeof handStateSchema>
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

/** ESP32（レール）クライアント */
export interface RailClient {
  move(input: RailMove, signal?: AbortSignal): Promise<DeviceResult>
  stop(signal?: AbortSignal): Promise<DeviceResult>
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
  /** ack を待つ */
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
