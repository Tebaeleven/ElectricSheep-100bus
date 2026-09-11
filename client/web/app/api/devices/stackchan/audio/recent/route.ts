import {
  AUDIO_RECENT_DEFAULT_LIMIT,
  getRecentAudio,
  AUDIO_BUFFER_CAPACITY,
} from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** リングバッファに溜まった直近の音声チャンクを新しい順で返す */
export async function GET(request: Request) {
  const startedAt = Date.now()
  const raw = new URL(request.url).searchParams.get("limit")
  const parsed = Number(raw ?? AUDIO_RECENT_DEFAULT_LIMIT)
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), AUDIO_BUFFER_CAPACITY)
      : AUDIO_RECENT_DEFAULT_LIMIT

  try {
    const chunks = getRecentAudio(limit)
    return Response.json(
      { ok: true, data: { chunks }, latencyMs: Date.now() - startedAt },
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
