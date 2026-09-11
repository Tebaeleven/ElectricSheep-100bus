import { describe, expect, it } from "vitest"

import { MOCK_PNG_BASE64 } from "../constants"
import { imagePayloadSchema } from "../schemas"
import { createMockDesktopClient } from "./desktop"

describe("createMockDesktopClient", () => {
  it("screenshot は 1x1 PNG の base64 を返す", async () => {
    const desktop = createMockDesktopClient()
    const result = await desktop.screenshot()
    expect(result.ok).toBe(true)
    expect(imagePayloadSchema.safeParse(result.data).success).toBe(true)
    expect(result.data?.imageBase64).toBe(MOCK_PNG_BASE64)
    expect(result.data?.imageBase64.startsWith("data:")).toBe(false)
  })

  it("openBrowser は URL を記録する", async () => {
    const desktop = createMockDesktopClient()
    await desktop.openBrowser({ url: "https://example.com" })
    expect(desktop.openedUrls).toEqual(["https://example.com"])
  })

  it("status は running を返す", async () => {
    const desktop = createMockDesktopClient()
    expect((await desktop.status()).data?.state).toBe("running")
  })
})
