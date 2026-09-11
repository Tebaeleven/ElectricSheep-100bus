import { getDevices, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** レールの緊急停止 */
export async function POST() {
  return runDeviceAction(() => getDevices().rail.stop())
}
