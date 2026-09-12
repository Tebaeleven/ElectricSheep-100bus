import { createTool } from "@mastra/core/tools"
import {
  createDevices,
  openUrlSchema,
  railAxisSchema,
  railMoveSchema,
  RAIL_MAX_DURATION_MS,
} from "@workspace/devices"
import type {
  Devices,
  DeviceResult,
  ImagePayload,
  RailDirection,
  StackchanClient,
} from "@workspace/devices"
import { z } from "zod"

/**
 * 機器クライアントはモジュールスコープでメモ化する。
 * モック実装は履歴を、実機クライアントは WebSocket 接続を内部に持つため、
 * 呼び出しのたびに生成すると履歴が消えたり接続が増殖する。
 */
let cachedDevices: Devices | undefined

export function getDevices(): Devices {
  cachedDevices ??= createDevices(process.env)
  return cachedDevices
}

/**
 * LLM に見せる共通の結果スキーマ。
 * `DeviceResult` の `data` は任意形なので LLM には返さず、ok / error だけ伝える。
 */
export const deviceResultSchema = z.object({
  ok: z.boolean(),
  status: z.number().optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
})

/** 画像系 tool の結果。base64 本体は LLM に渡さず、形式とサイズだけ返す */
export const imageResultSchema = z.object({
  ok: z.boolean(),
  mimeType: z.string().optional(),
  byteLength: z.number().optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
})

/**
 * レールの移動方向。
 * Gemini の function declaration は数値リテラルの union を扱えないことがあるため、
 * LLM には文字列 enum で見せ、内部で +1 / -1 に変換する。
 */
export const railDirectionInputSchema = z.enum(["plus", "minus"])

/** LLM 向けの方向表現を機器の方向値（+1 / -1）に変換する */
export function toRailDirection(
  direction: z.infer<typeof railDirectionInputSchema>
): RailDirection {
  return direction === "plus" ? 1 : -1
}

/** 例外を握りつぶして DeviceResult 形に落とす */
function toErrorResult(error: unknown, latencyMs: number): DeviceResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    latencyMs,
  }
}

/** DeviceResult から LLM 向けの結果（data 抜き）を作る */
function toLlmResult(result: DeviceResult): z.infer<typeof deviceResultSchema> {
  return {
    ok: result.ok,
    status: result.status,
    error: result.error,
    latencyMs: result.latencyMs,
  }
}

/** base64 文字列の復号後バイト数を求める */
function base64ByteLength(base64: string): number {
  return Buffer.byteLength(base64, "base64")
}

/** 画像を返す機器呼び出しを、base64 を含まない結果に変換する */
function toImageResult(
  result: DeviceResult<ImagePayload>
): z.infer<typeof imageResultSchema> {
  return {
    ok: result.ok,
    mimeType: result.data?.mimeType,
    byteLength: result.data
      ? base64ByteLength(result.data.imageBase64)
      : undefined,
    error: result.error,
    latencyMs: result.latencyMs,
  }
}

/** 例外を投げずに機器呼び出しを実行する共通ラッパー */
async function runDeviceCall<T>(
  call: () => Promise<DeviceResult<T>>
): Promise<DeviceResult<T>> {
  const startedAt = Date.now()
  try {
    return await call()
  } catch (error) {
    return toErrorResult(error, Date.now() - startedAt) as DeviceResult<T>
  }
}

/** 天井レールで移動する tool */
export const railMove = createTool({
  id: "rail-move",
  description: `天井レールで移動する。x=左右, y=前後, z=上下（仮。実機で確認）。direction は plus / minus。1 回の移動は短く（500ms 程度）刻み、長くても ${RAIL_MAX_DURATION_MS}ms まで。`,
  inputSchema: z.object({
    axis: railAxisSchema.describe("移動する軸。x=左右, y=前後, z=上下（仮）"),
    direction: railDirectionInputSchema.describe(
      "移動方向。plus=軸の正方向, minus=軸の負方向"
    ),
    durationMs: z
      .number()
      .int()
      .min(1)
      .max(RAIL_MAX_DURATION_MS)
      .describe(
        `移動時間（ミリ秒）。1〜${RAIL_MAX_DURATION_MS}。ふだんは 500 程度にする`
      ),
  }),
  outputSchema: deviceResultSchema,
  execute: async (input, ctx) => {
    const startedAt = Date.now()
    // 入力は正本の railMoveSchema で検証する（上限超過はここで ok:false になる）
    const parsed = railMoveSchema.safeParse({
      axis: input.axis,
      direction: toRailDirection(input.direction),
      durationMs: input.durationMs,
    })
    if (!parsed.success) {
      return toLlmResult(
        toErrorResult(
          parsed.error.issues[0]?.message ?? "入力が不正です",
          Date.now() - startedAt
        )
      )
    }
    const result = await runDeviceCall(() =>
      getDevices().rail.move(parsed.data, ctx?.abortSignal)
    )
    return toLlmResult(result)
  },
})

