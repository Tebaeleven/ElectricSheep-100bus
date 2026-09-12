import { RAIL_MAX_DURATION_MS } from "@workspace/devices"
import { beforeAll, describe, expect, it } from "vitest"

import {
  cameraCapture,
  desktopOpenBrowser,
  desktopScreenshot,
  getDevices,
  headSet,
  railMove,
  railStop,
  toRailDirection,
} from "./devices"

// 実機に触らないことを明示する（createDevices の既定も mock）
beforeAll(() => {
  process.env.DEVICE_MODE = "mock"
})

/** tool の execute を型を絞らずに直接呼ぶ（createTool の execute は optional） */
async function run(
  tool: { execute?: unknown },
  input: unknown
): Promise<Record<string, unknown>> {
  const execute = tool.execute
  if (!execute) throw new Error("execute が未定義")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (execute as any)(input, {} as any)) as Record<string, unknown>
}

describe("railMove", () => {
  it("plus / minus が +1 / -1 に変換されてモックのレールに届く", async () => {
    const result = await run(railMove, {
      axis: "x",
      direction: "minus",
      durationMs: 500,
    })

    expect(result.ok).toBe(true)
    expect(typeof result.latencyMs).toBe("number")

    const rail = getDevices().rail as unknown as { moves: unknown[] }
    expect(rail.moves.at(-1)).toEqual({
      axis: "x",
      direction: -1,
      durationMs: 500,
    })
  })

  it("駆動時間の上限を超えたら失敗として返し、例外を投げない", async () => {
    const rail = getDevices().rail as unknown as { moves: unknown[] }
    const before = rail.moves.length

    // Mastra の createTool が inputSchema で先に弾くため
    // ok:false ではなく { error: true, message } が返る（どちらでも「失敗」扱い）
    const result = await run(railMove, {
      axis: "z",
      direction: "plus",
      durationMs: RAIL_MAX_DURATION_MS + 1,
    })

    expect(result.ok).not.toBe(true)
    expect(result.error ?? result.message).toBeTruthy()
    // 上限超過の命令は機器へ送らない
    expect(rail.moves.length).toBe(before)
  })

  it("toRailDirection が plus / minus を +1 / -1 に変換する", () => {
    expect(toRailDirection("plus")).toBe(1)
    expect(toRailDirection("minus")).toBe(-1)
  })
})

describe("railStop", () => {
  it("入力なしで呼べて ok が返る", async () => {
    const result = await run(railStop, {})

    expect(result.ok).toBe(true)
    expect(typeof result.latencyMs).toBe("number")
  })
})

describe("headSet", () => {
  // TODO(P5 統合): P5-A がモックに headSet を実装したら ok:true と
  // 送られた角度（yaw / pitch / speed）まで検証する
  it("可動範囲内の角度なら例外を投げずに結果を返す", async () => {
    const result = await run(headSet, { yaw: 30, pitch: -10, speed: 50 })

    expect(typeof result.latencyMs).toBe("number")
  })

  it("可動範囲外の角度は inputSchema で弾かれ、機器へ送らない", async () => {
    const result = await run(headSet, { yaw: 200, pitch: 0 })

    expect(result.ok).not.toBe(true)
    expect(result.error ?? result.message).toBeTruthy()
  })
})

describe("cameraCapture / desktopScreenshot", () => {
  it("cameraCapture は base64 を返さず mimeType と byteLength を返す", async () => {
    const result = await run(cameraCapture, {})

    expect(result.ok).toBe(true)
    expect(result.mimeType).toBe("image/png")
    expect(result.byteLength).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain("imageBase64")
  })

  it("desktopScreenshot も同じ形で返す", async () => {
    const result = await run(desktopScreenshot, {})

    expect(result.ok).toBe(true)
    expect(result.mimeType).toBe("image/png")
    expect(result.byteLength).toBeGreaterThan(0)
    expect(result).not.toHaveProperty("imageBase64")
  })
})

describe("desktopOpenBrowser", () => {
  it("https の URL はデスクトップに渡る", async () => {
    const result = await run(desktopOpenBrowser, {
      url: "https://example.com",
    })

    expect(result.ok).toBe(true)
    const desktop = getDevices().desktop as unknown as { openedUrls: string[] }
    expect(desktop.openedUrls.at(-1)).toBe("https://example.com")
  })

  it("ftp: の URL は ok:false で拒否し、機器には渡さない", async () => {
    const desktop = getDevices().desktop as unknown as { openedUrls: string[] }
    const before = desktop.openedUrls.length

    const result = await run(desktopOpenBrowser, {
      url: "ftp://example.com/file",
    })

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe("string")
    expect(desktop.openedUrls.length).toBe(before)
  })
})
