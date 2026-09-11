import type { ZodType } from "zod"
import {
  createDevices,
  type AudioChunk,
  type DeviceResult,
  type Devices,
} from "@workspace/devices"

/** 直近の音声チャンクを保持するリングバッファの容量 */
export const AUDIO_BUFFER_CAPACITY = 200

/** 音声チャンクの既定取得件数（`/api/devices/stackchan/audio/recent`） */
export const AUDIO_RECENT_DEFAULT_LIMIT = 20

type DevicesSingleton = Devices & {
  /** 直近 AUDIO_BUFFER_CAPACITY 件の音声チャンク（古い順） */
  audioBuffer: AudioChunk[]
}

/**
 * dev の HMR でモジュールが再評価されても WebSocket 接続が増殖しないように
 * globalThis にシングルトンを置く
 */
const GLOBAL_KEY = "__esDevices"

type GlobalWithDevices = typeof globalThis & {
  [GLOBAL_KEY]?: DevicesSingleton
}

/** 機器クライアント一式（プロセス内シングルトン）を返す */
export function getDevices(): Devices {
  const globalWithDevices = globalThis as GlobalWithDevices
  const cached = globalWithDevices[GLOBAL_KEY]
  if (cached) return cached

  const devices = createDevices(process.env)
  const singleton: DevicesSingleton = { ...devices, audioBuffer: [] }

  // 録音中に届くチャンクは UI から取りに来るまでメモリに溜めておく
  devices.stackchan.onAudioChunk((chunk) => {
    singleton.audioBuffer.push(chunk)
    if (singleton.audioBuffer.length > AUDIO_BUFFER_CAPACITY) {
      singleton.audioBuffer.splice(
        0,
        singleton.audioBuffer.length - AUDIO_BUFFER_CAPACITY
      )
    }
  })

  globalWithDevices[GLOBAL_KEY] = singleton
  return singleton
}

/** 直近の音声チャンクを新しい順で返す */
export function getRecentAudio(
  limit: number = AUDIO_RECENT_DEFAULT_LIMIT
): AudioChunk[] {
  getDevices()
  const buffer = (globalThis as GlobalWithDevices)[GLOBAL_KEY]?.audioBuffer ?? []
  const safeLimit = Math.max(0, Math.min(Math.floor(limit), buffer.length))
  return buffer.slice(buffer.length - safeLimit).reverse()
}

/** スタックちゃんは初回利用時に lazy connect する */
export async function getStackchan(): Promise<Devices["stackchan"]> {
  const { stackchan } = getDevices()
  if (!stackchan.connected) await stackchan.connect()
  return stackchan
}

// --- Route Handler 共通ヘルパー -------------------------------------------

/** ボディ不要の機器操作を実行する。例外も 200 + {ok:false} で返して UI を止めない */
export async function runDeviceAction<T>(
  action: () => Promise<DeviceResult<T>>
): Promise<Response> {
  try {
    return Response.json(await action(), { status: 200 })
  } catch (cause) {
    return Response.json(
      {
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
        latencyMs: 0,
      } satisfies DeviceResult,
      { status: 200 }
    )
  }
}

/**
 * JSON ボディを zod で検証してから機器操作を実行する。
 * 検証に失敗したときだけ 400 {ok:false,error,issues} を返す
 */
export async function runDeviceActionWithBody<TInput, TOutput>(
  request: Request,
  schema: ZodType<TInput>,
  action: (input: TInput) => Promise<DeviceResult<TOutput>>,
  options?: { normalize?: (body: unknown) => unknown }
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { ok: false, error: "JSON として解釈できませんでした" },
      { status: 400 }
    )
  }

  const parsed = schema.safeParse(options?.normalize?.(body) ?? body)
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "入力の形式が不正です",
        issues: parsed.error.issues,
      },
      { status: 400 }
    )
  }

  return runDeviceAction(() => action(parsed.data))
}
