import { getStackchan, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** 音声の受信を停止する */
export async function POST() {
  return runDeviceAction(async () => {
    const stackchan = await getStackchan()
    return stackchan.audioStop()
  })
}
