import { GHOST_AGENT_ID, mastra } from "@workspace/agent"
import { handleChatStream } from "@mastra/ai-sdk"
import { createUIMessageStreamResponse } from "ai"

// Mastra は Node ネイティブ依存を持つため Edge では動かない
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** クライアントに返すエラー文言を整形する（API キー未設定を判別できるようにする） */
function toClientMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  if (!process.env.ANTHROPIC_API_KEY) {
    return "API キー未設定: client/web/.env.local に ANTHROPIC_API_KEY を設定してください。"
  }
  if (/api[\s_-]?key|401|403|unauthorized/i.test(raw)) {
    return `API キーが拒否されました: ${raw}`
  }
  return `おばけとの通信に失敗しました: ${raw}`
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "API キー未設定: client/web/.env.local に ANTHROPIC_API_KEY を設定してください。",
      },
      { status: 500 }
    )
  }

  try {
    const params = await request.json()
    const stream = await handleChatStream({
      mastra,
      agentId: GHOST_AGENT_ID,
      version: "v7",
      params,
      onError: toClientMessage,
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    return Response.json({ error: toClientMessage(error) }, { status: 500 })
  }
}
