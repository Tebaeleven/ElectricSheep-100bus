import { getDevices } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** スタックちゃんの接続状態と動作モード */
export async function GET() {
  const startedAt = Date.now()
  try {
    const { stackchan } = getDevices()
    const mode = process.env.DEVICE_MODE === "real" ? "real" : "mock"
    return Response.json(
      {
        ok: true,
        data: { connected: stackchan.connected, mode },
        latencyMs: Date.now() - startedAt,
      },
      { status: 200 }
    )
  } catch (cause) {
    return Response.json(
      {
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
        latencyMs: Date.now() - startedAt,
      },
      { status: 200 }
    )
  }
}
