import { describe, expect, it } from "vitest"

import { RAIL_MAX_DURATION_MS } from "./constants"
import {
  imagePayloadSchema,
  openUrlSchema,
  railAxisSchema,
  railMoveSchema,
} from "./schemas"
import {
  createRequestId,
  imagePayloadFromWire,
  imagePayloadToWire,
  parseStackchanInbound,
  railMoveFromWire,
  railMoveToWire,
  requestIdSchema,
  stackchanOutboundSchema,
} from "./wire"

describe("railMoveSchema", () => {
  it("軸は x/y/z のみ許可する", () => {
    expect(railAxisSchema.safeParse("x").success).toBe(true)
    expect(railAxisSchema.safeParse("w").success).toBe(false)
  })

  it("方向は 1 / -1 のみ許可する", () => {
    const base = { axis: "x", durationMs: 100 } as const
    expect(railMoveSchema.safeParse({ ...base, direction: 1 }).success).toBe(
      true
    )
    expect(railMoveSchema.safeParse({ ...base, direction: -1 }).success).toBe(
      true
    )
    expect(railMoveSchema.safeParse({ ...base, direction: 0 }).success).toBe(
      false
    )
    expect(railMoveSchema.safeParse({ ...base, direction: 2 }).success).toBe(
      false
    )
  })

  it("駆動時間は 1 以上・上限以下の整数のみ許可する", () => {
    const base = { axis: "y", direction: 1 } as const
    expect(railMoveSchema.safeParse({ ...base, durationMs: 1 }).success).toBe(
      true
    )
    expect(
      railMoveSchema.safeParse({ ...base, durationMs: RAIL_MAX_DURATION_MS })
        .success
    ).toBe(true)
    expect(
      railMoveSchema.safeParse({
        ...base,
        durationMs: RAIL_MAX_DURATION_MS + 1,
      }).success
    ).toBe(false)
    expect(railMoveSchema.safeParse({ ...base, durationMs: 0 }).success).toBe(
      false
    )
    expect(railMoveSchema.safeParse({ ...base, durationMs: 1.5 }).success).toBe(
      false
    )
  })
})

describe("openUrlSchema", () => {
  it("http / https のみ許可する", () => {
    expect(openUrlSchema.safeParse({ url: "http://example.com" }).success).toBe(
      true
    )
    expect(
      openUrlSchema.safeParse({ url: "https://example.com/a?b=1" }).success
    ).toBe(true)
    expect(openUrlSchema.safeParse({ url: "ftp://example.com" }).success).toBe(
      false
    )
    expect(openUrlSchema.safeParse({ url: "file:///etc/passwd" }).success).toBe(
      false
    )
    expect(
      openUrlSchema.safeParse({ url: "javascript:alert(1)" }).success
    ).toBe(false)
    expect(openUrlSchema.safeParse({ url: "example.com" }).success).toBe(false)
  })
})

describe("ワイヤ形式の変換", () => {
  it("レール移動は durationMs ⇄ duration_ms を往復できる", () => {
    const move = { axis: "z", direction: -1, durationMs: 500 } as const
    const wire = railMoveToWire(move)
    expect(wire).toEqual({ axis: "z", direction: -1, duration_ms: 500 })
    expect(railMoveFromWire(wire)).toEqual(move)
  })

  it("画像は mimeType/imageBase64 ⇄ mime_type/image_base64 を往復できる", () => {
    const payload = { mimeType: "image/png", imageBase64: "AAA" }
    const wire = imagePayloadToWire(payload)
    expect(wire).toEqual({ mime_type: "image/png", image_base64: "AAA" })
    expect(imagePayloadSchema.parse(imagePayloadFromWire(wire))).toEqual(
      payload
    )
  })
})

describe("WebSocket 共通形式", () => {
  it("採番した request_id は req-<uuid> 形式になる", () => {
    const requestId = createRequestId()
    expect(requestIdSchema.safeParse(requestId).success).toBe(true)
    expect(requestIdSchema.safeParse("req-001").success).toBe(false)
  })

  it("outbound は type で判別できる", () => {
    const msg = {
      type: "hand.set",
      request_id: createRequestId(),
      data: { state: "closed" },
    }
    expect(stackchanOutboundSchema.safeParse(msg).success).toBe(true)
    expect(
      stackchanOutboundSchema.safeParse({ ...msg, data: { state: "half" } })
        .success
    ).toBe(false)
    expect(
      stackchanOutboundSchema.safeParse({
        type: "unknown.type",
        request_id: "req-1",
      }).success
    ).toBe(false)
  })

  it("inbound をパースできる。壊れた JSON は null", () => {
    const frame = parseStackchanInbound(
      JSON.stringify({
        type: "camera.frame",
        request_id: "req-001",
        data: { mime_type: "image/png", image_base64: "AAA" },
      })
    )
    expect(frame?.type).toBe("camera.frame")
    expect(parseStackchanInbound("{壊れた")).toBeNull()
    expect(parseStackchanInbound(JSON.stringify({ type: "nope" }))).toBeNull()
  })
})
