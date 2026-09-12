import { z } from "zod"

import {
  HEAD_PITCH_MAX_DEG,
  HEAD_PITCH_MIN_DEG,
  HEAD_SPEED_MAX,
  HEAD_SPEED_MIN,
  HEAD_YAW_MAX_DEG,
  HEAD_YAW_MIN_DEG,
  RAIL_MAX_DURATION_MS,
} from "./constants"

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

/**
 * レール 1 軸分の状態（ファーム rail_dc の `/api/v1/rail/status` が返す形）。
 * 実装差分を吸収するため、軸名以外はすべて任意にしている
 */
export const railAxisStatusSchema = z.looseObject({
  axis: railAxisSchema,
  active: z.boolean().optional(),
  pending: z.boolean().optional(),
  direction: z.number().int().optional(),
  remaining_ms: z.number().int().optional(),
})

/**
 * レール状態レスポンス。機器が追加のフィールドを返しても落とさない。
 * 実機ファーム（rail_dc）は `state` を返さないので、
 * `axes[].active` のいずれかが true なら `moving`、そうでなければ `stopped` を導出する
 */
export const railStatusSchema = z
  .looseObject({
    state: railStateSchema.optional(),
    simulated: z.boolean().optional(),
    ip: z.string().optional(),
    ap_ip: z.string().optional(),
    ap_ssid: z.string().optional(),
    axes: z.array(railAxisStatusSchema).optional(),
  })
  .transform((raw) => {
    const moving = raw.axes?.some((axis) => axis.active === true) ?? false
    return {
      ...raw,
      // state が無いファームでは軸の active から導出する
      state: raw.state ?? (moving ? ("moving" as const) : ("stopped" as const)),
      apIp: raw.ap_ip,
      apSsid: raw.ap_ssid,
    }
  })

/** デスクトップ（Electron）の状態レスポンス */
export const desktopStatusSchema = z.looseObject({ state: z.string() })

/**
 * スタックちゃんの首の角度（B 方式）。
 * 範囲はファーム `obake_servo_api.cpp` の clamp（yaw ±128 / pitch 0..90 / speed 100..1000）に合わせる。
 * speed 省略時はファーム既定の 150 が使われる
 */
export const headSetSchema = z.object({
  yaw: z.number().min(HEAD_YAW_MIN_DEG).max(HEAD_YAW_MAX_DEG),
  pitch: z.number().min(HEAD_PITCH_MIN_DEG).max(HEAD_PITCH_MAX_DEG),
  speed: z.number().min(HEAD_SPEED_MIN).max(HEAD_SPEED_MAX).optional(),
})

/** @deprecated 現行ハードに手のサーボは無い（首 yaw/pitch のみ）。`headSetSchema` を使う */
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
