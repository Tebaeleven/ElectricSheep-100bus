import { getDevices, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** デスクトップのスクリーンショット（base64 は Data URL 接頭辞なし） */
export async function POST() {
  return runDeviceAction(() => getDevices().desktop.screenshot())
}
