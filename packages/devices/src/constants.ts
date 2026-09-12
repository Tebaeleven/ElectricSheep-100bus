/** 機器 API に関する定数。env で上書きできるものはここで一度だけ解決する */

/** HTTP 機器（ESP32 / Electron）の共通プレフィックス。baseUrl には含めず SDK が付与する */
export const HTTP_API_PREFIX = "/api/v1"

/** スタックちゃん WebSocket のパス。url には含めず SDK が付与する */
export const STACKCHAN_WS_PATH = "/ws/v1/robot"

/** 駆動時間の既定上限（ミリ秒）。安全要件によりクライアント側でも上限を設ける */
export const RAIL_MAX_DURATION_MS_DEFAULT = 3000

const rawMaxDurationMs = Number(
  process.env.DEVICE_RAIL_MAX_DURATION_MS ?? RAIL_MAX_DURATION_MS_DEFAULT
)

/** レール駆動時間の上限（ミリ秒）。env DEVICE_RAIL_MAX_DURATION_MS ?? 3000 */
export const RAIL_MAX_DURATION_MS: number =
  Number.isFinite(rawMaxDurationMs) && rawMaxDurationMs > 0
    ? Math.floor(rawMaxDurationMs)
    : RAIL_MAX_DURATION_MS_DEFAULT

/** 機器呼び出しの既定タイムアウト（ミリ秒） */
export const DEFAULT_TIMEOUT_MS = 5000

/** モックサーバーの既定ポート */
export const MOCK_RAIL_PORT = 8791
export const MOCK_DESKTOP_PORT = 8792
export const MOCK_STACKCHAN_PORT = 8793

/**
 * Electron 実機（client/desktop）の Desktop API 既定ポート。
 * モック帯 8791-8793 と分けるため 8801。台帳は scripts/ports.json（desktop_real）。
 * DEVICE_MODE=real で実機に繋ぐときは DESKTOP_BASE_URL=http://127.0.0.1:8801 にする。
 */
export const REAL_DESKTOP_PORT_DEFAULT = 8801

/** モックが返す 1x1 透明 PNG（Data URL 接頭辞なしの base64） */
export const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** モックが返すダミー音声チャンク（無音の短い base64） */
export const MOCK_AUDIO_CHUNK_BASE64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

/** モックの音声チャンク送出間隔（ミリ秒） */
export const MOCK_AUDIO_CHUNK_INTERVAL_MS = 100

/**
 * スタックちゃん B 方式（PC 側ブリッジ）の既定ポート。
 * ファームの `kMediaWsPort` と同じ 8030（`packages/stackchan-bridge`）
 */
export const STACKCHAN_BRIDGE_PORT_DEFAULT = 8030

/** ブリッジの HTTP パス（`STACKCHAN_BRIDGE_URL` の後ろに付ける） */
export const STACKCHAN_BRIDGE_PATHS = {
  status: "/obake/status",
  latestJpeg: "/obake/latest.jpg",
  latestJson: "/obake/latest.json",
  audioRecent: "/obake/audio/recent",
  head: "/obake/head",
  events: "/obake/events",
} as const

/** ブリッジの音声ポーリング間隔（ミリ秒）。onAudioChunk はこの間隔で差分を配る */
export const STACKCHAN_BRIDGE_AUDIO_POLL_MS = 500

/** 首の可動範囲（ファーム `obake_servo_api.cpp` の clamp と同じ） */
export const HEAD_YAW_MIN_DEG = -128
export const HEAD_YAW_MAX_DEG = 128
export const HEAD_PITCH_MIN_DEG = 0
export const HEAD_PITCH_MAX_DEG = 90
export const HEAD_SPEED_MIN = 100
export const HEAD_SPEED_MAX = 1000
export const HEAD_SPEED_DEFAULT = 150
