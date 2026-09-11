import { GHOST_AGENT_ID, mastra } from "@workspace/agent"
import { handleChatStream } from "@mastra/ai-sdk"
import { createUIMessageStreamResponse } from "ai"

// Mastra は Node ネイティブ依存を持つため Edge では動かない
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MISSING_KEY_MESSAGE =
  "API キー未設定: client/web/.env.local に GOOGLE_GENERATIVE_AI_API_KEY を設定してください（取得: https://aistudio.google.com/apikey ）。"

/** Gemini のキーが設定されているか（Mastra のモデルルーターは両方の名前を見る） */
function hasApiKey(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY
  )
}

/** クライアントに返すエラー文言を整形する（API キー未設定を判別できるようにする） */
function toClientMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  if (!hasApiKey()) {
    return MISSING_KEY_MESSAGE
  }
  // Google の代表的なエラー: API_KEY_INVALID / PERMISSION_DENIED / 401 / 403
  if (
    /api[\s_-]?key|api_key_invalid|permission[\s_]?denied|401|403|unauthorized/i.test(
      raw
    )
  ) {
    return `API キーが拒否されました: ${raw}`
  }
  return `おばけとの通信に失敗しました: ${raw}`
}

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: MISSING_KEY_MESSAGE }, { status: 500 })
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
