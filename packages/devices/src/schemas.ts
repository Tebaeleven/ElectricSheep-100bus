import { z } from "zod"

import { RAIL_MAX_DURATION_MS } from "./constants"

/** レールの軸 */
export const railAxisSchema = z.enum(["x", "y", "z"])

/** レールの移動方向（+1 / -1） */
export const railDirectionSchema = z.union([z.literal(1), z.literal(-1)])

/**
 * レール移動命令（公開 API・camelCase）。
 * durationMs は安全要件によりクライアント側でも上限を掛ける
 */
export const railMoveSchema = z.object({
  axis: railAxisSchema,
  direction: railDirectionSchema,
  durationMs: z.number().int().min(1).max(RAIL_MAX_DURATION_MS),
})

/** レールの状態 */
export const railStateSchema = z.enum(["moving", "stopped", "error"])

/** レール状態レスポンス。機器が追加のフィールドを返しても落とさない */
export const railStatusSchema = z.looseObject({ state: railStateSchema })

/** デスクトップ（Electron）の状態レスポンス */
export const desktopStatusSchema = z.looseObject({ state: z.string() })

/** スタックちゃんの手の状態 */
export const handStateSchema = z.enum(["open", "closed"])

/** ブラウザで開く URL。安全要件により http/https のみ許可する */
export const openUrlSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), {
      message: "url は http または https のみ許可されています",
    }),
})

/** 画像ペイロード（公開 API・camelCase）。base64 は Data URL 接頭辞なし */
export const imagePayloadSchema = z.object({
  mimeType: z.string(),
  imageBase64: z.string(),
})

/** 音声チャンク（公開 API・camelCase） */
export const audioChunkPayloadSchema = z.object({
  requestId: z.string().optional(),
  mimeType: z.string().optional(),
  audioBase64: z.string(),
  seq: z.number().int().optional(),
})
