import { z } from "zod"

import { handStateSchema, railAxisSchema, railDirectionSchema } from "./schemas"
import type {
  AudioChunk,
  AudioChunkPayload,
  ImagePayload,
  RailMove,
} from "./types"

// --- HTTP ワイヤ形式（snake_case）と公開 API（camelCase）の相互変換 -------

/** レール移動命令のワイヤ形式 */
export const railMoveWireSchema = z.object({
  axis: railAxisSchema,
  direction: railDirectionSchema,
  duration_ms: z.number().int().min(1),
})
export type RailMoveWire = z.infer<typeof railMoveWireSchema>

/** 画像ペイロードのワイヤ形式 */
export const imagePayloadWireSchema = z.object({
  mime_type: z.string(),
  image_base64: z.string(),
})
export type ImagePayloadWire = z.infer<typeof imagePayloadWireSchema>

/** 音声チャンクのワイヤ形式 */
export const audioChunkWireSchema = z.object({
  mime_type: z.string().optional(),
  audio_base64: z.string(),
  seq: z.number().int().optional(),
})
export type AudioChunkWire = z.infer<typeof audioChunkWireSchema>

/** 公開 API → ワイヤ形式（レール移動） */
export function railMoveToWire(input: RailMove): RailMoveWire {
  return {
    axis: input.axis,
    direction: input.direction,
    duration_ms: input.durationMs,
  }
}

/** ワイヤ形式 → 公開 API（レール移動） */
export function railMoveFromWire(wire: RailMoveWire): RailMove {
  return {
    axis: wire.axis,
    direction: wire.direction,
    durationMs: wire.duration_ms,
  }
}

/** 公開 API → ワイヤ形式（画像） */
export function imagePayloadToWire(payload: ImagePayload): ImagePayloadWire {
  return { mime_type: payload.mimeType, image_base64: payload.imageBase64 }
}

/** ワイヤ形式 → 公開 API（画像） */
export function imagePayloadFromWire(wire: ImagePayloadWire): ImagePayload {
  return { mimeType: wire.mime_type, imageBase64: wire.image_base64 }
}

/** ワイヤ形式 → 公開 API（音声チャンク） */
export function audioChunkFromWire(
  wire: AudioChunkWire,
  requestId?: string
): AudioChunkPayload {
  return {
    requestId,
    mimeType: wire.mime_type,
    audioBase64: wire.audio_base64,
    seq: wire.seq,
  }
}

/** 受信時刻を付けて AudioChunk にする */
export function toAudioChunk(
  payload: AudioChunkPayload,
  receivedAt = Date.now()
): AudioChunk {
  return { ...payload, receivedAt }
}

// --- WebSocket 共通形式 -------------------------------------------------

/** ULID（Crockford base32 26 桁）または UUID を許可する request_id */
export const requestIdSchema = z
  .string()
  .regex(
    /^req-(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    { message: "request_id は req-<ulid|uuid> 形式である必要があります" }
  )

/**
 * 受信側の request_id。
 * 機器がどんな ID を返すか未確定のため、受信は非空文字列まで緩める
 */
export const inboundRequestIdSchema = z.string().min(1)

/** 新しい request_id を採番する（UUID v4 ベース） */
export function createRequestId(): string {
  return `req-${crypto.randomUUID()}`
}

/** Next → 機器のメッセージ（ワイヤ形式） */
export const stackchanOutboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hand.set"),
    request_id: requestIdSchema,
    data: z.object({ state: handStateSchema }),
  }),
  z.object({
    type: z.literal("audio.start"),
    request_id: requestIdSchema,
    data: z.object({}).optional(),
  }),
  z.object({
    type: z.literal("audio.stop"),
    request_id: requestIdSchema,
    data: z.object({}).optional(),
  }),
  z.object({
    type: z.literal("camera.capture"),
    request_id: requestIdSchema,
    data: z.object({}).optional(),
  }),
])

/** 機器 → Next のメッセージ（ワイヤ形式・判別可能 union） */
export const stackchanInboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ack"),
    request_id: inboundRequestIdSchema,
    data: z.looseObject({}).optional(),
  }),
  z.object({
    type: z.literal("error"),
    request_id: inboundRequestIdSchema,
    data: z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .optional(),
  }),
  z.object({
    type: z.literal("audio.chunk"),
    request_id: inboundRequestIdSchema,
    data: audioChunkWireSchema,
  }),
  z.object({
    type: z.literal("camera.frame"),
    request_id: inboundRequestIdSchema,
    data: imagePayloadWireSchema,
  }),
])

/** 受信 JSON を安全にパースする。壊れた JSON でも例外にしない */
export function parseStackchanInbound(
  raw: string
): z.infer<typeof stackchanInboundSchema> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = stackchanInboundSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
