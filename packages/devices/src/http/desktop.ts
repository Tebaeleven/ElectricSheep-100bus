import { desktopStatusSchema, openUrlSchema } from "../schemas"
import type {
  DesktopClient,
  DesktopStatus,
  DeviceResult,
  HttpDeviceOptions,
  ImagePayload,
  OpenUrl,
} from "../types"
import { imagePayloadFromWire, imagePayloadWireSchema } from "../wire"
import { sendHttpRequest } from "./request"

/** `data:image/png;base64,` のような Data URL 接頭辞が付いていたら剥がす */
function stripDataUrlPrefix(base64: string): string {
  const match = /^data:[^;,]*(?:;[^;,]+)*;base64,/.exec(base64)
  return match ? base64.slice(match[0].length) : base64
}

/**
 * Electron（デスクトップ）の実 HTTP クライアント。
 * スクリーンショットはワイヤ形式（snake_case）を camelCase に変換して返す
 */
export function createDesktopClient(options: HttpDeviceOptions): DesktopClient {
  return {
    async screenshot(signal?: AbortSignal): Promise<DeviceResult<ImagePayload>> {
      const result = await sendHttpRequest(options, {
        method: "POST",
        path: "/desktop/screenshot",
        signal,
      })
      if (!result.ok) return result as DeviceResult<ImagePayload>
      const parsed = imagePayloadWireSchema.safeParse(result.data)
      if (!parsed.success) {
        return {
          ok: false,
          status: result.status,
          data: undefined,
          error: `不正な desktop/screenshot 応答: ${parsed.error.message}`,
          latencyMs: result.latencyMs,
        }
      }
      const payload = imagePayloadFromWire(parsed.data)
      return {
        ...result,
        data: {
          mimeType: payload.mimeType,
          imageBase64: stripDataUrlPrefix(payload.imageBase64),
        },
      }
    },

    async openBrowser(
      input: OpenUrl,
      signal?: AbortSignal
    ): Promise<DeviceResult> {
      const startedAt = Date.now()
      let body: OpenUrl
      try {
        // 安全要件により http/https 以外はリクエスト前に弾く
        body = openUrlSchema.parse(input)
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startedAt,
        }
      }
      return sendHttpRequest(options, {
        method: "POST",
        path: "/desktop/browser/open",
        body,
        signal,
        retryOnNetworkError: false,
      })
    },

    async status(signal?: AbortSignal): Promise<DeviceResult<DesktopStatus>> {
      const result = await sendHttpRequest(options, {
        method: "GET",
        path: "/desktop/status",
        signal,
      })
      if (!result.ok) return result as DeviceResult<DesktopStatus>
      const parsed = desktopStatusSchema.safeParse(result.data)
      if (!parsed.success) {
        return {
          ok: false,
          status: result.status,
          data: undefined,
          error: `不正な desktop/status 応答: ${parsed.error.message}`,
          latencyMs: result.latencyMs,
        }
      }
      return { ...result, data: parsed.data as DesktopStatus }
    },
  }
}
