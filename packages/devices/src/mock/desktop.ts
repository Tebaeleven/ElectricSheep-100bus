import { MOCK_PNG_BASE64 } from "../constants"
import type {
  DesktopClient,
  DesktopStatus,
  DeviceResult,
  ImagePayload,
  OpenUrl,
} from "../types"

export interface MockDesktopClient extends DesktopClient {
  /** 開いた URL の履歴（テスト用） */
  readonly openedUrls: readonly string[]
}

/** デスクトップ（Electron）のモック。スクリーンショットは 1x1 PNG を返す */
export function createMockDesktopClient(): MockDesktopClient {
  const openedUrls: string[] = []
  let screenshotCount = 0

  return {
    openedUrls,
    async screenshot(): Promise<DeviceResult<ImagePayload>> {
      const startedAt = Date.now()
      screenshotCount += 1
      console.info("[devices:mock] desktop.screenshot")
      return {
        ok: true,
        status: 200,
        data: { mimeType: "image/png", imageBase64: MOCK_PNG_BASE64 },
        latencyMs: Date.now() - startedAt,
      }
    },
    async openBrowser(input: OpenUrl): Promise<DeviceResult> {
      const startedAt = Date.now()
      openedUrls.push(input.url)
      console.info("[devices:mock] desktop.browser.open", input.url)
      return {
        ok: true,
        status: 200,
        data: { accepted: true },
        latencyMs: Date.now() - startedAt,
      }
    },
    async status(): Promise<DeviceResult<DesktopStatus>> {
      const startedAt = Date.now()
      console.info("[devices:mock] desktop.status")
      return {
        ok: true,
        status: 200,
        data: {
          state: "running",
          screenshotCount,
          openedUrlCount: openedUrls.length,
        },
        latencyMs: Date.now() - startedAt,
      }
    },
  }
}
