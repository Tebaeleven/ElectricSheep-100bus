import { createDesktopClient } from "./http/desktop"
import { createRailClient } from "./http/rail"
import { createStackchanBridgeClient } from "./http/stackchan-bridge"
import { createStackchanCompositeClient } from "./http/stackchan-composite"
import { createStackchanHttpClient } from "./http/stackchan-http"
import {
  createMockDesktopClient,
  createMockRailClient,
  createMockStackchanClient,
} from "./mock/index"
import type { DeviceMode, Devices } from "./types"
import { createStackchanClient } from "./ws/stackchan"

export {
  DEFAULT_TIMEOUT_MS,
  HEAD_PITCH_MAX_DEG,
  HEAD_PITCH_MIN_DEG,
  HEAD_SPEED_DEFAULT,
  HEAD_SPEED_MAX,
  HEAD_SPEED_MIN,
  HEAD_YAW_MAX_DEG,
  HEAD_YAW_MIN_DEG,
  HTTP_API_PREFIX,
  MOCK_AUDIO_CHUNK_BASE64,
  MOCK_AUDIO_CHUNK_INTERVAL_MS,
  MOCK_DESKTOP_PORT,
  MOCK_PNG_BASE64,
  MOCK_RAIL_PORT,
  MOCK_STACKCHAN_HTTP_PORT,
  MOCK_STACKCHAN_PORT,
  RAIL_MAX_DURATION_MS,
  RAIL_MAX_DURATION_MS_DEFAULT,
  STACKCHAN_BRIDGE_AUDIO_POLL_MS,
  STACKCHAN_BRIDGE_PATHS,
  STACKCHAN_BRIDGE_PORT_DEFAULT,
  STACKCHAN_HTTP_HEALTH_MARKER,
  STACKCHAN_HTTP_MIN_INTERVAL_MS_DEFAULT,
  STACKCHAN_HTTP_PATHS,
  STACKCHAN_HTTP_PORT_DEFAULT,
  STACKCHAN_HTTP_TIMEOUT_MS_DEFAULT,
  STACKCHAN_WS_PATH,
} from "./constants"

export {
  audioChunkPayloadSchema,
  desktopStatusSchema,
  handStateSchema,
  headSetSchema,
  imagePayloadSchema,
  openUrlSchema,
  railAxisSchema,
  railDirectionSchema,
  railMoveSchema,
  railStateSchema,
  railStatusSchema,
} from "./schemas"

export {
  audioChunkFromWire,
  audioChunkWireSchema,
  createRequestId,
  imagePayloadFromWire,
  imagePayloadToWire,
  imagePayloadWireSchema,
  inboundRequestIdSchema,
  parseStackchanInbound,
  railMoveFromWire,
  railMoveToWire,
  railMoveWireSchema,
  requestIdSchema,
  stackchanInboundSchema,
  stackchanOutboundSchema,
  toAudioChunk,
} from "./wire"
export type { AudioChunkWire, ImagePayloadWire, RailMoveWire } from "./wire"

export type {
  AudioChunk,
  AudioChunkPayload,
  DesktopClient,
  DesktopStatus,
  DeviceMode,
  DeviceResult,
  Devices,
  HandState,
  HeadSet,
  HttpDeviceOptions,
  ImagePayload,
  OpenUrl,
  RailAxis,
  RailClient,
  RailDirection,
  RailMove,
  RailStatus,
  StackchanBridgeOptions,
  StackchanBridgeStatus,
  StackchanClient,
  StackchanEnvelope,
  StackchanHttpOptions,
  StackchanInbound,
  StackchanInboundType,
  StackchanOptions,
  StackchanOutbound,
  StackchanOutboundType,
} from "./types"

export {
  createMockDesktopClient,
  createMockRailClient,
  createMockStackchanClient,
} from "./mock/index"
export type {
  MockDesktopClient,
  MockRailClient,
  MockStackchanClient,
} from "./mock/index"

