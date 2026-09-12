import { describe, expect, it } from "vitest"

import {
  buildSetHeadCommand,
  decodeFrame,
  encodeFrame,
  encodeHello,
  FRAME_TYPE_JPEG,
  parseHello,
  pcmBytesToMs,
} from "./protocol"

describe("フレーム", () => {
  it("encode したフレームを decode できる", () => {
    const payload = Buffer.from("hello")
    const frame = encodeFrame(FRAME_TYPE_JPEG, payload)
    expect(frame.length).toBe(5 + payload.length)
    expect(frame.readUInt8(0)).toBe(FRAME_TYPE_JPEG)
    expect(frame.readUInt32BE(1)).toBe(payload.length)

    const decoded = decodeFrame(frame)
    expect(decoded?.type).toBe(FRAME_TYPE_JPEG)
    expect(decoded?.payload.toString()).toBe("hello")
  })

  it("短すぎる・欠けたフレームは null", () => {
    expect(decodeFrame(Buffer.alloc(3))).toBeNull()
    const broken = encodeFrame(FRAME_TYPE_JPEG, Buffer.alloc(10)).subarray(0, 8)
    expect(decodeFrame(broken)).toBeNull()
  })
})

describe("hello", () => {
  it("pcm_rate を読む", () => {
    expect(parseHello(encodeHello(16000))).toEqual({
      type: "hello",
      pcmRate: 16000,
    })
  })

  it("hello 以外・壊れた JSON は null", () => {
    expect(parseHello('{"type":"bye"}')).toBeNull()
    expect(parseHello("not json")).toBeNull()
    expect(parseHello('{"type":"hello"}')).toBeNull()
  })
})

describe("buildSetHeadCommand", () => {
  it("ファームと同じ範囲に丸める", () => {
    expect(buildSetHeadCommand({ yaw: 999, pitch: 999, speed: 9999 })).toEqual({
      cmd: "set_head",
      yaw: 128,
      pitch: 90,
      speed: 1000,
    })
    expect(buildSetHeadCommand({ yaw: -999, pitch: -5 })).toEqual({
      cmd: "set_head",
      yaw: -128,
      pitch: 0,
      speed: 150,
    })
  })

  it("speed 未指定・0 以下は既定 150", () => {
    expect(buildSetHeadCommand({}).speed).toBe(150)
    expect(buildSetHeadCommand({ speed: 0 }).speed).toBe(150)
  })
})

describe("pcmBytesToMs", () => {
  it("16-bit モノラルとして時間に換算する", () => {
    expect(pcmBytesToMs(24000 * 2, 24000)).toBe(1000)
  })
})
