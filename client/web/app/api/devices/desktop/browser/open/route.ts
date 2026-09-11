import { openUrlSchema } from "@workspace/devices"

import { getDevices, runDeviceActionWithBody } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** デスクトップの既定ブラウザで URL を開く（http/https のみ） */
export async function POST(request: Request) {
  return runDeviceActionWithBody(request, openUrlSchema, (input) =>
    getDevices().desktop.openBrowser(input)
  )
}
