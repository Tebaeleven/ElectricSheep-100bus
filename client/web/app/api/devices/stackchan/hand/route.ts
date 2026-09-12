export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * 廃止。現行ハード（M5Stack CoreS3 / Obake_device）に手のサーボは無く、
 * 動かせるのは首の yaw / pitch だけなので `head.set` に置き換えた。
 */
export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "hand.set は廃止。POST /api/devices/stackchan/head を使う",
    },
    { status: 410 }
  )
}