export { createRailClient } from "./http/rail"
export { createDesktopClient } from "./http/desktop"
export { createStackchanClient } from "./ws/stackchan"
export { createStackchanBridgeClient } from "./http/stackchan-bridge"
export type { StackchanBridgeClient } from "./http/stackchan-bridge"
export { createStackchanHttpClient } from "./http/stackchan-http"
export type { StackchanHttpClient } from "./http/stackchan-http"
export { createStackchanCompositeClient } from "./http/stackchan-composite"
export type {
  StackchanCompositeClient,
  StackchanCompositeOptions,
  StackchanCompositeStatus,
} from "./http/stackchan-composite"

/** env から動作モードを読む。未設定・不正値は mock */
function resolveMode(env: NodeJS.ProcessEnv): DeviceMode {
  return env.DEVICE_MODE === "real" ? "real" : "mock"
}

/** 認証方式が未確定のため、トークンがあれば Bearer で全機器に付与する */
function resolveHeaders(
  env: NodeJS.ProcessEnv
): Record<string, string> | undefined {
  const token = env.DEVICE_AUTH_TOKEN?.trim()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

/**
 * スタックちゃんのクライアントを env から組み立てる。
 *
 * 機器の機能が二本立て（手・LED は機器上の HTTP 8765 / 首・カメラ・音声は
 * PC 側ブリッジ 8030）なので、どちらか一方でも URL があれば合成クライアントにする。
 * どちらも無ければ従来どおり（旧契約 WS かモック）
 */
function createStackchanForEnv(input: {
  mode: DeviceMode
  httpUrl?: string
  bridgeUrl?: string
  wsUrl?: string
  timeoutMs?: number
  headers?: Record<string, string>
}): Devices["stackchan"] {
  const { mode, httpUrl, bridgeUrl, wsUrl, timeoutMs, headers } = input

  const createWs = () =>
    createStackchanClient({
      url: wsUrl as string,
      timeoutMs,
      headers,
      // 実機は落ちても復帰させたいので再接続を有効にする
      reconnect: true,
    })

  if (mode !== "real") return createMockStackchanClient()

  if (httpUrl || bridgeUrl) {
    return createStackchanCompositeClient({
      http: httpUrl
        ? createStackchanHttpClient({ baseUrl: httpUrl, timeoutMs })
        : undefined,
      bridge: bridgeUrl
        ? createStackchanBridgeClient({ baseUrl: bridgeUrl, timeoutMs, headers })
        : undefined,
      // 担当クライアントが無い機能の受け皿。旧契約 WS があればそちらを使う
      fallback: wsUrl ? createWs() : createMockStackchanClient(),
    })
  }

  if (wsUrl) return createWs()
  return createMockStackchanClient()
}

/**
 * env から 3 機器のクライアント一式を作る。
 * DEVICE_MODE=mock（既定）は全てモック。real でも URL 未設定の機器はモック
 */
export function createDevices(env: NodeJS.ProcessEnv): Devices {
  const mode = resolveMode(env)
  const headers = resolveHeaders(env)
  const timeoutMs = Number(env.DEVICE_TIMEOUT_MS ?? "") || undefined

  const railBaseUrl = env.RAIL_BASE_URL?.trim()
  const desktopBaseUrl = env.DESKTOP_BASE_URL?.trim()
  const stackchanUrl = env.STACKCHAN_WS_URL?.trim()
  // B 方式（PC 側ブリッジ）を優先する。旧契約の WS は STACKCHAN_WS_URL のときだけ
  const stackchanBridgeUrl = env.STACKCHAN_BRIDGE_URL?.trim()
  // 機器上の HTTP（8765）。手と LED だけはここが担当する
  const stackchanHttpUrl = env.STACKCHAN_HTTP_URL?.trim()

  const rail =
    mode === "real" && railBaseUrl
      ? createRailClient({ baseUrl: railBaseUrl, timeoutMs, headers })
      : createMockRailClient()

  const desktop =
    mode === "real" && desktopBaseUrl
      ? createDesktopClient({ baseUrl: desktopBaseUrl, timeoutMs, headers })
      : createMockDesktopClient()

  const stackchan = createStackchanForEnv({
    mode,
    httpUrl: stackchanHttpUrl,
    bridgeUrl: stackchanBridgeUrl,
    wsUrl: stackchanUrl,
    timeoutMs,
    headers,
  })

  return { rail, desktop, stackchan }
}
