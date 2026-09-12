import {
  headSetRequestSchema,
  runDeviceActionWithBody,
  setHead,
} from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** スタックちゃんの首を指定角度へ向ける（B 方式: bridge 経由で `set_head` を送る） */
export async function POST(request: Request) {
  return runDeviceActionWithBody(request, headSetRequestSchema, (input) =>
    setHead(input)
  )
}
