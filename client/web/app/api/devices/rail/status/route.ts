import { getDevices, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** レールの現在状態 */
export async function GET() {
  return runDeviceAction(() => getDevices().rail.status())
}
