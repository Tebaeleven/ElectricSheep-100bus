import { getStackchan, runDeviceAction } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** 音声の受信を開始する。以後チャンクはサーバー側のリングバッファへ溜まる */
export async function POST() {
  return runDeviceAction(async () => {
    const stackchan = await getStackchan()
    return stackchan.audioStart()
  })
}
