import {
  createMockDesktopClient,
  createMockRailClient,
  createMockStackchanClient,
} from "./mock/index"
import type {
  DesktopClient,
  DeviceMode,
  Devices,
  HttpDeviceOptions,
  RailClient,
  StackchanClient,
  StackchanOptions,
} from "./types"

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

/** 実機 HTTP クライアント（レール）。P3-A レーンで実装する */
export function createRailClient(options: HttpDeviceOptions): RailClient {
  void options // P3-A レーンで使用する
  throw new Error("not implemented yet")
}

/** 実機 HTTP クライアント（デスクトップ）。P3-A レーンで実装する */
export function createDesktopClient(options: HttpDeviceOptions): DesktopClient {
  void options // P3-A レーンで使用する
  throw new Error("not implemented yet")
}

/** 実機 WebSocket クライアント（スタックちゃん）。P3-A レーンで実装する */
export function createStackchanClient(
  options: StackchanOptions
): StackchanClient {
  void options // P3-A レーンで使用する
  throw new Error("not implemented yet")
}

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
 * 実クライアントの生成を試み、失敗したらモックへフォールバックする。
 * 実装が入るまで create*Client は throw するため、常にモックが返る
 */
function withMockFallback<T>(
  label: string,
  create: () => T,
  fallback: () => T
): T {
  try {
    return create()
  } catch (error) {
    console.warn(
      `[devices] ${label} の実クライアント生成に失敗したためモックを使用します:`,
      error instanceof Error ? error.message : error
    )
    return fallback()
  }
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
      ? withMockFallback(
          "rail",
          () => createRailClient({ baseUrl: railBaseUrl, timeoutMs, headers }),
          createMockRailClient
        )
      : createMockRailClient()

  const desktop =
    mode === "real" && desktopBaseUrl
      ? withMockFallback(
          "desktop",
          () =>
            createDesktopClient({
              baseUrl: desktopBaseUrl,
              timeoutMs,
              headers,
            }),
          createMockDesktopClient
        )
      : createMockDesktopClient()

  const stackchan =
    mode === "real" && stackchanUrl
      ? withMockFallback(
          "stackchan",
          () =>
            createStackchanClient({ url: stackchanUrl, timeoutMs, headers }),
          createMockStackchanClient
        )
      : createMockStackchanClient()

  return { rail, desktop, stackchan }
}
