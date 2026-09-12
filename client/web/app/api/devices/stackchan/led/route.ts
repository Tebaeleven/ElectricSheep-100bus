import {
  ledSetRequestSchema,
  runDeviceActionWithBody,
  setLed,
} from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * スタックちゃんの LED を点灯・消灯する。
 * 機器本体の HTTP サーバー（既定 8765）の
 * `POST /obake/led_on` / `POST /obake/led_off` に対応する
 */
export async function POST(request: Request) {
  return runDeviceActionWithBody(request, ledSetRequestSchema, (input) =>
    setLed(input)
  )
}
