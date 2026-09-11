import { railMoveSchema } from "@workspace/devices"

import { getDevices, runDeviceActionWithBody } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** ワイヤ形式の snake_case（duration_ms）でも受け付けて camelCase に寄せる */
function normalize(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body
  const record = body as Record<string, unknown>
  if (!("duration_ms" in record) || "durationMs" in record) return body
  const { duration_ms: durationMs, ...rest } = record
  return { ...rest, durationMs }
}

/** レールを 1 軸方向へ動かす。安全要件により失敗しても自動再送はしない */
export async function POST(request: Request) {
  return runDeviceActionWithBody(
    request,
    railMoveSchema,
    (input) => getDevices().rail.move(input),
    { normalize }
  )
}
