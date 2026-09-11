import { createRobotClient } from "@workspace/robot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** ロボットの現在状態を取得する */
export async function GET() {
  const result = await createRobotClient(process.env).getStatus()
  return Response.json(result, { status: 200 })
}
