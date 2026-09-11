import { getStackchan, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** スタックちゃんのカメラで 1 枚撮影する（camera.frame を待つ） */
export async function POST() {
  return runDeviceAction(async () => {
    const stackchan = await getStackchan()
    return stackchan.cameraCapture()
  })
}
