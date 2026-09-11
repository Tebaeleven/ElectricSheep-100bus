import { createRobotClient, robotCommandSchema } from "@workspace/robot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** ロボットへのコマンド送信。ブラウザから LAN を直接叩かせないためのサーバー側中継 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { ok: false, error: "JSON として解釈できませんでした" },
      { status: 400 }
    )
  }

  const parsed = robotCommandSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "コマンドの形式が不正です",
        issues: parsed.error.issues,
      },
      { status: 400 }
    )
  }

  const result = await createRobotClient(process.env).sendCommand(parsed.data)
  return Response.json(result, { status: 200 })
}