/** 天井レールを緊急停止する tool */
export const railStop = createTool({
  id: "rail-stop",
  description:
    "天井レールの移動をすぐ止める。危険を感じたとき・止まってと言われたときに呼ぶ。",
  inputSchema: z.object({}),
  outputSchema: deviceResultSchema,
  execute: async (_input, ctx) => {
    const result = await runDeviceCall(() =>
      getDevices().rail.stop(ctx?.abortSignal)
    )
    return toLlmResult(result)
  },
})

/** 首の可動範囲（度）と速度。正本は @workspace/devices の headSetSchema */
export const HEAD_YAW_MIN = -90
export const HEAD_YAW_MAX = 90
export const HEAD_PITCH_MIN = -45
export const HEAD_PITCH_MAX = 45
export const HEAD_SPEED_MAX = 100

type HeadSetInput = { yaw: number; pitch: number; speed?: number }

// TODO(P5 統合): headSet は @workspace/devices に正式追加（P5-A 担当）。
// 統合後はこの型と ?. 分岐を消し、stackchan.headSet(input) を直接呼ぶ。
type StackchanWithHeadSet = StackchanClient & {
  headSet?: (
    input: HeadSetInput,
    opts?: { timeoutMs?: number }
  ) => Promise<DeviceResult>
}

/** 首を指定角度へ向ける tool */
export const headSet = createTool({
  id: "head-set",
  description: `スタックちゃんの首を向ける。yaw は左右（${HEAD_YAW_MIN}〜${HEAD_YAW_MAX} 度。マイナスが自分から見て左）、pitch は上下（${HEAD_PITCH_MIN}〜${HEAD_PITCH_MAX} 度。プラスが上）。正面に戻すときは yaw=0, pitch=0。`,
  inputSchema: z.object({
    yaw: z
      .number()
      .min(HEAD_YAW_MIN)
      .max(HEAD_YAW_MAX)
      .describe(`左右の角度。${HEAD_YAW_MIN}〜${HEAD_YAW_MAX} 度`),
    pitch: z
      .number()
      .min(HEAD_PITCH_MIN)
      .max(HEAD_PITCH_MAX)
      .describe(`上下の角度。${HEAD_PITCH_MIN}〜${HEAD_PITCH_MAX} 度`),
    speed: z
      .number()
      .min(0)
      .max(HEAD_SPEED_MAX)
      .optional()
      .describe(`首を動かす速さ。0〜${HEAD_SPEED_MAX}。省略可`),
  }),
  outputSchema: deviceResultSchema,
  execute: async (input) => {
    const stackchan = getDevices().stackchan as StackchanWithHeadSet
    const result = await runDeviceCall(
      async () =>
        (await stackchan.headSet?.(input)) ?? {
          ok: false,
          error: "headSet not available",
          latencyMs: 0,
        }
    )
    return toLlmResult(result)
  },
})

/** 自分のカメラで周りを撮る tool */
export const cameraCapture = createTool({
  id: "camera-capture",
  description:
    "自分のカメラで目の前のようすを 1 枚撮る。撮った画像は画面に表示される。撮影は利用者の許可を確認してから呼ぶ。",
  inputSchema: z.object({}),
  outputSchema: imageResultSchema,
  execute: async () => {
    const result = await runDeviceCall<ImagePayload>(() =>
      getDevices().stackchan.cameraCapture()
    )
    return toImageResult(result)
  },
})

/** 利用者の PC 画面を撮る tool */
export const desktopScreenshot = createTool({
  id: "desktop-screenshot",
  description:
    "利用者のパソコンの画面を 1 枚撮る。撮った画像は画面に表示される。必ず利用者の許可を確認してから呼ぶ。",
  inputSchema: z.object({}),
  outputSchema: imageResultSchema,
  execute: async (_input, ctx) => {
    const result = await runDeviceCall<ImagePayload>(() =>
      getDevices().desktop.screenshot(ctx?.abortSignal)
    )
    return toImageResult(result)
  },
})

/** 利用者の PC のブラウザで URL を開く tool */
export const desktopOpenBrowser = createTool({
  id: "desktop-open-browser",
  description:
    "利用者のパソコンのブラウザで URL を開く。http / https のみ。開く前に利用者の許可を確認する。",
  inputSchema: z.object({
    url: z.string().describe("開く URL。http:// または https:// で始まること"),
  }),
  outputSchema: deviceResultSchema,
  execute: async (input, ctx) => {
    const startedAt = Date.now()
    const parsed = openUrlSchema.safeParse({ url: input.url })
    if (!parsed.success) {
      return toLlmResult(
        toErrorResult(
          parsed.error.issues[0]?.message ?? "url が不正です",
          Date.now() - startedAt
        )
      )
    }
    const result = await runDeviceCall(() =>
      getDevices().desktop.openBrowser(parsed.data, ctx?.abortSignal)
    )
    return toLlmResult(result)
  },
})
