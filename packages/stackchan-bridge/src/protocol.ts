/**
 * スタックちゃん（Obake_device）の Media プロトコル。
 *
 * 正本はメンバー実装の `firmware/stackchan/homelab/obake_media/server.py` と
 * ファーム側送信コード `firmware/stackchan/firmware/main/stackchan/custom/obake/obake_robot_ws.cpp`。
 * ここでは同じ定数・同じフレーム形式を TypeScript 側に写している。
 *
 * - 上り（機器 → PC）: バイナリ `[type:1][len:4 BE][payload]`。`0x02`=JPEG / `0x20`=PCM
 * - 上り（接続直後）: テキスト `{"type":"hello","pcm_rate":<Hz>}`
 * - 下り（PC → 機器）: テキスト `{"cmd":"set_head","yaw":<int>,"pitch":<int>,"speed":<int>}`
 */

/** WS のパス（機器がここへ接続してくる） */
export const MEDIA_WS_PATH = "/obake/media"

/** bridge の既定ポート（ファームの `kMediaWsPort` と同じ 8030） */
export const BRIDGE_PORT_DEFAULT = 8030

/** bridge の既定バインドアドレス（機器が LAN から繋ぐので 0.0.0.0） */
export const BRIDGE_HOST_DEFAULT = "0.0.0.0"

/** バイナリフレームの種別 */
export const FRAME_TYPE_JPEG = 0x02
export const FRAME_TYPE_PCM = 0x20

/** フレームヘッダ長（type 1 byte + length 4 byte BE） */
export const FRAME_HEADER_BYTES = 5

/** 受信する 1 メッセージの上限（server.py の `max_msg_size` と同じ 2 MiB） */
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024

/** hello が来るまでの既定 PCM サンプリングレート（server.py と同じ） */
export const PCM_RATE_DEFAULT = 24000

/** PCM は 16-bit LE モノラル */
export const PCM_BYTES_PER_SAMPLE = 2

/** PCM リングバッファの既定保持時間（ミリ秒） */
export const PCM_BUFFER_MS_DEFAULT = 10000

/** JPEG も PCM も来ない時間がこれを超えたらゾンビ接続として切る（server.py と同じ） */
export const STALE_WS_MS = 15000

/** 首の可動範囲（ファーム `obake_servo_api.cpp` の clamp と同じ） */
export const HEAD_YAW_MIN = -128
export const HEAD_YAW_MAX = 128
export const HEAD_PITCH_MIN = 0
export const HEAD_PITCH_MAX = 90
export const HEAD_SPEED_MIN = 100
export const HEAD_SPEED_MAX = 1000
export const HEAD_SPEED_DEFAULT = 150

/** デコード済みのバイナリフレーム */
export interface MediaFrame {
  type: number
  payload: Buffer
}

/** 機器へ送る首の指令（ワイヤ形式そのまま） */
export interface SetHeadCommand {
  cmd: "set_head"
  yaw: number
  pitch: number
  speed: number
}

/** 値を範囲に収める（ファームと同じ clamp） */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** バイナリフレームを組み立てる（偽機器・テスト用） */
export function encodeFrame(type: number, payload: Buffer): Buffer {
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length)
  frame.writeUInt8(type, 0)
  frame.writeUInt32BE(payload.length, 1)
  payload.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

/**
 * バイナリフレームを読む。
 * server.py と同じく 5 byte 未満・長さ不足は捨てる（例外にしない）
 */
export function decodeFrame(data: Buffer): MediaFrame | null {
  if (data.length < FRAME_HEADER_BYTES) return null
  const type = data.readUInt8(0)
  const length = data.readUInt32BE(1)
  const payload = data.subarray(
    FRAME_HEADER_BYTES,
    FRAME_HEADER_BYTES + length
  )
  // ファームは常に全長を 1 メッセージで送るが、欠けていたら捨てる
  if (payload.length < length) return null
  return { type, payload: Buffer.from(payload) }
}

/** hello テキストの中身 */
export interface HelloMessage {
  type: "hello"
  pcmRate: number
}

/**
 * 機器からのテキストを読む。hello 以外・壊れた JSON は null。
 * （server.py も hello 以外は無視してログするだけ）
 */
export function parseHello(text: string): HelloMessage | null {
  try {
    const doc: unknown = JSON.parse(text)
    if (typeof doc !== "object" || doc === null) return null
    const record = doc as Record<string, unknown>
    if (record.type !== "hello") return null
    const rate = Number(record.pcm_rate)
    if (!Number.isFinite(rate) || rate <= 0) return null
    return { type: "hello", pcmRate: Math.floor(rate) }
  } catch {
    return null
  }
}

/** hello テキストを作る（偽機器・テスト用） */
export function encodeHello(pcmRate: number): string {
  return JSON.stringify({ type: "hello", pcm_rate: pcmRate })
}

/**
 * `set_head` 指令を作る。
 * ファーム側でも clamp されるが、送る前にこちらでも範囲に収める
 */
export function buildSetHeadCommand(input: {
  yaw?: number
  pitch?: number
  speed?: number
}): SetHeadCommand {
  const speed = input.speed
  return {
    cmd: "set_head",
    yaw: clamp(input.yaw ?? 0, HEAD_YAW_MIN, HEAD_YAW_MAX),
    pitch: clamp(input.pitch ?? 0, HEAD_PITCH_MIN, HEAD_PITCH_MAX),
    speed: clamp(
      speed === undefined || speed <= 0 ? HEAD_SPEED_DEFAULT : speed,
      HEAD_SPEED_MIN,
      HEAD_SPEED_MAX
    ),
  }
}

/** PCM のバイト数を再生時間（ミリ秒）に換算する */
export function pcmBytesToMs(bytes: number, pcmRate: number): number {
  const rate = pcmRate > 0 ? pcmRate : PCM_RATE_DEFAULT
  return (bytes / (rate * PCM_BYTES_PER_SAMPLE)) * 1000
}
