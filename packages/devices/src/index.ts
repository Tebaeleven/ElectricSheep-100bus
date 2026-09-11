import { createDesktopClient } from "./http/desktop"
import { createRailClient } from "./http/rail"
import {
  createMockDesktopClient,
  createMockRailClient,
  createMockStackchanClient,
} from "./mock/index"
import type { DeviceMode, Devices } from "./types"
import { createStackchanClient } from "./ws/stackchan"

export {
  DEFAULT_TIMEOUT_MS,
  HTTP_API_PREFIX,
  MOCK_AUDIO_CHUNK_BASE64,
  MOCK_AUDIO_CHUNK_INTERVAL_MS,
  MOCK_DESKTOP_PORT,
  MOCK_PNG_BASE64,
  MOCK_RAIL_PORT,
  MOCK_STACKCHAN_PORT,
  RAIL_MAX_DURATION_MS,
  RAIL_MAX_DURATION_MS_DEFAULT,
  STACKCHAN_WS_PATH,
} from "./constants"

export {
  audioChunkPayloadSchema,
  desktopStatusSchema,
  handStateSchema,
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
  HttpDeviceOptions,
  ImagePayload,
  OpenUrl,
  RailAxis,
  RailClient,
  RailDirection,
  RailMove,
  RailStatus,
  StackchanClient,
  StackchanEnvelope,
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

  const rail =
    mode === "real" && railBaseUrl
      ? createRailClient({ baseUrl: railBaseUrl, timeoutMs, headers })
      : createMockRailClient()

  const desktop =
    mode === "real" && desktopBaseUrl
      ? createDesktopClient({ baseUrl: desktopBaseUrl, timeoutMs, headers })
      : createMockDesktopClient()

  const stackchan =
    mode === "real" && stackchanUrl
      ? createStackchanClient({
          url: stackchanUrl,
          timeoutMs,
          headers,
          // 実機は落ちても復帰させたいので再接続を有効にする
          reconnect: true,
        })
      : createMockStackchanClient()

  return { rail, desktop, stackchan }
}
